// Derives report series from a tenant's actual records. Every dashboard and
// report page reads from here, so a brand-new tenant shows honest zeros
// instead of invented figures.

import type { Sale, Lead, Client, LeadStatus } from './types'

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export type PeriodKey = '1m' | '3m' | '6m' | '1y'

export const PERIOD_MONTHS: Record<PeriodKey, number> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': 12,
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/** Start of the month N months before the current one. */
function monthsAgo(n: number): Date {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() - n, 1)
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`
}

/** Ordered list of the last N months, oldest first. */
export function lastMonths(count: number): { key: string; label: string; date: Date }[] {
  const now = new Date()
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1)
    return { key: monthKey(date), label: MONTH_LABELS[date.getMonth()], date }
  })
}

export function filterByPeriod<T>(items: T[], getDate: (item: T) => Date | string, period: PeriodKey): T[] {
  const cutoff = monthsAgo(PERIOD_MONTHS[period] - 1)
  return items.filter(item => toDate(getDate(item)) >= cutoff)
}

/** Revenue + new-client counts per month, for the revenue/growth charts. */
export function monthlySeries(sales: Sale[], clients: Client[], months: number) {
  const buckets = lastMonths(months)
  return buckets.map(bucket => {
    const monthSales = sales.filter(s => monthKey(toDate(s.date)) === bucket.key && s.status !== 'cancelled')
    const monthClients = clients.filter(c => monthKey(toDate(c.contractDate)) === bucket.key)
    return {
      month: bucket.label,
      vendas: monthSales.reduce((sum, s) => sum + s.value, 0),
      novosClientes: monthClients.length,
      cancelamentos: clients.filter(
        c => c.planStatus === 'cancelled' && monthKey(toDate(c.contractDate)) === bucket.key
      ).length,
    }
  })
}

/** Share of active clients per plan name. */
export function planDistribution(clients: Client[], palette: string[]) {
  const counts = new Map<string, number>()
  clients.forEach(c => {
    const key = c.plan || 'Sem plano'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({ name, value, color: palette[i % palette.length] }))
}

/** Lead volume grouped by acquisition source. */
export function leadsBySource(leads: Lead[]) {
  const counts = new Map<string, number>()
  leads.forEach(l => {
    const key = l.source || 'Outros'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([source, leads]) => ({ source, leads }))
}

/** Monthly conversion rate: closed leads over total leads created that month. */
export function conversionSeries(leads: Lead[], months: number) {
  return lastMonths(months).map(bucket => {
    const monthLeads = leads.filter(l => monthKey(toDate(l.createdAt)) === bucket.key)
    const closed = monthLeads.filter(l => l.status === 'closed').length
    return {
      month: bucket.label,
      taxa: monthLeads.length === 0 ? 0 : Math.round((closed / monthLeads.length) * 100),
    }
  })
}

/** Count of leads sitting in each pipeline stage. */
export function pipelineByStatus(leads: Lead[]): Record<LeadStatus, number> {
  const base: Record<LeadStatus, number> = {
    new: 0,
    contacted: 0,
    qualified: 0,
    proposal: 0,
    negotiation: 0,
    closed: 0,
    lost: 0,
  }
  leads.forEach(l => {
    base[l.status] = (base[l.status] ?? 0) + 1
  })
  return base
}

export interface SummaryMetrics {
  revenue: number
  newClients: number
  conversionRate: number
  averageTicket: number
  revenueChange: number | null
  clientsChange: number | null
}

/** Headline numbers plus period-over-period change (null when no baseline). */
export function summaryMetrics(
  sales: Sale[],
  leads: Lead[],
  clients: Client[],
  period: PeriodKey
): SummaryMetrics {
  const months = PERIOD_MONTHS[period]
  const currentStart = monthsAgo(months - 1)
  const previousStart = monthsAgo(months * 2 - 1)

  const confirmed = sales.filter(s => s.status !== 'cancelled')
  const current = confirmed.filter(s => toDate(s.date) >= currentStart)
  const previous = confirmed.filter(s => {
    const d = toDate(s.date)
    return d >= previousStart && d < currentStart
  })

  const revenue = current.reduce((sum, s) => sum + s.value, 0)
  const previousRevenue = previous.reduce((sum, s) => sum + s.value, 0)

  const newClients = clients.filter(c => toDate(c.contractDate) >= currentStart).length
  const previousClients = clients.filter(c => {
    const d = toDate(c.contractDate)
    return d >= previousStart && d < currentStart
  }).length

  const periodLeads = leads.filter(l => toDate(l.createdAt) >= currentStart)
  const closedLeads = periodLeads.filter(l => l.status === 'closed').length

  const percentChange = (now: number, before: number) =>
    before === 0 ? null : Math.round(((now - before) / before) * 100)

  return {
    revenue,
    newClients,
    conversionRate: periodLeads.length === 0 ? 0 : Math.round((closedLeads / periodLeads.length) * 100),
    averageTicket: current.length === 0 ? 0 : Math.round(revenue / current.length),
    revenueChange: percentChange(revenue, previousRevenue),
    clientsChange: percentChange(newClients, previousClients),
  }
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Logged interactions grouped by weekday, for the seller activity chart. */
export function activityByWeekday(leads: Lead[]) {
  const base = WEEKDAY_LABELS.map(day => ({ day, ligacoes: 0, emails: 0, reunioes: 0 }))
  leads.forEach(lead => {
    lead.interactions.forEach(interaction => {
      const bucket = base[toDate(interaction.date).getDay()]
      if (interaction.type === 'call') bucket.ligacoes += 1
      if (interaction.type === 'email') bucket.emails += 1
      if (interaction.type === 'meeting') bucket.reunioes += 1
    })
  })
  // Monday-first, dropping the weekend to match how the team actually works.
  return [...base.slice(1, 6)]
}

/** Revenue and lead counts bucketed into the last N weeks. */
export function weeklySeries(sales: Sale[], leads: Lead[], weeks = 4) {
  const now = new Date()
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const start = new Date(now.getTime() - weeks * msPerWeek)

  const buckets = Array.from({ length: weeks }, (_, i) => ({
    week: `Sem ${i + 1}`,
    from: new Date(start.getTime() + i * msPerWeek),
    to: new Date(start.getTime() + (i + 1) * msPerWeek),
    vendas: 0,
    leads: 0,
  }))

  const place = (date: Date, apply: (b: (typeof buckets)[number]) => void) => {
    const bucket = buckets.find(b => date >= b.from && date < b.to)
    if (bucket) apply(bucket)
  }

  sales
    .filter(s => s.status !== 'cancelled')
    .forEach(s => place(toDate(s.date), b => { b.vendas += s.value }))
  leads.forEach(l => place(toDate(l.createdAt), b => { b.leads += 1 }))

  return buckets.map(({ week, vendas, leads }) => ({ week, vendas, leads }))
}

/** Goal-vs-achieved and commission history per month for a single seller. */
export function sellerGoalHistory(sales: Sale[], monthlyGoal: number, months = 6) {
  return lastMonths(months).map(bucket => {
    const monthSales = sales.filter(
      s => monthKey(toDate(s.date)) === bucket.key && s.status === 'confirmed'
    )
    return {
      month: bucket.label,
      meta: monthlyGoal,
      realizado: monthSales.reduce((sum, s) => sum + s.value, 0),
      comissao: monthSales.reduce((sum, s) => sum + s.commission, 0),
    }
  })
}

/** Confirmed sales total for the calendar month currently in progress. */
export function currentMonthTotal(sales: Sale[]): number {
  const now = new Date()
  const key = monthKey(new Date(now.getFullYear(), now.getMonth(), 1))
  return sales
    .filter(s => s.status === 'confirmed' && monthKey(toDate(s.date)) === key)
    .reduce((sum, s) => sum + s.value, 0)
}

export function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR')}`
}

/** "+18% vs. período anterior", or a neutral message when there's no baseline. */
export function formatChange(change: number | null): { text: string; tone: 'up' | 'down' | 'neutral' } {
  if (change === null) return { text: 'Sem período anterior para comparar', tone: 'neutral' }
  if (change === 0) return { text: 'Estável vs. período anterior', tone: 'neutral' }
  return {
    text: `${change > 0 ? '+' : ''}${change}% vs. período anterior`,
    tone: change > 0 ? 'up' : 'down',
  }
}
