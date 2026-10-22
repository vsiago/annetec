import { proxyNotificationStream } from '@/lib/notifications/proxy-stream'

/**
 * Stream SSE das notificações do painel do clube — proxy autenticado para
 * `GET /api/v1/t/:tenantSlug/notificacoes/stream` (ver `proxy-stream.ts`).
 * A API encerra a resposta em ~25 s e o EventSource reconecta sozinho.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  if (!/^[a-z0-9-]{1,64}$/i.test(tenant)) return new Response('Clube inválido', { status: 400 })
  return proxyNotificationStream(request, `/api/v1/t/${encodeURIComponent(tenant)}/notificacoes/stream`)
}
