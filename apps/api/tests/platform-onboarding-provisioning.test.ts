import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Provisionamento (blueprint §0.6) com banco FALSO em memória e os serviços
 * vizinhos simulados: caminho feliz, reprocessamento idempotente, proposta já
 * ativa, pagamento duplicado, falha parcial + retomada, conta órfã do admin,
 * isenção da ativação e trava contra execução simultânea.
 */

const PROPOSAL_ID = '0b6f6c2e-3f1a-4c55-9d0e-1a2b3c4d5e6f'

const state = vi.hoisted(() => ({
  proposal: null as Record<string, unknown> | null,
  orgRows: [] as { id: string }[],
  profileRows: [] as { document: string }[],
  userRows: [] as { id: string; createdAt: Date }[],
  memberships: 0,
  adminMember: [] as { id: string }[],
  welcomeSent: false,
  ops: [] as { kind: 'insert' | 'update'; table: string; values: Record<string, unknown> }[],
  events: [] as { type: string; visibility: string; message: string }[],
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const names = new Map<unknown, string>([
    [schema.organization, 'organization'],
    [schema.tenantProfiles, 'tenant_profiles'],
    [schema.user, 'user'],
    [schema.member, 'member'],
    [schema.clubPlans, 'club_plans'],
    [schema.platformEmailOutbox, 'outbox'],
    [schema.account, 'account'],
    [schema.platformOnboardingProposals, 'proposals'],
    [schema.clubBillingSettings, 'billing_settings'],
    [schema.platformFiles, 'files'],
    [schema.auditLogs, 'audit'],
  ])
  type Op = { name: string; args: unknown[] }
  function chain(resolve: (ops: Op[]) => unknown) {
    const ops: Op[] = []
    const proxy: unknown = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
            try {
              return Promise.resolve(resolve(ops)).then(ok, ko)
            } catch (error) {
              return Promise.reject(error).then(ok, ko)
            }
          }
        }
        return (...args: unknown[]) => {
          ops.push({ name: String(prop), args })
          return proxy
        }
      },
    })
    return proxy
  }
  const isSql = (value: unknown) => typeof value === 'object' && value !== null && 'queryChunks' in value
  return {
    db: {
      select: (fields?: Record<string, unknown>) =>
        chain(ops => {
          const table = names.get(ops.find(op => op.name === 'from')?.args[0])
          const keys = Object.keys(fields ?? {})
          switch (table) {
            case 'organization':
              return keys.includes('slug') ? [{ slug: 'asserv' }] : state.orgRows
            case 'tenant_profiles':
              return state.profileRows
            case 'user':
              return keys.includes('name') ? [{ name: 'Superadmin Demo' }] : state.userRows
            case 'member':
              return keys.includes('value') ? [{ value: state.memberships }] : state.adminMember
            case 'club_plans':
              return [{ value: 3 }]
            case 'outbox':
              return state.welcomeSent ? [{ id: 'email-antigo' }] : []
            default:
              return []
          }
        }),
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) =>
          chain(() => {
            state.ops.push({ kind: 'insert', table: names.get(table) ?? '?', values })
            return []
          }),
      }),
      update: (table: unknown) => ({
        set: (values: Record<string, unknown>) =>
          chain(ops => {
            const name = names.get(table) ?? '?'
            state.ops.push({ kind: 'update', table: name, values })
            if (name === 'proposals' && state.proposal) {
              for (const [key, value] of Object.entries(values)) if (!isSql(value)) state.proposal[key] = value
            }
            return ops.some(op => op.name === 'returning') ? [{ id: 'account-1' }] : []
          }),
      }),
    },
  }
})

vi.mock('@/modules/platform-onboarding/repository', () => ({
  getProposal: vi.fn(async () => (state.proposal ? { ...state.proposal } : null)),
  insertEvent: vi.fn(async (_db: unknown, event: { type: string; visibility: string; message: string }) => {
    state.events.push(event)
  }),
  transitionProposal: vi.fn(async (_db: unknown, _id: string, from: string[], patch: Record<string, unknown>) => {
    if (!state.proposal || !from.includes(String(state.proposal.status))) return null
    state.proposal = { ...state.proposal, ...patch }
    return { ...state.proposal }
  }),
}))

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  createOrganization: vi.fn(),
  createPlatformSubscription: vi.fn(),
  cancelActivationCharge: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('@/modules/tenants/service', () => ({ tenantsService: { create: mocks.create } }))
