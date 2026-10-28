import {
  ERROR_CODES,
  onlyDigits,
  type ClubSubscription,
  type ClubSubscriptionDetail,
  type ListClubSubscriptionsQuery,
  type PaymentEventSource,
} from '@annetec/contracts'
import { and, count, desc, eq, gt, ilike, inArray, like, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubCharges, clubSubscriptionDependents, clubSubscriptions, paymentEvents } from '@/db/schema'
import { AppError } from '@/http/errors'
import { paginate } from '@/http/respond'
import { resolveReadyGatewayProvider } from '@/integrations/payments/provider'
import { logger } from '@/lib/logger'
import { cancelAtGateway, submitChargeToGateway } from './charges.service'
import { addMonthsOnDueDay, dueDayOf, monthLabel, todaySP } from './dates'
import { recordPaymentEvent } from './events.service'
import {
  OPEN_CHARGE_STATUSES,
  toClubCharge,
  toClubSubscription,
  toPaymentEvent,
  type SubscriptionRow,
} from './presenter'

/** Motivos de cancelamento automáticos (texto livre para os do admin). */
export const CANCEL_REASON_LABELS: Record<string, string> = {
  checkout_nao_pago: 'checkout não pago',
  substituida_por_novo_checkout: 'substituída por um novo checkout',
  inadimplencia: 'inadimplência',
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`)
}

/** Linhas → DTOs com dependentes e agregados de cobranças abertas (2 consultas para a página toda). */
export async function buildSubscriptionDtos(rows: SubscriptionRow[], today = todaySP()): Promise<ClubSubscription[]> {
  if (rows.length === 0) return []
  const ids = rows.map(row => row.id)
  const [dependents, aggregates] = await Promise.all([
    db.select().from(clubSubscriptionDependents).where(inArray(clubSubscriptionDependents.subscriptionId, ids)),
    db
      .select({
        subscriptionId: clubCharges.subscriptionId,
        openAmount: sql<string>`coalesce(sum(${clubCharges.amount}) filter (where ${clubCharges.status} in ('pending', 'overdue', 'failed')), 0)`,
        overdueCount: sql<number>`(count(*) filter (where ${clubCharges.status} = 'overdue' or (${clubCharges.status} in ('pending', 'failed') and ${clubCharges.dueDate} < ${today})))::int`,
      })
      .from(clubCharges)
      .where(inArray(clubCharges.subscriptionId, ids))
      .groupBy(clubCharges.subscriptionId),
  ])
  return rows.map(row => {
    const aggregate = aggregates.find(item => item.subscriptionId === row.id)
    return toClubSubscription(
      row,
      dependents.filter(dependent => dependent.subscriptionId === row.id),
      { openAmount: Number(aggregate?.openAmount ?? 0), overdueCount: Number(aggregate?.overdueCount ?? 0) },
    )
  })
}

export async function findSubscriptionOfTenant(orgId: string, id: string): Promise<SubscriptionRow> {
  const [row] = await db
    .select()
    .from(clubSubscriptions)
    .where(and(eq(clubSubscriptions.id, id), eq(clubSubscriptions.organizationId, orgId)))
    .limit(1)
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Assinatura não encontrada')
  return row
}

/**
 * Encerra a assinatura e cancela as cobranças abertas (gateway best-effort).
 * Idempotente: já cancelada → `false`.
 */
export async function cancelSubscription(
  sub: Pick<SubscriptionRow, 'id' | 'organizationId' | 'gatewayProvider'>,
  reason: string,
  ctx: { source: PaymentEventSource; actorUserId?: string | null; now?: Date },
): Promise<boolean> {
  const now = ctx.now ?? new Date()
  const [canceled] = await db
    .update(clubSubscriptions)
    .set({ status: 'canceled', canceledAt: now, cancelReason: reason.slice(0, 500), updatedAt: now })
    .where(and(eq(clubSubscriptions.id, sub.id), ne(clubSubscriptions.status, 'canceled')))
    .returning({ id: clubSubscriptions.id })
  if (!canceled) return false

  const open = await db
    .select()
    .from(clubCharges)
    .where(and(eq(clubCharges.subscriptionId, sub.id), inArray(clubCharges.status, OPEN_CHARGE_STATUSES)))
  for (const charge of open) {
    await cancelAtGateway(charge)
    await db
      .update(clubCharges)
      .set({ status: 'canceled', canceledAt: now, updatedAt: now })
      .where(and(eq(clubCharges.id, charge.id), inArray(clubCharges.status, OPEN_CHARGE_STATUSES)))
  }

  await recordPaymentEvent(db, {
    organizationId: sub.organizationId,
    subscriptionId: sub.id,
    type: 'SUBSCRIPTION_CANCELED',
    source: ctx.source,
    gatewayProvider: sub.gatewayProvider,
    message: `Assinatura cancelada: ${CANCEL_REASON_LABELS[reason] ?? reason}${open.length > 0 ? ` (${open.length} cobrança(s) em aberto cancelada(s))` : ''}`,
    actorUserId: ctx.actorUserId ?? null,
  })
  return true
}

export const subscriptionsService = {
  async list(orgId: string, query: ListClubSubscriptionsQuery) {
    const conditions: SQL[] = [eq(clubSubscriptions.organizationId, orgId)]
    if (query.status) conditions.push(eq(clubSubscriptions.status, query.status))
    if (query.planId) conditions.push(eq(clubSubscriptions.clubPlanId, query.planId))
    if (query.method) conditions.push(eq(clubSubscriptions.paymentMethod, query.method))
    if (query.q) {
      const term = `%${escapeLike(query.q)}%`
      const digits = onlyDigits(query.q)
      const matches: SQL[] = [
        ilike(clubSubscriptions.holderName, term),
        ilike(clubSubscriptions.holderEmail, term),
        ilike(clubSubscriptions.cardNumber, term),
        sql`exists (select 1 from ${clubSubscriptionDependents} d where d.subscription_id = ${clubSubscriptions.id} and (d.card_number ilike ${term} or d.name ilike ${term}))`,
      ]
      if (digits.length >= 3) matches.push(like(clubSubscriptions.holderCpf, `%${digits}%`))
      conditions.push(or(...matches)!)
    }
    const where = and(...conditions)

    const [totals] = await db.select({ total: count() }).from(clubSubscriptions).where(where)
    const rows = await db
      .select()
      .from(clubSubscriptions)
      .where(where)
      .orderBy(desc(clubSubscriptions.createdAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage)

    return paginate(await buildSubscriptionDtos(rows), query.page, query.perPage, totals?.total ?? 0)
  },

  async detail(orgId: string, id: string): Promise<ClubSubscriptionDetail> {
    const sub = await findSubscriptionOfTenant(orgId, id)
    const [dto] = await buildSubscriptionDtos([sub])
    const [charges, events] = await Promise.all([
      db
        .select()
        .from(clubCharges)
        .where(eq(clubCharges.subscriptionId, sub.id))
        .orderBy(desc(clubCharges.dueDate), desc(clubCharges.createdAt)),
      db
        .select()
        .from(paymentEvents)
        .where(eq(paymentEvents.subscriptionId, sub.id))
        .orderBy(desc(paymentEvents.createdAt))
        .limit(200),
    ])
    return {
      ...dto!,
      charges: charges.map(charge => toClubCharge(charge, sub)),
      events: events.map(toPaymentEvent),
    }
  },

  async cancel(orgId: string, id: string, reason: string, actorUserId: string | null): Promise<ClubSubscriptionDetail> {
    const sub = await findSubscriptionOfTenant(orgId, id)
    if (sub.status === 'canceled') throw AppError.businessRule('A assinatura já está cancelada')
    await cancelSubscription(sub, reason, { source: 'manual', actorUserId })
    return subscriptionsService.detail(orgId, id)
  },

  /**
   * canceled → pending_payment com cobrança nova (período = hoje; cartão com
   * token cobra na hora). past_due/suspended → active (override manual; as
   * cobranças seguem em aberto).
   */
  async reactivate(orgId: string, id: string, actorUserId: string | null): Promise<ClubSubscriptionDetail> {
    const sub = await findSubscriptionOfTenant(orgId, id)
    const now = new Date()

    if (sub.status === 'past_due' || sub.status === 'suspended') {
      const [updated] = await db
        .update(clubSubscriptions)
        .set({ status: 'active', suspendedAt: null, updatedAt: now })
        .where(and(eq(clubSubscriptions.id, sub.id), inArray(clubSubscriptions.status, ['past_due', 'suspended'])))
        .returning({ id: clubSubscriptions.id })
      if (updated) {
        await recordPaymentEvent(db, {
          organizationId: orgId,
          subscriptionId: sub.id,
          type: 'SUBSCRIPTION_REACTIVATED',
          source: 'manual',
          gatewayProvider: sub.gatewayProvider,
          message: 'Assinatura reativada manualmente (as cobranças em aberto continuam valendo)',
          actorUserId,
        })
      }
      return subscriptionsService.detail(orgId, id)
    }

    if (sub.status !== 'canceled') {
      throw AppError.businessRule(
        sub.status === 'active' ? 'A assinatura já está ativa' : 'A assinatura já está aguardando pagamento',
      )
    }

    const today = todaySP(now)

    // Cancelada dentro de um período já pago: volta direto para ativa, sem cobrança nova.
    const [paidCurrent] = await db
      .select()
      .from(clubCharges)
      .where(
        and(
          eq(clubCharges.subscriptionId, sub.id),
          eq(clubCharges.kind, 'cycle'),
          eq(clubCharges.status, 'paid'),
          lte(clubCharges.periodStart, today),
          gt(clubCharges.periodEnd, today),
        ),
      )
      .orderBy(desc(clubCharges.periodStart))
      .limit(1)
    if (paidCurrent) {
      const [updated] = await db
        .update(clubSubscriptions)
        .set({
          status: 'active',
          canceledAt: null,
          cancelReason: null,
          suspendedAt: null,
          currentPeriodStart: paidCurrent.periodStart,
          currentPeriodEnd: paidCurrent.periodEnd,
          nextDueDate:
            sub.nextDueDate && sub.nextDueDate > paidCurrent.periodEnd ? sub.nextDueDate : paidCurrent.periodEnd,
          updatedAt: now,
        })
        .where(and(eq(clubSubscriptions.id, sub.id), eq(clubSubscriptions.status, 'canceled')))
        .returning({ id: clubSubscriptions.id })
      if (updated) {
        await recordPaymentEvent(db, {
          organizationId: orgId,
          subscriptionId: sub.id,
          type: 'SUBSCRIPTION_REACTIVATED',
          source: 'manual',
          gatewayProvider: sub.gatewayProvider,
          message: 'Assinatura reativada pelo administrador — o período atual já está pago',
          actorUserId,
        })
      }
      return subscriptionsService.detail(orgId, id)
    }

    const dueDay = dueDayOf(today)
    const periodEnd = addMonthsOnDueDay(today, 1, dueDay)
    // Sem conta de recebimento: 409 antes de reabrir a assinatura.
    const provider = await resolveReadyGatewayProvider(orgId)

    const [existing] = await db
      .select()
      .from(clubCharges)
      .where(and(eq(clubCharges.subscriptionId, sub.id), eq(clubCharges.kind, 'cycle'), eq(clubCharges.periodStart, today)))
      .limit(1)

    const chargeId = await db.transaction(async tx => {
      await tx
        .update(clubSubscriptions)
        .set({
          status: 'pending_payment',
          dueDay,
          canceledAt: null,
          cancelReason: null,
          suspendedAt: null,
          updatedAt: now,
        })
        .where(and(eq(clubSubscriptions.id, sub.id), eq(clubSubscriptions.status, 'canceled')))

      const values = {
        periodEnd,
        dueDate: today,
        amount: sub.amount,
        method: sub.paymentMethod,
        status: 'pending' as const,
        description: `${sub.planName} · Reativação · ${monthLabel(today)}`,
        gatewayProvider: provider,
        gatewayChargeId: null,
        invoiceUrl: null,
        pixPayload: null,
        pixQrCode: null,
        pixExpiresAt: null,
        boletoIdentificationField: null,
        boletoBarCode: null,
        boletoUrl: null,
        attempts: 0,
        failureReason: null,
        canceledAt: null,
        refundedAt: null,
        updatedAt: now,
      }
      let id: string
      if (existing) {
        await tx.update(clubCharges).set(values).where(eq(clubCharges.id, existing.id))
        id = existing.id
      } else {
        const [inserted] = await tx
          .insert(clubCharges)
          .values({ organizationId: orgId, subscriptionId: sub.id, periodStart: today, ...values })
          .returning({ id: clubCharges.id })
        id = inserted!.id
      }
      await recordPaymentEvent(tx, {
        organizationId: orgId,
        subscriptionId: sub.id,
        chargeId: id,
        type: 'SUBSCRIPTION_REACTIVATED',
        source: 'manual',
        gatewayProvider: provider,
        message: 'Assinatura reaberta pelo administrador — aguardando o pagamento da nova cobrança',
        actorUserId,
      })
      return id
    })

    const canChargeNow = sub.paymentMethod !== 'credit_card' || Boolean(sub.cardToken)
    if (canChargeNow) {
      try {
        await submitChargeToGateway(chargeId, {
          method: sub.paymentMethod,
          useSavedCard: sub.paymentMethod === 'credit_card',
          source: 'manual',
          actorUserId,
        })
      } catch (error) {
        logger.warn({ subscriptionId: sub.id, err: error instanceof Error ? error.message : String(error) }, 'Falha ao cobrar na reativação')
      }
    }
    return subscriptionsService.detail(orgId, id)
  },
}
