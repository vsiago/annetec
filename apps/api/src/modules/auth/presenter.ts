import type { MyClubAccess, SessionUser } from '@annetec/contracts'
import type { AuthContext } from '@/http/types'
import { logger } from '@/lib/logger'
import { loadClubAccess } from '@/modules/club-billing/access.service'

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
    impersonatedBy: session.membership.impersonatedBy,
    salesRole: session.membership.salesRole ?? null,
    salesAgentId: session.membership.salesAgentId ?? null,
  }
}

/**
 * `SessionUser` como as respostas de sessão devolvem (logins e `GET /auth/me`):
 * para associado (`client`) com clube ativo, soma `needsSubscription` e
 * `subscriptionStatus`, lidos da assinatura dele NESTE clube pela mesma regra
 * do portal (`access.service`):
 *  - sem assinatura ou só canceladas → `true` / `none`;
 *  - aguardando o 1º pagamento → `true` / `pending_payment`;
 *  - ativa, em atraso ou suspensa → `false` / `subscribed`;
 *  - contrato na operadora (associado antigo) → `false` / `contract`.
 * Equipe e plataforma não recebem os campos. Falha na leitura também não:
 * a sessão nunca cai por causa disso (o portal relê em `/cliente/acesso`).
 */
export async function presentSessionUser(
  session: AuthContext,
  loadAccess: (organizationId: string, userId: string) => Promise<MyClubAccess> = loadClubAccess,
): Promise<SessionUser> {
  const base = toSessionUser(session)
  const membership = session.membership
  if (membership.scope !== 'tenant' || membership.tenantRole !== 'client' || !membership.tenantId) return base
  try {
    const access = await loadAccess(membership.tenantId, session.user.id)
    return { ...base, needsSubscription: access.needsSubscription, subscriptionStatus: access.status }
  } catch (error) {
    logger.warn(
      { tenantId: membership.tenantId, err: error instanceof Error ? error.message : String(error) },
      'Sessão do associado sem needsSubscription: falha ao ler a assinatura',
    )
    return base
  }
}
