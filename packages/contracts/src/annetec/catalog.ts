import { z } from 'zod'
import { uf, uuid } from '../common/primitives'
import {
  activeStatus,
  benefitCategory,
  clubCoverageCategory,
  clubCoverageChannel,
  clubCoverageKind,
  clubCoverageLimitPeriod,
  clubPaymentMethod,
  dependentRelationship,
  partnerCategory,
  registrationFeeKind,
} from './enums'

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
  /** Frase curta do parceiro, exibida abaixo do nome na rede credenciada. */
  tagline: z.string().nullable(),
  category: partnerCategory,
  discountPercent: z.number().min(0).max(100),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  city: z.string().nullable(),
  state: uf.nullable(),
  /** Especialidades atendidas; é por elas que o associado busca a rede. */
  specialties: z.array(z.string()),
  /** Início do credenciamento, `yyyy-MM-dd`. */
  since: z.string().nullable(),
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

/**
 * Plano que o INQUILINO vende ao associado — a vitrine comercial do clube.
 *
 * Existe separado de `healthPlan` porque as duas coisas respondem a donos
 * diferentes: `healthPlan` é o produto da Digital Saúde (código, carência,
 * cobertura, regras do ERP) e este é a oferta da Annetec (preço de tabela,
 * texto de venda, destaque na vitrine). Misturá-los faria o preço do clube
 * depender de uma sincronização com o ERP que nunca precisou existir.
 *
 * `upstreamPlanCodigo` é a ponte opcional entre os dois: preenchido, amarra o
 * plano vendido ao produto que será contratado lá na hora da adesão.
 *
 * Modelo completo (identidade, preço, elegibilidade, coberturas, pagamento e
 * contrato): todos os campos além dos originais são OPCIONAIS e, ausentes,
 * reproduzem o comportamento de antes. Regras puras (elegibilidade, métodos,
 * consistência, carência) em `club-plan-rules.ts`; preço em `quoteClubPlan`.
 */

/**
 * Cobertura estruturada do plano — o que o associado usa, como e quando.
 * O plano do clube NÃO é plano de saúde: coberturas são benefícios, descontos
 * e assistências prestados por parceiros (ver `CLUB_PLAN_LEGAL_NOTICE`).
 */
export const clubPlanCoverage = z.object({
  /** Chave estável dentro do plano (a tela gera; ex. `cov_telemed`). Ordem do array = ordem de exibição. */
  id: z.string().trim().min(1).max(40),
  category: clubCoverageCategory,
  title: z.string().trim().min(2, 'Informe o título da cobertura').max(80, 'Título longo demais'),
  description: z.string().trim().max(400, 'Descrição longa demais').nullable(),
  kind: clubCoverageKind,
  /** `discount_percent` → % (0–100); `copay` → R$ por uso; `included`/`usage_limit` → `null`. */
  value: z.number().nonnegative().nullable(),
  /** Usos permitidos por `limitPeriod`; `null` = ilimitado (obrigatório em `usage_limit`). */
  limitQuantity: z.number().int().positive().nullable(),
  limitPeriod: clubCoverageLimitPeriod.nullable(),
  /** Carência em dias contados da ativação; 0 = uso imediato. */
  waitingDays: z.number().int().min(0).max(730),
  channel: clubCoverageChannel,
  /** Parceiro que presta o benefício (assistências, farmácia…); `null` = rede do clube. */
  provider: z.string().trim().max(80).nullable(),
})
export type ClubPlanCoverage = z.infer<typeof clubPlanCoverage>

/** Parentesco aceito como dependente e a idade máxima (inclusive) na adesão; `null` = sem limite. */
export const clubPlanDependentRule = z.object({
  relationship: dependentRelationship,
  maxAge: z.number().int().min(0).max(120).nullable(),
})
export type ClubPlanDependentRule = z.infer<typeof clubPlanDependentRule>

