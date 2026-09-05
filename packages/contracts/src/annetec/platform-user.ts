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
  /** Conta desativada continua existindo (e assinando o histórico), mas não entra. */
  active: z.boolean(),
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

/**
 * E-mail não entra: é a identidade da conta no Better Auth e trocá-lo é criar
 * outra pessoa. Senha também não — troca de senha tem fluxo próprio.
 */
export const updatePlatformUserInput = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullable().optional(),
  role: platformRole.optional(),
  active: z.boolean().optional(),
})
export type UpdatePlatformUserInput = z.infer<typeof updatePlatformUserInput>
