/**
 * Eventos que os webhooks do Asaas assinam — os que
 * `club-billing/events.service.ts` e `platform-billing/events.service.ts`
 * tratam (mudam estado) ou registram na timeline para revisão humana.
 *
 * Fonte única para os dois cadastros:
 *  - webhook do CLUBE (conta Asaas de cada clube): `club-billing/receiving-account.service.ts`,
 *    acionado pelo painel (conectar/testar recebimento);
 *  - webhook da PLATAFORMA (conta da ANNETEC): `scripts/asaas-setup.ts`.
 *
 * Sem dependências de propósito: o script importa isto antes de validar o `.env`.
 * Mudou a lista? Rode o setup (plataforma) e "Testar" o recebimento de cada
 * clube — o `PUT` ajusta os webhooks existentes.
 */
export const ASAAS_WEBHOOK_EVENTS = [
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
  'PAYMENT_REFUNDED',
  'PAYMENT_PARTIALLY_REFUNDED',
  'PAYMENT_DELETED',
  'PAYMENT_RESTORED',
  'PAYMENT_UPDATED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
] as const

export type AsaasWebhookEventName = (typeof ASAAS_WEBHOOK_EVENTS)[number]

/**
 * Eventos de situação cadastral da SUBCONTA (conta gerenciada pela ANNETEC):
 * 4 dimensões × 4 status + vencimento dos dados comerciais. Só o webhook de
 * subconta os assina; clubes com chave própria seguem só com `PAYMENT_*`.
 */
const ACCOUNT_STATUS_DIMENSIONS = ['BANK_ACCOUNT_INFO', 'COMMERCIAL_INFO', 'DOCUMENT', 'GENERAL_APPROVAL'] as const
const ACCOUNT_STATUS_VALUES = ['APPROVED', 'AWAITING_APPROVAL', 'PENDING', 'REJECTED'] as const

export const ASAAS_ACCOUNT_STATUS_EVENTS: readonly string[] = [
  ...ACCOUNT_STATUS_DIMENSIONS.flatMap(dimension => ACCOUNT_STATUS_VALUES.map(value => `ACCOUNT_STATUS_${dimension}_${value}`)),
  'ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRING_SOON',
  'ACCOUNT_STATUS_COMMERCIAL_INFO_EXPIRED',
]

/** Eventos do webhook do clube com SUBCONTA: cobranças + situação cadastral. */
export const SUBACCOUNT_WEBHOOK_EVENTS: readonly string[] = [...ASAAS_WEBHOOK_EVENTS, ...ASAAS_ACCOUNT_STATUS_EVENTS]
