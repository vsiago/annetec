import { z } from 'zod'
import { roundCents } from '../common/br'
import { paginationQuery } from '../common/pagination'
import { dateOnly, uuid } from '../common/primitives'
import {
  checkoutPaymentInput,
  clubBoletoData,
  clubCardInfo,
  clubChargeStatus,
  clubPixData,
  CLUB_CHARGE_STATUS_LABELS,
  paymentGatewayProvider,
  type ClubChargeStatus,
} from './club-billing'
import { clubPaymentMethod } from './enums'
import { tenantPlan, type TenantPlan } from './tenant'

/**
 * Faturamento ANNETEC → inquilinos (blueprint da plataforma §0.4).
 *
 * É o `club-billing` um nível acima: a ANNETEC cobra as SUBOPERADORAS pelo uso
 * da plataforma. Motor próprio (tabelas `platform_*`), mesma camada de gateway
 * (`integrations/payments`) e o mesmo vocabulário de eventos. Nada aqui toca
 * as tabelas do clube, exceto LER vidas e receita para faturar e para a holding.
 *
 * Modelo de preço: mensalidade do plano (inclui até `memberLimit` vidas) +
 * excedente por vida acima do limite + adesão (1× na ativação) + percentual
 * opcional sobre a receita do clube (split, desligado por padrão).
 *
 * Inadimplência RESTRINGE o painel (somente leitura) antes de BLOQUEAR. Os
 * associados do inquilino nunca são afetados (carteirinha, portal e cobrança
 * deles seguem normais). Só existe assinatura de plataforma para inquilino que
 * nasceu pela contratação pública (ou pelo seed de demonstração): inquilino
 * sem assinatura é "não gerenciado" e nunca é restringido.
 *
 * Datas-só `yyyy-MM-dd` (America/Sao_Paulo); instantes ISO UTC; reais com 2 casas.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Máquina de estados da assinatura de plataforma (blueprint §0.2):
 *  - `active`: em dia;
 *  - `past_due`: fatura vencida, painel ainda completo (aviso);
 *  - `restricted`: atraso ≥ `restrictAfterDays` — painel SOMENTE LEITURA;
 *  - `suspended`: atraso ≥ `suspendAfterDays` — painel BLOQUEADO (só "Minha assinatura");
 *  - `canceled`: atraso ≥ `cancelAfterDays` ou cancelamento manual. O inquilino
 *    NÃO é cancelado automaticamente (`tenant_profiles.status` fica `suspended`).
 */
export const platformSubscriptionStatus = z.enum(['active', 'past_due', 'restricted', 'suspended', 'canceled'])
export type PlatformSubscriptionStatus = z.infer<typeof platformSubscriptionStatus>

export const PLATFORM_SUBSCRIPTION_STATUS_LABELS: Record<PlatformSubscriptionStatus, string> = {
  active: 'Em dia',
  past_due: 'Em atraso',
  restricted: 'Restrita (somente leitura)',
  suspended: 'Suspensa (painel bloqueado)',
  canceled: 'Cancelada',
}

/** Nível de acesso do painel do inquilino (admin e vendedor). Associado nunca é afetado. */
export const platformAccessLevel = z.enum(['full', 'read_only', 'blocked'])
export type PlatformAccessLevel = z.infer<typeof platformAccessLevel>

export const PLATFORM_ACCESS_LEVEL_LABELS: Record<PlatformAccessLevel, string> = {
  full: 'Acesso completo',
  read_only: 'Somente leitura',
  blocked: 'Bloqueado',
}

/** Status → acesso, quando não há override manual vigente. */
export function accessLevelForStatus(status: PlatformSubscriptionStatus): PlatformAccessLevel {
  switch (status) {
    case 'active':
    case 'past_due':
      return 'full'
    case 'restricted':
      return 'read_only'
    case 'suspended':
    case 'canceled':
      return 'blocked'
  }
}

/**
 * Acesso efetivo: override manual da holding (se vigente) vence o status da
 * régua. Override com `until` no passado é ignorado (a automação limpa).
 */
export function effectivePlatformAccess(
  sub: {
    status: PlatformSubscriptionStatus
    accessOverride: PlatformAccessLevel | null
    accessOverrideUntil: Date | string | null
  },
  now: Date = new Date(),
): { level: PlatformAccessLevel; source: 'billing' | 'override' } {
  if (sub.accessOverride) {
    const until = sub.accessOverrideUntil ? new Date(sub.accessOverrideUntil) : null
    if (!until || until.getTime() > now.getTime()) return { level: sub.accessOverride, source: 'override' }
  }
  return { level: accessLevelForStatus(sub.status), source: 'billing' }
}

/** Mesmos valores da cobrança do clube (o banco reaproveita o enum `club_charge_status`). */
export const platformChargeStatus = clubChargeStatus
export type PlatformChargeStatus = ClubChargeStatus
export const PLATFORM_CHARGE_STATUS_LABELS = CLUB_CHARGE_STATUS_LABELS

/**
 * - `activation`: adesão + 1ª mensalidade, emitida na APROVAÇÃO da proposta
 *   (pertence à proposta; ganha `organizationId`/`subscriptionId` no provisionamento);
 * - `monthly`: ciclo mensal (mensalidade + excedente + split + ajustes);
 * - `adjustment`: avulsa (ajuste manual lançado pela holding).
 */
export const platformChargeKind = z.enum(['activation', 'monthly', 'adjustment'])
export type PlatformChargeKind = z.infer<typeof platformChargeKind>

export const PLATFORM_CHARGE_KIND_LABELS: Record<PlatformChargeKind, string> = {
  activation: 'Ativação',
  monthly: 'Mensalidade',
  adjustment: 'Avulsa',
}

export const platformChargeItemKind = z.enum([
  'setup_fee',
  'plan_fee',
  'overage',
  'revenue_share',
  'proration',
  'discount',
  'adjustment',
])
export type PlatformChargeItemKind = z.infer<typeof platformChargeItemKind>

