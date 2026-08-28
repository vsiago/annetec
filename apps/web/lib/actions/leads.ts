import type { Lead, Interaction } from '@/lib/types'
import { seedLeads } from '@/lib/mock-seed'
import { createEntityActions } from './_factory'
import { delay, genId, type ActionResult } from './_shared'

const leads = createEntityActions<Lead>('leads', seedLeads)

export const getLead = leads.getById
export const deleteLead = leads.remove

export async function listLeads(tenantId: string): Promise<ActionResult<Lead[]>> {
  await delay()
  return { success: true, data: leads.collection.getAll().filter(l => l.tenantId === tenantId) }
}

export async function listLeadsBySeller(tenantId: string, sellerId: string): Promise<ActionResult<Lead[]>> {
  await delay()
  return {
    success: true,
    data: leads.collection.getAll().filter(l => l.tenantId === tenantId && l.sellerId === sellerId),
  }
}

export async function createLead(input: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'interactions'>): Promise<ActionResult<Lead>> {
  await delay()
  const now = new Date()
  return {
    success: true,
    data: leads.collection.create({ ...input, id: genId('lead'), createdAt: now, updatedAt: now, interactions: [] }),
  }
}

export async function updateLead(id: string, patch: Partial<Lead>): Promise<ActionResult<Lead>> {
  return leads.update(id, { ...patch, updatedAt: new Date() })
}

export async function addLeadInteraction(id: string, interaction: Omit<Interaction, 'id'>): Promise<ActionResult<Lead>> {
  await delay()
  const lead = leads.collection.getById(id)
  if (!lead) return { success: false, error: 'Lead não encontrado' }
  const interactions = [...lead.interactions, { ...interaction, id: genId('int') }]
  return updateLead(id, { interactions })
}

export const purgeTenantLeads = leads.purgeByTenant
