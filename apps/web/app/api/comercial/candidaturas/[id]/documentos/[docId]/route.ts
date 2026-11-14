import { forwardedClientHeaders } from '@/lib/api/internal-proxy'
import { getToken } from '@/lib/api/session'

/**
 * Proxy do arquivo de um documento de candidatura (parceiro comercial) para o
 * admin comercial. O token vive em cookie httpOnly: aqui, no servidor, ele vira
 * `Authorization: Bearer` para
 * `GET /api/v1/vendas/rede/candidaturas/:id/documentos/:docId/arquivo` (plataforma) ou
 * `GET /api/v1/t/:slug/vendas/rede/candidaturas/:id/documentos/:docId/arquivo`
 * (clube, via `?tenant=<slug>`). Só PDF/JPEG/PNG saem inline; o resto vira download.
 */

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3333').replace(/\/+$/, '')
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INLINE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png'])

function erro(status: number, mensagem: string) {
  return new Response(mensagem, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params
  const token = await getToken()
  if (!token) return erro(401, 'Sessão expirada. Entre novamente.')

  const tenant = new URL(request.url).searchParams.get('tenant')
  if (!UUID_RE.test(id) || !UUID_RE.test(docId) || (tenant && !SLUG_RE.test(tenant))) {
    return Response.json({ error: 'Parâmetros inválidos' }, { status: 400, headers: { 'cache-control': 'no-store' } })
  }
  const prefixo = tenant ? `/api/v1/t/${encodeURIComponent(tenant)}/vendas` : '/api/v1/vendas'
  const url = `${API_BASE_URL}${prefixo}/rede/candidaturas/${encodeURIComponent(id)}/documentos/${encodeURIComponent(docId)}/arquivo`

  let upstream: Response
  try {
    upstream = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, ...forwardedClientHeaders(request.headers) },
      cache: 'no-store',
      signal: request.signal,
    })
  } catch {
    return erro(502, 'A API não respondeu. Verifique se o servidor está no ar e tente novamente.')
  }

  if (!upstream.ok || !upstream.body) {
    const payload = (await upstream.json().catch(() => null)) as { error?: { message?: string } } | null
    return erro(upstream.status || 502, payload?.error?.message ?? 'Não foi possível abrir o documento.')
  }

  const contentType = (upstream.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  const inline = INLINE_TYPES.has(contentType)
  const disposition = upstream.headers.get('content-disposition')
  const rawName = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '')?.[1] ?? `documento-${docId}`
  let fileName = rawName
  try {
    fileName = decodeURIComponent(rawName)
  } catch {
    // nome já veio sem codificação
  }
  // Header só aceita ASCII: `filename` vai "achatado" e o nome real em `filename*`.
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '')

  const headers = new Headers({
    'content-type': inline ? contentType : 'application/octet-stream',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  })
  const length = upstream.headers.get('content-length')
  if (length) headers.set('content-length', length)

  return new Response(upstream.body, { status: 200, headers })
}
