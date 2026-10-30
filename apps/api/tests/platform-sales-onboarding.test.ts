import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Integração das vendas com a contratação e a cobrança (banco FALSO):
 *  - desconto aprovado no preço da COBRANÇA DE ATIVAÇÃO e no RETRATO da
 *    assinatura criada no provisionamento (adesão líquida + desconto da
 *    mensalidade com data de fim);
 *  - aprovação do compliance espera o pedido de desconto pendente;
 *  - `referralCode` no site: vendedor ativo vincula (e ganha o prospect);
 *    código desconhecido é ignorado sem quebrar a contratação;
 *  - a etapa do prospect acompanha a proposta (`transitionProposal`).
 */

const PROPOSAL = '0b6f6c2e-3f1a-4c55-9d0e-1a2b3c4d5e6f'
const PLAN = '55555555-5555-4555-8555-555555555555'

const state = vi.hoisted(() => ({
  inserts: [] as { table: string; values: Record<string, any> }[],
  updates: [] as { table: string; set: Record<string, any> }[],
  proposalRow: null as Record<string, any> | null,
  prospects: [] as { id: string; stage: string }[],
  basics: null as Record<string, any> | null,
  pendingDiscount: false,
}))

const OFFER = {
  id: PLAN,
  name: 'Profissional',
  priceMonthly: 697,
  memberLimit: 500,
  features: [],
  pricing: {
    planId: PLAN,
    setupFee: 990,
    pricePerExtraLife: 1.5,
    revenueSharePercent: 0,
    publicVisible: true,
    highlight: false,
    sortOrder: null,
    tagline: null,
    description: null,
  },
}

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createFakeDb, argOf } = await import('./helpers/fake-db')
  const tableName = (t: unknown) =>
    t === schema.platformCharges
      ? 'charges'
      : t === schema.platformSubscriptions
        ? 'subscriptions'
        : t === schema.platformOnboardingProposals
          ? 'proposals'
          : t === schema.platformProspects
            ? 'prospects'
            : t === schema.platformProspectInteractions
              ? 'interactions'
              : t === schema.platformDiscountRequests
                ? 'discount_requests'
                : 'other'
  const db = createFakeDb(call => {
    const name = tableName(call.table)
    if (call.kind === 'select') {
      if (name === 'prospects') return state.prospects
      if (name === 'charges') return []
      if (name === 'subscriptions') return [{ id: 'sub-existente' }]
      return []
    }
    if (call.kind === 'insert') {
      const values = argOf(call.ops, 'values') as Record<string, any>
      state.inserts.push({ table: name, values })
      if (name === 'charges') return [{ ...values, id: 'ch-ativacao', createdAt: new Date(), updatedAt: new Date() }]
      if (name === 'subscriptions') return [{ id: 'sub-nova' }]
      if (name === 'proposals') return [{ ...values, id: PROPOSAL, createdAt: new Date(), updatedAt: new Date() }]
      if (name === 'prospects') return [{ id: 'prospect-site' }]
      return []
    }
    if (call.kind === 'update') {
      const set = argOf(call.ops, 'set') as Record<string, any>
      state.updates.push({ table: name, set })
      if (name === 'proposals') return state.proposalRow ? [{ ...state.proposalRow, ...set }] : []
      if (name === 'prospects') return [{ id: state.prospects[0]?.id ?? 'x' }]
      return []
    }
    return []
  })
  return { db }
})

