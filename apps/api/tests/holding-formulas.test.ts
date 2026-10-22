import { describe, expect, it } from 'vitest'
import {
  churnStats,
  cohortTable,
  delinquencyOf,
  delinquencyRatePrev,
  growthPct,
  pct,
  sortAlerts,
} from '@/modules/holding/formulas'
import {
  buildAlerts,
  buildKpis,
  buildMonthlySeries,
  buildTenantRows,
  type HoldingDataset,
} from '@/modules/holding/snapshot'

/**
 * Fórmulas da holding (blueprint da plataforma §0.5) com datas FIXAS:
 * hoje = 27/09/2026 (SP). Nenhum banco: o retrato é montado à mão.
 */

const NOW = new Date('2026-09-27T15:00:00Z')
const TODAY = '2026-09-27'
const at = (iso: string) => new Date(`${iso}T15:00:00Z`)
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000)

describe('taxas e crescimento', () => {
  it('pct e growth com 1 casa; null sem denominador', () => {
    expect(pct(1, 3)).toBe(33.3)
    expect(pct(1, 0)).toBeNull()
    expect(growthPct(120, 100)).toBe(20)
    expect(growthPct(1000, 2500)).toBe(-60)
    expect(growthPct(5, 0)).toBeNull()
  })
})

describe('churn e crescimento de assinaturas', () => {
  const items = [
    { startedAt: at('2026-08-01'), canceledAt: at('2026-09-15') }, // viva no início de set., cancelada em set.
    { startedAt: at('2026-07-10'), canceledAt: null }, // viva
    { startedAt: at('2026-09-05'), canceledAt: null }, // nova em set.
    { startedAt: at('2026-06-01'), canceledAt: at('2026-08-20') }, // cancelada em ago.
    { startedAt: null, canceledAt: null }, // nunca ativou
  ]

  it('setembro: vivas no início 2, novas 1, canceladas 1 → churn 50%, líquido 0%, fim 2', () => {
    expect(churnStats(items, '2026-09')).toEqual({
      aliveAtStart: 2,
      started: 1,
      canceled: 1,
      churnRate: 50,
      netGrowthPct: 0,
      aliveAtEnd: 2,
    })
  })

  it('agosto: quem começou no próprio mês não conta como viva no início', () => {
    const aug = churnStats(items, '2026-08')
    expect(aug.aliveAtStart).toBe(2)
    expect(aug.started).toBe(1)
    expect(aug.canceled).toBe(1)
    expect(aug.churnRate).toBe(50)
  })

  it('sem base no início do mês → null', () => {
    expect(churnStats([{ startedAt: at('2026-09-10'), canceledAt: null }], '2026-09').churnRate).toBeNull()
  })
})

describe('coortes', () => {
  it('retenção por mês desde a ativação; futuro e coorte vazia → null', () => {
    const rows = cohortTable(
      [
        { startedAt: at('2026-07-02'), canceledAt: at('2026-08-15') },
        { startedAt: at('2026-07-12'), canceledAt: at('2026-09-20') },
        { startedAt: at('2026-07-20'), canceledAt: null },
        { startedAt: at('2026-09-03'), canceledAt: null },
      ],
      TODAY,
      3,
    )
    expect(rows).toEqual([
      { cohort: '2026-07', size: 3, retention: [100, 66.7, 33.3] },
      { cohort: '2026-08', size: 0, retention: [null, null, null] },
      { cohort: '2026-09', size: 1, retention: [100, null, null] },
    ])
  })
})

describe('inadimplência em 2 níveis (agora e há 30 dias)', () => {
  const charges = [
    { status: 'overdue' as const, amount: 100, dueDate: '2026-08-01', paidAt: null },
    { status: 'paid' as const, amount: 200, dueDate: '2026-08-10', paidAt: at('2026-09-05') },
    { status: 'paid' as const, amount: 300, dueDate: '2026-07-10', paidAt: at('2026-07-09') },
    { status: 'pending' as const, amount: 400, dueDate: '2026-09-30', paidAt: null },
    { status: 'canceled' as const, amount: 500, dueDate: '2026-09-01', paidAt: null },
    { status: 'overdue' as const, amount: 50, dueDate: '2026-09-20', paidAt: null },
  ]

  it('agora: vencido em aberto ÷ faturado com vencimento em [hoje−90, hoje]', () => {
    expect(delinquencyOf(charges, TODAY)).toEqual({ overdueAmount: 150, overdueCharges: 2, base: 650, rate: 23.1 })
  })

  it('há 30 dias: vencidas antes de hoje−30 ainda abertas ou pagas depois ÷ faturado em [hoje−120, hoje−30]', () => {
    expect(delinquencyRatePrev(charges, TODAY)).toBe(50)
  })

  it('sem base → 0', () => {
    expect(delinquencyOf([], TODAY).rate).toBe(0)
  })
})

