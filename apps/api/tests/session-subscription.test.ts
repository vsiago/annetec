import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckoutInput, ClubSubscriptionStatus } from '@annetec/contracts'

/**
 * `needsSubscription` / `subscriptionStatus` no `SessionUser` (logins e
 * `GET /auth/me`) e as regras de conta do checkout público — com banco FALSO.
 *
 * O fake responde por tabela (e, quando a mesma tabela é lida de dois jeitos,
 * pelas colunas pedidas no `select`), a partir do `state` de cada cenário.
 */

const state = vi.hoisted(() => ({
  /** Status das assinaturas do usuário no clube (lidos por `loadClubAccess`). */
  subscriptionStatuses: [] as string[],
  /** Contrato da operadora no perfil (associado antigo). */
  upstreamContract: null as string | null,
  /** Lido pela checagem do checkout. */
  existingUser: null as { id: string; role: string | null } | null,
  /** Papel do vínculo NESTE clube (`null` = sem vínculo). */
  membershipRole: null as string | null,
  /** Papel de equipe (admin/vendedor) em algum clube. */
  staffAnywhere: false,
  profileCpf: null as string | null,
  /** Alguma assinatura (qualquer status) neste clube. */
  hasAnySubscription: false,
  /** Assinaturas vivas do mesmo usuário/CPF. */
  live: [] as { userId: string; cpf: string }[],
  failAccess: false,
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')

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

  return {
    db: {
      select: (fields?: Record<string, unknown>) =>
        chain(ops => {
          const table = ops.find(op => op.name === 'from')?.args[0]
          const keys = Object.keys(fields ?? {})
          if (state.failAccess && (table === schema.clubSubscriptions || table === schema.clientProfiles)) {
            throw new Error('banco fora')
          }
          if (table === schema.clubSubscriptions) {
            if (keys.includes('status')) return state.subscriptionStatuses.map(status => ({ status }))
            if (keys.includes('cpf')) return state.live
            return state.hasAnySubscription ? [{ id: 'sub-anterior' }] : []
          }
          if (table === schema.clientProfiles) {
            if (keys.includes('contract')) return [{ contract: state.upstreamContract }]
            return state.profileCpf ? [{ cpf: state.profileCpf }] : []
          }
          if (table === schema.user) return state.existingUser ? [state.existingUser] : []
          if (table === schema.member) {
            if (keys.includes('role')) return state.membershipRole ? [{ role: state.membershipRole }] : []
            return state.staffAnywhere ? [{ id: 'm-equipe' }] : []
          }
          if (table === schema.clubPlans) return [{ id: PLAN_ID, name: 'Plano Essencial' }]
          throw new Error('Tabela inesperada no fake de banco')
        }),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: { api: {} } }))
vi.mock('@/modules/auth/service', () => ({ getSessionByToken: vi.fn(), setActiveOrganization: vi.fn() }))
vi.mock('@/modules/network/controller', () => ({ toClubPlan: (row: unknown) => row }))
vi.mock('@/modules/club-billing/settings.service', () => ({
  loadBillingSettings: vi.fn(async () => ({ enabledMethods: ['pix'], gatewayOverride: null, boletoDueDays: 3 })),
}))
// O clube tem conta de recebimento conectada (com PAYMENT_GATEWAY=asaas o checkout confere antes de tudo).
vi.mock('@/modules/club-billing/receiving-account.service', () => ({
  resolveClubAsaasCredentials: vi.fn(async () => ({ apiKey: '$aact_hmlg_chave-de-teste', env: 'sandbox', updatedAt: new Date(0) })),
}))
vi.mock('@/modules/club-billing/checkout-rules', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/club-billing/checkout-rules')>()),
  // As regras do plano têm testes próprios; aqui interessa a conta do titular.
  assertCheckoutEligible: vi.fn(() => ({ total: 49.9 })),
}))

const { presentSessionUser } = await import('@/modules/auth/presenter')
const { checkoutService } = await import('@/modules/club-billing/checkout.service')
const { AppError } = await import('@/http/errors')

