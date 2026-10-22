import {
  CARD_BRAND_LABELS,
  CLUB_PAYMENT_METHOD_LABELS,
  PLATFORM_BILLING_EVENT_LABELS,
  PLATFORM_CHARGE_KIND_LABELS,
  formatBRL,
  formatDateBR,
  onlyDigits,
  type PaymentGatewayProvider,
  type PlatformBillingEventType,
  type PlatformEventSource,
} from '@annetec/contracts'
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import { db } from '@/db/client'
import { platformBillingEvents, platformCharges, platformSubscriptions, tenantProfiles } from '@/db/schema'
import { invalidatePlatformAccessCache } from '@/http/middleware/platform-access'
import { mapAsaasCardBrand } from '@/integrations/asaas/webhook'
import { logger } from '@/lib/logger'
import { notifyPlatformInvoicePaid } from '@/lib/notifications'
import { noonSP, todaySP } from '@/modules/club-billing/dates'
import { invalidateHoldingCache } from '@/modules/holding/cache'
import { parsePlatformReference, platformInvoiceUrl } from './access-key'
import { sendPlatformEmails, type PlatformEmail } from './notify'
import { OPEN_PLATFORM_CHARGE_STATUSES, type PlatformChargeRow, type PlatformSubscriptionRow } from './presenter'
import { proposalBasics, proposalDisplayName, tenantRefOf, type Executor } from './queries'

/**
 * Handler ÚNICO dos eventos de pagamento da PLATAFORMA (blueprint da
 * plataforma §0.4) — mesmo desenho do `club-billing/events.service.ts`
 * (copiado, não importado): webhook do Asaas, sincronização da automação,
 * simulação e baixa manual montam um payload no formato do webhook do Asaas.
 *
 * Idempotência: (1) unique `(gateway_provider, external_event_id)` em
 * `platform_billing_events`; (2) toda mudança é `UPDATE … WHERE status IN (…)
 * RETURNING`. Efeitos colaterais (e-mail, cache do guard, provisionamento da
 * ativação) só rodam DEPOIS do commit e só quando a linha mudou.
 */

