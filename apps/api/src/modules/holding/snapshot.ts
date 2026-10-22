import {
  HOLDING_ALERT_LABELS,
  computeTenantHealth,
  effectivePlatformAccess,
  formatBRL,
  tenantAlertKinds,
  type ClubChargeStatus,
  type ClubSubscriptionStatus,
  type HoldingAlert,
  type HoldingAlertKind,
  type HoldingAlertSeverity,
  type HoldingKpis,
  type HoldingMonthlyPoint,
  type HoldingTenantRow,
  type OnboardingStatus,
  type PlatformAccessLevel,
  type PlatformSubscriptionStatus,
  type TenantStatus,
} from '@annetec/contracts'
import { diffDays, monthOf, toDateSP } from '@/modules/club-billing/dates'
import { chargeAggregates, daysLateOf, subscriptionQuote } from '@/modules/platform-billing/presenter'
import {
  churnStats,
  delinquencyOf,
  growthPct,
  monthOfInstant,
  monthsUntil,
  rateOf,
  round1,
  round2,
  sortAlerts,
  type Lifespan,
} from './formulas'

/**
 * Montagem PURA da holding a partir de um retrato já carregado do banco
 * (`HoldingDataset`): linhas por inquilino (saúde + alertas), KPIs, séries
 * mensais e alertas de proposta. Tudo com as fórmulas da §0.5.
 */

const DAY_MS = 86_400_000
const ONBOARDING_SLA_MS = 48 * 3_600_000
const QUEUE: OnboardingStatus[] = ['submitted', 'in_review']

export interface HoldingTenantInfo {
  organizationId: string
  slug: string
  name: string
  status: TenantStatus
  planId: string | null
  createdAt: Date
}

export interface HoldingPlanInfo {
  id: string
  name: string
  memberLimit: number
  priceMonthly: number
}

export interface HoldingSubInfo {
  id: string
  organizationId: string
  proposalId: string | null
  status: PlatformSubscriptionStatus
  accessOverride: PlatformAccessLevel | null
  accessOverrideUntil: Date | null
  planName: string
  planPriceMonthly: string
  memberLimit: number
  pricePerExtraLife: string
  setupFee: string
  revenueSharePercent: string
  startedAt: Date | null
  canceledAt: Date | null
}

export interface HoldingPlatformCharge {
  id: string
  organizationId: string | null
  subscriptionId: string | null
  status: ClubChargeStatus
  amount: number
  paidAmount: number | null
  dueDate: string
  paidAt: Date | null
}

export interface HoldingClubSub extends Lifespan {
  organizationId: string
  status: ClubSubscriptionStatus
  amount: number
  dependents: number
}

/** Somas de `club_charges` por inquilino, já agregadas no SQL. */
export interface HoldingClubChargeAgg {
  overdueNow: number
  baseNow: number
  overduePrev: number
  basePrev: number
  gmvLast30: number
  gmvPrev30: number
}

export interface HoldingProposalInfo {
  id: string
  code: string
  status: OnboardingStatus
  name: string
  organizationId: string | null
  submittedAt: Date | null
  firstSubmittedAt: Date | null
  approvedAt: Date | null
  provisionedAt: Date | null
  provisioningError: string | null
  /** Desde quando está em `pending_info` (pedido de pendência). */
  pendingSince: Date | null
}

export interface HoldingDataset {
  now: Date
  today: string
  tenants: HoldingTenantInfo[]
  plans: Map<string, HoldingPlanInfo>
  subs: HoldingSubInfo[]
  platformCharges: HoldingPlatformCharge[]
  lives: Map<string, number>
  clubSubs: HoldingClubSub[]
  clubChargeAgg: Map<string, HoldingClubChargeAgg>
  /** GMV pago por inquilino e mês (`yyyy-MM`, SP), últimos 25 meses. */
  gmvByOrgMonth: Map<string, Map<string, number>>
  proposals: HoldingProposalInfo[]
}

const EMPTY_AGG: HoldingClubChargeAgg = { overdueNow: 0, baseNow: 0, overduePrev: 0, basePrev: 0, gmvLast30: 0, gmvPrev30: 0 }
const BILLABLE: PlatformSubscriptionStatus[] = ['active', 'past_due', 'restricted']