export const PLATFORM_CHARGE_ITEM_KIND_LABELS: Record<PlatformChargeItemKind, string> = {
  setup_fee: 'Adesão',
  plan_fee: 'Mensalidade do plano',
  overage: 'Vidas excedentes',
  revenue_share: 'Participação na receita',
  proration: 'Proporcional de troca de plano',
  discount: 'Desconto',
  adjustment: 'Ajuste',
}

/** Linha da fatura. `amount` = `quantity × unitPrice` (negativo em desconto). */
export const platformChargeItem = z.object({
  kind: platformChargeItemKind,
  description: z.string().min(1).max(200),
  quantity: z.number(),
  unitPrice: z.number(),
  amount: z.number(),
  /**
   * Só em `discount`: a parte que o desconto abate (`setup_fee` = adesão,
   * `plan_fee` = mensalidade). É o que separa adesão de mensalidade na base
   * da comissão do vendedor quando a ativação junta as duas.
   */
  appliesTo: z.enum(['setup_fee', 'plan_fee']).optional(),
})
export type PlatformChargeItem = z.infer<typeof platformChargeItem>

/** Origem de uma linha de `platform_billing_events`. `tenant` = ação do admin do inquilino. */
export const platformEventSource = z.enum(['webhook', 'automation', 'onboarding', 'manual', 'simulation', 'tenant'])
export type PlatformEventSource = z.infer<typeof platformEventSource>

/**
 * Tipos de `platform_billing_events.type`. Os `PAYMENT_*` são o vocabulário do
 * webhook do Asaas (idioma do handler único, igual ao do clube). Coluna texto:
 * tipo desconhecido do gateway é gravado, só não muda estado.
 */
export const PLATFORM_BILLING_EVENT_TYPES = [
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_REFUNDED',
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
  'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_RESTORED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
  /** Pagamento recebido num id do gateway que já não é o da fatura (Pix/boleto antigo não cancelado). */
  'PAYMENT_ORPHAN_RECEIVED',
  'ACTIVATION_CHARGE_CREATED',
  'CHARGE_GENERATED',
  'CHARGE_REISSUED',
  'CHARGE_CANCELED',
  'CHARGE_MANUAL_PAYMENT',
  'REMINDER_SENT',
  'SUBSCRIPTION_CREATED',
  'SUBSCRIPTION_PAST_DUE',
  'SUBSCRIPTION_RESTRICTED',
  'SUBSCRIPTION_SUSPENDED',
  'SUBSCRIPTION_REACTIVATED',
  'SUBSCRIPTION_CANCELED',
  'PLAN_UPGRADED',
  'PLAN_DOWNGRADE_SCHEDULED',
  'PLAN_CHANGED',
  'ACCESS_OVERRIDE_SET',
  'ACCESS_OVERRIDE_CLEARED',
  'DEMO_TIME_TRAVEL',
  'SUBSCRIPTION_GATEWAY_MIGRATED',
] as const
export type PlatformBillingEventType = (typeof PLATFORM_BILLING_EVENT_TYPES)[number]

export const PLATFORM_BILLING_EVENT_LABELS: Record<PlatformBillingEventType, string> = {
  PAYMENT_CREATED: 'Cobrança criada no gateway',
  PAYMENT_UPDATED: 'Cobrança atualizada no gateway',
  PAYMENT_CONFIRMED: 'Pagamento confirmado',
  PAYMENT_RECEIVED: 'Pagamento recebido',
  PAYMENT_OVERDUE: 'Fatura vencida',
  PAYMENT_DELETED: 'Cobrança removida no gateway',
  PAYMENT_REFUNDED: 'Pagamento estornado',
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'Cartão recusado',
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: 'Cartão reprovado na análise de risco',
  PAYMENT_PARTIALLY_REFUNDED: 'Pagamento estornado parcialmente',
  PAYMENT_RESTORED: 'Cobrança restaurada no gateway',
  PAYMENT_CHARGEBACK_REQUESTED: 'Chargeback (contestação) aberto',
  PAYMENT_CHARGEBACK_DISPUTE: 'Chargeback em disputa',
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: 'Disputa de chargeback ganha — aguardando reversão',
  PAYMENT_ORPHAN_RECEIVED: 'Pagamento duplicado recebido (estornar manualmente)',
  ACTIVATION_CHARGE_CREATED: 'Cobrança de ativação emitida',
  CHARGE_GENERATED: 'Fatura do ciclo gerada',
  CHARGE_REISSUED: 'Segunda via emitida',
  CHARGE_CANCELED: 'Fatura cancelada',
  CHARGE_MANUAL_PAYMENT: 'Baixa manual',
  REMINDER_SENT: 'Lembrete de vencimento enviado',
  SUBSCRIPTION_CREATED: 'Assinatura da plataforma criada',
  SUBSCRIPTION_PAST_DUE: 'Assinatura em atraso',
  SUBSCRIPTION_RESTRICTED: 'Painel restrito (somente leitura)',
  SUBSCRIPTION_SUSPENDED: 'Painel suspenso',
  SUBSCRIPTION_REACTIVATED: 'Assinatura reativada',
  SUBSCRIPTION_CANCELED: 'Assinatura cancelada',
  PLAN_UPGRADED: 'Upgrade de plano',
  PLAN_DOWNGRADE_SCHEDULED: 'Troca de plano agendada',
  PLAN_CHANGED: 'Plano alterado',
  ACCESS_OVERRIDE_SET: 'Acesso alterado manualmente',
  ACCESS_OVERRIDE_CLEARED: 'Alteração manual de acesso removida',
  DEMO_TIME_TRAVEL: 'Datas avançadas (demonstração)',
  SUBSCRIPTION_GATEWAY_MIGRATED: 'Assinatura migrada de gateway',
}

