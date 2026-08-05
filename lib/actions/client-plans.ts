import type { ClientPlan } from '@/lib/types'
import { createEntityActions } from './_factory'
import { delay, genId, type ActionResult } from './_shared'

const clientPlans = createEntityActions<ClientPlan>('client-plans', [])

export const updateClientPlan = clientPlans.update
export const deleteClientPlan = clientPlans.remove

export async function listClientPlans(tenantId: string): Promise<ActionResult<ClientPlan[]>> {
  await delay()
  return { success: true, data: clientPlans.collection.getAll().filter(p => p.tenantId === tenantId) }
}

export async function createClientPlan(input: Omit<ClientPlan, 'id'>): Promise<ActionResult<ClientPlan>> {
  await delay()
  return { success: true, data: clientPlans.collection.create({ ...input, id: genId('cplan') }) }
}

export const purgeTenantClientPlans = clientPlans.purgeByTenant
