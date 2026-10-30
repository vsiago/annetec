import { proxyNotificationStream } from '@/lib/notifications/proxy-stream'

/**
 * Stream SSE das notificações do vendedor ANNETEC — proxy autenticado para
 * `GET /api/v1/platform/vendas/notificacoes/stream` (ver `proxy-stream.ts`).
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request) {
  return proxyNotificationStream(request, '/api/v1/platform/vendas/notificacoes/stream')
}
