/**
 * Aviso entre telas do painel: a conta de recebimento (Asaas) foi conectada,
 * trocada ou desconectada. O menu lateral e o "Primeiros passos" escutam para
 * atualizar o ponto de alerta sem recarregar a página.
 */
export const RECEIVING_ACCOUNT_CHANGED_EVENT = 'annetec:receiving-account-changed'

export function notifyReceivingAccountChanged(connected: boolean) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(RECEIVING_ACCOUNT_CHANGED_EVENT, { detail: { connected } }))
}
