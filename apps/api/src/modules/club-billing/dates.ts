/**
 * Datas do faturamento do clube — sempre no fuso `America/Sao_Paulo`
 * (blueprint §0.1-13). Datas-só trafegam como `yyyy-MM-dd` e a aritmética é
 * feita em UTC puro sobre o TEXTO (sem o bug clássico de `new Date('2026-09-27')`
 * virar o dia anterior em UTC-3).
 */

export const BILLING_TIME_ZONE = 'America/Sao_Paulo'
const DAY_MS = 86_400_000

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BILLING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Data-só em São Paulo do instante informado (padrão: agora). */
export function toDateSP(instant: Date = new Date()): string {
  return dateFormatter.format(instant)
}

/** "Hoje" em São Paulo. */
export function todaySP(now: Date = new Date()): string {
  return toDateSP(now)
}

function parts(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error(`Data inválida: ${date}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function toUtcMs(date: string): number {
  const [y, m, d] = parts(date)
  return Date.UTC(y, m - 1, d)
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtcMs(date) + days * DAY_MS)
}

/** `a - b` em dias. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtcMs(a) - toUtcMs(b)) / DAY_MS)
}

/**
 * Soma meses mantendo o vencimento no `dueDay` (1–28, então sempre existe no
 * mês). Ex.: `2026-09-30` + 1 mês com dueDay 28 → `2026-10-28`.
 */
export function addMonthsOnDueDay(date: string, months: number, dueDay: number): string {
  const [y, m] = parts(date)
  const day = Math.min(Math.max(1, Math.trunc(dueDay)), 28)
  return fromUtc(Date.UTC(y, m - 1 + months, day))
}

/** Dia do vencimento de uma assinatura contratada em `date`: o dia, limitado a 28. */
export function dueDayOf(date: string): number {
  return Math.min(parts(date)[2], 28)
}

/** `yyyy-MM`. */
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

/** `mm/aaaa`, para a descrição da cobrança. */
export function monthLabel(date: string): string {
  const [y, m] = parts(date)
  return `${String(m).padStart(2, '0')}/${y}`
}

/** 1º dia do mês de `date`. */
export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}

/** Últimos `count` meses terminando no mês de `date` (mais antigo primeiro), `yyyy-MM`. */
export function lastMonths(date: string, count: number): string[] {
  const [y, m] = parts(date)
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    out.push(fromUtc(Date.UTC(y, m - 1 - i, 1)).slice(0, 7))
  }
  return out
}

/** Instante do meio-dia em SP de uma data-só (baixa manual "paga em dd/mm"). */
export function noonSP(date: string): Date {
  parts(date)
  return new Date(`${date}T12:00:00-03:00`)
}

/** Ano corrente em SP. */
export function yearSP(now: Date = new Date()): number {
  return Number(toDateSP(now).slice(0, 4))
}

/** `dd/mm` para mensagens de timeline. */
export function dayMonthLabel(date: string): string {
  const [, m, d] = parts(date)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}
