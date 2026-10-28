import type { BillingSummary, ClubPaymentMethod } from '@annetec/contracts'
import { sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { describeGateway } from '@/integrations/payments/provider'
import { addDays, addMonthsOnDueDay, lastMonths, startOfMonth, todaySP } from './dates'
import { loadBillingSettings } from './settings.service'

/**
 * `GET /faturamento/resumo` — definições nos comentários de `billingSummary`
 * (contracts). Tudo agregado no SQL; meses no fuso de São Paulo.
 */

const METHODS: ClubPaymentMethod[] = ['pix', 'boleto', 'credit_card']
const TZ = 'America/Sao_Paulo'

type Row = Record<string, unknown>

function rowsOf(result: unknown): Row[] {
  return result as Row[]
}

const n = (value: unknown) => Number(value ?? 0)
const money = (value: unknown) => Math.round(n(value) * 100) / 100

export const summaryService = {
  async get(orgId: string, now = new Date()): Promise<BillingSummary> {
    const today = todaySP(now)
    const monthStart = startOfMonth(today)
    const nextMonthStart = addMonthsOnDueDay(monthStart, 1, 1)
    const months = lastMonths(today, 6)
    const firstMonthStart = `${months[0]}-01`
    const ninetyDaysAgo = addDays(today, -90)

    const [subsResult, dependentsResult, chargesResult, monthlyResult, receivedResult, byMethodResult, settings] =
      await Promise.all([
        db.execute(sql`
          select
            coalesce(sum(amount) filter (where status in ('active', 'past_due')), 0) as mrr,
            count(*) filter (where status = 'active')::int as active,
            count(*) filter (where status = 'pending_payment')::int as pending,
            count(*) filter (where status = 'past_due')::int as past_due,
            count(*) filter (where status = 'suspended')::int as suspended,
            count(*) filter (where status = 'canceled'
              and (canceled_at at time zone ${TZ})::date >= ${monthStart}::date
              and (canceled_at at time zone ${TZ})::date < ${nextMonthStart}::date)::int as canceled_this_month,
            count(*) filter (where started_at is not null
              and (started_at at time zone ${TZ})::date >= ${monthStart}::date
              and (started_at at time zone ${TZ})::date < ${nextMonthStart}::date)::int as new_this_month
          from club_subscriptions
          where organization_id = ${orgId}`),
        db.execute(sql`
          select count(*)::int as total
          from club_subscription_dependents d
          join club_subscriptions s on s.id = d.subscription_id
          where s.organization_id = ${orgId} and s.status in ('active', 'past_due', 'suspended')`),
        db.execute(sql`
          select
            coalesce(sum(amount) filter (where status in ('overdue', 'failed') and due_date < ${today}::date), 0) as overdue_amount,
            count(*) filter (where status in ('overdue', 'failed') and due_date < ${today}::date)::int as overdue_charges,
            coalesce(sum(amount) filter (where status <> 'canceled' and due_date >= ${ninetyDaysAgo}::date and due_date <= ${today}::date), 0) as billed_90,
            coalesce(sum(amount) filter (where status in ('pending', 'failed') and due_date >= ${today}::date
              and due_date >= ${monthStart}::date and due_date < ${nextMonthStart}::date), 0) as pending_this_month
          from club_charges
          where organization_id = ${orgId}`),
        db.execute(sql`
          select
            to_char(due_date, 'YYYY-MM') as month,
            coalesce(sum(amount) filter (where status <> 'canceled'), 0) as billed,
            coalesce(sum(amount) filter (where status in ('overdue', 'failed') and due_date < ${today}::date), 0) as overdue
          from club_charges
          where organization_id = ${orgId} and due_date >= ${firstMonthStart}::date and due_date < ${nextMonthStart}::date
          group by 1`),
        db.execute(sql`
          select
            to_char(paid_at at time zone ${TZ}, 'YYYY-MM') as month,
            coalesce(sum(coalesce(paid_amount, amount)), 0) as received
          from club_charges
          where organization_id = ${orgId}
            and paid_at is not null
            and status in ('paid', 'refunded')
            and (paid_at at time zone ${TZ})::date >= ${firstMonthStart}::date
            and (paid_at at time zone ${TZ})::date < ${nextMonthStart}::date
          group by 1`),
        db.execute(sql`
          select payment_method as method, count(*)::int as count, coalesce(sum(amount), 0) as amount
          from club_subscriptions
          where organization_id = ${orgId} and status in ('active', 'past_due')
          group by 1`),
        loadBillingSettings(orgId),
      ])

    const subs = rowsOf(subsResult)[0] ?? {}
    const charges = rowsOf(chargesResult)[0] ?? {}
    const monthlyRows = rowsOf(monthlyResult)
    const receivedRows = rowsOf(receivedResult)
    const byMethodRows = rowsOf(byMethodResult)

    const mrr = money(subs.mrr)
    const overdueAmount = money(charges.overdue_amount)
    const billed90 = money(charges.billed_90)
    const currentMonth = today.slice(0, 7)
    const receivedThisMonth = money(receivedRows.find(row => row.month === currentMonth)?.received)

    // Sem conta de recebimento o resumo abre do mesmo jeito (o aviso fica nas configurações).
    const gateway = await describeGateway(orgId, settings.gatewayOverride)

    return {
      gateway: gateway.provider,
      sandbox: gateway.sandbox,
      mrr,
      activeSubscriptions: n(subs.active),
      pendingSubscriptions: n(subs.pending),
      pastDueSubscriptions: n(subs.past_due),
      suspendedSubscriptions: n(subs.suspended),
      canceledThisMonth: n(subs.canceled_this_month),
      newThisMonth: n(subs.new_this_month),
      totalDependents: n(rowsOf(dependentsResult)[0]?.total),
      overdueAmount,
      overdueCharges: n(charges.overdue_charges),
      delinquencyRate: billed90 > 0 ? Math.round((overdueAmount / billed90) * 10_000) / 100 : 0,
      receivedThisMonth,
      pendingThisMonth: money(charges.pending_this_month),
      forecastNextMonth: mrr,
      monthly: months.map(month => {
        const row = monthlyRows.find(item => item.month === month)
        return {
          month,
          billed: money(row?.billed),
          received: money(receivedRows.find(item => item.month === month)?.received),
          overdue: money(row?.overdue),
        }
      }),
      byMethod: METHODS.map(method => {
        const row = byMethodRows.find(item => item.method === method)
        return { method, count: n(row?.count), amount: money(row?.amount) }
      }),
      lastAutomationRunAt: settings.lastAutomationRunAt ? settings.lastAutomationRunAt.toISOString() : null,
    }
  },
}
