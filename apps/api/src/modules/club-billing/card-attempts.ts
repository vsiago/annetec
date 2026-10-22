import { ERROR_CODES } from '@annetec/contracts'
import { and, count, eq, gte } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubSubscriptions, paymentEvents } from '@/db/schema'
import { AppError } from '@/http/errors'
import { logger } from '@/lib/logger'

/**
 * Freio de "card testing" no checkout PÚBLICO do clube: conta as recusas de
 * cartão já gravadas em `payment_events` (persistente — sobrevive a restart e
 * vale para qualquer IP) nas últimas 24 h, por assinatura e por CPF do titular
 * no inquilino. Passou do teto → 429 antes de falar com o gateway. Pix/boleto
 * não são afetados.
 *
 * Só conta `source = 'checkout'` (a recusa síncrona gravada por `refuse()` no
 * checkout público): recusas da recorrência (automação) ou do portal logado
 * não bloqueiam o checkout, e o webhook da mesma recusa não conta em dobro.
 */

export const CARD_ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000
export const MAX_CARD_REFUSALS_PER_SUBSCRIPTION = 3
export const MAX_CARD_REFUSALS_PER_CPF = 5

const REFUSAL_TYPES = ['PAYMENT_CREDIT_CARD_CAPTURE_REFUSED'] as const

export const CARD_ATTEMPTS_BLOCKED_MESSAGE =
  'Por segurança, novas tentativas com cartão estão bloqueadas por 24 horas depois de várias recusas seguidas. ' +
  'Você pode pagar agora com Pix ou boleto (se disponíveis no clube) ou tentar o cartão de novo amanhã.'

export interface CardRefusalCounts {
  /** Recusas na assinatura (`null` = ainda não existe, ex.: 1º checkout). */
  subscription: number | null
  cpf: number
}

/** Regra pura: bloqueia ao atingir o teto em qualquer uma das chaves. */
export function cardAttemptsBlocked(counts: CardRefusalCounts): boolean {
  if (counts.subscription !== null && counts.subscription >= MAX_CARD_REFUSALS_PER_SUBSCRIPTION) return true
  return counts.cpf >= MAX_CARD_REFUSALS_PER_CPF
}

export async function countCardRefusals(input: {
  organizationId: string
  cpf: string
  subscriptionId?: string | null
  now?: Date
}): Promise<CardRefusalCounts> {
  const since = new Date((input.now ?? new Date()).getTime() - CARD_ATTEMPT_WINDOW_MS)
  const recent = and(
    eq(paymentEvents.organizationId, input.organizationId),
    eq(paymentEvents.type, REFUSAL_TYPES[0]),
    eq(paymentEvents.source, 'checkout'),
    gte(paymentEvents.createdAt, since),
  )
  const [bySubscription, byCpf] = await Promise.all([
    input.subscriptionId
      ? db
          .select({ value: count() })
          .from(paymentEvents)
          .where(and(recent, eq(paymentEvents.subscriptionId, input.subscriptionId)))
      : Promise.resolve(null),
    db
      .select({ value: count() })
      .from(paymentEvents)
      .innerJoin(clubSubscriptions, eq(clubSubscriptions.id, paymentEvents.subscriptionId))
      .where(and(recent, eq(clubSubscriptions.organizationId, input.organizationId), eq(clubSubscriptions.holderCpf, input.cpf))),
  ])
  return {
    subscription: bySubscription ? Number(bySubscription[0]?.value ?? 0) : null,
    cpf: Number(byCpf[0]?.value ?? 0),
  }
}

/** 429 `RATE_LIMITED` com mensagem para a tela quando o teto foi atingido. */
export async function assertCardAttemptsAllowed(input: {
  organizationId: string
  cpf: string
  subscriptionId?: string | null
  now?: Date
}): Promise<void> {
  const counts = await countCardRefusals(input)
  if (!cardAttemptsBlocked(counts)) return
  logger.warn(
    { alert: 'card_testing', organizationId: input.organizationId, subscriptionId: input.subscriptionId ?? null, counts },
    'Checkout: tentativas com cartão bloqueadas (recusas demais em 24 h)',
  )
  throw new AppError(ERROR_CODES.RATE_LIMITED, CARD_ATTEMPTS_BLOCKED_MESSAGE)
}
