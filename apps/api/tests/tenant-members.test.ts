import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Gestão de acessos do clube pela plataforma (aba Acessos):
 * responsáveis, desativar/reativar, remover e excluir conta.
 *
 * Regras cobertas: o clube nunca fica sem responsável ativo (conta comum),
 * conta da equipe da plataforma não vira responsável nem é excluída, sessões
 * caem na hora (só as do clube quando a pessoa tem outros vínculos), e a
 * remoção que quebraria histórico (venda como vendedor — `sales.seller_id`
 * RESTRICT — ou assinatura) só desativa. Banco substituído por um store em
 * memória; nenhum teste abre conexão.
 */

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: {} } }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }))
vi.mock('@/integrations/digitalsaude/provider', () => ({
  getDigitalSaudeClient: vi.fn(),
  invalidateDigitalSaudeClient: vi.fn(),
}))

const CLUB_A = '11111111-1111-4111-8111-111111111111'
const CLUB_B = '22222222-2222-4222-8222-222222222222'

type Role = 'admin' | 'seller' | 'client'
interface Store {
  users: Map<string, { id: string; email: string; name: string; platformRole: string }>
  members: Array<{ tenantId: string; userId: string; role: Role; active: boolean }>
  sessions: Array<{ id: string; userId: string; activeOrganizationId: string | null }>
  salesBySeller: Array<{ sellerId: string; tenantId: string }>
  subscriptions: Array<{ userId: string }>
  invites: Array<{ tenantId: string; userId: string; email: string; password: string | null }>
  seq: number
}

const holder = vi.hoisted(() => ({ store: null as unknown as Store }))

function emptyStore(): Store {
  return { users: new Map(), members: [], sessions: [], salesBySeller: [], subscriptions: [], invites: [], seq: 0 }
}

function addUser(id: string, email: string, platformRole = 'user') {
  holder.store.users.set(id, { id, email, name: email.split('@')[0]!, platformRole })
}
function addMember(tenantId: string, userId: string, role: Role, active = true) {
  holder.store.members.push({ tenantId, userId, role, active })
}
function addSession(userId: string, org: string | null) {
  holder.store.sessions.push({ id: `s${++holder.store.seq}`, userId, activeOrganizationId: org })
}

/** `MembersDeps` sobre o store em memória. */
function fakeDeps() {
  const s = holder.store
  const findMember = (tenantId: string, userId: string) => s.members.find(m => m.tenantId === tenantId && m.userId === userId)
  return {
    tenantExists: async (tenantId: string) => [CLUB_A, CLUB_B].includes(tenantId),
    findMember: async (tenantId: string, userId: string) => {
      const m = findMember(tenantId, userId)
      const u = s.users.get(userId)
      return m && u
        ? { userId, email: u.email, name: u.name, platformRole: u.platformRole, tenantRole: m.role, active: m.active }
        : null
    },
    findUserByEmail: async (email: string) => {
      const u = [...s.users.values()].find(item => item.email === email)
      return u ? { id: u.id, name: u.name, email: u.email, platformRole: u.platformRole } : null
    },
    createUser: vi.fn(async (email: string, name: string, _password: string) => {
      const id = `novo-${++s.seq}`
      s.users.set(id, { id, email, name, platformRole: 'user' })
      return { id }
    }),
    addAdminMembership: async (tenantId: string, userId: string) => addMember(tenantId, userId, 'admin'),
    setMembership: async (tenantId: string, userId: string, patch: { role?: 'admin'; active?: boolean }) => {
      const m = findMember(tenantId, userId)
      if (m) Object.assign(m, patch)
    },
    deleteMembership: async (tenantId: string, userId: string) => {
      s.members = s.members.filter(m => !(m.tenantId === tenantId && m.userId === userId))
    },
    deleteUser: vi.fn(async (userId: string) => {
      if (s.salesBySeller.some(sale => sale.sellerId === userId)) throw new Error('RESTRICT violado')
      s.users.delete(userId)
      s.members = s.members.filter(m => m.userId !== userId)
      s.sessions = s.sessions.filter(item => item.userId !== userId)
    }),
    loadHistory: async (tenantId: string, userId: string) => ({
      salesHere: s.salesBySeller.filter(sale => sale.sellerId === userId && sale.tenantId === tenantId).length,
      salesAnywhere: s.salesBySeller.filter(sale => sale.sellerId === userId).length,
      clubSubscriptions: s.subscriptions.filter(sub => sub.userId === userId).length,
    }),
    sendInvite: vi.fn(async (params: { tenantId: string; userId: string; email: string; password: string | null }) => {
      s.invites.push({ tenantId: params.tenantId, userId: params.userId, email: params.email, password: params.password })
      return { status: 'simulated' as const }
    }),
    generatePassword: () => 'SenhaGerada234567',
    countOtherActiveResponsibles: async (tenantId: string, userId: string) =>
      s.members.filter(
        m =>
          m.tenantId === tenantId &&
          m.userId !== userId &&
          m.role === 'admin' &&
          m.active &&
          s.users.get(m.userId)?.platformRole === 'user',
      ).length,
    countOtherMemberships: async (tenantId: string, userId: string) =>
      s.members.filter(m => m.userId === userId && m.tenantId !== tenantId).length,
    revokeSessions: async (userId: string, scope: { tenantId: string } | 'all') => {
      const before = s.sessions.length
      s.sessions = s.sessions.filter(
        item => !(item.userId === userId && (scope === 'all' || item.activeOrganizationId === scope.tenantId)),
      )
      return before - s.sessions.length
    },
  }
}

