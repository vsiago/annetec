import {
  CLUB_PLAN_LEGAL_NOTICE,
  checkClubPlanConsistency,
  createClubPlanInput,
  effectivePaymentMethods,
  quoteClubPlan,
  type ClubPaymentMethod,
  type ClubPlan,
  type FieldIssue,
} from '@annetec/contracts'
import { describe, expect, it } from 'vitest'
import { PLANOS_COMPLETOS, montarRegulamento } from '@/db/planos-completos'
import { AppError } from '@/http/errors'
import {
  assertCheckoutEligible,
  checkoutStartedMessage,
  firstChargeDescription,
} from '@/modules/club-billing/checkout-rules'
import { buildPlanStatsReport } from '@/modules/club-billing/plan-stats.service'

/** Planos completos do clube: preço (inclusos + adesão), elegibilidade do checkout, consistência e estatísticas. */

const TODAY = new Date('2026-09-27T15:00:00Z')
const ALL_METHODS: ClubPaymentMethod[] = ['pix', 'boleto', 'credit_card']
const SETTINGS = { enabledMethods: ALL_METHODS, suspendAfterDays: 15, cancelAfterDays: 60 }

function plano(name: string): ClubPlan {
  const seed = PLANOS_COMPLETOS.find(p => p.name === name)
  if (!seed) throw new Error(`Plano ${name} não está no seed`)
  const input = createClubPlanInput.parse({ ...seed, terms: montarRegulamento(seed, 'MapCard2', SETTINGS) })
  return { ...input, id: '6f1c2b1e-1111-4222-8333-000000000001', tenantId: '6f1c2b1e-1111-4222-8333-000000000002' }
}

const holder = (birthDate = '1988-04-10') => ({
  name: 'Maria Teste',
  cpf: '52998224725',
  email: 'qa-teste@clube.mapcard2.test',
  phone: '11987654321',
  birthDate,
})

type Dependent = { name: string; birthDate: string; relationship: 'conjuge' | 'filho' | 'enteado' | 'pai_mae' | 'irmao' }
const dep = (relationship: Dependent['relationship'], birthDate: string): Dependent => ({
  name: `Dependente ${relationship}`,
  birthDate,
  relationship,
})

function rejection(run: () => unknown): { status: number; message: string; issues: FieldIssue[] } {
  try {
    run()
  } catch (error) {
    if (error instanceof AppError) return { status: error.status, message: error.message, issues: error.issues ?? [] }
    throw error
  }
  throw new Error('era para rejeitar')
}

describe('quoteClubPlan — mensalidade, inclusos e adesão', () => {
  it('plano legado (sem campos novos) cobra todo dependente e a 1ª cobrança = mensalidade', () => {
    const quote = quoteClubPlan({ priceMonthly: 49.9, priceDependentMonthly: 14.9, maxDependents: 3 }, 2)
    expect(quote).toMatchObject({
      basePrice: 49.9,
      dependentsTotal: 29.8,
      total: 79.7,
      includedDependents: 0,
      chargedDependents: 2,
      enrollmentFee: 0,
      enrollmentFeeListPrice: 0,
      enrollmentFeeWaived: false,
      firstChargeTotal: 79.7,
      withinLimit: true,
    })
  })

  it('Essencial + 2 dependentes = R$ 59,70/mês, sem adesão', () => {
    const quote = quoteClubPlan(plano('Essencial'), 2)
    expect(quote.total).toBe(59.7)
    expect(quote.firstChargeTotal).toBe(59.7)
  })

  it('Plus: 1 dependente incluso; com 2 = R$ 69,80 e adesão isenta', () => {
    expect(quoteClubPlan(plano('Plus'), 1).total).toBe(49.9)
    const quote = quoteClubPlan(plano('Plus'), 2)
    expect(quote).toMatchObject({
      total: 69.8,
      includedDependents: 1,
      chargedDependents: 1,
      enrollmentFeeListPrice: 29.9,
      enrollmentFeeWaived: true,
      enrollmentFee: 0,
      firstChargeTotal: 69.8,
    })
  })

  it('Família + 3 dependentes: mensalidade R$ 79,90 e 1ª cobrança R$ 129,80 (com adesão)', () => {
    const quote = quoteClubPlan(plano('Família'), 3)
    expect(quote).toMatchObject({ total: 79.9, chargedDependents: 0, enrollmentFee: 49.9, firstChargeTotal: 129.8 })
  })

  it('sem a isenção, a adesão entra na 1ª cobrança', () => {
    const quote = quoteClubPlan({ ...plano('Plus'), enrollmentFeeWaived: false }, 2)
    expect(quote.enrollmentFee).toBe(29.9)
    expect(quote.firstChargeTotal).toBe(99.7)
    expect(quote.total).toBe(69.8)
  })
})

