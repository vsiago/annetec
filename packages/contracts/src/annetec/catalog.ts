import { z } from 'zod'
import { uf, uuid } from '../common/primitives'
import { activeStatus, benefitCategory, partnerCategory, registrationFeeKind } from './enums'

/**
 * Catálogo comercial. Planos, produtos e convênios são espelhos read-only da
 * Digital Saúde (a fonte da verdade é o ERP da administradora); parceiros,
 * benefícios e materiais são conteúdo próprio da Annetec.
 */

export const healthPlan = z.object({
  codigo: z.string(),
  name: z.string(),
  productCodigo: z.string().nullable(),
  productName: z.string().nullable(),
  operatorName: z.string().nullable(),
  operatorAns: z.string().nullable(),
  operatorLogoUrl: z.string().nullable(),
  accommodation: z.string().nullable(),
  /** Registro do PRODUTO na ANS — obrigatório em material de venda. */
  ansRegistration: z.string().nullable(),
  /** Ex.: "Grupo de Municípios", "Nacional". */
  coverage: z.string().nullable(),
  /** "Aberto" / "Fechado": plano fechado não pode ser vendido. */
  status: z.string().nullable(),
  networkUrl: z.string().nullable(),
  manualUrl: z.string().nullable(),
})
export type HealthPlan = z.infer<typeof healthPlan>

export const convenio = z.object({
  codigo: z.string(),
  name: z.string(),
  registrationFee: z.number().nullable(),
  registrationFeeKind: registrationFeeKind.nullable(),
  productCodigo: z.string().nullable(),
  branches: z.array(z.object({ codigo: z.string(), name: z.string() })),
  /** Contratante do plano coletivo. */
  stipulatorCodigo: z.string().nullable(),
  stipulatorName: z.string().nullable(),
  nextAdjustmentDate: z.string().nullable(),
  effectiveDay: z.number().int().nullable(),
})
export type Convenio = z.infer<typeof convenio>

export const waitingPeriod = z.object({
  codigo: z.string(),
  name: z.string(),
})
export type WaitingPeriod = z.infer<typeof waitingPeriod>

export const priceTableEntry = z.object({
  id: z.number().int().nullable(),
  planCodigo: z.string().nullable(),
  planName: z.string().nullable(),
  ageRangeName: z.string().nullable(),
  ageFrom: z.number().int().nullable(),
  ageTo: z.number().int().nullable(),
  chargeValue: z.number().nullable(),
  netValue: z.number().nullable(),
  effectiveDate: z.string().nullable(),
})
export type PriceTableEntry = z.infer<typeof priceTableEntry>

export const priceTable = z.object({
  codigo: z.string(),
  name: z.string(),
  effectiveDate: z.string().nullable(),
  groupCodigo: z.string().nullable(),
  entries: z.array(priceTableEntry),
})
export type PriceTable = z.infer<typeof priceTable>

/** Cotação: entrada do POST /calculo/ traduzida para o domínio. */
export const quoteInput = z.object({
  name: z.string().min(1),
  state: uf,
  lives: z
    .array(
      z.object({
        age: z.number().int().min(0).max(120),
        relationshipId: z.number().int(),
      }),
    )
    .min(1),
})
export type QuoteInput = z.infer<typeof quoteInput>

export const quoteResult = z.object({
  plans: z.array(healthPlan),
  quotedAt: z.string().datetime(),
})
export type QuoteResult = z.infer<typeof quoteResult>

/** Rede credenciada — dado próprio da Annetec, sem contrapartida no upstream. */
export const partner = z.object({
  id: uuid,
  tenantId: uuid,
  name: z.string().min(1),
  category: partnerCategory,
  discountPercent: z.number().min(0).max(100),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  state: uf.nullable(),
  status: activeStatus,
})
export type Partner = z.infer<typeof partner>

export const createPartnerInput = partner.omit({ id: true, tenantId: true })
export type CreatePartnerInput = z.infer<typeof createPartnerInput>

export const updatePartnerInput = createPartnerInput.partial()
export type UpdatePartnerInput = z.infer<typeof updatePartnerInput>

export const benefit = z.object({
  id: uuid,
  tenantId: uuid,
  name: z.string().min(1),
  description: z.string(),
  category: benefitCategory,
  discountPercent: z.number().min(0).max(100).nullable(),
  provider: z.string().nullable(),
  locations: z.array(z.string()),
})
export type Benefit = z.infer<typeof benefit>

export const createBenefitInput = benefit.omit({ id: true, tenantId: true })
export type CreateBenefitInput = z.infer<typeof createBenefitInput>

export const updateBenefitInput = createBenefitInput.partial()
export type UpdateBenefitInput = z.infer<typeof updateBenefitInput>
