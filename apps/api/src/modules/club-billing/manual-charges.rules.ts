import {
  CLUB_SUBSCRIPTION_STATUS_LABELS,
  ONE_OFF_CHARGE_LIMITS,
  formatDateBR,
  type ClubCardInfo,
  type ClubChargeStatus,
  type ClubPaymentMethod,
  type ClubSubscriptionStatus,
  type ManualChargeOutcome,
  type PaymentGatewayProvider,
} from '@annetec/contracts'
import { addDays } from './dates'
import { asCardBrand } from './presenter'

/**
 * Regras PURAS do "Gerar cobrança" do admin (adiantar mensalidade / avulsa).
 * Sem banco nem relógio implícito — "hoje" chega por parâmetro.
 */

/** Só assinatura viva e cobrável recebe cobrança gerada pelo admin. */
export const MANUAL_CHARGE_STATUSES: readonly ClubSubscriptionStatus[] = ['active', 'past_due']

/** Motivo de a assinatura NÃO aceitar cobrança gerada pelo admin, ou `null`. */
export function manualChargeIneligibility(status: ClubSubscriptionStatus): string | null {
  if (MANUAL_CHARGE_STATUSES.includes(status)) return null
  return `Só assinaturas ativas ou em atraso recebem cobrança gerada pelo clube (esta está ${CLUB_SUBSCRIPTION_STATUS_LABELS[status].toLowerCase()})`
}

/** Janela do vencimento da avulsa: hoje até hoje + 60; sugestão = hoje + prazo do boleto. */
export function oneOffDueWindow(today: string, boletoDueDays: number) {
  const max = addDays(today, ONE_OFF_CHARGE_LIMITS.dueMaxDays)
  const suggested = addDays(today, Math.min(Math.max(0, boletoDueDays), ONE_OFF_CHARGE_LIMITS.dueMaxDays))
  return { min: today, max, suggested }
}

export function oneOffDueDateIssue(dueDate: string, today: string): string | null {
  if (dueDate < today) return 'O vencimento não pode estar no passado'
  if (dueDate > addDays(today, ONE_OFF_CHARGE_LIMITS.dueMaxDays)) {
    return `O vencimento pode ser no máximo ${ONE_OFF_CHARGE_LIMITS.dueMaxDays} dias a partir de hoje`
  }
  return null
}

/**
 * Cartão salvo que dá para cobrar agora: token gravado E do mesmo gateway em
 * uso (token do simulado não vale no Asaas e vice-versa — mesma regra do
 * `submitChargeToGateway`).
 */
export function usableSavedCard(
  sub: { cardToken: string | null; cardBrand: string | null; cardLast4: string | null; cardExpiry: string | null; gatewayProvider: PaymentGatewayProvider },
  provider: PaymentGatewayProvider,
): ClubCardInfo | null {
  if (!sub.cardToken || sub.gatewayProvider !== provider) return null
  if (!sub.cardLast4 || !/^\d{4}$/.test(sub.cardLast4)) return null
  return { brand: asCardBrand(sub.cardBrand), last4: sub.cardLast4, expiry: sub.cardExpiry }
}

/** "A próxima mensalidade (vence 10/11) já foi gerada". */
export function advanceAlreadyGeneratedMessage(dueDate: string): string {
  return `A próxima mensalidade (vence ${formatDateBR(dueDate).slice(0, 5)}) já foi gerada`
}

/** Resultado do "Gerar cobrança" a partir da cobrança depois do envio ao gateway. */
export function manualChargeOutcomeOf(
  charge: { status: ClubChargeStatus; method: ClubPaymentMethod; failureReason: string | null },
  chargedSavedCard: boolean,
): { outcome: ManualChargeOutcome; message: string | null } {
  if (chargedSavedCard) {
    return charge.status === 'paid'
      ? { outcome: 'card_approved', message: null }
      : { outcome: 'card_declined', message: charge.failureReason ?? 'Cartão recusado' }
  }
  if (charge.status === 'failed') {
    return { outcome: 'gateway_failed', message: charge.failureReason ?? 'O processador de pagamento não emitiu a cobrança' }
  }
  return { outcome: 'created', message: null }
}
