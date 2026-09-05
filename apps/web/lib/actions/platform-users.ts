import type { PlatformUser, PlatformRole } from '@/lib/types'
import { seedPlatformUsers, seedPlatformCredentials } from '@/lib/mock-seed'
import { createCollection } from '@/lib/storage/local-collection'
import { createEntityActions } from './_factory'
import { delay, genId, type ActionResult } from './_shared'

interface PlatformCredential {
  id: string
  email: string
  password: string
  userId: string
}

const users = createEntityActions<PlatformUser>('platform-users', seedPlatformUsers)
const credentials = createCollection<PlatformCredential>(
  'platform-credentials',
  seedPlatformCredentials.map(c => ({ ...c, id: c.userId }))
)

export const listPlatformUsers = users.list
export const getPlatformUser = users.getById
export const updatePlatformUser = users.update
export const deletePlatformUser = users.remove

export interface CreatePlatformUserInput {
  name: string
  email: string
  phone?: string
  role: PlatformRole
  password: string
}

export async function createPlatformUser(input: CreatePlatformUserInput): Promise<ActionResult<PlatformUser>> {
  await delay()
  if (credentials.getAll().some(c => c.email.toLowerCase() === input.email.toLowerCase())) {
    return { success: false, error: 'Já existe um usuário com esse e-mail' }
  }
  const id = genId('platform')
  const user: PlatformUser = {
    id,
    name: input.name,
    email: input.email,
    phone: input.phone,
    role: input.role,
    active: true,
    createdAt: new Date(),
  }
  users.collection.create(user)
  credentials.create({ id, email: input.email, password: input.password, userId: id })
  return { success: true, data: user }
}

export async function loginPlatformUser(
  email: string,
  password: string
): Promise<ActionResult<PlatformUser>> {
  await delay(400)
  const credential = credentials
    .getAll()
    .find(c => c.email.toLowerCase() === email.toLowerCase() && c.password === password)
  if (!credential) {
    return { success: false, error: 'E-mail ou senha inválidos' }
  }
  const user = users.collection.getById(credential.userId)
  if (!user) {
    return { success: false, error: 'Usuário não encontrado' }
  }
  return { success: true, data: user }
}
