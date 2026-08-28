import type { Benefit } from '@/lib/types'
import { seedBenefits } from '@/lib/mock-seed'
import { createEntityActions } from './_factory'
import { delay, genId, type ActionResult } from './_shared'

const benefits = createEntityActions<Benefit>('benefits', seedBenefits)

export const getBenefit = benefits.getById
export const updateBenefit = benefits.update
export const deleteBenefit = benefits.remove

export async function listBenefits(tenantId: string): Promise<ActionResult<Benefit[]>> {
  await delay()
  return { success: true, data: benefits.collection.getAll().filter(b => b.tenantId === tenantId) }
}

export async function createBenefit(input: Omit<Benefit, 'id'>): Promise<ActionResult<Benefit>> {
  await delay()
  return { success: true, data: benefits.collection.create({ ...input, id: genId('benefit') }) }
}

export const purgeTenantBenefits = benefits.purgeByTenant
