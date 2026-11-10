import {
  DEFAULT_SALES_COMMISSION_SETTINGS,
  roundCents,
  type ListSalesCommissionsQuery,
  type MarkSalesCommissionsPaidInput,
  type SalesCommissionEntry,
  type SalesCommissionList,
  type SalesCommissionSettings,
  type SalesCommissionStatus,
  type SalesCommissionTotals,
  type UpdateSalesCommissionSettingsInput,
} from '@annetec/contracts'
import { and, count, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  organization,
  platformOnboardingProposals,
  platformSalesCommissions,
  platformSalesSettings,
  user,
  type PlatformSalesCommissionRow,
} from '@/db/schema'
import { AppError } from '@/http/errors'

/**
 * Regra legada de comissão dos vendedores ANNETEC (`platform_sales_settings`) e
 * leitura/repasse do histórico em `platform_sales_commissions`.
 *
 * A GERAÇÃO e o ESTORNO de comissões passaram para a Rede Comercial
 * (`vendas-rede/comissoes.service`, tabela `vendas_comissoes`); aqui só ficam
 * as telas antigas de leitura até a migração das telas.
 */

// ---------------------------------------------------------------------------
// Regra (linha única)
// ---------------------------------------------------------------------------

export async function loadCommissionSettings(executor: Pick<typeof db, 'select'> = db): Promise<SalesCommissionSettings> {
  const [row] = await executor.select().from(platformSalesSettings).where(eq(platformSalesSettings.id, 'default')).limit(1)
  if (!row) {
    return {
      monthlySchedule: [...DEFAULT_SALES_COMMISSION_SETTINGS.monthlySchedule],
      setupFeePercent: DEFAULT_SALES_COMMISSION_SETTINGS.setupFeePercent,
      updatedAt: null,
      updatedByName: null,
    }
  }
  return {
    monthlySchedule: (row.monthlySchedule ?? []).map(Number),
    setupFeePercent: Number(row.setupFeePercent),
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedByName ?? null,
  }
}

export async function updateCommissionSettings(
  input: UpdateSalesCommissionSettingsInput,
  actor: { userId: string; name: string },
): Promise<{ before: SalesCommissionSettings; after: SalesCommissionSettings }> {
  const before = await loadCommissionSettings()
  const values = {
    monthlySchedule: input.monthlySchedule ?? before.monthlySchedule,
    setupFeePercent: String(input.setupFeePercent ?? before.setupFeePercent),
    updatedByUserId: actor.userId,
    updatedByName: actor.name,
    updatedAt: new Date(),
  }
  await db
    .insert(platformSalesSettings)
    .values({ id: 'default', ...values })
    .onConflictDoUpdate({ target: platformSalesSettings.id, set: values })
  return { before, after: await loadCommissionSettings() }
}

// ---------------------------------------------------------------------------
// Leitura e repasse
// ---------------------------------------------------------------------------

const ZERO_TOTALS: SalesCommissionTotals = { prevista: 0, a_pagar: 0, paga: 0, cancelada: 0, a_descontar: 0, net: 0 }

export function totalsFrom(rows: { status: SalesCommissionStatus; total: number | string | null }[]): SalesCommissionTotals {
  const totals = { ...ZERO_TOTALS }
  for (const row of rows) totals[row.status] = roundCents(totals[row.status] + Number(row.total ?? 0))
  totals.net = roundCents(totals.a_pagar + totals.paga - totals.a_descontar)
  return totals
}

function filtersOf(query: Pick<ListSalesCommissionsQuery, 'status' | 'mes' | 'sellerUserId'>): SQL[] {
  const filters: SQL[] = []
  if (query.status) filters.push(eq(platformSalesCommissions.status, query.status))
  if (query.mes) filters.push(eq(platformSalesCommissions.referenceMonth, query.mes))
  if (query.sellerUserId) filters.push(eq(platformSalesCommissions.sellerUserId, query.sellerUserId))
  return filters
}

export async function commissionTotals(
  query: Pick<ListSalesCommissionsQuery, 'status' | 'mes' | 'sellerUserId'>,
): Promise<SalesCommissionTotals> {
  const filters = filtersOf(query)
  const rows = await db
    .select({ status: platformSalesCommissions.status, total: sql<string>`coalesce(sum(${platformSalesCommissions.amount}), 0)::text` })
    .from(platformSalesCommissions)
    .where(filters.length ? and(...filters) : undefined)
    .groupBy(platformSalesCommissions.status)
  return totalsFrom(rows)
}