describe('assertCheckoutEligible — regras do plano no checkout', () => {
  it('Família com 3 dependentes elegíveis devolve a cotação oficial', () => {
    const quote = assertCheckoutEligible(
      plano('Família'),
      {
        holder: holder(),
        dependents: [dep('conjuge', '1990-02-01'), dep('filho', '2012-05-20'), dep('pai_mae', '1955-07-15')],
        payment: { method: 'pix' },
      },
      ALL_METHODS,
      TODAY,
    )
    expect(quote.total).toBe(79.9)
    expect(quote.firstChargeTotal).toBe(129.8)
  })

  it('Essencial com boleto → 422 em payment.method (só Pix e cartão)', () => {
    const error = rejection(() =>
      assertCheckoutEligible(plano('Essencial'), { holder: holder(), dependents: [], payment: { method: 'boleto' } }, ALL_METHODS, TODAY),
    )
    expect(error.status).toBe(422)
    expect(error.issues).toEqual([
      { path: 'payment.method', message: 'Boleto não está disponível para este plano. Use: Pix, Cartão de crédito' },
    ])
    expect(error.message).toBe(error.issues[0]!.message)
  })

  it('método desligado no clube também é recusado, mesmo aceito pelo plano', () => {
    const error = rejection(() =>
      assertCheckoutEligible(plano('Família'), { holder: holder(), dependents: [], payment: { method: 'credit_card' } }, ['pix'], TODAY),
    )
    expect(error.status).toBe(422)
    expect(error.issues[0]).toEqual({ path: 'payment.method', message: 'Cartão de crédito não está disponível para este plano. Use: Pix' })
  })

  it('filho acima da idade máxima → 422 no birthDate do dependente', () => {
    const error = rejection(() =>
      assertCheckoutEligible(
        plano('Família'),
        { holder: holder(), dependents: [dep('conjuge', '1990-02-01'), dep('filho', '2000-01-15')], payment: { method: 'pix' } },
        ALL_METHODS,
        TODAY,
      ),
    )
    expect(error.status).toBe(422)
    expect(error.issues).toEqual([{ path: 'dependents.1.birthDate', message: 'Filho(a): aceito só até 24 anos neste plano' }])
  })

  it('titular acima da idade máxima do plano → holder.birthDate', () => {
    const error = rejection(() =>
      assertCheckoutEligible(plano('Família'), { holder: holder('1950-06-01'), dependents: [], payment: { method: 'pix' } }, ALL_METHODS, TODAY),
    )
    expect(error.issues).toEqual([{ path: 'holder.birthDate', message: 'Este plano aceita titulares de até 70 anos' }])
  })

  it('parentesco fora das regras → dependents.N.relationship com os aceitos', () => {
    const error = rejection(() =>
      assertCheckoutEligible(
        plano('Plus'),
        { holder: holder(), dependents: [dep('irmao', '1995-01-01')], payment: { method: 'pix' } },
        ALL_METHODS,
        TODAY,
      ),
    )
    expect(error.issues).toEqual([
      {
        path: 'dependents.0.relationship',
        message: 'Irmão(ã) não é aceito como dependente neste plano. Aceitos: Cônjuge/Companheiro(a), Filho(a), Enteado(a)',
      },
    ])
  })

  it('acima do teto de dependentes → path dependents', () => {
    const error = rejection(() =>
      assertCheckoutEligible(
        plano('Essencial'),
        {
          holder: holder(),
          dependents: [dep('conjuge', '1990-01-01'), dep('filho', '2015-01-01'), dep('filho', '2016-01-01')],
          payment: { method: 'pix' },
        },
        ALL_METHODS,
        TODAY,
      ),
    )
    expect(error.issues).toEqual([{ path: 'dependents', message: 'Este plano aceita até 2 dependentes' }])
  })

  it('descrição e evento da 1ª cobrança citam a adesão só quando cobrada', () => {
    const familia = quoteClubPlan(plano('Família'), 3)
    const plus = quoteClubPlan(plano('Plus'), 2)
    expect(firstChargeDescription('MapCard2', 'Família', 'setembro/2026', familia)).toBe('MapCard2 · Plano Família · setembro/2026 + adesão')
    expect(firstChargeDescription('MapCard2', 'Plus', 'setembro/2026', plus)).toBe('MapCard2 · Plano Plus · setembro/2026')
    // `formatBRL` separa "R$" do valor com espaço não quebrável.
    expect(checkoutStartedMessage('Família', familia, 'pix')).toMatch(/adesão R\$\s49,90 \(1ª cobrança R\$\s129,80\)/)
    expect(checkoutStartedMessage('Plus', plus, 'pix')).toContain('isenta')
  })
})

describe('effectivePaymentMethods — clube ∩ plano', () => {
  it('Essencial aceita só Pix e cartão; Plus/Família seguem o clube', () => {
    expect(effectivePaymentMethods(plano('Essencial'), ALL_METHODS)).toEqual(['pix', 'credit_card'])
    expect(effectivePaymentMethods(plano('Plus'), ['pix', 'boleto'])).toEqual(['pix', 'boleto'])
    expect(effectivePaymentMethods(plano('Essencial'), ['boleto'])).toEqual([])
  })
})