const PLAN_ID = '0b9b1f43-8a8e-4d5d-9a51-1f1f1f1f1f1f'
const TENANT = { id: 'org-mapcard2', slug: 'mapcard2', name: 'MapCard 2' }

type Session = Parameters<typeof presentSessionUser>[0]

function sessionOf(membership: Partial<Session['membership']>): Session {
  return {
    user: { id: 'u-1', name: 'Ana Souza', email: 'ana@exemplo.com', image: null },
    session: { id: 's-1', token: 't-1' },
    membership: {
      scope: 'tenant',
      platformRole: null,
      tenantId: TENANT.id,
      tenantSlug: TENANT.slug,
      tenantRole: 'client',
      impersonatedBy: null,
      ...membership,
    },
  } as unknown as Session
}

function input(email: string, cpf = '52998224725'): CheckoutInput {
  return {
    planId: PLAN_ID,
    holder: { name: 'Ana Souza', cpf, email, phone: '21999998888', birthDate: '1990-05-10' },
    dependents: [],
    payment: { method: 'pix' },
    acceptTerms: true,
  } as unknown as CheckoutInput
}

async function checkoutError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(AppError)
  return error as InstanceType<typeof AppError>
}

beforeEach(() => {
  state.subscriptionStatuses = []
  state.upstreamContract = null
  state.existingUser = null
  state.membershipRole = null
  state.staffAnywhere = false
  state.profileCpf = null
  state.hasAnySubscription = false
  state.live = []
  state.failAccess = false
})

describe('SessionUser.needsSubscription (associado)', () => {
  const cases: [string, ClubSubscriptionStatus[], boolean, string][] = [
    ['sem assinatura', [], true, 'none'],
    ['só canceladas', ['canceled', 'canceled'], true, 'none'],
    ['aguardando pagamento', ['pending_payment'], true, 'pending_payment'],
    ['ativa', ['active'], false, 'subscribed'],
    ['em atraso', ['past_due'], false, 'subscribed'],
    ['suspensa', ['suspended'], false, 'subscribed'],
    ['cancelada + ativa', ['canceled', 'active'], false, 'subscribed'],
    ['cancelada + pendente', ['canceled', 'pending_payment'], true, 'pending_payment'],
  ]

  it.each(cases)('%s', async (_label, statuses, needs, status) => {
    state.subscriptionStatuses = statuses
    const user = await presentSessionUser(sessionOf({}))
    expect(user.needsSubscription).toBe(needs)
    expect(user.subscriptionStatus).toBe(status)
    expect(user.tenantRole).toBe('client')
  })

  it('associado antigo com contrato na operadora não precisa assinar', async () => {
    state.upstreamContract = 'CTR-123'
    const user = await presentSessionUser(sessionOf({}))
    expect(user).toMatchObject({ needsSubscription: false, subscriptionStatus: 'contract' })
  })

  it('equipe do clube e plataforma não recebem os campos', async () => {
    for (const membership of [
      { tenantRole: 'admin' as const },
      { tenantRole: 'seller' as const },
      { scope: 'platform' as const, platformRole: 'superadmin' as const, tenantId: null, tenantSlug: null, tenantRole: null },
    ]) {
      const user = await presentSessionUser(sessionOf(membership))
      expect(user.needsSubscription).toBeUndefined()
      expect(user.subscriptionStatus).toBeUndefined()
    }
  })

  it('falha ao ler a assinatura não derruba a sessão (campos ausentes)', async () => {
    state.failAccess = true
    const user = await presentSessionUser(sessionOf({}))
    expect(user.id).toBe('u-1')
    expect(user.needsSubscription).toBeUndefined()
  })
})

