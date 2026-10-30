import { ERROR_CODES, type AsaasEnvironmentName } from '@annetec/contracts'
import { env } from '@/config/env'
import { AppError } from '@/http/errors'
import { createAsaasClient, type AsaasClient } from '@/integrations/asaas/client'
import { platformAsaasApiKey } from '@/modules/platform-billing/gateway'

/**
 * Clientes Asaas da conta gerenciada:
 *  - PLATAFORMA (`PLATFORM_ASAAS_API_KEY ?? ASAAS_API_KEY`, ambiente
 *    `ASAAS_ENV`): cria a subconta, gera chave de recuperação, informa a
 *    carteira da ANNETEC;
 *  - SUBCONTA (chave da linha do clube): documentos, situação, saldo e a
 *    transferência para a ANNETEC.
 */

export const PLATFORM_ASAAS_NOT_CONFIGURED =
  'A conta gerenciada exige o Asaas da ANNETEC configurado (PLATFORM_ASAAS_API_KEY ou ASAAS_API_KEY).'

/** Ambiente das subcontas: o mesmo da conta da ANNETEC. */
export function managedAccountEnvironment(): AsaasEnvironmentName {
  return env.ASAAS_ENV
}

export function platformAsaasClient(): AsaasClient | null {
  const apiKey = platformAsaasApiKey()
  if (!apiKey) return null
  return createAsaasClient({
    apiKey,
    environment: env.ASAAS_ENV,
    userAgent: env.ASAAS_USER_AGENT,
    timeoutMs: env.ASAAS_TIMEOUT_MS,
  })
}

export function requirePlatformAsaasClient(): AsaasClient {
  const client = platformAsaasClient()
  if (!client) throw new AppError(ERROR_CODES.INTEGRATION_NOT_CONFIGURED, PLATFORM_ASAAS_NOT_CONFIGURED)
  return client
}

export function subaccountClient(apiKey: string, environment: AsaasEnvironmentName): AsaasClient {
  return createAsaasClient({
    apiKey,
    environment,
    userAgent: env.ASAAS_USER_AGENT,
    timeoutMs: env.ASAAS_TIMEOUT_MS,
  })
}

let cachedWalletId: string | null = null

/**
 * Carteira (`walletId`) da conta ANNETEC — destino do débito automático:
 * `GET /v3/wallets` com a chave da plataforma (guardada em cache no processo;
 * a carteira de uma conta não muda). `PLATFORM_ASAAS_WALLET_ID`, quando
 * preenchido, só é aceito se for uma das carteiras da conta dona da chave da
 * plataforma — um valor errado (ex.: carteira de uma subconta) nunca vira
 * destino do dinheiro dos clubes.
 */
export async function platformWalletId(): Promise<string> {
  if (cachedWalletId) return cachedWalletId
  const list = await requirePlatformAsaasClient().wallets.list()
  const ids = (list.data ?? []).map(wallet => wallet.id).filter(Boolean)
  const configured = env.PLATFORM_ASAAS_WALLET_ID
  if (configured && !ids.includes(configured)) {
    throw new AppError(
      ERROR_CODES.INTEGRATION_NOT_CONFIGURED,
      'PLATFORM_ASAAS_WALLET_ID não é a carteira da conta Asaas da ANNETEC (chave da plataforma) — débito bloqueado',
    )
  }
  const id = configured ?? ids[0]
  if (!id) throw new AppError(ERROR_CODES.UPSTREAM_ERROR, 'O Asaas não informou a carteira da conta da ANNETEC')
  cachedWalletId = id
  return id
}

/** Testes. */
export function resetPlatformWalletCache(): void {
  cachedWalletId = null
}
