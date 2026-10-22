import {
  EMPTY_CLUB_PLAN_STATS,
  sortClubPlansForDisplay,
  type ClubPlan,
  type ClubPlanStats,
  type ClubPlanStatsCounters,
  type ClubPlanStatsReport,
} from '@annetec/contracts'
import { sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { todaySP } from './dates'

/**
 * `GET /faturamento/planos/estatisticas` — pessoas e receita por plano.
 * Definições (blueprint de planos, decisão 5 / comentários de `clubPlanStatsCounters`):
 *  - vigentes = `active` + `past_due` (carteirinha válida); titulares = vigentes;
 *  - dependentes = os das vigentes; vidas = titulares + dependentes;
 *  - MRR = Σ `amount` das vigentes;
 *  - `overdueAmount` = Σ das cobranças abertas (`pending|overdue|failed`) já vencidas (SP).
 * Todo plano do inquilino aparece (zerado se não tiver assinatura); a linha
 * "Sem plano" (`planId: null`) só quando há assinatura de plano excluído.
 */

type Row = Record<string, unknown>

const n = (value: unknown) => Number(value ?? 0)
const money = (value: unknown) => Math.round(n(value) * 100) / 100
const key = (planId: unknown) => (typeof planId === 'string' ? planId : '')

export interface PlanStatsSource {
  plans: Array<Pick<ClubPlan, 'id' | 'name' | 'sortOrder' | 'highlight' | 'priceMonthly'>>
  /** Uma linha por `plan_id` (null = plano excluído). */
  subscriptions: Row[]
  dependents: Row[]
  overdue: Row[]
}

/** Merge puro das três agregações com a lista de planos (testável sem banco). */
export function buildPlanStatsReport(source: PlanStatsSource, generatedAt: Date = new Date()): ClubPlanStatsReport {
  const byPlan = new Map<string, ClubPlanStatsCounters>()
  const counters = (planId: unknown) => {
    const id = key(planId)
    let current = byPlan.get(id)
    if (!current) {
      current = { ...EMPTY_CLUB_PLAN_STATS }
      byPlan.set(id, current)
    }
    return current
  }

  for (const row of source.subscriptions) {
    const target = counters(row.plan_id)
    target.active = n(row.active)
    target.pastDue = n(row.past_due)
    target.suspended = n(row.suspended)
    target.canceled = n(row.canceled)
    target.pendingPayment = n(row.pending_payment)
    target.holders = target.active + target.pastDue
    target.mrr = money(row.mrr)
  }
  for (const row of source.dependents) counters(row.plan_id).dependents = n(row.total)
  for (const row of source.overdue) counters(row.plan_id).overdueAmount = money(row.amount)
  for (const value of byPlan.values()) value.lives = value.holders + value.dependents

  const plans: ClubPlanStats[] = sortClubPlansForDisplay(source.plans).map(plan => ({
    planId: plan.id,
    planName: plan.name,
    ...(byPlan.get(plan.id) ?? { ...EMPTY_CLUB_PLAN_STATS }),
  }))
  const orphan = byPlan.get('')
  if (orphan) plans.push({ planId: null, planName: 'Sem plano', ...orphan })

  const totals = plans.reduce<ClubPlanStatsCounters>(
    (sum, plan) => ({
      holders: sum.holders + plan.holders,
      dependents: sum.dependents + plan.dependents,
      lives: sum.lives + plan.lives,
      active: sum.active + plan.active,
      pastDue: sum.pastDue + plan.pastDue,
      suspended: sum.suspended + plan.suspended,
      canceled: sum.canceled + plan.canceled,
      pendingPayment: sum.pendingPayment + plan.pendingPayment,
      mrr: money(sum.mrr + plan.mrr),
      overdueAmount: money(sum.overdueAmount + plan.overdueAmount),
    }),
    { ...EMPTY_CLUB_PLAN_STATS },
  )
  return { plans, totals, generatedAt: generatedAt.toISOString() }
}

export const planStatsService = {
  async report(orgId: string, now = new Date()): Promise<ClubPlanStatsReport> {
    const today = todaySP(now)
    const [plans, subscriptions, dependents, overdue] = await Promise.all([
      db.execute(sql`
        select id, name, sort_order, highlight, price_monthly
        from club_plans
        where organization_id = ${orgId}`),
      db.execute(sql`
        select
          club_plan_id as plan_id,
          count(*) filter (where status = 'active')::int as active,
          count(*) filter (where status = 'past_due')::int as past_due,
          count(*) filter (where status = 'suspended')::int as suspended,
          count(*) filter (where status = 'canceled')::int as canceled,
          count(*) filter (where status = 'pending_payment')::int as pending_payment,
          coalesce(sum(amount) filter (where status in ('active', 'past_due')), 0) as mrr
        from club_subscriptions
        where organization_id = ${orgId}
        group by club_plan_id`),
      db.execute(sql`
        select s.club_plan_id as plan_id, count(*)::int as total
        from club_subscription_dependents d
        join club_subscriptions s on s.id = d.subscription_id
        where s.organization_id = ${orgId} and s.status in ('active', 'past_due')
        group by s.club_plan_id`),
      db.execute(sql`
        select s.club_plan_id as plan_id, coalesce(sum(c.amount), 0) as amount
        from club_charges c
        join club_subscriptions s on s.id = c.subscription_id
        where c.organization_id = ${orgId}
          and c.status in ('pending', 'overdue', 'failed')
          and c.due_date < ${today}::date
        group by s.club_plan_id`),
    ])

    return buildPlanStatsReport(
      {
        plans: (plans as unknown as Row[]).map(row => ({
          id: String(row.id),
          name: String(row.name),
          sortOrder: row.sort_order === null || row.sort_order === undefined ? null : n(row.sort_order),
          highlight: row.highlight === true,
          priceMonthly: n(row.price_monthly),
        })),
        subscriptions: subscriptions as unknown as Row[],
        dependents: dependents as unknown as Row[],
        overdue: overdue as unknown as Row[],
      },
      now,
    )
  },
}
