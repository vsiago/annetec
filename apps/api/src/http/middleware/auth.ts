import { ERROR_CODES } from '@annetec/contracts'
import { createMiddleware } from 'hono/factory'
import { auth } from '@/lib/auth'
import { AppError } from '@/http/errors'
import type { AppEnv } from '@/http/types'

/**
 * Toda autenticação passa por `auth.api.getSession`. Nenhum middleware decodifica
 * token: o Better Auth já resolveu cookie/bearer para uma sessão (ou não) antes
 * de chegarmos aqui, e o plugin `customSession` já anexou `membership`
 * (ver `modules/auth/membership.ts`).
 */

/** Popula `c.get('auth')` quando houver sessão válida; nunca falha. */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (session) c.set('auth', session)
  await next()
})

/** Exige sessão válida. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) throw AppError.unauthenticated()
  c.set('auth', session)
  await next()
})

/** Exige sessão de plataforma (equipe Annetec) com um dos papéis informados. */
export function requirePlatformRole(...roles: ('superadmin' | 'platform_admin')[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('auth')
    if (!session) throw AppError.unauthenticated()
    if (session.membership.scope !== 'platform' || !session.membership.platformRole) {
      throw AppError.forbidden('Rota restrita à equipe Annetec')
    }
    if (roles.length > 0 && !roles.includes(session.membership.platformRole)) {
      throw AppError.forbidden('Papel insuficiente para esta operação')
    }
    await next()
  })
}

/**
 * Exige sessão de inquilino com um dos papéis informados E que o inquilino
 * ativo da sessão seja o mesmo resolvido pela rota. É esta segunda checagem
 * que impede um admin do inquilino A de ler dados do inquilino B trocando o
 * slug na URL.
 */
export function requireTenantRole(...roles: ('admin' | 'seller' | 'client')[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const session = c.get('auth')
    if (!session) throw AppError.unauthenticated()

    // Equipe Annetec tem acesso de leitura a qualquer inquilino para suporte.
    if (session.membership.scope === 'platform') {
      await next()
      return
    }

    if (!session.membership.tenantId || !session.membership.tenantRole) {
      throw AppError.forbidden('Sessão sem inquilino ativo')
    }

    const tenant = c.get('tenant')
    if (tenant && tenant.id !== session.membership.tenantId) {
      throw new AppError(ERROR_CODES.TENANT_MISMATCH, 'Sessão não pertence a este inquilino')
    }

    if (roles.length > 0 && !roles.includes(session.membership.tenantRole)) {
      throw AppError.forbidden('Papel insuficiente para esta operação')
    }

    await next()
  })
}
