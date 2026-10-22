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
  /** Cabeçalhos extras (ex.: `x-forwarded-for` com o IP do navegador, para o rate limit da API). */
  headers?: Record<string, string>
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
      ...options.headers,
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

/** Teto do `perPage` aceito pela API (ver `paginationQuery` em @annetec/contracts). */
const PER_PAGE_MAX = 200

/**
 * Limite de segurança: 100 páginas × 200 = 20 mil registros. Passar disso é
 * sinal de que a tela precisa paginar de verdade, não carregar tudo.
 */
const MAX_PAGINAS = 100

/**
 * Busca uma coleção paginada INTEIRA, seguindo as páginas até o fim.
 *
 * Existe porque `perPage` tem teto de 200 na API: pedir 500 é recusado, e
 * pedir 200 numa carteira de 432 pessoas devolve 200 sem erro nenhum — o
 * `meta.total` dizia 432 e a tela contava 200. Truncamento silencioso é pior
 * que falha: o número errado passa por certo.
 *
 * Use nas listagens que alimentam indicador ou gráfico, onde o total precisa
 * fechar. Para tabela com paginação própria, prefira `apiFetch` com a página.
 */
export async function apiFetchAll<T>(path: string, options: RequestOptions = {}): Promise<T[]> {
  const primeira = await apiFetch<T[]>(path, {
    ...options,
    query: { ...options.query, page: 1, perPage: PER_PAGE_MAX },
  })

  const totalPaginas = primeira.meta?.totalPages ?? 1
  if (totalPaginas <= 1) return primeira.data

  const paginas = Math.min(totalPaginas, MAX_PAGINAS)
  const restantes = await Promise.all(
    Array.from({ length: paginas - 1 }, (_, i) =>
      apiFetch<T[]>(path, {
        ...options,
        query: { ...options.query, page: i + 2, perPage: PER_PAGE_MAX },
      }).then(r => r.data),
    ),
  )

  return [primeira.data, ...restantes].flat()
}

/** Prefixo das rotas com escopo de inquilino. */
export function tenantPath(tenantSlug: string, path: string): string {
  return `/api/v1/t/${encodeURIComponent(tenantSlug)}${path}`
}
