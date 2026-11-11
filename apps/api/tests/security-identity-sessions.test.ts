import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Identidade global × clube (A1) e sessão de conta desativada (A6), com
 * banco e Better Auth falsos.
 *
 * A1 — a conta (`user`: nome, e-mail, telefone, senha) é GLOBAL. O admin do
 * clube A não pode, por `/t/A/usuarios`, trocar o e-mail de quem também está
 * no clube B (e depois redefinir a senha para o e-mail novo), nem puxar a
 * conta de outro clube para a equipe dele.
 *
 * A6 — conta desativada (`banned`) perde a sessão já aberta: as sessões são
 * apagadas na desativação e, mesmo que sobre alguma, não autentica.
 */

const ORG = '11111111-1111-4111-8111-111111111111'
const TARGET = '22222222-2222-4222-8222-222222222222'

const state = vi.hoisted(() => ({
  /** Linha que `findMembership`/`getById` devolvem. */
  row: null as null | { member: Record<string, unknown>; user: Record<string, unknown> },
  /** Conta com o e-mail que `findOrCreateAuthUser` procura. */
  existingUser: null as null | Record<string, unknown>,
  /** Vínculos da conta existente com outros clubes (create). */
  otherMembershipRows: 0,
  /** Outra conta já usa o e-mail novo. */
  emailInUse: false,
  /** Conta de plataforma lida por `platformUsersService.getById`. */
  platformUser: null as null | Record<string, unknown>,
  activeSuperadmins: 2,
  updates: [] as { table: string; values: Record<string, unknown> }[],
  session: null as unknown,
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

  const select = (selection?: Record<string, unknown>) =>
    chain(ops => {
      const from = ops.find(op => op.name === 'from')?.args[0]
      const keys = selection ? Object.keys(selection) : []
      if (from === schema.user) {
        if (keys.length === 1 && keys[0] === 'id') return state.emailInUse ? [{ id: 'outra-conta' }] : []
        if (keys.includes('value')) return [{ value: state.activeSuperadmins }]
        if (state.platformUser) return [state.platformUser]
        return state.existingUser ? [state.existingUser] : []
      }
      if (from === schema.member) {
        if (keys.length === 1 && keys[0] === 'userId') return [] // `create`: ainda não é membro deste clube
        if (keys.length === 1 && keys[0] === 'id') return state.otherMembershipRows > 0 ? [{ id: 'm-outro' }] : []
        return state.row ? [state.row] : []
      }
      throw new Error('Tabela inesperada no fake de banco')
    })

  const update = (table: unknown) =>
    chain(ops => {
      const values = ops.find(op => op.name === 'set')?.args[0] as Record<string, unknown>
      state.updates.push({ table: table === schema.user ? 'user' : table === schema.member ? 'member' : 'outra', values })
      if (table === schema.user && state.row) Object.assign(state.row.user, values)
      return []
    })

  const insert = () => chain(() => [])

  return { db: { select, selectDistinctOn: select, update, insert } }
})

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => state.session),
      addMember: vi.fn(async () => ({})),
      signUpEmail: vi.fn(async ({ body }: { body: { email: string; name: string } }) => ({
        user: { id: TARGET, email: body.email, name: body.name },
      })),
    },
  },
}))
vi.mock('@/integrations/digitalsaude/provider', () => ({ getDigitalSaudeClient: vi.fn() }))
vi.mock('@/modules/club-billing/access.service', () => ({ loadClubAccess: vi.fn() }))
// O perfil de vendedor na Rede Comercial tem teste próprio (vendas-rede-agente-solo.test.ts); aqui o banco falso não tem a tabela.
vi.mock('@/modules/vendas-rede/agente-solo', () => ({ garantirAgenteSolo: vi.fn(async () => ({})) }))

const { usersService } = await import('@/modules/users/service')
const { garantirAgenteSolo } = await import('@/modules/vendas-rede/agente-solo')
const { changedIdentityFields } = await import('@/modules/users/membership-rules')
const { isUserBanned, resolveActiveMembership } = await import('@/modules/auth/membership')
const { optionalAuth, requireAuth } = await import('@/http/middleware/auth')
const { platformUsersService } = await import('@/modules/platform-users/service')
const { auth } = await import('@/lib/auth')
const { errorHandler } = await import('@/http/errors')

