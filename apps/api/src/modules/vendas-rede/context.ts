import { ERROR_CODES, isPlatformStaffRole, type EscopoVendas, type PapelComercial } from '@annetec/contracts'
import { and, eq, isNull, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import type { Context, MiddlewareHandler } from 'hono'
import { createMiddleware } from 'hono/factory'
import { db } from '@/db/client'
import { vendasEquipes, vendasAgentes, type VendasAgenteRow } from '@/db/schema'
import { AppError } from '@/http/errors'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant } from '@/http/middleware/tenant'
import type { AppEnv } from '@/http/types'
import { visibilidade, type Visibilidade } from './rules'

/**
 * Contexto comercial da Rede Comercial (`docs/rede-comercial.md`, 4.1).
 *
 * `salesContext(scope)` autentica, resolve QUEM é o usuário na rede e deixa
 * tudo em `c.get('vendas')`:
 *
 *  - platform: `requireAuth`; equipe (`superadmin`/`platform_admin`) = master
 *    IMPLÍCITO; `platform_seller` precisa de `vendas_agentes` (senão
 *    `403 VENDAS_SEM_PERFIL`); tenant (cliente/seller de clube) não entra;
 *  - tenant: `resolveTenant` + `requireAuth` + `requireTenantRole('admin','seller')`
 *    (a mesma regra anti-IDOR e de acesso da equipe da plataforma das outras
 *    rotas de clube); `admin` = master implícito; `seller` precisa de agente;
 *  - se existir linha em `vendas_agentes` para quem seria master implícito, a
 *    linha prevalece (papel e `ativo`);
 *  - agente INATIVO lê e não escreve: método que não é GET/HEAD/OPTIONS →
 *    `403 VENDAS_PERFIL_INATIVO` (vale para todo o módulo, sem depender de cada
 *    rota lembrar de `requireEscrita`).
 */

export interface VendasCtx {
  scope: EscopoVendas
  /** `organization.id` no escopo tenant; `null` no platform. */
  tenantId: string | null
  tenantSlug: string | null
  userId: string
  userName: string
  /** Linha em `vendas_agentes`, ou `null` (master implícito). */
  agente: VendasAgenteRow | null
  papel: PapelComercial
  /** `true` = equipe ANNETEC (platform) / admin do clube (tenant) sem linha de agente. */
  masterImplicito: boolean
  /** `false` = agente inativo: só leitura. */
  podeEscrever: boolean
  /** Quem este usuário enxerga (traduzida em `where` pelos serviços). */
  visibilidade: Visibilidade
}

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Contexto já resolvido; falha alto se a rota esqueceu `salesContext`. */
export function vendasOf(c: Context<AppEnv>): VendasCtx {
  const ctx = c.get('vendas')
  if (!ctx) throw new Error('salesContext não foi registrado nesta rota')
  return ctx
}

/** `where` do escopo (`scope` + `tenant_id`) para qualquer tabela `vendas_*` com essas colunas. */
export function whereEscopo(
  table: { scope: PgColumn; tenantId: PgColumn },
  ctx: Pick<VendasCtx, 'scope' | 'tenantId'>,
): SQL {
  return and(eq(table.scope, ctx.scope), ctx.tenantId ? eq(table.tenantId, ctx.tenantId) : isNull(table.tenantId))!
}

/** Linha de `vendas_agentes` do usuário no escopo (ou `null`). */
export async function buscarAgenteDoUsuario(
  userId: string,
  scope: EscopoVendas,
  tenantId: string | null,
): Promise<VendasAgenteRow | null> {
  const [row] = await db
    .select()
    .from(vendasAgentes)
    .where(
      and(
        eq(vendasAgentes.userId, userId),
        eq(vendasAgentes.scope, scope),
        tenantId ? eq(vendasAgentes.tenantId, tenantId) : isNull(vendasAgentes.tenantId),
      ),
    )
    .limit(1)
  return row ?? null
}

async function equipesDoSupervisor(agenteId: string): Promise<string[]> {
  const rows = await db.select({ id: vendasEquipes.id }).from(vendasEquipes).where(eq(vendasEquipes.supervisorAgenteId, agenteId))
  return rows.map(row => row.id)
}

function semPerfil(): AppError {
  return new AppError(
    ERROR_CODES.VENDAS_SEM_PERFIL,
    'Sua conta ainda não tem perfil de vendas. Peça ao administrador para cadastrar você na Rede Comercial.',
  )
}

