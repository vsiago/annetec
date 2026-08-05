import { createCollection } from '@/lib/storage/local-collection'
import { delay, type ActionResult } from './_shared'

// Shared CRUD shape reused by every entity in lib/actions/*.ts — every mock
// "action" below has the same async, delayed, { success, data, error }
// contract so the eventual swap to real Server Actions / API calls is
// mechanical.
export function createEntityActions<T extends { id: string }>(key: string, seed: T[]) {
  const collection = createCollection<T>(key, seed)

  async function list(): Promise<ActionResult<T[]>> {
    await delay()
    return { success: true, data: collection.getAll() }
  }

  async function getById(id: string): Promise<ActionResult<T | undefined>> {
    await delay()
    return { success: true, data: collection.getById(id) }
  }

  async function create(item: T): Promise<ActionResult<T>> {
    await delay()
    return { success: true, data: collection.create(item) }
  }

  async function update(id: string, patch: Partial<T>): Promise<ActionResult<T>> {
    await delay()
    const updated = collection.update(id, patch)
    if (!updated) return { success: false, error: 'Registro não encontrado' }
    return { success: true, data: updated }
  }

  async function remove(id: string): Promise<ActionResult<null>> {
    await delay()
    const ok = collection.remove(id)
    if (!ok) return { success: false, error: 'Registro não encontrado' }
    return { success: true, data: null }
  }

  // Drops every row belonging to a tenant. Called when a tenant is deleted so
  // its records don't linger in localStorage as unreachable garbage.
  function purgeByTenant(tenantId: string) {
    collection
      .getAll()
      .filter(item => (item as { tenantId?: string }).tenantId === tenantId)
      .forEach(item => collection.remove(item.id))
  }

  return { collection, list, getById, create, update, remove, purgeByTenant }
}
