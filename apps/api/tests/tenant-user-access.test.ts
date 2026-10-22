import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

/**
 * Excluir / bloquear / desbloquear pelo admin do clube
 * (`usersService.remove|block|unblock`), sessão de vínculo cortado
 * (`resolveActiveMembership` + `requireAuth`) e o gate de assinatura do
 * portal (`requireClubSubscription`) — com banco e Better Auth falsos.
 */

const state = vi.hoisted(() => ({
  /** Linha que `findMembership`/`getById` devolvem. */
  row: null as null | { member: Record<string, unknown>; user: Record<string, unknown> },
  /** Vínculos para `resolveActiveMembership`. */
  members: [] as { userId: string; organizationId: string; role: string; accessStatus: string; slug: string }[],
  session: null as unknown,
  access: { status: 'none', needsSubscription: true } as { status: string; needsSubscription: boolean },
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { PgDialect } = await import('drizzle-orm/pg-core')
  const dialect = new PgDialect({ casing: 'snake_case' })
  const paramsOf = (condition: unknown): unknown[] =>
    condition ? dialect.sqlToQuery(condition as Parameters<typeof dialect.sqlToQuery>[0]).params : []

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

  const select = () =>
    chain(ops => {
      const from = ops.find(op => op.name === 'from')?.args[0]
      const joinsOrganization = ops.some(op => op.name === 'innerJoin' && op.args[0] === schema.organization)
      if (from === schema.member && joinsOrganization) {
        // resolveActiveMembership: cada valor literal do WHERE filtra.
        const params = paramsOf(ops.find(op => op.name === 'where')?.args[0])
        return state.members
          .filter(m => params.includes(m.userId) && params.includes(m.organizationId) && params.includes(m.accessStatus))
          .map(m => ({ role: m.role, slug: m.slug, organizationId: m.organizationId }))
      }
      // findMembership / getById (extras ficam vazios: perfis nulos).
      return state.row ? [state.row] : []
    })

  return { db: { select, selectDistinctOn: select } }
})

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => state.session) } },
}))

vi.mock('@/modules/club-billing/access.service', () => ({
  loadClubAccess: vi.fn(async () => state.access),
}))

const { usersService } = await import('@/modules/users/service')
const { resolveActiveMembership } = await import('@/modules/auth/membership')
const { requireAuth, requireClubSubscription, requireTenantRole } = await import('@/http/middleware/auth')
const { errorHandler } = await import('@/http/errors')

const ORG = '11111111-1111-4111-8111-111111111111'
const CLIENT = '22222222-2222-4222-8222-222222222222'

function rowOf(role: string, accessStatus: string) {
  return {
    member: { organizationId: ORG, userId: CLIENT, role, accessStatus, active: accessStatus === 'active', createdAt: new Date('2026-01-01') },
    user: { id: CLIENT, name: 'Iago', email: 'iago@exemplo.com', role: 'user', phone: null, image: null, banned: false },
  }
}

/** Deps de `usersService.remove|block` (vínculo + regras), com efeitos registrados. */
function deps(options: { sessions?: number; otherAdmins?: number } = {}) {
  const log: string[] = []
  return {
    log,
    deps: {
      countOtherActiveResponsibles: async () => options.otherAdmins ?? 1,
      countOtherMemberships: async () => 0,
      revokeSessions: vi.fn(async () => {
        log.push('revoke')
        return options.sessions ?? 2
      }),
      loadHistory: async () => ({ salesHere: 0, salesAnywhere: 0, clubSubscriptions: 1 }),
      find: async () => ({
        role: state.row!.member.role as 'client',
        accessStatus: state.row!.member.accessStatus as 'active',
        onboardingRound: 1,
      }),
      setStatus: vi.fn(async (_o: string, _u: string, status: string) => {
        log.push(`status:${status}`)
        state.row!.member.accessStatus = status
        state.row!.member.active = status === 'active'
        return true
      }),
      reopenAsClient: async () => null,
      liveSubscriptions: async () => [{ id: 'sub-plus', organizationId: ORG, gatewayProvider: 'asaas' as const }],
      cancelSubscription: vi.fn(async (sub: { id: string }, reason: string) => {
        log.push(`cancel:${sub.id}:${reason}`)
        return true
      }),
      forgetCard: vi.fn(async () => {
        log.push('forget')
      }),
      audit: async () => {},
      welcome: () => {},
    },
  }
}

beforeEach(() => {
  state.row = null
  state.members = []
  state.session = null
  state.access = { status: 'none', needsSubscription: true }
})

describe('excluir associado (DELETE /usuarios/:id)', () => {
  it('cancela a assinatura viva, marca removed e devolve o número real de sessões revogadas', async () => {
    state.row = rowOf('client', 'active')
    const { deps: d, log } = deps({ sessions: 3 })

    const { tenantUser, result } = await usersService.remove(ORG, CLIENT, 'u-admin', d)

    expect(result).toEqual({ canceledSubscriptions: 1, revokedSessions: 3, previousStatus: 'active' })
    expect(log).toEqual(['cancel:sub-plus:Associado excluído pelo clube', 'forget', 'status:removed', 'revoke'])
    expect(tenantUser).toMatchObject({ id: CLIENT, role: 'client', active: false, accessStatus: 'removed' })
  })

  it('admin: mantém a regra do último responsável (422) e não corta nada', async () => {
    state.row = rowOf('admin', 'active')
    const { deps: d, log } = deps({ otherAdmins: 0 })

    await expect(usersService.remove(ORG, CLIENT, 'outro-admin', d)).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    })
    expect(log).toEqual([])
  })
})