describe('alertas — ordenação', () => {
  it('critical > warning > info, depois métrica desc (nula por último)', () => {
    const sorted = sortAlerts([
      { id: 'a', severity: 'info' as const, metric: 90 },
      { id: 'b', severity: 'critical' as const, metric: null },
      { id: 'c', severity: 'warning' as const, metric: 10 },
      { id: 'd', severity: 'critical' as const, metric: 5 },
      { id: 'e', severity: 'warning' as const, metric: 80 },
    ])
    expect(sorted.map(a => a.id)).toEqual(['d', 'b', 'e', 'c', 'a'])
  })
})

function dataset(): HoldingDataset {
  const sub = {
    proposalId: null,
    accessOverride: null,
    accessOverrideUntil: null,
    setupFee: '0',
    revenueSharePercent: '0',
    canceledAt: null,
  }
  return {
    now: NOW,
    today: TODAY,
    tenants: [
      { organizationId: 'org1', slug: 'mapcard2', name: 'MapCard 2', status: 'active', planId: 'p1', createdAt: at('2026-04-10') },
      { organizationId: 'org2', slug: 'mepcard', name: 'MepCard', status: 'active', planId: 'p2', createdAt: at('2025-01-01') },
      { organizationId: 'org3', slug: 'antigo', name: 'Antigo', status: 'cancelled', planId: 'p2', createdAt: at('2026-01-01') },
      { organizationId: 'org4', slug: 'asserv', name: 'Clube ASSERV', status: 'active', planId: 'p2', createdAt: at('2026-09-20') },
    ],
    plans: new Map([
      ['p1', { id: 'p1', name: 'Pro', memberLimit: 1000, priceMonthly: 990 }],
      ['p2', { id: 'p2', name: 'Essencial', memberLimit: 100, priceMonthly: 490 }],
    ]),
    subs: [
      { ...sub, id: 's1', organizationId: 'org1', status: 'restricted', planName: 'Pro', planPriceMonthly: '990', memberLimit: 1000, pricePerExtraLife: '2.9', startedAt: at('2026-04-10') },
      { ...sub, id: 's4', organizationId: 'org4', status: 'active', planName: 'Essencial', planPriceMonthly: '490', memberLimit: 100, pricePerExtraLife: '1', startedAt: at('2026-09-20') },
    ],
    platformCharges: [
      { id: 'c1', organizationId: 'org1', subscriptionId: 's1', status: 'overdue', amount: 990, paidAmount: null, dueDate: '2026-09-10', paidAt: null },
      { id: 'c2', organizationId: 'org1', subscriptionId: 's1', status: 'paid', amount: 990, paidAmount: 990, dueDate: '2026-08-10', paidAt: at('2026-08-08') },
      { id: 'c3', organizationId: 'org4', subscriptionId: 's4', status: 'paid', amount: 980, paidAmount: 980, dueDate: '2026-09-20', paidAt: at('2026-09-20') },
    ],
    lives: new Map([
      ['org1', 1250],
      ['org2', 50],
    ]),
    clubSubs: [
      { organizationId: 'org1', status: 'active', amount: 100, dependents: 2, startedAt: at('2026-09-10'), canceledAt: null },
      { organizationId: 'org1', status: 'active', amount: 50, dependents: 0, startedAt: at('2026-05-01'), canceledAt: null },
      { organizationId: 'org1', status: 'canceled', amount: 80, dependents: 0, startedAt: at('2026-03-01'), canceledAt: at('2026-09-05') },
      { organizationId: 'org2', status: 'active', amount: 70, dependents: 0, startedAt: at('2025-06-01'), canceledAt: null },
    ],
    clubChargeAgg: new Map([
      ['org1', { overdueNow: 150, baseNow: 650, overduePrev: 300, basePrev: 600, gmvLast30: 1000, gmvPrev30: 2500 }],
      ['org2', { overdueNow: 0, baseNow: 100, overduePrev: 0, basePrev: 100, gmvLast30: 500, gmvPrev30: 400 }],
    ]),
    gmvByOrgMonth: new Map([
      ['org1', new Map([['2026-09', 1200], ['2026-08', 2000]])],
      ['org2', new Map([['2026-09', 300], ['2026-08', 500]])],
    ]),
    proposals: [
      { id: 'p-1', code: 'ANN-2609-AAAAA', status: 'submitted', name: 'SINDCOM', organizationId: null, submittedAt: hoursAgo(60), firstSubmittedAt: hoursAgo(60), approvedAt: null, provisionedAt: null, provisioningError: null, pendingSince: null },
      { id: 'p-2', code: 'ANN-2609-BBBBB', status: 'awaiting_payment', name: 'VIDA MAIS', organizationId: null, submittedAt: hoursAgo(200), firstSubmittedAt: hoursAgo(200), approvedAt: hoursAgo(6 * 24), provisionedAt: null, provisioningError: null, pendingSince: null },
      { id: 'p-3', code: 'ANN-2609-CCCCC', status: 'provisioning', name: 'BOA VIDA', organizationId: null, submittedAt: hoursAgo(170), firstSubmittedAt: hoursAgo(170), approvedAt: hoursAgo(100), provisionedAt: null, provisioningError: 'timeout', pendingSince: null },
      { id: 'p-4', code: 'ANN-2609-DDDDD', status: 'active', name: 'ASSERV', organizationId: 'org4', submittedAt: hoursAgo(240), firstSubmittedAt: hoursAgo(240), approvedAt: hoursAgo(200), provisionedAt: at('2026-09-20'), provisioningError: null, pendingSince: null },
      { id: 'p-5', code: 'ANN-2609-EEEEE', status: 'rejected', name: 'CLUBE ANTIGO', organizationId: null, submittedAt: hoursAgo(480), firstSubmittedAt: hoursAgo(480), approvedAt: null, provisionedAt: null, provisioningError: null, pendingSince: null },
      { id: 'p-6', code: 'ANN-2609-FFFFF', status: 'pending_info', name: 'ESPERANÇA', organizationId: null, submittedAt: hoursAgo(360), firstSubmittedAt: hoursAgo(360), approvedAt: null, provisionedAt: null, provisioningError: null, pendingSince: hoursAgo(6 * 24) },
    ],
  }
}

