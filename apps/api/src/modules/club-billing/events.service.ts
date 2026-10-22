import {
  CARD_BRAND_LABELS,
  CLUB_PAYMENT_METHOD_LABELS,
  PAYMENT_EVENT_LABELS,
  formatBRL,
  formatDateBR,
  onlyDigits,
  uuid,
  type PaymentEventSource,
  type PaymentEventType,
  type PaymentGatewayProvider,
} from '@annetec/contracts'
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  clubCharges,
  clubSubscriptionDependents,
  clubSubscriptions,
  organization,
  paymentEvents,
} from '@/db/schema'
import { mapAsaasCardBrand } from '@/integrations/asaas/webhook'
import { logger } from '@/lib/logger'
import { notifyClubChargePaid } from '@/lib/notifications'
import { cardPrefixFromSlug, dependentCardNumber, holderCardNumber, holderCardPattern } from './card-number'
import { noonSP, todaySP, yearSP } from './dates'
import { OPEN_CHARGE_STATUSES, type ChargeRow, type SubscriptionRow } from './presenter'

/**
 * Handler ÚNICO de eventos de pagamento (blueprint §0.1-3 e §0.5).
 *
 * Webhook real do Asaas, sincronização (automação/polling), simulação e
 * baixa manual montam um payload NO FORMATO do webhook do Asaas e chamam
 * `handleGatewayEvent`. Não há loopback HTTP: só a camada HTTP + token é
 * exclusiva do webhook.
 *
 * Idempotência em duas camadas:
 *  1. `payment_events` tem unique `(gateway_provider, external_event_id)` —
 *     evento repetido (entrega at-least-once) não passa do insert;
 *  2. toda mudança de estado é `UPDATE … WHERE status IN (…) RETURNING`, então
 *     dois eventos diferentes com o mesmo efeito (CONFIRMED e RECEIVED) só
 *     mudam a linha uma vez, mesmo concorrendo. Eventos derivados
 *     (`SUBSCRIPTION_*`) só nascem quando a linha mudou.
 */

type Executor = Pick<typeof db, 'select' | 'insert' | 'update' | 'execute'>

export interface GatewayEventPayment {
  /** Id da cobrança no gateway (`pay_…`/`sim_pay_…`); `null` na baixa manual sem gateway. */
  id: string | null
  /** `club_charges.id`. */
  externalReference?: string | null
  status?: string | null
  value?: number | null
  billingType?: string | null
  paymentDate?: string | null
  clientPaymentDate?: string | null
  confirmedDate?: string | null
  deleted?: boolean | null
  creditCard?: {
    creditCardNumber?: string | null
    creditCardBrand?: string | null
    creditCardToken?: string | null
  } | null
}

export interface GatewayEventPayload {
  /** Id do evento (dedupe). Simulação/sincronização: `evt_sim_<gatewayChargeId>_<EVENT>`; baixa manual: `null`. */
  id: string | null
  event: string
  dateCreated?: string | null
  payment: GatewayEventPayment
}

export interface GatewayEventContext {
  source: PaymentEventSource
  provider: PaymentGatewayProvider
  actorUserId?: string | null
  now?: Date
  /** Motivo da recusa (vai para `failure_reason`). */
  failureReason?: string | null
  /** Validade `MM/YYYY` do cartão digitado, salva junto do token. */
  cardExpiry?: string | null
  /** Instante do pagamento quando conhecido (baixa manual). */
  paidAt?: Date | null
  paidAmount?: number | null
}

export interface GatewayEventOutcome {
  status: 'ignored' | 'duplicate' | 'recorded' | 'applied'
  chargeId: string | null
  subscriptionId: string | null
}

/** Id determinístico de evento gerado por nós (simulação/sincronização/checkout). */
export function syntheticEventId(gatewayChargeId: string, event: string): string {
  return `evt_sim_${gatewayChargeId}_${event}`
}

// ---------------------------------------------------------------------------
// Registro de evento (timeline)
// ---------------------------------------------------------------------------

