import {
  CARD_BRANDS,
  type CardBrand,
  type ClubCardInfo,
  type ClubCardStatus,
  type ClubCharge,
  type ClubChargeStatus,
  type ClubDependent,
  type ClubSubscription,
  type ClubSubscriptionStatus,
  type PaymentEvent,
} from '@annetec/contracts'
import type { clubCharges, clubSubscriptionDependents, clubSubscriptions, paymentEvents } from '@/db/schema'

/**
 * Linha do banco → DTO do contracts. Único lugar que converte: numeric →
 * number, date → `yyyy-MM-dd` (já vem assim), timestamp → ISO; blocos
 * Pix/boleto/cartão só quando preenchidos.
 */

export type SubscriptionRow = typeof clubSubscriptions.$inferSelect
export type ChargeRow = typeof clubCharges.$inferSelect
export type DependentRow = typeof clubSubscriptionDependents.$inferSelect
export type EventRow = typeof paymentEvents.$inferSelect

/** Cobrança "aberta": ainda pode ser paga. */
export const OPEN_CHARGE_STATUSES: ClubChargeStatus[] = ['pending', 'overdue', 'failed']

export function isOpenCharge(status: ClubChargeStatus): boolean {
  return OPEN_CHARGE_STATUSES.includes(status)
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function num(value: string | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value)
}

export function asCardBrand(value: string | null | undefined): CardBrand {
  return value && (CARD_BRANDS as readonly string[]).includes(value) ? (value as CardBrand) : 'outra'
}

export function toClubCharge(row: ChargeRow, sub: Pick<SubscriptionRow, 'holderName' | 'planName'>): ClubCharge {
  return {
    id: row.id,
    tenantId: row.organizationId,
    subscriptionId: row.subscriptionId,
    holderName: sub.holderName,
    planName: sub.planName,
    kind: row.kind,
    description: row.description,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    dueDate: row.dueDate,
    amount: Number(row.amount),
    method: row.method,
    status: row.status,
    attempts: row.attempts,
    failureReason: row.failureReason,
    paidAt: iso(row.paidAt),
    paidAmount: num(row.paidAmount),
    canceledAt: iso(row.canceledAt),
    refundedAt: iso(row.refundedAt),
    invoiceUrl: row.invoiceUrl,
    pix: row.pixPayload
      ? { payload: row.pixPayload, qrCodeBase64: row.pixQrCode, expiresAt: iso(row.pixExpiresAt) }
      : null,
    boleto: row.boletoIdentificationField
      ? { identificationField: row.boletoIdentificationField, barCode: row.boletoBarCode, url: row.boletoUrl }
      : null,
    card: row.cardLast4 && /^\d{4}$/.test(row.cardLast4)
      ? { brand: asCardBrand(row.cardBrand), last4: row.cardLast4, expiry: null }
      : null,
    gatewayProvider: row.gatewayProvider,
    gatewayChargeId: row.gatewayChargeId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toClubDependent(row: DependentRow): ClubDependent {
  return {
    id: row.id,
    name: row.name,
    cpf: row.cpf,
    birthDate: row.birthDate,
    relationship: row.relationship,
    cardNumber: row.cardNumber,
  }
}

export function subscriptionCardInfo(row: SubscriptionRow): ClubCardInfo | null {
  if (row.paymentMethod !== 'credit_card' || !row.cardLast4 || !/^\d{4}$/.test(row.cardLast4)) return null
  return { brand: asCardBrand(row.cardBrand), last4: row.cardLast4, expiry: row.cardExpiry }
}

export interface SubscriptionAggregates {
  openAmount: number
  overdueCount: number
}

export function toClubSubscription(
  row: SubscriptionRow,
  dependents: DependentRow[],
  aggregates: SubscriptionAggregates,
): ClubSubscription {
  return {
    id: row.id,
    tenantId: row.organizationId,
    planId: row.clubPlanId,
    planName: row.planName,
    planPriceMonthly: Number(row.planPriceMonthly),
    dependentPriceMonthly: Number(row.dependentPriceMonthly),
    includedDependents: row.includedDependents,
    enrollmentFee: Number(row.enrollmentFee),
    amount: Number(row.amount),
    paymentMethod: row.paymentMethod,
    status: row.status,
    dueDay: row.dueDay,
    startedAt: iso(row.startedAt),
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    nextDueDate: row.nextDueDate,
    cardNumber: row.cardNumber,
    holder: {
      userId: row.userId,
      name: row.holderName,
      cpf: row.holderCpf,
      email: row.holderEmail,
      phone: row.holderPhone,
      birthDate: row.holderBirthDate,
    },
    dependents: [...dependents].sort((a, b) => a.position - b.position).map(toClubDependent),
    paymentCard: subscriptionCardInfo(row),
    gatewayProvider: row.gatewayProvider,
    openAmount: Math.round(aggregates.openAmount * 100) / 100,
    overdueCount: aggregates.overdueCount,
    canceledAt: iso(row.canceledAt),
    cancelReason: row.cancelReason,
    suspendedAt: iso(row.suspendedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toPaymentEvent(row: EventRow): PaymentEvent {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    chargeId: row.chargeId,
    type: row.type,
    source: row.source,
    message: row.message,
    gatewayProvider: row.gatewayProvider,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Situação da carteirinha: `past_due` ainda vale (carência); `suspended` bloqueia. */
export function cardStatusOf(status: ClubSubscriptionStatus): ClubCardStatus {
  switch (status) {
    case 'active':
    case 'past_due':
      return 'active'
    case 'pending_payment':
      return 'pending'
    case 'suspended':
      return 'blocked'
    default:
      return 'canceled'
  }
}

/** Soma/contagem das cobranças abertas de uma lista (para o DTO da assinatura). */
export function aggregatesFromCharges(charges: ChargeRow[], today: string): SubscriptionAggregates {
  let openAmount = 0
  let overdueCount = 0
  for (const charge of charges) {
    if (!isOpenCharge(charge.status)) continue
    openAmount += Number(charge.amount)
    if (charge.status === 'overdue' || ((charge.status === 'failed' || charge.status === 'pending') && charge.dueDate < today)) {
      overdueCount += 1
    }
  }
  return { openAmount, overdueCount }
}
