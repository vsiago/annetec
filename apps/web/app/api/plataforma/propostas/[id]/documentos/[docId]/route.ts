import { getToken } from '@/lib/api/session'

/**
 * Proxy do arquivo de um documento KYB para o console de compliance.
 *
 * O visualizador (`<iframe>`/`<img>`) precisa de uma URL do próprio site: o
 * token da equipe vive em cookie httpOnly e nunca vai para o browser, então é
 * aqui, no servidor, que ele vira `Authorization: Bearer` para a API
 * (`GET /api/v1/platform/onboarding/propostas/:id/documentos/:docId/arquivo`).
 *
 * Só repassa PDF/JPEG/PNG (a API já valida por magic bytes no upload); qualquer
 * outra coisa sai como download, nunca renderizada na origem do console.
 */

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3333').replace(/\/+$/, '')
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
  if (!token) return erro(401, 'Sessão expirada. Entre novamente no console.')

  const url = `${API_BASE_URL}/api/v1/platform/onboarding/propostas/${encodeURIComponent(id)}/documentos/${encodeURIComponent(docId)}/arquivo`

  let upstream: Response
  try {
    upstream = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: request.signal,
    })
  } catch {
    return erro(502, 'A API não respondeu. Verifique se o servidor está no ar e tente novamente.')
  }

  if (!upstream.ok || !upstream.body) {
    // A API responde erro no envelope JSON; a frase dela é a mais útil.
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