vi.mock('@/lib/auth', () => ({ auth: { api: { createOrganization: mocks.createOrganization } } }))
vi.mock('@/lib/email', () => ({ sendEmail: mocks.sendEmail }))
vi.mock('@/modules/platform-billing/activation', () => ({
  createPlatformSubscription: mocks.createPlatformSubscription,
  cancelActivationCharge: mocks.cancelActivationCharge,
  createActivationCharge: vi.fn(),
  getActivationCharge: vi.fn(),
}))
vi.mock('@/modules/network/controller', () => ({
  clubPlanColumns: (input: { description?: string }) => ({ description: input.description ?? null }),
}))
vi.mock('@/modules/club-billing/settings.service', () => ({
  DEFAULT_BILLING_SETTINGS: { enabledMethods: ['pix', 'boleto', 'credit_card'], suspendAfterDays: 15, cancelAfterDays: 60 },
}))
vi.mock('better-auth/crypto', () => ({ hashPassword: vi.fn(async () => 'hash-scrypt') }))

const { onActivationPaid, provisionTenantFromProposal } = await import('@/modules/platform-onboarding/provisioning.service')
const { env, webBaseUrl } = await import('@/config/env')

const LOGO_ID = '5e2c1a90-1111-4222-8333-944455556666'

function baseProposal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const paidAt = new Date(Date.now() - 60_000)
  return {
    id: PROPOSAL_ID,
    code: 'ANN-2609-ABCDE',
    status: 'provisioning',
    cnpj: '11222333000181',
    legalName: 'ASSOCIACAO DOS SERVIDORES DO VALE',
    planId: 'plan-pro',
    paymentMethod: 'pix',
    applicant: { name: 'Mariana Costa Lima', email: 'mariana@asserv.org.br', phone: '24999990000' },
    company: {
      legalName: 'ASSOCIACAO DOS SERVIDORES DO VALE',
      email: 'contato@asserv.org.br',
      phone: '2433451200',
      address: { cep: '27253000', street: 'Rua das Palmeiras', number: '120', neighborhood: 'Centro', city: 'Volta Redonda', state: 'RJ' },
      secondaryCnaes: [],
      contacts: {
        commercial: { name: 'Mariana Costa Lima', email: 'mariana@asserv.org.br', phone: '24999990000' },
        financial: { name: 'Rafael Souza Pinto', email: 'financeiro@asserv.org.br', phone: '24999990001' },
        technical: { name: 'Mariana Costa Lima', email: 'mariana@asserv.org.br', phone: '24999990000' },
      },
    },
    brand: {
      slug: 'asserv',
      clubName: 'Clube ASSERV',
      primaryColor: '#0f766e',
      secondaryColor: '#f59e0b',
      logoFileId: LOGO_ID,
      admin: { name: 'Mariana Costa Lima', email: 'Admin@Asserv.org.br' },
    },
    organizationId: null,
    activationWaived: false,
    overrideReason: null,
    paidAt,
    approvedAt: new Date(Date.now() - 3_600_000),
    updatedAt: paidAt,
    ...overrides,
  }
}

beforeEach(() => {
  state.proposal = baseProposal()
  state.orgRows = []
  state.profileRows = []
  state.userRows = []
  state.memberships = 0
  state.adminMember = []
  state.welcomeSent = false
  state.ops = []
  state.events = []
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.create.mockResolvedValue({ tenant: { id: 'org-1' }, ownerPassword: 'SenhaProvisoria1' })
  mocks.createPlatformSubscription.mockResolvedValue({ subscriptionId: 'sub-1' })
  mocks.sendEmail.mockResolvedValue({ id: 'email-1', status: 'simulated' })
  mocks.createOrganization.mockResolvedValue({ id: 'org-9' })
  mocks.cancelActivationCharge.mockResolvedValue(undefined)
})

const inserts = (table: string) => state.ops.filter(op => op.kind === 'insert' && op.table === table)
const eventTypes = () => state.events.map(e => e.type)