type Membership = { scope: 'platform' | 'tenant'; tenantId: string | null; tenantRole: string | null; platformRole: string | null }
const current = vi.hoisted(() => ({ session: null as null | { user: { id: string }; membership: Membership } }))

vi.mock('@/http/middleware/auth', async importOriginal => ({
  ...(await importOriginal<typeof import('@/http/middleware/auth')>()),
  requireAuth: createMiddleware(async (c, next) => {
    if (!current.session) return c.json({ error: { code: 'UNAUTHENTICATED' } }, 401)
    c.set('auth', current.session as never)
    await next()
  }),
}))

// As rotas usam o service de verdade, só com o banco trocado pelo store.
vi.mock('@/modules/tenants/members.service', async importOriginal => {
  const original = await importOriginal<typeof import('@/modules/tenants/members.service')>()
  const svc = original.tenantMembersService
  return {
    ...original,
    tenantMembersService: {
      ...svc,
      addResponsible: (t: string, input: { name: string; email: string }) => svc.addResponsible(t, input, fakeDeps() as never),
      setAccess: (t: string, u: string, a: boolean, actor: string | null) => svc.setAccess(t, u, a, actor, fakeDeps() as never),
      remove: (t: string, u: string, actor: string | null) => svc.remove(t, u, actor, fakeDeps() as never),
      getSummary: async (t: string, u: string) => {
        const m = await fakeDeps().findMember(t, u)
        return { id: u, name: m?.name, email: m?.email, role: m?.tenantRole, active: m?.active }
      },
    },
  }
})

const { tenantMembersService } = await import('@/modules/tenants/members.service')
const { decideRemoval, LAST_RESPONSIBLE_MESSAGE } = await import('@/modules/users/membership-rules')
const { tenantsController } = await import('@/modules/tenants/controller')
const { errorHandler } = await import('@/http/errors')
const { recordAudit } = await import('@/lib/audit')

// O mock acima embrulha o service; para os testes diretos usamos o original
// com o store explícito.
const svc = (await vi.importActual<typeof import('@/modules/tenants/members.service')>('@/modules/tenants/members.service'))
  .tenantMembersService

const app = new Hono().route('/platform/tenants', tenantsController)
app.onError(errorHandler)

function platformSession(platformRole: 'superadmin' | 'platform_admin') {
  return {
    user: { id: 'super-1' },
    membership: { scope: 'platform' as const, tenantId: null, tenantRole: null, platformRole },
  }
}

async function expectAppError(promise: Promise<unknown>, status: number, message?: RegExp) {
  const error = await promise.then(
    () => null,
    (err: unknown) => err as { status?: number; message?: string },
  )
  expect(error, 'esperava erro').not.toBeNull()
  expect(error!.status).toBe(status)
  if (message) expect(error!.message).toMatch(message)
}

