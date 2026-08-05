import type { User, Seller, Client, UserRole } from '@/lib/types'
import { seedUsers, seedTenantCredentials } from '@/lib/mock-seed'
import { createCollection } from '@/lib/storage/local-collection'
import { createEntityActions } from './_factory'
import { delay, genId, type ActionResult } from './_shared'

type TenantUser = User | Seller | Client

interface TenantCredential {
  id: string
  email: string
  password: string
  userId: string
  tenantId: string
}

const users = createEntityActions<TenantUser>('tenant-users', seedUsers)
const credentials = createCollection<TenantCredential>(
  'tenant-credentials',
  seedTenantCredentials.map(c => ({ ...c, id: c.userId }))
)

export const getUserById = users.getById

export async function updateUser(id: string, patch: Partial<TenantUser>): Promise<ActionResult<TenantUser>> {
  // Keep the credential row's email in sync, otherwise the user would still
  // have to log in with their previous address after an email change.
  if (patch.email) {
    const target = users.collection.getById(id)
    const clash = credentials
      .getAll()
      .some(c => c.tenantId === target?.tenantId && c.userId !== id && c.email.toLowerCase() === patch.email!.toLowerCase())
    if (clash) return { success: false, error: 'Já existe um usuário com esse e-mail neste clube' }
    credentials.update(id, { email: patch.email })
  }
  return users.update(id, patch)
}

export async function deleteUser(id: string): Promise<ActionResult<null>> {
  // Cascade: drop the credential too, otherwise the orphaned row keeps the
  // email reserved and blocks re-creating a user with the same address.
  credentials.remove(id)
  return users.remove(id)
}

export async function setUserPassword(id: string, password: string): Promise<ActionResult<null>> {
  await delay()
  const updated = credentials.update(id, { password })
  if (!updated) return { success: false, error: 'Credencial não encontrada' }
  return { success: true, data: null }
}

// Removes every user + credential of a tenant. Used when a tenant is deleted
// so its data does not linger in localStorage forever.
export function purgeTenantUsers(tenantId: string) {
  users.collection
    .getAll()
    .filter(u => u.tenantId === tenantId)
    .forEach(u => users.collection.remove(u.id))
  credentials
    .getAll()
    .filter(c => c.tenantId === tenantId)
    .forEach(c => credentials.remove(c.id))
}

export async function listUsers(tenantId: string): Promise<ActionResult<TenantUser[]>> {
  await delay()
  return { success: true, data: users.collection.getAll().filter(u => u.tenantId === tenantId) }
}

export async function listUsersByRole(tenantId: string, role: UserRole): Promise<ActionResult<TenantUser[]>> {
  await delay()
  return {
    success: true,
    data: users.collection.getAll().filter(u => u.tenantId === tenantId && u.role === role),
  }
}

export type CreateTenantUserInput = TenantUser & { password: string }

export async function createTenantUser(input: CreateTenantUserInput): Promise<ActionResult<TenantUser>> {
  await delay()
  // Email is unique *per tenant*, not globally: two different clubs must be
  // able to have a member with the same address, and login is already scoped
  // by tenantId (see loginTenantUser).
  const emailTaken = credentials
    .getAll()
    .some(c => c.tenantId === input.tenantId && c.email.toLowerCase() === input.email.toLowerCase())
  if (emailTaken) {
    return { success: false, error: 'Já existe um usuário com esse e-mail neste clube' }
  }
  const { password, ...userInput } = input
  const id = userInput.id || genId(userInput.role)
  const user = { ...userInput, id } as TenantUser
  users.collection.create(user)
  credentials.create({ id, email: user.email, password, userId: id, tenantId: user.tenantId })
  return { success: true, data: user }
}

export async function loginTenantUser(
  tenantId: string,
  email: string,
  password: string
): Promise<ActionResult<TenantUser>> {
  await delay(400)
  const credential = credentials
    .getAll()
    .find(
      c =>
        c.tenantId === tenantId &&
        c.email.toLowerCase() === email.toLowerCase() &&
        c.password === password
    )
  if (!credential) {
    return { success: false, error: 'E-mail ou senha inválidos' }
  }
  const user = users.collection.getById(credential.userId)
  if (!user) {
    return { success: false, error: 'Usuário não encontrado' }
  }
  return { success: true, data: user }
}

export function getRoleRedirectPath(tenantSlug: string, role: UserRole): string {
  switch (role) {
    case 'admin':
      return `/${tenantSlug}/admin`
    case 'seller':
      return `/${tenantSlug}/vendedor`
    case 'client':
      return `/${tenantSlug}/cliente`
    default:
      return `/${tenantSlug}/login`
  }
}
