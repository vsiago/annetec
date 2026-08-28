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
}

export async function resolveActiveMembership(
  authUser: { id: string; role?: string | null },
  authSession: { activeOrganizationId?: string | null },
): Promise<ResolvedMembership> {
  if (authUser.role && PLATFORM_ROLES.has(authUser.role)) {
    return {
      scope: 'platform',
      platformRole: authUser.role as 'superadmin' | 'platform_admin',
      tenantId: null,
      tenantSlug: null,
      tenantRole: null,
    }
  }

  const empty: ResolvedMembership = {
    scope: 'tenant',
    platformRole: null,
    tenantId: null,
    tenantSlug: null,
    tenantRole: null,
  }

  if (!authSession.activeOrganizationId) return empty

  const [row] = await db
    .select({ role: member.role, slug: organization.slug, organizationId: organization.id })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(
      and(
        eq(member.organizationId, authSession.activeOrganizationId),
        eq(member.userId, authUser.id),
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
  }
}
