'use server'

import type { NotificationList, SendTestNotificationInput } from '@annetec/contracts'
import { apiFetch, tenantPath } from '@/lib/api/client'
import type { NotificationsScope } from '@/lib/notifications/types'
import { prefixoApi } from '@/lib/vendas-rede/escopo'
import { run, type ActionResult } from './_api-result'

/**
 * Notificações em tempo real — `/api/v1/t/:tenantSlug/notificacoes` (admin do
 * clube), `/api/v1/platform/notificacoes` (equipe Annetec) e
 * `/api/v1/platform/vendas/notificacoes` (vendedor ANNETEC). A lista e as
 * ações passam por aqui; o stream SSE passa pelo route handler
 * `app/api/notificacoes/…/stream`, que também lê o token do cookie httpOnly.
 */

function base(scope: NotificationsScope, path = ''): string {
  if (scope.kind === 'tenant') return tenantPath(scope.slug, `/notificacoes${path}`)
  // Rede Comercial (plataforma ou clube): as notificações do agente (lead novo no pool, desconto decidido).
  if (scope.kind === 'seller') return `${prefixoApi(scope.slug ? { kind: 'tenant', slug: scope.slug } : { kind: 'platform' })}/notificacoes${path}`
  return `/api/v1/platform/notificacoes${path}`
}

export async function listNotificationsAction(scope: NotificationsScope, limit = 20): Promise<ActionResult<NotificationList>> {
  return run(async () => (await apiFetch<NotificationList>(base(scope), { query: { limit } })).data)
}

/** Sem `ids`: todas do escopo. */
export async function markNotificationsReadAction(
  scope: NotificationsScope,
  ids?: string[],
): Promise<ActionResult<{ marked: number; unread: number }>> {
  return run(async () => {
    const { data } = await apiFetch<{ marked: number; unread: number }>(base(scope, '/lidas'), {
      method: 'POST',
      body: ids && ids.length > 0 ? { ids } : {},
    })
    return data
  })
}

/** Só fora de produção (a API recusa em produção). */
export async function sendTestNotificationAction(
  scope: NotificationsScope,
  kind: SendTestNotificationInput['kind'],
): Promise<ActionResult<{ sent: number }>> {
  return run(async () => {
    const { data } = await apiFetch<{ sent: number }>(base(scope, '/teste'), { method: 'POST', body: { kind } })
    return data
  })
}
