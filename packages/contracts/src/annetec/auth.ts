import { z } from 'zod'
import { cpf, email, slug } from '../common/primitives'
import { platformRole, tenantRole } from './enums'

/**
 * Contratos de autenticação.
 *
 * A autenticação em si (senha, sessão, cookie) é o Better Auth
 * (apps/api/src/lib/auth.ts) — aqui só ficam os formatos de entrada/saída que
 * o resto do sistema (frontend, outros módulos) precisa conhecer.
 *
 * Um único token de sessão sai de cada login (`token`, o session token do
 * Better Auth). O Next.js guarda esse token em cookie httpOnly do seu próprio
 * domínio e o reenvia como `Authorization: Bearer <token>` — não há par
 * access/refresh: o Better Auth renova a mesma sessão por rolling expiry.
 */

export const authScope = z.enum(['platform', 'tenant'])
export type AuthScope = z.infer<typeof authScope>

export const loginInput = z.object({
  email,
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres'),
  /**
   * Normalmente ausente — o e-mail já identifica a conta, e o servidor
   * resolve sozinho se é plataforma ou em qual inquilino a pessoa tem
   * vínculo. Só é preciso informar para forçar um inquilino específico
   * quando a mesma conta é admin/vendedor em mais de um.
   */
  tenantSlug: slug.optional(),
})
export type LoginInput = z.infer<typeof loginInput>

/**
 * Login do associado pelo par CPF + e-mail, espelhando
 * `GET /contrato/procurarPorClientePortal`. Sem senha: a identidade é
 * validada contra a Digital Saúde no momento do login (ver o plugin Better
 * Auth `client-portal`).
 *
 * `tenantSlug` também é opcional aqui pelo mesmo motivo: sem ele, o servidor
 * tenta o inquilino do vínculo já conhecido e, se a pessoa for nova, cada
 * inquilino com integração ativa, até um confirmar o contrato.
 */
export const clientPortalLoginInput = z.object({
  tenantSlug: slug.optional(),
  cpf,
  email,
})
export type ClientPortalLoginInput = z.infer<typeof clientPortalLoginInput>

export const registerInput = z.object({
  tenantSlug: slug,
  name: z.string().min(1),
  email,
  cpf,
  password: z.string().min(8),
})
export type RegisterInput = z.infer<typeof registerInput>

export const sessionUser = z.object({
  id: z.string(),
  name: z.string(),
  email,
  avatarUrl: z.string().nullable(),
  scope: authScope,
  /** Preenchido quando `scope === 'platform'`. */
  platformRole: platformRole.nullable(),
  /** Preenchidos quando `scope === 'tenant'`. */
  tenantId: z.string().nullable(),
  tenantSlug: z.string().nullable(),
  tenantRole: tenantRole.nullable(),
})
export type SessionUser = z.infer<typeof sessionUser>

export const authSession = z.object({
  token: z.string(),
  user: sessionUser,
})
export type AuthSession = z.infer<typeof authSession>

export const forgotPasswordInput = z.object({ email })
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInput>

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})
export type ChangePasswordInput = z.infer<typeof changePasswordInput>
