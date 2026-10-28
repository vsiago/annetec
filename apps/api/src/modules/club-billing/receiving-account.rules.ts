import { onlyDigits, type AsaasEnvironmentName, type ClubReceivingAccountApproval, type ClubSubscriptionStatus } from '@annetec/contracts'
import type { AsaasAccountStatusSnapshot } from '@/db/schema'

/**
 * Regras puras da conta de recebimento do clube (Asaas próprio do inquilino):
 * formato/ambiente da chave, máscaras, resumo da situação cadastral, URL e
 * nome do webhook. Sem banco e sem rede — `tests/club-billing-receiving-account.test.ts`.
 */

export const ASAAS_KEY_PREFIXES: Record<AsaasEnvironmentName, string> = {
  production: '$aact_prod_',
  sandbox: '$aact_hmlg_',
}

/** Corpo da chave depois do prefixo: base64/URL-safe com `:` e `$` (o Asaas concatena partes). */
const KEY_BODY = /^[A-Za-z0-9+/=_:.$-]{16,}$/

export const INVALID_KEY_MESSAGE =
  'Chave de API inválida. Copie a chave inteira do Asaas (começa com $aact_prod_ em produção ou $aact_hmlg_ na sandbox).'

/** `$aact_prod_…` ⇒ produção; `$aact_hmlg_…` ⇒ sandbox; qualquer outra coisa ⇒ `null` (chave inválida). */
export function parseAsaasApiKey(raw: string): { apiKey: string; env: AsaasEnvironmentName } | null {
  const apiKey = raw.trim()
  for (const env of ['production', 'sandbox'] as const) {
    const prefix = ASAAS_KEY_PREFIXES[env]
    if (apiKey.startsWith(prefix) && KEY_BODY.test(apiKey.slice(prefix.length))) return { apiKey, env }
  }
  return null
}

/** 4 últimos caracteres (para o admin reconhecer a chave sem vê-la). */
export function keyHintOf(apiKey: string): string {
  return apiKey.slice(-4)
}

/** `null` = ambiente aceito neste servidor; senão a mensagem para a tela. */
export function environmentPolicyIssue(env: AsaasEnvironmentName, allowed: readonly AsaasEnvironmentName[]): string | null {
  if (allowed.includes(env)) return null
  return env === 'sandbox'
    ? 'Este servidor só aceita chave de PRODUÇÃO do Asaas ($aact_prod_…). Gere a chave em www.asaas.com → Integrações → Chaves de API.'
    : 'Este ambiente de demonstração só aceita chave da SANDBOX do Asaas ($aact_hmlg_…). Gere a chave em sandbox.asaas.com → Integrações → Chaves de API.'
}

/** CPF `***.456.789-**`; CNPJ `12.345.678/****-**`; outro tamanho: só os 4 últimos. */
export function maskCpfCnpj(value: string | null | undefined): string | null {
  const d = onlyDigits(value)
  if (!d) return null
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/****-**`
  return d.length > 4 ? `${'*'.repeat(d.length - 4)}${d.slice(-4)}` : '*'.repeat(d.length)
}

const APPROVAL_PARTS = [
  ['commercialInfo', 'Dados comerciais'],
  ['bankAccountInfo', 'Conta bancária'],
  ['documentation', 'Documentação'],
] as const

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  APPROVED: 'aprovada',
  AWAITING_APPROVAL: 'aguardando aprovação',
  PENDING: 'pendente',
  REJECTED: 'reprovada',
}

/** Resumo de `GET /myAccount/status`: aprovada ou a lista do que falta. */
export function summarizeAccountStatus(snapshot: AsaasAccountStatusSnapshot | null | undefined): ClubReceivingAccountApproval | null {
  if (!snapshot) return null
  const pending: string[] = []
  for (const [key, label] of APPROVAL_PARTS) {
    const value = snapshot[key]
    if (value && value !== 'APPROVED') pending.push(`${label}: ${APPROVAL_STATUS_LABELS[value] ?? value.toLowerCase()}`)
  }
  return { approved: snapshot.general === 'APPROVED', general: snapshot.general ?? null, pending }
}

/** Rota do webhook do clube (o `organizationId` escolhe o token e o escopo das cobranças). */
export function clubWebhookUrl(apiBaseUrl: string, organizationId: string): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}/api/v1/webhooks/asaas/clube/${encodeURIComponent(organizationId)}`
}

/** Nome do webhook no painel do Asaas do clube (também serve para reencontrá-lo se a URL mudar). */
export function clubWebhookName(slug: string): string {
  return `ANNETEC — Clube ${slug}`
}

export function normalizeWebhookUrl(url: string): string {
  return url.trim().replace(/\/+$/, '').toLowerCase()
}

export interface AsaasAccountIdentity {
  env: AsaasEnvironmentName
  asaasAccountId: string | null
  accountCpfCnpj: string | null
}

/**
 * A chave nova é da MESMA conta Asaas da que está salva? (rotação de chave =
 * livre; troca de conta = os ids de cliente/cartão do gateway deixam de valer).
 * Ambientes diferentes são sempre contas diferentes; sem id nem CPF/CNPJ para
 * comparar, assume conta diferente (o lado seguro).
 */
export function sameAsaasAccount(current: AsaasAccountIdentity, next: AsaasAccountIdentity): boolean {
  if (current.env !== next.env) return false
  if (current.asaasAccountId && next.asaasAccountId) return current.asaasAccountId === next.asaasAccountId
  const a = onlyDigits(current.accountCpfCnpj)
  const b = onlyDigits(next.accountCpfCnpj)
  if (a && b) return a === b
  return false
}

/**
 * Assinaturas que dependem da conta conectada: ainda vivas e com cliente ou
 * cartão salvo no gateway (os ids só existem naquela conta Asaas). Suspensa
 * entra: ela volta a ativa pagando a cobrança aberta lá.
 */
export const LINKED_SUBSCRIPTION_STATUSES: ClubSubscriptionStatus[] = ['pending_payment', 'active', 'past_due', 'suspended']

export function linkedSubscriptionsMessage(count: number, action: 'switch' | 'disconnect'): string {
  const subject = count === 1 ? '1 assinatura vinculada' : `${count} assinaturas vinculadas`
  return action === 'switch'
    ? `A conta atual ainda tem ${subject}. Para trocar de conta Asaas, cancele ou encerre essas assinaturas antes — os clientes e cartões salvos só existem na conta atual. Para só renovar a chave, gere a nova chave na MESMA conta.`
    : `Não dá para desconectar: a conta atual ainda tem ${subject}. Cancele ou encerre essas assinaturas antes — as cobranças delas vivem nesta conta Asaas.`
}
