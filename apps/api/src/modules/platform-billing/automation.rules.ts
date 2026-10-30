import {
  monthlyChargeItems,
  monthlyDiscountPercentFor,
  sumChargeItems,
  type ClubChargeStatus,
  type ClubPaymentMethod,
  type PlatformChargeItem,
  type PlatformSubscriptionStatus,
} from '@annetec/contracts'
import { addDays, addMonthsOnDueDay, dueDayOf, monthLabel } from '@/modules/club-billing/dates'

/**
 * Regras PURAS da régua da plataforma (blueprint da plataforma §0.2/§0.4):
 * sem banco nem relógio implícito — "hoje"/"agora" chegam por parâmetro,
 * então os testes rodam com datas fixas. O serviço filtra no SQL e confirma
 * com estas funções antes de agir. O degrau da inadimplência é o
 * `platformDelinquencyAction` do contracts.
 */

export interface PlatformRuleSettings {
  generateDaysBefore: number
  reminderDaysBefore: number
  restrictAfterDays: number
  suspendAfterDays: number
  cancelAfterDays: number
  maxCardRetries: number
  cardRetryIntervalHours: number
}

/**
 * Próximo ciclo: começa no `nextDueDate`, vence no MESMO dia (cobrança
 * pré-paga: a fatura é emitida `generateDaysBefore` dias antes e vence no 1º
 * dia do período que paga — com `due_day` 10, o período 10/10–10/11 vence em
 * 10/10) e termina +1 mês no `dueDay`. Vencimento antes do início do período
 * não é regra: só aparece por segunda via ou dado montado fora da régua.
 */
export function platformCyclePeriod(nextDueDate: string, dueDay: number) {
  return { periodStart: nextDueDate, periodEnd: addMonthsOnDueDay(nextDueDate, 1, dueDay), dueDate: nextDueDate }
}

/** Início do próximo ciclo a partir de `today`: o `dueDay` deste mês se ainda não passou, senão o do mês seguinte. */
export function nextPlatformCycleStart(today: string, dueDay: number): string {
  const day = Math.min(Math.max(1, Math.trunc(dueDay)), 28)
  const thisMonth = `${today.slice(0, 7)}-${String(day).padStart(2, '0')}`
  return Number(today.slice(8, 10)) < day ? thisMonth : addMonthsOnDueDay(today, 1, day)
}

/** Gera a fatura do ciclo quando o vencimento entra na janela (`active|past_due|restricted`). */
export function shouldGeneratePlatformCycle(
  status: PlatformSubscriptionStatus,
  nextDueDate: string | null,
  today: string,
  settings: Pick<PlatformRuleSettings, 'generateDaysBefore'>,
): boolean {
  if (status !== 'active' && status !== 'past_due' && status !== 'restricted') return false
  return nextDueDate !== null && nextDueDate <= addDays(today, settings.generateDaysBefore)
}

/** Lembrete: `pending`, vence em [hoje, hoje + reminderDaysBefore], ainda não avisado. */
export function isPlatformReminderDue(
  charge: { status: ClubChargeStatus; dueDate: string; reminderSentAt: Date | null },
  today: string,
  settings: Pick<PlatformRuleSettings, 'reminderDaysBefore'>,
): boolean {
  return (
    charge.status === 'pending' &&
    charge.reminderSentAt === null &&
    charge.dueDate >= today &&
    charge.dueDate <= addDays(today, settings.reminderDaysBefore)
  )
}

/** Vence: Pix/boleto `pending` depois do dia; cartão `failed` sem tentativas restantes. */
export function shouldMarkPlatformOverdue(
  charge: { method: ClubPaymentMethod; status: ClubChargeStatus; dueDate: string; attempts: number },
  today: string,
  settings: Pick<PlatformRuleSettings, 'maxCardRetries'>,
): boolean {
  if (charge.dueDate >= today) return false
  if (charge.method === 'credit_card') return charge.status === 'failed' && charge.attempts >= settings.maxCardRetries
  return charge.status === 'pending'
}

