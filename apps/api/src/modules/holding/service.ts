import {
  type AuditEntry,
  type HoldingAlert,
  type HoldingCohortLevel,
  type HoldingCohorts,
  type HoldingOverview,
  type HoldingTenantDetail,
  type HoldingTenantRow,
  type ListAuditQuery,
  type ListHoldingTenantsQuery,
  type PageMeta,
  type PlatformAccessLevel,
  type TenantLifecycleInput,
} from '@annetec/contracts'
import { and, count, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  auditLogs,
  organization,
  platformCharges,
  platformOnboardingProposals,
  platformSubscriptions,
  tenantAsaasAccounts,
  tenantPlans,
  tenantProfiles,
  user,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import { invalidatePlatformAccessCache } from '@/http/middleware/platform-access'
import { addDays, todaySP } from '@/modules/club-billing/dates'
import { platformInvoiceUrl } from '@/modules/platform-billing/access-key'
import { recordPlatformEvent } from '@/modules/platform-billing/events.service'
import { countLivesByOrg } from '@/modules/platform-billing/lives'
import { sendPlatformEmail } from '@/modules/platform-billing/notify'
import { OPEN_PLATFORM_CHARGE_STATUSES } from '@/modules/platform-billing/presenter'
import { findSubscriptionByOrg, tenantRefOf } from '@/modules/platform-billing/queries'
import { subscriptionDtoByOrg } from '@/modules/platform-billing/subscriptions.service'
import { holdingCacheKey, invalidateHoldingCache, withHoldingCache } from './cache'
import { cohortTable, monthStartSP, monthsUntil, type Lifespan } from './formulas'
import {
  buildAlerts,
  buildKpis,
  buildMonthlySeries,
  buildTenantMonthly,
  buildTenantRows,
  receivingInfoOf,
  type HoldingClubChargeAgg,
  type HoldingClubSub,
  type HoldingDataset,
  type HoldingProposalInfo,
  type TenantRowInternal,
} from './snapshot'

/**
 * Holding (blueprint da plataforma §0.5): tudo calculado na LEITURA a partir
 * de um retrato do banco (`HoldingDataset`) guardado 60 s em memória;
 * `?fresh=1` recarrega. Inquilinos sem assinatura de plataforma só são LIDOS.
 */

function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : ((result as { rows?: T[] }).rows ?? [])) as T[]
}

const n = (value: unknown) => Number(value ?? 0)
const asDate = (value: unknown): Date | null => (value ? (value instanceof Date ? value : new Date(String(value))) : null)

