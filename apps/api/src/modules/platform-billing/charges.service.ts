import {
  CLUB_PAYMENT_METHOD_LABELS,
  cardNumberIssue,
  detectCardBrand,
  formatBRL,
  formatDateBR,
  onlyDigits,
  type CancelPlatformChargeInput,
  type CheckoutCardInput,
  type ClubPaymentMethod,
  type PayPlatformChargeInput,
  type PlatformEventSource,
  type PlatformManualPaymentInput,
  type ReissuePlatformChargeInput,
} from '@annetec/contracts'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { demoToolsAllowed } from '@/config/env'
import { db } from '@/db/client'
import { platformCharges, platformSubscriptions } from '@/db/schema'
import { AppError } from '@/http/errors'
import {
  CardDeclinedError,
  GATEWAY_UNAVAILABLE_MESSAGE,
  type GatewayCardInput,
  type GatewayCharge,
  type PaymentGateway,
} from '@/integrations/payments/gateway'
import { logger } from '@/lib/logger'
import { addDays, noonSP, todaySP } from '@/modules/club-billing/dates'
import { platformReference } from './access-key'
import {
  handlePlatformGatewayEvent,
  newEffects,
  platformSyntheticEventId,
  reactivatePlatformIfSettled,
  recordPlatformEvent,
  runEffects,
} from './events.service'
import { platformGatewayFor, type PlatformGatewayMode } from './gateway'
import { isOpenPlatformCharge, OPEN_PLATFORM_CHARGE_STATUSES, type PlatformChargeRow, type PlatformSubscriptionRow } from './presenter'
import { loadPlatformCharge, proposalBasics, proposalDisplayName } from './queries'
import { currentPlatformProvider, loadPlatformSettings } from './settings.service'

/**
 * Faturas da plataforma no gateway (espelho de `club-billing/charges.service`,
 * sem importar serviços com estado de lá). Recusa ou gateway fora NUNCA
 * lançam para quem chama: a fatura vira `failed` com o motivo e a tela
 * oferece nova tentativa.
 */

export interface PlatformPaymentAttempt {
  method: ClubPaymentMethod
  card?: CheckoutCardInput
  /** Recorrência: cobra o token salvo na assinatura. */
  useSavedCard?: boolean
  remoteIp?: string
  source: PlatformEventSource
  actorUserId?: string | null
  /** `interactive` = Pix/boleto simulados compensam sozinhos (alguém está pagando agora). */
  mode?: PlatformGatewayMode
  /**
   * Gateway explícito (migração de gateway). Padrão: o efetivo para cobranças
   * novas (`currentPlatformProvider`).
   */
  gateway?: PaymentGateway
  /**
   * Vencimento enviado ao gateway quando difere do da linha (ex.: segunda via
   * de fatura vencida na migração). A linha continua com a obrigação original.
   */
  gatewayDueDate?: string
}

const inFlight = new Set<string>()

export async function withPlatformChargeLock<T>(chargeId: string, work: () => Promise<T>): Promise<T> {
  if (inFlight.has(chargeId)) {
    throw AppError.conflict('Já existe um pagamento em processamento para esta fatura. Aguarde alguns segundos.')
  }
  inFlight.add(chargeId)
  try {
    return await work()
  } finally {
    inFlight.delete(chargeId)
  }
}

interface Payer {
  name: string
  /** CNPJ, só dígitos. */
  document: string
  email: string
  phone: string | null
  externalReference: string
  subscription: PlatformSubscriptionRow | null
}

/** Pagador: financeiro da assinatura ou, na ativação, a empresa da proposta. */
async function payerOf(charge: PlatformChargeRow): Promise<Payer> {
  if (charge.subscriptionId) {
    const [sub] = await db.select().from(platformSubscriptions).where(eq(platformSubscriptions.id, charge.subscriptionId)).limit(1)
    if (sub) {
      return {
        name: sub.billingName,
        document: sub.billingDocument,
        email: sub.billingEmail,
        phone: null,
        externalReference: sub.organizationId,
        subscription: sub,
      }
    }
  }
  if (charge.proposalId) {
    const proposal = await proposalBasics(charge.proposalId)
    if (proposal) {
      return {
        name: proposal.company?.legalName || proposal.legalName || proposalDisplayName(proposal),
        document: onlyDigits(proposal.cnpj),
        email: proposal.company?.email || proposal.applicant.email,
        phone: proposal.company?.phone || proposal.applicant.phone || null,
        externalReference: charge.organizationId ?? proposal.id,
        subscription: null,
      }
    }
  }
  throw AppError.businessRule('Fatura sem assinatura nem proposta vinculada')
}

