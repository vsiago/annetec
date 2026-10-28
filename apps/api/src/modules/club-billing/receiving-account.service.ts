import { randomBytes } from 'node:crypto'
import { onlyDigits, type AsaasEnvironmentName, type ClubReceivingAccount, type ConnectClubReceivingAccountInput } from '@annetec/contracts'
import { and, eq, inArray, isNotNull, notInArray, or, sql } from 'drizzle-orm'
import { allowedClubAsaasEnvironments, publicHttpsIssue } from '@/config/assert-production'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { clubSubscriptions, organization, tenantAsaasAccounts, tenantProfiles, type AsaasAccountStatusSnapshot } from '@/db/schema'
import { AppError } from '@/http/errors'
import { AsaasApiError, createAsaasClient, type AsaasClient } from '@/integrations/asaas/client'
import type { AsaasAccountStatus, AsaasCommercialInfo, AsaasWebhook } from '@/integrations/asaas/types'
import { ASAAS_WEBHOOK_EVENTS } from '@/integrations/asaas/webhook-events'
import { GatewayNotConfiguredError } from '@/integrations/payments/gateway'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import {
  INVALID_KEY_MESSAGE,
  LINKED_SUBSCRIPTION_STATUSES,
  clubWebhookName,
  clubWebhookUrl,
  environmentPolicyIssue,
  keyHintOf,
  linkedSubscriptionsMessage,
  maskCpfCnpj,
  normalizeWebhookUrl,
  parseAsaasApiKey,
  sameAsaasAccount,
  summarizeAccountStatus,
} from './receiving-account.rules'

/**
 * Conta de recebimento do clube — a conta Asaas PRÓPRIA do inquilino, onde
 * caem as mensalidades dos associados (`tenant_asaas_accounts`).
 *
 *  - quem conecta é o admin do clube (ou o superadmin, para suporte) colando
 *    a chave de API gerada no painel do Asaas do clube;
 *  - a chave é validada no Asaas (`/myAccount/commercialInfo/` e
 *    `/myAccount/status/`) no ambiente que o prefixo indica, gravada cifrada e
 *    nunca devolvida;
 *  - o webhook do clube (`/api/v1/webhooks/asaas/clube/:organizationId`, token
 *    próprio) é cadastrado/reativado na conta do clube a cada conectar/testar;
 *  - sem conta conectada o provider recusa o Asaas (`GatewayNotConfiguredError`)
 *    — a chave global `ASAAS_API_KEY` é só da plataforma.
 */

export interface ClubAsaasCredentials {
  apiKey: string
  env: AsaasEnvironmentName
  updatedAt: Date
}

type AccountRow = typeof tenantAsaasAccounts.$inferSelect

/** Chave decifrada em cache de processo, invalidada pelo `updated_at` da linha. */
const credentialsCache = new Map<string, { updatedAt: number; apiKey: string; env: AsaasEnvironmentName }>()

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function clientFor(apiKey: string, environment: AsaasEnvironmentName): AsaasClient {
  return createAsaasClient({
    apiKey,
    environment,
    userAgent: env.ASAAS_USER_AGENT,
    timeoutMs: env.ASAAS_TIMEOUT_MS,
  })
}

/** Chave/ambiente da conta do clube para o provider (`null` = recebimento não configurado). */
export async function resolveClubAsaasCredentials(orgId: string): Promise<ClubAsaasCredentials | null> {
  const [row] = await db
    .select({
      apiKeyEncrypted: tenantAsaasAccounts.apiKeyEncrypted,
      env: tenantAsaasAccounts.env,
      updatedAt: tenantAsaasAccounts.updatedAt,
    })
    .from(tenantAsaasAccounts)
    .where(eq(tenantAsaasAccounts.organizationId, orgId))
    .limit(1)
  if (!row) {
    credentialsCache.delete(orgId)
    return null
  }
  const stamp = row.updatedAt.getTime()
  const cached = credentialsCache.get(orgId)
  if (cached && cached.updatedAt === stamp) return { apiKey: cached.apiKey, env: cached.env, updatedAt: row.updatedAt }
  const apiKey = decryptSecret(row.apiKeyEncrypted)
  credentialsCache.set(orgId, { updatedAt: stamp, apiKey, env: row.env })
  return { apiKey, env: row.env, updatedAt: row.updatedAt }
}