export interface RecordEventInput {
  organizationId: string
  subscriptionId?: string | null
  chargeId?: string | null
  type: PaymentEventType | (string & {})
  source: PaymentEventSource
  gatewayProvider?: PaymentGatewayProvider | null
  message: string
  payload?: Record<string, unknown> | null
  actorUserId?: string | null
}

/** Grava uma linha na timeline. `payload` NUNCA pode ter dado de cartão. */
export async function recordPaymentEvent(executor: Executor, input: RecordEventInput): Promise<void> {
  await executor.insert(paymentEvents).values({
    organizationId: input.organizationId,
    subscriptionId: input.subscriptionId ?? null,
    chargeId: input.chargeId ?? null,
    type: input.type,
    source: input.source,
    gatewayProvider: input.gatewayProvider ?? null,
    externalEventId: null,
    message: input.message.slice(0, 500),
    payload: input.payload ?? null,
    actorUserId: input.actorUserId ?? null,
  })
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Cobrança que virou `paid` NESTE evento — vira notificação depois do commit
 * (nunca dentro da transação: falha do sino não desfaz o pagamento, e evento
 * duplicado/sem efeito nunca chega a empilhar nada aqui).
 */
interface PaidNote {
  chargeId: string
  /** A assinatura ainda aguardava o 1º pagamento → "Nova assinatura paga". */
  firstPayment: boolean
}

export async function handleGatewayEvent(
  payload: GatewayEventPayload,
  ctx: GatewayEventContext,
): Promise<GatewayEventOutcome> {
  const outcome = await applyGatewayEvent(payload, ctx)
  for (const note of outcome.paidNotes) await notifyClubChargePaid(note)
  return { status: outcome.status, chargeId: outcome.chargeId, subscriptionId: outcome.subscriptionId }
}

async function applyGatewayEvent(
  payload: GatewayEventPayload,
  ctx: GatewayEventContext,
): Promise<GatewayEventOutcome & { paidNotes: PaidNote[] }> {
  const now = ctx.now ?? new Date()
  const paidNotes: PaidNote[] = []
  const charge = await findChargeForEvent(payload, ctx.provider)
  if (!charge) {
    logger.info(
      { event: payload.event, provider: ctx.provider, source: ctx.source },
      'Evento de pagamento sem cobrança correspondente — ignorado',
    )
    return { status: 'ignored', chargeId: null, subscriptionId: null, paidNotes }
  }

  const outcome = await db.transaction(async tx => {
    const [inserted] = await tx
      .insert(paymentEvents)
      .values({
        organizationId: charge.organizationId,
        subscriptionId: charge.subscriptionId,
        chargeId: charge.id,
        type: payload.event.slice(0, 80),
        source: ctx.source,
        gatewayProvider: ctx.provider,
        externalEventId: payload.id ?? null,
        message: eventMessage(payload, charge, ctx),
        payload: sanitizePayload(payload),
        actorUserId: ctx.actorUserId ?? null,
      })
      .onConflictDoNothing({ target: [paymentEvents.gatewayProvider, paymentEvents.externalEventId] })
      .returning({ id: paymentEvents.id })

    if (!inserted) {
      return { status: 'duplicate' as const, chargeId: charge.id, subscriptionId: charge.subscriptionId }
    }

    const changed = await applyEvent(tx, payload, charge, ctx, now, paidNotes)
    return {
      status: changed ? ('applied' as const) : ('recorded' as const),
      chargeId: charge.id,
      subscriptionId: charge.subscriptionId,
    }
  })
  return { ...outcome, paidNotes: outcome.status === 'applied' ? paidNotes : [] }
}

async function findChargeForEvent(payload: GatewayEventPayload, provider: PaymentGatewayProvider): Promise<ChargeRow | null> {
  const reference = payload.payment.externalReference
  const gatewayId = payload.payment.id

  if (reference && uuid.safeParse(reference).success) {
    const byReference = gatewayId
      ? and(eq(clubCharges.id, reference), or(eq(clubCharges.gatewayChargeId, gatewayId), isNull(clubCharges.gatewayChargeId)))
      : eq(clubCharges.id, reference)
    const [row] = await db.select().from(clubCharges).where(byReference).limit(1)
    if (row) return row
  }

  if (gatewayId) {
    const [row] = await db
      .select()
      .from(clubCharges)
      .where(and(eq(clubCharges.gatewayProvider, provider), eq(clubCharges.gatewayChargeId, gatewayId)))
      .limit(1)
    return row ?? null
  }
  return null
}

async function applyEvent(
  tx: Executor,
  payload: GatewayEventPayload,
  charge: ChargeRow,
  ctx: GatewayEventContext,
  now: Date,
  paidNotes: PaidNote[],
): Promise<boolean> {
  switch (payload.event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
      return applyPaid(tx, payload, charge, ctx, now, paidNotes)
    case 'PAYMENT_OVERDUE':
      return applyOverdue(tx, charge, ctx, now)
    case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
      return applyRefused(tx, charge, ctx, now)
    case 'PAYMENT_REFUNDED':
      return applyRefunded(tx, charge, now)
    case 'PAYMENT_DELETED':
      return applyDeleted(tx, payload, charge, now)
    default:
      return false
  }
}

async function lockSubscription(tx: Executor, subscriptionId: string): Promise<SubscriptionRow | null> {
  const [row] = await tx
    .select()
    .from(clubSubscriptions)
    .where(eq(clubSubscriptions.id, subscriptionId))
    .for('update')
    .limit(1)
  return row ?? null
}

function paidAtFrom(payment: GatewayEventPayment, ctx: GatewayEventContext, now: Date): Date {
  if (ctx.paidAt) return ctx.paidAt
  const raw = payment.clientPaymentDate ?? payment.paymentDate ?? payment.confirmedDate ?? null
  if (!raw) return now
  const date = raw.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= todaySP(now)) return now
  return noonSP(date)
}

