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
import { and, count, desc, eq, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  auditLogs,
  organization,
  platformCharges,
  platformOnboardingProposals,
  platformSalesCommissions,
  platformSalesSettings,
  user,
  type PlatformSalesCommissionRow,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import { logger } from '@/lib/logger'
import { toDateSP } from '@/modules/club-billing/dates'
import { buildCommissionDrafts, reversedCommissionStatus, type CommissionSettingsShape } from './rules'

/**
 * Comissões automáticas dos vendedores ANNETEC.
 *
 *  - geração: dentro da MESMA transação que marca a fatura da plataforma como
 *    paga (`events.service` → `applyPaid`), num savepoint — falha aqui nunca
 *    desfaz o pagamento. Idempotente pelo índice único (fatura, parte);
 *  - estorno/chargeback: não repassada → `cancelada`; repassada → `a_descontar`;
 *  - percentual e base ficam gravados: a regra vigente NO pagamento.
 *
 * Toda criação/mudança grava `audit_logs` (ator `null` = sistema).
 */

/** `db`, transação ou savepoint (o handler de eventos passa a própria `tx`). */
type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

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
// Geração (fatura paga) e estorno
// ---------------------------------------------------------------------------

export interface PaidChargeForCommission {
  id: string
  kind: 'activation' | 'monthly' | 'adjustment'
  proposalId: string | null
  organizationId: string | null
  subscriptionId: string | null
  amount: string
  paidAmount: string | null
  paidAt: Date | null
  items: { kind: string; amount: number; appliesTo?: 'setup_fee' | 'plan_fee' }[] | null
}

/**
 * Nº desta mensalidade paga do clube: a ativação é a 1ª; numa mensal, conta as
 * faturas com mensalidade (ativação + mensais) da MESMA proposta já pagas
 * antes desta (pagamento > 0; estornada não conta).
 */
export async function installmentOf(executor: Pick<typeof db, 'select'>, charge: PaidChargeForCommission): Promise<number> {
  if (charge.kind === 'activation' || !charge.proposalId) return 1
  const paidAt = charge.paidAt ?? new Date()
  const [row] = await executor
    .select({ value: count() })
    .from(platformCharges)
    .where(
      and(
        eq(platformCharges.proposalId, charge.proposalId),
        inArray(platformCharges.kind, ['activation', 'monthly']),
        eq(platformCharges.status, 'paid'),
        ne(platformCharges.id, charge.id),
        sql`coalesce(${platformCharges.paidAmount}, 0) > 0`,
        or(lt(platformCharges.paidAt, paidAt), and(eq(platformCharges.paidAt, paidAt), lt(platformCharges.id, charge.id))),
      ),
    )
  return Number(row?.value ?? 0) + 1
}

/**
 * Fatura que ACABOU de virar `paid`. Sem vendedor atribuído (na proposta de
 * origem) ou fatura avulsa: nada. Devolve quantos lançamentos entraram.
 */
export async function recordCommissionsForPaidCharge(
  executor: Executor,
  charge: PaidChargeForCommission,
  now = new Date(),
  settingsOverride?: CommissionSettingsShape,
): Promise<number> {
  if (charge.kind === 'adjustment' || !charge.proposalId) return 0
  // FOR UPDATE: serializa as faturas da MESMA proposta pagas ao mesmo tempo
  // (webhook + sincronização, ou duas faturas quitadas juntas). Sem a trava,
  // as duas transações contariam as mesmas "pagas antes" e gravariam o mesmo
  // nº de mensalidade (dois lançamentos com o % maior da escala).
  const [proposal] = await executor
    .select({ sellerUserId: platformOnboardingProposals.sellerUserId, code: platformOnboardingProposals.code })
    .from(platformOnboardingProposals)
    .where(eq(platformOnboardingProposals.id, charge.proposalId))
    .limit(1)
    .for('update')
  const sellerUserId = proposal?.sellerUserId
  if (!sellerUserId) return 0

  const settings = settingsOverride ?? (await loadCommissionSettings(executor))
  const installment = await installmentOf(executor, charge)
  const drafts = buildCommissionDrafts(
    {
      kind: charge.kind,
      amount: Number(charge.amount),
      paidAmount: charge.paidAmount === null ? null : Number(charge.paidAmount),
      items: (charge.items ?? []).map(item => ({ kind: item.kind as never, amount: Number(item.amount), appliesTo: item.appliesTo })),
    },
    installment,
    settings,
  )
  if (drafts.length === 0) return 0

  const paidAt = charge.paidAt ?? now
  const referenceMonth = toDateSP(paidAt).slice(0, 7)
  const inserted = await executor
    .insert(platformSalesCommissions)
    .values(
      drafts.map(draft => ({
        sellerUserId,
        proposalId: charge.proposalId,
        organizationId: charge.organizationId,
        chargeId: charge.id,
        chargeKind: charge.kind,
        kind: draft.kind,
        installment: draft.installment,
        baseAmount: String(draft.baseAmount),
        percent: String(draft.percent),
        amount: String(draft.amount),
        status: 'a_pagar' as const,
        referenceMonth,
        chargePaidAt: paidAt,
      })),
    )
    .onConflictDoNothing({ target: [platformSalesCommissions.chargeId, platformSalesCommissions.kind] })
    .returning()
  if (inserted.length > 0) {
    await executor.insert(auditLogs).values(
      inserted.map(row => ({
        organizationId: charge.organizationId,
        actorId: null,
        actorScope: null,
        action: 'sales_commission.created',
        resource: 'sales_commission',
        resourceId: row.id,
        metadata: {
          sellerUserId,
          chargeId: charge.id,
          proposalCode: proposal?.code ?? null,
          parte: row.kind,
          mensalidade: row.installment,
          base: Number(row.baseAmount),
          percentual: Number(row.percent),
          valor: Number(row.amount),
        },
      })),
    )
  }
  return inserted.length
}

/** Fatura estornada (ou com chargeback): comissões dela mudam de status. Devolve quantas. */
export async function reverseCommissionsForCharge(
  executor: Executor,
  chargeId: string,
  reason: string,
  now = new Date(),
): Promise<number> {
  const rows = await executor.select().from(platformSalesCommissions).where(eq(platformSalesCommissions.chargeId, chargeId))
  let changed = 0
  for (const row of rows) {
    const next = reversedCommissionStatus(row.status)
    if (!next) continue
    const [updated] = await executor
      .update(platformSalesCommissions)
      .set({ status: next, canceledAt: now, cancelReason: reason.slice(0, 500), updatedAt: now })
      .where(and(eq(platformSalesCommissions.id, row.id), eq(platformSalesCommissions.status, row.status)))
      .returning({ id: platformSalesCommissions.id })
    if (!updated) continue
    changed += 1
    await executor.insert(auditLogs).values({
      organizationId: row.organizationId,
      actorId: null,
      actorScope: null,
      action: next === 'cancelada' ? 'sales_commission.canceled' : 'sales_commission.clawback',
      resource: 'sales_commission',
      resourceId: row.id,
      metadata: { chargeId, antes: row.status, depois: next, motivo: reason, valor: Number(row.amount) },
    })
  }
  return changed
}

/**
 * Embrulho usado pelo handler de eventos da cobrança: savepoint próprio e
 * erro só no log — a comissão nunca desfaz pagamento/estorno.
 */
export async function safely(executor: Executor, label: string, work: (tx: Executor) => Promise<unknown>): Promise<void> {
  try {
    const runner = executor as Partial<Pick<typeof db, 'transaction'>>
    if (typeof runner.transaction === 'function') {
      await runner.transaction(async sp => {
        await work(sp)
      })
    } else {
      await work(executor)
    }
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : String(error), label }, 'Falha nas comissões de vendas (o pagamento segue)')
  }
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