/** Token esperado no webhook do clube; `null` = clube sem conta (ou token ainda não gerado). */
export async function loadClubWebhookToken(orgId: string): Promise<string | null> {
  const [row] = await db
    .select({ webhookTokenEncrypted: tenantAsaasAccounts.webhookTokenEncrypted })
    .from(tenantAsaasAccounts)
    .where(eq(tenantAsaasAccounts.organizationId, orgId))
    .limit(1)
  if (!row?.webhookTokenEncrypted) return null
  try {
    return decryptSecret(row.webhookTokenEncrypted)
  } catch (error) {
    logger.error({ tenantId: orgId, err: errorText(error) }, 'Token do webhook do clube ilegível (BETTER_AUTH_SECRET mudou?)')
    return null
  }
}

async function loadRow(orgId: string): Promise<AccountRow | null> {
  const [row] = await db.select().from(tenantAsaasAccounts).where(eq(tenantAsaasAccounts.organizationId, orgId)).limit(1)
  return row ?? null
}

async function saveRow(orgId: string, values: Partial<Omit<AccountRow, 'organizationId'>>): Promise<void> {
  await db
    .update(tenantAsaasAccounts)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(tenantAsaasAccounts.organizationId, orgId))
}

/** Chave recusada (401/403) vira 422 com a orientação; o resto segue como veio. */
function translateKeyError(error: unknown): unknown {
  if (error instanceof AsaasApiError && (error.httpStatus === 401 || error.httpStatus === 403)) {
    return AppError.businessRule(
      'O Asaas recusou esta chave de API. Confira se copiou a chave inteira, se ela está ativa e se é do ambiente certo (sandbox × produção).',
    )
  }
  return error
}

async function fetchAccount(client: AsaasClient): Promise<{ info: AsaasCommercialInfo; status: AsaasAccountStatus | null }> {
  let info: AsaasCommercialInfo
  try {
    info = await client.account.commercialInfo()
  } catch (error) {
    throw translateKeyError(error)
  }
  let status: AsaasAccountStatus | null = null
  try {
    status = await client.account.status()
  } catch (error) {
    // A situação cadastral é informativa: sem ela a conexão segue (o resumo fica vazio).
    logger.warn({ integration: 'asaas', err: errorText(error) }, 'Recebimento do clube: /myAccount/status indisponível')
  }
  return { info, status }
}

function snapshotOf(status: AsaasAccountStatus | null): AsaasAccountStatusSnapshot | null {
  if (!status) return null
  return {
    id: status.id ?? null,
    commercialInfo: status.commercialInfo ?? null,
    bankAccountInfo: status.bankAccountInfo ?? null,
    documentation: status.documentation ?? null,
    general: status.general ?? null,
  }
}

function accountNameOf(info: AsaasCommercialInfo): string | null {
  return info.companyName || info.tradingName || info.name || null
}

/** Assinaturas vivas com cliente/cartão salvo na conta conectada (ver `LINKED_SUBSCRIPTION_STATUSES`). */
export async function countLinkedSubscriptions(orgId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(clubSubscriptions)
    .where(
      and(
        eq(clubSubscriptions.organizationId, orgId),
        eq(clubSubscriptions.gatewayProvider, 'asaas'),
        inArray(clubSubscriptions.status, LINKED_SUBSCRIPTION_STATUSES),
        or(isNotNull(clubSubscriptions.gatewayCustomerId), isNotNull(clubSubscriptions.cardToken)),
      ),
    )
  return Number(row?.total ?? 0)
}

/**
 * Esquece cliente e cartão do gateway nas assinaturas ENCERRADAS do clube
 * (as vivas já foram barradas pela regra de vínculo): os ids eram de outra
 * conta Asaas e uma reativação criaria a cobrança com cliente inexistente.
 */
