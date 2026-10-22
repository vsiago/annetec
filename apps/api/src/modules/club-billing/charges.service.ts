import {
  CLUB_PAYMENT_METHOD_LABELS,
  ERROR_CODES,
  cardNumberIssue,
  detectCardBrand,
  formatBRL,
  formatDateBR,
  onlyDigits,
  type CheckoutCardInput,
  type ClubPaymentMethod,
  type ManualPaymentInput,
  type PaymentEventSource,
  type ReissueClubChargeInput,
  type RetryPaymentInput,
} from '@annetec/contracts'
import { and, eq, inArray } from 'drizzle-orm'
import { demoToolsAllowed } from '@/config/env'
import { db } from '@/db/client'
import { clubCharges, clubSubscriptions } from '@/db/schema'
import { AppError } from '@/http/errors'
import {
  CardDeclinedError,
  GATEWAY_UNAVAILABLE_MESSAGE,
  type GatewayCardInput,
  type GatewayCharge,
  type PaymentGateway,
} from '@/integrations/payments/gateway'
import { getGatewayFor, getPaymentGateway } from '@/integrations/payments/provider'
import { logger } from '@/lib/logger'
import { addDays, noonSP, todaySP } from './dates'
import { handleGatewayEvent, reactivateIfSettled, recordPaymentEvent, syntheticEventId } from './events.service'
import { OPEN_CHARGE_STATUSES, isOpenCharge, type ChargeRow, type SubscriptionRow } from './presenter'
import { loadBillingSettings } from './settings.service'

/**
 * Operações de cobrança que falam com o gateway: criar o pagamento de uma
 * linha já gravada ("passo 5" do checkout), nova tentativa/troca de método,
 * segunda via, baixa manual, cancelamento, simulação e sincronização.
 *
 * Toda mudança de status passa pelo handler único (`handleGatewayEvent`) ou
 * por `UPDATE … WHERE status IN (…)`. Dados de cartão só existem em memória
 * durante `createCharge` — aqui só ficam bandeira e 4 finais.
 */

export interface PaymentAttempt {
  method: ClubPaymentMethod
  /** Cartão digitado (checkout/portal). */
  card?: CheckoutCardInput
  /** Recorrência: cobra o token salvo na assinatura. */
  useSavedCard?: boolean
  remoteIp?: string
  source: PaymentEventSource
  actorUserId?: string | null
}

// Uma tentativa por cobrança por vez (clique duplo, polling + automação).
const inFlight = new Set<string>()

export async function withChargeLock<T>(chargeId: string, work: () => Promise<T>): Promise<T> {
  if (inFlight.has(chargeId)) {
    throw AppError.conflict('Já existe um pagamento em processamento para esta cobrança. Aguarde alguns segundos.')
  }
  inFlight.add(chargeId)
  try {
    return await work()
  } finally {
    inFlight.delete(chargeId)
  }
}

async function loadCharge(chargeId: string): Promise<ChargeRow> {
  const [row] = await db.select().from(clubCharges).where(eq(clubCharges.id, chargeId)).limit(1)
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Cobrança não encontrada')
  return row
}

async function loadSubscription(subscriptionId: string): Promise<SubscriptionRow> {
  const [row] = await db.select().from(clubSubscriptions).where(eq(clubSubscriptions.id, subscriptionId)).limit(1)
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Assinatura não encontrada')
  return row
}

/** Cobrança do inquilino (404 se for de outro). */
export async function findChargeOfTenant(orgId: string, chargeId: string): Promise<ChargeRow> {
  const [row] = await db
    .select()
    .from(clubCharges)
    .where(and(eq(clubCharges.id, chargeId), eq(clubCharges.organizationId, orgId)))
    .limit(1)
  if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Cobrança não encontrada')
  return row
}

function cardExpiryOf(card: CheckoutCardInput | undefined): string | null {
  return card ? `${String(card.expiryMonth).padStart(2, '0')}/${card.expiryYear}` : null
}

/** Cancela o pagamento antigo no gateway — best-effort (falha só vai para o log). */
export async function cancelAtGateway(charge: ChargeRow): Promise<void> {
  if (!charge.gatewayChargeId) return
  try {
    const gateway = await getGatewayFor(charge.organizationId, charge.gatewayProvider)
    await gateway.cancelCharge(charge.gatewayChargeId)
  } catch (error) {
    logger.warn(
      { chargeId: charge.id, provider: charge.gatewayProvider, err: error instanceof Error ? error.message : String(error) },
      'Falha ao cancelar pagamento antigo no gateway (seguindo)',
    )
  }
}

