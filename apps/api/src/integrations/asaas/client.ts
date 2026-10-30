import { ERROR_CODES } from '@annetec/contracts'
import { AppError } from '@/http/errors'
import { CardDeclinedError } from '@/integrations/payments/gateway'
import { logger } from '@/lib/logger'
import type {
  AsaasAccessToken,
  AsaasAccountDocuments,
  AsaasAccountStatus,
  AsaasBalance,
  AsaasCreateAccessTokenInput,
  AsaasCreateInternalTransferInput,
  AsaasCreateSubaccountInput,
  AsaasListSubaccountsQuery,
  AsaasListTransfersQuery,
  AsaasSubaccount,
  AsaasTransfer,
  AsaasWallet,
  AsaasCreateCustomerInput,
  AsaasCreatePaymentInput,
  AsaasCommercialInfo,
  AsaasCreateWebhookInput,
  AsaasCustomer,
  AsaasEnvironment,
  AsaasErrorBody,
  AsaasIdentificationField,
  AsaasList,
  AsaasListCustomersQuery,
  AsaasListPaymentsQuery,
  AsaasPayWithCreditCardInput,
  AsaasPayment,
  AsaasPixAddressKey,
  AsaasPixQrCode,
  AsaasReceiveInCashInput,
  AsaasRefundInput,
  AsaasTokenizeInput,
  AsaasTokenizeResult,
  AsaasUpdateWebhookInput,
  AsaasWebhook,
} from './types'

/**
 * Mini-SDK tipado do Asaas v3 — a ÚNICA porta de saída para o Asaas (mesmo
 * papel do `integrations/digitalsaude/client.ts`).
 *
 *  - autenticação pelo header `access_token` (sem "Bearer") + `User-Agent`
 *    (obrigatório para contas novas);
 *  - GET vai SEM corpo (corpo em GET → 403 no Asaas);
 *  - só GET é reexecutado em falha de rede/5xx/429 — POST/PUT/DELETE nunca: uma
 *    cobrança duplicada é problema de negócio real (o gateway consulta por
 *    `externalReference` antes de repetir);
 *  - erro `{ errors: [{ code, description }] }` vira `AppError`; recusa de
 *    cartão (400 em operação com cartão) vira `CardDeclinedError`;
 *  - NUNCA loga corpo de requisição nem de resposta (há cartão e dado pessoal ali).
 */

export const ASAAS_BASE_URLS: Record<AsaasEnvironment, string> = {
  production: 'https://api.asaas.com/v3',
  sandbox: 'https://api-sandbox.asaas.com/v3',
}

export interface AsaasClientConfig {
  apiKey: string
  environment: AsaasEnvironment
  userAgent: string
  timeoutMs: number
  /** Sobrescreve a base (testes). */
  baseUrl?: string
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
type Query = Record<string, string | number | boolean | undefined | null>

interface RequestOptions {
  query?: Query
  body?: unknown
  /** Operação com cartão: 400 vira `CardDeclinedError`. */
  cardOperation?: boolean
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_GET_ATTEMPTS = 3

/** Erro do Asaas com o status HTTP e os códigos devolvidos (sem corpo da requisição). */
export class AsaasApiError extends AppError {
  readonly httpStatus: number
  readonly errorCodes: string[]
  constructor(code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES], message: string, httpStatus: number, errorCodes: string[] = []) {
    super(code, message)
    this.name = 'AsaasApiError'
    this.httpStatus = httpStatus
    this.errorCodes = errorCodes
  }

  /** Timeout, rede ou 5xx: não dá para saber se a operação foi feita — consultar antes de repetir. */
  get inconclusive(): boolean {
    return this.httpStatus === 0 || this.httpStatus >= 500
  }
}

export type AsaasClient = ReturnType<typeof createAsaasClient>

export function createAsaasClient(config: AsaasClientConfig) {
  const baseUrl = (config.baseUrl ?? ASAAS_BASE_URLS[config.environment]).replace(/\/+$/, '')

  async function request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(baseUrl + path)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
    }

    const hasBody = method !== 'GET' && options.body !== undefined
    const headers: Record<string, string> = {
      access_token: config.apiKey,
      'User-Agent': config.userAgent,
      accept: 'application/json',
    }
    if (hasBody) headers['content-type'] = 'application/json'