async function forgetClosedGatewayLinks(orgId: string): Promise<void> {
  await db
    .update(clubSubscriptions)
    .set({ gatewayCustomerId: null, cardToken: null, updatedAt: new Date() })
    .where(
      and(
        eq(clubSubscriptions.organizationId, orgId),
        eq(clubSubscriptions.gatewayProvider, 'asaas'),
        notInArray(clubSubscriptions.status, LINKED_SUBSCRIPTION_STATUSES),
        or(isNotNull(clubSubscriptions.gatewayCustomerId), isNotNull(clubSubscriptions.cardToken)),
      ),
    )
}

async function listAllWebhooks(client: AsaasClient): Promise<AsaasWebhook[]> {
  const all: AsaasWebhook[] = []
  for (let offset = 0; offset < 1_000; offset += 100) {
    const page = await client.webhooks.list({ offset, limit: 100 })
    all.push(...page.data)
    if (!page.hasMore) break
  }
  return all
}

async function tenantContact(orgId: string): Promise<{ slug: string; email: string | null }> {
  const [row] = await db
    .select({ slug: organization.slug, email: tenantProfiles.email })
    .from(organization)
    .leftJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
    .where(eq(organization.id, orgId))
    .limit(1)
  return { slug: row?.slug ?? orgId, email: row?.email ?? null }
}

function describeAsaasError(error: unknown): string {
  const status = error instanceof AsaasApiError ? error.httpStatus : 0
  return `${errorText(error)}${status ? ` (HTTP ${status})` : ''}`.slice(0, 300)
}

/**
 * Apaga o webhook do clube na conta Asaas da `row` (a chave DELA) — best
 * effort: falha só vai para o log. Usado ao desconectar e ao trocar de conta
 * (o webhook da conta antiga não pode continuar apontando para nós).
 */
async function deleteWebhookBestEffort(orgId: string, row: Pick<AccountRow, 'apiKeyEncrypted' | 'env' | 'webhookId'>): Promise<void> {
  if (!row.webhookId) return
  try {
    await clientFor(decryptSecret(row.apiKeyEncrypted), row.env).webhooks.delete(row.webhookId)
  } catch (error) {
    logger.warn({ tenantId: orgId, integration: 'asaas', err: errorText(error) }, 'Recebimento do clube: webhook não removido no Asaas (seguindo)')
  }
}

/**
 * Cadastra (ou reativa) o webhook do clube na conta Asaas DELE. Nunca lança
 * por falha do Asaas: grava `erro` + motivo e a conexão da chave continua.
 * API sem URL pública (localhost) = `pendente`, sem chamar o Asaas.
 */
async function syncWebhookWith(orgId: string, client: AsaasClient): Promise<void> {
  const row = await loadRow(orgId)
  if (!row) throw new GatewayNotConfiguredError()

  let token = row.webhookTokenEncrypted ? decryptSecret(row.webhookTokenEncrypted) : null
  if (!token) {
    // Grava o token ANTES de mandar ao Asaas: o webhook nunca chega com um token que a API não conhece.
    token = randomBytes(32).toString('hex')
    await saveRow(orgId, { webhookTokenEncrypted: encryptSecret(token) })
  }

  const url = clubWebhookUrl(env.API_BASE_URL, orgId)
  const urlIssue = publicHttpsIssue(url)
  if (urlIssue) {
    await saveRow(orgId, {
      webhookStatus: 'pendente',
      webhookLastError:
        `A URL pública da API (${env.API_BASE_URL}) ${urlIssue}: o Asaas não alcança este servidor. ` +
        'Configure API_BASE_URL com o endereço https público (ou um túnel) e clique em "Testar".',
    })
    return
  }

  const contact = await tenantContact(orgId)
  const email = row.accountEmail ?? contact.email
  const name = clubWebhookName(contact.slug)
  const base = {
    name,
    url,
    enabled: true,
    interrupted: false,
    authToken: token,
    sendType: 'SEQUENTIALLY' as const,
    events: [...ASAAS_WEBHOOK_EVENTS],
  }

  try {
    const hooks = await listAllWebhooks(client)
    const match =
      (row.webhookId ? hooks.find(hook => hook.id === row.webhookId) : undefined) ??
      hooks.find(hook => normalizeWebhookUrl(hook.url) === normalizeWebhookUrl(url)) ??
      hooks.find(hook => hook.name?.trim().toLowerCase() === name.toLowerCase())
    let webhookId: string
    if (match) {
      const updated = await client.webhooks.update(match.id, base)
      webhookId = updated.id ?? match.id
    } else {
      if (!email) {
        await saveRow(orgId, {
          webhookStatus: 'erro',
          webhookLastError: 'A conta Asaas não informou e-mail e o clube não tem e-mail cadastrado — o Asaas exige um para avisar falhas do webhook.',
        })
        return
      }
      const created = await client.webhooks.create({ ...base, email, apiVersion: 3 })
      webhookId = created.id
    }
    await saveRow(orgId, { webhookId, webhookStatus: 'ativo', webhookLastError: null })
  } catch (error) {
    logger.warn({ tenantId: orgId, integration: 'asaas', err: errorText(error) }, 'Recebimento do clube: falha ao cadastrar o webhook')
    await saveRow(orgId, { webhookStatus: 'erro', webhookLastError: `O Asaas recusou o cadastro do webhook: ${describeAsaasError(error)}` })
  }
}

