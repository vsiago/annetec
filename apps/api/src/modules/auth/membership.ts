import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { member, organization } from '@/db/schema'

/**
 * O único lugar que traduz "usuário + sessão do Better Auth" para o
 * vocabulário de domínio da Annetec. Chamado pelo plugin `customSession` em
 * `lib/auth.ts`, então todo `auth.api.getSession(...)` já devolve isto pronto
 * — nenhum controller recalcula escopo/papel por conta própria.
 */

const PLATFORM_ROLES = new Set(['superadmin', 'platform_admin'])

export interface ResolvedMembership {
  scope: 'platform' | 'tenant'
  platformRole: 'superadmin' | 'platform_admin' | null
  tenantId: string | null
  tenantSlug: string | null
  tenantRole: 'admin' | 'seller' | 'client' | null
  /** Id do superadmin dono da sessão real, quando esta é uma sessão de impersonação. */
  impersonatedBy: string | null
}

/**
 * Conta desativada (`user.banned` do plugin `admin`, usado para desligar a
 * equipe da plataforma). O Better Auth só confere o banimento ao CRIAR
 * sessão — sessão aberta antes continuaria valendo até expirar. `banExpires`
 * no passado = banimento vencido (o próprio plugin desbaneia no próximo login).
 */
export function isUserBanned(
  authUser: { banned?: boolean | null; banExpires?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (authUser.banned !== true) return false
  if (!authUser.banExpires) return true
  return new Date(authUser.banExpires).getTime() > now.getTime()
}

export async function resolveActiveMembership(
  authUser: { id: string; role?: string | null; banned?: boolean | null; banExpires?: Date | string | null },
  authSession: { activeOrganizationId?: string | null; impersonatedBy?: string | null },
): Promise<ResolvedMembership> {
  const impersonatedBy = authSession.impersonatedBy ?? null

  // Conta desativada não tem papel nenhum — nem de plataforma, nem de
  // inquilino. Sem inquilino ativo, `requireAuth` responde 401.
  if (isUserBanned(authUser)) {
    return { scope: 'tenant', platformRole: null, tenantId: null, tenantSlug: null, tenantRole: null, impersonatedBy }
  }

  if (authUser.role && PLATFORM_ROLES.has(authUser.role)) {
    return {
      scope: 'platform',
      platformRole: authUser.role as 'superadmin' | 'platform_admin',
      tenantId: null,
      tenantSlug: null,
      tenantRole: null,
      impersonatedBy,
    }
  }

  const empty: ResolvedMembership = {
    scope: 'tenant',
    platformRole: null,
    tenantId: null,
    tenantSlug: null,
    tenantRole: null,
    impersonatedBy,
  }

  if (!authSession.activeOrganizationId) return empty

  // Só vínculo ATIVO conta: sessão aberta antes de o clube excluir/bloquear
  // a pessoa (ou desativar alguém da equipe) fica sem inquilino, e
  // `requireAuth` responde 401 — o web trata como sessão encerrada.
  const [row] = await db
    .select({ role: member.role, slug: organization.slug, organizationId: organization.id })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(
        eq(member.organizationId, authSession.activeOrganizationId),
        eq(member.userId, authUser.id),
        eq(member.accessStatus, 'active'),
      ),
    )
    .limit(1)

  if (!row) return empty

  return {
    scope: 'tenant',
    platformRole: null,
    tenantId: row.organizationId,
    tenantSlug: row.slug,
    tenantRole: row.role as 'admin' | 'seller' | 'client',
    impersonatedBy,
  }
}
