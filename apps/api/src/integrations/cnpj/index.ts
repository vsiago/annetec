import { ERROR_CODES, isValidCnpj, onlyDigits, type CnpjLookupResponse, type CnpjLookupResult } from '@annetec/contracts'
import { env, isProduction } from '@/config/env'
import { AppError } from '@/http/errors'
import { logger } from '@/lib/logger'
import { fetchBrasilApiCnpj, mapBrasilApiCnpj } from './brasilapi'
import { demoCnpjLookup, syntheticCnpjLookup } from './simulated'

/**
 * Consulta de CNPJ da contratação (blueprint da plataforma §0.1-12).
 *
 *  1. CNPJ de demonstração (`SIMULATED_CNPJ_DATA`) → responde sem rede, só
 *     FORA de produção (em produção vai à Receita como qualquer outro);
 *  2. `CNPJ_LOOKUP_PROVIDER=simulated` → cadastro sintético determinístico
 *     (em produção lança — o boot já recusa essa config);
 *  3. senão BrasilAPI (timeout `CNPJ_LOOKUP_TIMEOUT_MS`, cache em memória
 *     `CNPJ_LOOKUP_CACHE_TTL_SECONDS`).
 *
 * Falha da Receita NUNCA é erro: `unavailable: true` e o formulário segue
 * manual (a pré-checagem `cnpj_active` vira alerta).
 */

const cache = new Map<string, { expiresAt: number; result: Omit<CnpjLookupResult, 'cached' | 'fetchedAt'>; fetchedAt: string }>()
const MAX_CACHE_ENTRIES = 500

export function clearCnpjCache() {
  cache.clear()
}

function found(result: Omit<CnpjLookupResult, 'cached' | 'fetchedAt'>, cached: boolean, fetchedAt: string): CnpjLookupResponse {
  return { found: true, unavailable: false, message: null, result: { ...result, cached, fetchedAt } }
}

export async function lookupCnpj(input: string, now: Date = new Date()): Promise<CnpjLookupResponse> {
  const cnpj = onlyDigits(input)
  if (cnpj.length !== 14 || !isValidCnpj(cnpj)) {
    return { found: false, unavailable: false, message: 'CNPJ inválido — confira os dígitos.', result: null }
  }

  const demo = isProduction ? null : demoCnpjLookup(cnpj, now)
  if (demo) return found(demo, false, now.toISOString())

  if (env.CNPJ_LOOKUP_PROVIDER === 'simulated') {
    if (isProduction) {
      throw new AppError(ERROR_CODES.INTEGRATION_NOT_CONFIGURED, 'Consulta de CNPJ simulada não é permitida em produção')
    }
    return found(syntheticCnpjLookup(cnpj), false, now.toISOString())
  }

  const hit = cache.get(cnpj)
  if (hit && hit.expiresAt > now.getTime()) return found(hit.result, true, hit.fetchedAt)

  const outcome = await fetchBrasilApiCnpj(cnpj, env.CNPJ_LOOKUP_TIMEOUT_MS)
  if (outcome.kind === 'not_found') {
    return {
      found: false,
      unavailable: false,
      message: 'CNPJ não encontrado na base da Receita. Confira o número ou preencha os dados manualmente.',
      result: null,
    }
  }
  if (outcome.kind === 'unavailable') {
    logger.warn({ reason: outcome.reason }, 'Consulta de CNPJ indisponível (BrasilAPI)')
    return {
      found: false,
      unavailable: true,
      message: 'A consulta à Receita está indisponível agora. Preencha os dados manualmente — a análise confere depois.',
      result: null,
    }
  }

  const result = mapBrasilApiCnpj(outcome.body, cnpj)
  const fetchedAt = now.toISOString()
  if (env.CNPJ_LOOKUP_CACHE_TTL_SECONDS > 0) {
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest) cache.delete(oldest)
    }
    cache.set(cnpj, { expiresAt: now.getTime() + env.CNPJ_LOOKUP_CACHE_TTL_SECONDS * 1000, result, fetchedAt })
  }
  return found(result, false, fetchedAt)
}