async function loadDataset(): Promise<HoldingDataset> {
  const now = new Date()
  const today = todaySP(now)
  // Instantes vão como texto ISO + cast: o driver (postgres-js, `prepare: false`)
  // não serializa `Date` em parâmetro de `sql` cru.
  const ts = (instant: Date) => sql`${instant.toISOString()}::timestamptz`
  const gmvFrom = ts(monthStartSP(monthsUntil(today, 25)[0]!))
  const cut = addDays(today, -30)
  const cutInstant = ts(new Date(`${cut}T00:00:00-03:00`))
  const nowTs = ts(now)
  const d30 = ts(new Date(now.getTime() - 30 * 86_400_000))
  const d60 = ts(new Date(now.getTime() - 60 * 86_400_000))

  const [tenants, plans, subs, charges, lives, clubSubRows, aggRows, gmvRows, proposals, receivingRows] = await Promise.all([
    db
      .select({
        organizationId: organization.id,
        slug: organization.slug,
        name: organization.name,
        status: tenantProfiles.status,
        planId: tenantProfiles.planId,
        createdAt: tenantProfiles.createdAt,
      })
      .from(tenantProfiles)
      .innerJoin(organization, eq(organization.id, tenantProfiles.organizationId))
      .where(eq(tenantProfiles.kind, 'operator')),
    db.select({ id: tenantPlans.id, name: tenantPlans.name, memberLimit: tenantPlans.memberLimit, priceMonthly: tenantPlans.priceMonthly }).from(tenantPlans),
    db.select().from(platformSubscriptions),
    db
      .select({
        id: platformCharges.id,
        organizationId: platformCharges.organizationId,
        subscriptionId: platformCharges.subscriptionId,
        status: platformCharges.status,
        amount: platformCharges.amount,
        paidAmount: platformCharges.paidAmount,
        dueDate: platformCharges.dueDate,
        paidAt: platformCharges.paidAt,
      })
      .from(platformCharges),
    countLivesByOrg(),
    db.execute(sql`
      select s.organization_id as org, s.status, s.amount, s.started_at, s.canceled_at, coalesce(d.cnt, 0)::int as dependents
      from club_subscriptions s
      left join (select subscription_id, count(*)::int as cnt from club_subscription_dependents group by subscription_id) d
        on d.subscription_id = s.id`),
    db.execute(sql`
      select organization_id as org,
        coalesce(sum(amount) filter (where status in ('overdue', 'failed') and due_date < ${today}::date), 0) as overdue_now,
        coalesce(sum(amount) filter (where status <> 'canceled' and due_date between ${addDays(today, -90)}::date and ${today}::date), 0) as base_now,
        coalesce(sum(amount) filter (where due_date < ${cut}::date and (status in ('overdue', 'failed') or (status = 'paid' and paid_at >= ${cutInstant}))), 0) as overdue_prev,
        coalesce(sum(amount) filter (where status <> 'canceled' and due_date between ${addDays(today, -120)}::date and ${cut}::date), 0) as base_prev,
        coalesce(sum(paid_amount) filter (where status = 'paid' and paid_at > ${d30} and paid_at <= ${nowTs}), 0) as gmv_last30,
        coalesce(sum(paid_amount) filter (where status = 'paid' and paid_at > ${d60} and paid_at <= ${d30}), 0) as gmv_prev30
      from club_charges
      group by organization_id`),
    db.execute(sql`
      select organization_id as org, to_char(paid_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as month, sum(paid_amount) as total
      from club_charges
      where status = 'paid' and paid_at >= ${gmvFrom}
      group by 1, 2`),
    db
      .select({
        id: platformOnboardingProposals.id,
        code: platformOnboardingProposals.code,
        status: platformOnboardingProposals.status,
        legalName: platformOnboardingProposals.legalName,
        tradeName: platformOnboardingProposals.tradeName,
        applicant: platformOnboardingProposals.applicant,
        organizationId: platformOnboardingProposals.organizationId,
        submittedAt: platformOnboardingProposals.submittedAt,
        firstSubmittedAt: platformOnboardingProposals.firstSubmittedAt,
        approvedAt: platformOnboardingProposals.approvedAt,
        provisionedAt: platformOnboardingProposals.provisionedAt,
        provisioningError: platformOnboardingProposals.provisioningError,
        pendingRequest: platformOnboardingProposals.pendingRequest,
        updatedAt: platformOnboardingProposals.updatedAt,
      })
      .from(platformOnboardingProposals),
    // Uma linha por clube (PK = organization_id); só colunas sem segredo (nunca a chave nem o token).
    db
      .select({
        organizationId: tenantAsaasAccounts.organizationId,
        env: tenantAsaasAccounts.env,
        webhookStatus: tenantAsaasAccounts.webhookStatus,
        accountStatusJson: tenantAsaasAccounts.accountStatusJson,
      })
      .from(tenantAsaasAccounts),
  ])

  const clubSubs: HoldingClubSub[] = rowsOf<Record<string, unknown>>(clubSubRows).map(row => ({
    organizationId: String(row.org),
    status: row.status as HoldingClubSub['status'],
    amount: n(row.amount),
    startedAt: asDate(row.started_at),
    canceledAt: asDate(row.canceled_at),
    dependents: n(row.dependents),
  }))
  const clubChargeAgg = new Map<string, HoldingClubChargeAgg>()
  for (const row of rowsOf<Record<string, unknown>>(aggRows)) {
    clubChargeAgg.set(String(row.org), {
      overdueNow: n(row.overdue_now),
      baseNow: n(row.base_now),
      overduePrev: n(row.overdue_prev),
      basePrev: n(row.base_prev),
      gmvLast30: n(row.gmv_last30),
      gmvPrev30: n(row.gmv_prev30),
    })
  }
  const gmvByOrgMonth = new Map<string, Map<string, number>>()
  for (const row of rowsOf<Record<string, unknown>>(gmvRows)) {
    const org = String(row.org)
    const months = gmvByOrgMonth.get(org) ?? new Map<string, number>()
    months.set(String(row.month), n(row.total))
    gmvByOrgMonth.set(org, months)
  }

  return {
    now,
    today,
    tenants: tenants.map(t => ({ ...t, status: t.status, createdAt: t.createdAt })),
    plans: new Map(plans.map(p => [p.id, { id: p.id, name: p.name, memberLimit: p.memberLimit, priceMonthly: Number(p.priceMonthly) }])),
    subs: subs.map(s => ({
      id: s.id,
      organizationId: s.organizationId,
      proposalId: s.proposalId,
      status: s.status,
      accessOverride: s.accessOverride ?? null,
      accessOverrideUntil: s.accessOverrideUntil ?? null,
      planName: s.planName,
      planPriceMonthly: s.planPriceMonthly,
      memberLimit: s.memberLimit,
      pricePerExtraLife: s.pricePerExtraLife,
      setupFee: s.setupFee,
      revenueSharePercent: s.revenueSharePercent,
      startedAt: s.startedAt,
      canceledAt: s.canceledAt,
    })),
    platformCharges: charges.map(c => ({
      ...c,
      amount: Number(c.amount),
      paidAmount: c.paidAmount === null ? null : Number(c.paidAmount),
    })),
    lives,
    clubSubs,
    clubChargeAgg,
    gmvByOrgMonth,
    receiving: new Map(receivingRows.map(row => [row.organizationId, receivingInfoOf(row)])),
    proposals: proposals.map(
      (p): HoldingProposalInfo => ({
        id: p.id,
        code: p.code,
        status: p.status,
        name: p.tradeName || p.legalName || p.applicant?.name || p.code,
        organizationId: p.organizationId,
        submittedAt: p.submittedAt,
        firstSubmittedAt: p.firstSubmittedAt,
        approvedAt: p.approvedAt,
        provisionedAt: p.provisionedAt,
        provisioningError: p.provisioningError,
        pendingSince:
          p.status === 'pending_info'
            ? (asDate(p.pendingRequest && !p.pendingRequest.resolvedAt ? p.pendingRequest.requestedAt : null) ?? p.updatedAt)
            : null,
      }),
    ),
  }
}

