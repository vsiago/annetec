import {
  ERROR_CODES,
  digitalSaudeEndpoints,
  type DigitalSaudeEndpointName,
} from '@annetec/contracts'
import { z } from 'zod'
import { env } from '@/config/env'
import { AppError } from '@/http/errors'
import { logger } from '@/lib/logger'

/**
 * Cliente HTTP da Digital Saúde.
 *
 * É a ÚNICA porta de saída para o ERP: nenhum service faz `fetch` direto. Toda
 * chamada é derivada de `digitalSaudeEndpoints` (o registro em
 * `@annetec/contracts`), então caminho, método e schema de resposta nunca
 * divergem da documentação.
 *
 * Decisões que valem registrar:
 *  - autenticação por dois headers, `token` e `senhaApi` (securityDefinitions
 *    do Swagger 2.0). Cada inquilino tem o seu par;
 *  - o upstream responde SEMPRE em array, mesmo em busca por chave única.
 *    `one()` normaliza isso para os services;
 *  - o servidor devolve texto em ISO-8859-1 nas respostas de erro, por isso a
 *    decodificação é feita à mão em vez de `res.json()` cego;
 *  - só GET é reexecutado em falha de rede/5xx. POST nunca — o upstream não
 *    tem idempotência e uma adesão duplicada é um problema de negócio real.
 */

export interface DigitalSaudeCredentials {
  baseUrl: string
  appToken: string
  apiPassword: string
  timeoutMs?: number
  /** Identifica o inquilino nos logs. */
  label?: string
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 3

type Endpoints = typeof digitalSaudeEndpoints

type InputOf<K extends DigitalSaudeEndpointName> =
  (Endpoints[K] extends { query: infer Q extends z.ZodTypeAny } ? z.input<Q> : object) &
    (Endpoints[K] extends { params: infer P extends z.ZodTypeAny } ? z.input<P> : object) &
    (Endpoints[K] extends { body: infer B extends z.ZodTypeAny } ? z.input<B> : object)

type OutputOf<K extends DigitalSaudeEndpointName> = z.output<Endpoints[K]['response']>

/**
 * Colapsa `T[]` para `T` (`T` sozinho passa direto). Precisa ser um alias à
 * parte — não dá pra escrever a mesma checagem inline em `one()` — porque só
 * distribui sobre union (`Fatura | Fatura[]` → `Fatura | Fatura`) quando `T`
 * é o parâmetro nu do próprio alias genérico.
 */
type UnwrapOne<T> = T extends readonly (infer E)[] ? E : T

export interface DigitalSaudeClient {
  call<K extends DigitalSaudeEndpointName>(name: K, input?: InputOf<K>): Promise<OutputOf<K>>
  /** Atalho para endpoints "por código" único — array de um elemento OU objeto nu, o upstream varia por entidade. */
  one<K extends DigitalSaudeEndpointName>(
    name: K,
    input?: InputOf<K>,
  ): Promise<UnwrapOne<OutputOf<K>> | null>
  /** Chamada leve usada pela tela de configuração para validar credenciais. */
  healthCheck(): Promise<boolean>
}

export function createDigitalSaudeClient(credentials: DigitalSaudeCredentials): DigitalSaudeClient {
  const baseUrl = credentials.baseUrl.replace(/\/+$/, '')
  const timeoutMs = credentials.timeoutMs ?? env.DIGITALSAUDE_TIMEOUT_MS

  async function call<K extends DigitalSaudeEndpointName>(
    name: K,
    input?: InputOf<K>,
  ): Promise<OutputOf<K>> {
    const endpoint = digitalSaudeEndpoints[name] as {
      method: 'GET' | 'POST'
      path: string
      query?: z.ZodTypeAny
      params?: z.ZodTypeAny
      body?: z.ZodTypeAny
      response: z.ZodTypeAny
    }

    const raw = (input ?? {}) as Record<string, unknown>
    const url = new URL(baseUrl + buildPath(endpoint.path, endpoint.params, raw, name))

    if (endpoint.query) {
      const parsed = parseInput(endpoint.query, raw, name, 'query')
      for (const [key, value] of Object.entries(parsed)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
      }
    }

    const body = endpoint.body ? parseInput(endpoint.body, raw, name, 'body') : undefined
    const payload = await request(endpoint.method, url, body, name)
    return validateResponse(endpoint.response, payload, name) as OutputOf<K>
  }

  async function request(
    method: 'GET' | 'POST',
    url: URL,
    body: unknown,
    name: string,
  ): Promise<unknown> {
    const maxAttempts = method === 'GET' ? MAX_ATTEMPTS : 1
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startedAt = performance.now()
      try {
        const response = await fetch(url, {
          method,
          headers: {
            token: credentials.appToken,
            senhaApi: credentials.apiPassword,
            accept: 'application/json',
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        })

        const text = await decodeBody(response)
        logger.debug(
          {
            integration: 'digitalsaude',
            tenant: credentials.label,
            endpoint: name,
            status: response.status,
            attempt,
            durationMs: Math.round(performance.now() - startedAt),
          },
          'upstream call',
        )

        if (response.ok) return parseJsonBody(text)

        if (response.status === 401 || response.status === 403) {
          throw new AppError(
            ERROR_CODES.UPSTREAM_UNAUTHORIZED,
            'Credenciais da Digital Saúde recusadas para este inquilino',
          )
        }
        if (response.status === 404) throw AppError.notFound('Registro na Digital Saúde')
        if (response.status === 400) {
          throw new AppError(ERROR_CODES.UPSTREAM_ERROR, upstreamMessage(text, 'Requisição recusada pela Digital Saúde'))
        }
        if (RETRYABLE_STATUS.has(response.status) && attempt < maxAttempts) {
          lastError = new Error(`HTTP ${response.status}`)
          await backoff(attempt)
          continue
        }
        throw new AppError(
          ERROR_CODES.UPSTREAM_ERROR,
          upstreamMessage(text, `Digital Saúde respondeu ${response.status}`),
        )
      } catch (error) {
        if (error instanceof AppError) throw error
        const isTimeout = error instanceof DOMException && error.name === 'TimeoutError'
        lastError = error
        if (attempt < maxAttempts) {
          await backoff(attempt)
          continue
        }
        if (isTimeout) {
          throw new AppError(ERROR_CODES.UPSTREAM_TIMEOUT, 'Digital Saúde não respondeu a tempo', {
            cause: error,
          })
        }
        throw new AppError(ERROR_CODES.UPSTREAM_ERROR, 'Falha de comunicação com a Digital Saúde', {
          cause: error,
        })
      }
    }

    throw new AppError(ERROR_CODES.UPSTREAM_ERROR, 'Falha de comunicação com a Digital Saúde', {
      cause: lastError,
    })
  }

  return {
    call,
    async one(name, input) {
      const result = (await call(name, input)) as unknown
      if (Array.isArray(result)) return (result[0] ?? null) as never
      return result as never
    },
    async healthCheck() {
      try {
        await call('convenioListar')
        return true
      } catch (error) {
        logger.warn(
          { integration: 'digitalsaude', tenant: credentials.label, err: error },
          'healthCheck falhou',
        )
        return false
      }
    },
  }
}

function buildPath(
  template: string,
  paramsSchema: z.ZodTypeAny | undefined,
  raw: Record<string, unknown>,
  name: string,
): string {
  if (!paramsSchema) return template
  const params = parseInput(paramsSchema, raw, name, 'params')
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = params[key]
    if (value === undefined || value === null) {
      throw AppError.validation([{ path: key, message: 'Parâmetro obrigatório ausente' }])
    }
    return encodeURIComponent(String(value))
  })
}