async function ensureCustomer(gateway: PaymentGateway, payer: Payer): Promise<string> {
  const sub = payer.subscription
  if (sub && sub.gatewayProvider === gateway.provider && sub.gatewayCustomerId) return sub.gatewayCustomerId
  const customerId = await gateway.ensureCustomer({
    name: payer.name,
    cpf: payer.document,
    email: payer.email,
    phone: payer.phone,
    externalReference: payer.externalReference,
  })
  if (sub) {
    await db
      .update(platformSubscriptions)
      .set({ gatewayProvider: gateway.provider, gatewayCustomerId: customerId, updatedAt: new Date() })
      .where(eq(platformSubscriptions.id, sub.id))
  }
  return customerId
}

function cardExpiryOf(card: CheckoutCardInput | undefined): string | null {
  return card ? `${String(card.expiryMonth).padStart(2, '0')}/${card.expiryYear}` : null
}

/**
 * Cria o pagamento no gateway para uma fatura JÁ gravada e aplica o
 * resultado (pago na hora → handler; senão `PAYMENT_CREATED`).
 */
export async function submitPlatformChargeToGateway(chargeId: string, attempt: PlatformPaymentAttempt): Promise<PlatformChargeRow> {
  const charge = await loadPlatformCharge(chargeId)
  const settings = await loadPlatformSettings()
  const now = new Date()
  const today = todaySP(now)

  let gateway: PaymentGateway
  let payer: Payer
  try {
    gateway = attempt.gateway ?? platformGatewayFor(currentPlatformProvider(settings), attempt.mode ?? 'passive')
    payer = await payerOf(charge)
  } catch (error) {
    return markGatewayFailure(charge, error, false)
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
        // Cartão sem CPF do dono → CNPJ do pagador (o Asaas aceita).
        holderCpf: attempt.card.holderCpf ?? payer.document,
        holderEmail: payer.email,
        holderPhone: payer.phone,
        holderPostalCode: attempt.card.holderPostalCode,
        holderAddressNumber: attempt.card.holderAddressNumber,
      }
    } else if (attempt.useSavedCard && payer.subscription?.cardToken && payer.subscription.gatewayProvider === gateway.provider) {
      cardToken = payer.subscription.cardToken
    } else {
      return refuse(charge, gateway.provider, attempt, 'Sem cartão salvo para a cobrança recorrente', now)
    }
  }

  // Pix/boleto não aceitam vencimento no passado; a linha guarda a obrigação original.
  const gatewayDue = attempt.gatewayDueDate && attempt.gatewayDueDate >= today ? attempt.gatewayDueDate : charge.dueDate < today ? today : charge.dueDate

  // Cliente no gateway FORA da tentativa contada: falha aqui não cobrou cartão
  // nenhum, então não gasta `maxCardRetries`.
  let customerId: string
  try {
    customerId = await ensureCustomer(gateway, payer)
  } catch (error) {
    return markGatewayFailure(charge, error, false)
  }

  // Já houve tentativa nesta fatura (inclusive processo derrubado no meio):
  // confere no gateway antes de cobrar o cartão de novo.
  const reuseExistingCardPayment = attempt.method === 'credit_card' && (charge.attempts > 0 || charge.lastAttemptAt !== null)
  if (attempt.method === 'credit_card') await stampCardAttempt(charge.id, now)

  let result: GatewayCharge
  try {
    result = await gateway.createCharge({
      customerId,
      method: attempt.method,
      amount: Number(charge.amount),
      dueDate: gatewayDue,
      description: charge.description,
      externalReference: platformReference(charge.id),
      // O simulado só monta o link do boleto quando recebe este campo.
      subscriptionId: charge.id,
      card,
      cardToken,
      remoteIp: attempt.remoteIp,
      finePercent: settings.finePercent,
      interestMonthlyPercent: settings.interestMonthlyPercent,
      reuseExistingCardPayment,
    })
  } catch (error) {
    if (error instanceof CardDeclinedError) return refuse(charge, gateway.provider, attempt, error.message, now)
    return markGatewayFailure(charge, error, attempt.method === 'credit_card')
  }

  await db
    .update(platformCharges)
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
    .where(eq(platformCharges.id, charge.id))

  if (result.status === 'paid') {
    await handlePlatformGatewayEvent(
      {
        id: platformSyntheticEventId(result.id, 'PAYMENT_CONFIRMED'),
        event: 'PAYMENT_CONFIRMED',
        payment: {
          id: result.id,
          externalReference: platformReference(charge.id),
          value: result.paidAmount ?? Number(charge.amount),
          billingType: attempt.method,
          creditCard: result.card
            ? { creditCardNumber: result.card.last4, creditCardBrand: result.card.brand, creditCardToken: result.card.token }
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
    const due = gatewayDue
    await recordPlatformEvent(db, {
      organizationId: charge.organizationId,
      subscriptionId: charge.subscriptionId,
      chargeId: charge.id,
      proposalId: charge.proposalId,
      type: 'PAYMENT_CREATED',
      source: attempt.source,
      gatewayProvider: gateway.provider,
      message: `Fatura de ${formatBRL(Number(charge.amount))} registrada no gateway — ${CLUB_PAYMENT_METHOD_LABELS[attempt.method]}, vence em ${formatDateBR(due)}`,
      payload: { gatewayChargeId: result.id, method: attempt.method },
      actorUserId: attempt.actorUserId ?? null,
    })
  }
  return loadPlatformCharge(charge.id)
}

/**
 * Marca `lastAttemptAt` ANTES de mandar o cartão ao gateway: se o processo
 * morrer entre a resposta e a gravação do resultado, a próxima tentativa passa
 * pelo `reuseExistingCardPayment` em vez de cobrar de novo. `attempts` não
 * muda aqui (aprovação, recusa e falha contam como antes).
 */
async function stampCardAttempt(chargeId: string, now: Date): Promise<void> {
  await db.update(platformCharges).set({ lastAttemptAt: now, updatedAt: now }).where(eq(platformCharges.id, chargeId))
}

async function refuse(
  charge: PlatformChargeRow,
  provider: PaymentGateway['provider'],
  attempt: PlatformPaymentAttempt,
  reason: string,
  now: Date,
): Promise<PlatformChargeRow> {
  const number = attempt.card ? onlyDigits(attempt.card.number) : ''
  if (number) {
    await db
      .update(platformCharges)
      .set({ cardBrand: detectCardBrand(number) ?? 'outra', cardLast4: number.slice(-4), updatedAt: now })
      .where(eq(platformCharges.id, charge.id))
  }
  await handlePlatformGatewayEvent(
    {
      id: null,
      event: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
      payment: {
        id: charge.gatewayChargeId,
        externalReference: platformReference(charge.id),
        value: Number(charge.amount),
        billingType: 'credit_card',
        creditCard: number ? { creditCardNumber: number.slice(-4), creditCardBrand: detectCardBrand(number) ?? 'outra' } : null,
      },
    },
    { source: attempt.source, provider, actorUserId: attempt.actorUserId ?? null, failureReason: reason, now },
  )
  return loadPlatformCharge(charge.id)
}

/** `countAttempt`: cartão enviado ao gateway sem resposta conclusiva conta como tentativa (ver o do clube). */
async function markGatewayFailure(charge: PlatformChargeRow, error: unknown, countAttempt: boolean): Promise<PlatformChargeRow> {
  logger.warn(
    {
      chargeId: charge.id,
      code: error instanceof AppError ? error.code : undefined,
      err: error instanceof Error ? error.message : String(error),
    },
    'Falha ao criar pagamento da plataforma no gateway',
  )
  const detail = error instanceof AppError && error.status < 500 && error.status !== 401 ? `: ${error.message}` : ''
  const [row] = await db
    .update(platformCharges)
    .set({
      status: 'failed',
      failureReason: `${GATEWAY_UNAVAILABLE_MESSAGE}${detail}`.slice(0, 300),
      ...(countAttempt ? { attempts: sql`${platformCharges.attempts} + 1` } : {}),
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(platformCharges.id, charge.id), inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES)))
    .returning()
  return row ?? loadPlatformCharge(charge.id)
}

/** Consulta o gateway; pago/estornado/cancelado lá → handler (evento determinístico). */
export async function syncPlatformCharge(charge: PlatformChargeRow, source: PlatformEventSource, now = new Date()): Promise<boolean> {
  if (!charge.gatewayChargeId) return false
  const gateway = platformGatewayFor(charge.gatewayProvider)
  const remote = await gateway.getCharge(charge.gatewayChargeId)
  await db.update(platformCharges).set({ lastSyncedAt: now }).where(eq(platformCharges.id, charge.id))

  const event =
    remote.status === 'paid' && isOpenPlatformCharge(charge.status)
      ? 'PAYMENT_RECEIVED'
      : remote.status === 'refunded' && charge.status === 'paid'
        ? 'PAYMENT_REFUNDED'
        : remote.status === 'canceled' && isOpenPlatformCharge(charge.status)
          ? 'PAYMENT_DELETED'
          : null
  if (!event) return false

  const outcome = await handlePlatformGatewayEvent(
    {
      id: platformSyntheticEventId(charge.gatewayChargeId, event),
      event,
      payment: {
        id: charge.gatewayChargeId,
        externalReference: platformReference(charge.id),
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

/** Sincroniza no máximo 1× a cada `minIntervalMs` (polling da página pública). Nunca lança. */
export async function syncPlatformChargeIfStale(charge: PlatformChargeRow, minIntervalMs: number, source: PlatformEventSource): Promise<boolean> {
  if (!charge.gatewayChargeId || !isOpenPlatformCharge(charge.status)) return false
  if (charge.lastSyncedAt && Date.now() - charge.lastSyncedAt.getTime() < minIntervalMs) return false
  try {
    return await syncPlatformCharge(charge, source)
  } catch (error) {
    logger.warn(
      { chargeId: charge.id, err: error instanceof Error ? error.message : String(error) },
      'Falha ao sincronizar fatura da plataforma com o gateway',
    )
    return false
  }
}

/**
 * "Simular pagamento" disponível (simulado ou Asaas sandbox; nunca cartão;
 * nunca em produção). Aceita a linha do banco ou o DTO `PlatformCharge`.
 */
export function canSimulatePlatformCharge(
  charge: Pick<PlatformChargeRow, 'status' | 'gatewayChargeId' | 'method' | 'gatewayProvider'>,
): boolean {
  if (!demoToolsAllowed) return false
  if (!isOpenPlatformCharge(charge.status) || !charge.gatewayChargeId || charge.method === 'credit_card') return false
  try {
    return platformGatewayFor(charge.gatewayProvider).canSimulate
  } catch {
    return false
  }
}

/** Cancela o pagamento antigo no gateway — best-effort. */
export async function cancelPlatformAtGateway(charge: PlatformChargeRow): Promise<void> {
  if (!charge.gatewayChargeId) return
  try {
    await platformGatewayFor(charge.gatewayProvider).cancelCharge(charge.gatewayChargeId)
  } catch (error) {
    logger.warn(
      { chargeId: charge.id, err: error instanceof Error ? error.message : String(error) },
      'Falha ao cancelar pagamento antigo da plataforma no gateway (seguindo)',
    )
  }
}

/** Fatura em aberto com Pix guardado já expirado (não serve mais para pagar). */
export function isPlatformPixExpired(
  charge: Pick<PlatformChargeRow, 'status' | 'method' | 'pixPayload' | 'pixExpiresAt'>,
  now = new Date(),
): boolean {
  return (
    isOpenPlatformCharge(charge.status) &&
    charge.method === 'pix' &&
    Boolean(charge.pixPayload) &&
    charge.pixExpiresAt !== null &&
    charge.pixExpiresAt.getTime() <= now.getTime()
  )
}

const PIX_REFRESH_INTERVAL_MS = 60_000
const pixRefreshTriedAt = new Map<string, number>()

/**
 * Pix expirado numa fatura em aberto: busca o QR ATUAL do mesmo pagamento no
 * gateway (o Asaas mantém o QR dinâmico válido depois do vencimento, com
 * multa/juros dele) e grava. Sem efeito no gateway; no máx. 1×/min por
 * fatura; nunca lança. Se continuar expirado (ou o gateway não souber — o
 * simulado), a página oferece "Gerar novo Pix" (`pay` com Pix).
 */
export async function refreshPlatformPixIfExpired(charge: PlatformChargeRow, now = new Date()): Promise<PlatformChargeRow> {
  if (!charge.gatewayChargeId || !isPlatformPixExpired(charge, now)) return charge
  const last = pixRefreshTriedAt.get(charge.id)
  if (last && now.getTime() - last < PIX_REFRESH_INTERVAL_MS) return charge
  pixRefreshTriedAt.set(charge.id, now.getTime())
  try {
    const gateway = platformGatewayFor(charge.gatewayProvider)
    const pix = gateway.currentPix ? await gateway.currentPix(charge.gatewayChargeId) : null
    if (!pix?.payload) return charge
    const expiresAt = pix.expiresAt ? new Date(pix.expiresAt) : null
    if (expiresAt && expiresAt.getTime() <= now.getTime()) return charge
    const [row] = await db
      .update(platformCharges)
      .set({ pixPayload: pix.payload, pixQrCode: pix.qrCodeBase64 ?? null, pixExpiresAt: expiresAt, updatedAt: now })
      .where(and(eq(platformCharges.id, charge.id), eq(platformCharges.gatewayChargeId, charge.gatewayChargeId)))
      .returning()
    return row ?? charge
  } catch (error) {
    logger.warn(
      { chargeId: charge.id, err: error instanceof Error ? error.message : String(error) },
      'Falha ao atualizar o Pix expirado da fatura da plataforma',
    )
    return charge
  }
}

const RESET_GATEWAY_FIELDS = {
  gatewayChargeId: null,
  invoiceUrl: null,
  pixPayload: null,
  pixQrCode: null,
  pixExpiresAt: null,
  boletoIdentificationField: null,
  boletoBarCode: null,
  boletoUrl: null,
} as const

export const platformChargesService = {
  submit: submitPlatformChargeToGateway,
  sync: syncPlatformCharge,
  syncIfStale: syncPlatformChargeIfStale,
  canSimulate: canSimulatePlatformCharge,

  /** Página pública: paga com o método escolhido (mesma linha; cancela o pagamento anterior). */
  async pay(
    charge: PlatformChargeRow,
    input: PayPlatformChargeInput,
    opts: { source: PlatformEventSource; remoteIp?: string; actorUserId?: string | null },
  ): Promise<PlatformChargeRow> {
    return withPlatformChargeLock(charge.id, async () => {
      const settings = await loadPlatformSettings()
      if (!settings.enabledMethods.includes(input.method)) {
        throw AppError.businessRule(`${CLUB_PAYMENT_METHOD_LABELS[input.method]} não está disponível para faturas da ANNETEC`)
      }
      // Antes de qualquer efeito colateral: o cartão de aprovação da sandbox
      // (`4444…`) só passa com gateway de teste — mesma regra do checkout do clube.
      if (input.card) {
        const gateway = platformGatewayFor(currentPlatformProvider(settings))
        const issue = cardNumberIssue(input.card.number, { allowSandboxCard: gateway.sandbox || gateway.canSimulate })
        if (issue) throw AppError.validation([{ path: 'card.number', message: issue }])
      }
      if (charge.gatewayChargeId && isOpenPlatformCharge(charge.status)) {
        await syncPlatformChargeIfStale(charge, 0, opts.source)
        charge = await loadPlatformCharge(charge.id)
      }
      if (!isOpenPlatformCharge(charge.status)) {
        throw AppError.businessRule(charge.status === 'paid' ? 'Esta fatura já está paga' : 'Esta fatura não está em aberto')
      }
      if (charge.gatewayChargeId && charge.method !== 'credit_card') await cancelPlatformAtGateway(charge)

      const now = new Date()
      const [reset] = await db
        .update(platformCharges)
        .set({
          method: input.method,
          // Trocar o método (ou gerar Pix novo) não perdoa o atraso: a vencida segue vencida.
          status: charge.dueDate < todaySP(now) ? 'overdue' : 'pending',
          ...RESET_GATEWAY_FIELDS,
          ...(input.method !== 'credit_card' ? { cardBrand: null, cardLast4: null } : {}),
          updatedAt: now,
        })
        .where(and(eq(platformCharges.id, charge.id), inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES)))
        .returning()
      if (!reset) throw AppError.conflict('A fatura mudou de situação; atualize a tela')

      if (charge.subscriptionId) {
        await db
          .update(platformSubscriptions)
          .set({ paymentMethod: input.method, updatedAt: now })
          .where(eq(platformSubscriptions.id, charge.subscriptionId))
      }
      return submitPlatformChargeToGateway(charge.id, {
        method: input.method,
        card: input.card,
        remoteIp: opts.remoteIp,
        source: opts.source,
        actorUserId: opts.actorUserId,
        mode: 'interactive',
      })
    })
  },

  /** Segunda via (Pix/boleto): novo vencimento, mesmo período. */
  async reissue(
    charge: PlatformChargeRow,
    input: ReissuePlatformChargeInput,
    opts: { source: PlatformEventSource; actorUserId?: string | null },
  ): Promise<PlatformChargeRow> {
    return withPlatformChargeLock(charge.id, async () => {
      if (charge.status !== 'pending' && charge.status !== 'overdue') {
        throw AppError.businessRule('Segunda via só para fatura em aberto ou vencida')
      }
      const method = input.method ?? (charge.method === 'credit_card' ? 'pix' : charge.method)
      const settings = await loadPlatformSettings()
      if (!settings.enabledMethods.includes(method)) {
        throw AppError.businessRule(`${CLUB_PAYMENT_METHOD_LABELS[method]} não está disponível para faturas da ANNETEC`)
      }
      const today = todaySP()
      const dueDate = input.dueDate ?? addDays(today, settings.boletoDueDays)
      if (dueDate < today) throw AppError.validation([{ path: 'dueDate', message: 'O vencimento não pode estar no passado' }])

      if (charge.gatewayChargeId) {
        await syncPlatformChargeIfStale(charge, 0, opts.source)
        charge = await loadPlatformCharge(charge.id)
        if (!isOpenPlatformCharge(charge.status)) throw AppError.businessRule('Esta fatura já foi paga ou encerrada')
      }
      await cancelPlatformAtGateway(charge)

      const now = new Date()
      const [reset] = await db
        .update(platformCharges)
        .set({
          method,
          dueDate,
          status: 'pending',
          ...RESET_GATEWAY_FIELDS,
          cardBrand: null,
          cardLast4: null,
          reminderSentAt: null,
          overdueNotifiedAt: null,
          updatedAt: now,
        })
        .where(and(eq(platformCharges.id, charge.id), inArray(platformCharges.status, ['pending', 'overdue'])))
        .returning()
      if (!reset) throw AppError.conflict('A fatura mudou de situação; atualize a tela')

      await recordPlatformEvent(db, {
        organizationId: charge.organizationId,
        subscriptionId: charge.subscriptionId,
        chargeId: charge.id,
        proposalId: charge.proposalId,
        type: 'CHARGE_REISSUED',
        source: opts.source,
        gatewayProvider: charge.gatewayProvider,
        message: `Segunda via emitida — ${CLUB_PAYMENT_METHOD_LABELS[method]}, vence em ${formatDateBR(dueDate)}`,
        actorUserId: opts.actorUserId ?? null,
      })
      return submitPlatformChargeToGateway(charge.id, { method, source: opts.source, actorUserId: opts.actorUserId, mode: 'passive' })
    })
  },

  /** Baixa manual: Asaas `receiveInCash` quando houver pagamento lá; depois o handler. */
  async manualPayment(charge: PlatformChargeRow, input: PlatformManualPaymentInput, actorUserId: string | null): Promise<PlatformChargeRow> {
    return withPlatformChargeLock(charge.id, async () => {
      if (!isOpenPlatformCharge(charge.status)) throw AppError.businessRule('Só fatura em aberto recebe baixa manual')
      const today = todaySP()
      const paidDate = input.paidAt ?? today
      if (paidDate > today) throw AppError.validation([{ path: 'paidAt', message: 'A data do pagamento não pode estar no futuro' }])
      const amount = input.amount ?? Number(charge.amount)

      if (charge.gatewayChargeId && charge.gatewayProvider === 'asaas') {
        await platformGatewayFor('asaas').receiveInCash(charge.gatewayChargeId, paidDate, amount)
      }
      await handlePlatformGatewayEvent(
        {
          id: null,
          event: 'PAYMENT_RECEIVED',
          payment: { id: charge.gatewayChargeId, externalReference: platformReference(charge.id), value: amount, billingType: charge.method },
        },
        {
          source: 'manual',
          provider: charge.gatewayProvider,
          actorUserId,
          paidAt: paidDate === today ? new Date() : noonSP(paidDate),
          paidAmount: amount,
        },
      )
      await recordPlatformEvent(db, {
        organizationId: charge.organizationId,
        subscriptionId: charge.subscriptionId,
        chargeId: charge.id,
        proposalId: charge.proposalId,
        type: 'CHARGE_MANUAL_PAYMENT',
        source: 'manual',
        gatewayProvider: charge.gatewayProvider,
        message: `Baixa manual de ${formatBRL(amount)} em ${formatDateBR(paidDate)}${input.note ? ` — ${input.note}` : ''}`,
        payload: input.note ? { note: input.note } : null,
        actorUserId,
      })
      return loadPlatformCharge(charge.id)
    })
  },

  /** Cancela fatura em aberto (gateway best-effort) e reavalia a assinatura. */
  async cancel(
    charge: PlatformChargeRow,
    input: CancelPlatformChargeInput,
    opts: { source: PlatformEventSource; actorUserId?: string | null },
  ): Promise<PlatformChargeRow> {
    if (!isOpenPlatformCharge(charge.status)) throw AppError.businessRule('Só fatura em aberto pode ser cancelada')
    await cancelPlatformAtGateway(charge)
    const now = new Date()
    const [updated] = await db
      .update(platformCharges)
      .set({ status: 'canceled', canceledAt: now, updatedAt: now })
      .where(and(eq(platformCharges.id, charge.id), inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES)))
      .returning()
    if (!updated) throw AppError.conflict('A fatura mudou de situação; atualize a tela')

    await recordPlatformEvent(db, {
      organizationId: charge.organizationId,
      subscriptionId: charge.subscriptionId,
      chargeId: charge.id,
      proposalId: charge.proposalId,
      type: 'CHARGE_CANCELED',
      source: opts.source,
      gatewayProvider: charge.gatewayProvider,
      message: `Fatura de ${formatBRL(Number(charge.amount))} cancelada${input.reason ? `: ${input.reason}` : ''}`,
      actorUserId: opts.actorUserId ?? null,
    })
    if (charge.subscriptionId) {
      const [sub] = await db.select().from(platformSubscriptions).where(eq(platformSubscriptions.id, charge.subscriptionId)).limit(1)
      if (sub) {
        const effects = newEffects()
        await reactivatePlatformIfSettled(db, sub, { source: opts.source, provider: charge.gatewayProvider, actorUserId: opts.actorUserId ?? null }, now, effects)
        await runEffects(effects, opts.source)
      }
    }
    return updated
  },

  /** Simulado → `PAYMENT_RECEIVED` (source `simulation`); Asaas sandbox → confirma lá e sincroniza. */
  async simulate(charge: PlatformChargeRow, actorUserId: string | null = null): Promise<PlatformChargeRow> {
    if (!canSimulatePlatformCharge(charge)) {
      throw AppError.businessRule('Simular pagamento só está disponível no modo simulado ou no Asaas sandbox, para Pix ou boleto em aberto')
    }
    const gatewayChargeId = charge.gatewayChargeId!
    if (charge.gatewayProvider === 'simulated') {
      await handlePlatformGatewayEvent(
        {
          id: platformSyntheticEventId(gatewayChargeId, 'PAYMENT_RECEIVED'),
          event: 'PAYMENT_RECEIVED',
          payment: {
            id: gatewayChargeId,
            externalReference: platformReference(charge.id),
            value: Number(charge.amount),
            billingType: charge.method,
          },
        },
        { source: 'simulation', provider: 'simulated', actorUserId },
      )
    } else {
      await platformGatewayFor(charge.gatewayProvider).simulatePayment(gatewayChargeId)
      await syncPlatformCharge(await loadPlatformCharge(charge.id), 'simulation')
    }
    return loadPlatformCharge(charge.id)
  },
}