vi.mock('@/modules/platform-billing/charges.service', () => ({
  submitPlatformChargeToGateway: vi.fn(async (id: string) => ({ ...state.inserts.find(i => i.table === 'charges')!.values, id })),
  cancelPlatformAtGateway: vi.fn(),
  syncPlatformChargeIfStale: vi.fn(),
  canSimulatePlatformCharge: vi.fn(() => false),
}))
vi.mock('@/modules/platform-billing/events.service', () => ({ recordPlatformEvent: vi.fn(async () => {}), takeActivationCard: vi.fn(() => null) }))
vi.mock('@/modules/platform-billing/presenter', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/platform-billing/presenter')>()),
  toPlatformCharge: vi.fn((row: Record<string, unknown>) => ({ id: row.id, amount: Number(row.amount), items: row.items })),
}))
vi.mock('@/modules/platform-billing/pricing.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/platform-billing/pricing.service')>()),
  getPlanOffer: vi.fn(async () => OFFER),
}))
vi.mock('@/modules/platform-billing/queries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/platform-billing/queries')>()),
  proposalBasics: vi.fn(async () => state.basics),
  tenantRefOf: vi.fn(async () => null),
}))
vi.mock('@/modules/platform-billing/settings.service', () => ({
  loadPlatformSettings: vi.fn(async () => ({ boletoDueDays: 5 })),
  currentPlatformProvider: vi.fn(() => 'simulated'),
}))
vi.mock('@/modules/holding/cache', () => ({ invalidateHoldingCache: vi.fn() }))
vi.mock('@/http/middleware/platform-access', () => ({ invalidatePlatformAccessCache: vi.fn() }))
vi.mock('@/modules/platform-sales/prospect-sync', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/platform-sales/prospect-sync')>()),
  hasPendingDiscount: vi.fn(async () => state.pendingDiscount),
}))
vi.mock('@/modules/platform-sales/seller-profile', () => ({
  findActiveSellerByCode: vi.fn(async (code: string) =>
    code === 'joao-silva' ? { userId: 'seller-joao', name: 'João Silva', referralCode: 'joao-silva' } : null,
  ),
}))
vi.mock('@/integrations/cnpj', () => ({ lookupCnpj: vi.fn(async () => ({ found: false, unavailable: true, message: null, result: null })) }))
const notified = vi.hoisted(() => [] as string[])
vi.mock('@/modules/platform-onboarding/notify', () => ({
  notifyApplicant: vi.fn(async (_p: unknown, template: string) => {
    notified.push(template)
  }),
}))
vi.mock('@/modules/platform-onboarding/plans', () => ({ findPlanOffer: vi.fn(async () => OFFER) }))
vi.mock('@/modules/platform-onboarding/repository', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/platform-onboarding/repository')>()),
  cnpjIsTenant: vi.fn(async () => false),
  openProposalForCnpj: vi.fn(async () => null),
  insertEvent: vi.fn(async () => {}),
  getProposal: vi.fn(async () => state.proposalRow),
  loadBundle: vi.fn(async () => null),
}))

const { createActivationCharge, createPlatformSubscription } = await import('@/modules/platform-billing/activation')
const { approveProposal } = await import('@/modules/platform-onboarding/compliance.service')
const { startProposal } = await import('@/modules/platform-onboarding/service')
const { transitionProposal } = await import('@/modules/platform-onboarding/repository')
const { db } = await import('@/db/client')

const APPROVED = {
  requestId: 'req-1',
  setupFeePercent: 50,
  monthlyPercent: 20,
  monthlyMonths: 3,
  approvedAt: '2026-10-29T12:00:00.000Z',
  approvedByUserId: 'super-1',
  approvedByName: 'Superadmin',
}

beforeEach(() => {
  state.inserts = []
  state.updates = []
  state.proposalRow = null
  state.prospects = []
  state.pendingDiscount = false
  notified.length = 0
  state.basics = {
    id: PROPOSAL,
    code: 'ANN-2610-ABCDE',
    status: 'approved',
    cnpj: '11222333000181',
    legalName: 'CLUBE VIDA',
    tradeName: null,
    planId: PLAN,
    paymentMethod: 'pix',
    organizationId: null,
    applicant: { name: 'Mariana Costa Lima', email: 'mariana@clubevida.org', phone: '21999990000' },
    company: null,
    discount: APPROVED,
  }
})

describe('desconto aprovado no dinheiro', () => {
  it('cobrança de ativação: 990 − 495 (adesão) + 697 − 139,40 (1ª mensalidade) = R$ 1.052,60', async () => {
    await createActivationCharge(PROPOSAL)
    const charge = state.inserts.find(i => i.table === 'charges')!.values
    expect(charge.amount).toBe('1052.6')
    expect(charge.items.map((i: { kind: string; amount: number; appliesTo?: string }) => [i.kind, i.amount, i.appliesTo ?? null])).toEqual([
      ['setup_fee', 990, null],
      ['discount', -495, 'setup_fee'],
      ['plan_fee', 697, null],
      ['discount', -139.4, 'plan_fee'],
    ])
  })

  it('sem desconto: ativação cheia (R$ 1.687,00)', async () => {
    state.basics = { ...state.basics, discount: null }
    await createActivationCharge(PROPOSAL)
    expect(state.inserts.find(i => i.table === 'charges')!.values.amount).toBe('1687')
  })

  it('assinatura do provisionamento: adesão líquida no retrato e 20% na mensalidade até o fim do 3º período', async () => {
    await createPlatformSubscription({
      organizationId: 'org-1',
      proposalId: PROPOSAL,
      planId: PLAN,
      paymentMethod: 'pix',
      billing: { name: 'CLUBE VIDA', document: '11222333000181', email: 'fin@clubevida.org' },
      startDate: '2026-10-30',
      activationWaived: false,
      discount: { setupFeePercent: 50, monthlyPercent: 20, monthlyMonths: 3 },
    })
    const sub = state.inserts.find(i => i.table === 'subscriptions')!.values
    expect(sub).toMatchObject({
      planPriceMonthly: '697',
      setupFee: '495',
      monthlyDiscountPercent: '20',
      monthlyDiscountUntil: '2027-01-27',
      dueDay: 28,
      currentPeriodEnd: '2026-11-28',
    })
  })
})

