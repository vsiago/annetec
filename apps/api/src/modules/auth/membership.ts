import { isPlatformAccountRole, type PapelComercial, type PlatformRole } from '@annetec/contracts'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { member, organization, vendasAgentes } from '@/db/schema'
import { logger } from '@/lib/logger'

/**
 * O único lugar que traduz "usuário + sessão do Better Auth" para o
 * vocabulário de domínio da Annetec. Chamado pelo plugin `customSession` em
 * `lib/auth.ts`, então todo `auth.api.getSession(...)` já devolve isto pronto
 * — nenhum controller recalcula escopo/papel por conta própria.
 */

export interface ResolvedMembership {
  scope: 'platform' | 'tenant'
  /** `platform_seller` = vendedor ANNETEC: conta de plataforma SÓ da área de vendas. */
  platformRole: PlatformRole | null
  tenantId: string | null
  tenantSlug: string | null
  tenantRole: 'admin' | 'seller' | 'client' | null
  /** Id do superadmin dono da sessão real, quando esta é uma sessão de impersonação. */
  impersonatedBy: string | null
  /**
   * Rede Comercial: papel comercial do usuário neste escopo (`vendas_agentes`),
   * ou `null` (equipe/admin são master IMPLÍCITO e não têm linha). Só é lido
   * para `platform_seller` e `seller` de clube. Opcional no tipo para as
   * sessões montadas à mão (testes, impersonação) continuarem válidas.
   */
  salesRole?: PapelComercial | null
  /** `vendas_agentes.id` do usuário neste escopo, ou `null`. */
  salesAgentId?: string | null
}

const NO_SALES = { salesRole: null, salesAgentId: null } as const

/**
 * Perfil comercial (`vendas_agentes`) do usuário no vínculo ativo: um `select`
 * indexado por `(user_id, scope, tenant_id)`. Nunca derruba a sessão — sem
 * tabela (migração pendente) ou sem linha, devolve `null`.
 */
export async function resolveSalesProfile(
  userId: string,
  scope: 'platform' | 'tenant',
  tenantId: string | null,
): Promise<{ salesRole: PapelComercial | null; salesAgentId: string | null }> {
  try {
    const [row] = await db
      .select({ id: vendasAgentes.id, papel: vendasAgentes.papel })
      .from(vendasAgentes)
      .where(
        and(
          eq(vendasAgentes.userId, userId),
          eq(vendasAgentes.scope, scope),
          tenantId ? eq(vendasAgentes.tenantId, tenantId) : isNull(vendasAgentes.tenantId),
        ),
      )
      .limit(1)
    return row ? { salesRole: row.papel, salesAgentId: row.id } : NO_SALES
  } catch (error) {
    logger.warn({ userId, err: error instanceof Error ? error.message : String(error) }, 'Sessão sem perfil comercial: falha ao ler vendas_agentes')
    return NO_SALES
  }
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
    return { scope: 'tenant', platformRole: null, tenantId: null, tenantSlug: null, tenantRole: null, impersonatedBy, ...NO_SALES }
  }

  if (isPlatformAccountRole(authUser.role)) {
    return {
      scope: 'platform',
      platformRole: authUser.role,
      tenantId: null,
      tenantSlug: null,
      tenantRole: null,
      impersonatedBy,
      ...(authUser.role === 'platform_seller' ? await resolveSalesProfile(authUser.id, 'platform', null) : NO_SALES),
    }
  }

  const empty: ResolvedMembership = {
    scope: 'tenant',
    platformRole: null,
    tenantId: null,
    tenantSlug: null,
    tenantRole: null,
    impersonatedBy,
    ...NO_SALES,
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
    ...(row.role === 'seller' ? await resolveSalesProfile(authUser.id, 'tenant', row.organizationId) : NO_SALES),
  }
}
