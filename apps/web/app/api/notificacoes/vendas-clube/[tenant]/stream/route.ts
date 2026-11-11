import { proxyNotificationStream } from '@/lib/notifications/proxy-stream'

/**
 * Stream SSE das notificações do agente da Rede Comercial de um clube —
 * proxy autenticado para `GET /api/v1/t/:tenantSlug/vendas/notificacoes/stream`.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params
  if (!/^[a-z0-9-]{1,64}$/i.test(tenant)) return new Response('Clube inválido', { status: 400 })
  return proxyNotificationStream(request, `/api/v1/t/${encodeURIComponent(tenant)}/vendas/notificacoes/stream`)
}