describe('bloquear / desbloquear', () => {
  it('bloquear: cancela a assinatura, marca blocked e revoga as sessões', async () => {
    state.row = rowOf('client', 'active')
    const { deps: d, log } = deps({ sessions: 1 })

    const { tenantUser, result } = await usersService.block(ORG, CLIENT, 'u-admin', d)

    expect(result).toMatchObject({ canceledSubscriptions: 1, revokedSessions: 1 })
    expect(log).toEqual(['cancel:sub-plus:Associado bloqueado pelo clube', 'forget', 'status:blocked', 'revoke'])
    expect(tenantUser.accessStatus).toBe('blocked')
  })

  it('ninguém bloqueia o próprio acesso', async () => {
    state.row = rowOf('admin', 'active')
    await expect(usersService.block(ORG, CLIENT, CLIENT, deps().deps)).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    })
  })

  it('desbloquear associado → removed (volta pelo site e assina de novo)', async () => {
    state.row = rowOf('client', 'blocked')
    const { deps: d } = deps()
    const { tenantUser, status } = await usersService.unblock(ORG, CLIENT, d)
    expect(status).toBe('removed')
    expect(tenantUser.accessStatus).toBe('removed')
  })

  it('desbloquear vendedor → active', async () => {
    state.row = rowOf('seller', 'blocked')
    const { status } = await usersService.unblock(ORG, CLIENT, deps().deps)
    expect(status).toBe('active')
  })

  it('desbloquear quem não está bloqueado → 422', async () => {
    state.row = rowOf('client', 'removed')
    await expect(usersService.unblock(ORG, CLIENT, deps().deps)).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    })
  })
})

describe('sessão de vínculo cortado', () => {
  it('getSession: vínculo ativo resolve o inquilino; excluído ou bloqueado fica sem membership', async () => {
    state.members = [{ userId: CLIENT, organizationId: ORG, role: 'client', accessStatus: 'active', slug: 'mapcard2' }]
    await expect(resolveActiveMembership({ id: CLIENT, role: 'user' }, { activeOrganizationId: ORG })).resolves.toMatchObject({
      tenantId: ORG,
      tenantRole: 'client',
    })

    for (const accessStatus of ['removed', 'blocked']) {
      state.members = [{ userId: CLIENT, organizationId: ORG, role: 'client', accessStatus, slug: 'mapcard2' }]
      await expect(
        resolveActiveMembership({ id: CLIENT, role: 'user' }, { activeOrganizationId: ORG }),
      ).resolves.toMatchObject({ scope: 'tenant', tenantId: null, tenantRole: null, tenantSlug: null })
    }
  })

  it('requireAuth: sessão de inquilino sem vínculo ativo → 401 (o web trata como sessão encerrada)', async () => {
    const app = new Hono().use('*', requireAuth).get('/x', c => c.text('ok'))
    app.onError(errorHandler)

    state.session = {
      user: { id: CLIENT },
      session: {},
      membership: { scope: 'tenant', platformRole: null, tenantId: null, tenantSlug: null, tenantRole: null, impersonatedBy: null },
    }
    const refused = await app.request('/x')
    expect(refused.status).toBe(401)
    expect(await refused.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })

    state.session = {
      user: { id: CLIENT },
      session: {},
      membership: { scope: 'tenant', platformRole: null, tenantId: ORG, tenantSlug: 'mapcard2', tenantRole: 'client', impersonatedBy: null },
    }
    expect((await app.request('/x')).status).toBe(200)
  })
})

describe('gate de assinatura do portal (requireClubSubscription)', () => {
  function portal() {
    state.session = {
      user: { id: CLIENT },
      session: {},
      membership: { scope: 'tenant', platformRole: null, tenantId: ORG, tenantSlug: 'mapcard2', tenantRole: 'client', impersonatedBy: null },
    }
    const app = new Hono()
      .use('*', requireAuth, requireTenantRole('client'))
      .get('/carteirinhas', requireClubSubscription(), c => c.text('ok'))
      .get('/cobrancas', requireClubSubscription({ allowPending: true }), c => c.text('ok'))
    app.onError(errorHandler)
    return app
  }

  it('sem assinatura: carteirinha e faturas → 403 SUBSCRIPTION_REQUIRED', async () => {
    state.access = { status: 'none', needsSubscription: true }
    const app = portal()
    for (const path of ['/carteirinhas', '/cobrancas']) {
      const response = await app.request(path)
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ error: { code: 'SUBSCRIPTION_REQUIRED' } })
    }
  })

  it('pagamento pendente: faturas abertas (é por elas que paga), carteirinha não', async () => {
    state.access = { status: 'pending_payment', needsSubscription: true }
    const app = portal()
    expect((await app.request('/cobrancas')).status).toBe(200)
    expect((await app.request('/carteirinhas')).status).toBe(403)
  })

  it('assinatura viva ou contrato: tudo liberado', async () => {
    for (const status of ['subscribed', 'contract']) {
      state.access = { status, needsSubscription: false }
      const app = portal()
      expect((await app.request('/carteirinhas')).status).toBe(200)
      expect((await app.request('/cobrancas')).status).toBe(200)
    }
  })
})
