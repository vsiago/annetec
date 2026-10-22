import type { ClubReceiptsTotals } from '@annetec/contracts'
import { addDays, addMonthsOnDueDay, diffDays, startOfMonth, todaySP } from './dates'

/**
 * Regras puras da tela Recebimento (Financeiro): período efetivo, cursor da
 * paginação e totais. Sem banco — testadas em `tests/club-billing-receipts.test.ts`.
 */

/** Teto do período consultado (dias, inclusive) — um ano e um pouco. */
export const MAX_RECEIPTS_RANGE_DAYS = 400

export type ReceiptsPeriod = { from: string; to: string } | { error: string }

/**
 * Período inclusive em datas-só de São Paulo. Sem nada vale o mês corrente
 * inteiro (o "a receber" olha vencimentos até o fim do mês); só `from` vai
 * até hoje; só `to` começa no 1º dia do mês de `to`.
 */
export function resolveReceiptsPeriod(
  input: { from?: string; to?: string },
  now: Date = new Date(),
): ReceiptsPeriod {
  const today = todaySP(now)
  let from = input.from
  let to = input.to
  if (!from && !to) {
    from = startOfMonth(today)
    to = addDays(addMonthsOnDueDay(from, 1, 1), -1)
  } else if (!from) {
    from = startOfMonth(to!)
  } else if (!to) {
    to = today < from ? from : today
  }
  if (from! > to!) return { error: 'A data inicial precisa ser anterior ou igual à final' }
  if (diffDays(to!, from!) + 1 > MAX_RECEIPTS_RANGE_DAYS) {
    return { error: `O período pode ter no máximo ${MAX_RECEIPTS_RANGE_DAYS} dias` }
  }
  return { from: from!, to: to! }
}

/** Instante UTC com microssegundos, como o SQL o formata (`to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`). */
const CURSOR_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/

/**
 * Posição na lista (ordem: instante desc, chave desc). `at` leva os
 * microssegundos do banco — com os milissegundos do JS a linha da borda
 * voltaria repetida na página seguinte.
 */
export interface ReceiptsCursor {
  at: string
  key: string
}

export function encodeReceiptsCursor(cursor: ReceiptsCursor): string {
  return Buffer.from(JSON.stringify([cursor.at, cursor.key]), 'utf8').toString('base64url')
}

/** `null` para cursor malformado (a rota responde 422). */
export function decodeReceiptsCursor(value: string): ReceiptsCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== 2) return null
    const [at, key] = parsed
    if (typeof at !== 'string' || typeof key !== 'string') return null
    if (!CURSOR_AT.test(at)) return null
    if (!/^[0-9a-f-]{36}:(received|refunded)$/.test(key)) return null
    return { at, key }
  } catch {
    return null
  }
}

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const cents = (value: number) => Math.round(value * 100) / 100

/** Agregados crus do SQL (numeric chega como texto) → totais da tela. */
export function buildReceiptsTotals(raw: {
  received?: unknown
  receivedCount?: unknown
  refunded?: unknown
  refundedCount?: unknown
  receivable?: unknown
  receivableCount?: unknown
}): ClubReceiptsTotals {
  const received = cents(toNumber(raw.received))
  const count = Math.trunc(toNumber(raw.receivedCount))
  const refunded = cents(toNumber(raw.refunded))
  return {
    received,
    count,
    average: count > 0 ? cents(received / count) : 0,
    refunded,
    refundedCount: Math.trunc(toNumber(raw.refundedCount)),
    net: cents(received - refunded),
    receivable: cents(toNumber(raw.receivable)),
    receivableCount: Math.trunc(toNumber(raw.receivableCount)),
  }
}