// ---------------------------------------------------------------------------
// Preço dos planos ANNETEC
// ---------------------------------------------------------------------------

/**
 * Complemento comercial de `tenant_plans` (tabela `tenant_plan_pricing`, 1:1).
 * Sem linha = `DEFAULT_TENANT_PLAN_PRICING` (plano visível, sem adesão nem excedente).
 */
export const tenantPlanPricing = z.object({
  planId: uuid,
  /** Adesão, cobrada 1× junto da 1ª mensalidade. */
  setupFee: z.number().nonnegative(),
  /** R$ por vida ativa acima de `memberLimit`, por mês. */
  pricePerExtraLife: z.number().nonnegative(),
  /** % sobre a receita recebida do clube no período anterior; 0 = desligado (padrão). */
  revenueSharePercent: z.number().min(0).max(30),
  /** Aparece na contratação pública. */
  publicVisible: z.boolean(),
  /** Selo "Mais escolhido". */
  highlight: z.boolean(),
  sortOrder: z.number().int().nullable(),
  tagline: z.string().max(120).nullable(),
  description: z.string().max(1000).nullable(),
})
export type TenantPlanPricing = z.infer<typeof tenantPlanPricing>

export const DEFAULT_TENANT_PLAN_PRICING: Omit<TenantPlanPricing, 'planId'> = {
  setupFee: 0,
  pricePerExtraLife: 0,
  revenueSharePercent: 0,
  publicVisible: true,
  highlight: false,
  sortOrder: null,
  tagline: null,
  description: null,
}

export const updateTenantPlanPricingInput = tenantPlanPricing.omit({ planId: true }).partial()
export type UpdateTenantPlanPricingInput = z.infer<typeof updateTenantPlanPricingInput>

/** Plano ANNETEC com preço completo — vitrine pública e upgrade. */
export const platformPlanOffer = tenantPlan.extend({ pricing: tenantPlanPricing })
export type PlatformPlanOffer = z.infer<typeof platformPlanOffer>

// ---------------------------------------------------------------------------
// Cotação — função única para tela e API
// ---------------------------------------------------------------------------

export const platformPlanQuote = z.object({
  planFee: z.number(),
  memberLimit: z.number().int(),
  lives: z.number().int(),
  extraLives: z.number().int(),
  pricePerExtraLife: z.number(),
  overageTotal: z.number(),
  revenueSharePercent: z.number(),
  /** Receita do clube usada na base do split (0 quando desligado ou desconhecida). */
  revenueShareBase: z.number(),
  revenueShareTotal: z.number(),
  /** Mensal recorrente = planFee + overageTotal + revenueShareTotal. */
  monthlyTotal: z.number(),
  setupFee: z.number(),
  /** 1ª cobrança (ativação) = planFee + setupFee − descontos (sem excedente: o clube nasce com 0 vidas). */
  activationTotal: z.number(),
  /** lives ÷ memberLimit × 100, 1 casa. */
  usagePct: z.number(),
  /** Desconto aprovado na adesão (0–100; 100 = isenção). 0 sem desconto. */
  setupFeeDiscountPercent: z.number(),
  /** R$ abatidos da adesão. */
  setupFeeDiscount: z.number(),
  /** Desconto aprovado na mensalidade do plano (0–50). 0 sem desconto. */
  planFeeDiscountPercent: z.number(),
  /** R$ abatidos de cada mensalidade enquanto o desconto vale (já descontados de `monthlyTotal`). */
  planFeeDiscount: z.number(),
})
export type PlatformPlanQuote = z.infer<typeof platformPlanQuote>

/** Teto do desconto na mensalidade (regra comercial aprovada). */
export const MAX_MONTHLY_DISCOUNT_PERCENT = 50

/** Desconto de preço aplicado a uma cotação/cobrança (percentuais já aprovados). */
export interface PlatformPriceDiscount {
  /** 0–100 sobre a adesão (100 = isenção). */
  setupFeePercent?: number | null
  /** 0–50 sobre a mensalidade do plano. */
  monthlyPercent?: number | null
}

function clampPercent(value: number | null | undefined, max: number): number {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(max, n)
}

/** R$ de desconto de `percent`% (limitado a `max`) sobre `base`, arredondado a centavos. */
export function discountAmount(base: number, percent: number | null | undefined, max = 100): number {
  return roundCents((Math.max(0, base) * clampPercent(percent, max)) / 100)
}

/**
 * Cotação de um plano para N vidas. A API fatura com esta MESMA função: o valor
 * simulado na contratação é o valor cobrado.
 */
export function quotePlatformPlan(
  plan: Pick<TenantPlan, 'priceMonthly' | 'memberLimit'>,
  pricing: Pick<TenantPlanPricing, 'setupFee' | 'pricePerExtraLife' | 'revenueSharePercent'>,
  lives: number,
  options: { clubRevenue?: number; discount?: PlatformPriceDiscount | null } = {},
): PlatformPlanQuote {
  const count = Math.max(0, Math.trunc(lives))
  const limit = Math.max(1, Math.trunc(plan.memberLimit))
  const extraLives = Math.max(0, count - limit)
  const overageTotal = roundCents(extraLives * pricing.pricePerExtraLife)
  const percent = Math.max(0, pricing.revenueSharePercent)
  const base = percent > 0 ? roundCents(Math.max(0, options.clubRevenue ?? 0)) : 0
  const revenueShareTotal = roundCents((base * percent) / 100)
  const planFee = roundCents(plan.priceMonthly)
  const setupFee = roundCents(pricing.setupFee)
  const setupFeeDiscountPercent = clampPercent(options.discount?.setupFeePercent, 100)
  const planFeeDiscountPercent = clampPercent(options.discount?.monthlyPercent, MAX_MONTHLY_DISCOUNT_PERCENT)
  const setupFeeDiscount = discountAmount(setupFee, setupFeeDiscountPercent)
  const planFeeDiscount = discountAmount(planFee, planFeeDiscountPercent, MAX_MONTHLY_DISCOUNT_PERCENT)
  return {
    planFee,
    memberLimit: limit,
    lives: count,
    extraLives,
    pricePerExtraLife: roundCents(pricing.pricePerExtraLife),
    overageTotal,
    revenueSharePercent: percent,
    revenueShareBase: base,
    revenueShareTotal,
    monthlyTotal: roundCents(planFee - planFeeDiscount + overageTotal + revenueShareTotal),
    setupFee,
    activationTotal: roundCents(planFee - planFeeDiscount + setupFee - setupFeeDiscount),
    usagePct: Math.round((count / limit) * 1000) / 10,
    setupFeeDiscountPercent,
    setupFeeDiscount,
    planFeeDiscountPercent,
    planFeeDiscount,
  }
}

