import {
  DEFAULT_MODELOS_MENSAGEM,
  DEFAULT_VENDAS_CONFIG,
  type EscopoVendas,
  type UpdateConfigInput,
  type VendasConfig,
  type VendasConfigPublica,
} from '@annetec/contracts'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { vendasConfig, type VendasConfigRow } from '@/db/schema'

/**
 * Regra comercial do escopo (`vendas_config`): uma linha por escopo, criada
 * sob demanda com os padrões da especificação. Quem escreve é o master
 * (`PUT /config`); todo agente lê a parte pública (presença, modelos de mensagem).
 */

type Escopo = { scope: EscopoVendas; tenantId: string | null }

function whereConfig({ scope, tenantId }: Escopo) {
  return and(eq(vendasConfig.scope, scope), tenantId ? eq(vendasConfig.tenantId, tenantId) : isNull(vendasConfig.tenantId))!
}

/** `db`, transação ou savepoint: quem roda dentro de uma transação (gancho de pagamento) passa o `tx`. */
export type ExecutorConfig = Pick<typeof db, 'select' | 'insert'>

async function lerConfig(escopo: Escopo, executor: ExecutorConfig): Promise<VendasConfigRow | null> {
  const [row] = await executor.select().from(vendasConfig).where(whereConfig(escopo)).limit(1)
  return row ?? null
}

/**
 * Config do escopo; cria com os padrões se ainda não existir (corrida: o índice único decide, quem perde só relê).
 * Dentro de uma transação, passe o `tx`: usar o `db` global ali pede uma 2ª conexão ao pool enquanto a 1ª segue presa.
 */
export async function getOrCreateConfig(scope: EscopoVendas, tenantId: string | null, executor: ExecutorConfig = db): Promise<VendasConfigRow> {
  const escopo = { scope, tenantId }
  const existente = await lerConfig(escopo, executor)
  if (existente) return existente

  await executor
    .insert(vendasConfig)
    .values({
      scope,
      tenantId,
      escalaMensal: [...DEFAULT_VENDAS_CONFIG.escalaMensal],
      percentualAdesao: String(scope === 'platform' ? DEFAULT_VENDAS_CONFIG.percentualAdesaoPlatform : DEFAULT_VENDAS_CONFIG.percentualAdesaoTenant),
      overrides: { ...DEFAULT_VENDAS_CONFIG.overrides },
      balcaoPercentual: null,
      distribuicao: DEFAULT_VENDAS_CONFIG.distribuicao,
      poolRetornoHoras: DEFAULT_VENDAS_CONFIG.poolRetornoHoras,
      presencaMinutos: DEFAULT_VENDAS_CONFIG.presencaMinutos,
      balcaoDescontoPadrao: DEFAULT_VENDAS_CONFIG.balcaoDescontoPadrao,
      metaMensalPadrao: DEFAULT_VENDAS_CONFIG.metaMensalPadrao,
      modelosMensagem: DEFAULT_MODELOS_MENSAGEM,
    })
    .onConflictDoNothing()

  const criada = await lerConfig(escopo, executor)
  if (!criada) throw new Error('Falha ao criar a configuração da Rede Comercial')
  return criada
}

/** Linha do banco → contrato (numeric vira número). */
export function toVendasConfig(row: VendasConfigRow): VendasConfig {
  return {
    id: row.id,
    scope: row.scope,
    tenantId: row.tenantId ?? null,
    escalaMensal: row.escalaMensal,
    percentualAdesao: Number(row.percentualAdesao),
    overrides: row.overrides,
    balcaoPercentual: row.balcaoPercentual ?? null,
    distribuicao: row.distribuicao,
    poolRetornoHoras: row.poolRetornoHoras,
    presencaMinutos: row.presencaMinutos,
    balcaoDescontoPadrao: row.balcaoDescontoPadrao,
    metaMensalPadrao: row.metaMensalPadrao,
    modelosMensagem: row.modelosMensagem,
    updatedAt: row.updatedAt.toISOString(),
    updatedByUserId: row.updatedByUserId ?? null,
  }
}

/** A parte da config que qualquer agente lê. */
export function toConfigPublica(
  row: Pick<
    VendasConfigRow,
    'presencaMinutos' | 'distribuicao' | 'poolRetornoHoras' | 'balcaoDescontoPadrao' | 'metaMensalPadrao' | 'modelosMensagem'
  >,
): VendasConfigPublica {
  return {
    presencaMinutos: row.presencaMinutos,
    distribuicao: row.distribuicao,
    poolRetornoHoras: row.poolRetornoHoras,
    balcaoDescontoPadrao: row.balcaoDescontoPadrao,
    metaMensalPadrao: row.metaMensalPadrao,
    modelosMensagem: row.modelosMensagem,
  }
}

/**
 * `PUT /config` (master): substitui a regra do escopo inteira. Devolve a
 * versão ANTERIOR e a nova — o controller grava a auditoria com as duas.
 */
export async function updateConfig(
  escopo: Escopo,
  input: UpdateConfigInput,
  userId: string,
): Promise<{ antes: VendasConfigRow; depois: VendasConfigRow }> {
  const antes = await getOrCreateConfig(escopo.scope, escopo.tenantId)
  const [depois] = await db
    .update(vendasConfig)
    .set({
      escalaMensal: input.escalaMensal,
      percentualAdesao: String(input.percentualAdesao),
      overrides: input.overrides,
      balcaoPercentual: input.balcaoPercentual,
      distribuicao: input.distribuicao,
      poolRetornoHoras: input.poolRetornoHoras,
      presencaMinutos: input.presencaMinutos,
      balcaoDescontoPadrao: input.balcaoDescontoPadrao,
      metaMensalPadrao: input.metaMensalPadrao,
      modelosMensagem: input.modelosMensagem,
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(eq(vendasConfig.id, antes.id))
    .returning()
  if (!depois) throw new Error('Falha ao salvar a configuração da Rede Comercial')
  return { antes, depois }
}
