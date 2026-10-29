/**
 * Apoio de formatação da tela Início do console. Tudo puro (roda no browser e
 * no servidor); só traduz números e datas para a língua do dono do negócio.
 */

export const MESES_LONGOS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const brlInt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const brlCents = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const intFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const milFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** `18420` → `"R$ 18.420"` (números de destaque). */
export function brlWhole(value: number): string {
  return brlInt.format(Number.isFinite(value) ? value : 0)
}

/** `1470` → `"R$ 1.470,00"` (valores citados em frase). */
export function brlExact(value: number): string {
  return brlCents.format(Number.isFinite(value) ? value : 0)
}

export function formatCount(value: number): string {
  return intFormat.format(Number.isFinite(value) ? value : 0)
}

/** `18420` → `"18,4"` (eixo "em R$ mil"). */
export function formatMil(value: number): string {
  return milFormat.format((Number.isFinite(value) ? value : 0) / 1000)
}

export function plural(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`
}

export function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/** Mês de `yyyy-MM` ou `yyyy-MM-dd` (1–12), ou `null`. */
export function monthNumber(value: string): number | null {
  const match = /^\d{4}-(\d{2})/.exec(value)
  const month = match ? Number(match[1]) : NaN
  return month >= 1 && month <= 12 ? month : null
}

export function monthLongName(value: string): string {
  const month = monthNumber(value)
  return month ? MESES_LONGOS[month - 1]! : value
}

export function monthShortName(value: string): string {
  const month = monthNumber(value)
  return month ? MESES_CURTOS[month - 1]! : value
}

/** Mês anterior de `yyyy-MM-dd`, como `yyyy-MM`. */
export function previousMonthOf(todayIso: string): string {
  const year = Number(todayIso.slice(0, 4))
  const month = Number(todayIso.slice(5, 7))
  const date = new Date(Date.UTC(year, month - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Último dia do mês de `yyyy-MM-dd`, como `yyyy-MM-dd`. */
export function endOfMonthOf(todayIso: string): string {
  const year = Number(todayIso.slice(0, 4))
  const month = Number(todayIso.slice(5, 7))
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${todayIso.slice(0, 7)}-${String(last).padStart(2, '0')}`
}

/** `yyyy-MM-dd` → `"31/10"`. */
export function dayAndMonth(dateIso: string): string {
  return `${dateIso.slice(8, 10)}/${dateIso.slice(5, 7)}`
}

/** Dias inteiros entre duas datas `yyyy-MM-dd` (`to` − `from`). */
export function daysBetween(fromIso: string, toIso: string): number {
  const toMs = (value: string) =>
    Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
  return Math.round((toMs(toIso) - toMs(fromIso)) / 86_400_000)
}

/** Há quanto tempo um instante aconteceu: "menos de 1 hora", "5 horas", "3 dias". */
export function waitedSince(instant: string, nowMs: number): string {
  const time = new Date(instant).getTime()
  if (Number.isNaN(time)) return ''
  const hours = Math.max(0, (nowMs - time) / 3_600_000)
  if (hours < 1) return 'menos de 1 hora'
  if (hours < 24) return plural(Math.floor(hours), 'hora', 'horas')
  return plural(Math.floor(hours / 24), 'dia', 'dias')
}

export function greetingFor(now: Date): string {
  const hour = now.getHours()
  if (hour >= 5 && hour < 12) return 'Bom dia'
  if (hour >= 12 && hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** `"Quinta-feira, 29 de outubro"`. */
export function longDate(now: Date): string {
  return capitalize(new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now))
}

const COUNT_WORDS_FEMININE = ['Nenhuma', 'Uma', 'Duas', 'Três']

/** Frase do cabeçalho com a quantidade de pendências. */
export function pendingSentence(count: number): string {
  if (count <= 0) return 'Nada pendente hoje.'
  const word = COUNT_WORDS_FEMININE[count] ?? formatCount(count)
  return count === 1 ? `${word} coisa precisa de você hoje.` : `${word} coisas precisam de você hoje.`
}
