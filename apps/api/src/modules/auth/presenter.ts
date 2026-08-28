import type { SessionUser } from '@annetec/contracts'
import type { AuthContext } from '@/http/types'

/** Único ponto que converte a sessão do Better Auth para `SessionUser`. */
export function toSessionUser(session: AuthContext): SessionUser {
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    avatarUrl: session.user.image ?? null,
    scope: session.membership.scope,
    platformRole: session.membership.platformRole,
    tenantId: session.membership.tenantId,
    tenantSlug: session.membership.tenantSlug,
    tenantRole: session.membership.tenantRole,
  }
}
