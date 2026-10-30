import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Link de contratação do vendedor (serviços REAIS de link, desconto e convite;
 * banco FALSO em memória):
 *  - sem desconto: proposta `console` atribuída ao vendedor (plano fora da
 *    vitrine aceito) e e-mail ao cliente NA HORA;
 *  - com desconto: e-mail RETIDO, pedido vai ao superadmin; aprovar aplica o
 *    desconto na proposta e solta o e-mail; recusar avisa o vendedor (sino) e
 *    o "enviar link" manda sem desconto;
 *  - o vendedor nunca recebe a URL com a chave.
 */

const JOAO = 'seller-joao'
const PROSPECT = '11111111-1111-4111-8111-111111111111'
const PLAN = '55555555-5555-4555-8555-555555555555'

const state = vi.hoisted(() => ({
  proposals: new Map<string, Record<string, any>>(),
  requests: new Map<string, Record<string, any>>(),
  prospectUpdates: [] as Record<string, unknown>[],
  interactions: [] as Record<string, any>[],
  emails: [] as { template: string; extra: Record<string, unknown> }[],
  bells: [] as Record<string, any>[],
  seq: 0,
}))

const PROFISSIONAL = {
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
    publicVisible: false,
    highlight: false,
    sortOrder: null,
    tagline: null,
    description: null,
  },
}

vi.mock('@/modules/platform-onboarding/plans', () => ({ findPlanOffer: vi.fn(async () => PROFISSIONAL) }))
vi.mock('@/integrations/cnpj', () => ({ lookupCnpj: vi.fn(async () => ({ found: false, unavailable: true, message: null, result: null })) }))
vi.mock('@/modules/platform-onboarding/notify', () => ({
  notifyApplicant: vi.fn(async (_proposal: unknown, template: string, extra: Record<string, unknown> = {}) => {
    state.emails.push({ template, extra })
  }),
}))
vi.mock('@/lib/notifications', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/notifications')>()),
  notify: vi.fn(async (input: Record<string, any>) => {
    state.bells.push(input)
    return 1
  }),
}))
vi.mock('@/modules/platform-onboarding/repository', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/platform-onboarding/repository')>()),
  getProposal: vi.fn(async (id: string) => state.proposals.get(id) ?? null),
  insertEvent: vi.fn(async () => {}),
}))
vi.mock('@/modules/platform-onboarding/service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/platform-onboarding/service')>()),
  assertCnpjAvailable: vi.fn(async () => {}),
  insertProposal: vi.fn(async (values: Record<string, unknown>) => {
    const id = `00000000-0000-4000-8000-00000000000${++state.seq}`
    const now = new Date('2026-10-30T12:00:00Z')
    const row = {
      id,
      code: `ANN-2610-0000${state.seq}`,
      tradeName: null,
      legalName: null,
      company: null,
      discount: null,
      inviteSentAt: null,
      organizationId: null,
      createdAt: now,
      updatedAt: now,
      ...values,
    }
    state.proposals.set(id, row)
    return row
  }),
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createFakeDb, argOf, whereValues } = await import('./helpers/fake-db')
  const prospectRow = () => ({
    id: PROSPECT,
    sellerUserId: JOAO,
    name: 'Clube Vida',
    cnpj: null,
    estimatedLives: null,
    stage: 'proposta_enviada',
    proposalId: null,
  })
  const db = createFakeDb(call => {
    const fields = (call.fields ?? {}) as Record<string, unknown>
    const values = whereValues(argOf(call.ops, 'where'))
    if (call.kind === 'select') {
      if (call.table === schema.platformProspects) {
        if ('prospect' in fields) return values.includes(PROSPECT) && values.includes(JOAO) ? [{ prospect: prospectRow(), sellerName: 'João Silva', planName: null, proposalCode: null, proposalStatus: null }] : []
        // prospects vinculados à proposta (convite / "minhas propostas")
        return [...state.proposals.values()].filter(p => values.includes(p.id)).map(p => ({ id: PROSPECT, proposalId: p.id, stage: 'proposta_enviada' }))
      }
      if (call.table === schema.platformDiscountRequests) {
        const rows = [...state.requests.values()].filter(r => values.includes(r.id) || values.includes(r.proposalId))
        if ('request' in fields) return rows.map(r => ({ request: r, proposal: state.proposals.get(r.proposalId), sellerName: 'João Silva', planName: 'Profissional' }))
        return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      }
      if (call.table === schema.user) return [{ name: 'João Silva' }]
      if (call.table === schema.tenantPlans) return [{ name: 'Profissional' }]
      return []
    }
    if (call.kind === 'insert') {
      const v = argOf(call.ops, 'values') as Record<string, any>
      if (call.table === schema.platformDiscountRequests) {
        const row = {
          id: `99999999-9999-4999-8999-00000000000${++state.seq}`,
          status: 'pending',
          approvedSetupFeePercent: null,
          approvedMonthlyPercent: null,
          approvedMonthlyMonths: null,
          decisionNote: null,
          rejectionReason: null,
          decidedByName: null,
          decidedAt: null,
          createdAt: new Date(Date.now() + state.seq),
          ...v,
        }
        state.requests.set(row.id, row)
        return [row]
      }
      if (call.table === schema.platformProspectInteractions) state.interactions.push(v)
      return []
    }
    if (call.kind === 'update') {
      const set = argOf(call.ops, 'set') as Record<string, any>
      if (call.table === schema.platformOnboardingProposals) {
        const row = [...state.proposals.values()].find(p => values.includes(p.id))
        if (!row) return []
        // `invite_sent_at` só na 1ª vez (where … is null)
        if ('inviteSentAt' in set && row.inviteSentAt) return []
        Object.assign(row, set)
        return [row]
      }
      if (call.table === schema.platformDiscountRequests) {
        const row = [...state.requests.values()].find(r => values.includes(r.id) && r.status === 'pending')
        if (!row) return []
        Object.assign(row, set)
        return [{ id: row.id }]
      }
      if (call.table === schema.platformProspects) state.prospectUpdates.push(set)
      return []
    }
    return []
  })
  return { db }
})