export const clubPlan = z.object({
  id: uuid,
  tenantId: uuid,
  name: z.string().min(1),
  description: z.string(),
  priceMonthly: z.number().nonnegative(),
  features: z.array(z.string()),
  audience: z.string().nullable(),
  highlight: z.boolean(),
  upstreamPlanCodigo: z.string().nullable(),
  status: activeStatus,
  /**
   * Mensalidade de CADA dependente, somada à do titular (R$/mês).
   * `null` ou `0` = dependentes inclusos no preço do plano.
   *
   * Opcional só para não quebrar quem monta `ClubPlan` à mão enquanto a
   * coluna nasce; a API sempre devolve (null quando não configurado). O
   * cálculo oficial do preço é `quoteClubPlan` (club-billing.ts) — tela e API
   * usam a mesma função.
   */
  priceDependentMonthly: z.number().nonnegative().nullable().optional(),
  /**
   * Teto de dependentes por assinatura. `null` = sem limite; `0` = plano
   * individual (não aceita dependente).
   */
  maxDependents: z.number().int().nonnegative().nullable().optional(),

  // --- Identidade -----------------------------------------------------------
  /** Frase curta de venda sob o nome do plano. */
  tagline: z.string().trim().max(120, 'Use até 120 caracteres').nullable().optional(),
  /** Selo do card ("Mais escolhido"); com `highlight` e sem selo, a tela usa "Mais escolhido". */
  badge: z.string().trim().max(30, 'Use até 30 caracteres').nullable().optional(),
  /** Ordem de exibição (menor primeiro); `null` = ordem padrão (destaque, depois preço). */
  sortOrder: z.number().int().min(0).max(999).nullable().optional(),

  // --- Preço ----------------------------------------------------------------
  /**
   * Dependentes cobertos pela mensalidade do titular; os seguintes pagam
   * `priceDependentMonthly`. `null`/0 = nenhum incluso (regra de antes).
   */
  includedDependents: z.number().int().nonnegative().nullable().optional(),
  /** Taxa de adesão (R$), cobrada uma vez na 1ª cobrança; `null`/0 = sem adesão. */
  enrollmentFee: z.number().nonnegative().nullable().optional(),
  /** Isenção da adesão ativa (a tela mostra "de R$ X por R$ 0"). */
  enrollmentFeeWaived: z.boolean().optional(),

  // --- Elegibilidade --------------------------------------------------------
  /** Idade mínima do titular na adesão; `null` = 18 (regra geral do checkout). */
  holderMinAge: z.number().int().min(18, 'O titular precisa ter 18 anos ou mais').max(120).nullable().optional(),
  /** Idade máxima do titular na adesão (inclusive); `null` = sem limite. */
  holderMaxAge: z.number().int().min(18).max(120).nullable().optional(),
  /**
   * Parentescos aceitos e a idade máxima de cada um. `null`/ausente/vazio =
   * qualquer parentesco, sem limite de idade (regra de antes). Plano sem
   * dependentes é `maxDependents = 0`, não lista vazia.
   */
  dependentRules: z.array(clubPlanDependentRule).max(7).nullable().optional(),

  // --- Coberturas -----------------------------------------------------------
  /** Coberturas estruturadas; ausente/vazio = só `features` (texto livre, legado). */
  coverages: z.array(clubPlanCoverage).max(40).optional(),

  // --- Pagamento ------------------------------------------------------------
  /**
   * Formas de pagamento aceitas NESTE plano, intersectadas com as habilitadas
   * no clube (`billing_settings.enabledMethods`). `null`/ausente/vazio = todas
   * as do clube. Ver `effectivePaymentMethods`.
   */
  paymentMethods: z.array(clubPaymentMethod).max(3).nullable().optional(),

  // --- Contrato -------------------------------------------------------------
  /** Fidelidade em meses; 0/`null` = sem fidelidade. */
  loyaltyMonths: z.number().int().min(0).max(60).nullable().optional(),
  cancellationPolicy: z.string().trim().max(4000).nullable().optional(),
  /** Regra de reajuste (índice e data-base). */
  adjustmentPolicy: z.string().trim().max(2000).nullable().optional(),
  /** Regulamento / termos de adesão exibidos no checkout. */
  terms: z.string().trim().max(20000).nullable().optional(),
})
export type ClubPlan = z.infer<typeof clubPlan>

export const createClubPlanInput = clubPlan.omit({ id: true, tenantId: true })
export type CreateClubPlanInput = z.infer<typeof createClubPlanInput>

export const updateClubPlanInput = createClubPlanInput.partial()
export type UpdateClubPlanInput = z.infer<typeof updateClubPlanInput>
