import {
  activationChargeItems,
  formatBRL,
  effectivePlatformAccess,
  platformDelinquencyAction,
  prorationItem,
  quotePlatformPlan,
  type PlatformSubscriptionStatus,
} from '@annetec/contracts'
import { describe, expect, it } from 'vitest'
import { addDays } from '@/modules/club-billing/dates'
import {
  isValidPlatformChargeAccessKey,
  parsePlatformReference,
  platformChargeAccessKey,
  platformInvoiceUrl,
  platformReference,
} from '@/modules/platform-billing/access-key'
import {
  buildMonthlyCharge,
  clubRevenueWindow,
  dunningDates,
  isPlatformCardRetryDue,
  isPlatformReminderDue,
  nextPlatformCycleStart,
  platformCyclePeriod,
  shiftDateBack,
  shiftInstantBack,
  shouldGeneratePlatformCycle,
  shouldMarkPlatformOverdue,
} from '@/modules/platform-billing/automation.rules'
import { isPlatformPixExpired } from '@/modules/platform-billing/charges.service'
import { accessMessage } from '@/modules/platform-billing/subscriptions.service'
import { computePlatformBillingSummary } from '@/modules/platform-billing/summary.service'

/**
 * Regras PURAS da cobrança da plataforma (blueprint da plataforma §0.2/§0.4),
 * sempre com datas fixas — nenhuma conexão com banco.
 */

const SETTINGS = {
  generateDaysBefore: 10,
  reminderDaysBefore: 3,
  restrictAfterDays: 10,
  suspendAfterDays: 30,
  cancelAfterDays: 90,
  maxCardRetries: 3,
  cardRetryIntervalHours: 24,
}

describe('régua da plataforma — degraus pela fatura aberta mais antiga', () => {
  const today = '2026-09-27'
  it.each<[PlatformSubscriptionStatus, string, 'restrict' | 'suspend' | 'cancel' | null]>([
    ['past_due', '2026-09-18', null], // 9 dias
    ['past_due', '2026-09-17', 'restrict'], // 10 dias
    ['restricted', '2026-09-10', null], // 17 dias, já restrita
    ['restricted', '2026-08-28', 'suspend'], // 30 dias
    ['past_due', '2026-08-23', 'suspend'], // 35 dias: pula a restrição
    ['suspended', '2026-07-01', null], // 88 dias
    ['suspended', '2026-06-29', 'cancel'], // 90 dias
    ['past_due', '2026-06-01', 'cancel'], // cancelar tem precedência
    ['active', '2026-01-01', null],
    ['canceled', '2026-01-01', null],
  ])('%s com vencida em %s → %s', (status, oldest, expected) => {
    expect(platformDelinquencyAction(status, oldest, today, SETTINGS)).toBe(expected)
  })

  it('sem fatura aberta não há degrau', () => {
    expect(platformDelinquencyAction('past_due', null, today, SETTINGS)).toBeNull()
  })

  it('linha do tempo dia a dia: past_due em D+1, restricted em D+10, suspended em D+30, canceled em D+90', () => {
    const due = '2026-10-10'
    let status: PlatformSubscriptionStatus = 'active'
    let chargeStatus: 'pending' | 'overdue' = 'pending'
    const transitions: Record<string, string> = {}
    for (let offset = 0; offset <= 95; offset += 1) {
      const day = addDays(due, offset)
      if (shouldMarkPlatformOverdue({ method: 'pix', status: chargeStatus, dueDate: due, attempts: 0 }, day, SETTINGS)) {
        chargeStatus = 'overdue'
        if (status === 'active') {
          status = 'past_due'
          transitions.past_due = day
        }
      }
      const action = platformDelinquencyAction(status, due, day, SETTINGS)
      if (action === 'restrict') status = 'restricted'
      if (action === 'suspend') status = 'suspended'
      if (action === 'cancel') status = 'canceled'
      if (action) transitions[status] = day
    }
    expect(transitions).toEqual({
      past_due: '2026-10-11',
      restricted: '2026-10-20',
      suspended: '2026-11-09',
      canceled: '2027-01-08',
    })
  })

  it('datas dos próximos degraus', () => {
    expect(dunningDates('2026-09-20', SETTINGS)).toEqual({
      restrictsOn: '2026-09-30',
      suspendsOn: '2026-10-20',
      cancelsOn: '2026-12-19',
    })
    expect(dunningDates(null, SETTINGS)).toEqual({ restrictsOn: null, suspendsOn: null, cancelsOn: null })
  })

  it('acesso efetivo: override vigente vence a régua; vencido volta à régua', () => {
    const now = new Date('2026-09-27T12:00:00Z')
    expect(effectivePlatformAccess({ status: 'restricted', accessOverride: null, accessOverrideUntil: null }, now)).toEqual({
      level: 'read_only',
      source: 'billing',
    })
    expect(
      effectivePlatformAccess({ status: 'suspended', accessOverride: 'full', accessOverrideUntil: '2026-10-01T00:00:00Z' }, now),
    ).toEqual({ level: 'full', source: 'override' })
    expect(
      effectivePlatformAccess({ status: 'active', accessOverride: 'blocked', accessOverrideUntil: '2026-09-01T00:00:00Z' }, now),
    ).toEqual({ level: 'full', source: 'billing' })
    expect(effectivePlatformAccess({ status: 'canceled', accessOverride: null, accessOverrideUntil: null }, now).level).toBe('blocked')
  })
})