/** Hora de (re)tentar o cartão salvo. */
export function isPlatformCardRetryDue(
  charge: {
    method: ClubPaymentMethod
    status: ClubChargeStatus
    dueDate: string
    attempts: number
    lastAttemptAt: Date | null
    gatewayChargeId: string | null
  },
  today: string,
  now: Date,
  settings: Pick<PlatformRuleSettings, 'maxCardRetries' | 'cardRetryIntervalHours'>,
): boolean {
  if (charge.method !== 'credit_card') return false
  if (charge.status !== 'pending' && charge.status !== 'failed') return false
  if (charge.gatewayChargeId) return false
  if (charge.dueDate > today) return false
  if (charge.attempts >= settings.maxCardRetries) return false
  if (!charge.lastAttemptAt) return true
  return now.getTime() - charge.lastAttemptAt.getTime() >= settings.cardRetryIntervalHours * 3_600_000
}

/** Datas dos próximos degraus a partir da fatura vencida mais antiga. */
export function dunningDates(
  oldestOverdueDueDate: string | null,
  settings: Pick<PlatformRuleSettings, 'restrictAfterDays' | 'suspendAfterDays' | 'cancelAfterDays'>,
): { restrictsOn: string | null; suspendsOn: string | null; cancelsOn: string | null } {
  if (!oldestOverdueDueDate) return { restrictsOn: null, suspendsOn: null, cancelsOn: null }
  return {
    restrictsOn: addDays(oldestOverdueDueDate, settings.restrictAfterDays),
    suspendsOn: addDays(oldestOverdueDueDate, settings.suspendAfterDays),
    cancelsOn: addDays(oldestOverdueDueDate, settings.cancelAfterDays),
  }
}

/** Janela da receita do clube para o split: [periodStart − 1 mês, periodStart) em SP. */
export function clubRevenueWindow(periodStart: string): { from: Date; to: Date } {
  const start = addMonthsOnDueDay(periodStart, -1, Math.min(dueDayOf(periodStart), 28))
  return { from: new Date(`${start}T00:00:00-03:00`), to: new Date(`${periodStart}T00:00:00-03:00`) }
}

export interface MonthlyChargeInput {
  planName: string
  planPriceMonthly: number
  memberLimit: number
  pricePerExtraLife: number
  revenueSharePercent: number
  /** Desconto da mensalidade da venda (`percent` 0 = sem; `until` nulo = permanente). */
  monthlyDiscount?: { percent: number; until: string | null } | null
}

/**
 * Último dia (inclusive) do desconto de `months` mensalidades para uma
 * assinatura que começou em `startDate`: a 1ª mensalidade é a da ativação e o
 * k-ésimo período começa em `startDate + (k−1) meses` no `dueDay`; o desconto
 * cobre os períodos que COMEÇAM até o dia anterior ao período `months + 1`.
 * `null` (permanente) quando `months` é nulo.
 */
export function monthlyDiscountUntilFor(startDate: string, months: number | null, dueDay: number): string | null {
  if (months === null) return null
  return addDays(addMonthsOnDueDay(startDate, Math.max(1, Math.trunc(months)), dueDay), -1)
}

/**
 * Itens e total da fatura mensal (mensalidade + excedente por vida + split +
 * ajustes pendentes) — a MESMA cotação do contracts usada na contratação.
 */
export function buildMonthlyCharge(
  sub: MonthlyChargeInput,
  input: { lives: number; clubRevenue: number; periodStart: string; adjustments?: PlatformChargeItem[] },
): { items: PlatformChargeItem[]; amount: number } {
  const items = monthlyChargeItems(sub, {
    lives: input.lives,
    clubRevenue: sub.revenueSharePercent > 0 ? input.clubRevenue : 0,
    periodLabel: monthLabel(input.periodStart),
    adjustments: input.adjustments ?? [],
    monthlyDiscountPercent: monthlyDiscountPercentFor(sub.monthlyDiscount, input.periodStart),
  })
  return { items, amount: Math.max(0, sumChargeItems(items)) }
}

/** "O tempo passa" N dias: toda data recua N dias. */
export function shiftDateBack(date: string | null, days: number): string | null {
  return date ? addDays(date, -days) : null
}

export function shiftInstantBack(instant: Date | null, days: number): Date | null {
  return instant ? new Date(instant.getTime() - days * 86_400_000) : null
}