describe('aprovação do compliance × pedido de desconto', () => {
  it('pedido pendente bloqueia a aprovação (o preço precisa estar decidido antes da ativação)', async () => {
    state.proposalRow = { id: PROPOSAL, status: 'in_review', sellerUserId: 'seller-joao' }
    state.pendingDiscount = true
    await expect(approveProposal(PROPOSAL, { override: false }, { userId: 'a1', name: 'Analista' })).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    })
    expect(state.updates).toEqual([])
  })
})

describe('código de indicação no site', () => {
  const input = (referralCode?: string) => ({
    contractorType: 'entidade' as const,
    legalForm: 'associacao' as const,
    cnpj: '11222333000181',
    planId: PLAN,
    expectedLives: 300,
    applicant: { name: 'Mariana Costa Lima', email: 'mariana@clubevida.org', phone: '21999990000' },
    acceptPrivacy: true as const,
    ...(referralCode !== undefined ? { referralCode } : {}),
  })

  it('vendedor ativo: proposta vinculada (vendedor + código) e prospect criado no funil dele', async () => {
    await startProposal(input('joao-silva'), { ip: null, userAgent: null }).catch(() => null)
    const proposal = state.inserts.find(i => i.table === 'proposals')!.values
    expect(proposal).toMatchObject({ source: 'site', sellerUserId: 'seller-joao', referralCode: 'joao-silva' })
    const prospect = state.inserts.find(i => i.table === 'prospects')!.values
    expect(prospect).toMatchObject({ sellerUserId: 'seller-joao', origin: 'site', stage: 'em_contratacao', proposalId: PROPOSAL })
    expect(notified).toEqual(['onboarding_started'])
  })

  it('código desconhecido/inativo: ignorado, a contratação segue sem vendedor', async () => {
    await startProposal(input('nao-existe'), { ip: null, userAgent: null }).catch(() => null)
    const proposal = state.inserts.find(i => i.table === 'proposals')!.values
    expect(proposal).toMatchObject({ sellerUserId: null, referralCode: null })
    expect(state.inserts.some(i => i.table === 'prospects')).toBe(false)
  })
})

describe('etapa do prospect acompanha a proposta', () => {
  it('proposta do vendedor no ar → prospect ganho (com registro automático)', async () => {
    state.proposalRow = { id: PROPOSAL, status: 'provisioning', sellerUserId: 'seller-joao' }
    state.prospects = [{ id: 'pr-1', stage: 'em_aprovacao' }]
    await transitionProposal(db as never, PROPOSAL, ['provisioning'], { status: 'active' })
    const update = state.updates.find(u => u.table === 'prospects')
    expect(update?.set).toMatchObject({ stage: 'ganho' })
    expect(update?.set.wonAt).toBeInstanceOf(Date)
    expect(state.inserts.find(i => i.table === 'interactions')?.values.kind).toBe('sistema')
  })

  it('reprovada → perdido com o motivo; encerrada cancela pedido de desconto pendente', async () => {
    state.proposalRow = { id: PROPOSAL, status: 'in_review', sellerUserId: 'seller-joao' }
    state.prospects = [{ id: 'pr-1', stage: 'em_aprovacao' }]
    await transitionProposal(db as never, PROPOSAL, ['in_review'], { status: 'rejected', rejectionReason: 'CNPJ baixado na Receita' })
    expect(state.updates.find(u => u.table === 'prospects')?.set).toMatchObject({
      stage: 'perdido',
      lostReason: 'Proposta reprovada na análise: CNPJ baixado na Receita',
    })
    expect(state.updates.find(u => u.table === 'discount_requests')?.set).toMatchObject({ status: 'canceled' })
  })

  it('proposta sem vendedor, ou mudança sem status: nada a sincronizar', async () => {
    state.proposalRow = { id: PROPOSAL, status: 'in_review', sellerUserId: null }
    state.prospects = [{ id: 'pr-1', stage: 'em_aprovacao' }]
    await transitionProposal(db as never, PROPOSAL, ['in_review'], { status: 'approved' })
    state.proposalRow = { id: PROPOSAL, status: 'draft', sellerUserId: 'seller-joao' }
    await transitionProposal(db as never, PROPOSAL, ['draft'], { expectedLives: 10 })
    expect(state.updates.filter(u => u.table === 'prospects')).toEqual([])
  })
})
