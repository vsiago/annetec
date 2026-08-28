import type { Convenio, HealthPlan, PriceTable, QuoteInput, QuoteResult, WaitingPeriod } from '@annetec/contracts'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/db/client'
import { upstreamCache } from '@/db/schema'
import { getDigitalSaudeClient } from '@/integrations/digitalsaude/provider'
import { mapConvenio, mapPlan, mapPriceTable } from '@/integrations/digitalsaude/mappers'
import { logger } from '@/lib/logger'

/**
 * Catálogo comercial lido da Digital Saúde.
 *
 * Convênios, planos e tabelas de preço mudam pouco e são consultados em toda
 * tela de venda — por isso passam por um cache em banco (`upstream_cache`) com
 * TTL curto. Cotação (`/calculo/`) NUNCA é cacheada: é um cálculo por idade e
 * região, e servir um resultado velho seria vender preço errado.
 */
const CACHE_TTL_MINUTES = 60

export const catalogService = {
  listConvenios(tenantId: string): Promise<Convenio[]> {
    return cached(tenantId, 'convenios', async () => {
      const client = await getDigitalSaudeClient(tenantId)
      const result = await client.call('convenioListar')
      return result.map(mapConvenio)
    })
  },

  async getConvenio(tenantId: string, codigo: string): Promise<Convenio | null> {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.one('convenioPorCodigo', { codigoConvenio: codigo })
    return result ? mapConvenio(result) : null
  },

  listPlansByProduct(tenantId: string, codigoProduto: string): Promise<HealthPlan[]> {
    return cached(tenantId, `planos:${codigoProduto}`, async () => {
      const client = await getDigitalSaudeClient(tenantId)
      const result = await client.call('planoPorProduto', { codigoProduto })
      return result.map(mapPlan)
    })
  },

  async getPlan(tenantId: string, codigo: string): Promise<HealthPlan | null> {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.one('planoPorCodigo', { codigoPlano: codigo })
    return result ? mapPlan(result) : null
  },

  listWaitingPeriods(tenantId: string, codigoConvenio: string): Promise<WaitingPeriod[]> {
    return cached(tenantId, `carencias:${codigoConvenio}`, async () => {
      const client = await getDigitalSaudeClient(tenantId)
      const result = await client.call('carenciaPorConvenio', { codigoConvenio })
      return result.map(item => ({ codigo: item.codigo ?? '', name: item.nome ?? '' }))
    })
  },

  listPriceTables(tenantId: string, codigoConvenio: string): Promise<PriceTable[]> {
    return cached(tenantId, `tabelas:${codigoConvenio}`, async () => {
      const client = await getDigitalSaudeClient(tenantId)
      const result = await client.call('tabelaPorConvenio', { codigoConvenio })
      return result.map(mapPriceTable)
    })
  },

  async getPriceTable(tenantId: string, codigo: string): Promise<PriceTable | null> {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.one('tabelaPorCodigo', { codigoTabela: codigo })
    return result ? mapPriceTable(result) : null
  },

  /** Simulação de preço por região e composição familiar. Sem cache. */
  async quote(tenantId: string, input: QuoteInput): Promise<QuoteResult> {
    const client = await getDigitalSaudeClient(tenantId)
    const result = await client.call('calculoSimular', {
      nome: input.name,
      uf: input.state,
      calculoVidaList: input.lives.map(life => ({
        idade: life.age,
        parentesco: { id: life.relationshipId },
      })),
    })
    return { plans: result.map(mapPlan), quotedAt: new Date().toISOString() }
  },

  async invalidate(tenantId: string) {
    await db.delete(upstreamCache).where(eq(upstreamCache.organizationId, tenantId))
  },
}

/**
 * Lê do cache em banco ou busca no upstream e grava. Falha de escrita no cache
 * nunca derruba a request: o dado já foi obtido, o cache é otimização.
 */
async function cached<T>(tenantId: string, key: string, loader: () => Promise<T>): Promise<T> {
  const [hit] = await db
    .select({ payload: upstreamCache.payload })
    .from(upstreamCache)
    .where(
      and(
        eq(upstreamCache.organizationId, tenantId),
        eq(upstreamCache.cacheKey, key),
        gt(upstreamCache.expiresAt, new Date()),
      ),
    )
    .limit(1)

  if (hit) return hit.payload as T

  const value = await loader()
  const expiresAt = new Date(Date.now() + CACHE_TTL_MINUTES * 60_000)

  try {
    await db.delete(upstreamCache).where(
      and(eq(upstreamCache.organizationId, tenantId), eq(upstreamCache.cacheKey, key)),
    )
    await db.insert(upstreamCache).values({
      organizationId: tenantId,
      cacheKey: key,
      payload: value as never,
      expiresAt,
    })
  } catch (error) {
    logger.warn({ tenantId, key, err: error }, 'Não foi possível gravar o cache do catálogo')
  }

  return value
}
