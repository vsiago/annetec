import type { VendasPresencaOnline } from '@annetec/contracts'
import { and, asc, eq, gte, inArray, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { vendasAgentes } from '@/db/schema'
import { getOrCreateConfig } from './config.service'
import { whereEscopo, type VendasCtx } from './context'

/**
 * Presença: o web manda `POST /presenca` a cada ~60 s com a aba visível;
 * "online" = `ultima_presenca_em` dentro de `vendas_config.presenca_minutos`.
 */

/**
 * `where` dos agentes que o usuário enxerga (traduz `ctx.visibilidade`):
 * master tudo do escopo; gerente a corretora + ele; supervisor as equipes
 * supervisionadas + ele; vendedor/balcão só ele.
 */
export function whereAgentesVisiveis(ctx: VendasCtx): SQL {
  const escopo = whereEscopo(vendasAgentes, ctx)
  const { visibilidade: v } = ctx
  if (v.todos) return escopo
  const proprios: SQL[] = []
  if (v.agenteId) proprios.push(eq(vendasAgentes.id, v.agenteId))
  if (v.corretoraId) proprios.push(eq(vendasAgentes.corretoraId, v.corretoraId))
  if (v.equipeIds && v.equipeIds.length > 0) proprios.push(inArray(vendasAgentes.equipeId, v.equipeIds))
  // Sem vínculo nenhum (nem a si mesmo): nada visível.
  if (proprios.length === 0) return and(escopo, sql`false`)!
  return and(escopo, or(...proprios))!
}

/** Heartbeat: marca o agente como online agora. Master implícito não é agente: nada a gravar. */
export async function registrarPresenca(ctx: VendasCtx): Promise<{ registrada: boolean; ultimaPresencaEm: string | null }> {
  if (!ctx.agente) return { registrada: false, ultimaPresencaEm: null }
  const [row] = await db
    .update(vendasAgentes)
    .set({ ultimaPresencaEm: sql`now()` })
    .where(and(eq(vendasAgentes.id, ctx.agente.id), whereEscopo(vendasAgentes, ctx)))
    .returning({ ultimaPresencaEm: vendasAgentes.ultimaPresencaEm })
  return { registrada: Boolean(row), ultimaPresencaEm: row?.ultimaPresencaEm ? row.ultimaPresencaEm.toISOString() : null }
}

/** Agentes ativos online dentro da janela de presença, restritos ao que o usuário enxerga. */
export async function listarOnline(ctx: VendasCtx, agora: Date = new Date()): Promise<VendasPresencaOnline> {
  const config = await getOrCreateConfig(ctx.scope, ctx.tenantId)
  const limite = new Date(agora.getTime() - config.presencaMinutos * 60_000)
  const rows = await db
    .select({
      id: vendasAgentes.id,
      nome: vendasAgentes.nome,
      papel: vendasAgentes.papel,
      ultimaPresencaEm: vendasAgentes.ultimaPresencaEm,
    })
    .from(vendasAgentes)
    .where(and(whereAgentesVisiveis(ctx), eq(vendasAgentes.ativo, true), gte(vendasAgentes.ultimaPresencaEm, limite)))
    .orderBy(asc(vendasAgentes.nome))
  return {
    agentes: rows.map(row => ({
      id: row.id,
      nome: row.nome,
      papel: row.papel,
      ultimaPresencaEm: row.ultimaPresencaEm ? row.ultimaPresencaEm.toISOString() : null,
    })),
  }
}