    const maxAttempts = method === 'GET' ? MAX_GET_ATTEMPTS : 1
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startedAt = performance.now()
      let response: Response
      try {
        response = await fetch(url, {
          method,
          headers,
          body: hasBody ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(config.timeoutMs),
        })
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        lastError = new AsaasApiError(
          timedOut ? ERROR_CODES.UPSTREAM_TIMEOUT : ERROR_CODES.UPSTREAM_ERROR,
          timedOut ? 'O Asaas não respondeu a tempo' : 'Falha de rede ao falar com o Asaas',
          0,
        )
        logger.warn({ integration: 'asaas', method, path: url.pathname, attempt, timedOut }, 'asaas: falha de rede')
        if (attempt < maxAttempts) await sleep(300 * attempt)
        continue
      }

      const text = await response.text()
      logger.debug(
        {
          integration: 'asaas',
          method,
          path: url.pathname,
          status: response.status,
          attempt,
          durationMs: Math.round(performance.now() - startedAt),
        },
        'asaas call',
      )

      if (response.ok) return (text ? JSON.parse(text) : {}) as T

      const errors = parseErrors(text)
      const description = errors.map(e => e.description).filter(Boolean).join(' ') || null
      const codes = errors.map(e => e.code ?? '').filter(Boolean)

      if (response.status === 400 && options.cardOperation) {
        throw new CardDeclinedError(
          description ?? 'Transação não autorizada. Verifique os dados do cartão de crédito e tente novamente.',
        )
      }
      if (response.status === 400) {
        throw new AsaasApiError(
          ERROR_CODES.BUSINESS_RULE_VIOLATION,
          description ?? 'Requisição recusada pelo Asaas',
          400,
          codes,
        )
      }
      if (response.status === 401) {
        throw new AsaasApiError(
          ERROR_CODES.UPSTREAM_UNAUTHORIZED,
          'O Asaas recusou a chave de API (401). Confira a chave e o ambiente (sandbox × produção).',
          401,
          codes,
        )
      }
      if (response.status === 403) {
        throw new AsaasApiError(
          ERROR_CODES.UPSTREAM_UNAUTHORIZED,
          description ?? 'O Asaas não permitiu esta operação (403). A conta pode precisar de liberação.',
          403,
          codes,
        )
      }
      if (response.status === 404) {
        throw new AsaasApiError(ERROR_CODES.NOT_FOUND, 'Registro não encontrado no Asaas', 404, codes)
      }

