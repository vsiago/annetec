import { ERROR_CODES, type PaymentGatewayProvider } from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { env, isProduction, webBaseUrl } from '@/config/env'
import { db } from '@/db/client'
import { clubBillingSettings, organization, tenantProfiles } from '@/db/schema'
import { AppError } from '@/http/errors'
import { createAsaasClient } from '@/integrations/asaas/client'
import { AsaasGateway } from '@/integrations/asaas/gateway'
import { checkoutAccessKey } from '@/modules/club-billing/access-key'
import { resolveClubAsaasCredentials } from '@/modules/club-billing/receiving-account.service'
import { GatewayNotConfiguredError, type PaymentGateway } from './gateway'
import { SimulatedGateway, type SimulatedOptions } from './simulated'

/**
 * Qual gateway processa as cobranças de um inquilino (blueprint §0.1-2):
 * override do inquilino (`billing_settings.gateway`) → env `PAYMENT_GATEWAY`
 * → `simulated`.
 *
 * `asaas` = a conta Asaas PRÓPRIA do clube (`tenant_asaas_accounts`, chave
 * colada no painel). Clube sem conta conectada → `GatewayNotConfiguredError`
 * (409 `RECEBIMENTO_NAO_CONFIGURADO`): adesão/cobrança bloqueadas, NUNCA a
 * conta da ANNETEC — `ASAAS_API_KEY` é só da plataforma. Instâncias do Asaas
 * ficam em cache por clube, invalidadas pelo `updated_at` da conta (trocar
 * a chave vale na hora).
 *
 * Cobrança já criada segue no gateway em que nasceu (`getGatewayFor` com o
 * `gateway_provider` da linha) — trocar o gateway do inquilino só vale para
 * as próximas.
 */

const TENANT_CACHE_TTL_MS = 5 * 60 * 1000

const asaasGateways = new Map<string, { gateway: AsaasGateway; updatedAt: number }>()
const simulatedCache = new Map<string, { gateway: SimulatedGateway; expiresAt: number }>()

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
 * Override → env → simulado. Em PRODUÇÃO não há simulado: `simulated` (env ou
 * override gravado no banco) lança `INTEGRATION_NOT_CONFIGURED` — melhor
 * falhar a cobrança do que emitir Pix/boleto de mentira. `asaas` não depende
 * mais de chave no servidor: quem decide se o clube pode cobrar é a conta
 * dele (`assertGatewayReady`/`getGatewayFor`).
 */
export function effectiveProvider(override: PaymentGatewayProvider | null): PaymentGatewayProvider {
  const wanted = override ?? env.PAYMENT_GATEWAY
  if (isProduction && wanted === 'simulated') {
    throw new AppError(ERROR_CODES.INTEGRATION_NOT_CONFIGURED, 'Gateway simulado não é permitido em produção')
  }
  return wanted
}

/** O clube pode cobrar no `provider`? `asaas` sem conta conectada → `GatewayNotConfiguredError`. */
export async function assertGatewayReady(orgId: string, provider: PaymentGatewayProvider): Promise<void> {
  if (provider === 'asaas' && !(await resolveClubAsaasCredentials(orgId))) throw new GatewayNotConfiguredError()
}

/** `resolveGatewayProvider` + `assertGatewayReady`: para quem vai CRIAR cobrança agora. */
export async function resolveReadyGatewayProvider(orgId: string): Promise<PaymentGatewayProvider> {
  const provider = await resolveGatewayProvider(orgId)
  await assertGatewayReady(orgId, provider)
  return provider
}

export interface GatewayDescription {
  provider: PaymentGatewayProvider
  sandbox: boolean
  /** Simulado: sempre `true`. Asaas: o clube tem conta conectada. */
  receivingConfigured: boolean
}

/**
 * Gateway efetivo para as TELAS (configurações, resumo, contexto do
 * checkout): nunca lança por falta de conta — a tela precisa abrir para
 * mostrar o aviso. Simulado em produção continua lançando.
 */
export async function describeGateway(orgId: string, override: PaymentGatewayProvider | null): Promise<GatewayDescription> {
  const provider = effectiveProvider(override)
  if (provider === 'simulated') return { provider, sandbox: false, receivingConfigured: true }
  const credentials = await resolveClubAsaasCredentials(orgId)
  return { provider, sandbox: credentials ? credentials.env === 'sandbox' : false, receivingConfigured: Boolean(credentials) }
}

/** Gateway efetivo do inquilino (para criar cobranças novas). */
export async function getPaymentGateway(orgId: string): Promise<PaymentGateway> {
  return getGatewayFor(orgId, await resolveGatewayProvider(orgId))
}

/** Gateway de um provider específico (o da cobrança já existente). */
export async function getGatewayFor(orgId: string, provider: PaymentGatewayProvider): Promise<PaymentGateway> {
  if (provider === 'asaas') {
    const credentials = await resolveClubAsaasCredentials(orgId)
    if (!credentials) throw new GatewayNotConfiguredError()
    const stamp = credentials.updatedAt.getTime()
    const cached = asaasGateways.get(orgId)
    if (cached && cached.updatedAt === stamp) return cached.gateway
    const gateway = new AsaasGateway(
      createAsaasClient({
        apiKey: credentials.apiKey,
        environment: credentials.env,
        userAgent: env.ASAAS_USER_AGENT,
        timeoutMs: env.ASAAS_TIMEOUT_MS,
      }),
      credentials.env,
    )
    asaasGateways.set(orgId, { gateway, updatedAt: stamp })
    return gateway
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