describe('automação — janelas e passos', () => {
  const today = '2026-09-27'
  it('gera o ciclo só dentro da janela e para assinaturas cobráveis', () => {
    expect(shouldGeneratePlatformCycle('active', '2026-10-07', today, SETTINGS)).toBe(true)
    expect(shouldGeneratePlatformCycle('active', '2026-10-08', today, SETTINGS)).toBe(false)
    expect(shouldGeneratePlatformCycle('restricted', '2026-09-01', today, SETTINGS)).toBe(true)
    expect(shouldGeneratePlatformCycle('suspended', '2026-09-01', today, SETTINGS)).toBe(false)
    expect(shouldGeneratePlatformCycle('canceled', '2026-09-01', today, SETTINGS)).toBe(false)
    expect(platformCyclePeriod('2026-10-10', 10)).toEqual({ periodStart: '2026-10-10', periodEnd: '2026-11-10', dueDate: '2026-10-10' })
  })

  it('lembrete: pendente, vence em [hoje, hoje+3], ainda não avisado', () => {
    expect(isPlatformReminderDue({ status: 'pending', dueDate: '2026-09-30', reminderSentAt: null }, today, SETTINGS)).toBe(true)
    expect(isPlatformReminderDue({ status: 'pending', dueDate: '2026-10-01', reminderSentAt: null }, today, SETTINGS)).toBe(false)
    expect(isPlatformReminderDue({ status: 'pending', dueDate: '2026-09-26', reminderSentAt: null }, today, SETTINGS)).toBe(false)
    expect(isPlatformReminderDue({ status: 'pending', dueDate: '2026-09-28', reminderSentAt: new Date() }, today, SETTINGS)).toBe(false)
  })

  it('vence: Pix/boleto no dia seguinte; cartão só sem tentativas', () => {
    expect(shouldMarkPlatformOverdue({ method: 'boleto', status: 'pending', dueDate: '2026-09-26', attempts: 0 }, today, SETTINGS)).toBe(true)
    expect(shouldMarkPlatformOverdue({ method: 'pix', status: 'pending', dueDate: '2026-09-27', attempts: 0 }, today, SETTINGS)).toBe(false)
    expect(shouldMarkPlatformOverdue({ method: 'credit_card', status: 'failed', dueDate: '2026-09-20', attempts: 2 }, today, SETTINGS)).toBe(false)
    expect(shouldMarkPlatformOverdue({ method: 'credit_card', status: 'failed', dueDate: '2026-09-20', attempts: 3 }, today, SETTINGS)).toBe(true)
  })

  it('cartão: tenta no vencimento e respeita o intervalo', () => {
    const now = new Date('2026-09-27T15:00:00Z')
    const base = { method: 'credit_card' as const, status: 'failed' as const, dueDate: '2026-09-26', attempts: 1, gatewayChargeId: null }
    expect(isPlatformCardRetryDue({ ...base, lastAttemptAt: new Date('2026-09-26T14:00:00Z') }, today, now, SETTINGS)).toBe(true)
    expect(isPlatformCardRetryDue({ ...base, lastAttemptAt: new Date('2026-09-27T10:00:00Z') }, today, now, SETTINGS)).toBe(false)
    expect(isPlatformCardRetryDue({ ...base, attempts: 3, lastAttemptAt: null }, today, now, SETTINGS)).toBe(false)
  })

  it('janela da receita do clube para o split: mês anterior ao período, em SP', () => {
    const w = clubRevenueWindow('2026-10-10')
    expect(w.from.toISOString()).toBe('2026-09-10T03:00:00.000Z')
    expect(w.to.toISOString()).toBe('2026-10-10T03:00:00.000Z')
  })

  it('"avançar dias" recua datas e instantes', () => {
    expect(shiftDateBack('2026-10-10', 25)).toBe('2026-09-15')
    expect(shiftDateBack(null, 5)).toBeNull()
    expect(shiftInstantBack(new Date('2026-10-10T12:00:00Z'), 10)?.toISOString()).toBe('2026-09-30T12:00:00.000Z')
  })
})

