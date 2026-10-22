import type { ClubChargeStatus, HoldingAlert, HoldingAlertSeverity, HoldingCohortRow } from '@annetec/contracts'
import { addDays, lastMonths, monthOf, toDateSP } from '@/modules/club-billing/dates'

/**
 * Fórmulas PURAS da holding (blueprint da plataforma §0.5). Meses `yyyy-MM`
 * em America/Sao_Paulo; taxas em %, 1 casa; `null` quando o denominador é 0.
 * Sem banco nem relógio implícito: os testes usam datas fixas.
 */

export const round1 = (value: number) => Math.round((value + Number.EPSILON) * 10) / 10
export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/** n ÷ d × 100 com 1 casa; `null` sem denominador. */
export function pct(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null
  return round1((numerator / denominator) * 100)
}

/** (atual − anterior) ÷ anterior × 100; `null` sem base. */
export function growthPct(current: number, previous: number): number | null {
  if (!previous || previous <= 0) return null
  return round1(((current - previous) / previous) * 100)
}

/** Início do mês em SP (UTC−3 fixo desde 2019). */
export function monthStartSP(month: string): Date {
  return new Date(`${month}-01T00:00:00-03:00`)
}

export function nextMonthOf(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function addMonthsTo(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const index = y * 12 + (m - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** Mês (SP) de um instante. */
export function monthOfInstant(instant: Date | null | undefined): string | null {
  return instant ? monthOf(toDateSP(instant)) : null
}

/** Últimos `count` meses terminando no mês de `today` (mais antigo primeiro). */
export function monthsUntil(today: string, count: number): string[] {
  return lastMonths(today, count)
}

// ---------------------------------------------------------------------------
// Vida útil de assinaturas (churn, crescimento, coortes)
// ---------------------------------------------------------------------------

export interface Lifespan {
  startedAt: Date | null
  canceledAt: Date | null
}

/** "Viva" num instante: começou ANTES e não foi cancelada até ele. */
export function isAliveAt(item: Lifespan, instant: Date): boolean {
  if (!item.startedAt || item.startedAt.getTime() >= instant.getTime()) return false
  return !item.canceledAt || item.canceledAt.getTime() >= instant.getTime()
}

export interface ChurnStats {
  aliveAtStart: number
  started: number
  canceled: number
  /** Canceladas no mês ÷ vivas no início × 100. */
  churnRate: number | null
  /** (iniciadas − canceladas) ÷ vivas no início × 100. */
  netGrowthPct: number | null
  /** Vivas no início do mês seguinte. */
  aliveAtEnd: number
}

export function churnStats(items: Lifespan[], month: string): ChurnStats {
  const start = monthStartSP(month)
  const end = monthStartSP(nextMonthOf(month))
  const inMonth = (instant: Date | null) => Boolean(instant && instant.getTime() >= start.getTime() && instant.getTime() < end.getTime())
  let aliveAtStart = 0
  let started = 0
  let canceled = 0
  let aliveAtEnd = 0
  for (const item of items) {
    if (isAliveAt(item, start)) aliveAtStart += 1
    if (isAliveAt(item, end)) aliveAtEnd += 1
    if (inMonth(item.startedAt)) started += 1
    if (inMonth(item.canceledAt)) canceled += 1
  }
  return {
    aliveAtStart,
    started,
    canceled,
    churnRate: pct(canceled, aliveAtStart),
    netGrowthPct: pct(started - canceled, aliveAtStart),
    aliveAtEnd,
  }
}

/**
 * Coortes por mês de início (últimos N meses, mais antiga primeiro).
 * `retention[k]` = % da coorte com (cancelamento nulo OU ≥ fim do mês
 * cohort+k); `null` para mês futuro ou coorte vazia.
 */
export function cohortTable(items: Lifespan[], today: string, months: number): HoldingCohortRow[] {
  const cohorts = monthsUntil(today, months)
  const current = monthOf(today)
  return cohorts.map(cohort => {
    const members = items.filter(item => monthOfInstant(item.startedAt) === cohort)
    const retention: (number | null)[] = []
    for (let k = 0; k < months; k += 1) {
      const target = addMonthsTo(cohort, k)
      if (target > current || members.length === 0) {
        retention.push(null)
        continue
      }
      const endOfTarget = monthStartSP(nextMonthOf(target))
      const retained = members.filter(m => !m.canceledAt || m.canceledAt.getTime() >= endOfTarget.getTime()).length
      retention.push(pct(retained, members.length))
    }
    return { cohort, size: members.length, retention }
  })
}

// ---------------------------------------------------------------------------
// Inadimplência (mesma fórmula do resumo da cobrança da plataforma)
// ---------------------------------------------------------------------------

export interface DelinquencyCharge {
  status: ClubChargeStatus
  amount: number
  dueDate: string
  paidAt?: Date | null
}

/** Vencido em aberto (`overdue|failed`, vencimento < hoje) ÷ faturado com vencimento em [hoje−90, hoje] (≠ cancelada). 0 sem base. */
export function delinquencyOf(
  charges: DelinquencyCharge[],
  today: string,
): { overdueAmount: number; overdueCharges: number; base: number; rate: number } {
  const from = addDays(today, -90)
  let overdueAmount = 0
  let overdueCharges = 0
  let base = 0
  for (const charge of charges) {
    if ((charge.status === 'overdue' || charge.status === 'failed') && charge.dueDate < today) {
      overdueAmount += charge.amount
      overdueCharges += 1
    }
    if (charge.status !== 'canceled' && charge.dueDate >= from && charge.dueDate <= today) base += charge.amount
  }
  return {
    overdueAmount: round2(overdueAmount),
    overdueCharges,
    base: round2(base),
    rate: base > 0 ? round1((overdueAmount / base) * 100) : 0,
  }
}

/**
 * A mesma conta avaliada 30 dias atrás: vencidas antes de hoje−30 e (ainda
 * `overdue|failed` OU pagas com `paid_at ≥ hoje−30`) ÷ faturado com
 * vencimento em [hoje−120, hoje−30].
 */
export function delinquencyRatePrev(charges: DelinquencyCharge[], today: string): number {
  const cut = addDays(today, -30)
  const from = addDays(today, -120)
  const cutInstant = new Date(`${cut}T00:00:00-03:00`).getTime()
  let overdue = 0
  let base = 0
  for (const charge of charges) {
    if (charge.dueDate < cut) {
      const stillOpen = charge.status === 'overdue' || charge.status === 'failed'
      const paidLater = charge.status === 'paid' && charge.paidAt && charge.paidAt.getTime() >= cutInstant
      if (stillOpen || paidLater) overdue += charge.amount
    }
    if (charge.status !== 'canceled' && charge.dueDate >= from && charge.dueDate <= cut) base += charge.amount
  }
  return base > 0 ? round1((overdue / base) * 100) : 0
}

/** Taxa a partir de somas já agregadas no SQL (0 sem base). */
export function rateOf(overdue: number, base: number): number {
  return base > 0 ? round1((overdue / base) * 100) : 0
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<HoldingAlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

/** critical > warning > info, depois `metric` desc (nulos por último). */
export function sortAlerts<T extends Pick<HoldingAlert, 'severity' | 'metric'>>(alerts: T[]): T[] {
  return [...alerts].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (bySeverity !== 0) return bySeverity
    return (b.metric ?? Number.NEGATIVE_INFINITY) - (a.metric ?? Number.NEGATIVE_INFINITY)
  })
}
