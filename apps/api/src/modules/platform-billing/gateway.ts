import { ERROR_CODES, type PaymentGatewayProvider } from '@annetec/contracts'
import { env, isProduction } from '@/config/env'
import { AppError } from '@/http/errors'
import { createAsaasClient } from '@/integrations/asaas/client'
import { AsaasGateway } from '@/integrations/asaas/gateway'
import type { PaymentGateway } from '@/integrations/payments/gateway'
import { simulatedOptionsFromEnv } from '@/integrations/payments/provider'
import { SimulatedGateway } from '@/integrations/payments/simulated'
import { logger } from '@/lib/logger'
import { parsePlatformReference, platformInvoiceUrl } from './access-key'

/**
 * Gateway da cobrança ANNETEC → inquilinos (blueprint da plataforma §0.1-6):
 * `platform_billing_settings.gateway` → env `PLATFORM_PAYMENT_GATEWAY` →
 * `simulated`. `asaas` usa `PLATFORM_ASAAS_API_KEY ?? ASAAS_API_KEY`; sem
 * chave cai no simulado (aviso 1× por processo). Sem estado no banco: o
 * recebedor é a própria ANNETEC.
 *
 * Modo do simulado:
 *  - `interactive` (ativação, "Pagar" na página pública): Pix/boleto
 *    compensam sozinhos após `SIMULATED_*_APPROVE_SECONDS` — alguém está com
 *    o QR na tela;
 *  - `passive` (fatura do ciclo gerada pela automação, segunda via): só
 *    compensa pelo botão "Simular pagamento"/baixa — senão a régua da demo
 *    nunca chegaria a vencer.
 */

export type PlatformGatewayMode = 'interactive' | 'passive'

let warnedAsaasMissing = false
let asaasGateway: AsaasGateway | null = null
const simulatedGateways = new Map<PlatformGatewayMode, SimulatedGateway>()

export function platformAsaasApiKey(): string | undefined {
  return env.PLATFORM_ASAAS_API_KEY ?? env.ASAAS_API_KEY
}

export function isPlatformAsaasConfigured(): boolean {
  return Boolean(platformAsaasApiKey())
}

/** Token do webhook da plataforma (`PLATFORM_ASAAS_WEBHOOK_TOKEN` → `ASAAS_WEBHOOK_TOKEN`). */
export function platformWebhookToken(): string | undefined {
  return env.PLATFORM_ASAAS_WEBHOOK_TOKEN ?? env.ASAAS_WEBHOOK_TOKEN
}

/**
 * Override → env → simulado, rebaixando `asaas` sem chave.
 *
 * Em PRODUÇÃO não há rebaixamento nem simulado: `simulated` (env ou override
 * do banco) ou `asaas` sem chave lançam `INTEGRATION_NOT_CONFIGURED`.
 */
export function effectivePlatformProvider(override: PaymentGatewayProvider | null | undefined): PaymentGatewayProvider {
  const wanted = override ?? env.PLATFORM_PAYMENT_GATEWAY
  if (isProduction) {
    if (wanted === 'simulated') {
      throw new AppError(ERROR_CODES.INTEGRATION_NOT_CONFIGURED, 'Gateway simulado não é permitido em produção')
    }
    if (!isPlatformAsaasConfigured()) {
      throw new AppError(
        ERROR_CODES.INTEGRATION_NOT_CONFIGURED,
        'Asaas da plataforma sem PLATFORM_ASAAS_API_KEY/ASAAS_API_KEY em produção',
      )
    }
    return wanted
  }
  if (wanted === 'asaas' && !isPlatformAsaasConfigured()) {
    if (!warnedAsaasMissing) {
      warnedAsaasMissing = true
      logger.warn('Gateway da plataforma = asaas sem PLATFORM_ASAAS_API_KEY/ASAAS_API_KEY: usando o simulado')
    }
    return 'simulated'
  }
  return wanted
}

function simulatedPlatformGateway(mode: PlatformGatewayMode): SimulatedGateway {
  const cached = simulatedGateways.get(mode)
  if (cached) return cached
  const base = simulatedOptionsFromEnv()
  const gateway = new SimulatedGateway(
    { orgId: 'annetec-platform', name: env.PLATFORM_MERCHANT_NAME, slug: 'annetec', city: env.PLATFORM_MERCHANT_CITY },
    {
      ...base,
      ...(mode === 'passive' ? { pixApproveSeconds: 0, boletoApproveSeconds: 0 } : {}),
      // O simulado passa o `externalReference` (`plt_…`) como `chargeId`.
      boletoUrl: ({ chargeId }) => {
        const id = parsePlatformReference(chargeId)
        return id ? platformInvoiceUrl(id, { print: true }) : ''
      },
    },
  )
  simulatedGateways.set(mode, gateway)
  return gateway
}

/** Gateway de um provider (o da cobrança já existente ou o efetivo para uma nova). */
export function platformGatewayFor(provider: PaymentGatewayProvider, mode: PlatformGatewayMode = 'passive'): PaymentGateway {
  if (provider === 'asaas') {
    const apiKey = platformAsaasApiKey()
    if (!apiKey) {
      throw new AppError(
        ERROR_CODES.INTEGRATION_NOT_CONFIGURED,
        'Esta fatura é do Asaas, mas o servidor está sem PLATFORM_ASAAS_API_KEY/ASAAS_API_KEY',
      )
    }
    asaasGateway ??= new AsaasGateway(
      createAsaasClient({
        apiKey,
        environment: env.ASAAS_ENV,
        userAgent: env.ASAAS_USER_AGENT,
        timeoutMs: env.ASAAS_TIMEOUT_MS,
      }),
      env.ASAAS_ENV,
    )
    return asaasGateway
  }
  // Fatura simulada antiga (ou override esquecido) nunca "compensa" em produção.
  if (isProduction) {
    throw new AppError(ERROR_CODES.INTEGRATION_NOT_CONFIGURED, 'Gateway simulado não é permitido em produção')
  }
  return simulatedPlatformGateway(mode)
}
