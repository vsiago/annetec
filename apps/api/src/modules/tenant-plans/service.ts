import type { CreateTenantPlanInput, TenantPlan } from '@annetec/contracts'
import { desc } from 'drizzle-orm'
import { db } from '@/db/client'
import { tenantPlans } from '@/db/schema'

/** Catálogo de planos que a Annetec vende aos inquilinos. Poucos registros — sem paginação. */
export const tenantPlansService = {
  async list(): Promise<TenantPlan[]> {
    const rows = await db.select().from(tenantPlans).orderBy(desc(tenantPlans.priceMonthly))
    return rows.map(toDomain)
  },

  async create(input: CreateTenantPlanInput): Promise<TenantPlan> {
    const [row] = await db
      .insert(tenantPlans)
      .values({
        name: input.name,
        priceMonthly: String(input.priceMonthly),
        memberLimit: input.memberLimit,
        features: input.features,
      })
      .returning()
    return toDomain(row!)
  },
}

type Row = typeof tenantPlans.$inferSelect

function toDomain(row: Row): TenantPlan {
  return {
    id: row.id,
    name: row.name,
    priceMonthly: Number(row.priceMonthly),
    memberLimit: row.memberLimit,
    features: row.features,
  }
}