describe('provisionTenantFromProposal', () => {
  it('caminho feliz: org + admin, régua, 3 planos, assinatura, arquivos, boas-vindas e ativo', async () => {
    const result = await provisionTenantFromProposal(PROPOSAL_ID)
    expect(result).toEqual({
      organizationId: 'org-1',
      slug: 'asserv',
      siteUrl: `${webBaseUrl}/asserv`,
      adminEmail: 'Admin@Asserv.org.br',
      clubPlansCreated: 3,
      subscriptionId: 'sub-1',
    })
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create.mock.calls[0]?.[0]).toMatchObject({
      slug: 'asserv',
      name: 'Clube ASSERV',
      document: '11222333000181',
      status: 'active',
      planId: 'plan-pro',
      ownerEmail: 'admin@asserv.org.br',
      branding: {
        primaryColor: '#0f766e',
        secondaryColor: '#f59e0b',
        logoUrl: `${env.API_BASE_URL.replace(/\/+$/, '')}/api/v1/public/arquivos/${LOGO_ID}`,
      },
    })
    expect(mocks.createPlatformSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        proposalId: PROPOSAL_ID,
        planId: 'plan-pro',
        paymentMethod: 'pix',
        activationWaived: false,
        billing: expect.objectContaining({ document: '11222333000181', email: 'financeiro@asserv.org.br' }),
        startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    expect(inserts('billing_settings')).toHaveLength(1)
    expect(inserts('club_plans')).toHaveLength(3)
    expect(state.ops.some(op => op.kind === 'update' && op.table === 'files' && op.values.organizationId === 'org-1')).toBe(true)
    const welcome = mocks.sendEmail.mock.calls[0]?.[0]
    expect(welcome).toMatchObject({ template: 'tenant_welcome', secrets: ['SenhaProvisoria1'], organizationId: 'org-1' })
    expect(state.proposal).toMatchObject({ status: 'active', organizationId: 'org-1', provisioningError: null })
    expect(eventTypes()).toEqual(expect.arrayContaining(['PROVISIONING_STARTED', 'EMAIL_SENT', 'PROVISIONED']))
    expect(inserts('audit')[0]?.values).toMatchObject({ action: 'tenant.provisioned', actorScope: 'platform' })
  })

  it('reprocessar após queda (org já gravada, boas-vindas já enviadas) não duplica nada', async () => {
    state.proposal = baseProposal({ organizationId: 'org-1' })
    state.orgRows = [{ id: 'org-1' }]
    state.welcomeSent = true
    const result = await provisionTenantFromProposal(PROPOSAL_ID)
    expect(result.organizationId).toBe('org-1')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.createPlatformSubscription).toHaveBeenCalledTimes(1)
    expect(state.proposal?.status).toBe('active')
  })

  it('proposta já ativa: devolve o resultado sem criar nada', async () => {
    state.proposal = baseProposal({ status: 'active', organizationId: 'org-1' })
    const result = await provisionTenantFromProposal(PROPOSAL_ID)
    expect(result).toMatchObject({ organizationId: 'org-1', slug: 'asserv', subscriptionId: 'sub-1' })
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(inserts('club_plans')).toHaveLength(0)
  })

  it('falha no meio grava o erro, mantém o organizationId e a retentativa retoma sem recriar a org', async () => {
    mocks.createPlatformSubscription.mockRejectedValueOnce(new Error('gateway fora'))
    await expect(provisionTenantFromProposal(PROPOSAL_ID)).rejects.toThrow(/gateway fora/)
    expect(state.proposal).toMatchObject({ status: 'provisioning', organizationId: 'org-1', provisioningError: 'gateway fora' })
    expect(eventTypes()).toContain('PROVISIONING_FAILED')

    state.orgRows = [{ id: 'org-1' }]
    state.adminMember = [{ id: 'user-1' }]
    const result = await provisionTenantFromProposal(PROPOSAL_ID)
    expect(result.subscriptionId).toBe('sub-1')
    expect(mocks.create).toHaveBeenCalledTimes(1)
    // A senha da 1ª tentativa se perdeu: gera outra só para o e-mail (1×).
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1)
    expect(state.proposal?.status).toBe('active')
  })

  it('conta do admin órfã (tentativa anterior caiu antes da org): cria a org para ela e gera nova senha', async () => {
    state.userRows = [{ id: 'user-1', createdAt: new Date() }]
    state.memberships = 0
    state.adminMember = [{ id: 'user-1' }]
    const result = await provisionTenantFromProposal(PROPOSAL_ID)
    expect(result.organizationId).toBe('org-9')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.createOrganization).toHaveBeenCalledWith({ body: { name: 'Clube ASSERV', slug: 'asserv', userId: 'user-1' } })
    expect(inserts('tenant_profiles')).toHaveLength(1)
    expect(state.ops.some(op => op.kind === 'update' && op.table === 'account' && op.values.password === 'hash-scrypt')).toBe(true)
    const secrets = mocks.sendEmail.mock.calls[0]?.[0]?.secrets as string[]
    expect(secrets).toHaveLength(1)
    expect(secrets[0]).toHaveLength(16)
  })

  it('e-mail do admin já usado por outra conta: falha clara, nada criado', async () => {
    state.userRows = [{ id: 'user-velho', createdAt: new Date('2020-01-01') }]
    state.memberships = 2
    await expect(provisionTenantFromProposal(PROPOSAL_ID)).rejects.toThrow(/já tem conta/)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.createOrganization).not.toHaveBeenCalled()
  })

  it('isenção da ativação (superadmin): cancela a cobrança e provisiona com activationWaived', async () => {
    state.proposal = baseProposal({ status: 'awaiting_payment', paidAt: null })
    await provisionTenantFromProposal(PROPOSAL_ID, { actorUserId: 'sa-1', waiveActivation: true, reason: 'Parceiro estratégico' })
    expect(mocks.cancelActivationCharge).toHaveBeenCalledWith(PROPOSAL_ID, 'Ativação isenta: Parceiro estratégico')
    expect(mocks.createPlatformSubscription).toHaveBeenCalledWith(expect.objectContaining({ activationWaived: true }))
    expect(state.proposal).toMatchObject({ status: 'active', activationWaived: true })
  })

  it('não provisiona proposta que não foi paga nem isentada', async () => {
    state.proposal = baseProposal({ status: 'in_review' })
    await expect(provisionTenantFromProposal(PROPOSAL_ID)).rejects.toThrow(/paga ou com ativação isenta/)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('trava: segunda chamada simultânea para a mesma proposta = 409', async () => {
    let release: () => void = () => {}
    mocks.create.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = () => resolve({ tenant: { id: 'org-1' }, ownerPassword: 'SenhaProvisoria1' })
        }),
    )
    const first = provisionTenantFromProposal(PROPOSAL_ID)
    await expect(provisionTenantFromProposal(PROPOSAL_ID)).rejects.toMatchObject({ status: 409 })
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalled())
    release()
    await expect(first).resolves.toMatchObject({ organizationId: 'org-1' })
  })
})

