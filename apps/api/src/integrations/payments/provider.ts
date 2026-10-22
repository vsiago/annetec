import { ERROR_CODES, type PaymentGatewayProvider } from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { env, isProduction, webBaseUrl } from '@/config/env'
import { db } from '@/db/client'
import { clubBillingSettings, organization, tenantProfiles } from '@/db/schema'
import { AppError } from '@/http/errors'
import { createAsaasClient } from '@/integrations/asaas/client'
import { AsaasGateway } from '@/integrations/asaas/gateway'
import { logger } from '@/lib/logger'
import { checkoutAccessKey } from '@/modules/club-billing/access-key'
import type { PaymentGateway } from './gateway'
import { SimulatedGateway, type SimulatedOptions } from './simulated'

/**
 * Qual gateway processa as cobranças de um inquilino (blueprint §0.1-2):
 * override do inquilino (`billing_settings.gateway`) → env `PAYMENT_GATEWAY`
 * → `simulated`. `asaas` sem `ASAAS_API_KEY` cai no simulado (aviso 1× por
 * processo). Instâncias ficam em cache por processo.
 *
 * Cobrança já criada segue no gateway em que nasceu (`getGatewayFor` com o
 * `gateway_provider` da linha) — trocar o gateway do inquilino só vale para
 * as próximas.
 */

const TENANT_CACHE_TTL_MS = 5 * 60 * 1000

let warnedAsaasMissing = false
let asaasGateway: AsaasGateway | null = null
const simulatedCache = new Map<string, { gateway: SimulatedGateway; expiresAt: number }>()

export function isAsaasConfigured(): boolean {
  return Boolean(env.ASAAS_API_KEY)
}

export function simulatedOptionsFromEnv(): SimulatedOptions {
  return {
    pixApproveSeconds: env.SIMULATED_PIX_APPROVE_SECONDS,
    boletoApproveSeconds: env.SIMULATED_BOLETO_APPROVE_SECONDS,
    pixKey: env.SIMULATED_PIX_KEY,
    boletoUrl: ({ slug, subscriptionId, chargeId }) =>
      `${webBaseUrl}/${encodeURIComponent(slug)}/assinar/boleto?assinatura=${subscriptionId}&cobranca=${chargeId}&chave=${checkoutAccessKey(subscriptionId)}`,
  }
}

/** Provider efetivo AGORA para novas cobranças do inquilino. */
export async function resolveGatewayProvider(orgId: string): Promise<PaymentGatewayProvider> {
  const [row] = await db
    .select({ gateway: clubBillingSettings.gateway })
    .from(clubBillingSettings)
    .where(eq(clubBillingSettings.organizationId, orgId))
    .limit(1)
  return effectiveProvider(row?.gateway ?? null)
}

/**
 * Override → env → simulado, com o rebaixamento de `asaas` sem chave.
 *
 * Em PRODUÇÃO não há rebaixamento nem simulado: `simulated` (env ou override
 * gravado no banco) ou `asaas` sem chave lançam `INTEGRATION_NOT_CONFIGURED`
 * — melhor falhar a cobrança do que emitir Pix/boleto de mentira.
 */
export function effectiveProvider(override: PaymentGatewayProvider | null): PaymentGatewayProvider {
  const wanted = override ?? env.PAYMENT_GATEWAY
  if (isProduction) {
    if (wanted === 'simulated') {
      throw new AppError(ERROR_CODES.INTEGRATION_NOT_CONFIGURED, 'Gateway simulado não é permitido em produção')
    }
    if (!isAsaasConfigured()) {
      throw new AppError(ERROR_CODES.INTEGRATION_NOT_CONFIGURED, 'Asaas sem ASAAS_API_KEY em produção')
    }
    return wanted
  }
  if (wanted === 'asaas' && !isAsaasConfigured()) {
    if (!warnedAsaasMissing) {
      warnedAsaasMissing = true
      logger.warn('PAYMENT_GATEWAY=asaas sem ASAAS_API_KEY: usando o gateway simulado')
    }
    return 'simulated'
  }
  return wanted
}

/** Gateway efetivo do inquilino (para criar cobranças novas). */
export async function getPaymentGateway(orgId: string): Promise<PaymentGateway> {
  return getGatewayFor(orgId, await resolveGatewayProvider(orgId))
}

/** Gateway de um provider específico (o da cobrança já existente). */
export async function getGatewayFor(orgId: string, provider: PaymentGatewayProvider): Promise<PaymentGateway> {
  if (provider === 'asaas') {
    if (!env.ASAAS_API_KEY) {
      throw new AppError(
        ERROR_CODES.INTEGRATION_NOT_CONFIGURED,
        'Esta cobrança é do Asaas, mas o servidor está sem ASAAS_API_KEY',
      )
    }
    asaasGateway ??= new AsaasGateway(
      createAsaasClient({
        apiKey: env.ASAAS_API_KEY,
        environment: env.ASAAS_ENV,
        userAgent: env.ASAAS_USER_AGENT,
        timeoutMs: env.ASAAS_TIMEOUT_MS,
      }),
      env.ASAAS_ENV,
    )
    return asaasGateway
  }

  // Cobrança simulada antiga (ou override esquecido) nunca "compensa" em produção.
  if (isProduction) {
    throw new AppError(ERROR_CODES.INTEGRATION_NOT_CONFIGURED, 'Gateway simulado não é permitido em produção')
  }

  const cached = simulatedCache.get(orgId)
  if (cached && cached.expiresAt > Date.now()) return cached.gateway

  const [tenant] = await db
    .select({ name: organization.name, slug: organization.slug, address: tenantProfiles.address })
    .from(organization)
    .leftJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
    .where(eq(organization.id, orgId))
    .limit(1)
  if (!tenant) throw AppError.notFound('Inquilino')

  const gateway = new SimulatedGateway(
    { orgId, name: tenant.name, slug: tenant.slug, city: tenant.address?.city ?? 'Sao Paulo' },
    simulatedOptionsFromEnv(),
  )
  simulatedCache.set(orgId, { gateway, expiresAt: Date.now() + TENANT_CACHE_TTL_MS })
  return gateway
}