export interface PlatformGatewayEventPayment {
  /** Id da cobrança no gateway; `null` na baixa manual sem gateway. */
  id: string | null
  /** `plt_<uuid sem hífens>`. */
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

export interface PlatformGatewayEventPayload {
  /** Id do evento (dedupe). Sintético: `evt_plt_<gatewayChargeId>_<EVENT>`; baixa manual: `null`. */
  id: string | null
  event: string
  dateCreated?: string | null
  payment: PlatformGatewayEventPayment
}

export interface PlatformGatewayEventContext {
  source: PlatformEventSource
  provider: PaymentGatewayProvider
  actorUserId?: string | null
  now?: Date
  failureReason?: string | null
  /** Validade `MM/YYYY` do cartão digitado (vai junto do token). */
  cardExpiry?: string | null
  paidAt?: Date | null
  paidAmount?: number | null
}

export interface PlatformGatewayEventOutcome {
  status: 'ignored' | 'duplicate' | 'recorded' | 'applied'
  chargeId: string | null
  subscriptionId: string | null
  proposalId: string | null
}

export function platformSyntheticEventId(gatewayChargeId: string, event: string): string {
  return `evt_plt_${gatewayChargeId}_${event}`
}

// ---------------------------------------------------------------------------
// Efeitos pós-commit
// ---------------------------------------------------------------------------

export interface PlatformEffects {
  emails: PlatformEmail[]
  invalidateOrgs: Set<string>
  /** Proposta cuja ativação acabou de ser paga (→ `onActivationPaid`). */
  activationPaid: string | null
  /** Faturas que viraram `paid` neste evento (→ sino do backoffice). */
  paidCharges: string[]
}

export function newEffects(): PlatformEffects {
  return { emails: [], invalidateOrgs: new Set(), activationPaid: null, paidCharges: [] }
}

export async function runEffects(effects: PlatformEffects, source: PlatformEventSource): Promise<void> {
  for (const orgId of effects.invalidateOrgs) invalidatePlatformAccessCache(orgId)
  invalidateHoldingCache()
  await sendPlatformEmails(effects.emails)
  for (const chargeId of effects.paidCharges) await notifyPlatformInvoicePaid({ chargeId })
  if (effects.activationPaid) {
    const proposalId = effects.activationPaid
    try {
      const { onActivationPaid } = await import('@/modules/platform-onboarding/provisioning.service')
      await onActivationPaid(proposalId, { source })
    } catch (error) {
      logger.error(
        { proposalId, err: error instanceof Error ? error.message : String(error) },
        'Ativação paga, mas o provisionamento falhou (retentativa manual em /provisionar)',
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Cartão da ativação (a assinatura só nasce no provisionamento)
// ---------------------------------------------------------------------------

export interface StashedCard {
  token: string
  brand: string
  last4: string
  expiry: string | null
}

const ACTIVATION_CARD_TTL_MS = 24 * 60 * 60 * 1000
const activationCards = new Map<string, StashedCard & { expiresAt: number }>()

/**
 * O token do cartão que pagou a ativação fica em MEMÓRIA até o
 * provisionamento criar a assinatura (segundos depois, no mesmo processo).
 * Nunca vai para o banco fora da assinatura nem para o payload do evento.
 */
export function stashActivationCard(proposalId: string, card: StashedCard): void {
  activationCards.set(proposalId, { ...card, expiresAt: Date.now() + ACTIVATION_CARD_TTL_MS })
}

export function takeActivationCard(proposalId: string): StashedCard | null {
  const card = activationCards.get(proposalId)
  activationCards.delete(proposalId)
  if (!card || card.expiresAt < Date.now()) return null
  return { token: card.token, brand: card.brand, last4: card.last4, expiry: card.expiry }
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface RecordPlatformEventInput {
  organizationId?: string | null
  subscriptionId?: string | null
  chargeId?: string | null
  proposalId?: string | null
  type: PlatformBillingEventType | (string & {})
  source: PlatformEventSource
  gatewayProvider?: PaymentGatewayProvider | null
  message: string
  payload?: Record<string, unknown> | null
  actorUserId?: string | null
}

/** Grava uma linha na timeline. `payload` NUNCA tem dado de cartão. */
export async function recordPlatformEvent(executor: Pick<Executor, 'insert'>, input: RecordPlatformEventInput): Promise<void> {
  await executor.insert(platformBillingEvents).values({
    organizationId: input.organizationId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    chargeId: input.chargeId ?? null,
    proposalId: input.proposalId ?? null,
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
// Destinatário e dados dos e-mails
// ---------------------------------------------------------------------------

export interface ChargeRecipient {
  email: string
  name: string
  tenantName: string
}

/** Quem recebe os e-mails de uma fatura: financeiro da assinatura ou o candidato da proposta. */
export async function chargeRecipient(
  executor: Pick<Executor, 'select'>,
  charge: Pick<PlatformChargeRow, 'subscriptionId' | 'proposalId' | 'organizationId'>,
): Promise<ChargeRecipient | null> {
  if (charge.subscriptionId) {
    const [sub] = await executor
      .select({ email: platformSubscriptions.billingEmail, name: platformSubscriptions.billingName, orgId: platformSubscriptions.organizationId })
      .from(platformSubscriptions)
      .where(eq(platformSubscriptions.id, charge.subscriptionId))
      .limit(1)
    if (sub) {
      const tenant = await tenantRefOf(sub.orgId, executor)
      return { email: sub.email, name: sub.name, tenantName: tenant?.name ?? sub.name }
    }
  }
  if (charge.proposalId) {
    const proposal = await proposalBasics(charge.proposalId, executor)
    if (proposal) {
      return { email: proposal.applicant.email, name: proposal.applicant.name, tenantName: proposalDisplayName(proposal) }
    }
  }
  return null
}

export function billingEmailData(
  charge: Pick<PlatformChargeRow, 'id' | 'description' | 'amount' | 'dueDate'>,
  tenantName: string,
  extra: Record<string, unknown> = {},
) {
  return {
    tenantName,
    description: charge.description,
    amount: Number(charge.amount),
    dueDate: charge.dueDate,
    payUrl: platformInvoiceUrl(charge.id),
    ...extra,
  }
}

export function chargeEmail(
  template: PlatformEmail['template'],
  charge: Pick<PlatformChargeRow, 'id' | 'description' | 'amount' | 'dueDate' | 'organizationId' | 'proposalId'>,
  recipient: ChargeRecipient,
  extra: Record<string, unknown> = {},
): PlatformEmail {
  return {
    template,
    to: { email: recipient.email, name: recipient.name },
    data: billingEmailData(charge, recipient.tenantName, extra),
    organizationId: charge.organizationId,
    proposalId: charge.proposalId,
    relatedType: 'platform_charge',
    relatedId: charge.id,
  }
}

// ---------------------------------------------------------------------------
// Transições de assinatura compartilhadas (handler, automação, console)
// ---------------------------------------------------------------------------

/** Espelho em `tenant_profiles.status` (só gerenciados). Nunca `cancelled`. */
export async function mirrorTenantStatus(executor: Pick<Executor, 'update'>, orgId: string, to: 'active' | 'suspended'): Promise<void> {
  if (to === 'suspended') {
    await executor
      .update(tenantProfiles)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(and(eq(tenantProfiles.organizationId, orgId), inArray(tenantProfiles.status, ['active', 'trial'])))
  } else {
    await executor
      .update(tenantProfiles)
      .set({ status: 'active', updatedAt: new Date() })
      .where(and(eq(tenantProfiles.organizationId, orgId), eq(tenantProfiles.status, 'suspended')))
  }
}

/** active → past_due, com evento. */
export async function markPlatformPastDue(
  executor: Pick<Executor, 'update' | 'insert'>,
  sub: Pick<PlatformSubscriptionRow, 'id' | 'organizationId'>,
  reason: string,
  ctx: Pick<PlatformGatewayEventContext, 'source' | 'provider'>,
  now: Date,
  effects?: PlatformEffects,
): Promise<boolean> {
  const [changed] = await executor
    .update(platformSubscriptions)
    .set({ status: 'past_due', pastDueAt: now, updatedAt: now })
    .where(and(eq(platformSubscriptions.id, sub.id), eq(platformSubscriptions.status, 'active')))
    .returning({ id: platformSubscriptions.id })
  if (!changed) return false
  await recordPlatformEvent(executor, {
    organizationId: sub.organizationId,
    subscriptionId: sub.id,
    type: 'SUBSCRIPTION_PAST_DUE',
    source: ctx.source,
    gatewayProvider: ctx.provider,
    message: `Assinatura em atraso: ${reason}`,
  })
  effects?.invalidateOrgs.add(sub.organizationId)
  return true
}

/** past_due/restricted/suspended → active quando não resta fatura aberta vencida. */
export async function reactivatePlatformIfSettled(
  executor: Pick<Executor, 'select' | 'update' | 'insert'>,
  sub: Pick<PlatformSubscriptionRow, 'id' | 'organizationId' | 'billingEmail' | 'billingName'>,
  ctx: Pick<PlatformGatewayEventContext, 'source' | 'provider' | 'actorUserId'>,
  now: Date,
  effects?: PlatformEffects,
): Promise<boolean> {
  const today = todaySP(now)
  const [stillOverdue] = await executor
    .select({ id: platformCharges.id })
    .from(platformCharges)
    .where(
      and(
        eq(platformCharges.subscriptionId, sub.id),
        inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES),
        lt(platformCharges.dueDate, today),
      ),
    )
    .limit(1)
  if (stillOverdue) return false

  const [reactivated] = await executor
    .update(platformSubscriptions)
    .set({ status: 'active', pastDueAt: null, restrictedAt: null, suspendedAt: null, reactivatedAt: now, updatedAt: now })
    .where(
      and(eq(platformSubscriptions.id, sub.id), inArray(platformSubscriptions.status, ['past_due', 'restricted', 'suspended'])),
    )
    .returning({ id: platformSubscriptions.id })
  if (!reactivated) return false

  await mirrorTenantStatus(executor, sub.organizationId, 'active')
  await recordPlatformEvent(executor, {
    organizationId: sub.organizationId,
    subscriptionId: sub.id,
    type: 'SUBSCRIPTION_REACTIVATED',
    source: ctx.source,
    gatewayProvider: ctx.provider,
    message: 'Assinatura reativada: faturas em dia — painel liberado',
    actorUserId: ctx.actorUserId ?? null,
  })
  if (effects) {
    effects.invalidateOrgs.add(sub.organizationId)
    const tenant = await tenantRefOf(sub.organizationId, executor)
    effects.emails.push({
      template: 'platform_access_reactivated',
      to: { email: sub.billingEmail, name: sub.billingName },
      data: { tenantName: tenant?.name ?? sub.billingName, reason: 'Pagamento confirmado' },
      organizationId: sub.organizationId,
      relatedType: 'platform_subscription',
      relatedId: sub.id,
    })
  }
  return true
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handlePlatformGatewayEvent(
  payload: PlatformGatewayEventPayload,
  ctx: PlatformGatewayEventContext,
): Promise<PlatformGatewayEventOutcome> {
  const now = ctx.now ?? new Date()
  const charge = await findChargeForEvent(payload, ctx.provider)
  if (!charge) {
    logger.info(
      { event: payload.event, provider: ctx.provider, source: ctx.source },
      'Evento de pagamento da plataforma sem fatura correspondente — ignorado',
    )
    return { status: 'ignored', chargeId: null, subscriptionId: null, proposalId: null }
  }

  const effects = newEffects()
  const outcome = await db.transaction(async tx => {
    const [inserted] = await tx
      .insert(platformBillingEvents)
      .values({
        organizationId: charge.organizationId,
        subscriptionId: charge.subscriptionId,
        chargeId: charge.id,
        proposalId: charge.proposalId,
        type: payload.event.slice(0, 80),
        source: ctx.source,
        gatewayProvider: ctx.provider,
        externalEventId: payload.id ?? null,
        message: eventMessage(payload, charge, ctx),
        payload: sanitizePayload(payload),
        actorUserId: ctx.actorUserId ?? null,
      })
      .onConflictDoNothing({ target: [platformBillingEvents.gatewayProvider, platformBillingEvents.externalEventId] })
      .returning({ id: platformBillingEvents.id })

    const base = { chargeId: charge.id, subscriptionId: charge.subscriptionId, proposalId: charge.proposalId }
    if (!inserted) return { status: 'duplicate' as const, ...base }
    const changed = await applyEvent(tx, payload, charge, ctx, now, effects)
    return { status: changed ? ('applied' as const) : ('recorded' as const), ...base }
  })

  if (outcome.status === 'applied') await runEffects(effects, ctx.source)
  return outcome
}

async function findChargeForEvent(payload: PlatformGatewayEventPayload, provider: PaymentGatewayProvider): Promise<PlatformChargeRow | null> {
  const chargeId = parsePlatformReference(payload.payment.externalReference)
  const gatewayId = payload.payment.id

  if (chargeId) {
    const byReference = gatewayId
      ? and(
          eq(platformCharges.id, chargeId),
          or(eq(platformCharges.gatewayChargeId, gatewayId), isNull(platformCharges.gatewayChargeId)),
        )
      : eq(platformCharges.id, chargeId)
    const [row] = await db.select().from(platformCharges).where(byReference).limit(1)
    if (row) return row
  }

  if (gatewayId) {
    const [row] = await db
      .select()
      .from(platformCharges)
      .where(and(eq(platformCharges.gatewayProvider, provider), eq(platformCharges.gatewayChargeId, gatewayId)))
      .limit(1)
    return row ?? null
  }
  return null
}

async function applyEvent(
  tx: Executor,
  payload: PlatformGatewayEventPayload,
  charge: PlatformChargeRow,
  ctx: PlatformGatewayEventContext,
  now: Date,
  effects: PlatformEffects,
): Promise<boolean> {
  switch (payload.event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
      return applyPaid(tx, payload, charge, ctx, now, effects)
    case 'PAYMENT_OVERDUE':
      return applyOverdue(tx, charge, ctx, now, effects)
    case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
      return applyRefused(tx, charge, ctx, now, effects)
    case 'PAYMENT_REFUNDED':
      return applyRefunded(tx, charge, now)
    case 'PAYMENT_DELETED':
      return applyDeleted(tx, payload, charge, now)
    default:
      return false
  }
}

function paidAtFrom(payment: PlatformGatewayEventPayment, ctx: PlatformGatewayEventContext, now: Date): Date {
  if (ctx.paidAt) return ctx.paidAt
  const raw = payment.clientPaymentDate ?? payment.paymentDate ?? payment.confirmedDate ?? null
  if (!raw) return now
  const date = raw.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= todaySP(now)) return now
  return noonSP(date)
}

async function applyPaid(
  tx: Executor,
  payload: PlatformGatewayEventPayload,
  charge: PlatformChargeRow,
  ctx: PlatformGatewayEventContext,
  now: Date,
  effects: PlatformEffects,
): Promise<boolean> {
  const payment = payload.payment
  const paidAmount = ctx.paidAmount ?? payment.value ?? Number(charge.amount)
  const card = payment.creditCard
  const last4 = onlyDigits(card?.creditCardNumber ?? '').slice(-4)

  const [updated] = await tx
    .update(platformCharges)
    .set({
      status: 'paid',
      paidAt: paidAtFrom(payment, ctx, now),
      paidAmount: String(paidAmount),
      failureReason: null,
      updatedAt: now,
      ...(last4.length === 4 ? { cardBrand: mapAsaasCardBrand(card?.creditCardBrand), cardLast4: last4 } : {}),
    })
    .where(and(eq(platformCharges.id, charge.id), inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES)))
    .returning()
  if (!updated) return false

  const recipient = await chargeRecipient(tx, updated)
  if (recipient) effects.emails.push(chargeEmail('platform_invoice_paid', updated, recipient, { paidAmount }))
  effects.paidCharges.push(updated.id)

  // Cartão aprovado: token + bandeira/finais para a recorrência.
  if (card?.creditCardToken && last4.length === 4) {
    const saved: StashedCard = {
      token: card.creditCardToken,
      brand: mapAsaasCardBrand(card.creditCardBrand),
      last4,
      expiry: ctx.cardExpiry ?? null,
    }
    if (updated.subscriptionId) {
      await tx
        .update(platformSubscriptions)
        .set({
          cardToken: saved.token,
          cardBrand: saved.brand,
          cardLast4: saved.last4,
          ...(saved.expiry ? { cardExpiry: saved.expiry } : {}),
          updatedAt: now,
        })
        .where(eq(platformSubscriptions.id, updated.subscriptionId))
    } else if (updated.kind === 'activation' && updated.proposalId) {
      stashActivationCard(updated.proposalId, saved)
    }
  }

  if (updated.kind === 'activation' && updated.proposalId) effects.activationPaid = updated.proposalId

  if (updated.subscriptionId) {
    const [sub] = await tx
      .select()
      .from(platformSubscriptions)
      .where(eq(platformSubscriptions.id, updated.subscriptionId))
      .for('update')
      .limit(1)
    if (sub && (sub.status === 'past_due' || sub.status === 'restricted' || sub.status === 'suspended')) {
      await reactivatePlatformIfSettled(tx, sub, ctx, now, effects)
    }
    if (sub) effects.invalidateOrgs.add(sub.organizationId)
  }
  return true
}

async function applyOverdue(
  tx: Executor,
  charge: PlatformChargeRow,
  ctx: PlatformGatewayEventContext,
  now: Date,
  effects: PlatformEffects,
): Promise<boolean> {
  const [updated] = await tx
    .update(platformCharges)
    .set({ status: 'overdue', updatedAt: now })
    .where(and(eq(platformCharges.id, charge.id), eq(platformCharges.status, 'pending')))
    .returning()
  if (!updated) return false
  if (updated.subscriptionId && updated.organizationId) {
    await markPlatformPastDue(
      tx,
      { id: updated.subscriptionId, organizationId: updated.organizationId },
      `fatura de ${formatBRL(Number(updated.amount))} venceu em ${formatDateBR(updated.dueDate)}`,
      ctx,
      now,
      effects,
    )
  }
  return true
}

async function applyRefused(
  tx: Executor,
  charge: PlatformChargeRow,
  ctx: PlatformGatewayEventContext,
  now: Date,
  effects: PlatformEffects,
): Promise<boolean> {
  const [updated] = await tx
    .update(platformCharges)
    .set({
      status: 'failed',
      attempts: charge.attempts + 1,
      lastAttemptAt: now,
      failureReason: (ctx.failureReason ?? 'Cartão recusado').slice(0, 300),
      updatedAt: now,
    })
    .where(and(eq(platformCharges.id, charge.id), inArray(platformCharges.status, ['pending', 'failed'])))
    .returning()
  if (!updated) return false
  if (updated.subscriptionId && updated.organizationId && updated.dueDate <= todaySP(now)) {
    await markPlatformPastDue(
      tx,
      { id: updated.subscriptionId, organizationId: updated.organizationId },
      `cartão recusado na fatura de ${formatBRL(Number(updated.amount))}`,
      ctx,
      now,
      effects,
    )
  }
  return true
}

async function applyRefunded(tx: Executor, charge: PlatformChargeRow, now: Date): Promise<boolean> {
  const [updated] = await tx
    .update(platformCharges)
    .set({ status: 'refunded', refundedAt: now, updatedAt: now })
    .where(and(eq(platformCharges.id, charge.id), eq(platformCharges.status, 'paid')))
    .returning({ id: platformCharges.id })
  return Boolean(updated)
}

async function applyDeleted(tx: Executor, payload: PlatformGatewayEventPayload, charge: PlatformChargeRow, now: Date): Promise<boolean> {
  if (!payload.payment.id) return false
  const [updated] = await tx
    .update(platformCharges)
    .set({ status: 'canceled', canceledAt: now, updatedAt: now })
    .where(
      and(
        eq(platformCharges.id, charge.id),
        eq(platformCharges.gatewayChargeId, payload.payment.id),
        inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES),
      ),
    )
    .returning({ id: platformCharges.id })
  return Boolean(updated)
}

// ---------------------------------------------------------------------------
// Texto e payload
// ---------------------------------------------------------------------------

function eventMessage(payload: PlatformGatewayEventPayload, charge: PlatformChargeRow, ctx: PlatformGatewayEventContext): string {
  const amount = formatBRL(ctx.paidAmount ?? payload.payment.value ?? Number(charge.amount))
  const method = CLUB_PAYMENT_METHOD_LABELS[charge.method]
  const kind = PLATFORM_CHARGE_KIND_LABELS[charge.kind].toLowerCase()
  const simulated = ctx.source === 'simulation' ? ' (simulado)' : ''
  const card = payload.payment.creditCard
  const last4 = onlyDigits(card?.creditCardNumber ?? '').slice(-4)
  const cardText = last4.length === 4 ? ` — cartão ${CARD_BRAND_LABELS[mapAsaasCardBrand(card?.creditCardBrand)]} final ${last4}` : ''

  switch (payload.event) {
    case 'PAYMENT_CONFIRMED':
      return `Pagamento de ${amount} (${kind}) confirmado via ${method}${cardText}${simulated}`
    case 'PAYMENT_RECEIVED':
      return ctx.source === 'manual'
        ? `Pagamento de ${amount} (${kind}) recebido — baixa manual`
        : `Pagamento de ${amount} (${kind}) recebido via ${method}${cardText}${simulated}`
    case 'PAYMENT_OVERDUE':
      return `Fatura de ${formatBRL(Number(charge.amount))} (${kind}) venceu em ${formatDateBR(charge.dueDate)}`
    case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
      return `Cartão recusado: ${ctx.failureReason ?? 'transação não autorizada'}`
    case 'PAYMENT_REFUNDED':
      return `Pagamento de ${amount} estornado`
    case 'PAYMENT_DELETED':
      return 'Cobrança removida no gateway'
    default:
      return (
        PLATFORM_BILLING_EVENT_LABELS[payload.event as PlatformBillingEventType] ??
        `Evento do gateway: ${payload.event.slice(0, 80)}`
      )
  }
}

/** Só o necessário para auditoria — sem número, CVV ou token de cartão. */
function sanitizePayload(payload: PlatformGatewayEventPayload): Record<string, unknown> {
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
      ...(payment.creditCard ? { creditCard: { brand: payment.creditCard.creditCardBrand ?? null, last4: last4 || null } } : {}),
    },
  }
}
