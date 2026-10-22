import { createHash } from 'node:crypto'

/**
 * Código de barras e linha digitável de boleto (padrão FEBRABAN) para o
 * gateway SIMULADO: banco fictício `999`, números coerentes (DVs corretos),
 * mas sem valor nenhum. Sem I/O: testável direto.
 *
 * Fator de vencimento na regra NOVA: o fator 9999 caiu em 21/02/2025 e a
 * contagem reiniciou em 1000 no dia 22/02/2025.
 */

const BANK_CODE = '999'
const CURRENCY_CODE = '9'
const FACTOR_BASE_UTC = Date.UTC(2025, 1, 22)
const DAY_MS = 86_400_000

/** Dias desde 22/02/2025 + 1000, a partir de `yyyy-MM-dd`. */
export function dueDateFactor(dueDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate)
  if (!match) throw new Error(`Vencimento inválido: ${dueDate}`)
  const due = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const days = Math.round((due - FACTOR_BASE_UTC) / DAY_MS)
  // Fora da janela (antes de 22/02/2025 ou depois de ~2052) não há fator válido; usa o mínimo.
  const factor = days < 0 ? 1000 : ((days % 9000) + 9000) % 9000 + 1000
  return String(factor).padStart(4, '0')
}

/** Módulo 10: pesos 2,1 alternados da direita, somando os algarismos de cada produto. */
export function mod10(digits: string): number {
  let sum = 0
  let weight = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    let product = Number(digits[i]) * weight
    if (product > 9) product = Math.floor(product / 10) + (product % 10)
    sum += product
    weight = weight === 2 ? 1 : 2
  }
  return (10 - (sum % 10)) % 10
}

/** Módulo 11 do DV geral: pesos 2..9 da direita; resultado 0, 10 ou 11 vira 1. */
export function mod11Barcode(digits: string): number {
  let sum = 0
  let weight = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * weight
    weight = weight === 9 ? 2 : weight + 1
  }
  const dv = 11 - (sum % 11)
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv
}

/** Campo livre de 25 dígitos, determinístico a partir de uma semente (o id da cobrança). */
export function freeFieldFrom(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex')
  let out = ''
  for (const char of hex) {
    out += String(parseInt(char, 16) % 10)
    if (out.length === 25) break
  }
  return out
}

export interface BoletoNumbers {
  /** 44 dígitos. */
  barCode: string
  /** 47 dígitos, sem máscara. */
  identificationField: string
}

/** Monta código de barras (44) e linha digitável (47) coerentes entre si. */
export function buildBoletoNumbers(input: { amount: number; dueDate: string; seed: string }): BoletoNumbers {
  const cents = Math.round(input.amount * 100)
  if (!Number.isFinite(cents) || cents < 0 || cents > 9_999_999_999) {
    throw new Error('Valor do boleto fora da faixa')
  }
  const factor = dueDateFactor(input.dueDate)
  const value = String(cents).padStart(10, '0')
  const free = freeFieldFrom(input.seed)

  // Posição 5 (índice 4) é o DV geral, calculado sobre os outros 43 dígitos.
  const withoutDv = `${BANK_CODE}${CURRENCY_CODE}${factor}${value}${free}`
  const dv = mod11Barcode(withoutDv)
  const barCode = `${BANK_CODE}${CURRENCY_CODE}${dv}${factor}${value}${free}`

  const field1 = `${BANK_CODE}${CURRENCY_CODE}${free.slice(0, 5)}`
  const field2 = free.slice(5, 15)
  const field3 = free.slice(15, 25)
  const identificationField =
    `${field1}${mod10(field1)}` +
    `${field2}${mod10(field2)}` +
    `${field3}${mod10(field3)}` +
    `${dv}` +
    `${factor}${value}`

  return { barCode, identificationField }
}