beforeEach(() => {
  holder.store = emptyStore()
  vi.mocked(recordAudit).mockClear()
  current.session = platformSession('superadmin')
  addUser('ana', 'ana@a.com')
  addUser('bia', 'bia@a.com')
  addUser('staff', 'suporte@annetec.com', 'superadmin')
  addUser('vitor', 'vitor@a.com')
  addMember(CLUB_A, 'ana', 'admin')
  addMember(CLUB_A, 'staff', 'admin')
  addMember(CLUB_A, 'vitor', 'seller')
})

describe('último responsável ativo', () => {
  it('recusa desativar e remover o único admin ativo (admin da plataforma no clube não conta)', async () => {
    addSession('ana', CLUB_A)
    await expectAppError(svc.setAccess(CLUB_A, 'ana', false, 'super-1', fakeDeps() as never), 422, new RegExp(LAST_RESPONSIBLE_MESSAGE))
    await expectAppError(svc.remove(CLUB_A, 'ana', 'super-1', fakeDeps() as never), 422, new RegExp(LAST_RESPONSIBLE_MESSAGE))
    expect(holder.store.members.find(m => m.userId === 'ana')?.active).toBe(true)
    expect(holder.store.sessions).toHaveLength(1)
    expect(holder.store.users.has('ana')).toBe(true)
  })

  it('a própria pessoa não se desativa sendo a última; mensagem diz que é ela', async () => {
    await expectAppError(svc.setAccess(CLUB_A, 'ana', false, 'ana', fakeDeps() as never), 422, /Você é o único responsável ativo/)
  })

  it('com outro responsável ativo, desativa e reativa', async () => {
    addMember(CLUB_A, 'bia', 'admin')
    const off = await svc.setAccess(CLUB_A, 'ana', false, 'super-1', fakeDeps() as never)
    expect(off.active).toBe(false)
    // Agora a Bia é a última: desativá-la é recusado.
    await expectAppError(svc.setAccess(CLUB_A, 'bia', false, 'super-1', fakeDeps() as never), 422)
    const on = await svc.setAccess(CLUB_A, 'ana', true, 'super-1', fakeDeps() as never)
    expect(on.active).toBe(true)
    expect(holder.store.members.find(m => m.userId === 'ana')?.active).toBe(true)
  })

  it('vendedor e conta da plataforma podem ser desativados mesmo com um só admin', async () => {
    await expect(svc.setAccess(CLUB_A, 'vitor', false, 'super-1', fakeDeps() as never)).resolves.toMatchObject({ active: false })
    await expect(svc.setAccess(CLUB_A, 'staff', false, 'super-1', fakeDeps() as never)).resolves.toMatchObject({ active: false })
  })
})

describe('revogação de sessões', () => {
  it('único vínculo: derruba todas as sessões da pessoa', async () => {
    addSession('vitor', CLUB_A)
    addSession('vitor', null)
    const result = await svc.setAccess(CLUB_A, 'vitor', false, 'super-1', fakeDeps() as never)
    expect(result.revokedSessions).toBe(2)
    expect(holder.store.sessions.filter(item => item.userId === 'vitor')).toHaveLength(0)
  })

  it('com vínculo em outro clube: só as sessões deste clube caem', async () => {
    addMember(CLUB_B, 'vitor', 'seller')
    addSession('vitor', CLUB_A)
    addSession('vitor', CLUB_B)
    addSession('vitor', null)
    const result = await svc.setAccess(CLUB_A, 'vitor', false, 'super-1', fakeDeps() as never)
    expect(result.revokedSessions).toBe(1)
    expect(holder.store.sessions.map(item => item.activeOrganizationId).sort()).toEqual([CLUB_B, null].sort())
  })

  it('conta da plataforma nunca perde a sessão de plataforma', async () => {
    addSession('staff', null)
    addSession('staff', CLUB_A)
    await svc.setAccess(CLUB_A, 'staff', false, 'super-1', fakeDeps() as never)
    expect(holder.store.sessions.filter(item => item.userId === 'staff')).toEqual([
      expect.objectContaining({ activeOrganizationId: null }),
    ])
  })
})