const { createSellerLink, sendSellerLink } = await import('@/modules/platform-sales/links.service')
const { approveDiscount, rejectDiscount } = await import('@/modules/platform-sales/discounts.service')

const SELLER = {
  userId: JOAO,
  name: 'João Silva',
  email: 'joao@annetec.com.br',
  phone: null,
  referralCode: 'joao-silva',
  active: true,
  accountActive: true,
  monthlyGoal: 3,
  referralUrl: 'http://web/contratar?ref=joao-silva',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}
const SUPER = { userId: 'super-1', name: 'Superadmin' }

const linkInput = (discount?: Record<string, unknown>) => ({
  legalForm: 'associacao' as const,
  cnpj: '11222333000181',
  planId: PLAN,
  expectedLives: 300,
  applicant: { name: 'Mariana Costa Lima', email: 'mariana@clubevida.org', phone: '21999990000' },
  ...(discount ? { discount: discount as never } : {}),
})

beforeEach(() => {
  state.proposals = new Map()
  state.requests = new Map()
  state.prospectUpdates = []
  state.interactions = []
  state.emails = []
  state.bells = []
  state.seq = 0
})

describe('link sem desconto', () => {
  it('cria a proposta do vendedor (plano fora da vitrine) e manda o e-mail na hora', async () => {
    const result = await createSellerLink(PROSPECT, linkInput(), SELLER)
    expect(result.emailSent).toBe(true)
    expect(result.discountRequest).toBeNull()
    expect(result.proposal).toMatchObject({ source: 'console', linkStatus: 'sent', planName: 'Profissional', referralCode: 'joao-silva' })
    expect(JSON.stringify(result)).not.toContain('chave=')
    const proposal = [...state.proposals.values()][0]!
    expect(proposal).toMatchObject({ sellerUserId: JOAO, source: 'console', contractorType: 'entidade', status: 'draft' })
    expect(proposal.inviteSentAt).toBeInstanceOf(Date)
    expect(state.emails).toEqual([
      { template: 'onboarding_started', extra: expect.objectContaining({ sellerName: 'João Silva', planName: 'Profissional', monthlyAmount: 697, setupFee: 990, discountSummary: null }) },
    ])
    // Prospect vinculado e levado a "em contratação".
    expect(state.prospectUpdates).toEqual(
      expect.arrayContaining([expect.objectContaining({ proposalId: proposal.id }), expect.objectContaining({ stage: 'em_contratacao' })]),
    )
  })
})

