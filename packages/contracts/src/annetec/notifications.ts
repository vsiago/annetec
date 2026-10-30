import { z } from 'zod'

/**
 * Notificações em tempo real do painel do clube (`/[tenant]/admin`) e do
 * backoffice da Annetec (`/admin`). Ver `apps/api/src/lib/notifications.ts`
 * (emissão) e `apps/api/src/modules/notifications` (lista, leitura e stream).
 *
 * Cada fato gera uma linha por público: `tenant` (admin do clube de origem) e
 * `platform` (equipe Annetec, de todos os clubes). `organizationId` é sempre o
 * clube de origem — nulo só na fatura de ativação de um clube que ainda não existe.
 */

/**
 * `seller` = UM vendedor ANNETEC (`recipientUserId`): pedido de desconto
 * aprovado/recusado. Lido em `/api/v1/platform/vendas/notificacoes`.
 */
export const NOTIFICATION_AUDIENCES = ['tenant', 'platform', 'seller'] as const
export const notificationAudience = z.enum(NOTIFICATION_AUDIENCES)
export type NotificationAudience = z.infer<typeof notificationAudience>

/**
 * - `subscription_activated`: 1ª cobrança paga de uma assinatura (a compra) —
 *   substitui o "pagamento recebido" dessa cobrança, nunca os dois;
 * - `payment_received`: cobranças seguintes (recorrência, segunda via);
 * - `client_signed_up`: associado novo no clube (checkout, Google, cadastro
 *   com senha, admin cadastrou ou associado excluído que voltou);
 * - `platform_invoice_paid`: o clube pagou uma fatura da Annetec (só plataforma);
 * - `sales_discount_requested`: vendedor pediu desconto (equipe, decide o superadmin);
 * - `sales_discount_approved` / `sales_discount_rejected`: decisão (só o vendedor);
 * - `onboarding_submitted`: um clube enviou a contratação para análise (só a equipe).
 *
 * As que pedem decisão da equipe (`onboarding_submitted`, `managed_account_requested`,
 * `sales_discount_requested`) levam a Aprovações (`approvalsHref`, em `./approvals`).
 */
export const NOTIFICATION_KINDS = [
  'subscription_activated',
  'payment_received',
  'client_signed_up',
  'platform_invoice_paid',
  'sales_discount_requested',
  'sales_discount_approved',
  'sales_discount_rejected',
  /** Clube pediu a conta gerenciada (sino da equipe). */
  'managed_account_requested',
  /** Superadmin aprovou/recusou o pedido (sino do clube). */
  'managed_account_decided',
  /** Débito automático da fatura ANNETEC não realizado (sino do clube). */
  'platform_auto_debit_failed',
  /** Clube enviou a contratação para análise (sino da equipe → Aprovações › Novos clubes). */
  'onboarding_submitted',
] as const
export const notificationKind = z.enum(NOTIFICATION_KINDS)
export type NotificationKind = z.infer<typeof notificationKind>

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  subscription_activated: 'Nova assinatura paga',
  payment_received: 'Pagamento recebido',
  client_signed_up: 'Novo cadastro',
  platform_invoice_paid: 'Fatura da Annetec paga',
  sales_discount_requested: 'Descontos de vendedores',
  sales_discount_approved: 'Desconto aprovado',
  sales_discount_rejected: 'Desconto recusado',
  managed_account_requested: 'Contas gerenciadas',
  managed_account_decided: 'Conta gerenciada',
  platform_auto_debit_failed: 'Débito automático não realizado',
  onboarding_submitted: 'Novos clubes',
}

/** Família visual/sonora: dinheiro entrando ou pessoa chegando. */
export function notificationTone(kind: NotificationKind): 'payment' | 'signup' {
  return kind === 'client_signed_up' || kind === 'onboarding_submitted' ? 'signup' : 'payment'
}

/** Como o associado chegou (só `client_signed_up`). */
export const NOTIFICATION_SIGNUP_VIA = ['checkout', 'google', 'password', 'admin', 'returned'] as const
export type NotificationSignupVia = (typeof NOTIFICATION_SIGNUP_VIA)[number]

export const NOTIFICATION_SIGNUP_VIA_LABELS: Record<NotificationSignupVia, string> = {
  checkout: 'pelo site',
  google: 'com Google',
  password: 'pelo cadastro',
  admin: 'cadastrado pelo clube',
  returned: 'voltou ao clube',
}

/** Ids e textos curtos para o "Ver detalhes" e o toast. Nunca dado sensível. */
export const notificationPayload = z.object({
  chargeId: z.string().optional(),
  subscriptionId: z.string().optional(),
  userId: z.string().optional(),
  platformChargeId: z.string().optional(),
  personName: z.string().optional(),
  planName: z.string().optional(),
  /** Descrição da cobrança avulsa paga (no lugar do plano). */
  chargeDescription: z.string().optional(),
  /** Rótulo pronto ("Pix", "Cartão Visa •••• 4242"). */
  methodLabel: z.string().optional(),
  via: z.enum(NOTIFICATION_SIGNUP_VIA).optional(),
  /** Gerada pelo botão "Enviar notificação de teste" (fora de produção). */
  test: z.boolean().optional(),
  /** Vendas: proposta e pedido de desconto envolvidos. */
  proposalId: z.string().optional(),
  discountRequestId: z.string().optional(),
})
export type NotificationPayload = z.infer<typeof notificationPayload>

export const notificationTenant = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  primaryColor: z.string().nullable(),
  logoUrl: z.string().nullable(),
})
export type NotificationTenant = z.infer<typeof notificationTenant>

export const appNotification = z.object({
  id: z.string().uuid(),
  audience: notificationAudience,
  kind: notificationKind,
  organizationId: z.string().nullable(),
  tenant: notificationTenant.nullable(),
  title: z.string(),
  body: z.string().nullable(),
  amount: z.number().nullable(),
  payload: notificationPayload,
  /** Rota relativa do web para o "Ver detalhes". */
  link: z.string().nullable(),
  createdAt: z.string().datetime(),
  read: z.boolean(),
})
export type AppNotification = z.infer<typeof appNotification>

export interface NotificationList {
  items: AppNotification[]
  unread: number
  /** Cursor para abrir o stream (`?after=`) sem perder nada entre a lista e a conexão. */
  cursor: string
  /** Rota de teste liberada (fora de produção) — alimenta `isDemoMode`. */
  demoToolsEnabled: boolean
}

export const listNotificationsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>

/** Sem `ids`: marca todas do escopo como lidas. */
export const markNotificationsReadInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100).optional(),
})
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadInput>

export const sendTestNotificationInput = z.object({
  kind: z.enum(['payment', 'signup']).default('payment'),
})
export type SendTestNotificationInput = z.infer<typeof sendTestNotificationInput>

/** Evento SSE do stream: `event: notification`, `data: AppNotification`. */
export const NOTIFICATION_STREAM_EVENT = 'notification'
