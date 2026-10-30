import {
  activationChargeItems,
  chargeSetupFeeTotal,
  commissionPercentForInstallment,
  monthlyDiscountPercentFor,
  prospectStageForProposalStatus,
  quotePlatformPlan,
  referralCodeFromName,
  sumChargeItems,
} from '@annetec/contracts'
import { describe, expect, it } from 'vitest'
import { buildMonthlyCharge, monthlyDiscountUntilFor, platformCyclePeriod } from '@/modules/platform-billing/automation.rules'
import { discountColumns } from '@/modules/platform-billing/activation'
import { addMonthsOnDueDay, dueDayOf } from '@/modules/club-billing/dates'
import {
  approvedDiscount,
  buildCommissionDrafts,
  commissionParts,
  describeDiscount,
  prospectSyncPatch,
  requestedDiscount,
  reversedCommissionStatus,
  sellerLinkStatusOf,
} from '@/modules/platform-sales/rules'

/**
 * Regras puras das vendas da plataforma com o plano Profissional
 * (R$ 697/mês, adesão R$ 990): desconto na cotação, na ativação e nas
 * mensalidades por N meses; comissão (50/20/10 + 50% da adesão) separando
 * adesão e 1ª mensalidade na ativação; etapa do prospect × proposta.
 */

const PROFISSIONAL = { name: 'Profissional', priceMonthly: 697, memberLimit: 500 }
const PRICING = { setupFee: 990, pricePerExtraLife: 1.5, revenueSharePercent: 0 }
const DISCOUNT = { setupFeePercent: 50, monthlyPercent: 20, monthlyMonths: 3 }
const SETTINGS = { monthlySchedule: [50, 20, 10], setupFeePercent: 50 }

