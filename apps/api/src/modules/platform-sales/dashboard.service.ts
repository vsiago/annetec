import {
  ONBOARDING_FINAL_STATUSES,
  OPEN_PROSPECT_STAGES,
  prospectStage,
  type ProspectStage,
  type SalesReport,
  type SalesReportRow,
  type SellerDashboard,
} from '@annetec/contracts'
import { and, count, eq, gte, inArray, lt, notInArray, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { platformDiscountRequests, platformOnboardingProposals, platformProspects, platformSalesCommissions } from '@/db/schema'
import { addDays, todaySP } from '@/modules/club-billing/dates'
import { totalsFrom } from './commissions.service'
import { upcomingActions } from './prospects.service'
import { getSeller, listSellers } from './sellers.service'

/**
 * Números do vendedor (o próprio painel) e o relatório da equipe por
 * vendedor. Competência = mês em São Paulo (`yyyy-MM`).
 */

/** [início, fim) do mês `yyyy-MM` em São Paulo. */
export function monthWindow(month: string): { from: Date; to: Date } {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return { from: new Date(`${month}-01T00:00:00-03:00`), to: new Date(`${next}-01T00:00:00-03:00`) }
}

export function currentMonthSP(now = new Date()): string {
  return todaySP(now).slice(0, 7)
}

function emptyStages(): Record<ProspectStage, number> {
  return Object.fromEntries(prospectStage.options.map(stage => [stage, 0])) as Record<ProspectStage, number>
}

export async function sellerDashboard(sellerUserId: string, now = new Date()): Promise<SellerDashboard> {
  const month = currentMonthSP(now)
  const window = monthWindow(month)
  const p = platformOnboardingProposals
  const [seller, byStage, [inProgress], [pendingDiscounts], [won], commissionRows, upcoming] = await Promise.all([
    getSeller(sellerUserId),
    db
      .select({ stage: platformProspects.stage, value: count() })
      .from(platformProspects)
      .where(eq(platformProspects.sellerUserId, sellerUserId))
      .groupBy(platformProspects.stage),
    db
      .select({ value: count() })
      .from(p)
      .where(and(eq(p.sellerUserId, sellerUserId), notInArray(p.status, [...ONBOARDING_FINAL_STATUSES]))),
    db
      .select({ value: count() })
      .from(platformDiscountRequests)
      .where(and(eq(platformDiscountRequests.sellerUserId, sellerUserId), eq(platformDiscountRequests.status, 'pending'))),
    db
      .select({ value: count() })
      .from(p)
      .where(and(eq(p.sellerUserId, sellerUserId), eq(p.status, 'active'), gte(p.provisionedAt, window.from), lt(p.provisionedAt, window.to))),
    db
      .select({ status: platformSalesCommissions.status, total: sql<string>`coalesce(sum(${platformSalesCommissions.amount}), 0)::text` })
      .from(platformSalesCommissions)
      .where(and(eq(platformSalesCommissions.sellerUserId, sellerUserId), eq(platformSalesCommissions.referenceMonth, month)))
      .groupBy(platformSalesCommissions.status),
    upcomingActions(sellerUserId, addDays(todaySP(now), 7)),
  ])
  const prospectsByStage = emptyStages()
  for (const row of byStage) prospectsByStage[row.stage] = row.value
  const achieved = won?.value ?? 0
  const target = seller.monthlyGoal
  return {
    seller,
    month,
    prospectsByStage,
    openProspects: OPEN_PROSPECT_STAGES.reduce((acc, stage) => acc + prospectsByStage[stage], 0),
    proposalsInProgress: inProgress?.value ?? 0,
    pendingDiscounts: pendingDiscounts?.value ?? 0,
    wonThisMonth: achieved,
    commissionThisMonth: totalsFrom(commissionRows),
    goal: { target, achieved, pct: target ? Math.round((achieved / target) * 1000) / 10 : null },
    upcomingActions: upcoming,
  }
}

export async function salesReport(month: string): Promise<SalesReport> {
  const window = monthWindow(month)
  const p = platformOnboardingProposals
  const sellers = await listSellers()
  const ids = sellers.map(s => s.userId)
  const none = ids.length === 0
  const [prospects, proposals, won, lost, commissions] = none
    ? [[], [], [], [], []]
    : await Promise.all([
        db
          .select({ sellerUserId: platformProspects.sellerUserId, value: count() })
          .from(platformProspects)
          .where(and(inArray(platformProspects.sellerUserId, ids), inArray(platformProspects.stage, [...OPEN_PROSPECT_STAGES])))
          .groupBy(platformProspects.sellerUserId),
        db
          .select({ sellerUserId: p.sellerUserId, value: count() })
          .from(p)
          .where(and(inArray(p.sellerUserId, ids), notInArray(p.status, [...ONBOARDING_FINAL_STATUSES])))
          .groupBy(p.sellerUserId),
        db
          .select({ sellerUserId: p.sellerUserId, value: count() })
          .from(p)
          .where(and(inArray(p.sellerUserId, ids), eq(p.status, 'active'), gte(p.provisionedAt, window.from), lt(p.provisionedAt, window.to)))
          .groupBy(p.sellerUserId),
        db
          .select({ sellerUserId: platformProspects.sellerUserId, value: count() })
          .from(platformProspects)
          .where(
            and(
              inArray(platformProspects.sellerUserId, ids),
              eq(platformProspects.stage, 'perdido'),
              gte(platformProspects.lostAt, window.from),
              lt(platformProspects.lostAt, window.to),
            ),
          )
          .groupBy(platformProspects.sellerUserId),
        db
          .select({
            sellerUserId: platformSalesCommissions.sellerUserId,
            status: platformSalesCommissions.status,
            total: sql<string>`coalesce(sum(${platformSalesCommissions.amount}), 0)::text`,
          })
          .from(platformSalesCommissions)
          .where(and(inArray(platformSalesCommissions.sellerUserId, ids), eq(platformSalesCommissions.referenceMonth, month)))
          .groupBy(platformSalesCommissions.sellerUserId, platformSalesCommissions.status),
      ])
  const countOf = (rows: { sellerUserId: string | null; value: number }[], id: string) =>
    rows.find(row => row.sellerUserId === id)?.value ?? 0
  const rows: SalesReportRow[] = sellers.map(seller => ({
    sellerUserId: seller.userId,
    sellerName: seller.name,
    referralCode: seller.referralCode,
    active: seller.active,
    openProspects: countOf(prospects, seller.userId),
    proposalsInProgress: countOf(proposals, seller.userId),
    wonInMonth: countOf(won, seller.userId),
    lostInMonth: countOf(lost, seller.userId),
    monthlyGoal: seller.monthlyGoal,
    commission: totalsFrom(commissions.filter(row => row.sellerUserId === seller.userId)),
  }))
  return {
    month,
    rows,
    totals: {
      openProspects: rows.reduce((acc, row) => acc + row.openProspects, 0),
      proposalsInProgress: rows.reduce((acc, row) => acc + row.proposalsInProgress, 0),
      wonInMonth: rows.reduce((acc, row) => acc + row.wonInMonth, 0),
      commission: totalsFrom(commissions),
    },
  }
}