describe('fatura mensal — excedente por vida (mesma cotação da contratação)', () => {
  const sub = { planName: 'Pro', planPriceMonthly: 990, memberLimit: 1000, pricePerExtraLife: 2.9, revenueSharePercent: 0 }

  it('1.250 vidas, limite 1.000, R$ 2,90 → 250 × 2,90 = R$ 725,00', () => {
    const { items, amount } = buildMonthlyCharge(sub, { lives: 1250, clubRevenue: 0, periodStart: '2026-10-10' })
    expect(items).toEqual([
      { kind: 'plan_fee', description: 'Plano Pro — 10/2026', quantity: 1, unitPrice: 990, amount: 990 },
      { kind: 'overage', description: '250 vida(s) acima do limite de 1000', quantity: 250, unitPrice: 2.9, amount: 725 },
    ])
    expect(amount).toBe(1715)
    expect(quotePlatformPlan({ priceMonthly: 990, memberLimit: 1000 }, { setupFee: 0, pricePerExtraLife: 2.9, revenueSharePercent: 0 }, 1250).monthlyTotal).toBe(amount)
  })

  it('dentro do limite não há excedente', () => {
    const { items, amount } = buildMonthlyCharge(sub, { lives: 1000, clubRevenue: 0, periodStart: '2026-10-10' })
    expect(items.map(i => i.kind)).toEqual(['plan_fee'])
    expect(amount).toBe(990)
  })

  it('split só com percentual > 0; ajustes pendentes entram na fatura', () => {
    const noSplit = buildMonthlyCharge(sub, { lives: 10, clubRevenue: 50_000, periodStart: '2026-10-10' })
    expect(noSplit.items.some(i => i.kind === 'revenue_share')).toBe(false)
    const proration = prorationItem({
      oldPlanName: 'Essencial',
      newPlanName: 'Pro',
      oldPrice: 490,
      newPrice: 990,
      periodStart: '2026-09-10',
      periodEnd: '2026-10-10',
      changeDate: '2026-09-25',
    })
    expect(proration).toEqual({
      kind: 'proration',
      description: 'Upgrade Essencial → Pro: 15 de 30 dias',
      quantity: 1,
      unitPrice: 250,
      amount: 250,
    })
    const withSplit = buildMonthlyCharge(
      { ...sub, revenueSharePercent: 2 },
      { lives: 10, clubRevenue: 10_000, periodStart: '2026-10-10', adjustments: [proration!] },
    )
    expect(withSplit.items.map(i => [i.kind, i.amount])).toEqual([
      ['plan_fee', 990],
      ['revenue_share', 200],
      ['proration', 250],
    ])
    expect(withSplit.amount).toBe(1440)
  })

  it('ativação = adesão + 1ª mensalidade', () => {
    const items = activationChargeItems({ name: 'Pro', priceMonthly: 990 }, { setupFee: 990 })
    expect(items.map(i => [i.kind, i.amount])).toEqual([
      ['setup_fee', 990],
      ['plan_fee', 990],
    ])
  })
})

