/**
 * (Aposentado) Mock em localStorage. O painel não lê mais daqui: atendimento
 * agora vem de `/atendimentos` e os planos do clube de `/rede/planos`, ambos
 * via `contexts/tenant-data-context.tsx`.
 *
 * O arquivo só continua de pé por causa de `purgeTenant*`, chamado pelo mock
 * de exclusão de inquilino em `lib/actions/tenants.ts`. Some junto com ele.
 */
import type { ClientPlan } from '@/lib/types'
import { seedClientPlans } from '@/lib/mock-seed'
import { createEntityActions } from './_factory'
import { delay, genId, type ActionResult } from './_shared'

const clientPlans = createEntityActions<ClientPlan>('client-plans', seedClientPlans)

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
