import { ERROR_CODES } from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { digitalSaudeGlobalTenants, env, isProduction } from '@/config/env'
import { db } from '@/db/client'
import { organization, tenantIntegrations } from '@/db/schema'
import { AppError } from '@/http/errors'
import { decryptSecret } from '@/lib/crypto'
import { createDigitalSaudeClient, type DigitalSaudeClient } from './client'

/**
 * Resolve o cliente da Digital Saúde de um inquilino.
 *
 * Cada administradora tem seu próprio par token/senhaApi, então o cliente é
 * por inquilino — nunca global. As credenciais do `.env` servem só de fallback
 * para ambiente de desenvolvimento e para o inquilino piloto: em PRODUÇÃO o
 * fallback global só vale para os slugs de `DIGITALSAUDE_GLOBAL_TENANTS`; os
 * demais sem `tenant_integrations` recebem `INTEGRATION_NOT_CONFIGURED`.
 *
 * Os clientes ficam em cache de processo: montar um é barato, mas descriptografar
 * a cada request não é, e a configuração muda raramente.
 */
const cache = new Map<string, { client: DigitalSaudeClient; updatedAt: number }>()

export async function getDigitalSaudeClient(tenantId: string): Promise<DigitalSaudeClient> {
  const [row] = await db
    .select()
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.organizationId, tenantId))
    .limit(1)

  if (row && row.enabled) {
    const stamp = row.updatedAt.getTime()
    const cached = cache.get(tenantId)
    if (cached && cached.updatedAt === stamp) return cached.client

    const client = createDigitalSaudeClient({
      baseUrl: row.baseUrl,
      appToken: decryptSecret(row.appTokenEncrypted),
      apiPassword: decryptSecret(row.apiPasswordEncrypted),
      label: tenantId,
    })
    cache.set(tenantId, { client, updatedAt: stamp })
    return client
  }

  if (row && !row.enabled) {
    throw new AppError(
      ERROR_CODES.INTEGRATION_NOT_CONFIGURED,
      'A integração com a Digital Saúde está desativada para este inquilino',
    )
  }

  if (isProduction && !(await mayUseGlobalCredentials(tenantId))) {
    throw new AppError(
      ERROR_CODES.INTEGRATION_NOT_CONFIGURED,
      'Integração com a Digital Saúde não configurada para este inquilino',
    )
  }

  return getFallbackClient()
}

/** Produção: o slug do inquilino está na allowlist `DIGITALSAUDE_GLOBAL_TENANTS`? */
async function mayUseGlobalCredentials(tenantId: string): Promise<boolean> {
  if (digitalSaudeGlobalTenants.size === 0) return false
  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, tenantId))
    .limit(1)
  return Boolean(org && digitalSaudeGlobalTenants.has(org.slug.toLowerCase()))
}

/** Códigos fixos exigidos pelo `POST /contrato/` desta administradora. */
export async function getIntegrationDefaults(tenantId: string) {
  const [row] = await db
    .select({
      grupoCodigo: tenantIntegrations.defaultGrupoCodigo,
      filialCodigo: tenantIntegrations.defaultFilialCodigo,
      convenioCodigo: tenantIntegrations.defaultConvenioCodigo,
      produtoCodigo: tenantIntegrations.defaultProdutoCodigo,
      grupoProdutorCodigo: tenantIntegrations.defaultGrupoProdutorCodigo,
    })
    .from(tenantIntegrations)
    .where(eq(tenantIntegrations.organizationId, tenantId))
    .limit(1)

  return (
    row ?? {
      grupoCodigo: null,
      filialCodigo: null,
      convenioCodigo: null,
      produtoCodigo: null,
      grupoProdutorCodigo: null,
    }
  )
}

export function invalidateDigitalSaudeClient(tenantId: string) {
  cache.delete(tenantId)
}

function getFallbackClient(): DigitalSaudeClient {
  if (!env.DIGITALSAUDE_APP_TOKEN || !env.DIGITALSAUDE_API_PASSWORD) {
    throw new AppError(
      ERROR_CODES.INTEGRATION_NOT_CONFIGURED,
      'Integração com a Digital Saúde não configurada para este inquilino',
    )
  }
  return createDigitalSaudeClient({
    baseUrl: env.DIGITALSAUDE_BASE_URL,
    appToken: env.DIGITALSAUDE_APP_TOKEN,
    apiPassword: env.DIGITALSAUDE_API_PASSWORD,
    label: 'env-fallback',
  })
}
