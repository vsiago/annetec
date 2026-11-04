import 'server-only'
import { NextResponse } from 'next/server'
import { BRAND_LOGO_MAX_BYTES } from '@annetec/contracts'
import { forwardedClientHeaders } from '@/lib/api/internal-proxy'
import { getToken } from '@/lib/api/session'

/**
 * Proxy compartilhado do envio/remoção de logo e ícone do clube:
 * navegador → rota do Next → API. O token da sessão vive em cookie httpOnly,
 * então é aqui que ele vira `Authorization: Bearer`. Existe também porque
 * server action tem teto de corpo de 1 MB e não dá barra de progresso.
 *
 * A resposta da API (envelope `{ success, data | error }`) volta intacta, com o
 * mesmo status — a tela mostra a mensagem específica (413, 422, 429…).
 */

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3333').replace(/\/+$/, '')

/** Folga do multipart (cabeçalhos das partes e campos de texto). */
const MULTIPART_OVERHEAD = 64 * 1024

/** `tipo` da URL → trecho do caminho da API. Qualquer outro valor é recusado. */
const TIPOS: Record<string, 'logo' | 'icone'> = { logo: 'logo', icone: 'icone' }

function failure(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { 'cache-control': 'no-store' } },
  )
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * O segmento dinâmico da URL (`[tenant]`/`[id]`) entra no caminho da API: só
 * aceita slug ou UUID válidos — `..`, `%2F`, `?` e afins nunca chegam ao fetch.
 */
export function isSafeBrandSegment(kind: 'slug' | 'uuid', value: string): boolean {
  return (kind === 'slug' ? SLUG : UUID).test(value)
}

export function brandTipo(tipo: string): 'logo' | 'icone' | null {
  return Object.hasOwn(TIPOS, tipo) ? TIPOS[tipo]! : null
}

/**
 * Repassa a chamada à API. `apiPath` devolve o caminho SEM o `/logo|/icone` final
 * (ex.: `/api/v1/t/meu-clube/marca`). `onSuccess` roda quando a API aceitou
 * (usado para invalidar o cache das páginas).
 */
export async function proxyBrandRequest(
  request: Request,
  input: {
    /** Monta o caminho da API a partir do segmento já validado. */
    apiPath: (segment: string) => string
    segment: string
    segmentKind: 'slug' | 'uuid'
    tipo: string
    method: 'POST' | 'DELETE'
    onSuccess?: () => void
  },
): Promise<Response> {
  if (!isSafeBrandSegment(input.segmentKind, input.segment)) return failure(404, 'NOT_FOUND', 'Clube não encontrado.')
  const tipo = brandTipo(input.tipo)
  if (!tipo) return failure(400, 'BAD_REQUEST', 'Tipo de envio inválido.')

  const token = await getToken()
  if (!token) return failure(401, 'UNAUTHORIZED', 'Sua sessão expirou. Entre de novo para continuar.')

  let body: FormData | undefined
  if (input.method === 'POST') {
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (declared > BRAND_LOGO_MAX_BYTES + MULTIPART_OVERHEAD) {
      return failure(413, 'PAYLOAD_TOO_LARGE', 'O arquivo pode ter no máximo 5 MB.')
    }
    try {
      body = await request.formData()
    } catch {
      return failure(400, 'BAD_REQUEST', 'Não foi possível ler o arquivo enviado.')
    }
  }

  let upstream: Response
  try {
    upstream = await fetch(`${API_BASE_URL}${input.apiPath(input.segment)}/${tipo}`, {
      method: input.method,
      body,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...forwardedClientHeaders(request.headers),
      },
      cache: 'no-store',
    })
  } catch (error) {
    console.error('[marca] API indisponível:', error)
    return failure(502, 'UPSTREAM_UNAVAILABLE', 'A API não respondeu. Verifique se o servidor está no ar e tente novamente.')
  }

  const text = await upstream.text()
  if (!text) return failure(upstream.status || 502, 'INTERNAL_ERROR', 'A API não respondeu em formato válido.')

  if (upstream.ok) input.onSuccess?.()

  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  })
}
