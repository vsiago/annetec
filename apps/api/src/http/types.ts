import type { auth } from '@/lib/auth'

/**
 * Sujeito autenticado: exatamente o que `auth.api.getSession` devolve para
 * esta instância do Better Auth (já achatado pelo `customSession` em
 * `lib/auth.ts`) — derivado do próprio tipo em vez de reescrito à mão, para
 * nunca divergir de verdade se um plugin mudar o formato da sessão.
 */
export type AuthContext = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>

/** Inquilino (organization) resolvido pelo middleware de tenant. */
export interface ResolvedTenant {
  id: string
  slug: string
  name: string
}

/**
 * Tipagem das variáveis do contexto Hono. Compartilhada por middlewares e
 * controllers para que `c.get('auth')` seja tipado em vez de `any`.
 */
export type AppEnv = {
  Variables: {
    requestId: string
    auth?: AuthContext
    tenant?: ResolvedTenant
  }
}
