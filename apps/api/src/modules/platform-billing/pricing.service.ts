import {
  DEFAULT_TENANT_PLAN_PRICING,
  type PlatformPlanOffer,
  type TenantPlanPricing,
  type UpdateTenantPlanPricingInput,
} from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { tenantPlanPrices, tenantPlans } from '@/db/schema'
import { AppError } from '@/http/errors'

/**
 * Preço comercial dos planos ANNETEC (`tenant_plan_prices`, 1:1 com
 * `tenant_plans`; sem linha = `DEFAULT_TENANT_PLAN_PRICING`). É a vitrine da
 * contratação pública (Q1 lê `listPlanOffers({ publicOnly: true })`) e a base
 * do retrato do plano na assinatura.
 */

type PlanRow = typeof tenantPlans.$inferSelect
type PriceRow = typeof tenantPlanPrices.$inferSelect

export function pricingFromRow(planId: string, row: PriceRow | null | undefined): TenantPlanPricing {
  if (!row) return { planId, ...DEFAULT_TENANT_PLAN_PRICING }
  return {
    planId,
    setupFee: Number(row.setupFee),
    pricePerExtraLife: Number(row.pricePerExtraLife),
    revenueSharePercent: Number(row.revenueSharePercent),
    publicVisible: row.publicVisible,
    highlight: row.highlight,
    sortOrder: row.sortOrder ?? null,
    tagline: row.tagline ?? null,
    description: row.description ?? null,
  }
}

export function toPlanOffer(plan: PlanRow, price: PriceRow | null | undefined): PlatformPlanOffer {
  return {
    id: plan.id,
    name: plan.name,
    priceMonthly: Number(plan.priceMonthly),
    memberLimit: plan.memberLimit,
    features: plan.features ?? [],
    pricing: pricingFromRow(plan.id, price),
  }
}

/** `sortOrder` (nulos por último) e depois preço. */
export function sortOffers(offers: PlatformPlanOffer[]): PlatformPlanOffer[] {
  return [...offers].sort((a, b) => {
    const sa = a.pricing.sortOrder ?? Number.MAX_SAFE_INTEGER
    const sb = b.pricing.sortOrder ?? Number.MAX_SAFE_INTEGER
    if (sa !== sb) return sa - sb
    if (a.priceMonthly !== b.priceMonthly) return a.priceMonthly - b.priceMonthly
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}

export async function listPlanOffers(opts: { publicOnly?: boolean } = {}): Promise<PlatformPlanOffer[]> {
  const rows = await db
    .select({ plan: tenantPlans, price: tenantPlanPrices })
    .from(tenantPlans)
    .leftJoin(tenantPlanPrices, eq(tenantPlanPrices.planId, tenantPlans.id))
  const offers = rows.map(row => toPlanOffer(row.plan, row.price))
  return sortOffers(opts.publicOnly ? offers.filter(offer => offer.pricing.publicVisible) : offers)
}

export async function findPlanOffer(planId: string): Promise<PlatformPlanOffer | null> {
  const [row] = await db
    .select({ plan: tenantPlans, price: tenantPlanPrices })
    .from(tenantPlans)
    .leftJoin(tenantPlanPrices, eq(tenantPlanPrices.planId, tenantPlans.id))
    .where(eq(tenantPlans.id, planId))
    .limit(1)
  return row ? toPlanOffer(row.plan, row.price) : null
}

export async function getPlanOffer(planId: string): Promise<PlatformPlanOffer> {
  const offer = await findPlanOffer(planId)
  if (!offer) throw AppError.notFound('Plano')
  return offer
}

/** `PUT /platform/billing/precos/:planId` — upsert parcial. */
export async function updatePlanPricing(planId: string, input: UpdateTenantPlanPricingInput): Promise<PlatformPlanOffer> {
  const current = await getPlanOffer(planId)
  const merged = { ...current.pricing, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) }
  const values = {
    setupFee: String(merged.setupFee),
    pricePerExtraLife: String(merged.pricePerExtraLife),
    revenueSharePercent: String(merged.revenueSharePercent),
    publicVisible: merged.publicVisible,
    highlight: merged.highlight,
    sortOrder: merged.sortOrder,
    tagline: merged.tagline,
    description: merged.description,
    updatedAt: new Date(),
  }
  await db
    .insert(tenantPlanPrices)
    .values({ planId, ...values })
    .onConflictDoUpdate({ target: tenantPlanPrices.planId, set: values })
  return getPlanOffer(planId)
}

/** Retrato do plano copiado na assinatura (contratação ou troca). */
export function planSnapshot(offer: PlatformPlanOffer) {
  return {
    planId: offer.id,
    planName: offer.name,
    planPriceMonthly: String(offer.priceMonthly),
    memberLimit: offer.memberLimit,
    pricePerExtraLife: String(offer.pricing.pricePerExtraLife),
    setupFee: String(offer.pricing.setupFee),
    revenueSharePercent: String(offer.pricing.revenueSharePercent),
  }
}