async function dataset(fresh: boolean): Promise<{ data: HoldingDataset; cached: boolean }> {
  const { value, cached } = await withHoldingCache(holdingCacheKey('dataset'), fresh, loadDataset)
  return { data: value, cached }
}

interface Derived {
  rows: TenantRowInternal[]
  alerts: HoldingAlert[]
}

const derivedCache = new WeakMap<HoldingDataset, Derived>()

function derive(data: HoldingDataset): Derived {
  const hit = derivedCache.get(data)
  if (hit) return hit
  const rows = buildTenantRows(data)
  const derived = { rows, alerts: buildAlerts(data, rows) }
  derivedCache.set(data, derived)
  return derived
}

export async function holdingOverview(months: number, fresh: boolean): Promise<HoldingOverview> {
  const { data, cached } = await dataset(fresh)
  const { rows, alerts } = derive(data)
  const distribution = { healthy: 0, attention: 0, risk: 0 }
  for (const { row } of rows) distribution[row.healthBand] += 1
  return {
    generatedAt: data.now.toISOString(),
    cached,
    kpis: buildKpis(data, rows),
    monthly: buildMonthlySeries(data, months),
    healthDistribution: distribution,
    topAlerts: alerts.slice(0, 10),
  }
}

export async function holdingTenants(
  query: ListHoldingTenantsQuery,
  fresh: boolean,
): Promise<{ items: HoldingTenantRow[]; meta: PageMeta }> {
  const { data } = await dataset(fresh)
  let items = derive(data).rows.map(r => r.row)
  if (query.band) items = items.filter(row => row.healthBand === query.band)
  if (query.access) items = items.filter(row => row.access === query.access)
  if (query.alert) items = items.filter(row => row.alerts.includes(query.alert!))
  if (query.managed) items = items.filter(row => row.managed === (query.managed === '1'))
  if (query.q) {
    const text = query.q.toLowerCase()
    items = items.filter(row => row.name.toLowerCase().includes(text) || row.slug.toLowerCase().includes(text))
  }
  const byName = (a: HoldingTenantRow, b: HoldingTenantRow) => a.name.localeCompare(b.name, 'pt-BR')
  const sorters: Record<NonNullable<ListHoldingTenantsQuery['sort']>, (a: HoldingTenantRow, b: HoldingTenantRow) => number> = {
    health: (a, b) => a.healthScore - b.healthScore || byName(a, b),
    lives: (a, b) => b.lives - a.lives || byName(a, b),
    gmv: (a, b) => b.gmvLast30 - a.gmvLast30 || byName(a, b),
    mrr: (a, b) => b.platformMrr - a.platformMrr || byName(a, b),
    name: byName,
  }
  items = [...items].sort(sorters[query.sort ?? 'health'])
  const total = items.length
  const start = (query.page - 1) * query.perPage
  return {
    items: await withSellers(items.slice(start, start + query.perPage)),
    meta: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) },
  }
}

