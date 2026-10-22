import type { ClubChargeStatus, ClubPaymentMethod, ClubSubscriptionStatus } from '@annetec/contracts'
import { addDays, addMonthsOnDueDay, diffDays } from './dates'

/**
 * Regras PURAS da automação (blueprint §0.7) — sem banco nem relógio
 * implícito: recebem "hoje"/"agora" por parâmetro, então os testes rodam com
 * datas fixas. O `automation.service` filtra no SQL e confirma com estas
 * funções antes de agir.
 */

export const ABANDONED_CHECKOUT_DAYS = 7

export interface RuleSettings {
  generateDaysBefore: number
  reminderDaysBefore: number
  maxCardRetries: number
  cardRetryIntervalHours: number
  suspendAfterDays: number
  cancelAfterDays: number
}

/** Período do próximo ciclo: começa no `nextDueDate`, vence no mesmo dia, termina +1 mês no `dueDay`. */
export function cyclePeriod(nextDueDate: string, dueDay: number) {
  return { periodStart: nextDueDate, periodEnd: addMonthsOnDueDay(nextDueDate, 1, dueDay), dueDate: nextDueDate }
}

/** Gera a cobrança do ciclo quando o vencimento entra na janela de `generateDaysBefore`. */
export function shouldGenerateCycle(
  status: ClubSubscriptionStatus,
  nextDueDate: string | null,
  today: string,
  settings: Pick<RuleSettings, 'generateDaysBefore'>,
): boolean {
  if (status !== 'active' && status !== 'past_due') return false
  return nextDueDate !== null && nextDueDate <= addDays(today, settings.generateDaysBefore)
}

/** Checkout abandonado: a cobrança mais recente venceu há mais de 7 dias sem pagamento. */
export function isAbandonedCheckout(lastDueDate: string, today: string): boolean {
  return lastDueDate < addDays(today, -ABANDONED_CHECKOUT_DAYS)
}

export interface CardChargeState {
  method: ClubPaymentMethod
  status: ClubChargeStatus
  dueDate: string
  attempts: number
  lastAttemptAt: Date | null
  gatewayChargeId: string | null
}

/** Hora de (re)tentar o cartão salvo. */
export function isCardRetryDue(
  charge: CardChargeState,
  today: string,
  now: Date,
  settings: Pick<RuleSettings, 'maxCardRetries' | 'cardRetryIntervalHours'>,
): boolean {
  if (charge.method !== 'credit_card') return false
  if (charge.status !== 'pending' && charge.status !== 'failed') return false
  if (charge.gatewayChargeId) return false
  if (charge.dueDate > today) return false
  if (charge.attempts >= settings.maxCardRetries) return false
  if (!charge.lastAttemptAt) return true
  return now.getTime() - charge.lastAttemptAt.getTime() >= settings.cardRetryIntervalHours * 3_600_000
}

/** Lembrete: em aberto, vence entre hoje e hoje + `reminderDaysBefore`, ainda não avisado. */
export function isReminderDue(
  charge: { status: ClubChargeStatus; dueDate: string; reminderSentAt: Date | null },
  today: string,
  settings: Pick<RuleSettings, 'reminderDaysBefore'>,
): boolean {
  return (
    charge.status === 'pending' &&
    charge.reminderSentAt === null &&
    charge.dueDate >= today &&
    charge.dueDate <= addDays(today, settings.reminderDaysBefore)
  )
}

/** Vira `overdue`: Pix/boleto pendente depois do vencimento; cartão recusado sem tentativas restantes. */
export function shouldMarkOverdue(
  charge: { method: ClubPaymentMethod; status: ClubChargeStatus; dueDate: string; attempts: number },
  today: string,
  settings: Pick<RuleSettings, 'maxCardRetries'>,
): boolean {
  if (charge.dueDate >= today) return false
  if (charge.method === 'credit_card') return charge.status === 'failed' && charge.attempts >= settings.maxCardRetries
  return charge.status === 'pending'
}

/** Inadimplência pela cobrança aberta mais antiga: cancelar tem precedência sobre suspender. */
export function delinquencyAction(
  status: ClubSubscriptionStatus,
  oldestOpenDueDate: string | null,
  today: string,
  settings: Pick<RuleSettings, 'suspendAfterDays' | 'cancelAfterDays'>,
): 'cancel' | 'suspend' | null {
  if ((status !== 'past_due' && status !== 'suspended') || !oldestOpenDueDate) return null
  const daysLate = diffDays(today, oldestOpenDueDate)
  if (daysLate >= settings.cancelAfterDays) return 'cancel'
  if (status === 'past_due' && daysLate >= settings.suspendAfterDays) return 'suspend'
  return null
}
