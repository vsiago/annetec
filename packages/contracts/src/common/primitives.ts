import { z } from 'zod'

/** Marca um campo de resposta de terceiros como tolerante: ausente ou null. */
export function lenient<T extends z.ZodTypeAny>(schema: T) {
  return schema.nullish()
}

const onlyDigits = (value: string) => value.replace(/\D/g, '')

export const cpf = z
  .string()
  .transform(onlyDigits)
  .refine(v => v.length === 11, 'CPF deve conter 11 dígitos')
  .refine(isValidCpf, 'CPF inválido')

export const cnpj = z
  .string()
  .transform(onlyDigits)
  .refine(v => v.length === 14, 'CNPJ deve conter 14 dígitos')
  .refine(isValidCnpj, 'CNPJ inválido')

/** CPF ou CNPJ — o `numeroDocumento` da Digital Saúde aceita ambos. */
export const numeroDocumento = z
  .string()
  .transform(onlyDigits)
  .refine(v => v.length === 11 || v.length === 14, 'Documento deve ser um CPF ou CNPJ')
  .refine(v => (v.length === 11 ? isValidCpf(v) : isValidCnpj(v)), 'Documento inválido')

export const cep = z
  .string()
  .transform(onlyDigits)
  .refine(v => v.length === 8, 'CEP deve conter 8 dígitos')

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

export const uf = z.enum(UFS)
export type UF = z.infer<typeof uf>

export const email = z.string().trim().toLowerCase().email('E-mail inválido')

export const telefone = z
  .string()
  .transform(onlyDigits)
  .refine(v => v.length >= 10 && v.length <= 11, 'Telefone deve conter DDD + número')

/** `yyyy-MM-dd`, formato aceito pela Digital Saúde em campos `format: date`. */
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato yyyy-MM-dd')

/** Slug de inquilino: usado como primeiro segmento da URL (`/[tenant]`). */
export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Slug deve conter apenas letras minúsculas, números e hífens')

export const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Cor deve estar em hexadecimal')

export const uuid = z.string().uuid()

export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value)
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false
  const calc = (slice: number) => {
    let sum = 0
    for (let i = 0; i < slice; i++) sum += Number(digits[i]) * (slice + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10])
}

export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value)
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false
  const calc = (slice: number) => {
    const weights = slice === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < slice; i++) sum += Number(digits[i]) * (weights[i] as number)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return calc(12) === Number(digits[12]) && calc(13) === Number(digits[13])
}
