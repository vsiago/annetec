import type { EscopoVendas } from '@annetec/contracts'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { vendasAgentes, vendasCorretoras, vendasEquipes, type VendasAgenteRow } from '@/db/schema'
import { cadeiaDoAgente, type Atribuicao } from './rules'

/**
 * Snapshot da cadeia do agente (`vendas_leads.atribuicao`): lê equipe e corretora
 * do agente e devolve `cadeiaDoAgente`. Folha: só banco e regras puras (importada
 * por leads, conversão, intake e pela sincronização com a contratação).
 */

type Executor = Pick<typeof db, 'select'>

export async function atribuicaoDoAgente(agenteId: string, executor: Executor = db): Promise<Atribuicao | null> {
  const [agente] = await executor.select().from(vendasAgentes).where(eq(vendasAgentes.id, agenteId)).limit(1)
  if (!agente) return null
  return atribuicaoDeLinha(agente, executor)
}

export async function atribuicaoDeLinha(agente: VendasAgenteRow, executor: Executor = db): Promise<Atribuicao> {
  const [equipe] = agente.equipeId
    ? await executor
        .select({ id: vendasEquipes.id, supervisorAgenteId: vendasEquipes.supervisorAgenteId })
        .from(vendasEquipes)
        .where(eq(vendasEquipes.id, agente.equipeId))
        .limit(1)
    : []
  const [corretora] = agente.corretoraId
    ? await executor
        .select({ id: vendasCorretoras.id, gerenteAgenteId: vendasCorretoras.gerenteAgenteId })
        .from(vendasCorretoras)
        .where(eq(vendasCorretoras.id, agente.corretoraId))
        .limit(1)
    : []
  return cadeiaDoAgente(
    { id: agente.id, papel: agente.papel, equipeId: agente.equipeId, unidadeId: agente.unidadeId, corretoraId: agente.corretoraId },
    equipe ?? null,
    corretora ?? null,
  )
}

/**
 * Agente ATIVO por código de indicação (sem diferenciar maiúsculas: o código é
 * gravado em maiúsculas, mas o migrado de `platform_sellers` pode estar em minúsculas).
 * `scope`/`tenantId` restringem o escopo; omitidos = qualquer escopo (consulta pública).
 */
export async function buscarAgentePorCodigo(
  codigo: string | null | undefined,
  escopo?: { scope: EscopoVendas; tenantId: string | null },
  executor: Executor = db,
): Promise<VendasAgenteRow | null> {
  const bruto = codigo?.trim()
  if (!bruto) return null
  const variantes = [...new Set([bruto, bruto.toUpperCase(), bruto.toLowerCase()])]
  const filtros = [inArray(vendasAgentes.codigoIndicacao, variantes), eq(vendasAgentes.ativo, true)]
  if (escopo) {
    filtros.push(eq(vendasAgentes.scope, escopo.scope))
    filtros.push(escopo.tenantId ? eq(vendasAgentes.tenantId, escopo.tenantId) : isNull(vendasAgentes.tenantId))
  }
  const [row] = await executor
    .select()
    .from(vendasAgentes)
    .where(and(...filtros))
    .limit(1)
  return row ?? null
}