function inLast(instant: Date | null, now: Date, fromDays: number, toDays: number): boolean {
  if (!instant) return false
  const t = instant.getTime()
  return t > now.getTime() - fromDays * DAY_MS && t <= now.getTime() - toDays * DAY_MS
}

export interface TenantRowInternal {
  row: HoldingTenantRow
  alerts: { kind: HoldingAlertKind; severity: HoldingAlertSeverity }[]
  subscriptionId: string | null
  proposalId: string | null
}

/** Linha de cada inquilino operador (status ≠ cancelled). */
export function buildTenantRows(data: HoldingDataset): TenantRowInternal[] {
  const subsByOrg = new Map(data.subs.map(sub => [sub.organizationId, sub]))
  const clubByOrg = new Map<string, HoldingClubSub[]>()
  for (const sub of data.clubSubs) {
    const list = clubByOrg.get(sub.organizationId) ?? []
    list.push(sub)
    clubByOrg.set(sub.organizationId, list)
  }
  const chargesBySub = new Map<string, HoldingPlatformCharge[]>()
  for (const charge of data.platformCharges) {
    if (!charge.subscriptionId) continue
    const list = chargesBySub.get(charge.subscriptionId) ?? []
    list.push(charge)
    chargesBySub.set(charge.subscriptionId, list)
  }
  const proposalByOrg = new Map(data.proposals.filter(p => p.organizationId).map(p => [p.organizationId!, p.id]))

  return data.tenants
    .filter(tenant => tenant.status !== 'cancelled')
    .map(tenant => {
      const sub = subsByOrg.get(tenant.organizationId) ?? null
      const plan = tenant.planId ? (data.plans.get(tenant.planId) ?? null) : null
      const lives = data.lives.get(tenant.organizationId) ?? 0
      const memberLimit = sub ? sub.memberLimit : (plan?.memberLimit ?? null)
      const usagePct = memberLimit && memberLimit > 0 ? round1((lives / memberLimit) * 100) : null
      const access = sub ? effectivePlatformAccess(sub, data.now).level : 'full'
      const quote = sub ? subscriptionQuote(sub, lives) : null
      const platformMrr = sub && quote && BILLABLE.includes(sub.status) ? quote.monthlyTotal : 0
      const aggregates = chargeAggregates(sub ? (chargesBySub.get(sub.id) ?? []) : [], data.today)
      const club = clubByOrg.get(tenant.organizationId) ?? []
      const clubMrr = round2(club.filter(s => s.status === 'active' || s.status === 'past_due').reduce((acc, s) => acc + s.amount, 0))
      const agg = data.clubChargeAgg.get(tenant.organizationId) ?? EMPTY_AGG
      const newMembersLast30 = club.filter(s => inLast(s.startedAt, data.now, 30, 0)).length
      const memberDelinquencyRate = rateOf(agg.overdueNow, agg.baseNow)
      const memberDelinquencyRatePrev = rateOf(agg.overduePrev, agg.basePrev)
      const tenantAgeDays = Math.max(0, diffDays(data.today, toDateSP(tenant.createdAt)))
      const inputs = {
        managed: Boolean(sub),
        platformStatus: sub?.status ?? null,
        memberDelinquencyRate,
        memberDelinquencyRatePrev,
        gmvLast30: round2(agg.gmvLast30),
        gmvPrev30: round2(agg.gmvPrev30),
        usagePct,
        tenantAgeDays,
        newMembersLast30,
      }
      const health = computeTenantHealth(inputs)
      const alerts = tenantAlertKinds(inputs)
      return {
        row: {
          organizationId: tenant.organizationId,
          slug: tenant.slug,
          name: tenant.name,
          tenantStatus: tenant.status,
          managed: Boolean(sub),
          platformStatus: sub?.status ?? null,
          access,
          planName: sub?.planName ?? plan?.name ?? null,
          memberLimit,
          lives,
          usagePct,
          platformMrr,
          platformOpenAmount: aggregates.openAmount,
          platformDaysLate: daysLateOf(aggregates.oldestOverdueDueDate, data.today),
          clubMrr,
          gmvLast30: inputs.gmvLast30,
          gmvPrev30: inputs.gmvPrev30,
          salesTrendPct: growthPct(inputs.gmvLast30, inputs.gmvPrev30),
          newMembersLast30,
          memberDelinquencyRate,
          memberDelinquencyRatePrev,
          healthScore: health.score,
          healthBand: health.band,
          healthFactors: health.factors,
          alerts: alerts.map(alert => alert.kind),
          createdAt: tenant.createdAt.toISOString(),
        },
        alerts,
        subscriptionId: sub?.id ?? null,
        proposalId: sub?.proposalId ?? proposalByOrg.get(tenant.organizationId) ?? null,
      }
    })
}