/** Garante o cliente no gateway efetivo e devolve o id (grava na assinatura se mudou). */
async function ensureGatewayCustomer(gateway: PaymentGateway, sub: SubscriptionRow): Promise<string> {
  if (sub.gatewayProvider === gateway.provider && sub.gatewayCustomerId) return sub.gatewayCustomerId
  const customerId = await gateway.ensureCustomer({
    name: sub.holderName,
    cpf: sub.holderCpf,
    email: sub.holderEmail,
    phone: sub.holderPhone,
    externalReference: sub.userId,
  })
  await db
    .update(clubSubscriptions)
    .set({ gatewayProvider: gateway.provider, gatewayCustomerId: customerId, updatedAt: new Date() })
    .where(eq(clubSubscriptions.id, sub.id))
  return customerId
}

/**
 * "Passo 5": cria o pagamento no gateway para uma cobrança JÁ gravada e
 * aplica o resultado. Nunca lança por recusa ou indisponibilidade do
 * gateway — grava `failed` com o motivo e devolve a linha atualizada.
 */
export async function submitChargeToGateway(chargeId: string, attempt: PaymentAttempt): Promise<ChargeRow> {
  const charge = await loadCharge(chargeId)
  const sub = await loadSubscription(charge.subscriptionId)
  const settings = await loadBillingSettings(charge.organizationId)
  const now = new Date()
  const today = todaySP(now)

  let gateway: PaymentGateway
  try {
    gateway = await getPaymentGateway(charge.organizationId)
  } catch (error) {
    return markGatewayFailure(charge, error)
  }

  let card: GatewayCardInput | undefined
  let cardToken: string | undefined
  if (attempt.method === 'credit_card') {
    if (attempt.card) {
      card = {
        holderName: attempt.card.holderName,
        number: attempt.card.number,
        expiryMonth: attempt.card.expiryMonth,
        expiryYear: attempt.card.expiryYear,
        ccv: attempt.card.ccv,
        holderCpf: attempt.card.holderCpf ?? sub.holderCpf,
        holderEmail: sub.holderEmail,
        holderPhone: sub.holderPhone,
        holderPostalCode: attempt.card.holderPostalCode,
        holderAddressNumber: attempt.card.holderAddressNumber,
      }
    } else if (attempt.useSavedCard && sub.cardToken && sub.gatewayProvider === gateway.provider) {
      cardToken = sub.cardToken
    } else {
      return refuse(charge, gateway.provider, attempt, 'Sem cartão salvo para a cobrança recorrente', now)
    }
  }

  let result: GatewayCharge
  try {
    const customerId = await ensureGatewayCustomer(gateway, sub)
    result = await gateway.createCharge({
      customerId,
      method: attempt.method,
      amount: Number(charge.amount),
      // Pix/boleto não aceitam vencimento no passado; a linha guarda a obrigação original.
      dueDate: charge.dueDate < today ? today : charge.dueDate,
      description: charge.description,
      externalReference: charge.id,
      subscriptionId: sub.id,
      card,
      cardToken,
      remoteIp: attempt.remoteIp,
      finePercent: settings.finePercent,
      interestMonthlyPercent: settings.interestMonthlyPercent,
    })
  } catch (error) {
    if (error instanceof CardDeclinedError) {
      return refuse(charge, gateway.provider, attempt, error.message, now)
    }
    return markGatewayFailure(charge, error)
  }

  const [stored] = await db
    .update(clubCharges)
    .set({
      method: attempt.method,
      gatewayProvider: gateway.provider,
      gatewayChargeId: result.id,
      invoiceUrl: result.invoiceUrl,
      pixPayload: result.pix?.payload ?? null,
      pixQrCode: result.pix?.qrCodeBase64 ?? null,
      pixExpiresAt: result.pix?.expiresAt ? new Date(result.pix.expiresAt) : null,
      boletoIdentificationField: result.boleto?.identificationField ?? null,
      boletoBarCode: result.boleto?.barCode ?? null,
      boletoUrl: result.boleto?.url ?? null,
      ...(result.card ? { cardBrand: result.card.brand, cardLast4: result.card.last4 } : {}),
      ...(attempt.method === 'credit_card' ? { attempts: charge.attempts + 1, lastAttemptAt: now } : {}),
      failureReason: null,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(clubCharges.id, charge.id))
    .returning()
  const row = stored ?? charge

  if (result.status === 'paid') {
    await handleGatewayEvent(
      {
        id: syntheticEventId(result.id, 'PAYMENT_CONFIRMED'),
        event: 'PAYMENT_CONFIRMED',
        payment: {
          id: result.id,
          externalReference: charge.id,
          value: result.paidAmount ?? Number(charge.amount),
          billingType: attempt.method,
          creditCard: result.card
            ? {
                creditCardNumber: result.card.last4,
                creditCardBrand: result.card.brand,
                creditCardToken: result.card.token,
              }
            : null,
        },
      },
      {
        source: attempt.source,
        provider: gateway.provider,
        actorUserId: attempt.actorUserId ?? null,
        cardExpiry: cardExpiryOf(attempt.card),
        paidAt: result.paidAt ?? now,
      },
    )
  } else {
    await recordPaymentEvent(db, {
      organizationId: charge.organizationId,
      subscriptionId: charge.subscriptionId,
      chargeId: charge.id,
      type: 'PAYMENT_CREATED',
      source: attempt.source,
      gatewayProvider: gateway.provider,
      message: `Cobrança de ${formatBRL(Number(charge.amount))} criada — ${CLUB_PAYMENT_METHOD_LABELS[attempt.method]}, vence em ${formatDateBR(row.dueDate < today ? today : row.dueDate)}`,
      payload: { gatewayChargeId: result.id, method: attempt.method },
      actorUserId: attempt.actorUserId ?? null,
    })
  }

  return loadCharge(charge.id)
}

/** Recusa de cartão → handler único (`PAYMENT_CREDIT_CARD_CAPTURE_REFUSED`, attempts+1). */
async function refuse(
  charge: ChargeRow,
  provider: PaymentGateway['provider'],
  attempt: PaymentAttempt,
  reason: string,
  now: Date,
): Promise<ChargeRow> {
  const number = attempt.card ? onlyDigits(attempt.card.number) : ''
  if (number) {
    await db
      .update(clubCharges)
      .set({ cardBrand: detectCardBrand(number) ?? 'outra', cardLast4: number.slice(-4), updatedAt: now })
      .where(eq(clubCharges.id, charge.id))
  }
  await handleGatewayEvent(
    {
      id: null,
      event: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
      payment: {
        id: charge.gatewayChargeId,
        externalReference: charge.id,
        value: Number(charge.amount),
        billingType: 'credit_card',
        creditCard: number ? { creditCardNumber: number.slice(-4), creditCardBrand: detectCardBrand(number) ?? 'outra' } : null,
      },
    },
    { source: attempt.source, provider, actorUserId: attempt.actorUserId ?? null, failureReason: reason, now },
  )
  return loadCharge(charge.id)
}

/** Gateway fora/erro inesperado: `failed` com mensagem genérica (a tela oferece nova tentativa). */
async function markGatewayFailure(charge: ChargeRow, error: unknown): Promise<ChargeRow> {
  logger.warn(
    {
      chargeId: charge.id,
      code: error instanceof AppError ? error.code : undefined,
      err: error instanceof Error ? error.message : String(error),
    },
    'Falha ao criar pagamento no gateway',
  )
  const detail = error instanceof AppError && error.status < 500 && error.status !== 401 ? `: ${error.message}` : ''
  const [row] = await db
    .update(clubCharges)
    .set({
      status: 'failed',
      failureReason: `${GATEWAY_UNAVAILABLE_MESSAGE}${detail}`.slice(0, 300),
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(clubCharges.id, charge.id), inArray(clubCharges.status, OPEN_CHARGE_STATUSES)))
    .returning()
  return row ?? loadCharge(charge.id)
}

/**
 * Consulta o gateway e, se ele disser pago/cancelado/estornado diferente do
 * nosso, aplica pelo handler (evento determinístico = sem duplicar).
 */
export async function syncCharge(charge: ChargeRow, source: PaymentEventSource, now = new Date()): Promise<boolean> {
  if (!charge.gatewayChargeId) return false
  const gateway = await getGatewayFor(charge.organizationId, charge.gatewayProvider)
  const remote = await gateway.getCharge(charge.gatewayChargeId)
  await db.update(clubCharges).set({ lastSyncedAt: now }).where(eq(clubCharges.id, charge.id))

  const event =
    remote.status === 'paid' && isOpenCharge(charge.status)
      ? 'PAYMENT_RECEIVED'
      : remote.status === 'refunded' && charge.status === 'paid'
        ? 'PAYMENT_REFUNDED'
        : remote.status === 'canceled' && isOpenCharge(charge.status)
          ? 'PAYMENT_DELETED'
          : null
  if (!event) return false

  const outcome = await handleGatewayEvent(
    {
      id: syntheticEventId(charge.gatewayChargeId, event),
      event,
      payment: {
        id: charge.gatewayChargeId,
        externalReference: charge.id,
        value: remote.paidAmount ?? Number(charge.amount),
        billingType: charge.method,
        creditCard: remote.card
          ? { creditCardNumber: remote.card.last4, creditCardBrand: remote.card.brand, creditCardToken: remote.card.token }
          : null,
      },
    },
    { source, provider: charge.gatewayProvider, paidAt: remote.paidAt, now },
  )
  return outcome.status === 'applied'
}

/** Sincroniza no máximo 1× a cada `minIntervalMs` (polling da tela de resultado). */
export async function syncChargeIfStale(charge: ChargeRow, minIntervalMs: number, source: PaymentEventSource): Promise<boolean> {
  if (!charge.gatewayChargeId || !isOpenCharge(charge.status)) return false
  if (charge.lastSyncedAt && Date.now() - charge.lastSyncedAt.getTime() < minIntervalMs) return false
  try {
    return await syncCharge(charge, source)
  } catch (error) {
    logger.warn(
      { chargeId: charge.id, err: error instanceof Error ? error.message : String(error) },
      'Falha ao sincronizar cobrança com o gateway',
    )
    return false
  }
}

/** "Simular pagamento" disponível para esta cobrança? Nunca em produção. */
export async function canSimulateCharge(charge: ChargeRow): Promise<boolean> {
  if (!demoToolsAllowed) return false
  if (!isOpenCharge(charge.status) || !charge.gatewayChargeId || charge.method === 'credit_card') return false
  try {
    const gateway = await getGatewayFor(charge.organizationId, charge.gatewayProvider)
    return gateway.canSimulate
  } catch {
    return false
  }
}

export const chargesService = {
  submit: submitChargeToGateway,
  sync: syncCharge,
  syncIfStale: syncChargeIfStale,
  canSimulate: canSimulateCharge,

  /**
   * Nova tentativa / troca de método na MESMA linha: sincroniza antes (o
   * Pix antigo pode ter sido pago), cancela o pagamento anterior no gateway,
   * limpa os dados e cria de novo.
   */
  async pay(
    charge: ChargeRow,
    input: RetryPaymentInput,
    opts: { source: PaymentEventSource; remoteIp?: string; actorUserId?: string | null },
  ): Promise<ChargeRow> {
    return withChargeLock(charge.id, async () => {
      const settings = await loadBillingSettings(charge.organizationId)
      if (!settings.enabledMethods.includes(input.method)) {
        throw AppError.businessRule(`${CLUB_PAYMENT_METHOD_LABELS[input.method]} não está disponível para este clube`)
      }
      // Antes de qualquer efeito colateral: o cartão de aprovação da sandbox
      // (`4444…`) só passa com gateway de teste — mesma regra do checkout.
      if (input.card) {
        const gateway = await getPaymentGateway(charge.organizationId)
        const issue = cardNumberIssue(input.card.number, { allowSandboxCard: gateway.sandbox || gateway.canSimulate })
        if (issue) throw AppError.validation([{ path: 'card.number', message: issue }])
      }

      if (charge.gatewayChargeId && isOpenCharge(charge.status)) {
        await syncChargeIfStale(charge, 0, opts.source)
        charge = await loadCharge(charge.id)
      }
      if (!isOpenCharge(charge.status)) {
        throw AppError.businessRule(charge.status === 'paid' ? 'Esta cobrança já está paga' : 'Esta cobrança não está em aberto')
      }

      if (charge.gatewayChargeId && charge.method !== 'credit_card') await cancelAtGateway(charge)

      const now = new Date()
      const [reset] = await db
        .update(clubCharges)
        .set({
          method: input.method,
          status: 'pending',
          gatewayChargeId: null,
          invoiceUrl: null,
          pixPayload: null,
          pixQrCode: null,
          pixExpiresAt: null,
          boletoIdentificationField: null,
          boletoBarCode: null,
          boletoUrl: null,
          ...(input.method !== 'credit_card' ? { cardBrand: null, cardLast4: null } : {}),
          updatedAt: now,
        })
        .where(and(eq(clubCharges.id, charge.id), inArray(clubCharges.status, OPEN_CHARGE_STATUSES)))
        .returning()
      if (!reset) throw AppError.conflict('A cobrança mudou de situação; atualize a tela')

      // Mensalidade paga de outro jeito muda a preferência da assinatura; avulsa não.
      if (charge.kind !== 'one_off') {
        await db
          .update(clubSubscriptions)
          .set({ paymentMethod: input.method, updatedAt: now })
          .where(eq(clubSubscriptions.id, charge.subscriptionId))
      }

      return submitChargeToGateway(charge.id, {
        method: input.method,
        card: input.card,
        remoteIp: opts.remoteIp,
        source: opts.source,
        actorUserId: opts.actorUserId,
      })
    })
  },

  /** Segunda via (Pix/boleto): novo vencimento, mesmo período. */
  async reissue(
    charge: ChargeRow,
    input: ReissueClubChargeInput,
    opts: { source: PaymentEventSource; actorUserId?: string | null },
  ): Promise<ChargeRow> {
    return withChargeLock(charge.id, async () => {
      if (charge.status !== 'pending' && charge.status !== 'overdue') {
        throw AppError.businessRule('Segunda via só para cobrança em aberto ou vencida')
      }
      const method = input.method ?? charge.method
      if (method === 'credit_card') {
        throw AppError.businessRule('Cobrança no cartão não tem segunda via: use "pagar" com outro cartão ou método')
      }
      const settings = await loadBillingSettings(charge.organizationId)
      if (!settings.enabledMethods.includes(method)) {
        throw AppError.businessRule(`${CLUB_PAYMENT_METHOD_LABELS[method]} não está disponível para este clube`)
      }
      const today = todaySP()
      const dueDate = input.dueDate ?? addDays(today, settings.boletoDueDays)
      if (dueDate < today) throw AppError.validation([{ path: 'dueDate', message: 'O vencimento não pode estar no passado' }])

      if (charge.gatewayChargeId) {
        await syncChargeIfStale(charge, 0, opts.source)
        charge = await loadCharge(charge.id)
        if (!isOpenCharge(charge.status)) throw AppError.businessRule('Esta cobrança já foi paga ou encerrada')
      }
      await cancelAtGateway(charge)

      const now = new Date()
      const [reset] = await db
        .update(clubCharges)
        .set({
          method,
          dueDate,
          status: 'pending',
          gatewayChargeId: null,
          invoiceUrl: null,
          pixPayload: null,
          pixQrCode: null,
          pixExpiresAt: null,
          boletoIdentificationField: null,
          boletoBarCode: null,
          boletoUrl: null,
          cardBrand: null,
          cardLast4: null,
          reminderSentAt: null,
          updatedAt: now,
        })
        .where(and(eq(clubCharges.id, charge.id), inArray(clubCharges.status, ['pending', 'overdue'])))
        .returning()
      if (!reset) throw AppError.conflict('A cobrança mudou de situação; atualize a tela')

      await recordPaymentEvent(db, {
        organizationId: charge.organizationId,
        subscriptionId: charge.subscriptionId,
        chargeId: charge.id,
        type: 'CHARGE_REISSUED',
        source: opts.source,
        gatewayProvider: charge.gatewayProvider,
        message: `Segunda via emitida — ${CLUB_PAYMENT_METHOD_LABELS[method]}, vence em ${formatDateBR(dueDate)}`,
        actorUserId: opts.actorUserId ?? null,
      })

      return submitChargeToGateway(charge.id, { method, source: opts.source, actorUserId: opts.actorUserId })
    })
  },

  /** Baixa manual: Asaas `receiveInCash` quando houver pagamento lá; depois o handler. */
  async manualPayment(charge: ChargeRow, input: ManualPaymentInput, actorUserId: string | null): Promise<ChargeRow> {
    return withChargeLock(charge.id, async () => {
      if (!isOpenCharge(charge.status)) throw AppError.businessRule('Só cobrança em aberto recebe baixa manual')
      const today = todaySP()
      const paidDate = input.paidAt ?? today
      if (paidDate > today) throw AppError.validation([{ path: 'paidAt', message: 'A data do pagamento não pode estar no futuro' }])
      const amount = input.amount ?? Number(charge.amount)

      if (charge.gatewayChargeId && charge.gatewayProvider === 'asaas') {
        const gateway = await getGatewayFor(charge.organizationId, charge.gatewayProvider)
        await gateway.receiveInCash(charge.gatewayChargeId, paidDate, amount)
      }

      await handleGatewayEvent(
        {
          id: null,
          event: 'PAYMENT_RECEIVED',
          payment: { id: charge.gatewayChargeId, externalReference: charge.id, value: amount, billingType: charge.method },
        },
        {
          source: 'manual',
          provider: charge.gatewayProvider,
          actorUserId,
          paidAt: paidDate === today ? new Date() : noonSP(paidDate),
          paidAmount: amount,
        },
      )
      await recordPaymentEvent(db, {
        organizationId: charge.organizationId,
        subscriptionId: charge.subscriptionId,
        chargeId: charge.id,
        type: 'CHARGE_MANUAL_PAYMENT',
        source: 'manual',
        gatewayProvider: charge.gatewayProvider,
        message: `Baixa manual de ${formatBRL(amount)} em ${formatDateBR(paidDate)}${input.note ? ` — ${input.note}` : ''}`,
        payload: input.note ? { note: input.note } : null,
        actorUserId,
      })
      return loadCharge(charge.id)
    })
  },

  /** Cancela cobrança em aberto (gateway best-effort) e reavalia a assinatura. */
  async cancel(
    charge: ChargeRow,
    reason: string | undefined,
    opts: { source: PaymentEventSource; actorUserId?: string | null },
  ): Promise<ChargeRow> {
    if (!isOpenCharge(charge.status)) throw AppError.businessRule('Só cobrança em aberto pode ser cancelada')
    await cancelAtGateway(charge)
    const now = new Date()
    const [updated] = await db
      .update(clubCharges)
      .set({ status: 'canceled', canceledAt: now, updatedAt: now })
      .where(and(eq(clubCharges.id, charge.id), inArray(clubCharges.status, OPEN_CHARGE_STATUSES)))
      .returning()
    if (!updated) throw AppError.conflict('A cobrança mudou de situação; atualize a tela')

    await recordPaymentEvent(db, {
      organizationId: charge.organizationId,
      subscriptionId: charge.subscriptionId,
      chargeId: charge.id,
      type: 'CHARGE_CANCELED',
      source: opts.source,
      gatewayProvider: charge.gatewayProvider,
      message: `Cobrança de ${formatBRL(Number(charge.amount))} cancelada${reason ? `: ${reason}` : ''}`,
      actorUserId: opts.actorUserId ?? null,
    })
    await reactivateIfSettled(
      db,
      { id: charge.subscriptionId, organizationId: charge.organizationId },
      { source: opts.source, provider: charge.gatewayProvider, actorUserId: opts.actorUserId ?? null },
      now,
    )
    return updated
  },

  /** Simulado → `PAYMENT_RECEIVED` (source `simulation`); Asaas sandbox → confirma lá e sincroniza. */
  async simulate(charge: ChargeRow): Promise<ChargeRow> {
    if (!(await canSimulateCharge(charge))) {
      throw AppError.businessRule('Simular pagamento não está disponível para esta cobrança')
    }
    const gatewayChargeId = charge.gatewayChargeId!
    if (charge.gatewayProvider === 'simulated') {
      await handleGatewayEvent(
        {
          id: syntheticEventId(gatewayChargeId, 'PAYMENT_RECEIVED'),
          event: 'PAYMENT_RECEIVED',
          payment: {
            id: gatewayChargeId,
            externalReference: charge.id,
            value: Number(charge.amount),
            billingType: charge.method,
          },
        },
        { source: 'simulation', provider: 'simulated' },
      )
    } else {
      const gateway = await getGatewayFor(charge.organizationId, charge.gatewayProvider)
      await gateway.simulatePayment(gatewayChargeId)
      await syncCharge(await loadCharge(charge.id), 'simulation')
    }
    return loadCharge(charge.id)
  },
}
