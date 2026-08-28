import 'server-only'
import type { Envelope, ErrorCode, FieldIssue, PageMeta } from '@annetec/contracts'
import { getToken } from './session'

/**
 * Cliente da API Annetec para uso em Server Components e Server Actions.
 *
 * Fica marcado como `server-only`: o access token vive em cookie httpOnly e
 * nunca deve chegar ao bundle do browser. Componentes de cliente conversam com
 * a API através das Server Actions em `lib/actions/*`, não daqui.
 */
const BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3333').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly issues?: FieldIssue[]
  readonly requestId?: string

  constructor(params: {
    code: ErrorCode
    message: string
    status: number
    issues?: FieldIssue[]
    requestId?: string
  }) {
    super(params.message)
    this.name = 'ApiError'
    this.code = params.code
    this.status = params.status
    this.issues = params.issues
    this.requestId = params.requestId
  }

  /** Converte para o formato que os formulários do app já consomem. */
  toFieldErrors(): Record<string, string> {
    const errors: Record<string, string> = {}
    for (const issue of this.issues ?? []) errors[issue.path] = issue.message
    return errors
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  /** Sobrescreve o token do cookie (usado no login, antes da sessão existir). */
  token?: string | null
  /** Repassado ao `fetch` do Next para controle de cache/revalidação. */
  next?: { revalidate?: number | false; tags?: string[] }
  cache?: RequestCache
}

export interface ApiResult<T> {
  data: T
  meta?: PageMeta
}

/**
 * Executa a chamada e desembrulha o envelope `{ success, data, error }`.
 * Erro de negócio vira `ApiError` — quem chama trata com try/catch em vez de
 * inspecionar `success` em toda tela.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const url = new URL(BASE_URL + path)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const token = options.token !== undefined ? options.token : await getToken()

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: options.cache ?? 'no-store',
    ...(options.next ? { next: options.next } : {}),
  })

  const payload = (await response.json().catch(() => null)) as Envelope<T> | null

  if (!payload) {
    throw new ApiError({
      code: 'INTERNAL_ERROR',
      message: 'A API não respondeu em formato válido',
      status: response.status,
    })
  }

  if (!payload.success) {
    throw new ApiError({
      code: payload.error.code,
      message: payload.error.message,
      status: response.status,
      issues: payload.error.issues,
      requestId: payload.error.requestId,
    })
  }

  return { data: payload.data, meta: payload.meta }
}

/** Atalho para quando só interessa o `data`. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await apiFetch<T>(path, options)
  return data
}

/** Prefixo das rotas com escopo de inquilino. */
export function tenantPath(tenantSlug: string, path: string): string {
  return `/api/v1/t/${encodeURIComponent(tenantSlug)}${path}`
}
