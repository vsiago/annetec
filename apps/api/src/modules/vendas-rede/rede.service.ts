import type { VendasEu } from '@annetec/contracts'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { user, vendasLeads } from '@/db/schema'
import { getOrCreateConfig, toConfigPublica } from './config.service'
import { whereEscopo, type VendasCtx } from './context'
import { toVendasAgente } from './presenter'

/**
 * Rede: perfil do usuário na rede (`GET /eu`). As demais operações da rede
 * (corretoras, unidades, equipes, agentes, árvore) entram neste serviço.
 */

/** Contadores do cabeçalho: pool do escopo, "minha vez" e leads em andamento do próprio agente. */
async function contadores(ctx: VendasCtx): Promise<VendasEu['contadores']> {
  const agenteId = ctx.agente?.id ?? null
  const aberto = sql`${vendasLeads.etapa} not in ('ganho', 'perdido')`
  const pool = ctx.papel === 'balcao' ? sql`0` : sql`count(*) filter (where ${vendasLeads.agenteId} is null and ${aberto})`
  const minhaVez = agenteId
    ? sql`count(*) filter (where ${vendasLeads.agenteId} = ${agenteId} and ${aberto} and (
        (${vendasLeads.etapa} = 'novo' and ${vendasLeads.ultimoContatoEm} is null)
        or (${vendasLeads.proximoPassoEm} is not null and ${vendasLeads.proximoPassoEm} <= now())
      ))`
    : sql`0`
  const emAndamento = agenteId
    ? sql`count(*) filter (where ${vendasLeads.agenteId} = ${agenteId} and ${vendasLeads.etapa} in ('em_contato', 'proposta', 'negociacao'))`
    : sql`0`

  const [row] = await db
    .select({
      pool: sql<number>`${pool}`.mapWith(Number),
      minhaVez: sql<number>`${minhaVez}`.mapWith(Number),
      emAndamento: sql<number>`${emAndamento}`.mapWith(Number),
    })
    .from(vendasLeads)
    .where(whereEscopo(vendasLeads, ctx))
  return { pool: row?.pool ?? 0, minhaVez: row?.minhaVez ?? 0, emAndamento: row?.emAndamento ?? 0 }
}

/** `GET /eu`: perfil + papel + escopo + config pública + contadores. */
export async function obterEu(ctx: VendasCtx, agora: Date = new Date()): Promise<VendasEu> {
  const config = await getOrCreateConfig(ctx.scope, ctx.tenantId)
  let agente: VendasEu['agente'] = null
  if (ctx.agente) {
    const [conta] = await db.select({ email: user.email }).from(user).where(eq(user.id, ctx.agente.userId)).limit(1)
    agente = toVendasAgente(ctx.agente, { email: conta?.email ?? null, agora, presencaMinutos: config.presencaMinutos })
  }
  return {
    scope: ctx.scope,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    papel: ctx.papel,
    masterImplicito: ctx.masterImplicito,
    podeEscrever: ctx.podeEscrever,
    agente,
    config: toConfigPublica(config),
    contadores: await contadores(ctx),
  }
}