describe('desconto aprovado no preço', () => {
  it('cotação: adesão e mensalidade com desconto; ativação = 990 − 495 + 697 − 139,40', () => {
    const quote = quotePlatformPlan(PROFISSIONAL, PRICING, 300, { discount: DISCOUNT })
    expect(quote.setupFeeDiscount).toBe(495)
    expect(quote.planFeeDiscount).toBe(139.4)
    expect(quote.monthlyTotal).toBe(557.6)
    expect(quote.activationTotal).toBe(1052.6)
    // Sem desconto continua igual a antes.
    const plain = quotePlatformPlan(PROFISSIONAL, PRICING, 300)
    expect(plain.activationTotal).toBe(1687)
    expect(plain.monthlyTotal).toBe(697)
    expect(plain.setupFeeDiscount).toBe(0)
  })

  it('cobrança de ativação: linhas de desconto negativas, cada uma com a parte que abate', () => {
    const items = activationChargeItems(PROFISSIONAL, PRICING, DISCOUNT)
    expect(items.map(i => [i.kind, i.amount, i.appliesTo ?? null])).toEqual([
      ['setup_fee', 990, null],
      ['discount', -495, 'setup_fee'],
      ['plan_fee', 697, null],
      ['discount', -139.4, 'plan_fee'],
    ])
    expect(sumChargeItems(items)).toBe(1052.6)
    expect(chargeSetupFeeTotal(items)).toBe(495)
  })

  it('isenção total da adesão (100%) zera a parte de adesão', () => {
    const items = activationChargeItems(PROFISSIONAL, PRICING, { setupFeePercent: 100, monthlyPercent: 0 })
    expect(items.find(i => i.kind === 'discount')?.description).toBe('Isenção da adesão')
    expect(sumChargeItems(items)).toBe(697)
    expect(chargeSetupFeeTotal(items)).toBe(0)
  })

  it('mensalidade nunca passa de 50% de desconto, mesmo se pedirem mais', () => {
    expect(quotePlatformPlan(PROFISSIONAL, PRICING, 1, { discount: { monthlyPercent: 80 } }).planFeeDiscount).toBe(348.5)
  })

  it('retrato da assinatura: adesão líquida + 20% na mensalidade até o fim do 3º período', () => {
    const start = '2026-10-30'
    const columns = discountColumns(990, DISCOUNT, start, dueDayOf(start))
    expect(columns).toEqual({ setupFee: '495', monthlyDiscountPercent: '20', monthlyDiscountUntil: '2027-01-27' })
    expect(discountColumns(990, null, start, 28)).toEqual({})
    expect(discountColumns(990, { setupFeePercent: 0, monthlyPercent: 10, monthlyMonths: null }, start, 28)).toEqual({
      setupFee: '990',
      monthlyDiscountPercent: '10',
      monthlyDiscountUntil: null,
    })
  })

  it('geração das faturas: desconto na 2ª e 3ª mensalidades; a 4ª volta ao preço cheio', () => {
    const start = '2026-10-30'
    const dueDay = dueDayOf(start)
    const until = monthlyDiscountUntilFor(start, 3, dueDay)
    const sub = {
      planName: 'Profissional',
      planPriceMonthly: 697,
      memberLimit: 500,
      pricePerExtraLife: 1.5,
      revenueSharePercent: 0,
      monthlyDiscount: { percent: 20, until },
    }
    // A 1ª mensalidade vai na ativação; o ciclo começa no fim do 1º período.
    let next = addMonthsOnDueDay(start, 1, dueDay)
    const amounts: number[] = []
    for (let i = 0; i < 4; i++) {
      const { periodStart, periodEnd } = platformCyclePeriod(next, dueDay)
      amounts.push(buildMonthlyCharge(sub, { lives: 300, clubRevenue: 0, periodStart }).amount)
      next = periodEnd
    }
    expect(amounts).toEqual([557.6, 557.6, 697, 697])
    // Permanente: vale para sempre.
    expect(monthlyDiscountPercentFor({ percent: 20, until: null }, '2031-01-28')).toBe(20)
    // Sem desconto: fatura igual a antes.
    expect(buildMonthlyCharge({ ...sub, monthlyDiscount: null }, { lives: 300, clubRevenue: 0, periodStart: '2026-11-28' }).amount).toBe(697)
  })

  it('pedido e aprovação: ajuste do superadmin vence o pedido; zerado não é aprovação', () => {
    const requested = requestedDiscount({ setupFeePercent: 50, monthlyPercent: 20, monthlyMonths: 3 })
    expect(approvedDiscount(requested, {})).toEqual(requested)
    expect(approvedDiscount(requested, { monthlyPercent: 10, monthlyMonths: null })).toEqual({
      setupFeePercent: 50,
      monthlyPercent: 10,
      monthlyMonths: null,
    })
    expect(approvedDiscount(requested, { setupFeePercent: 0, monthlyPercent: 0 })).toBeNull()
    expect(describeDiscount({ setupFeePercent: 100, monthlyPercent: 20, monthlyMonths: 3 })).toBe('isenção da adesão · mensalidade 20% por 3 meses')
    // Sem mensalidade, o prazo some.
    expect(requestedDiscount({ setupFeePercent: 30, monthlyPercent: 0, monthlyMonths: 6 }).monthlyMonths).toBeNull()
  })
})