function rowOf(role: 'admin' | 'seller' | 'client', user: Partial<Record<string, unknown>> = {}) {
  return {
    member: { organizationId: ORG, userId: TARGET, role, accessStatus: 'active', active: true, createdAt: new Date('2026-01-01') },
    user: {
      id: TARGET,
      name: 'Vítima',
      email: 'vitima@gmail.com',
      phone: '21999990000',
      role: 'user',
      image: null,
      banned: false,
      emailVerified: true,
      ...user,
    },
  }
}

/** Regras de vínculo: `others` = vínculos da conta com OUTROS clubes. */
function rules(others: number) {
  return {
    countOtherActiveResponsibles: async () => 1,
    countOtherMemberships: vi.fn(async () => others),
    revokeSessions: vi.fn(async () => 0),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.row = null
  state.existingUser = null
  state.otherMembershipRows = 0
  state.emailInUse = false
  state.platformUser = null
  state.activeSuperadmins = 2
  state.updates = []
  state.session = null
})

describe('A1 — PATCH /t/:slug/usuarios/:id não mexe em conta compartilhada', () => {
  it('trocar o e-mail de quem também está em OUTRO clube = 403 e nada é gravado', async () => {
    state.row = rowOf('client')
    await expect(
      usersService.update(ORG, TARGET, { email: 'atacante@evil.com' }, 'admin-a', rules(1)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(state.updates).toEqual([])
  })

  it('nome e telefone da conta compartilhada também não', async () => {
    state.row = rowOf('client')
    await expect(usersService.update(ORG, TARGET, { name: 'Outro Nome' }, 'admin-a', rules(1))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await expect(usersService.update(ORG, TARGET, { phone: '11888887777' }, 'admin-a', rules(1))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(state.updates).toEqual([])
  })

  it('conta da equipe da plataforma também é intocável pelo clube', async () => {
    state.row = rowOf('admin', { role: 'superadmin' })
    await expect(usersService.update(ORG, TARGET, { email: 'x@y.com' }, 'admin-a', rules(0))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('reenviar o formulário com os MESMOS dados (só mudando CPF) passa para conta compartilhada', async () => {
    state.row = rowOf('client')
    await usersService.update(
      ORG,
      TARGET,
      { name: 'Vítima', email: 'VITIMA@gmail.com', phone: '21999990000', cpf: '52998224725' },
      'admin-a',
      rules(1),
    )
    expect(state.updates.filter(u => u.table === 'user')).toEqual([])
  })

  it('conta SÓ deste clube: troca o e-mail (minúsculo) e ele volta a "não verificado"', async () => {
    state.row = rowOf('seller')
    await usersService.update(ORG, TARGET, { email: ' Novo@Exemplo.com ' }, 'admin-a', rules(0))
    const userUpdates = state.updates.filter(u => u.table === 'user')
    expect(userUpdates).toHaveLength(1)
    expect(userUpdates[0]!.values).toMatchObject({ email: 'novo@exemplo.com', emailVerified: false })
  })

  it('e-mail novo que já é de outra conta = 409, sem gravar', async () => {
    state.row = rowOf('seller')
    state.emailInUse = true
    await expect(usersService.update(ORG, TARGET, { email: 'ocupado@x.com' }, 'admin-a', rules(0))).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
    })
    expect(state.updates).toEqual([])
  })

  it('associado com conta compartilhada não vira equipe deste clube (422)', async () => {
    state.row = rowOf('client')
    await expect(usersService.update(ORG, TARGET, { role: 'admin' }, 'admin-a', rules(1))).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    })
    expect(state.updates).toEqual([])
  })

  it('campos que mudam de fato (puro)', () => {
    const atual = { name: 'Ana', email: 'ana@x.com', phone: null }
    expect(changedIdentityFields(atual, { name: 'Ana', email: 'ANA@x.com', phone: '' })).toEqual([])
    expect(changedIdentityFields(atual, { email: 'outra@x.com' })).toEqual(['email'])
    expect(changedIdentityFields(atual, { name: 'Bia', phone: '1199' })).toEqual(['name', 'phone'])
  })
})

describe('A1 — POST /t/:slug/usuarios com e-mail de conta de outro clube', () => {
  const input = { name: 'Qualquer', email: 'vitima@gmail.com', phone: '11000000000', active: true }

  it('como admin/vendedor = 422 e nenhum vínculo é criado', async () => {
    state.existingUser = rowOf('client').user
    state.otherMembershipRows = 1
    for (const role of ['admin', 'seller'] as const) {
      await expect(usersService.create(ORG, { ...input, role })).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
    }
    expect(auth.api.addMember).not.toHaveBeenCalled()
  })

  it('como associado passa (mesma pessoa em dois clubes), sem senha nova e sem reescrever o telefone da conta', async () => {
    state.existingUser = rowOf('client').user
    state.otherMembershipRows = 1
    state.row = rowOf('client')
    const { provisionalPassword } = await usersService.create(ORG, { ...input, role: 'client' })
    expect(provisionalPassword).toBeNull()
    expect(auth.api.addMember).toHaveBeenCalledTimes(1)
    expect(state.updates.filter(u => u.table === 'user')).toEqual([])
  })

  it('e-mail sem conta: cria a conta nova com senha provisória (fluxo normal intacto)', async () => {
    state.row = rowOf('seller')
    const { provisionalPassword } = await usersService.create(ORG, { ...input, email: 'novo@x.com', role: 'seller' })
    expect(provisionalPassword).toMatch(/^[A-Za-z2-9]{16}$/)
    expect(auth.api.signUpEmail).toHaveBeenCalledTimes(1)
    expect(auth.api.addMember).toHaveBeenCalledTimes(1)
    // Vendedor criado por Usuários nasce com perfil na Rede Comercial (senão entra e vê "acesso não liberado").
    expect(garantirAgenteSolo).toHaveBeenCalledWith(expect.objectContaining({ scope: 'tenant', tenantId: ORG }))
  })
})

describe('A6 — conta desativada não autentica', () => {
  it('banimento sem prazo vale; vencido não', () => {
    const agora = new Date('2026-10-22T12:00:00Z')
    expect(isUserBanned({ banned: true }, agora)).toBe(true)
    expect(isUserBanned({ banned: true, banExpires: new Date('2026-10-23T00:00:00Z') }, agora)).toBe(true)
    expect(isUserBanned({ banned: true, banExpires: new Date('2026-10-21T00:00:00Z') }, agora)).toBe(false)
    expect(isUserBanned({ banned: false }, agora)).toBe(false)
  })

  it('superadmin desativado não resolve papel de plataforma (nem de inquilino)', async () => {
    const membership = await resolveActiveMembership(
      { id: 'u1', role: 'superadmin', banned: true },
      { activeOrganizationId: ORG },
    )
    expect(membership).toMatchObject({ scope: 'tenant', platformRole: null, tenantId: null, tenantRole: null })
  })

  it('requireAuth: sessão aberta de conta desativada = 401; optionalAuth a trata como anônima', async () => {
    const app = new Hono()
    app.get('/privada', requireAuth, c => c.json({ ok: true }))
    app.get('/publica', optionalAuth, c => c.json({ logado: Boolean(c.get('auth' as never)) }))
    app.onError(errorHandler)

    state.session = {
      user: { id: 'u1', banned: true, banExpires: null },
      session: {},
      membership: { scope: 'platform', platformRole: 'superadmin', tenantId: null, tenantRole: null },
    }
    expect((await app.request('/privada')).status).toBe(401)
    expect(await (await app.request('/publica')).json()).toEqual({ logado: false })

    state.session = { ...(state.session as object), user: { id: 'u1', banned: false } }
    expect((await app.request('/privada')).status).toBe(200)
  })
})

describe('A6 — desativar/rebaixar conta da plataforma derruba as sessões', () => {
  function platformRow(role: 'superadmin' | 'platform_admin') {
    return { id: 'staff-1', name: 'Equipe', email: 'ops@annetec.com.br', phone: null, role, image: null, banned: false, createdAt: new Date() }
  }

  it('desativar revoga todas as sessões', async () => {
    state.platformUser = platformRow('platform_admin')
    const deps = { revokeAllSessions: vi.fn(async () => 3) }
    await platformUsersService.update('staff-1', { active: false }, 'super-1', deps)
    expect(deps.revokeAllSessions).toHaveBeenCalledWith('staff-1')
    expect(state.updates[0]!.values).toMatchObject({ banned: true })
  })

  it('rebaixar superadmin revoga as sessões', async () => {
    state.platformUser = platformRow('superadmin')
    const deps = { revokeAllSessions: vi.fn(async () => 1) }
    await platformUsersService.update('staff-1', { role: 'platform_admin' }, 'super-1', deps)
    expect(deps.revokeAllSessions).toHaveBeenCalledWith('staff-1')
  })

  it('só trocar nome/telefone não derruba ninguém', async () => {
    state.platformUser = platformRow('platform_admin')
    const deps = { revokeAllSessions: vi.fn(async () => 0) }
    await platformUsersService.update('staff-1', { name: 'Novo Nome' }, 'super-1', deps)
    expect(deps.revokeAllSessions).not.toHaveBeenCalled()
  })
})