function parseInput(
  schema: z.ZodTypeAny,
  raw: Record<string, unknown>,
  name: string,
  where: string,
): Record<string, unknown> {
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw AppError.validation(
      result.error.issues.map(issue => ({
        path: `${where}.${issue.path.join('.')}`,
        message: issue.message,
      })),
      `Entrada inválida para ${name}`,
    )
  }
  return result.data as Record<string, unknown>
}

function validateResponse(schema: z.ZodTypeAny, payload: unknown, name: string) {
  const result = schema.safeParse(payload)
  if (result.success) return result.data

  // Endpoints de envio de e-mail declaram `string` mas alguns ambientes
  // devolvem `{ mensagem: "..." }`. Uma string é sempre uma resposta aceitável.
  if (schema instanceof z.ZodString && payload !== null && payload !== undefined) {
    return String(typeof payload === 'object' ? JSON.stringify(payload) : payload)
  }

  logger.error(
    { integration: 'digitalsaude', endpoint: name, issues: result.error.issues.slice(0, 5) },
    'Resposta do upstream fora do contrato',
  )
  throw new AppError(
    ERROR_CODES.UPSTREAM_CONTRACT_MISMATCH,
    `Resposta inesperada da Digital Saúde em ${name}`,
  )
}

/** O upstream serve texto em ISO-8859-1; decodificar como UTF-8 corrompe acentos. */
async function decodeBody(response: Response): Promise<string> {
  const buffer = await response.arrayBuffer()
  const contentType = response.headers.get('content-type') ?? ''
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase()
  const encoding = charset && charset !== 'utf-8' ? charset : 'utf-8'
  try {
    return new TextDecoder(encoding).decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

function parseJsonBody(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed === '') return null
  try {
    return JSON.parse(trimmed)
  } catch {
    // Endpoints de envio de e-mail devolvem texto puro.
    return trimmed
  }
}

function upstreamMessage(text: string, fallback: string): string {
  const trimmed = text.trim()
  if (!trimmed) return fallback
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const message = parsed.mensagem ?? parsed.message ?? parsed.erro ?? parsed.error
    return typeof message === 'string' ? message : fallback
  } catch {
    return trimmed.length <= 300 ? trimmed : fallback
  }
}

function backoff(attempt: number): Promise<void> {
  const delay = 250 * 2 ** (attempt - 1)
  return new Promise(resolve => setTimeout(resolve, delay))
}