describe('chave da fatura pública e referência plt_', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e'

  it('referência ida e volta; uuid cru (cobrança do clube) não é da plataforma', () => {
    expect(platformReference(id)).toBe('plt_0f8fad5bd9cb469fa16570867728950e')
    expect(parsePlatformReference(platformReference(id))).toBe(id)
    expect(parsePlatformReference(id)).toBeNull()
    expect(parsePlatformReference('plt_123')).toBeNull()
    expect(parsePlatformReference(null)).toBeNull()
  })

  it('HMAC de 32 caracteres; chave errada ou de outra fatura é inválida', () => {
    const key = platformChargeAccessKey(id)
    expect(key).toHaveLength(32)
    expect(isValidPlatformChargeAccessKey(id, key)).toBe(true)
    expect(isValidPlatformChargeAccessKey(id, `${key.slice(0, 31)}x`)).toBe(false)
    expect(isValidPlatformChargeAccessKey('11111111-1111-4111-8111-111111111111', key)).toBe(false)
    expect(isValidPlatformChargeAccessKey(id, undefined)).toBe(false)
    expect(key).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  it('link público com a chave (e versão imprimível do boleto)', () => {
    expect(platformInvoiceUrl(id)).toMatch(new RegExp(`/fatura-annetec/${id}\\?chave=${platformChargeAccessKey(id)}$`))
    expect(platformInvoiceUrl(id, { print: true })).toMatch(/&imprimir=1$/)
  })
})

describe('resumo da cobrança da plataforma (§0.4)', () => {
  it('MRR, inadimplência, recebido/pendente do mês e série mensal', () => {
    const summary = computePlatformBillingSummary({
      today: '2026-09-27',
      subscriptions: [
        { status: 'active', startedAt: new Date('2026-09-05T15:00:00Z'), canceledAt: null, estimatedMonthly: 1715, lives: 1250, memberLimit: 1000 },
        { status: 'restricted', startedAt: new Date('2026-03-01T15:00:00Z'), canceledAt: null, estimatedMonthly: 500, lives: 10, memberLimit: 100 },
        { status: 'suspended', startedAt: new Date('2026-02-01T15:00:00Z'), canceledAt: null, estimatedMonthly: 300, lives: 0, memberLimit: 100 },
        { status: 'canceled', startedAt: new Date('2026-01-01T15:00:00Z'), canceledAt: new Date('2026-09-10T15:00:00Z'), estimatedMonthly: 900, lives: 50, memberLimit: 100 },
      ],
      charges: [
        { kind: 'monthly', status: 'overdue', amount: 500, paidAmount: null, dueDate: '2026-09-10', paidAt: null },
        { kind: 'activation', status: 'paid', amount: 1715, paidAmount: 1715, dueDate: '2026-09-10', paidAt: new Date('2026-09-08T15:00:00Z') },
        { kind: 'monthly', status: 'pending', amount: 300, paidAmount: null, dueDate: '2026-09-30', paidAt: null },
        { kind: 'monthly', status: 'canceled', amount: 999, paidAmount: null, dueDate: '2026-09-01', paidAt: null },
        { kind: 'monthly', status: 'overdue', amount: 200, paidAmount: null, dueDate: '2026-05-01', paidAt: null },
      ],
    })
    expect(summary.mrr).toBe(2215)
    expect(summary.forecastNextMonth).toBe(2215)
    expect(summary.overdueAmount).toBe(700)
    expect(summary.overdueCharges).toBe(2)
    // 700 ÷ (500 + 1715) × 100 — base só com vencimento em [hoje−90, hoje] e ≠ cancelada.
    expect(summary.delinquencyRate).toBe(31.6)
    expect(summary.receivedThisMonth).toBe(1715)
    expect(summary.activationRevenueThisMonth).toBe(1715)
    expect(summary.pendingThisMonth).toBe(300)
    expect(summary.newThisMonth).toBe(1)
    expect(summary.canceledThisMonth).toBe(1)
    expect(summary.totalLives).toBe(1260)
    expect(summary.extraLives).toBe(250)
    expect([summary.activeSubscriptions, summary.restrictedSubscriptions, summary.suspendedSubscriptions, summary.canceledSubscriptions]).toEqual([1, 1, 1, 1])
    expect(summary.monthly).toHaveLength(6)
    expect(summary.monthly.at(-1)).toEqual({ month: '2026-09', billed: 2515, received: 1715, overdue: 500 })
    expect(summary.monthly[1]).toEqual({ month: '2026-05', billed: 200, received: 0, overdue: 200 })
  })
})

describe('ciclo pré-pago: a mensalidade vence no 1º dia do período que paga', () => {
  it('due_day 10: período 10/10–10/11 vence em 10/10 (nunca antes do início)', () => {
    // O seed `demo:plataforma` rodado em 27/09 gravava "hoje + 4" (01/10) — bug do seed, não da regra.
    const start = nextPlatformCycleStart('2026-09-27', 10)
    expect(start).toBe('2026-10-10')
    expect(platformCyclePeriod(start, 10)).toEqual({ periodStart: '2026-10-10', periodEnd: '2026-11-10', dueDate: '2026-10-10' })
    expect(nextPlatformCycleStart('2026-10-09', 10)).toBe('2026-10-10')
    expect(nextPlatformCycleStart('2026-10-10', 10)).toBe('2026-11-10')
    expect(nextPlatformCycleStart('2026-12-15', 10)).toBe('2027-01-10')
  })
  it('vencimento = início do período em qualquer mês e dia (dia limitado a 28)', () => {
    for (const [start, day] of [['2026-01-28', 31], ['2026-02-05', 5], ['2026-12-20', 20]] as const) {
      const cycle = platformCyclePeriod(start, day)
      expect(cycle.dueDate).toBe(cycle.periodStart)
      expect(cycle.periodEnd > cycle.periodStart).toBe(true)
    }
  })
})

describe('frase do aviso de inadimplência — uma fonte só, sem repetição', () => {
  const base = { accessOverride: null, accessOverrideUntil: null, restrictedAt: null, suspendedAt: null, canceledAt: null }
  const aggregates = { openAmount: 499, overdueCount: 1, oldestOpenDueDate: '2026-10-01', oldestOverdueDueDate: '2026-10-01', oldestOpenChargeId: 'x' }
  const steps = { restrictsOn: '2026-10-11', suspendsOn: '2026-10-31' }
  const today = '2026-10-09'
  const now = new Date('2026-10-09T15:00:00Z')
  const once = (text: string, part: string) => text.split(part).length - 1
  // `formatBRL` usa espaço não separável depois do "R$".

  it('em atraso: valor, atraso e o próximo degrau, cada um uma vez', () => {
    const text = accessMessage({ ...base, status: 'past_due' }, aggregates, steps, today, now)!
    expect(text).toBe(`Fatura da plataforma vencida há 8 dia(s) (${formatBRL(499)} em aberto). Sem pagamento, o painel fica somente leitura em 11/10/2026.`)
    expect(once(text, 'R$')).toBe(1)
    expect(once(text, 'somente leitura')).toBe(1)
  })
  it('somente leitura e bloqueado também trazem tudo uma vez', () => {
    const restricted = accessMessage({ ...base, status: 'restricted' }, aggregates, steps, today, now)!
    expect(once(restricted, 'R$')).toBe(1)
    expect(once(restricted, 'bloqueado em 31/10/2026')).toBe(1)
    const suspended = accessMessage({ ...base, status: 'suspended', suspendedAt: now }, aggregates, steps, today, now)!
    expect(once(suspended, 'R$')).toBe(1)
    expect(once(suspended, 'dia(s) de atraso')).toBe(1)
  })
  it('override de bloqueio/leitura e cancelada informam o valor em aberto (a tela não acrescenta)', () => {
    const until = new Date('2026-10-20T15:00:00Z')
    expect(accessMessage({ ...base, status: 'past_due', accessOverride: 'blocked', accessOverrideUntil: until }, aggregates, steps, today, now)).toBe(
      `Painel bloqueado por decisão da operadora até 20/10/2026. Há ${formatBRL(499)} em aberto. Fale com a operadora para regularizar.`,
    )
    expect(accessMessage({ ...base, status: 'canceled', canceledAt: now }, { ...aggregates, openAmount: 0 }, steps, today, now)).toBe(
      'A assinatura da plataforma foi cancelada em 09/10/2026. Fale com a operadora para reativar.',
    )
  })
})

describe('Pix guardado expirado em fatura aberta', () => {
  const now = new Date('2026-10-09T15:00:00Z')
  const charge = { status: 'overdue' as const, method: 'pix' as const, pixPayload: '000201...', pixExpiresAt: new Date('2026-09-29T02:59:59Z') }
  it('aberta + Pix vencido = expirado; paga, boleto ou Pix ainda válido = não', () => {
    expect(isPlatformPixExpired(charge, now)).toBe(true)
    expect(isPlatformPixExpired({ ...charge, status: 'paid' }, now)).toBe(false)
    expect(isPlatformPixExpired({ ...charge, method: 'boleto' }, now)).toBe(false)
    expect(isPlatformPixExpired({ ...charge, pixExpiresAt: new Date('2027-01-01T00:00:00Z') }, now)).toBe(false)
    expect(isPlatformPixExpired({ ...charge, pixExpiresAt: null }, now)).toBe(false)
  })
})
