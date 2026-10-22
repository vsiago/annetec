import { createHash, timingSafeEqual } from 'node:crypto'
import { CARD_BRANDS, type CardBrand } from '@annetec/contracts'
import { z } from 'zod'
import type { GatewayChargeStatus } from '@/integrations/payments/gateway'

/**
 * Parte do webhook do Asaas que é só do Asaas: conferência do token e
 * leitura do corpo. O processamento é o handler ÚNICO de eventos
 * (`modules/club-billing/events.service.ts`).
 */

export type WebhookTokenCheck = 'ok' | 'invalid' | 'unconfigured'

/**
 * Compara o header `asaas-access-token` com o `authToken` configurado em
 * tempo constante (os dois passam por SHA-256 para igualar o tamanho).
 * `unconfigured` = servidor sem `ASAAS_WEBHOOK_TOKEN` (o controller decide
 * aceitar fora de produção).
 */
export function checkAsaasWebhookToken(received: string | null | undefined, expected: string | null | undefined): WebhookTokenCheck {
  if (!expected) return 'unconfigured'
  if (!received) return 'invalid'
  const a = createHash('sha256').update(received).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b) ? 'ok' : 'invalid'
}

const text = (max: number) => z.string().max(max)

/** Corpo aceito (tolerante: o Asaas manda muito mais campos, ignorados). */
export const asaasWebhookBody = z
  .object({
    id: text(120),
    event: text(80),
    dateCreated: text(40).nullish(),
    payment: z
      .object({
        id: text(120),
        customer: text(120).nullish(),
        status: text(60).nullish(),
        value: z.number().nullish(),
        netValue: z.number().nullish(),
        billingType: text(40).nullish(),
        dueDate: text(40).nullish(),
        paymentDate: text(40).nullish(),
        clientPaymentDate: text(40).nullish(),
        confirmedDate: text(40).nullish(),
        externalReference: text(120).nullish(),
        invoiceUrl: text(500).nullish(),
        bankSlipUrl: text(500).nullish(),
        deleted: z.boolean().nullish(),
        creditCard: z
          .object({
            creditCardNumber: text(30).nullish(),
            creditCardBrand: text(40).nullish(),
            creditCardToken: text(200).nullish(),
          })
          .nullish(),
      })
      .nullish(),
  })
  .passthrough()
export type AsaasWebhookBody = z.infer<typeof asaasWebhookBody>

/** Status do Asaas → nosso (blueprint §0.6). Desconhecido → `pending` (não muda nada). */
export function mapAsaasPaymentStatus(status: string | null | undefined, deleted?: boolean | null): GatewayChargeStatus {
  if (deleted) return 'canceled'
  switch (status) {
    case 'CONFIRMED':
    case 'RECEIVED':
    case 'RECEIVED_IN_CASH':
      return 'paid'
    case 'OVERDUE':
      return 'overdue'
    case 'REFUNDED':
    case 'REFUND_IN_PROGRESS':
    case 'REFUND_REQUESTED':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return 'refunded'
    case 'REPROVED_BY_RISK_ANALYSIS':
    case 'CREDIT_CARD_CAPTURE_REFUSED':
      return 'failed'
    default:
      return 'pending'
  }
}

/** `VISA` → `visa`; desconhecida → `outra`. */
export function mapAsaasCardBrand(brand: string | null | undefined): CardBrand {
  const normalized = (brand ?? '').trim().toLowerCase().replace(/[^a-z]/g, '')
  if (normalized === 'americanexpress') return 'amex'
  if (normalized === 'dinersclub') return 'diners'
  return (CARD_BRANDS as readonly string[]).includes(normalized) ? (normalized as CardBrand) : 'outra'
}
