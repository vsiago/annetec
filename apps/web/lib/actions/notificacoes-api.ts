'use server'

import type { NotificationList, SendTestNotificationInput } from '@annetec/contracts'
import { apiFetch, tenantPath } from '@/lib/api/client'
import type { NotificationsScope } from '@/lib/notifications/types'
import { run, type ActionResult } from './_api-result'

/**
 * Notificações em tempo real — `/api/v1/t/:tenantSlug/notificacoes` (admin do
 * clube) e `/api/v1/platform/notificacoes` (equipe Annetec). A lista e as
 * ações passam por aqui; o stream SSE passa pelo route handler
 * `app/api/notificacoes/…/stream`, que também lê o token do cookie httpOnly.
 */

function base(scope: NotificationsScope, path = ''): string {
  return scope.kind === 'tenant' ? tenantPath(scope.slug, `/notificacoes${path}`) : `/api/v1/platform/notificacoes${path}`
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
