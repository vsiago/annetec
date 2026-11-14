import { NextResponse, type NextRequest } from 'next/server'
import { CANDIDATURA_MAX_FILE_BYTES } from '@annetec/contracts'
import { forwardedClientHeaders } from '@/lib/api/internal-proxy'

/**
 * Proxy do upload de documento da candidatura de parceiro comercial:
 * browser → aqui → API. Existe pela barra de progresso (XHR) e porque server
 * action tem teto de 1 MB. Query: `id`, `chave`, `tenant?` (slug do clube).
 * A resposta da API volta intacta, com o mesmo status.
 */

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3333').replace(/\/+$/, '')
const MULTIPART_OVERHEAD = 64 * 1024
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHAVE_RE = /^[A-Za-z0-9_-]{16,64}$/

function failure(status: number, code: string, message: string) {
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const id = params.get('id') ?? ''
  const chave = params.get('chave') ?? ''
  const tenant = params.get('tenant')
  if (!UUID_RE.test(id) || !CHAVE_RE.test(chave) || (tenant && !SLUG_RE.test(tenant))) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  const lengthHeader = request.headers.get('content-length')
  if (!lengthHeader) return failure(411, 'LENGTH_REQUIRED', 'Tamanho do envio não informado.')
  const declared = Number(lengthHeader)
  if (!Number.isFinite(declared) || declared < 0) return failure(400, 'BAD_REQUEST', 'Tamanho do envio inválido.')
  if (declared > CANDIDATURA_MAX_FILE_BYTES + MULTIPART_OVERHEAD) {
    return failure(413, 'PAYLOAD_TOO_LARGE', 'O arquivo pode ter no máximo 4 MB.')
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return failure(400, 'BAD_REQUEST', 'Não foi possível ler o arquivo enviado.')
  }

  const prefix = tenant
    ? `/api/v1/t/${encodeURIComponent(tenant)}/public/vendas/candidaturas`
    : '/api/v1/public/vendas/candidaturas'
  const target = new URL(`${API_BASE_URL}${prefix}/${encodeURIComponent(id)}/documentos`)
  target.searchParams.set('chave', chave)

  const clientIp = forwardedClientHeaders(request.headers)
  const userAgent = request.headers.get('user-agent')

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: 'POST',
      body: form,
      headers: { accept: 'application/json', ...clientIp, ...(userAgent ? { 'user-agent': userAgent } : {}) },
      cache: 'no-store',
    })
  } catch (error) {
    console.error('[seja-parceiro/upload] API indisponível:', error)
    return failure(502, 'UPSTREAM_UNAVAILABLE', 'A API não respondeu. Verifique se o servidor está no ar e tente novamente.')
  }

  const text = await upstream.text()
  if (!text) return failure(upstream.status || 502, 'INTERNAL_ERROR', 'A API não respondeu em formato válido.')
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
  })
}
