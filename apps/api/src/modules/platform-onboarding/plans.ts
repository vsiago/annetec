import { DEFAULT_TENANT_PLAN_PRICING, type PlatformPlanOffer } from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { tenantPlanPrices, tenantPlans } from '@/db/schema'

/**
 * Planos ANNETEC com preço (`tenant_plans` + `tenant_plan_prices`; sem linha
 * de preço = `DEFAULT_TENANT_PLAN_PRICING`) — vitrine da contratação e cotação
 * da proposta. Leitura só; quem edita preço é o console de cobrança (Q2).
 */
type PlanRow = typeof tenantPlans.$inferSelect
type PriceRow = typeof tenantPlanPrices.$inferSelect

function toOffer(plan: PlanRow, price: PriceRow | null): PlatformPlanOffer {
  return {
    id: plan.id,
    name: plan.name,
    priceMonthly: Number(plan.priceMonthly),
    memberLimit: plan.memberLimit,
    features: plan.features ?? [],
    pricing: {
      planId: plan.id,
      setupFee: price ? Number(price.setupFee) : DEFAULT_TENANT_PLAN_PRICING.setupFee,
      pricePerExtraLife: price ? Number(price.pricePerExtraLife) : DEFAULT_TENANT_PLAN_PRICING.pricePerExtraLife,
      revenueSharePercent: price ? Number(price.revenueSharePercent) : DEFAULT_TENANT_PLAN_PRICING.revenueSharePercent,
      publicVisible: price ? price.publicVisible : DEFAULT_TENANT_PLAN_PRICING.publicVisible,
      highlight: price ? price.highlight : DEFAULT_TENANT_PLAN_PRICING.highlight,
      sortOrder: price?.sortOrder ?? DEFAULT_TENANT_PLAN_PRICING.sortOrder,
      tagline: price?.tagline ?? DEFAULT_TENANT_PLAN_PRICING.tagline,
      description: price?.description ?? DEFAULT_TENANT_PLAN_PRICING.description,
    },
  }
}

/** Ordem da vitrine: `sortOrder` (sem valor por último), depois preço crescente. */
export function sortPlanOffers(offers: PlatformPlanOffer[]): PlatformPlanOffer[] {
  return [...offers].sort((a, b) => {
    const sa = a.pricing.sortOrder ?? Number.MAX_SAFE_INTEGER
    const sb = b.pricing.sortOrder ?? Number.MAX_SAFE_INTEGER
    if (sa !== sb) return sa - sb
    return a.priceMonthly - b.priceMonthly || a.name.localeCompare(b.name)
  })
}

export async function listPublicPlanOffers(): Promise<PlatformPlanOffer[]> {
  const rows = await db
    .select({ plan: tenantPlans, price: tenantPlanPrices })
    .from(tenantPlans)
    .leftJoin(tenantPlanPrices, eq(tenantPlanPrices.planId, tenantPlans.id))
  return sortPlanOffers(rows.map(row => toOffer(row.plan, row.price)).filter(offer => offer.pricing.publicVisible))
}

export async function findPlanOffer(planId: string): Promise<PlatformPlanOffer | null> {
  const [row] = await db
    .select({ plan: tenantPlans, price: tenantPlanPrices })
    .from(tenantPlans)
    .leftJoin(tenantPlanPrices, eq(tenantPlanPrices.planId, tenantPlans.id))
    .where(eq(tenantPlans.id, planId))
    .limit(1)
  return row ? toOffer(row.plan, row.price) : null
}