describe('adicionar responsável', () => {
  it('e-mail novo: cria a conta, vincula como admin e manda convite com a senha gerada', async () => {
    const deps = fakeDeps()
    const result = await svc.addResponsible(CLUB_A, { name: 'Nova Pessoa', email: 'Nova@A.com' }, deps as never)
    expect(result.accountCreated).toBe(true)
    expect(deps.createUser).toHaveBeenCalledWith('nova@a.com', 'Nova Pessoa', 'SenhaGerada234567')
    expect(holder.store.members.find(m => m.userId === result.userId)).toMatchObject({ role: 'admin', active: true })
    expect(holder.store.invites).toEqual([
      { tenantId: CLUB_A, userId: result.userId, email: 'nova@a.com', password: 'SenhaGerada234567' },
    ])
  })

  it('conta comum existente: reaproveita, convite sem senha', async () => {
    const deps = fakeDeps()
    const result = await svc.addResponsible(CLUB_A, { name: 'Bia', email: 'bia@a.com' }, deps as never)
    expect(result).toMatchObject({ userId: 'bia', accountCreated: false })
    expect(deps.createUser).not.toHaveBeenCalled()
    expect(holder.store.invites[0]!.password).toBeNull()
  })

  it('membro com outro papel é promovido; admin já ativo dá 409', async () => {
    const result = await svc.addResponsible(CLUB_A, { name: 'Vitor', email: 'vitor@a.com' }, fakeDeps() as never)
    expect(result.previousRole).toBe('seller')
    expect(holder.store.members.find(m => m.userId === 'vitor')?.role).toBe('admin')
    await expectAppError(svc.addResponsible(CLUB_A, { name: 'Ana', email: 'ana@a.com' }, fakeDeps() as never), 409)
  })

  it('recusa e-mail de conta da plataforma (403) sem criar vínculo', async () => {
    await expectAppError(
      svc.addResponsible(CLUB_B, { name: 'Equipe', email: 'suporte@annetec.com' }, fakeDeps() as never),
      403,
      /equipe da plataforma/,
    )
    expect(holder.store.members.some(m => m.tenantId === CLUB_B)).toBe(false)
    expect(holder.store.invites).toHaveLength(0)
  })
})

describe('remover do clube', () => {
  it('sem outros vínculos: exclui a conta (cascata) e todas as sessões', async () => {
    addMember(CLUB_A, 'bia', 'admin')
    addSession('bia', CLUB_A)
    addSession('bia', null)
    const deps = fakeDeps()
    const result = await svc.remove(CLUB_A, 'bia', 'super-1', deps as never)
    expect(result).toMatchObject({ outcome: 'removed', accountDeleted: true, revokedSessions: 2 })
    expect(deps.deleteUser).toHaveBeenCalledWith('bia')
    expect(holder.store.users.has('bia')).toBe(false)
    expect(holder.store.members.some(m => m.userId === 'bia')).toBe(false)
  })

  it('com vínculo em outro clube: só o vínculo sai; a conta e a sessão do outro clube ficam', async () => {
    addMember(CLUB_B, 'vitor', 'client')
    addSession('vitor', CLUB_A)
    addSession('vitor', CLUB_B)
    const deps = fakeDeps()
    const result = await svc.remove(CLUB_A, 'vitor', 'super-1', deps as never)
    expect(result).toMatchObject({ outcome: 'removed', accountDeleted: false, revokedSessions: 1 })
    expect(deps.deleteUser).not.toHaveBeenCalled()
    expect(holder.store.users.has('vitor')).toBe(true)
    expect(holder.store.members.filter(m => m.userId === 'vitor').map(m => m.tenantId)).toEqual([CLUB_B])
  })

  it('conta da plataforma: só o vínculo sai, a conta nunca é excluída', async () => {
    const deps = fakeDeps()
    const result = await svc.remove(CLUB_A, 'staff', 'super-1', deps as never)
    expect(result).toMatchObject({ outcome: 'removed', accountDeleted: false })
    expect(holder.store.users.has('staff')).toBe(true)
  })

  it('vendedor com vendas (sales.seller_id RESTRICT): bloqueia, só desativa e derruba as sessões', async () => {
    holder.store.salesBySeller.push({ sellerId: 'vitor', tenantId: CLUB_A })
    addSession('vitor', CLUB_A)
    const deps = fakeDeps()
    const result = await svc.remove(CLUB_A, 'vitor', 'super-1', deps as never)
    expect(result).toMatchObject({ outcome: 'blocked', revokedSessions: 1 })
    expect(result.outcome === 'blocked' && result.reason).toMatch(/1 venda\(s\)/)
    expect(deps.deleteUser).not.toHaveBeenCalled()
    expect(holder.store.members.find(m => m.userId === 'vitor')).toMatchObject({ active: false })
  })

  it('o último responsável não sai nem por remoção', async () => {
    await expectAppError(svc.remove(CLUB_A, 'ana', 'ana', fakeDeps() as never), 422)
  })
})

