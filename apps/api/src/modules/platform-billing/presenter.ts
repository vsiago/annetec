import {
  CARD_BRANDS,
  effectivePlatformAccess,
  monthlyDiscountPercentFor,
  onlyDigits,
  quotePlatformPlan,
  type CardBrand,
  type ClubCardInfo,
  type ClubChargeStatus,
  type PlatformBillingEvent,
  type PlatformCharge,
  type PlatformEventSource,
  type PlatformSubscription,
} from '@annetec/contracts'
import type { platformBillingEvents, platformCharges, platformSubscriptions } from '@/db/schema'
import { diffDays, todaySP } from '@/modules/club-billing/dates'
import { platformInvoiceUrl } from './access-key'

/**
 * Linha do banco → DTO do contracts (único lugar que converte numeric →
 * number, timestamp → ISO e monta blocos Pix/boleto/cartão).
 */

export type PlatformSubscriptionRow = typeof platformSubscriptions.$inferSelect
export type PlatformChargeRow = typeof platformCharges.$inferSelect
export type PlatformEventRow = typeof platformBillingEvents.$inferSelect

/** Fatura "aberta": ainda pode ser paga. */
export const OPEN_PLATFORM_CHARGE_STATUSES: ClubChargeStatus[] = ['pending', 'overdue', 'failed']

export function isOpenPlatformCharge(status: ClubChargeStatus): boolean {
  return OPEN_PLATFORM_CHARGE_STATUSES.includes(status)
}

export function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

export function num(value: string | number | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value)
}

export function asCardBrand(value: string | null | undefined): CardBrand {
  return value && (CARD_BRANDS as readonly string[]).includes(value) ? (value as CardBrand) : 'outra'
}