function toDto(row: AccountRow | null, orgId: string): ClubReceivingAccount {
  if (!row) {
    return {
      connected: false,
      env: null,
      keyHint: null,
      accountName: null,
      cpfCnpj: null,
      email: null,
      accountStatus: null,
      webhookStatus: null,
      webhookLastError: null,
      webhookUrl: null,
      connectedAt: null,
      lastCheckedAt: null,
    }
  }
  return {
    connected: true,
    env: row.env,
    keyHint: row.keyHint,
    accountName: row.accountName,
    cpfCnpj: maskCpfCnpj(row.accountCpfCnpj),
    email: row.accountEmail,
    accountStatus: summarizeAccountStatus(row.accountStatusJson),
    webhookStatus: row.webhookStatus,
    webhookLastError: row.webhookLastError,
    webhookUrl: clubWebhookUrl(env.API_BASE_URL, orgId),
    connectedAt: row.connectedAt.toISOString(),
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
  }
}

export interface ConnectResult {
  account: ClubReceivingAccount
  /** Já havia conta conectada (rotação ou troca). */
  replaced: boolean
  /** A chave nova é de OUTRA conta Asaas. */
  accountChanged: boolean
}

export const receivingAccountService = {
  async status(orgId: string): Promise<ClubReceivingAccount> {
    return toDto(await loadRow(orgId), orgId)
  },

  /**
   * Conecta (ou renova) a chave. Mesma conta Asaas ⇒ rotação livre; outra
   * conta com assinaturas vinculadas ⇒ 409; outra conta sem vínculo ⇒ o
   * webhook da conta antiga é apagado (best effort) e o token do webhook é
   * trocado. O webhook é cadastrado no fim (falha dele não desfaz a conexão).
   */
  async connect(orgId: string, input: ConnectClubReceivingAccountInput, actor: { userId: string | null }): Promise<ConnectResult> {
    const parsed = parseAsaasApiKey(input.apiKey)
    if (!parsed) throw AppError.validation([{ path: 'apiKey', message: INVALID_KEY_MESSAGE }], INVALID_KEY_MESSAGE)
    const policy = environmentPolicyIssue(parsed.env, allowedClubAsaasEnvironments({ NODE_ENV: env.NODE_ENV, DEPLOY_STAGE: env.DEPLOY_STAGE }))
    if (policy) throw AppError.validation([{ path: 'apiKey', message: policy }], policy)

    const client = clientFor(parsed.apiKey, parsed.env)
    const { info, status } = await fetchAccount(client)
    const identity = {
      env: parsed.env,
      asaasAccountId: status?.id ?? null,
      accountCpfCnpj: onlyDigits(info.cpfCnpj) || null,
    }

    const current = await loadRow(orgId)
    const accountChanged = Boolean(current) && !sameAsaasAccount(current!, identity)
    if (accountChanged) {
      const linked = await countLinkedSubscriptions(orgId)
      if (linked > 0) throw AppError.conflict(linkedSubscriptionsMessage(linked, 'switch'))
    }

    const now = new Date()
    const values = {
      source: 'api_key' as const,
      apiKeyEncrypted: encryptSecret(parsed.apiKey),
      env: parsed.env,
      keyHint: keyHintOf(parsed.apiKey),
      asaasAccountId: identity.asaasAccountId,
      accountName: accountNameOf(info),
      accountCpfCnpj: identity.accountCpfCnpj,
      accountEmail: info.email ?? null,
      accountStatusJson: snapshotOf(status),
      connectedBy: actor.userId,
      // Rotação na mesma conta mantém a data da conexão original.
      connectedAt: current && !accountChanged ? current.connectedAt : now,
      lastCheckedAt: now,
      updatedAt: now,
      // Webhook é por conta Asaas: conta nova começa sem webhook E com token
      // novo — o token antigo ficou cadastrado (visível) na conta anterior, que
      // deixa de ser nossa; rotação na mesma conta mantém os dois.
      ...(current && !accountChanged
        ? {}
        : { webhookId: null, webhookTokenEncrypted: null, webhookStatus: 'pendente' as const, webhookLastError: null }),
    }
    await db
      .insert(tenantAsaasAccounts)
      .values({ organizationId: orgId, ...values })
      .onConflictDoUpdate({ target: tenantAsaasAccounts.organizationId, set: values })
    credentialsCache.delete(orgId)

    if (current && accountChanged) await deleteWebhookBestEffort(orgId, current)
    if (!current || accountChanged) await forgetClosedGatewayLinks(orgId)
    await syncWebhookWith(orgId, client)

    return { account: toDto(await loadRow(orgId), orgId), replaced: Boolean(current), accountChanged }
  },

  /** Cadastra/reativa o webhook do clube com a chave salva. */
  async syncWebhook(orgId: string): Promise<void> {
    const credentials = await resolveClubAsaasCredentials(orgId)
    if (!credentials) throw new GatewayNotConfiguredError()
    await syncWebhookWith(orgId, clientFor(credentials.apiKey, credentials.env))
  },

  /** Revalida a chave salva, atualiza a situação da conta e reativa o webhook (fila interrompida volta a andar). */
  async test(orgId: string): Promise<ClubReceivingAccount> {
    const credentials = await resolveClubAsaasCredentials(orgId)
    if (!credentials) throw new GatewayNotConfiguredError()
    const client = clientFor(credentials.apiKey, credentials.env)
    const { info, status } = await fetchAccount(client)
    const now = new Date()
    await saveRow(orgId, {
      accountName: accountNameOf(info),
      accountEmail: info.email ?? null,
      ...(onlyDigits(info.cpfCnpj) ? { accountCpfCnpj: onlyDigits(info.cpfCnpj) } : {}),
      ...(status ? { accountStatusJson: snapshotOf(status), ...(status.id ? { asaasAccountId: status.id } : {}) } : {}),
      lastCheckedAt: now,
    })
    await syncWebhookWith(orgId, client)
    return toDto(await loadRow(orgId), orgId)
  },

  /** Remove a conta (bloqueado com assinaturas vinculadas). Apagar o webhook no Asaas é best effort. */
  async disconnect(orgId: string): Promise<{ account: ClubReceivingAccount; removed: boolean }> {
    const row = await loadRow(orgId)
    if (!row) return { account: toDto(null, orgId), removed: false }
    const linked = await countLinkedSubscriptions(orgId)
    if (linked > 0) throw AppError.conflict(linkedSubscriptionsMessage(linked, 'disconnect'))

    await deleteWebhookBestEffort(orgId, row)
    await db.delete(tenantAsaasAccounts).where(eq(tenantAsaasAccounts.organizationId, orgId))
    credentialsCache.delete(orgId)
    await forgetClosedGatewayLinks(orgId)
    return { account: toDto(null, orgId), removed: true }
  },
}