describe('a chave da proposta nunca vai para o vendedor', () => {
  it('e-mail do cliente igual ao do próprio vendedor: recusado antes de criar a proposta ou mandar e-mail', async () => {
    const input = { ...linkInput(), applicant: { ...linkInput().applicant, email: ' JOAO@annetec.com.br ' } }
    await expect(createSellerLink(PROSPECT, input, SELLER)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(state.proposals.size).toBe(0)
    expect(state.emails).toEqual([])
  })

  it('reenviar o link também confere o destinatário', async () => {
    const { proposal } = await createSellerLink(PROSPECT, linkInput(), SELLER)
    state.emails = []
    state.proposals.get(proposal.id)!.applicant = { ...linkInput().applicant, email: SELLER.email }
    await expect(sendSellerLink(proposal.id, SELLER)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(state.emails).toEqual([])
  })
})

describe('link com pedido de desconto', () => {
  const DISCOUNT = { setupFeePercent: 50, monthlyPercent: 20, monthlyMonths: 3, justification: 'Concorrente ofereceu adesão menor' }

  it('e-mail RETIDO até o superadmin aprovar; aprovação (com ajuste) aplica o preço e solta o e-mail', async () => {
    const result = await createSellerLink(PROSPECT, linkInput(DISCOUNT), SELLER)
    expect(result.emailSent).toBe(false)
    expect(result.proposal.linkStatus).toBe('awaiting_discount_approval')
    expect(result.discountRequest).toMatchObject({ status: 'pending', requested: { setupFeePercent: 50, monthlyPercent: 20, monthlyMonths: 3 } })
    expect(state.emails).toEqual([])
    // Sino da equipe avisando o pedido.
    expect(state.bells.map(b => [b.audience, b.kind])).toEqual([['platform', 'sales_discount_requested']])

    // Reenviar enquanto o pedido está pendente: recusado.
    await expect(sendSellerLink(result.proposal.id, SELLER)).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
    expect(state.emails).toEqual([])

    const decided = await approveDiscount(result.discountRequest!.id, { monthlyPercent: 10 }, SUPER)
    expect(decided.discount).toEqual({ setupFeePercent: 50, monthlyPercent: 10, monthlyMonths: 3 })
    expect(decided.inviteSent).toBe(true)
    const proposal = state.proposals.get(result.proposal.id)!
    expect(proposal.discount).toMatchObject({ setupFeePercent: 50, monthlyPercent: 10, monthlyMonths: 3, approvedByName: 'Superadmin' })
    expect(state.emails).toEqual([
      {
        template: 'onboarding_started',
        extra: expect.objectContaining({ monthlyAmount: 627.3, setupFee: 495, discountSummary: 'adesão 50% · mensalidade 10% por 3 meses' }),
      },
    ])
    expect(state.bells.at(-1)).toMatchObject({ audience: 'seller', recipientUserId: JOAO, kind: 'sales_discount_approved' })
    // Aprovar de novo: já decidido.
    await expect(approveDiscount(result.discountRequest!.id, {}, SUPER)).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
  })

  it('recusa: vendedor avisado, nada enviado; "enviar link" manda SEM desconto', async () => {
    const result = await createSellerLink(PROSPECT, linkInput(DISCOUNT), SELLER)
    const rejected = await rejectDiscount(result.discountRequest!.id, { reason: 'Margem não comporta' }, SUPER)
    expect(rejected.status).toBe('rejected')
    expect(state.emails).toEqual([])
    expect(state.bells.at(-1)).toMatchObject({ audience: 'seller', recipientUserId: JOAO, kind: 'sales_discount_rejected' })
    expect(state.proposals.get(result.proposal.id)!.discount).toBeNull()

    const sent = await sendSellerLink(result.proposal.id, SELLER)
    expect(sent.linkStatus).toBe('sent')
    expect(state.emails).toEqual([
      { template: 'onboarding_started', extra: expect.objectContaining({ monthlyAmount: 697, setupFee: 990, discountSummary: null }) },
    ])
  })

  it('proposta já aprovada pelo compliance não recebe mais desconto', async () => {
    const result = await createSellerLink(PROSPECT, linkInput(DISCOUNT), SELLER)
    state.proposals.get(result.proposal.id)!.status = 'awaiting_payment'
    await expect(approveDiscount(result.discountRequest!.id, {}, SUPER)).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
    expect(state.emails).toEqual([])
  })
})