async function applyPaid(
  tx: Executor,
  payload: GatewayEventPayload,
  charge: ChargeRow,
  ctx: GatewayEventContext,
  now: Date,
  paidNotes: PaidNote[],
): Promise<boolean> {
  const payment = payload.payment
  const paidAmount = ctx.paidAmount ?? payment.value ?? Number(charge.amount)
  const card = payment.creditCard
  const last4 = onlyDigits(card?.creditCardNumber ?? '').slice(-4)

  const [updated] = await tx
    .update(clubCharges)
    .set({
      status: 'paid',
      paidAt: paidAtFrom(payment, ctx, now),
      paidAmount: String(paidAmount),
      failureReason: null,
      updatedAt: now,
      ...(last4.length === 4 ? { cardBrand: mapAsaasCardBrand(card?.creditCardBrand), cardLast4: last4 } : {}),
    })
    .where(and(eq(clubCharges.id, charge.id), inArray(clubCharges.status, OPEN_CHARGE_STATUSES)))
    .returning()
  if (!updated) return false

  // Avulsa: só a cobrança muda. Nada de ativar, renovar período, reativar,
  // emitir carteirinha ou trocar o cartão da recorrência por causa dela.
  if (updated.kind === 'one_off') {
    paidNotes.push({ chargeId: updated.id, firstPayment: false })
    return true
  }

  const sub = await lockSubscription(tx, updated.subscriptionId)
  paidNotes.push({ chargeId: updated.id, firstPayment: sub?.status === 'pending_payment' })
  if (!sub) return true

  // Cartão aprovado: guarda token + bandeira/finais para a recorrência.
  if (card?.creditCardToken && last4.length === 4) {
    await tx
      .update(clubSubscriptions)
      .set({
        cardToken: card.creditCardToken,
        cardBrand: mapAsaasCardBrand(card.creditCardBrand),
        cardLast4: last4,
        ...(ctx.cardExpiry ? { cardExpiry: ctx.cardExpiry } : {}),
        updatedAt: now,
      })
      .where(eq(clubSubscriptions.id, sub.id))
  }

  if (sub.status === 'pending_payment') {
    await activateSubscription(tx, sub, updated, ctx, now)
    return true
  }

  if (sub.status === 'canceled') return true

  // Pagamento de ciclo: o período mais recente pago vira o corrente.
  const advance: Partial<typeof clubSubscriptions.$inferInsert> = {}
  if (!sub.currentPeriodStart || updated.periodStart >= sub.currentPeriodStart) {
    advance.currentPeriodStart = updated.periodStart
    advance.currentPeriodEnd = updated.periodEnd
  }
  if (!sub.nextDueDate || updated.periodEnd > sub.nextDueDate) advance.nextDueDate = updated.periodEnd
  if (Object.keys(advance).length > 0) {
    await tx
      .update(clubSubscriptions)
      .set({ ...advance, updatedAt: now })
      .where(eq(clubSubscriptions.id, sub.id))
  }

  if (sub.status === 'past_due' || sub.status === 'suspended') {
    await reactivateIfSettled(tx, sub, ctx, now)
  }
  return true
}