describe('comissão do vendedor', () => {
  const activation = (items = activationChargeItems(PROFISSIONAL, PRICING, DISCOUNT)) => ({
    kind: 'activation' as const,
    amount: sumChargeItems(items),
    paidAmount: sumChargeItems(items),
    items,
  })
  const monthly = (amount: number, paid: number | null = amount) => ({
    kind: 'monthly' as const,
    amount,
    paidAmount: paid,
    items: [{ kind: 'plan_fee' as const, amount }],
  })

  it('ativação com desconto: adesão (495 × 50%) e 1ª mensalidade (557,60 × 50%) em lançamentos separados', () => {
    expect(commissionParts(activation())).toEqual({ setupFee: 495, monthly: 557.6 })
    expect(buildCommissionDrafts(activation(), 1, SETTINGS)).toEqual([
      { kind: 'setup_fee', installment: null, baseAmount: 495, percent: 50, amount: 247.5 },
      { kind: 'monthly', installment: 1, baseAmount: 557.6, percent: 50, amount: 278.8 },
    ])
  })

  it('ativação sem desconto: 990 × 50% + 697 × 50%', () => {
    const drafts = buildCommissionDrafts(activation(activationChargeItems(PROFISSIONAL, PRICING)), 1, SETTINGS)
    expect(drafts.map(d => [d.kind, d.baseAmount, d.amount])).toEqual([
      ['setup_fee', 990, 495],
      ['monthly', 697, 348.5],
    ])
  })

  it('2ª e 3ª mensalidades pela escala; 4ª (acima da escala) não gera', () => {
    expect(buildCommissionDrafts(monthly(557.6), 2, SETTINGS)).toEqual([
      { kind: 'monthly', installment: 2, baseAmount: 557.6, percent: 20, amount: 111.52 },
    ])
    expect(buildCommissionDrafts(monthly(557.6), 3, SETTINGS)[0]?.amount).toBe(55.76)
    expect(buildCommissionDrafts(monthly(697), 4, SETTINGS)).toEqual([])
    expect(commissionPercentForInstallment([50, 20, 10], 4)).toBeNull()
    expect(commissionPercentForInstallment([50, 0, 10], 2)).toBeNull()
  })

  it('base = valor efetivamente pago, sem multa/juros (limitado ao total)', () => {
    expect(commissionParts(monthly(697, 720))).toEqual({ setupFee: 0, monthly: 697 })
    expect(commissionParts(monthly(697, 348.5))).toEqual({ setupFee: 0, monthly: 348.5 })
    // Ativação paga a menor reparte na proporção.
    expect(commissionParts({ ...activation(), paidAmount: 526.3 })).toEqual({ setupFee: 247.5, monthly: 278.8 })
  })

  it('fatura avulsa (ajuste) não gera comissão', () => {
    expect(buildCommissionDrafts({ kind: 'adjustment', amount: 300, paidAmount: 300, items: [{ kind: 'adjustment', amount: 300 }] }, 1, SETTINGS)).toEqual([])
  })

  it('estorno: não repassada → cancelada; repassada → a descontar', () => {
    expect(reversedCommissionStatus('a_pagar')).toBe('cancelada')
    expect(reversedCommissionStatus('prevista')).toBe('cancelada')
    expect(reversedCommissionStatus('paga')).toBe('a_descontar')
    expect(reversedCommissionStatus('cancelada')).toBeNull()
  })
})

describe('funil × proposta', () => {
  const now = new Date('2026-10-30T15:00:00Z')

  it('mapa de etapas da sincronização automática', () => {
    expect(prospectStageForProposalStatus('draft')).toBe('em_contratacao')
    expect(prospectStageForProposalStatus('submitted')).toBe('em_aprovacao')
    expect(prospectStageForProposalStatus('in_review')).toBe('em_aprovacao')
    expect(prospectStageForProposalStatus('awaiting_payment')).toBe('em_aprovacao')
    expect(prospectStageForProposalStatus('active')).toBe('ganho')
    expect(prospectStageForProposalStatus('rejected')).toBe('perdido')
    expect(prospectStageForProposalStatus('canceled')).toBe('perdido')
  })

  it('patch: ganho carimba wonAt; reprovada vira perdido com o motivo; mesma etapa = nada', () => {
    expect(prospectSyncPatch({ stage: 'em_aprovacao' }, { status: 'active' }, now)).toMatchObject({ stage: 'ganho', wonAt: now })
    expect(prospectSyncPatch({ stage: 'em_aprovacao' }, { status: 'rejected', rejectionReason: 'CNPJ baixado' }, now)).toMatchObject({
      stage: 'perdido',
      lostAt: now,
      lostReason: 'Proposta reprovada na análise: CNPJ baixado',
    })
    expect(prospectSyncPatch({ stage: 'em_aprovacao' }, { status: 'in_review' }, now)).toBeNull()
  })

  it('situação do link para o vendedor', () => {
    expect(sellerLinkStatusOf({ source: 'console', inviteSentAt: null }, true)).toBe('awaiting_discount_approval')
    expect(sellerLinkStatusOf({ source: 'console', inviteSentAt: null }, false)).toBe('not_sent')
    expect(sellerLinkStatusOf({ source: 'console', inviteSentAt: now }, false)).toBe('sent')
    expect(sellerLinkStatusOf({ source: 'site', inviteSentAt: null }, false)).toBe('site')
  })

  it('código de indicação a partir do nome', () => {
    expect(referralCodeFromName('João da Silva')).toBe('joao-da-silva')
    expect(referralCodeFromName('Zé')).toBe('vendedor-ze')
  })
})
