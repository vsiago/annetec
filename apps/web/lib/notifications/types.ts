/**
 * De onde vêm as notificações de uma tela: o painel de um clube (só o admin
 * dele) ou o backoffice da Annetec (todos os clubes). Mora fora do arquivo
 * `'use server'` porque módulo de Server Action só exporta função async.
 */
export type NotificationsScope = { kind: 'tenant'; slug: string } | { kind: 'platform' }

/** Rota do Next que faz o proxy do stream SSE (cookie httpOnly → Bearer). */
export function notificationStreamPath(scope: NotificationsScope): string {
  return scope.kind === 'tenant'
    ? `/api/notificacoes/clube/${encodeURIComponent(scope.slug)}/stream`
    : '/api/notificacoes/plataforma/stream'
}
