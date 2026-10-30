import { formatBRL, notificationTone, type AppNotification } from '@annetec/contracts'

/** "agora", "há 2 min", "há 3 h", "ontem às 14:05", "03/10 às 09:12". */
export function relativeTime(iso: string, now: number): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''
  const diff = Math.max(0, now - at)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 12) return `há ${hours} h`

  const date = new Date(at)
  const today = new Date(now)
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) return `hoje às ${time}`
  const yesterday = new Date(now - 24 * 60 * 60 * 1000)
  if (date.toDateString() === yesterday.toDateString()) return `ontem às ${time}`
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${time}`
}

export function isPayment(notification: Pick<AppNotification, 'kind'>): boolean {
  return notificationTone(notification.kind) === 'payment'
}

export function amountLabel(notification: Pick<AppNotification, 'amount'>): string | null {
  return notification.amount === null ? null : formatBRL(notification.amount)
}

/** Iniciais da pessoa (cadastro) ou do clube (backoffice). */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]![0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** Rótulo curto do backoffice: "Pagamento R$ 49,90", "Nova assinatura R$ 79,70", "Novo cadastro". */
export function platformHeadline(notification: AppNotification): string {
  const amount = amountLabel(notification)
  switch (notification.kind) {
    case 'subscription_activated':
      return `Nova assinatura ${amount ?? ''}`.trim()
    case 'payment_received':
      return `Pagamento ${amount ?? ''}`.trim()
    case 'client_signed_up':
      return notification.payload.via === 'returned' ? 'Associado de volta' : 'Novo cadastro'
    case 'platform_invoice_paid':
      return notification.title
    case 'sales_discount_requested':
      return 'Pedido de desconto para aprovar'
    case 'sales_discount_approved':
      return 'Desconto aprovado'
    case 'sales_discount_rejected':
      return 'Desconto recusado'
    case 'managed_account_requested':
      return 'Pedido de conta gerenciada'
    case 'managed_account_decided':
    case 'platform_auto_debit_failed':
      return notification.title
  }
}

/** Notificação das vendas da plataforma (pedido de desconto e decisão). */
export function isSalesNotification(notification: Pick<AppNotification, 'kind'>): boolean {
  return (
    notification.kind === 'sales_discount_requested' ||
    notification.kind === 'sales_discount_approved' ||
    notification.kind === 'sales_discount_rejected'
  )
}

/**
 * Para onde a notificação leva ao clicar. As de vendas são montadas aqui a
 * partir dos ids do `payload` (a API também grava o mesmo link):
 *  - pedido de desconto (equipe) → Comercial › Descontos, com o pedido aberto;
 *  - aprovado/recusado (vendedor) → a proposta na área do vendedor.
 * As demais usam o `link` gravado pela API.
 */
export function notificationHref(notification: Pick<AppNotification, 'kind' | 'link' | 'payload'>): string | null {
  const { payload } = notification
  switch (notification.kind) {
    case 'sales_discount_requested':
      return payload.discountRequestId
        ? `/admin/comercial/descontos?pedido=${encodeURIComponent(payload.discountRequestId)}`
        : '/admin/comercial/descontos'
    case 'sales_discount_approved':
    case 'sales_discount_rejected':
      return payload.proposalId ? `/vendas/propostas/${encodeURIComponent(payload.proposalId)}` : '/vendas/propostas'
    default:
      return notification.link
  }
}