/** pending_payment → active: períodos, carteirinhas (titular + dependentes) e evento. */
async function activateSubscription(
  tx: Executor,
  sub: SubscriptionRow,
  charge: ChargeRow,
  ctx: GatewayEventContext,
  now: Date,
): Promise<void> {
  let holderCard = sub.cardNumber
  if (!holderCard) {
    const [org] = await tx
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, sub.organizationId))
      .limit(1)
    const prefix = cardPrefixFromSlug(org?.slug ?? '')
    const year = yearSP(now)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`club_card:${sub.organizationId}`}))`)
    const rows = await tx.execute(sql`
      select coalesce(max(split_part(card_number, '-', 3)::int), 0) as max
      from club_subscriptions
      where organization_id = ${sub.organizationId}
        and card_number ~ ${holderCardPattern(prefix, year)}`)
    const max = Number((rows as unknown as { max: number | string }[])[0]?.max ?? 0)
    holderCard = holderCardNumber(prefix, year, max + 1)
  }

  const [activated] = await tx
    .update(clubSubscriptions)
    .set({
      status: 'active',
      startedAt: sub.startedAt ?? now,
      currentPeriodStart: charge.periodStart,
      currentPeriodEnd: charge.periodEnd,
      nextDueDate: charge.periodEnd,
      cardNumber: holderCard,
      suspendedAt: null,
      updatedAt: now,
    })
    .where(and(eq(clubSubscriptions.id, sub.id), eq(clubSubscriptions.status, 'pending_payment')))
    .returning()
  if (!activated) return

  const dependents = await tx
    .select()
    .from(clubSubscriptionDependents)
    .where(eq(clubSubscriptionDependents.subscriptionId, sub.id))
  for (const dependent of dependents) {
    if (dependent.cardNumber) continue
    await tx
      .update(clubSubscriptionDependents)
      .set({ cardNumber: dependentCardNumber(holderCard, dependent.position) })
      .where(eq(clubSubscriptionDependents.id, dependent.id))
  }

  await recordPaymentEvent(tx, {
    organizationId: sub.organizationId,
    subscriptionId: sub.id,
    chargeId: charge.id,
    type: 'SUBSCRIPTION_ACTIVATED',
    source: ctx.source,
    gatewayProvider: ctx.provider,
    message:
      dependents.length > 0
        ? `Assinatura ativada — carteirinhas emitidas: ${holderCard} (titular) + ${dependents.length} dependente(s)`
        : `Assinatura ativada — carteirinha ${holderCard} emitida`,
    actorUserId: ctx.actorUserId ?? null,
  })
}

/** past_due/suspended → active quando não resta cobrança aberta vencida. */
export async function reactivateIfSettled(
  tx: Executor,
  sub: Pick<SubscriptionRow, 'id' | 'organizationId'>,
  ctx: Pick<GatewayEventContext, 'source' | 'provider' | 'actorUserId'>,
  now: Date,
): Promise<boolean> {
  const today = todaySP(now)
  const [stillOverdue] = await tx
    .select({ id: clubCharges.id })
    .from(clubCharges)
    .where(
      and(
        eq(clubCharges.subscriptionId, sub.id),
        // Só mensalidade pesa na inadimplência (avulsa vencida não segura a reativação).
        eq(clubCharges.kind, 'cycle'),
        inArray(clubCharges.status, OPEN_CHARGE_STATUSES),
        lt(clubCharges.dueDate, today),
      ),
    )
    .limit(1)
  if (stillOverdue) return false

  const [reactivated] = await tx
    .update(clubSubscriptions)
    .set({ status: 'active', suspendedAt: null, updatedAt: now })
    .where(and(eq(clubSubscriptions.id, sub.id), inArray(clubSubscriptions.status, ['past_due', 'suspended'])))
    .returning({ id: clubSubscriptions.id })
  if (!reactivated) return false

  await recordPaymentEvent(tx, {
    organizationId: sub.organizationId,
    subscriptionId: sub.id,
    type: 'SUBSCRIPTION_REACTIVATED',
    source: ctx.source,
    gatewayProvider: ctx.provider,
    message: 'Assinatura reativada: pagamentos em dia',
    actorUserId: ctx.actorUserId ?? null,
  })
  return true
}

/** active → past_due, com evento. */
export async function markSubscriptionPastDue(
  tx: Executor,
  sub: Pick<SubscriptionRow, 'id' | 'organizationId'>,
  reason: string,
  ctx: Pick<GatewayEventContext, 'source' | 'provider'>,
  now: Date,
): Promise<boolean> {
  const [changed] = await tx
    .update(clubSubscriptions)
    .set({ status: 'past_due', updatedAt: now })
    .where(and(eq(clubSubscriptions.id, sub.id), eq(clubSubscriptions.status, 'active')))
    .returning({ id: clubSubscriptions.id })
  if (!changed) return false
  await recordPaymentEvent(tx, {
    organizationId: sub.organizationId,
    subscriptionId: sub.id,
    type: 'SUBSCRIPTION_PAST_DUE',
    source: ctx.source,
    gatewayProvider: ctx.provider,
    message: `Assinatura em atraso: ${reason}`,
  })
  return true
}

async function applyOverdue(tx: Executor, charge: ChargeRow, ctx: GatewayEventContext, now: Date): Promise<boolean> {
  const [updated] = await tx
    .update(clubCharges)
    .set({ status: 'overdue', updatedAt: now })
    .where(and(eq(clubCharges.id, charge.id), eq(clubCharges.status, 'pending')))
    .returning()
  if (!updated) return false
  // Avulsa vencida não é inadimplência da assinatura.
  if (updated.kind === 'one_off') return true
  await markSubscriptionPastDue(
    tx,
    { id: updated.subscriptionId, organizationId: updated.organizationId },
    `cobrança de ${formatBRL(Number(updated.amount))} venceu em ${formatDateBR(updated.dueDate)}`,
    ctx,
    now,
  )
  return true
}

async function applyRefused(tx: Executor, charge: ChargeRow, ctx: GatewayEventContext, now: Date): Promise<boolean> {
  const [updated] = await tx
    .update(clubCharges)
    .set({
      status: 'failed',
      attempts: sql`${clubCharges.attempts} + 1`,
      lastAttemptAt: now,
      failureReason: (ctx.failureReason ?? 'Cartão recusado').slice(0, 300),
      updatedAt: now,
    })
    .where(and(eq(clubCharges.id, charge.id), inArray(clubCharges.status, ['pending', 'failed'])))
    .returning()
  if (!updated) return false
  if (updated.kind !== 'one_off' && updated.dueDate <= todaySP(now)) {
    await markSubscriptionPastDue(
      tx,
      { id: updated.subscriptionId, organizationId: updated.organizationId },
      `cartão recusado na cobrança de ${formatBRL(Number(updated.amount))}`,
      ctx,
      now,
    )
  }
  return true
}

async function applyRefunded(tx: Executor, charge: ChargeRow, now: Date): Promise<boolean> {
  const [updated] = await tx
    .update(clubCharges)
    .set({ status: 'refunded', refundedAt: now, updatedAt: now })
    .where(and(eq(clubCharges.id, charge.id), eq(clubCharges.status, 'paid')))
    .returning({ id: clubCharges.id })
  return Boolean(updated)
}

async function applyDeleted(tx: Executor, payload: GatewayEventPayload, charge: ChargeRow, now: Date): Promise<boolean> {
  if (!payload.payment.id) return false
  const [updated] = await tx
    .update(clubCharges)
    .set({ status: 'canceled', canceledAt: now, updatedAt: now })
    .where(
      and(
        eq(clubCharges.id, charge.id),
        eq(clubCharges.gatewayChargeId, payload.payment.id),
        inArray(clubCharges.status, OPEN_CHARGE_STATUSES),
      ),
    )
    .returning({ id: clubCharges.id })
  return Boolean(updated)
}

// ---------------------------------------------------------------------------
// Texto e payload
// ---------------------------------------------------------------------------

function eventMessage(payload: GatewayEventPayload, charge: ChargeRow, ctx: GatewayEventContext): string {
  const amount = formatBRL(ctx.paidAmount ?? payload.payment.value ?? Number(charge.amount))
  const method = CLUB_PAYMENT_METHOD_LABELS[charge.method]
  const simulated = `${ctx.source === 'simulation' ? ' (simulado)' : ''}${charge.kind === 'one_off' ? ` — avulsa: ${charge.description}` : ''}`
  const card = payload.payment.creditCard
  const last4 = onlyDigits(card?.creditCardNumber ?? '').slice(-4)
  const cardText = last4.length === 4 ? ` — cartão ${CARD_BRAND_LABELS[mapAsaasCardBrand(card?.creditCardBrand)]} final ${last4}` : ''

  switch (payload.event) {
    case 'PAYMENT_CONFIRMED':
      return `Pagamento de ${amount} confirmado via ${method}${cardText}${simulated}`
    case 'PAYMENT_RECEIVED':
      return ctx.source === 'manual'
        ? `Pagamento de ${amount} recebido (baixa manual)`
        : `Pagamento de ${amount} recebido via ${method}${cardText}${simulated}`
    case 'PAYMENT_OVERDUE':
      return `Cobrança de ${formatBRL(Number(charge.amount))} venceu em ${formatDateBR(charge.dueDate)}`
    case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
      return `Cartão recusado: ${ctx.failureReason ?? 'transação não autorizada'}`
    case 'PAYMENT_REFUNDED':
      return `Pagamento de ${amount} estornado`
    case 'PAYMENT_DELETED':
      return 'Cobrança removida no gateway'
    default:
      return PAYMENT_EVENT_LABELS[payload.event as PaymentEventType] ?? `Evento do gateway: ${payload.event.slice(0, 80)}`
  }
}

/** Só o necessário para auditoria — sem número, CVV ou token de cartão. */
function sanitizePayload(payload: GatewayEventPayload): Record<string, unknown> {
  const payment = payload.payment
  const last4 = onlyDigits(payment.creditCard?.creditCardNumber ?? '').slice(-4)
  return {
    id: payload.id,
    event: payload.event,
    dateCreated: payload.dateCreated ?? null,
    payment: {
      id: payment.id,
      externalReference: payment.externalReference ?? null,
      status: payment.status ?? null,
      value: payment.value ?? null,
      billingType: payment.billingType ?? null,
      paymentDate: payment.paymentDate ?? null,
      clientPaymentDate: payment.clientPaymentDate ?? null,
      confirmedDate: payment.confirmedDate ?? null,
      deleted: payment.deleted ?? null,
      ...(payment.creditCard
        ? { creditCard: { brand: payment.creditCard.creditCardBrand ?? null, last4: last4 || null } }
        : {}),
    },
  }
}
