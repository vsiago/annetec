import {
  ERROR_CODES,
  type CreateTenantPlanInput,
  type TenantPlan,
  type UpdateTenantPlanInput,
} from '@annetec/contracts'
import { count, desc, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { tenantPlans, tenantProfiles } from '@/db/schema'
import { AppError } from '@/http/errors'

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

  async update(id: string, input: UpdateTenantPlanInput): Promise<TenantPlan> {
    const [row] = await db
      .update(tenantPlans)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.priceMonthly !== undefined ? { priceMonthly: String(input.priceMonthly) } : {}),
        ...(input.memberLimit !== undefined ? { memberLimit: input.memberLimit } : {}),
        ...(input.features !== undefined ? { features: input.features } : {}),
      })
      .where(eq(tenantPlans.id, id))
      .returning()
    if (!row) throw AppError.notFound('Plano')
    return toDomain(row)
  },

  /**
   * Só remove plano que ninguém contratou. `tenant_profiles.plan_id` é
   * `ON DELETE SET NULL`, então apagar um plano em uso deixaria inquilinos
   * sem plano em silêncio — e a tela de MRR passaria a contá-los como zero.
   */
  async remove(id: string): Promise<void> {
    const [uso] = await db
      .select({ value: count() })
      .from(tenantProfiles)
      .where(eq(tenantProfiles.planId, id))
    const emUso = uso?.value ?? 0

    if (emUso > 0) {
      throw new AppError(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
        `Este plano está em uso por ${emUso} inquilino(s). Mova-os para outro plano antes de remover.`,
      )
    }

    const removed = await db.delete(tenantPlans).where(eq(tenantPlans.id, id)).returning()
    if (removed.length === 0) throw AppError.notFound('Plano')
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
