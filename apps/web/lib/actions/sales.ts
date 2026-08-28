import type { Sale, SalesGoal } from '@/lib/types'
import { seedSales, seedSalesGoals } from '@/lib/mock-seed'
import { createEntityActions } from './_factory'
import { delay, genId, type ActionResult } from './_shared'

const sales = createEntityActions<Sale>('sales', seedSales)
const goals = createEntityActions<SalesGoal>('sales-goals', seedSalesGoals)

export const updateSale = sales.update
export const updateSalesGoal = goals.update

export async function listSales(tenantId: string): Promise<ActionResult<Sale[]>> {
  await delay()
  return { success: true, data: sales.collection.getAll().filter(s => s.tenantId === tenantId) }
}

export async function listSalesBySeller(tenantId: string, sellerId: string): Promise<ActionResult<Sale[]>> {
  await delay()
  return {
    success: true,
    data: sales.collection.getAll().filter(s => s.tenantId === tenantId && s.sellerId === sellerId),
  }
}

export async function createSale(input: Omit<Sale, 'id'>): Promise<ActionResult<Sale>> {
  await delay()
  return { success: true, data: sales.collection.create({ ...input, id: genId('sale') }) }
}

export async function listSalesGoals(tenantId: string): Promise<ActionResult<SalesGoal[]>> {
  await delay()
  return { success: true, data: goals.collection.getAll().filter(g => g.tenantId === tenantId) }
}

export function purgeTenantSales(tenantId: string) {
  sales.purgeByTenant(tenantId)
  goals.purgeByTenant(tenantId)
}