describe('planos do seed e consistência', () => {
  it.each(['Essencial', 'Plus', 'Família'])('%s passa no schema e na consistência, com regulamento completo', name => {
    const plan = plano(name)
    expect(checkClubPlanConsistency(plan)).toEqual([])
    expect(plan.coverages!.length).toBeGreaterThan(0)
    expect(plan.terms).toContain(`REGULAMENTO DO PLANO ${name.toUpperCase()} — MapCard2`)
    expect(plan.terms).toContain(CLUB_PLAN_LEGAL_NOTICE)
    expect(plan.terms).toContain('suspensa e, após 60 dias, cancelada')
  })

  it('ordem de exibição Essencial → Plus → Família', () => {
    expect(PLANOS_COMPLETOS.map(p => [p.name, p.sortOrder])).toEqual([
      ['Essencial', 1],
      ['Plus', 2],
      ['Família', 3],
    ])
  })

  it('regras entre campos devolvem o path do formulário', () => {
    expect(checkClubPlanConsistency({ ...plano('Plus'), includedDependents: 4 }).map(i => i.path)).toEqual(['includedDependents'])
    expect(checkClubPlanConsistency({ holderMinAge: 30, holderMaxAge: 25 }).map(i => i.path)).toEqual(['holderMaxAge'])
    const [coverage] = plano('Plus').coverages!
    expect(
      checkClubPlanConsistency({ coverages: [{ ...coverage!, kind: 'copay', value: null }] }).map(i => i.path),
    ).toEqual(['coverages.0.value'])
  })
})

describe('buildPlanStatsReport — pessoas por plano', () => {
  const plans = [
    { id: '6f1c2b1e-1111-4222-8333-00000000000b', name: 'Plus', sortOrder: 2, highlight: true, priceMonthly: 49.9 },
    { id: '6f1c2b1e-1111-4222-8333-00000000000a', name: 'Essencial', sortOrder: 1, highlight: false, priceMonthly: 29.9 },
    { id: '6f1c2b1e-1111-4222-8333-00000000000c', name: 'Família', sortOrder: 3, highlight: false, priceMonthly: 79.9 },
  ]

  it('junta as agregações, zera plano sem assinatura, acrescenta "Sem plano" e soma os totais', () => {
    const report = buildPlanStatsReport(
      {
        plans,
        subscriptions: [
          { plan_id: plans[0]!.id, active: 19, past_due: 1, suspended: 0, canceled: 1, pending_payment: 2, mrr: '1072.50' },
          { plan_id: plans[1]!.id, active: 2, past_due: 0, suspended: 1, canceled: 0, pending_payment: 0, mrr: '79.60' },
          { plan_id: null, active: 1, past_due: 0, suspended: 0, canceled: 0, pending_payment: 0, mrr: '19.90' },
        ],
        dependents: [
          { plan_id: plans[0]!.id, total: 6 },
          { plan_id: null, total: 2 },
        ],
        overdue: [{ plan_id: plans[1]!.id, amount: '29.90' }],
      },
      TODAY,
    )

    expect(report.plans.map(p => p.planName)).toEqual(['Essencial', 'Plus', 'Família', 'Sem plano'])
    expect(report.plans[1]).toMatchObject({ holders: 20, dependents: 6, lives: 26, pastDue: 1, canceled: 1, pendingPayment: 2, mrr: 1072.5 })
    expect(report.plans[0]).toMatchObject({ holders: 2, suspended: 1, overdueAmount: 29.9, lives: 2 })
    expect(report.plans[2]).toMatchObject({ planId: plans[2]!.id, holders: 0, lives: 0, mrr: 0 })
    expect(report.plans[3]).toMatchObject({ planId: null, holders: 1, dependents: 2, lives: 3 })
    expect(report.totals).toMatchObject({ holders: 23, dependents: 8, lives: 31, mrr: 1172, overdueAmount: 29.9, canceled: 1 })
    expect(report.generatedAt).toBe(TODAY.toISOString())
  })

  it('sem assinatura de plano excluído não há linha "Sem plano"', () => {
    const report = buildPlanStatsReport({ plans, subscriptions: [], dependents: [], overdue: [] }, TODAY)
    expect(report.plans).toHaveLength(3)
    expect(report.totals.lives).toBe(0)
  })
})

describe('AppError.notFound — concordância de gênero', () => {
  it.each([
    ['Assinatura', 'Assinatura não encontrada'],
    ['Cobrança', 'Cobrança não encontrada'],
    ['Plano do clube', 'Plano do clube não encontrado'],
    ['Inquilino', 'Inquilino não encontrado'],
  ])('%s', (resource, message) => {
    expect(AppError.notFound(resource).message).toBe(message)
  })
})
