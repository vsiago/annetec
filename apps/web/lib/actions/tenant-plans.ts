import type { TenantPlan } from '@/lib/types'
import { seedTenantPlans } from '@/lib/mock-seed'
import { createEntityActions } from './_factory'
import { genId, type ActionResult } from './_shared'

const plans = createEntityActions<TenantPlan>('tenant-plans', seedTenantPlans)

export const listPlans = plans.list
export const getPlan = plans.getById
export const updatePlan = plans.update
export const deletePlan = plans.remove

export async function createPlan(input: Omit<TenantPlan, 'id'>): Promise<ActionResult<TenantPlan>> {
  return plans.create({ ...input, id: genId('plan') })
}
