/**
 * De onde vêm as notificações de uma tela: o painel de um clube (só o admin
 * dele), o backoffice da Annetec (todos os clubes) ou a área do vendedor
 * ANNETEC (só as dele: decisão dos pedidos de desconto). Mora fora do arquivo
 * `'use server'` porque módulo de Server Action só exporta função async.
 */
export type NotificationsScope = { kind: 'tenant'; slug: string } | { kind: 'platform' } | { kind: 'seller'; slug?: string }

/** Rota do Next que faz o proxy do stream SSE (cookie httpOnly → Bearer). */
export function notificationStreamPath(scope: NotificationsScope): string {
  if (scope.kind === 'tenant') return `/api/notificacoes/clube/${encodeURIComponent(scope.slug)}/stream`
  if (scope.kind === 'seller') {
    return scope.slug ? `/api/notificacoes/vendas-clube/${encodeURIComponent(scope.slug)}/stream` : '/api/notificacoes/vendas/stream'
  }
  return '/api/notificacoes/plataforma/stream'
}
