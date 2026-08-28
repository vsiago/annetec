import type { Partner } from '@/lib/types'
import { seedPartners } from '@/lib/mock-seed'
import { createEntityActions } from './_factory'
import { delay, genId, type ActionResult } from './_shared'

const partners = createEntityActions<Partner>('partners', seedPartners)

export const getPartner = partners.getById
export const updatePartner = partners.update
export const deletePartner = partners.remove

export async function listPartners(tenantId: string): Promise<ActionResult<Partner[]>> {
  await delay()
  return { success: true, data: partners.collection.getAll().filter(p => p.tenantId === tenantId) }
}

export async function createPartner(input: Omit<Partner, 'id'>): Promise<ActionResult<Partner>> {
  await delay()
  return { success: true, data: partners.collection.create({ ...input, id: genId('partner') }) }
}

export const purgeTenantPartners = partners.purgeByTenant