/**
 * Desconto da mensalidade guardado na assinatura: `percent` > 0 e `until`
 * (data-só, inclusive) = último dia coberto; `until` nulo = permanente.
 * Vale para o período que COMEÇA até `until`. Devolve o % do período (0 = sem).
 */
export function monthlyDiscountPercentFor(
  discount: { percent: number; until: string | null } | null | undefined,
  periodStart: string,
): number {
  if (!discount) return 0
  const percent = clampPercent(discount.percent, MAX_MONTHLY_DISCOUNT_PERCENT)
  if (percent <= 0) return 0
  if (discount.until !== null && periodStart > discount.until) return 0
  return percent
}

/**
 * Plano mais barato para N vidas (empate → maior `memberLimit`, que dá folga).
 * Só considera `publicVisible`. `null` sem ofertas.
 */
export function recommendPlatformPlan(offers: PlatformPlanOffer[], lives: number): string | null {
  let best: { id: string; total: number; limit: number } | null = null
  for (const offer of offers) {
    if (!offer.pricing.publicVisible) continue
    const total = quotePlatformPlan(offer, offer.pricing, lives).monthlyTotal
    if (!best || total < best.total || (total === best.total && offer.memberLimit > best.limit)) {
      best = { id: offer.id, total, limit: offer.memberLimit }
    }
  }
  return best?.id ?? null
}

export function sumChargeItems(items: Pick<PlatformChargeItem, 'amount'>[]): number {
  return roundCents(items.reduce((acc, item) => acc + item.amount, 0))
}

/** Linha de desconto (valor negativo) sobre a adesão ou a mensalidade. */
export function discountChargeItem(appliesTo: 'setup_fee' | 'plan_fee', percent: number, amount: number): PlatformChargeItem {
  const value = -roundCents(Math.abs(amount))
  const label = Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace('.', ',')
  return {
    kind: 'discount',
    description:
      appliesTo === 'setup_fee'
        ? percent >= 100
          ? 'Isenção da adesão'
          : `Desconto de ${label}% na adesão`
        : `Desconto de ${label}% na mensalidade`,
    quantity: 1,
    unitPrice: value,
    amount: value,
    appliesTo,
  }
}

/**
 * Itens da cobrança de ativação: adesão (se houver) + 1ª mensalidade, cada uma
 * seguida do seu desconto aprovado (linha `discount` negativa com `appliesTo`).
 */
export function activationChargeItems(
  plan: Pick<TenantPlan, 'name' | 'priceMonthly'>,
  pricing: Pick<TenantPlanPricing, 'setupFee'>,
  discount: PlatformPriceDiscount | null = null,
): PlatformChargeItem[] {
  const items: PlatformChargeItem[] = []
  if (pricing.setupFee > 0) {
    items.push({
      kind: 'setup_fee',
      description: `Adesão — plano ${plan.name}`,
      quantity: 1,
      unitPrice: roundCents(pricing.setupFee),
      amount: roundCents(pricing.setupFee),
    })
    const percent = clampPercent(discount?.setupFeePercent, 100)
    const off = discountAmount(pricing.setupFee, percent)
    if (off > 0) items.push(discountChargeItem('setup_fee', percent, off))
  }
  items.push({
    kind: 'plan_fee',
    description: `1ª mensalidade — plano ${plan.name}`,
    quantity: 1,
    unitPrice: roundCents(plan.priceMonthly),
    amount: roundCents(plan.priceMonthly),
  })
  const monthly = clampPercent(discount?.monthlyPercent, MAX_MONTHLY_DISCOUNT_PERCENT)
  const monthlyOff = discountAmount(plan.priceMonthly, monthly, MAX_MONTHLY_DISCOUNT_PERCENT)
  if (monthlyOff > 0) items.push(discountChargeItem('plan_fee', monthly, monthlyOff))
  return items
}

/**
 * Parte de ADESÃO de uma fatura: `setup_fee` + descontos `appliesTo: 'setup_fee'`.
 * O resto é a parte de mensalidade. Base da comissão do vendedor.
 */
export function chargeSetupFeeTotal(items: Pick<PlatformChargeItem, 'kind' | 'amount' | 'appliesTo'>[]): number {
  return roundCents(
    items
      .filter(item => item.kind === 'setup_fee' || (item.kind === 'discount' && item.appliesTo === 'setup_fee'))
      .reduce((acc, item) => acc + item.amount, 0),
  )
}

/**
 * Itens da fatura mensal (blueprint §0.4): mensalidade + excedente (vidas
 * apuradas NA GERAÇÃO) + split (receita do clube recebida no período anterior)
 * + ajustes pendentes (proporcional de upgrade etc.).
 */