function tenantAlertMessage(kind: HoldingAlertKind, row: HoldingTenantRow): { message: string; metric: number | null } {
  switch (kind) {
    case 'near_member_limit':
      return { message: `${row.lives} vidas de ${row.memberLimit} (${row.usagePct}% do limite) — oportunidade de upgrade`, metric: row.usagePct }
    case 'over_member_limit':
      return { message: `${row.lives} vidas para um limite de ${row.memberLimit} (${row.usagePct}%) — excedente sendo cobrado`, metric: row.usagePct }
    case 'platform_delinquency':
      return {
        message: `Assinatura ANNETEC ${row.platformStatus ?? ''}: ${formatBRL(row.platformOpenAmount)} em aberto, ${row.platformDaysLate} dia(s) de atraso`,
        metric: row.platformDaysLate,
      }
    case 'member_delinquency_rising':
      return {
        message: `Inadimplência dos associados em ${row.memberDelinquencyRate}% (há 30 dias: ${row.memberDelinquencyRatePrev}%)`,
        metric: row.memberDelinquencyRate,
      }
    case 'sales_drop': {
      const drop = row.gmvPrev30 > 0 ? round1(((row.gmvPrev30 - row.gmvLast30) / row.gmvPrev30) * 100) : null
      return { message: `Receita do clube caiu ${drop ?? 0}% em 30 dias (${formatBRL(row.gmvLast30)} vs ${formatBRL(row.gmvPrev30)})`, metric: drop }
    }
    case 'low_adoption':
      return { message: `Só ${row.usagePct}% do limite de vidas em uso após 60+ dias`, metric: row.usagePct }
    default:
      return { message: HOLDING_ALERT_LABELS[kind], metric: null }
  }
}

/** Alertas dos inquilinos + da fila de contratação, ordenados. */
export function buildAlerts(data: HoldingDataset, rows: TenantRowInternal[]): HoldingAlert[] {
  const detectedAt = data.now.toISOString()
  const alerts: HoldingAlert[] = []
  for (const { row, alerts: kinds } of rows) {
    for (const { kind, severity } of kinds) {
      const { message, metric } = tenantAlertMessage(kind, row)
      alerts.push({
        id: `${kind}:${row.organizationId}`,
        kind,
        severity,
        organizationId: row.organizationId,
        tenantName: row.name,
        tenantSlug: row.slug,
        proposalId: null,
        title: HOLDING_ALERT_LABELS[kind],
        message,
        metric,
        actionHref: `/admin/holding/${row.organizationId}`,
        detectedAt,
      })
    }
  }

  const now = data.now.getTime()
  const slugByOrg = new Map(data.tenants.map(t => [t.organizationId, t.slug]))
  for (const proposal of data.proposals) {
    const base = {
      organizationId: proposal.organizationId,
      tenantName: proposal.name,
      tenantSlug: proposal.organizationId ? (slugByOrg.get(proposal.organizationId) ?? null) : null,
      proposalId: proposal.id,
      actionHref: `/admin/compliance/${proposal.id}`,
      detectedAt,
    }
    if (QUEUE.includes(proposal.status) && proposal.submittedAt && proposal.submittedAt.getTime() < now - ONBOARDING_SLA_MS) {
      const hours = Math.floor((now - proposal.submittedAt.getTime()) / 3_600_000)
      alerts.push({
        ...base,
        id: `onboarding_pending:${proposal.id}`,
        kind: 'onboarding_pending',
        severity: 'warning',
        title: HOLDING_ALERT_LABELS.onboarding_pending,
        message: `Proposta ${proposal.code} aguarda análise há ${hours} h (SLA de 48 h estourado)`,
        metric: hours,
      })
    } else if (proposal.status === 'pending_info' && proposal.pendingSince && proposal.pendingSince.getTime() < now - 5 * DAY_MS) {
      const days = Math.floor((now - proposal.pendingSince.getTime()) / DAY_MS)
      alerts.push({
        ...base,
        id: `onboarding_pending:${proposal.id}`,
        kind: 'onboarding_pending',
        severity: 'info',
        title: HOLDING_ALERT_LABELS.onboarding_pending,
        message: `Proposta ${proposal.code} com pendência aberta há ${days} dia(s), sem resposta do candidato`,
        metric: days,
      })
    }
    if (
      (proposal.status === 'approved' || proposal.status === 'awaiting_payment') &&
      proposal.approvedAt &&
      proposal.approvedAt.getTime() < now - 5 * DAY_MS
    ) {
      const days = Math.floor((now - proposal.approvedAt.getTime()) / DAY_MS)
      alerts.push({
        ...base,
        id: `onboarding_awaiting_payment:${proposal.id}`,
        kind: 'onboarding_awaiting_payment',
        severity: 'info',
        title: HOLDING_ALERT_LABELS.onboarding_awaiting_payment,
        message: `Proposta ${proposal.code} aprovada há ${days} dia(s) sem pagamento da ativação`,
        metric: days,
      })
    }
    if (proposal.provisioningError && !['active', 'canceled', 'rejected'].includes(proposal.status)) {
      alerts.push({
        ...base,
        id: `provisioning_failed:${proposal.id}`,
        kind: 'provisioning_failed',
        severity: 'critical',
        title: HOLDING_ALERT_LABELS.provisioning_failed,
        message: `Provisionamento de ${proposal.code} falhou: ${proposal.provisioningError.slice(0, 160)}`,
        metric: null,
      })
    }
  }
  return sortAlerts(alerts)
}