      lastError = new AsaasApiError(
        response.status === 429 ? ERROR_CODES.UPSTREAM_RATE_LIMITED : ERROR_CODES.UPSTREAM_ERROR,
        response.status === 429
          ? 'Limite de requisições do Asaas atingido; tente novamente em instantes'
          : `O Asaas respondeu ${response.status}`,
        response.status,
        codes,
      )
      if (!RETRYABLE_STATUS.has(response.status)) throw lastError
      if (attempt < maxAttempts) await sleep(response.status === 429 ? 1_500 : 300 * attempt)
    }

    throw lastError
  }

  return {
    customers: {
      create: (input: AsaasCreateCustomerInput) => request<AsaasCustomer>('POST', '/customers', { body: input }),
      list: (query: AsaasListCustomersQuery = {}) =>
        request<AsaasList<AsaasCustomer>>('GET', '/customers', { query: { ...query } }),
    },
    payments: {
      create: (input: AsaasCreatePaymentInput) =>
        request<AsaasPayment>('POST', '/payments', {
          body: input,
          cardOperation: input.billingType === 'CREDIT_CARD' && Boolean(input.creditCard || input.creditCardToken),
        }),
      get: (id: string) => request<AsaasPayment>('GET', `/payments/${encodeURIComponent(id)}`),
      list: (query: AsaasListPaymentsQuery = {}) =>
        request<AsaasList<AsaasPayment>>('GET', '/payments', { query: { ...query } }),
      pixQrCode: (id: string) => request<AsaasPixQrCode>('GET', `/payments/${encodeURIComponent(id)}/pixQrCode`),
      identificationField: (id: string) =>
        request<AsaasIdentificationField>('GET', `/payments/${encodeURIComponent(id)}/identificationField`),
      delete: (id: string) =>
        request<{ deleted: boolean; id: string }>('DELETE', `/payments/${encodeURIComponent(id)}`),
      refund: (id: string, input: AsaasRefundInput = {}) =>
        request<AsaasPayment>('POST', `/payments/${encodeURIComponent(id)}/refund`, { body: input }),
      receiveInCash: (id: string, input: AsaasReceiveInCashInput) =>
        request<AsaasPayment>('POST', `/payments/${encodeURIComponent(id)}/receiveInCash`, { body: input }),
      payWithCreditCard: (id: string, input: AsaasPayWithCreditCardInput) =>
        request<AsaasPayment>('POST', `/payments/${encodeURIComponent(id)}/payWithCreditCard`, {
          body: input,
          cardOperation: true,
        }),
    },
    creditCard: {
      tokenize: (input: AsaasTokenizeInput) =>
        request<AsaasTokenizeResult>('POST', '/creditCard/tokenizeCreditCard', { body: input, cardOperation: true }),
    },
    sandbox: {
      /** "Simular pagamento" — só existe na sandbox. */
      confirmPayment: (id: string) =>
        request<AsaasPayment>('POST', `/sandbox/payment/${encodeURIComponent(id)}/confirm`, { body: {} }),
    },
    account: {
      /** Dados da conta dona da chave — serve para validar a chave e o ambiente. */
      commercialInfo: () => request<AsaasCommercialInfo>('GET', '/myAccount/commercialInfo/'),
      /** Situação cadastral da conta (aprovada ou com pendências) + `id` da conta. */
      status: () => request<AsaasAccountStatus>('GET', '/myAccount/status/'),
      /** Documentos exigidos para aprovar a conta (links de envio quando houver). */
      documents: () => request<AsaasAccountDocuments>('GET', '/myAccount/documents'),
    },
    /** Subcontas da conta dona da chave (conta gerenciada: chave da ANNETEC). */
    accounts: {
      /** NÃO idempotente: a resposta traz a chave da subconta UMA vez. Nunca logar o corpo. */
      create: (input: AsaasCreateSubaccountInput) => request<AsaasSubaccount>('POST', '/accounts', { body: input }),
      list: (query: AsaasListSubaccountsQuery = {}) =>
        request<AsaasList<AsaasSubaccount>>('GET', '/accounts', { query: { ...query } }),
      /** Nova chave de API da subconta (exige habilitação no painel + IP na whitelist). */
      createAccessToken: (id: string, input: AsaasCreateAccessTokenInput = {}) =>
        request<AsaasAccessToken>('POST', `/accounts/${encodeURIComponent(id)}/accessTokens`, { body: input }),
    },
    finance: {
      /** Saldo disponível da conta dona da chave. */
      balance: () => request<AsaasBalance>('GET', '/finance/balance'),
    },
    wallets: {
      list: () => request<AsaasList<AsaasWallet>>('GET', '/wallets/'),
    },
    transfers: {
      /** NÃO idempotente: mande sempre `externalReference` para reencontrar a transferência se a resposta se perder. */
      create: (input: AsaasCreateInternalTransferInput) => request<AsaasTransfer>('POST', '/transfers', { body: input }),
      get: (id: string) => request<AsaasTransfer>('GET', `/transfers/${encodeURIComponent(id)}`),
      list: (query: AsaasListTransfersQuery = {}) =>
        request<AsaasList<AsaasTransfer>>('GET', '/transfers', { query: { ...query } }),
      /** Só antes de efetivar; o valor volta ao saldo de origem. */
      cancel: (id: string) => request<AsaasTransfer>('DELETE', `/transfers/${encodeURIComponent(id)}/cancel`),
    },
    webhooks: {
      create: (input: AsaasCreateWebhookInput) => request<AsaasWebhook>('POST', '/webhooks', { body: input }),
      list: (query: { offset?: number; limit?: number } = {}) =>
        request<AsaasList<AsaasWebhook>>('GET', '/webhooks', { query: { ...query } }),
      update: (id: string, input: AsaasUpdateWebhookInput) =>
        request<AsaasWebhook>('PUT', `/webhooks/${encodeURIComponent(id)}`, { body: input }),
      delete: (id: string) =>
        request<{ deleted: boolean; id: string }>('DELETE', `/webhooks/${encodeURIComponent(id)}`),
    },
    pix: {
      listAddressKeys: (query: { status?: string; statusList?: string; offset?: number; limit?: number } = {}) =>
        request<{ data: AsaasPixAddressKey[] }>('GET', '/pix/addressKeys', { query: { ...query } }),
      /** Só `EVP` (chave aleatória). Exige conta aprovada; 1 min entre criações. */
      createAddressKey: () => request<AsaasPixAddressKey>('POST', '/pix/addressKeys', { body: { type: 'EVP' } }),
    },
  }
}

function parseErrors(text: string): { code?: string; description?: string }[] {
  if (!text) return []
  try {
    const parsed = JSON.parse(text) as AsaasErrorBody
    return Array.isArray(parsed.errors) ? parsed.errors.slice(0, 5) : []
  } catch {
    return []
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