export function monthlyChargeItems(
  sub: {
    planName: string
    planPriceMonthly: number
    memberLimit: number
    pricePerExtraLife: number
    revenueSharePercent: number
  },
  input: {
    lives: number
    clubRevenue: number
    periodLabel: string
    adjustments?: PlatformChargeItem[]
    /** % de desconto da mensalidade que vale NESTE período (`monthlyDiscountPercentFor`). */
    monthlyDiscountPercent?: number
  },
): PlatformChargeItem[] {
  const quote = quotePlatformPlan(
    { priceMonthly: sub.planPriceMonthly, memberLimit: sub.memberLimit },
    { setupFee: 0, pricePerExtraLife: sub.pricePerExtraLife, revenueSharePercent: sub.revenueSharePercent },
    input.lives,
    { clubRevenue: input.clubRevenue },
  )
  const items: PlatformChargeItem[] = [
    {
      kind: 'plan_fee',
      description: `Plano ${sub.planName} — ${input.periodLabel}`,
      quantity: 1,
      unitPrice: quote.planFee,
      amount: quote.planFee,
    },
  ]
  const monthlyPercent = clampPercent(input.monthlyDiscountPercent, MAX_MONTHLY_DISCOUNT_PERCENT)
  const monthlyOff = discountAmount(quote.planFee, monthlyPercent, MAX_MONTHLY_DISCOUNT_PERCENT)
  if (monthlyOff > 0) items.push(discountChargeItem('plan_fee', monthlyPercent, monthlyOff))
  if (quote.extraLives > 0 && quote.pricePerExtraLife > 0) {
    items.push({
      kind: 'overage',
      description: `${quote.extraLives} vida(s) acima do limite de ${quote.memberLimit}`,
      quantity: quote.extraLives,
      unitPrice: quote.pricePerExtraLife,
      amount: quote.overageTotal,
    })
  }
  if (quote.revenueShareTotal > 0) {
    items.push({
      kind: 'revenue_share',
      description: `${quote.revenueSharePercent}% da receita do clube no período anterior`,
      quantity: 1,
      unitPrice: quote.revenueShareTotal,
      amount: quote.revenueShareTotal,
    })
  }
  return [...items, ...(input.adjustments ?? [])]
}

/** Dias entre duas datas `yyyy-MM-dd` (b − a), em UTC — sem fuso envolvido. */
export function daysBetweenDates(a: string, b: string): number {
  const parse = (value: string) => {
    const [y, m, d] = value.split('-').map(Number)
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)
  }
  return Math.round((parse(b) - parse(a)) / 86_400_000)
}

/**
 * Proporcional de upgrade: (novo − atual) × dias restantes ÷ dias do período,
 * lançado como ajuste na PRÓXIMA fatura. `null` quando não há diferença a cobrar.
 */
export function prorationItem(input: {
  oldPlanName: string
  newPlanName: string
  oldPrice: number
  newPrice: number
  periodStart: string
  periodEnd: string
  changeDate: string
}): PlatformChargeItem | null {
  const periodDays = daysBetweenDates(input.periodStart, input.periodEnd)
  const remaining = Math.min(periodDays, Math.max(0, daysBetweenDates(input.changeDate, input.periodEnd)))
  const diff = input.newPrice - input.oldPrice
  if (periodDays <= 0 || remaining <= 0 || diff <= 0) return null
  const amount = roundCents((diff * remaining) / periodDays)
  if (amount <= 0) return null
  return {
    kind: 'proration',
    description: `Upgrade ${input.oldPlanName} → ${input.newPlanName}: ${remaining} de ${periodDays} dias`,
    quantity: 1,
    unitPrice: amount,
    amount,
  }
}

// ---------------------------------------------------------------------------
// Régua da plataforma
// ---------------------------------------------------------------------------

/** Régua (`platform_billing_settings`, linha única `id = 'default'`). */
export const platformBillingSettings = z.object({
  /** Gateway efetivo agora (override → env `PLATFORM_PAYMENT_GATEWAY` → simulado). */
  gateway: paymentGatewayProvider,
  gatewayOverride: paymentGatewayProvider.nullable(),
  asaasConfigured: z.boolean(),
  sandbox: z.boolean(),
  enabledMethods: z.array(clubPaymentMethod).min(1),
  generateDaysBefore: z.number().int().min(0).max(30),
  reminderDaysBefore: z.number().int().min(0).max(15),
  /** Atraso (dias, cobrança aberta mais antiga) para o painel virar SOMENTE LEITURA. */
  restrictAfterDays: z.number().int().min(1).max(90),
  /** Atraso para BLOQUEAR o painel (> restrictAfterDays). */
  suspendAfterDays: z.number().int().min(2).max(180),
  /** Atraso para cancelar a assinatura (> suspendAfterDays). Nunca cancela o inquilino. */
  cancelAfterDays: z.number().int().min(3).max(365),
  boletoDueDays: z.number().int().min(1).max(30),
  finePercent: z.number().min(0).max(2),
  interestMonthlyPercent: z.number().min(0).max(1),
  maxCardRetries: z.number().int().min(0).max(10),
  cardRetryIntervalHours: z.number().int().min(1).max(168),
  /** Proposta aprovada sem pagamento da ativação por N dias → cancelada. */
  activationExpiryDays: z.number().int().min(1).max(60),
  /** Rascunho sem atividade por N dias → cancelado. */
  draftExpiryDays: z.number().int().min(1).max(180),
  automation: z.object({
    enabled: z.boolean(),
    intervalSeconds: z.number().int().positive(),
    lastRunAt: z.string().datetime().nullable(),
  }),
  /** Atalhos de demonstração (avançar dias) liberados neste servidor. */
  demoToolsEnabled: z.boolean(),
})
export type PlatformBillingSettings = z.infer<typeof platformBillingSettings>

