import type { Tenant } from '@/lib/types'
import { seedTenants } from '@/lib/mock-seed'
import { createEntityActions } from './_factory'
import { delay, genId, type ActionResult } from './_shared'
import { purgeTenantUsers } from './tenant-users'
import { purgeTenantBenefits } from './benefits'
import { purgeTenantPartners } from './partners'
import { purgeTenantLeads } from './leads'
import { purgeTenantSales } from './sales'
import { purgeTenantAppointments } from './appointments'
import { purgeTenantClientPlans } from './client-plans'

const tenants = createEntityActions<Tenant>('tenants', seedTenants)

export const listTenants = tenants.list
export const getTenant = tenants.getById
export const updateTenant = tenants.update

// Deleting a tenant must take all of its data with it — users, credentials,
// CRM records and catalog. Otherwise those rows stay in localStorage forever,
// unreachable but still counted by any global lookup.
export async function deleteTenant(id: string): Promise<ActionResult<null>> {
  await delay()
  const tenant = tenants.collection.getById(id)
  if (!tenant) return { success: false, error: 'Inquilino não encontrado' }

  purgeTenantUsers(id)
  purgeTenantBenefits(id)
  purgeTenantPartners(id)
  purgeTenantLeads(id)
  purgeTenantSales(id)
  purgeTenantAppointments(id)
  purgeTenantClientPlans(id)
  tenants.collection.remove(id)

  return { success: true, data: null }
}

export interface CreateTenantInput {
  name: string
  legalName: string
  slug: string
  document: string
  email: string
  phone: string
  address: Tenant['address']
  branding: Tenant['branding']
  planId: string
}

export async function getTenantBySlug(slug: string): Promise<ActionResult<Tenant | undefined>> {
  await delay()
  const found = tenants.collection.getAll().find(t => t.slug === slug)
  return { success: true, data: found }
}

export async function isSlugTaken(slug: string): Promise<boolean> {
  await delay(100)
  return tenants.collection.getAll().some(t => t.slug === slug)
}

export async function createTenant(input: CreateTenantInput): Promise<ActionResult<Tenant>> {
  await delay()
  if (tenants.collection.getAll().some(t => t.slug === input.slug)) {
    return { success: false, error: 'Já existe um inquilino com esse identificador (slug)' }
  }
  const tenant: Tenant = {
    id: genId('tenant'),
    slug: input.slug,
    name: input.name,
    legalName: input.legalName,
    document: input.document,
    email: input.email,
    phone: input.phone,
    address: input.address,
    branding: input.branding,
    planId: input.planId,
    status: 'trial',
    createdAt: new Date(),
  }
  return { success: true, data: tenants.collection.create(tenant) }
}

export async function setTenantStatus(id: string, status: Tenant['status']): Promise<ActionResult<Tenant>> {
  return updateTenant(id, { status })
}