describe('decideRemoval', () => {
  const none = { salesHere: 0, salesAnywhere: 0, clubSubscriptions: 0 }
  it('decide pelo vínculo, papel de plataforma e histórico', () => {
    expect(decideRemoval({ platformRole: 'user', otherMemberships: 0, history: none }).removal).toBe('delete_account')
    expect(decideRemoval({ platformRole: 'user', otherMemberships: 1, history: none }).removal).toBe('remove_membership')
    expect(decideRemoval({ platformRole: 'superadmin', otherMemberships: 0, history: none }).removal).toBe('remove_membership')
    // Vendas em outro clube só bloqueiam quando a conta seria excluída.
    expect(decideRemoval({ platformRole: 'user', otherMemberships: 0, history: { ...none, salesAnywhere: 3 } }).removal).toBe('blocked')
    expect(decideRemoval({ platformRole: 'user', otherMemberships: 1, history: { ...none, salesAnywhere: 3 } }).removal).toBe('remove_membership')
    expect(decideRemoval({ platformRole: 'user', otherMemberships: 0, history: { ...none, clubSubscriptions: 1 } }).removal).toBe('blocked')
    expect(decideRemoval({ platformRole: 'user', otherMemberships: 2, history: { ...none, salesHere: 1, salesAnywhere: 1 } }).removal).toBe('blocked')
  })
})

describe('rotas /platform/tenants/:id/…', () => {
  it('DELETE bloqueado responde 422 com o motivo, audita a desativação', async () => {
    holder.store.salesBySeller.push({ sellerId: 'vitor', tenantId: CLUB_A })
    const response = await app.request(`/platform/tenants/${CLUB_A}/usuarios/vitor`, { method: 'DELETE' })
    const body = (await response.json()) as { error: { message: string } }
    expect(response.status).toBe(422)
    expect(body.error.message).toMatch(/Não é possível remover vitor@a\.com: .*O acesso foi desativado no lugar/)
    expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'tenant_user.deactivated', organizationId: CLUB_A }),
    )
  })

  it('PATCH acesso do último admin responde 422', async () => {
    const response = await app.request(`/platform/tenants/${CLUB_A}/usuarios/ana/acesso`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: false }),
    })
    const body = (await response.json()) as { error: { message: string } }
    expect(response.status).toBe(422)
    expect(body.error.message).toContain(LAST_RESPONSIBLE_MESSAGE)
  })

  it('POST responsaveis com e-mail da plataforma responde 403', async () => {
    const response = await app.request(`/platform/tenants/${CLUB_A}/responsaveis`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Equipe', email: 'suporte@annetec.com' }),
    })
    expect(response.status).toBe(403)
  })

  it('platform_admin não remove nem desativa (superadmin only)', async () => {
    current.session = platformSession('platform_admin')
    const response = await app.request(`/platform/tenants/${CLUB_A}/usuarios/vitor`, { method: 'DELETE' })
    expect(response.status).toBe(403)
    expect(holder.store.members.some(m => m.userId === 'vitor')).toBe(true)
  })

  it('DELETE remove e exclui a conta quando era o único vínculo', async () => {
    addMember(CLUB_A, 'bia', 'admin')
    const response = await app.request(`/platform/tenants/${CLUB_A}/usuarios/bia`, { method: 'DELETE' })
    const body = (await response.json()) as { data: Record<string, unknown> }
    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({ userId: 'bia', accountDeleted: true })
    expect(vi.mocked(recordAudit)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'platform.user.deleted', resourceId: 'bia' }),
    )
  })
})