describe('checkout com sessão de associado', () => {
  const viewer = { userId: 'u-1', email: 'ana@exemplo.com' }

  it('e-mail do titular diferente do da sessão → 422 no campo holder.email', async () => {
    const error = await checkoutError(checkoutService.checkout(TENANT, input('outra@exemplo.com'), undefined, viewer))
    expect(error.status).toBe(422)
    expect(error.code).toBe('BUSINESS_RULE_VIOLATION')
    expect(error.issues).toEqual([{ path: 'holder.email', message: 'Use o e-mail da sua conta (ana@exemplo.com)' }])
  })

  it('mesmo e-mail (sem diferenciar maiúsculas) usa a conta da sessão, mesmo sem assinatura anterior', async () => {
    state.existingUser = { id: 'u-1', role: null }
    state.membershipRole = 'client'
    state.live = [{ userId: 'u-1', cpf: '52998224725' }]
    // Chega até a checagem de assinatura viva: a conta da sessão foi aceita
    // sem perfil/assinatura anterior (a posse está provada pela sessão).
    const error = await checkoutError(checkoutService.checkout(TENANT, input('ANA@exemplo.com'), undefined, viewer))
    expect(error.message).toBe('Você já tem uma assinatura. Acesse a área do associado.')
  })
})

describe('checkout sem sessão com e-mail de conta existente', () => {
  const EXISTING = 'Já existe uma conta com este e-mail. Entre na área do associado para assinar com ela, ou use outro e-mail.'

  it('conta sem vínculo com o clube (ex.: só Google/senha) → 409, nunca reaproveita', async () => {
    state.existingUser = { id: 'u-9', role: null }
    const error = await checkoutError(checkoutService.checkout(TENANT, input('vitima@exemplo.com')))
    expect(error.status).toBe(409)
    expect(error.message).toBe(EXISTING)
    expect(error.issues?.[0]?.path).toBe('holder.email')
  })

  it('associado do clube sem perfil (cadastro pelo Google) → 409: o CPF digitado não vira credencial do portal', async () => {
    state.existingUser = { id: 'u-9', role: null }
    state.membershipRole = 'client'
    const error = await checkoutError(checkoutService.checkout(TENANT, input('vitima@exemplo.com')))
    expect(error.message).toBe(EXISTING)
  })

  it('associado com perfil mas sem nenhuma assinatura aqui → 409', async () => {
    state.existingUser = { id: 'u-9', role: null }
    state.membershipRole = 'client'
    state.profileCpf = '52998224725'
    const error = await checkoutError(checkoutService.checkout(TENANT, input('vitima@exemplo.com')))
    expect(error.message).toBe(EXISTING)
  })

  it('equipe de outro clube → 409, mesmo associada aqui', async () => {
    state.existingUser = { id: 'u-9', role: null }
    state.membershipRole = 'client'
    state.profileCpf = '52998224725'
    state.hasAnySubscription = true
    state.staffAnywhere = true
    const error = await checkoutError(checkoutService.checkout(TENANT, input('vitima@exemplo.com')))
    expect(error.message).toBe(EXISTING)
  })

  it('admin deste clube ou plataforma → 409 de equipe', async () => {
    state.existingUser = { id: 'u-9', role: null }
    state.membershipRole = 'admin'
    expect((await checkoutError(checkoutService.checkout(TENANT, input('adm@exemplo.com')))).message).toBe(
      'Este e-mail pertence à equipe; use outro',
    )
    state.existingUser = { id: 'u-8', role: 'superadmin' }
    state.membershipRole = null
    expect((await checkoutError(checkoutService.checkout(TENANT, input('root@exemplo.com')))).message).toBe(
      'Este e-mail pertence à equipe; use outro',
    )
  })

  it('CPF diferente do perfil → 409', async () => {
    state.existingUser = { id: 'u-9', role: null }
    state.membershipRole = 'client'
    state.profileCpf = '11144477735'
    state.hasAnySubscription = true
    const error = await checkoutError(checkoutService.checkout(TENANT, input('vitima@exemplo.com')))
    expect(error.message).toBe('E-mail já cadastrado com outro CPF')
  })

  it('associado com mesmo CPF e assinatura anterior aqui é reaproveitado (segue para as próximas regras)', async () => {
    state.existingUser = { id: 'u-9', role: null }
    state.membershipRole = 'client'
    state.profileCpf = '529.982.247-25'
    state.hasAnySubscription = true
    state.live = [{ userId: 'u-9', cpf: '52998224725' }]
    const error = await checkoutError(checkoutService.checkout(TENANT, input('vitima@exemplo.com')))
    expect(error.message).toBe('Você já tem uma assinatura. Acesse a área do associado.')
  })
})
