/**
 * Máscaras progressivas dos campos do assistente (servem para `onChange`:
 * aceitam valor incompleto) e as leituras de volta para número.
 *
 * CPF, CEP e telefone vêm de @annetec/contracts — o mesmo código que a API usa
 * para limpar o valor —, CNPJ do adaptador da contratação. Aqui ficam só as de
 * número: dinheiro (estilo calculadora: "4990" vira "49,90"), percentual e
 * inteiro com separador de milhar.
 */

import { maskCep, maskCpf, maskPhone, onlyDigits, parseBRL } from '@annetec/contracts'
import { maskCnpj } from '@/lib/adapters/contratacao'

export { maskCep, maskCnpj, maskCpf, maskPhone, onlyDigits, parseBRL }

const MONEY = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const INTEGER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** Dinheiro estilo calculadora: os dígitos entram pela direita, nos centavos. `"4990"` → `"49,90"`. */
export function maskMoney(value: string): string {
  const digits = onlyDigits(value).replace(/^0+(?=\d)/, '').slice(0, 13)
  if (!digits) return ''
  return MONEY.format(Number(digits) / 100)
}

/** `49.9` → `"49,90"` (valor inicial de um campo de dinheiro). */
export function moneyInput(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? MONEY.format(value) : ''
}

/** `"1.234,56"` → `1234.56`; vazio → `null`. */
export function parseMoney(value: string): number | null {
  return value.trim() === '' ? null : parseBRL(value)
}

/** Decimal com vírgula e até `decimals` casas: `"2.5"` → `"2,5"`, `"10,555"` → `"10,55"`. */
export function maskDecimal(value: string, decimals = 2): string {
  const cleaned = value.replace(/\./g, ',').replace(/[^\d,]/g, '')
  const [int = '', ...rest] = cleaned.split(',')
  const intPart = int.replace(/^0+(?=\d)/, '').slice(0, 6)
  if (rest.length === 0 || decimals === 0) return intPart
  return `${intPart || '0'},${rest.join('').slice(0, decimals)}`
}

/** `"2,5"` → `2.5`; vazio ou inválido → `null`. */
export function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.')
  if (normalized === '' || normalized === '.') return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

/** `2.5` → `"2,5"` (valor inicial de um campo de percentual). */
export function decimalInput(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value).replace('.', ',') : ''
}

/** Inteiro com milhar: `"12000"` → `"12.000"`. */
export function maskInteger(value: string, maxDigits = 9): string {
  const digits = onlyDigits(value).replace(/^0+(?=\d)/, '').slice(0, maxDigits)
  return digits ? INTEGER.format(Number(digits)) : ''
}

/** Inteiro sem separador: `"12000"` → `"12000"` (dia, ordem, código). */
export function maskDigits(value: string, maxDigits = 9): string {
  return onlyDigits(value).slice(0, maxDigits)
}

/** `"12.000"` → `12000`; vazio → `null`. */
export function parseInteger(value: string): number | null {
  const digits = onlyDigits(value)
  return digits ? Number(digits) : null
}

/** `12000` → `"12.000"` (valor inicial de um campo inteiro). */
export function integerInput(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? INTEGER.format(value) : ''
}

/** Cor digitada à mão: garante o `#` e no máximo 6 dígitos hexadecimais. */
export function maskHexColor(value: string): string {
  const hex = value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
  return hex ? `#${hex.toUpperCase()}` : value.trim() === '#' ? '#' : ''
}
