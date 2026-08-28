import { z } from 'zod'

/**
 * Enums do domínio Annetec. São a fonte única — o banco (Drizzle), a API e o
 * frontend derivam daqui, e os mappers traduzem os `{ id, nome }` da Digital
 * Saúde para estes valores.
 */

/** Papéis de quem opera a plataforma Annetec (fora do escopo de inquilino). */
export const platformRole = z.enum(['superadmin', 'platform_admin'])
export type PlatformRole = z.infer<typeof platformRole>

/** Papéis dentro de um inquilino. */
export const tenantRole = z.enum(['admin', 'seller', 'client'])
export type TenantRole = z.infer<typeof tenantRole>

export const tenantStatus = z.enum(['trial', 'active', 'suspended', 'cancelled'])
export type TenantStatus = z.infer<typeof tenantStatus>

/**
 * Status de contrato normalizado. A Digital Saúde devolve
 * `statusContrato: { id, nome }` com texto livre; o mapper reduz para este
 * conjunto e guarda o original em `upstreamStatus`.
 */
export const contractStatus = z.enum([
  'pendente',
  'produzido',
  'ativo',
  'suspenso',
  'cancelado',
  'desconhecido',
])
export type ContractStatus = z.infer<typeof contractStatus>

export const invoiceStatus = z.enum(['aberta', 'paga', 'vencida', 'cancelada', 'desconhecido'])
export type InvoiceStatus = z.infer<typeof invoiceStatus>

export const receiptStatus = z.enum(['emitido', 'pago', 'cancelado', 'desconhecido'])
export type ReceiptStatus = z.infer<typeof receiptStatus>

/** `1 - Titular / 2 - Dependente / 3 - Agregado` no upstream. */
export const beneficiaryKind = z.enum(['titular', 'dependente', 'agregado'])
export type BeneficiaryKind = z.infer<typeof beneficiaryKind>

export const BENEFICIARY_KIND_BY_UPSTREAM_ID: Record<number, BeneficiaryKind> = {
  1: 'titular',
  2: 'dependente',
  3: 'agregado',
}

export const UPSTREAM_ID_BY_BENEFICIARY_KIND: Record<BeneficiaryKind, number> = {
  titular: 1,
  dependente: 2,
  agregado: 3,
}

/** `1 - Valor por Contrato / 2 - Valor por Vida`. */
export const registrationFeeKind = z.enum(['por_contrato', 'por_vida'])
export type RegistrationFeeKind = z.infer<typeof registrationFeeKind>

export const leadStatus = z.enum([
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'closed',
  'lost',
])
export type LeadStatus = z.infer<typeof leadStatus>

export const saleStatus = z.enum(['pending', 'confirmed', 'cancelled'])
export type SaleStatus = z.infer<typeof saleStatus>

export const partnerCategory = z.enum([
  'health',
  'dental',
  'pharmacy',
  'wellness',
  'food',
  'education',
  'other',
])
export type PartnerCategory = z.infer<typeof partnerCategory>

export const benefitCategory = z.enum(['health', 'dental', 'pharmacy', 'funeral', 'discount'])
export type BenefitCategory = z.infer<typeof benefitCategory>

export const appointmentStatus = z.enum(['aguardando', 'em_atendimento', 'concluido'])
export type AppointmentStatus = z.infer<typeof appointmentStatus>

export const activeStatus = z.enum(['active', 'inactive'])
export type ActiveStatus = z.infer<typeof activeStatus>
