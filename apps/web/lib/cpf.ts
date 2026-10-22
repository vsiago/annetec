import { cpf as cpfSchema } from '@annetec/contracts'

/**
 * Máscara progressiva para o campo de CPF enquanto a pessoa digita
 * ("1234" → "123.4", "12345678901" → "123.456.789-01"). Diferente de
 * `formatCpf` (contracts/form-schemas), que só formata um CPF já completo.
 */
export function maskCpfInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)]
  let out = parts.filter(Boolean).join('.')
  if (digits.length > 9) out += `-${digits.slice(9, 11)}`
  return out
}

/** Mensagem do primeiro problema do CPF (vazio, tamanho, dígito verificador) ou `null` se válido. */
export function cpfError(value: string): string | null {
  if (!value.trim()) return 'Informe o CPF'
  const result = cpfSchema.safeParse(value)
  return result.success ? null : (result.error.issues[0]?.message ?? 'CPF inválido')
}