describe('holding — linha por inquilino, KPIs, séries e alertas', () => {
  const data = dataset()
  const rows = buildTenantRows(data)

  it('só operadores não cancelados; não gerenciado nunca é restringido', () => {
    expect(rows.map(r => r.row.slug)).toEqual(['mapcard2', 'mepcard', 'asserv'])
    const mep = rows.find(r => r.row.slug === 'mepcard')!.row
    expect(mep).toMatchObject({ managed: false, access: 'full', platformStatus: null, platformMrr: 0, memberLimit: 100, usagePct: 50 })
  })

  it('inquilino gerenciado inadimplente com excedente: nota, faixa e alertas', () => {
    const map = rows.find(r => r.row.slug === 'mapcard2')!.row
    expect(map).toMatchObject({
      managed: true,
      platformStatus: 'restricted',
      access: 'read_only',
      lives: 1250,
      memberLimit: 1000,
      usagePct: 125,
      platformMrr: 1715, // 990 + 250 × 2,90
      platformOpenAmount: 990,
      platformDaysLate: 17,
      clubMrr: 150,
      gmvLast30: 1000,
      gmvPrev30: 2500,
      salesTrendPct: -60,
      newMembersLast30: 1,
      memberDelinquencyRate: 23.1,
      memberDelinquencyRatePrev: 50,
      // 100 − 30 (restrita) − 23 (inadimplência) − 25 (vendas −60%) = 22
      healthScore: 22,
      healthBand: 'risk',
    })
    expect(map.alerts).toEqual(['over_member_limit', 'platform_delinquency', 'member_delinquency_rising', 'sales_drop'])
  })

  it('KPIs consolidados (§0.5)', () => {
    const kpis = buildKpis(data, rows)
    expect(kpis).toEqual({
      platformMrr: 2205,
      legacyMrrEstimate: 490,
      platformReceivedThisMonth: 980,
      platformReceivedLastMonth: 990,
      gmvThisMonth: 1500,
      gmvLastMonth: 2500,
      gmvGrowthPct: -40,
      clubMrr: 220,
      totalLives: 1300,
      livesAddedThisMonth: 3,
      memberNetGrowthPct: 0,
      tenantsTotal: 3,
      tenantsManaged: 2,
      tenantsByAccess: { full: 2, read_only: 1, blocked: 0 },
      tenantsNewThisMonth: 1,
      tenantChurnRate: 0,
      memberChurnRate: 33.3,
      platformDelinquencyRate: 33.4,
      memberDelinquencyRate: 20,
      platformOverdueAmount: 990,
      memberOverdueAmount: 150,
      onboarding: { queue: 1, slaBreached: 1, awaitingPayment: 1, activatedThisMonth: 1, conversionRate90d: 16.7 },
    })
  })

  it('série mensal', () => {
    const [jul, aug, sep] = buildMonthlySeries(data, 3)
    expect(jul!.month).toBe('2026-07')
    expect(aug).toMatchObject({ month: '2026-08', platformBilled: 990, platformReceived: 990, gmv: 2500 })
    expect(sep).toEqual({
      month: '2026-09',
      platformBilled: 1970,
      platformReceived: 980,
      gmv: 1500,
      newTenants: 1,
      churnedTenants: 0,
      newMembers: 1,
      churnedMembers: 1,
      membersEnd: 3,
      tenantChurnRate: 0,
      memberChurnRate: 33.3,
    })
  })

  it('alertas de inquilino + fila de contratação, do mais grave ao mais leve', () => {
    const alerts = buildAlerts(data, rows)
    expect(alerts.map(a => `${a.kind}:${a.organizationId ?? a.proposalId}`)).toEqual([
      'platform_delinquency:org1',
      'provisioning_failed:p-3',
      'over_member_limit:org1',
      'sales_drop:org1',
      'onboarding_pending:p-1',
      'member_delinquency_rising:org1',
      'onboarding_awaiting_payment:p-2',
      'onboarding_pending:p-6',
    ])
    expect(alerts[0]).toMatchObject({ severity: 'critical', metric: 17, actionHref: '/admin/holding/org1', id: 'platform_delinquency:org1' })
    expect(alerts.find(a => a.proposalId === 'p-1')).toMatchObject({ severity: 'warning', metric: 60, actionHref: '/admin/compliance/p-1' })
  })
})