export const DEFAULT_PLATFORM_BILLING_POLICY = {
  enabledMethods: ['pix', 'boleto', 'credit_card'],
  generateDaysBefore: 10,
  reminderDaysBefore: 3,
  restrictAfterDays: 10,
  suspendAfterDays: 30,
  cancelAfterDays: 90,
  boletoDueDays: 5,
  finePercent: 2,
  interestMonthlyPercent: 1,
  maxCardRetries: 3,
  cardRetryIntervalHours: 24,
  activationExpiryDays: 15,
  draftExpiryDays: 30,
} as const satisfies Omit<
  PlatformBillingSettings,
  'gateway' | 'gatewayOverride' | 'asaasConfigured' | 'sandbox' | 'automation' | 'demoToolsEnabled'
>

export const updatePlatformBillingSettingsInput = platformBillingSettings
  .pick({
    gatewayOverride: true,
    enabledMethods: true,
    generateDaysBefore: true,
    reminderDaysBefore: true,
    restrictAfterDays: true,
    suspendAfterDays: true,
    cancelAfterDays: true,
    boletoDueDays: true,
    finePercent: true,
    interestMonthlyPercent: true,
    maxCardRetries: true,
    cardRetryIntervalHours: true,
    activationExpiryDays: true,
    draftExpiryDays: true,
  })
  .partial()
export type UpdatePlatformBillingSettingsInput = z.infer<typeof updatePlatformBillingSettingsInput>

/** restrict < suspend < cancel. A API valida o resultado do merge com o gravado. `null` = ok. */
export function validatePlatformDunningOrder(s: {
  restrictAfterDays: number
  suspendAfterDays: number
  cancelAfterDays: number
}): string | null {
  if (s.suspendAfterDays <= s.restrictAfterDays) return 'Suspensão precisa vir depois da restrição'
  if (s.cancelAfterDays <= s.suspendAfterDays) return 'Cancelamento precisa vir depois da suspensão'
  return null
}

/**
 * Próximo degrau da régua pela cobrança aberta mais antiga (puro; hoje por
 * parâmetro). Cancelar tem precedência; pula degraus quando o atraso já passou
 * de vários limites (ex.: 35 dias em `past_due` → `suspend`).
 */
export function platformDelinquencyAction(
  status: PlatformSubscriptionStatus,
  oldestOpenDueDate: string | null,
  today: string,
  settings: Pick<PlatformBillingSettings, 'restrictAfterDays' | 'suspendAfterDays' | 'cancelAfterDays'>,
): 'restrict' | 'suspend' | 'cancel' | null {
  if (!oldestOpenDueDate) return null
  if (status !== 'past_due' && status !== 'restricted' && status !== 'suspended') return null
  const daysLate = daysBetweenDates(oldestOpenDueDate, today)
  if (daysLate >= settings.cancelAfterDays) return 'cancel'
  if (daysLate >= settings.suspendAfterDays && status !== 'suspended') return 'suspend'
  if (daysLate >= settings.restrictAfterDays && status === 'past_due') return 'restrict'
  return null
}

// ---------------------------------------------------------------------------
// Blocos de leitura
// ---------------------------------------------------------------------------