async function montarContexto(c: Context<AppEnv>, scope: EscopoVendas): Promise<VendasCtx> {
  const session = c.get('auth')
  if (!session) throw AppError.unauthenticated()
  const membership = session.membership
  const userId = session.user.id
  const userName = session.user.name

  let tenantId: string | null = null
  let tenantSlug: string | null = null
  let agente: VendasAgenteRow | null
  /** Quem é master quando NÃO há linha de agente. */
  let masterPossivel = false

  if (scope === 'platform') {
    if (membership.scope !== 'platform') throw AppError.forbidden('Esta área é da equipe e dos vendedores da ANNETEC.')
    const staff = isPlatformStaffRole(membership.platformRole)
    if (!staff && membership.platformRole !== 'platform_seller') throw AppError.forbidden('Esta área é da equipe e dos vendedores da ANNETEC.')
    masterPossivel = staff
    agente = await buscarAgenteDoUsuario(userId, 'platform', null)
  } else {
    const tenant = c.get('tenant')
    if (!tenant) throw new Error('resolveTenant não registrou o inquilino')
    tenantId = tenant.id
    tenantSlug = tenant.slug
    if (membership.scope === 'platform') {
      // Equipe ANNETEC em clube: já passou por `requireTenantRole` (leitura sempre; escrita superadmin/inquilino-operador).
      masterPossivel = true
      agente = null
    } else {
      masterPossivel = membership.tenantRole === 'admin'
      agente = await buscarAgenteDoUsuario(userId, 'tenant', tenant.id)
    }
  }

  if (!agente && !masterPossivel) throw semPerfil()

  const papel: PapelComercial = agente ? agente.papel : 'master'
  const equipeIds = agente?.papel === 'supervisor' ? await equipesDoSupervisor(agente.id) : undefined

  return {
    scope,
    tenantId,
    tenantSlug,
    userId,
    userName,
    agente,
    papel,
    masterImplicito: !agente,
    podeEscrever: agente ? agente.ativo : true,
    visibilidade: visibilidade({
      papel,
      agenteId: agente?.id ?? null,
      corretoraId: agente?.corretoraId ?? null,
      equipeIds,
    }),
  }
}

/** Roda um middleware existente dentro deste (devolve a `Response` se ele encerrar a requisição). */
async function rodar(middleware: MiddlewareHandler<AppEnv>, c: Context<AppEnv>): Promise<Response | undefined> {
  const result = await middleware(c, async () => {})
  return result instanceof Response ? result : undefined
}

/** Autentica e preenche `c.get('vendas')`. Ver o comentário do módulo. */
export function salesContext(scope: EscopoVendas) {
  const tenantGuard = requireTenantRole('admin', 'seller')
  return createMiddleware<AppEnv>(async (c, next) => {
    if (scope === 'tenant') {
      const early = await rodar(resolveTenant, c)
      if (early) return early
    }
    const auth = await rodar(requireAuth, c)
    if (auth) return auth
    if (scope === 'tenant') {
      const guard = await rodar(tenantGuard, c)
      if (guard) return guard
    }

    const ctx = await montarContexto(c, scope)
    if (!ctx.podeEscrever && !READ_ONLY_METHODS.has(c.req.method.toUpperCase())) {
      throw new AppError(
        ERROR_CODES.VENDAS_PERFIL_INATIVO,
        'Seu perfil de vendas está inativo: você pode consultar, mas não registrar alterações.',
      )
    }
    c.set('vendas', ctx)
    await next()
  })
}

/**
 * Exige um dos papéis comerciais (o master implícito conta como `master`).
 * Fora da lista: `403 VENDAS_SEM_PERMISSAO_NA_REDE`.
 */
export function requirePapel(...papeis: PapelComercial[]) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const ctx = vendasOf(c)
    if (!papeis.includes(ctx.papel)) {
      throw new AppError(ERROR_CODES.VENDAS_SEM_PERMISSAO_NA_REDE, 'Seu perfil não permite esta ação. Fale com o seu supervisor ou gerente.')
    }
    await next()
  })
}

/** Exige perfil ativo (agente inativo só consulta). Idempotente com o corte de `salesContext`. */
export const requireEscrita = createMiddleware<AppEnv>(async (c, next) => {
  if (!vendasOf(c).podeEscrever) {
    throw new AppError(
      ERROR_CODES.VENDAS_PERFIL_INATIVO,
      'Seu perfil de vendas está inativo: você pode consultar, mas não registrar alterações.',
    )
  }
  await next()
})
