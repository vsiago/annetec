import 'server-only'
import { getToken } from '@/lib/api/session'

/**
 * Proxy do stream SSE de notificações (route handlers em
 * `app/api/notificacoes/…/stream`).
 *
 * O `EventSource` do navegador não manda `Authorization`, e o token vive em
 * cookie httpOnly que o JavaScript não lê. Então o navegador abre um
 * EventSource para o PRÓPRIO site (o cookie vai junto, same-origin) e é
 * aqui, no servidor, que ele vira `Authorization: Bearer` para a API — o
 * token nunca aparece em URL, log de acesso ou JavaScript.
 *
 * Repassa `Last-Event-ID` (reconexão automática) e `?after=` (primeira
 * conexão), e devolve o corpo da API em streaming, sem bufferizar.
 */

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3333').replace(/\/+$/, '')

function erro(status: number, mensagem: string) {
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function proxyNotificationStream(request: Request, apiPath: string): Promise<Response> {
  const token = await getToken()
  if (!token) return erro(401, 'Sessão expirada. Entre novamente.')

  const incoming = new URL(request.url)
  const url = new URL(API_BASE_URL + apiPath)
  const after = incoming.searchParams.get('after')
  if (after && after.length <= 64) url.searchParams.set('after', after)

  const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: 'text/event-stream' }
  const lastEventId = request.headers.get('last-event-id')
  if (lastEventId && lastEventId.length <= 64) headers['last-event-id'] = lastEventId

  let upstream: Response
  try {
    upstream = await fetch(url, { headers, cache: 'no-store', signal: request.signal })
  } catch {
    return erro(502, 'A API não respondeu.')
  }

  const contentType = upstream.headers.get('content-type') ?? ''
  if (!upstream.ok || !upstream.body || !contentType.includes('text/event-stream')) {
    const payload = (await upstream.json().catch(() => null)) as { error?: { message?: string } } | null
    return erro(upstream.status >= 400 ? upstream.status : 502, payload?.error?.message ?? 'Não foi possível abrir as notificações.')
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}