/** `12.345.678/0001-90` (só formata quando tem 14 dígitos). */
export function formatCnpj(value: string | null | undefined): string {
  const d = onlyDigits(value)
  if (d.length !== 14) return value ?? ''
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export interface TenantRef {
  name: string
  slug: string
}

export function toPlatformCharge(row: PlatformChargeRow, tenant: TenantRef | null): PlatformCharge {
  return {
    id: row.id,
    organizationId: row.organizationId,
    tenantName: tenant?.name ?? null,
    tenantSlug: tenant?.slug ?? null,
    subscriptionId: row.subscriptionId,
    proposalId: row.proposalId,
    kind: row.kind,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    dueDate: row.dueDate,
    amount: Number(row.amount),
    items: row.items ?? [],
    livesCount: row.livesCount,
    description: row.description,
    method: row.method,
    status: row.status,
    attempts: row.attempts,
    failureReason: row.failureReason,
    paidAt: iso(row.paidAt),
    paidAmount: num(row.paidAmount),
    canceledAt: iso(row.canceledAt),
    refundedAt: iso(row.refundedAt),
    invoiceUrl: row.invoiceUrl,
    pix: row.pixPayload ? { payload: row.pixPayload, qrCodeBase64: row.pixQrCode, expiresAt: iso(row.pixExpiresAt) } : null,
    boleto: row.boletoIdentificationField
      ? { identificationField: row.boletoIdentificationField, barCode: row.boletoBarCode, url: row.boletoUrl }
      : null,
    card:
      row.cardLast4 && /^\d{4}$/.test(row.cardLast4)
        ? { brand: asCardBrand(row.cardBrand), last4: row.cardLast4, expiry: null }
        : null,
    gatewayProvider: row.gatewayProvider,
    gatewayChargeId: row.gatewayChargeId,
    publicUrl: platformInvoiceUrl(row.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toPlatformEvent(row: PlatformEventRow): PlatformBillingEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    subscriptionId: row.subscriptionId,
    chargeId: row.chargeId,
    proposalId: row.proposalId,
    type: row.type,
    source: row.source as PlatformEventSource,
    message: row.message,
    gatewayProvider: row.gatewayProvider,
    createdAt: row.createdAt.toISOString(),
  }
}

export interface ChargeAggregates {
  /** Σ das abertas (`pending`/`overdue`/`failed`). */
  openAmount: number
  /** Abertas com vencimento antes de hoje. */
  overdueCount: number
  /** Vencimento da aberta mais antiga (vencida ou não). */
  oldestOpenDueDate: string | null
  /** Vencimento da aberta VENCIDA mais antiga. */
  oldestOverdueDueDate: string | null
  /** Id da aberta mais antiga (link "Pagar"). */
  oldestOpenChargeId: string | null
}

export function chargeAggregates(
  charges: { id: string; status: ClubChargeStatus; amount: string | number; dueDate: string }[],
  today: string,
): ChargeAggregates {
  let openAmount = 0
  let overdueCount = 0
  let oldest: { id: string; dueDate: string } | null = null
  let oldestOverdue: string | null = null
  for (const charge of charges) {
    if (!isOpenPlatformCharge(charge.status)) continue
    openAmount += Number(charge.amount)
    if (!oldest || charge.dueDate < oldest.dueDate) oldest = { id: charge.id, dueDate: charge.dueDate }
    if (charge.dueDate < today) {
      overdueCount += 1
      if (!oldestOverdue || charge.dueDate < oldestOverdue) oldestOverdue = charge.dueDate
    }
  }
  return {
    openAmount: Math.round(openAmount * 100) / 100,
    overdueCount,
    oldestOpenDueDate: oldest?.dueDate ?? null,
    oldestOverdueDueDate: oldestOverdue,
    oldestOpenChargeId: oldest?.id ?? null,
  }
}

/** Dias de atraso da aberta mais antiga (0 se ainda não venceu). */
export function daysLateOf(oldestOpenDueDate: string | null, today: string): number {
  if (!oldestOpenDueDate || oldestOpenDueDate >= today) return 0
  return Math.max(0, diffDays(today, oldestOpenDueDate))
}

export function subscriptionCardInfo(row: PlatformSubscriptionRow): ClubCardInfo | null {
  if (row.paymentMethod !== 'credit_card' || !row.cardLast4 || !/^\d{4}$/.test(row.cardLast4)) return null
  return { brand: asCardBrand(row.cardBrand), last4: row.cardLast4, expiry: row.cardExpiry }
}

/** Retrato do plano da assinatura no formato da cotação. */
/** Desconto da mensalidade da assinatura (`null` sem desconto). */
export function subscriptionMonthlyDiscount(
  row: Partial<Pick<PlatformSubscriptionRow, 'monthlyDiscountPercent' | 'monthlyDiscountUntil'>>,
): { percent: number; until: string | null } | null {
  const percent = Number(row.monthlyDiscountPercent ?? 0)
  return percent > 0 ? { percent, until: row.monthlyDiscountUntil ?? null } : null
}

/** Cotação da assinatura com as vidas atuais e o desconto que vale no período de `today`. */
export function subscriptionQuote(
  row: Pick<PlatformSubscriptionRow, 'planPriceMonthly' | 'memberLimit' | 'pricePerExtraLife' | 'setupFee' | 'revenueSharePercent'> &
    Partial<Pick<PlatformSubscriptionRow, 'monthlyDiscountPercent' | 'monthlyDiscountUntil' | 'currentPeriodStart'>>,
  lives: number,
  today: string = todaySP(),
) {
  const monthlyPercent = monthlyDiscountPercentFor(subscriptionMonthlyDiscount(row), row.currentPeriodStart ?? today)
  return quotePlatformPlan(
    { priceMonthly: Number(row.planPriceMonthly), memberLimit: row.memberLimit },
    {
      setupFee: Number(row.setupFee),
      pricePerExtraLife: Number(row.pricePerExtraLife),
      revenueSharePercent: Number(row.revenueSharePercent),
    },
    lives,
    { discount: monthlyPercent > 0 ? { monthlyPercent } : null },
  )
}

export interface SubscriptionContext {
  tenant: TenantRef
  lives: number
  aggregates: ChargeAggregates
  scheduledPlanName: string | null
  today: string
  now: Date
}

export function toPlatformSubscription(row: PlatformSubscriptionRow, ctx: SubscriptionContext): PlatformSubscription {
  const access = effectivePlatformAccess(row, ctx.now)
  const quote = subscriptionQuote(row, ctx.lives, ctx.today)
  return {
    id: row.id,
    organizationId: row.organizationId,
    tenantName: ctx.tenant.name,
    tenantSlug: ctx.tenant.slug,
    proposalId: row.proposalId,
    planId: row.planId,
    planName: row.planName,
    planPriceMonthly: Number(row.planPriceMonthly),
    memberLimit: row.memberLimit,
    pricePerExtraLife: Number(row.pricePerExtraLife),
    setupFee: Number(row.setupFee),
    revenueSharePercent: Number(row.revenueSharePercent),
    status: row.status,
    access: {
      level: access.level,
      source: access.source,
      overrideReason: access.source === 'override' ? (row.accessOverrideReason ?? null) : null,
      overrideUntil: access.source === 'override' ? iso(row.accessOverrideUntil) : null,
    },
    paymentMethod: row.paymentMethod,
    dueDay: row.dueDay,
    startedAt: iso(row.startedAt),
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    nextDueDate: row.nextDueDate,
    paymentCard: subscriptionCardInfo(row),
    billingName: row.billingName,
    billingDocument: row.billingDocument,
    billingEmail: row.billingEmail,
    scheduledPlanId: row.scheduledPlanId,
    scheduledPlanName: ctx.scheduledPlanName,
    lives: ctx.lives,
    usagePct: quote.usagePct,
    estimatedMonthly: quote.monthlyTotal,
    monthlyDiscount: subscriptionMonthlyDiscount(row),
    openAmount: ctx.aggregates.openAmount,
    overdueCount: ctx.aggregates.overdueCount,
    oldestOpenDueDate: ctx.aggregates.oldestOpenDueDate,
    daysLate: daysLateOf(ctx.aggregates.oldestOpenDueDate, ctx.today),
    pastDueAt: iso(row.pastDueAt),
    restrictedAt: iso(row.restrictedAt),
    suspendedAt: iso(row.suspendedAt),
    canceledAt: iso(row.canceledAt),
    cancelReason: row.cancelReason,
    gatewayProvider: row.gatewayProvider,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