export async function holdingAlerts(fresh: boolean): Promise<HoldingAlert[]> {
  const { data } = await dataset(fresh)
  return derive(data).alerts
}

export async function holdingTenantDetail(orgId: string, months: number, fresh: boolean): Promise<HoldingTenantDetail> {
  const { data } = await dataset(fresh)
  const { rows, alerts } = derive(data)
  const found = rows.find(r => r.row.organizationId === orgId)
  if (!found) throw AppError.notFound('Inquilino')
  const [subscription, audit] = await Promise.all([
    subscriptionDtoByOrg(orgId),
    listAudit({ page: 1, perPage: 20, organizationId: orgId }),
  ])
  return {
    tenant: found.row,
    monthly: buildTenantMonthly(data, orgId, months),
    alerts: alerts.filter(alert => alert.organizationId === orgId),
    subscription,
    proposalId: found.proposalId,
    recentAudit: audit.items,
  }
}

export async function holdingCohorts(level: HoldingCohortLevel, months: number, fresh: boolean): Promise<HoldingCohorts> {
  const { data } = await dataset(fresh)
  const items: Lifespan[] =
    level === 'inquilino'
      ? data.subs.map(sub => ({ startedAt: sub.startedAt, canceledAt: sub.canceledAt }))
      : data.clubSubs.map(sub => ({ startedAt: sub.startedAt, canceledAt: sub.canceledAt }))
  return { level, months, rows: cohortTable(items, data.today, months) }
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`)
}

export async function listAudit(
  query: Pick<ListAuditQuery, 'page' | 'perPage'> & Partial<Omit<ListAuditQuery, 'page' | 'perPage'>>,
): Promise<{ items: AuditEntry[]; meta: PageMeta }> {
  const filters: (SQL | undefined)[] = [
    query.organizationId ? eq(auditLogs.organizationId, query.organizationId) : undefined,
    query.resource ? eq(auditLogs.resource, query.resource) : undefined,
    query.action ? eq(auditLogs.action, query.action) : undefined,
    query.from ? gte(auditLogs.createdAt, new Date(`${query.from}T00:00:00-03:00`)) : undefined,
    query.to ? lt(auditLogs.createdAt, new Date(`${addDays(query.to, 1)}T00:00:00-03:00`)) : undefined,
    query.q ? or(ilike(auditLogs.action, `%${escapeLike(query.q)}%`), ilike(auditLogs.resource, `%${escapeLike(query.q)}%`)) : undefined,
  ]
  const where = and(...filters.filter((f): f is SQL => Boolean(f)))
  const [rows, [total]] = await Promise.all([
    db
      .select({ log: auditLogs, tenantName: organization.name, actorName: user.name })
      .from(auditLogs)
      .leftJoin(organization, eq(organization.id, auditLogs.organizationId))
      .leftJoin(user, eq(user.id, auditLogs.actorId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ value: count() }).from(auditLogs).where(where),
  ])
  const totalCount = Number(total?.value ?? 0)
  return {
    items: rows.map(({ log, tenantName, actorName }) => ({
      id: log.id,
      organizationId: log.organizationId,
      tenantName: tenantName ?? null,
      actorId: log.actorId,
      actorName: actorName ?? null,
      actorScope: log.actorScope ?? null,
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      metadata: log.metadata ?? null,
      ip: log.ip,
      createdAt: log.createdAt.toISOString(),
    })),
    meta: { page: query.page, perPage: query.perPage, total: totalCount, totalPages: Math.ceil(totalCount / query.perPage) },
  }
}

// ---------------------------------------------------------------------------
// Ciclo de vida (override manual de acesso)
// ---------------------------------------------------------------------------

const OVERRIDE_FOR: Record<TenantLifecycleInput['action'], PlatformAccessLevel | null> = {
  restrict: 'read_only',
  suspend: 'blocked',
  reactivate: 'full',
  clear_override: null,
}

/**
 * Grava (ou limpa) o override de acesso da assinatura de plataforma. Só para
 * inquilino GERENCIADO — os demais respondem 422 (nunca restringimos quem
 * está fora da cobrança automática). Devolve o que mudou para a auditoria.
 */
export async function applyTenantLifecycle(
  orgId: string,
  input: TenantLifecycleInput,
  actorUserId: string | null,
): Promise<{ previous: PlatformAccessLevel | null; level: PlatformAccessLevel | null; changed: boolean }> {
  const sub = await findSubscriptionByOrg(orgId)
  if (!sub) {
    throw AppError.businessRule('Inquilino fora da cobrança automática da ANNETEC: o ciclo de vida só vale para quem tem assinatura de plataforma')
  }
  const now = new Date()
  const level = OVERRIDE_FOR[input.action]
  const until = input.until ? new Date(input.until) : null
  if (until && until.getTime() <= now.getTime()) {
    throw AppError.validation([{ path: 'until', message: 'A data limite precisa estar no futuro' }])
  }
  const previous = sub.accessOverride ?? null
  if (input.action === 'clear_override' && !previous) return { previous, level: null, changed: false }

  await db
    .update(platformSubscriptions)
    .set(
      level
        ? {
            accessOverride: level,
            accessOverrideReason: input.reason,
            accessOverrideUntil: until,
            accessOverrideByUserId: actorUserId,
            accessOverrideAt: now,
            updatedAt: now,
          }
        : {
            accessOverride: null,
            accessOverrideReason: null,
            accessOverrideUntil: null,
            accessOverrideByUserId: null,
            accessOverrideAt: null,
            updatedAt: now,
          },
    )
    .where(eq(platformSubscriptions.id, sub.id))

  const labels: Record<TenantLifecycleInput['action'], string> = {
    restrict: 'Painel restrito (somente leitura) pela holding',
    suspend: 'Painel suspenso pela holding',
    reactivate: 'Acesso completo liberado pela holding',
    clear_override: 'Alteração manual removida — vale a régua automática',
  }
  const untilText = until ? ` até ${until.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''
  await recordPlatformEvent(db, {
    organizationId: orgId,
    subscriptionId: sub.id,
    type: level ? 'ACCESS_OVERRIDE_SET' : 'ACCESS_OVERRIDE_CLEARED',
    source: 'manual',
    message: `${labels[input.action]}${level ? untilText : ''}: ${input.reason}`,
    payload: { action: input.action, level, until: until?.toISOString() ?? null, previous },
    actorUserId,
  })

  invalidatePlatformAccessCache(orgId)
  invalidateHoldingCache()

  const template =
    input.action === 'restrict'
      ? 'platform_access_restricted'
      : input.action === 'suspend'
        ? 'platform_access_suspended'
        : input.action === 'reactivate'
          ? 'platform_access_reactivated'
          : null
  if (template) {
    const tenant = await tenantRefOf(orgId)
    const [oldest] = await db
      .select({ id: platformCharges.id })
      .from(platformCharges)
      .where(and(eq(platformCharges.subscriptionId, sub.id), inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES)))
      .orderBy(platformCharges.dueDate)
      .limit(1)
    await sendPlatformEmail({
      template,
      to: { email: sub.billingEmail, name: sub.billingName },
      data: {
        tenantName: tenant?.name ?? sub.billingName,
        reason: input.reason,
        until: until?.toISOString() ?? null,
        payUrl: oldest ? platformInvoiceUrl(oldest.id) : '',
      },
      organizationId: orgId,
      relatedType: 'platform_subscription',
      relatedId: sub.id,
    })
  }
  return { previous, level, changed: true }
}

/** Vendedor ANNETEC atribuído (proposta de origem do clube), só na página pedida — fora do cache. */
async function withSellers(rows: HoldingTenantRow[]): Promise<HoldingTenantRow[]> {
  const ids = rows.map(row => row.organizationId)
  if (ids.length === 0) return rows
  try {
    const found = await db
      .select({ organizationId: platformOnboardingProposals.organizationId, userId: user.id, name: user.name })
      .from(platformOnboardingProposals)
      .innerJoin(user, eq(user.id, platformOnboardingProposals.sellerUserId))
      .where(and(inArray(platformOnboardingProposals.organizationId, ids), eq(platformOnboardingProposals.status, 'active')))
    const byOrg = new Map(found.map(row => [row.organizationId, { userId: row.userId, name: row.name }]))
    return rows.map(row => ({ ...row, seller: byOrg.get(row.organizationId) ?? null }))
  } catch {
    return rows
  }
}