function sumBy<T>(items: T[], pick: (item: T) => number): number {
  return round2(items.reduce((acc, item) => acc + pick(item), 0))
}

function gmvOfMonth(data: HoldingDataset, month: string, orgId?: string): number {
  if (orgId) return round2(data.gmvByOrgMonth.get(orgId)?.get(month) ?? 0)
  let total = 0
  for (const months of data.gmvByOrgMonth.values()) total += months.get(month) ?? 0
  return round2(total)
}

function subLifespans(data: HoldingDataset): Lifespan[] {
  return data.subs.map(sub => ({ startedAt: sub.startedAt, canceledAt: sub.canceledAt }))
}

export function buildKpis(data: HoldingDataset, rows: TenantRowInternal[]): HoldingKpis {
  const month = monthOf(data.today)
  const lastMonth = monthsUntil(data.today, 2)[0]!
  const subsByOrg = new Set(data.subs.map(sub => sub.organizationId))
  const operators = data.tenants.filter(t => t.status !== 'cancelled')

  const platformMrr = sumBy(
    data.subs.filter(sub => BILLABLE.includes(sub.status)),
    sub => subscriptionQuote(sub, data.lives.get(sub.organizationId) ?? 0).monthlyTotal,
  )
  const legacyMrrEstimate = sumBy(
    data.tenants.filter(t => t.status === 'active' && !subsByOrg.has(t.organizationId) && t.planId && data.plans.has(t.planId)),
    t => data.plans.get(t.planId!)!.priceMonthly,
  )
  const receivedIn = (m: string) =>
    sumBy(
      data.platformCharges.filter(c => c.status === 'paid' && monthOfInstant(c.paidAt) === m),
      c => c.paidAmount ?? c.amount,
    )
  const gmvThisMonth = gmvOfMonth(data, month)
  const gmvLastMonth = gmvOfMonth(data, lastMonth)
  const memberStats = churnStats(data.clubSubs, month)
  const tenantStats = churnStats(subLifespans(data), month)
  const byAccess = { full: 0, read_only: 0, blocked: 0 }
  for (const { row } of rows) byAccess[row.access] += 1

  const platformDelinquency = delinquencyOf(data.platformCharges, data.today)
  let memberOverdue = 0
  let memberBase = 0
  for (const agg of data.clubChargeAgg.values()) {
    memberOverdue += agg.overdueNow
    memberBase += agg.baseNow
  }

  const now = data.now.getTime()
  const queue = data.proposals.filter(p => QUEUE.includes(p.status))
  const recent = data.proposals.filter(p => p.firstSubmittedAt && p.firstSubmittedAt.getTime() >= now - 90 * DAY_MS)

  return {
    platformMrr,
    legacyMrrEstimate,
    platformReceivedThisMonth: receivedIn(month),
    platformReceivedLastMonth: receivedIn(lastMonth),
    gmvThisMonth,
    gmvLastMonth,
    gmvGrowthPct: growthPct(gmvThisMonth, gmvLastMonth),
    clubMrr: sumBy(
      data.clubSubs.filter(s => s.status === 'active' || s.status === 'past_due'),
      s => s.amount,
    ),
    totalLives: [...data.lives.values()].reduce((acc, n) => acc + n, 0),
    livesAddedThisMonth: data.clubSubs.filter(s => monthOfInstant(s.startedAt) === month).reduce((acc, s) => acc + 1 + s.dependents, 0),
    memberNetGrowthPct: memberStats.netGrowthPct,
    tenantsTotal: operators.length,
    tenantsManaged: data.subs.filter(sub => sub.status !== 'canceled').length,
    tenantsByAccess: byAccess,
    tenantsNewThisMonth: data.tenants.filter(t => monthOfInstant(t.createdAt) === month).length,
    tenantChurnRate: tenantStats.churnRate,
    memberChurnRate: memberStats.churnRate,
    platformDelinquencyRate: platformDelinquency.rate,
    memberDelinquencyRate: rateOf(memberOverdue, memberBase),
    platformOverdueAmount: platformDelinquency.overdueAmount,
    memberOverdueAmount: round2(memberOverdue),
    onboarding: {
      queue: queue.length,
      slaBreached: queue.filter(p => p.submittedAt && p.submittedAt.getTime() < now - ONBOARDING_SLA_MS).length,
      awaitingPayment: data.proposals.filter(p => p.status === 'approved' || p.status === 'awaiting_payment').length,
      activatedThisMonth: data.proposals.filter(p => monthOfInstant(p.provisionedAt) === month).length,
      conversionRate90d: recent.length > 0 ? round1((recent.filter(p => p.status === 'active').length / recent.length) * 100) : null,
    },
  }
}

