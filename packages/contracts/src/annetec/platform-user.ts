import { z } from 'zod'
import { email } from '../common/primitives'
import { platformRole } from './enums'

/**
 * Conta de equipe Annetec (opera `/admin`). Vive na mesma tabela `user` do
 * Better Auth que os usuários de inquilino — o que diferencia é `role`:
 * 'superadmin' | 'platform_admin' aqui, 'user' para todo o resto (que então
 * se identifica por vínculo de `organization`, não por este papel).
 */
export const platformUser = z.object({
  id: z.string(),
  name: z.string(),
  email,
  phone: z.string().nullable(),
  role: platformRole,
  avatarUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type PlatformUser = z.infer<typeof platformUser>

export const createPlatformUserInput = z.object({
  name: z.string().min(1),
  email,
  phone: z.string().optional(),
  role: platformRole,
  password: z.string().min(8),
})
export type CreatePlatformUserInput = z.infer<typeof createPlatformUserInput>
