import { z } from 'zod'
import { cpf, email, telefone } from '@annetec/contracts'

/**
 * Schemas dos formulários do painel do inquilino.
 *
 * Reaproveitam os primitivos de `@annetec/contracts` — os mesmos que a API
 * usa —, então CPF com dígito verificador errado ou telefone sem DDD já é
 * barrado na tela, com a mesma regra que valeria no servidor.
 */

const requiredText = (label: string, min = 2) =>
  z.string().trim().min(min, `Informe ${label}`)

const optionalText = z.string().trim().optional().or(z.literal(''))

/** Aceita "49,90" e "49.90" — o painel é usado com teclado brasileiro. */
const currency = z
  .string()
  .trim()
  .min(1, 'Informe o valor')
  .transform(value => Number(value.replace(/\./g, '').replace(',', '.')))
  .refine(value => Number.isFinite(value) && value >= 0, 'Valor inválido')

const percent = z
  .string()
  .trim()
  .transform(value => Number(value.replace(',', '.')))
  .refine(value => Number.isFinite(value) && value >= 0 && value <= 100, 'Use um valor de 0 a 100')

export const beneficiarioSchema = z.object({
  name: requiredText('o nome completo', 3),
  email,
  cpf,
  phone: telefone,
  plan: requiredText('o plano', 1),
  sellerId: requiredText('o vendedor responsável', 1),
  city: optionalText,
})
export type BeneficiarioForm = z.infer<typeof beneficiarioSchema>

export const leadSchema = z.object({
  name: requiredText('o nome do lead', 3),
  email,
  phone: telefone,
  source: requiredText('a origem', 1),
  status: requiredText('a etapa', 1),
  interest: optionalText,
  value: currency,
  sellerId: requiredText('o vendedor responsável', 1),
  notes: optionalText,
})
export type LeadForm = z.infer<typeof leadSchema>

export const saleSchema = z.object({
  clientName: requiredText('o cliente', 3),
  sellerId: requiredText('o vendedor', 1),
  plan: requiredText('o plano', 1),
  value: currency,
  source: optionalText,
  status: requiredText('a situação', 1),
})
export type SaleForm = z.infer<typeof saleSchema>

export const partnerSchema = z.object({
  name: requiredText('o nome do parceiro', 3),
  tagline: optionalText,
  category: requiredText('a categoria', 1),
  discountPercent: percent,
  address: requiredText('o endereço', 3),
  city: requiredText('a cidade', 2),
  phone: telefone,
  email: email.optional().or(z.literal('')),
  website: optionalText,
  specialties: optionalText,
})
export type PartnerForm = z.infer<typeof partnerSchema>

export const planSchema = z.object({
  name: requiredText('o nome do plano', 2),
  priceMonthly: currency,
  description: requiredText('a descrição', 5),
  audience: optionalText,
  /** Uma cobertura por linha — é como a pessoa escreve a lista de fato. */
  features: optionalText,
})
export type PlanForm = z.infer<typeof planSchema>

export const tenantUserSchema = z.object({
  name: requiredText('o nome', 3),
  email,
  phone: telefone,
  role: requiredText('o perfil de acesso', 1),
})
export type TenantUserForm = z.infer<typeof tenantUserSchema>

/** "12345678901" → "123.456.789-01", para o cadastro sair formatado como o resto. */
export function formatCpf(digits: string): string {
  const only = digits.replace(/\D/g, '').slice(0, 11)
  if (only.length !== 11) return digits
  return `${only.slice(0, 3)}.${only.slice(3, 6)}.${only.slice(6, 9)}-${only.slice(9)}`
}

/** "22999876543" → "(22) 99987-6543". */
export function formatPhone(digits: string): string {
  const only = digits.replace(/\D/g, '')
  if (only.length === 11) return `(${only.slice(0, 2)}) ${only.slice(2, 7)}-${only.slice(7)}`
  if (only.length === 10) return `(${only.slice(0, 2)}) ${only.slice(2, 6)}-${only.slice(6)}`
  return digits
}