export function buildMonthlySeries(data: HoldingDataset, months: number): HoldingMonthlyPoint[] {
  const subs = subLifespans(data)
  return monthsUntil(data.today, months).map(month => {
    const memberStats = churnStats(data.clubSubs, month)
    const tenantStats = churnStats(subs, month)
    return {
      month,
      platformBilled: sumBy(
        data.platformCharges.filter(c => c.status !== 'canceled' && monthOf(c.dueDate) === month),
        c => c.amount,
      ),
      platformReceived: sumBy(
        data.platformCharges.filter(c => c.status === 'paid' && monthOfInstant(c.paidAt) === month),
        c => c.paidAmount ?? c.amount,
      ),
      gmv: gmvOfMonth(data, month),
      newTenants: data.tenants.filter(t => monthOfInstant(t.createdAt) === month).length,
      churnedTenants: tenantStats.canceled,
      newMembers: memberStats.started,
      churnedMembers: memberStats.canceled,
      membersEnd: memberStats.aliveAtEnd,
      tenantChurnRate: tenantStats.churnRate,
      memberChurnRate: memberStats.churnRate,
    }
  })
}

export function buildTenantMonthly(data: HoldingDataset, orgId: string, months: number) {
  const club = data.clubSubs.filter(s => s.organizationId === orgId)
  const charges = data.platformCharges.filter(c => c.organizationId === orgId)
  return monthsUntil(data.today, months).map(month => {
    const stats = churnStats(club, month)
    return {
      month,
      gmv: gmvOfMonth(data, month, orgId),
      newMembers: stats.started,
      churnedMembers: stats.canceled,
      platformBilled: sumBy(
        charges.filter(c => c.status !== 'canceled' && monthOf(c.dueDate) === month),
        c => c.amount,
      ),
      platformReceived: sumBy(
        charges.filter(c => c.status === 'paid' && monthOfInstant(c.paidAt) === month),
        c => c.paidAmount ?? c.amount,
      ),
    }
  })
}