type CommissionJoinRow = {
  commission: PlatformSalesCommissionRow
  sellerName: string | null
  proposalCode: string | null
  legalName: string | null
  tradeName: string | null
  applicantName: string | null
  orgName: string | null
}

function toEntry(row: CommissionJoinRow): SalesCommissionEntry {
  const c = row.commission
  return {
    id: c.id,
    sellerUserId: c.sellerUserId,
    sellerName: row.sellerName,
    proposalId: c.proposalId,
    proposalCode: row.proposalCode,
    organizationId: c.organizationId,
    customerName: row.orgName ?? row.tradeName ?? row.legalName ?? row.applicantName ?? 'Cliente',
    chargeId: c.chargeId,
    chargeKind: c.chargeKind,
    kind: c.kind,
    installment: c.installment,
    baseAmount: Number(c.baseAmount),
    percent: Number(c.percent),
    amount: Number(c.amount),
    status: c.status,
    referenceMonth: c.referenceMonth,
    chargePaidAt: c.chargePaidAt?.toISOString() ?? null,
    payoutDate: c.payoutDate,
    payoutNote: c.payoutNote,
    paidOutByName: c.paidOutByName,
    canceledAt: c.canceledAt?.toISOString() ?? null,
    cancelReason: c.cancelReason,
    createdAt: c.createdAt.toISOString(),
  }
}

function selectEntries(where: SQL | undefined) {
  return db
    .select({
      commission: platformSalesCommissions,
      sellerName: user.name,
      proposalCode: platformOnboardingProposals.code,
      legalName: platformOnboardingProposals.legalName,
      tradeName: platformOnboardingProposals.tradeName,
      applicantName: sql<string | null>`${platformOnboardingProposals.applicant}->>'name'`,
      orgName: organization.name,
    })
    .from(platformSalesCommissions)
    .leftJoin(user, eq(user.id, platformSalesCommissions.sellerUserId))
    .leftJoin(platformOnboardingProposals, eq(platformOnboardingProposals.id, platformSalesCommissions.proposalId))
    .leftJoin(organization, eq(organization.id, platformSalesCommissions.organizationId))
    .where(where)
    .orderBy(desc(platformSalesCommissions.createdAt))
}

/** Lista + totais do filtro. `sellerUserId` vem da SESSÃO na visão do vendedor. */
export async function listCommissions(query: ListSalesCommissionsQuery): Promise<SalesCommissionList> {
  const filters = filtersOf(query)
  const where = filters.length ? and(...filters) : undefined
  const [rows, [total], totals] = await Promise.all([
    selectEntries(where)
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ value: count() }).from(platformSalesCommissions).where(where),
    commissionTotals(query),
  ])
  return { items: rows.map(toEntry), totals, total: total?.value ?? 0, page: query.page, perPage: query.perPage }
}

export async function commissionEntriesByIds(ids: string[]): Promise<SalesCommissionEntry[]> {
  if (ids.length === 0) return []
  return (await selectEntries(inArray(platformSalesCommissions.id, ids))).map(toEntry)
}

/** `a_pagar` → `paga` (superadmin). Ids em outro status são ignorados e voltam em `skipped`. */
export async function markCommissionsPaid(
  input: MarkSalesCommissionsPaidInput,
  actor: { userId: string; name: string },
): Promise<{ paid: SalesCommissionEntry[]; skipped: string[] }> {
  const now = new Date()
  const updated = await db
    .update(platformSalesCommissions)
    .set({
      status: 'paga',
      payoutDate: input.payoutDate,
      payoutNote: input.note ?? null,
      paidOutByUserId: actor.userId,
      paidOutByName: actor.name,
      updatedAt: now,
    })
    .where(and(inArray(platformSalesCommissions.id, input.ids), eq(platformSalesCommissions.status, 'a_pagar')))
    .returning({ id: platformSalesCommissions.id })
  const paidIds = new Set(updated.map(row => row.id))
  if (paidIds.size === 0 && input.ids.length > 0) {
    throw AppError.businessRule('Nenhuma das comissões está "a pagar" (já pagas, canceladas ou inexistentes).')
  }
  return { paid: await commissionEntriesByIds([...paidIds]), skipped: input.ids.filter(id => !paidIds.has(id)) }
}