export const platformCharge = z.object({
  id: uuid,
  organizationId: z.string().nullable(),
  tenantName: z.string().nullable(),
  tenantSlug: z.string().nullable(),
  subscriptionId: uuid.nullable(),
  proposalId: uuid.nullable(),
  kind: platformChargeKind,
  /** `null` na ativação até o provisionamento definir o 1º período. */
  periodStart: dateOnly.nullable(),
  periodEnd: dateOnly.nullable(),
  dueDate: dateOnly,
  amount: z.number().nonnegative(),
  items: z.array(platformChargeItem),
  /** Vidas apuradas na geração (fatura mensal). */
  livesCount: z.number().int().nullable(),
  description: z.string(),
  method: clubPaymentMethod,
  status: platformChargeStatus,
  attempts: z.number().int().nonnegative(),
  failureReason: z.string().nullable(),
  paidAt: z.string().datetime().nullable(),
  paidAmount: z.number().nullable(),
  canceledAt: z.string().datetime().nullable(),
  refundedAt: z.string().datetime().nullable(),
  invoiceUrl: z.string().nullable(),
  pix: clubPixData.nullable(),
  boleto: clubBoletoData.nullable(),
  card: clubCardInfo.nullable(),
  gatewayProvider: paymentGatewayProvider,
  gatewayChargeId: z.string().nullable(),
  /**
   * Página pública da fatura (web `/fatura-annetec/:id?chave=`), com a chave
   * HMAC da cobrança. É o link dos e-mails e do botão "Pagar".
   */
  publicUrl: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type PlatformCharge = z.infer<typeof platformCharge>

export const platformBillingEvent = z.object({
  id: uuid,
  organizationId: z.string().nullable(),
  subscriptionId: uuid.nullable(),
  chargeId: uuid.nullable(),
  proposalId: uuid.nullable(),
  /** Um de `PLATFORM_BILLING_EVENT_TYPES` (ou tipo cru do gateway). */
  type: z.string(),
  source: platformEventSource,
  /** Frase pronta para a timeline, pt-BR. */
  message: z.string(),
  gatewayProvider: paymentGatewayProvider.nullable(),
  createdAt: z.string().datetime(),
})
export type PlatformBillingEvent = z.infer<typeof platformBillingEvent>

export const platformSubscriptionAccess = z.object({
  level: platformAccessLevel,
  source: z.enum(['billing', 'override']),
  overrideReason: z.string().nullable(),
  overrideUntil: z.string().datetime().nullable(),
})
export type PlatformSubscriptionAccess = z.infer<typeof platformSubscriptionAccess>

export const platformSubscription = z.object({
  id: uuid,
  organizationId: z.string(),
  tenantName: z.string(),
  tenantSlug: z.string(),
  proposalId: uuid.nullable(),
  planId: uuid.nullable(),
  /** Retrato do plano na contratação/última troca. */
  planName: z.string(),
  planPriceMonthly: z.number(),
  memberLimit: z.number().int(),
  pricePerExtraLife: z.number(),
  setupFee: z.number(),
  revenueSharePercent: z.number(),
  status: platformSubscriptionStatus,
  access: platformSubscriptionAccess,
  paymentMethod: clubPaymentMethod,
  dueDay: z.number().int().min(1).max(28),
  startedAt: z.string().datetime().nullable(),
  currentPeriodStart: dateOnly.nullable(),
  currentPeriodEnd: dateOnly.nullable(),
  nextDueDate: dateOnly.nullable(),
  paymentCard: clubCardInfo.nullable(),
  billingName: z.string(),
  /** CNPJ, só dígitos. */
  billingDocument: z.string(),
  billingEmail: z.string(),
  /** Downgrade agendado para o próximo ciclo. */
  scheduledPlanId: uuid.nullable(),
  scheduledPlanName: z.string().nullable(),
  /** Vidas ativas agora (ver blueprint §0.6 — titulares + dependentes de assinaturas `active`/`past_due`). */
  lives: z.number().int(),
  usagePct: z.number(),
  /** Mensal estimado agora = quote(vidas atuais).monthlyTotal (sem split), já com o desconto vigente. */
  estimatedMonthly: z.number(),
  /**
   * Desconto da mensalidade aprovado na venda (vendedor + superadmin): `until`
   * = último dia coberto (inclusive; `null` = permanente). `null` sem desconto.
   */
  monthlyDiscount: z.object({ percent: z.number(), until: dateOnly.nullable() }).nullable(),
  /** Soma das cobranças `pending`/`overdue`/`failed`. */
  openAmount: z.number(),
  overdueCount: z.number().int().nonnegative(),
  oldestOpenDueDate: dateOnly.nullable(),
  /** Dias de atraso da cobrança aberta mais antiga (0 se em dia). */
  daysLate: z.number().int().nonnegative(),
  pastDueAt: z.string().datetime().nullable(),
  restrictedAt: z.string().datetime().nullable(),
  suspendedAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  cancelReason: z.string().nullable(),
  gatewayProvider: paymentGatewayProvider,
  source: z.enum(['onboarding', 'seed', 'console']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type PlatformSubscription = z.infer<typeof platformSubscription>

export const platformSubscriptionDetail = platformSubscription.extend({
  charges: z.array(platformCharge),
  events: z.array(platformBillingEvent),
})
export type PlatformSubscriptionDetail = z.infer<typeof platformSubscriptionDetail>

export const platformChargeDetail = platformCharge.extend({
  subscription: platformSubscription.nullable(),
  events: z.array(platformBillingEvent),
})
export type PlatformChargeDetail = z.infer<typeof platformChargeDetail>

// ---------------------------------------------------------------------------
// Console da plataforma — consultas e comandos
// ---------------------------------------------------------------------------

export const listPlatformChargesQuery = paginationQuery.extend({
  status: platformChargeStatus.optional(),
  kind: platformChargeKind.optional(),
  method: clubPaymentMethod.optional(),
  /** Vencimento, inclusive. */
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  organizationId: z.string().min(1).optional(),
  subscriptionId: uuid.optional(),
})
export type ListPlatformChargesQuery = z.infer<typeof listPlatformChargesQuery>

/** `q` busca por nome/slug do inquilino ou CNPJ. */
export const listPlatformSubscriptionsQuery = paginationQuery.extend({
  status: platformSubscriptionStatus.optional(),
  access: platformAccessLevel.optional(),
  planId: uuid.optional(),
})
export type ListPlatformSubscriptionsQuery = z.infer<typeof listPlatformSubscriptionsQuery>

export const listPlatformBillingEventsQuery = paginationQuery.extend({
  organizationId: z.string().min(1).optional(),
  subscriptionId: uuid.optional(),
  chargeId: uuid.optional(),
  proposalId: uuid.optional(),
  source: platformEventSource.optional(),
})
export type ListPlatformBillingEventsQuery = z.infer<typeof listPlatformBillingEventsQuery>

/** Segunda via: novo vencimento (padrão hoje + `boletoDueDays`) e, opcionalmente, troca Pix↔boleto. */
export const reissuePlatformChargeInput = z.object({
  dueDate: dateOnly.optional(),
  method: z.enum(['pix', 'boleto']).optional(),
})
export type ReissuePlatformChargeInput = z.infer<typeof reissuePlatformChargeInput>

export const platformManualPaymentInput = z.object({
  paidAt: dateOnly.optional(),
  amount: z.number().positive().optional(),
  note: z.string().trim().max(500).optional(),
})
export type PlatformManualPaymentInput = z.infer<typeof platformManualPaymentInput>

export const cancelPlatformChargeInput = z.object({ reason: z.string().trim().max(500).optional() })
export type CancelPlatformChargeInput = z.infer<typeof cancelPlatformChargeInput>

export const cancelPlatformSubscriptionInput = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo').max(500),
})
export type CancelPlatformSubscriptionInput = z.infer<typeof cancelPlatformSubscriptionInput>

/** Upgrade vale na hora (+ proporcional na próxima fatura); downgrade agenda para o próximo ciclo. */
export const changePlatformPlanInput = z.object({ planId: uuid })
export type ChangePlatformPlanInput = z.infer<typeof changePlatformPlanInput>

/** Pagar uma fatura da plataforma (página pública): método + cartão quando `credit_card`. */
export const payPlatformChargeInput = checkoutPaymentInput
export type PayPlatformChargeInput = z.infer<typeof payPlatformChargeInput>

/** Demonstração: "o tempo passa" N dias para a assinatura (datas e cobranças abertas recuam). */
export const demoTimeTravelInput = z.object({ days: z.number().int().min(1).max(120) })
export type DemoTimeTravelInput = z.infer<typeof demoTimeTravelInput>

/** `GET /platform/billing/resumo`. Fórmulas exatas em blueprint §0.4. */
export const platformBillingSummary = z.object({
  gateway: paymentGatewayProvider,
  sandbox: z.boolean(),
  /** Σ estimatedMonthly das assinaturas `active` + `past_due` + `restricted`. */
  mrr: z.number(),
  activeSubscriptions: z.number().int(),
  pastDueSubscriptions: z.number().int(),
  restrictedSubscriptions: z.number().int(),
  suspendedSubscriptions: z.number().int(),
  canceledSubscriptions: z.number().int(),
  newThisMonth: z.number().int(),
  canceledThisMonth: z.number().int(),
  totalLives: z.number().int(),
  /** Σ vidas acima do limite (oportunidade de upgrade). */
  extraLives: z.number().int(),
  overdueAmount: z.number(),
  overdueCharges: z.number().int(),
  /** % = overdueAmount ÷ faturado com vencimento nos últimos 90 dias (exceto canceladas). */
  delinquencyRate: z.number(),
  receivedThisMonth: z.number(),
  pendingThisMonth: z.number(),
  forecastNextMonth: z.number(),
  /** Ativações pagas no mês (adesão + 1ª mensalidade). */
  activationRevenueThisMonth: z.number(),
  monthly: z.array(z.object({ month: z.string(), billed: z.number(), received: z.number(), overdue: z.number() })),
  lastAutomationRunAt: z.string().datetime().nullable(),
})
export type PlatformBillingSummary = z.infer<typeof platformBillingSummary>

/** `POST /platform/billing/automacao/executar`. */
export const platformBillingAutomationReport = z.object({
  ranAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  synced: z.number().int(),
  generated: z.number().int(),
  cardCharged: z.number().int(),
  cardFailed: z.number().int(),
  remindersSent: z.number().int(),
  markedOverdue: z.number().int(),
  pastDue: z.number().int(),
  restricted: z.number().int(),
  suspended: z.number().int(),
  canceled: z.number().int(),
  reactivated: z.number().int(),
  overridesExpired: z.number().int(),
  proposalsExpired: z.number().int(),
  errors: z.array(z.string()),
})
export type PlatformBillingAutomationReport = z.infer<typeof platformBillingAutomationReport>

// ---------------------------------------------------------------------------
// Página pública da fatura e painel do inquilino
// ---------------------------------------------------------------------------

/** `GET /api/v1/public/faturas-annetec/:chargeId?chave=`. */
export const platformPublicInvoice = z.object({
  charge: platformCharge,
  payerName: z.string(),
  /** CNPJ formatado. */
  payerDocument: z.string(),
  tenantName: z.string().nullable(),
  proposalCode: z.string().nullable(),
  enabledMethods: z.array(clubPaymentMethod),
  /** Mostra "Simular pagamento" (gateway simulado ou Asaas sandbox). */
  canSimulatePayment: z.boolean(),
  /** `true` no modo simulado: a página imprimível exibe a tarja "documento sem valor". */
  simulated: z.boolean(),
  /** Gateway real em ambiente de testes (Asaas sandbox): nenhum valor é cobrado. */
  sandbox: z.boolean(),
  /**
   * Fatura em aberto cujo Pix guardado já expirou: a página esconde o código
   * velho e oferece "Gerar novo Pix" (mesma fatura, mesmo vencimento).
   */
  pixExpired: z.boolean(),
  beneficiaryName: z.string(),
})
export type PlatformPublicInvoice = z.infer<typeof platformPublicInvoice>

/** `GET /t/:slug/assinatura-annetec/acesso` — o que o banner do painel precisa. */
export const tenantPlatformAccess = z.object({
  /** Tem assinatura de plataforma. `false` = contrato fora da cobrança automática (nunca restringe). */
  managed: z.boolean(),
  level: platformAccessLevel,
  status: platformSubscriptionStatus.nullable(),
  source: z.enum(['billing', 'override']).nullable(),
  /** Frase pronta para o banner (pt-BR); `null` quando está tudo em dia. */
  message: z.string().nullable(),
  openAmount: z.number(),
  oldestOpenDueDate: dateOnly.nullable(),
  daysLate: z.number().int().nonnegative(),
  /** Quando o próximo degrau acontece se nada for pago. */
  restrictsOn: dateOnly.nullable(),
  suspendsOn: dateOnly.nullable(),
  /** Fatura aberta mais antiga (link público de pagamento — e-mails). */
  payUrl: z.string().nullable(),
  /** Id dessa fatura: o painel paga por `/{slug}/admin/assinatura/faturas/<id>` (sem sair do painel). */
  payChargeId: z.string().uuid().nullable(),
})
export type TenantPlatformAccess = z.infer<typeof tenantPlatformAccess>

export const platformUsage = z.object({
  lives: z.number().int(),
  memberLimit: z.number().int(),
  usagePct: z.number(),
  extraLives: z.number().int(),
  /** Excedente que entraria na próxima fatura se as vidas ficassem como estão. */
  projectedOverage: z.number(),
})
export type PlatformUsage = z.infer<typeof platformUsage>

/** `GET /t/:slug/assinatura-annetec` — "Minha assinatura ANNETEC". */
export const myPlatformSubscription = z.object({
  managed: z.boolean(),
  subscription: platformSubscription.nullable(),
  access: tenantPlatformAccess,
  usage: platformUsage.nullable(),
  /** Cotação do plano atual com as vidas de agora. */
  currentQuote: platformPlanQuote.nullable(),
  nextCharge: platformCharge.nullable(),
  openCharges: z.array(platformCharge),
  /** Últimas 12 faturas, mais recente primeiro. */
  recentCharges: z.array(platformCharge),
  upgradeOptions: z.array(
    z.object({
      plan: platformPlanOffer,
      quote: platformPlanQuote,
      isCurrent: z.boolean(),
      /** Mensalidade maior que a atual (vale na hora). */
      isUpgrade: z.boolean(),
    }),
  ),
})
export type MyPlatformSubscription = z.infer<typeof myPlatformSubscription>