describe('onActivationPaid', () => {
  it('pagamento confirmado leva a provisioning e provisiona uma única vez', async () => {
    state.proposal = baseProposal({ status: 'awaiting_payment', paidAt: null })
    await onActivationPaid(PROPOSAL_ID, { source: 'webhook' })
    expect(state.proposal?.status).toBe('active')
    expect(state.proposal?.paidAt).toBeInstanceOf(Date)
    expect(eventTypes()[0]).toBe('PAYMENT_CONFIRMED')
    // Evento duplicado (webhook + sincronização): nada acontece.
    await onActivationPaid(PROPOSAL_ID, { source: 'automation' })
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('pagamento de proposta cancelada só registra alerta interno; nunca lança', async () => {
    state.proposal = baseProposal({ status: 'canceled' })
    await expect(onActivationPaid(PROPOSAL_ID, { source: 'webhook' })).resolves.toBeUndefined()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(state.events[0]).toMatchObject({ type: 'PAYMENT_CONFIRMED', visibility: 'internal' })

    state.proposal = baseProposal({ status: 'awaiting_payment' })
    mocks.createPlatformSubscription.mockRejectedValueOnce(new Error('falhou'))
    await expect(onActivationPaid(PROPOSAL_ID, { source: 'webhook' })).resolves.toBeUndefined()
    expect(state.proposal?.provisioningError).toBe('falhou')
  })
})
