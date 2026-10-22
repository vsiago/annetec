import {
  type ClubChargeStatus,
  type PlatformBillingSummary,
  type PlatformChargeKind,
  type PlatformSubscriptionStatus,
} from '@annetec/contracts'
import { db } from '@/db/client'
import { platformCharges } from '@/db/schema'
import { lastMonths, monthOf, toDateSP, todaySP } from '@/modules/club-billing/dates'
import { delinquencyOf, round2 } from '@/modules/holding/formulas'
import { loadPlatformSettings, toPlatformSettingsDto } from './settings.service'
import { allSubscriptionDtos } from './subscriptions.service'

/**
 * `GET /platform/billing/resumo` — fórmulas exatas da §0.4 do blueprint da
 * plataforma, numa função PURA (`computePlatformBillingSummary`) testada com
 * datas fixas; o serviço só carrega as linhas (volume pequeno).
 */

export interface SummarySubscription {
  status: PlatformSubscriptionStatus
  startedAt: Date | null
  canceledAt: Date | null
  estimatedMonthly: number
  lives: number
  memberLimit: number
}

export interface SummaryCharge {
  kind: PlatformChargeKind
  status: ClubChargeStatus
  amount: number
  paidAmount: number | null
  dueDate: string
  paidAt: Date | null
}

export { delinquencyOf }

export function computePlatformBillingSummary(input: {
  subscriptions: SummarySubscription[]
  charges: SummaryCharge[]
  today: string
}): Omit<PlatformBillingSummary, 'gateway' | 'sandbox' | 'lastAutomationRunAt'> {
  const { subscriptions, charges, today } = input
  const month = monthOf(today)
  const monthOfInstant = (instant: Date | null) => (instant ? monthOf(toDateSP(instant)) : null)

  const billable = subscriptions.filter(s => s.status === 'active' || s.status === 'past_due' || s.status === 'restricted')
  const live = subscriptions.filter(s => s.status !== 'canceled')
  const mrr = round2(billable.reduce((acc, s) => acc + s.estimatedMonthly, 0))
  const count = (status: PlatformSubscriptionStatus) => subscriptions.filter(s => s.status === status).length

  const delinquency = delinquencyOf(charges, today)
  let receivedThisMonth = 0
  let pendingThisMonth = 0
  let activationRevenueThisMonth = 0
  for (const charge of charges) {
    const paidMonth = monthOfInstant(charge.paidAt)
    if (charge.status === 'paid' && paidMonth === month) {
      receivedThisMonth += charge.paidAmount ?? charge.amount
      if (charge.kind === 'activation') activationRevenueThisMonth += charge.paidAmount ?? charge.amount
    }
    if (charge.status === 'pending' && monthOf(charge.dueDate) === month && charge.dueDate >= today) pendingThisMonth += charge.amount
  }

  const monthly = lastMonths(today, 6).map(m => {
    let billed = 0
    let received = 0
    let overdue = 0
    for (const charge of charges) {
      const dueMonth = monthOf(charge.dueDate)
      if (dueMonth === m && charge.status !== 'canceled') billed += charge.amount
      if (charge.status === 'paid' && monthOfInstant(charge.paidAt) === m) received += charge.paidAmount ?? charge.amount
      if (dueMonth === m && (charge.status === 'overdue' || charge.status === 'failed')) overdue += charge.amount
    }
    return { month: m, billed: round2(billed), received: round2(received), overdue: round2(overdue) }
  })

  return {
    mrr,
    activeSubscriptions: count('active'),
    pastDueSubscriptions: count('past_due'),
    restrictedSubscriptions: count('restricted'),
    suspendedSubscriptions: count('suspended'),
    canceledSubscriptions: count('canceled'),
    newThisMonth: subscriptions.filter(s => monthOfInstant(s.startedAt) === month).length,
    canceledThisMonth: subscriptions.filter(s => s.status === 'canceled' && monthOfInstant(s.canceledAt) === month).length,
    totalLives: live.reduce((acc, s) => acc + s.lives, 0),
    extraLives: live.reduce((acc, s) => acc + Math.max(0, s.lives - s.memberLimit), 0),
    overdueAmount: delinquency.overdueAmount,
    overdueCharges: delinquency.overdueCharges,
    delinquencyRate: delinquency.rate,
    receivedThisMonth: round2(receivedThisMonth),
    pendingThisMonth: round2(pendingThisMonth),
    forecastNextMonth: mrr,
    activationRevenueThisMonth: round2(activationRevenueThisMonth),
    monthly,
  }
}

export async function getPlatformBillingSummary(now = new Date()): Promise<PlatformBillingSummary> {
  const [subscriptions, rows, settings] = await Promise.all([
    allSubscriptionDtos(now),
    db
      .select({
        kind: platformCharges.kind,
        status: platformCharges.status,
        amount: platformCharges.amount,
        paidAmount: platformCharges.paidAmount,
        dueDate: platformCharges.dueDate,
        paidAt: platformCharges.paidAt,
      })
      .from(platformCharges),
    loadPlatformSettings(),
  ])
  const dto = toPlatformSettingsDto(settings)
  const summary = computePlatformBillingSummary({
    subscriptions: subscriptions.map(s => ({
      status: s.status,
      startedAt: s.startedAt ? new Date(s.startedAt) : null,
      canceledAt: s.canceledAt ? new Date(s.canceledAt) : null,
      estimatedMonthly: s.estimatedMonthly,
      lives: s.lives,
      memberLimit: s.memberLimit,
    })),
    charges: rows.map(r => ({
      kind: r.kind,
      status: r.status,
      amount: Number(r.amount),
      paidAmount: r.paidAmount === null ? null : Number(r.paidAmount),
      dueDate: r.dueDate,
      paidAt: r.paidAt,
    })),
    today: todaySP(now),
  })
  return {
    gateway: dto.gateway,
    sandbox: dto.sandbox,
    ...summary,
    lastAutomationRunAt: dto.automation.lastRunAt,
  }
}
