import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APIError } from 'better-auth/api'

/**
 * Login com Google (`authService.loginGoogle`) com Better Auth e banco FALSOS.
 * O `signInSocial` simulado reproduz a regra do Better Auth 1.7.2: conta
 * Google já vinculada (pelo `sub`) entra direto; senão procura a conta local
 * pelo e-mail EXATO do token e só vincula com e-mail verificado dos dois
 * lados ("account not linked" caso contrário); sem conta → "signup disabled",
 * a menos que o cadastro seja pedido explicitamente (`requestSignUp`).
 *
 * Invariantes que o incidente de 2026-10-09 (Google entrando no painel admin
 * do mapcard2) colocou sob teste:
 * - a sessão só abre para a conta com EXATAMENTE o e-mail verificado do token;
 * - nada escolhe conta por papel, por slug ou "primeiro membro";
 * - o atalho que marca a conta local como verificada exige o mesmo e-mail E
 *   vínculo com o slug pedido (ou poder virar associado dele);
 * - conta Google ligada a um usuário cujo e-mail é outro é recusada e a
 *   sessão aberta é revogada.
 *
 * E as do cadastro de associado pelo Google (onboarding "assine um plano"):
 * - e-mail novo, com slug e e-mail verificado → conta nova + vínculo SÓ
 *   `client` no clube do slug; sem slug, sem e-mail verificado ou com slug
 *   inexistente, recusa sem criar nada;
 * - associado de outro clube ganha vínculo `client` aqui;
 * - conta de plataforma ou admin/vendedor de outro clube NUNCA ganha vínculo.
 */

interface FakeUser {
  id: string
  email: string
  name: string
  emailVerified: boolean
  role: string | null
}

const state = vi.hoisted(() => ({
  users: [] as FakeUser[],
  orgs: [] as { id: string; slug: string }[],
  members: [] as { userId: string; organizationId: string; role: string; accessStatus?: string; onboardingRound?: number }[],
  audits: [] as { action: string; resourceId: string; metadata: Record<string, unknown> }[],
  /** `sub` do Google → userId (tabela `account`, providerId 'google'). */
  links: new Map<string, string>(),
  updates: [] as { values: Record<string, unknown>; params: unknown[] }[],
  deletes: [] as { table: 'account' | 'session'; params: unknown[] }[],
  signOuts: [] as string[],
  activeOrgs: [] as { token: string; organizationId: string }[],
}))

vi.mock('@/config/env', async importOriginal => ({
  ...(await importOriginal<typeof import('@/config/env')>()),
  googleLoginEnabled: true,
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

  return {
    db: {
      select: () =>
        chain(ops => {
          const table = ops.find(op => op.name === 'from')?.args[0]
          // Igualdade exata, como o Postgres: o fake só devolve linha cujo
          // valor aparece LITERALMENTE nos parâmetros do WHERE.
          const params = paramsOf(ops.find(op => op.name === 'where')?.args[0])
          if (table === schema.user) return state.users.filter(u => params.includes(u.email))
          if (table === schema.organization) return state.orgs.filter(o => params.includes(o.slug))
          if (table === schema.member) {
            // Cada coluna conhecida que aparece nos parâmetros do WHERE filtra.
            const orgFilter = state.orgs.some(o => params.includes(o.id))
            const roleFilter = ['admin', 'seller', 'client'].some(role => params.includes(role))
            return state.members
              .filter(
                m =>
                  params.includes(m.userId) &&
                  (!orgFilter || params.includes(m.organizationId)) &&
                  (!roleFilter || params.includes(m.role)),
              )
              .map(m => ({
                id: `${m.userId}:${m.organizationId}`,
                organizationId: m.organizationId,
                role: m.role,
                accessStatus: m.accessStatus ?? 'active',
                onboardingRound: m.onboardingRound ?? 1,
                createdAt: new Date(0),
              }))
          }
          throw new Error('Tabela inesperada no fake de banco')
        }),
      update: (table: unknown) =>
        chain(ops => {
          if (table === schema.member) {
            // Só a reativação do associado que voltou (`reopenAsClient`).
            const params = paramsOf(ops.find(op => op.name === 'where')?.args[0])
            const found = state.members.find(
              m =>
                params.includes(m.userId) &&
                params.includes(m.organizationId) &&
                m.role === 'client' &&
                (m.accessStatus ?? 'active') === 'removed',
            )
            if (!found) return []
            found.accessStatus = 'active'
            found.onboardingRound = (found.onboardingRound ?? 1) + 1
            return [{ round: found.onboardingRound }]
          }
          if (table !== schema.user) throw new Error('Update inesperado no fake de banco')
          const values = ops.find(op => op.name === 'set')?.args[0] as Record<string, unknown>
          const params = paramsOf(ops.find(op => op.name === 'where')?.args[0])
          state.updates.push({ values, params })
          for (const u of state.users) if (params.includes(u.id)) Object.assign(u, values)
          return []
        }),
      // Só a adoção da conta local pelo Google apaga: senha local e sessões.
      delete: (table: unknown) =>
        chain(ops => {
          const params = paramsOf(ops.find(op => op.name === 'where')?.args[0])
          if (table === schema.account) state.deletes.push({ table: 'account', params })
          else if (table === schema.session) state.deletes.push({ table: 'session', params })
          else throw new Error('Delete inesperado no fake de banco')
          return [{ id: 'removido' }]
        }),
    },
  }
})

function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>
}

const tokenOf = (userId: string) => `sess-${userId}`
const userIdOfHeaders = (headers: Headers) => headers.get('authorization')!.replace('Bearer sess-', '')

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      signInSocial: vi.fn(async ({ body }: { body: { idToken: { token: string }; requestSignUp?: boolean } }) => {
        const claims = claimsOf(body.idToken.token)
        const sub = String(claims.sub)
        const email = String(claims.email).toLowerCase()
        let userId = state.links.get(sub)
        if (!userId) {
          const local = state.users.find(u => u.email === email)
          if (!local && body.requestSignUp) {
            // `disableImplicitSignUp && !requestSignUp`: só cria com o pedido explícito.
            const created: FakeUser = {
              id: `u-novo-${sub}`,
              email,
              name: String(claims.name ?? ''),
              emailVerified: claims.email_verified === true,
              role: 'user',
            }
            state.users.push(created)
            state.links.set(sub, created.id)
            return { redirect: false, token: tokenOf(created.id), user: { ...created } }
          }
          if (!local) throw new APIError('UNAUTHORIZED', { message: 'signup disabled', code: 'OAUTH_LINK_ERROR' })
          if (claims.email_verified !== true || !local.emailVerified) {
            throw new APIError('UNAUTHORIZED', { message: 'account not linked', code: 'OAUTH_LINK_ERROR' })
          }
          state.links.set(sub, local.id)
          userId = local.id
        }
        const linked = state.users.find(u => u.id === userId)!
        return { redirect: false, token: tokenOf(linked.id), user: { ...linked } }
      }),
      getSession: vi.fn(async ({ headers }: { headers: Headers }) => {
        const userId = userIdOfHeaders(headers)
        const u = state.users.find(candidate => candidate.id === userId)
        if (!u) return null
        const active = state.activeOrgs.find(a => a.token === tokenOf(userId))
        const platform = u.role === 'superadmin' || u.role === 'platform_admin'
        const role = state.members.find(m => m.userId === userId && m.organizationId === active?.organizationId)?.role ?? null
        return {
          user: { ...u },
          session: { token: tokenOf(userId), activeOrganizationId: active?.organizationId ?? null },
          membership: platform
            ? { scope: 'platform', platformRole: u.role, tenantId: null, tenantRole: null }
            : { scope: 'tenant', tenantId: active?.organizationId ?? null, tenantRole: role },
        }
      }),
      setActiveOrganization: vi.fn(
        async ({ headers, body }: { headers: Headers; body: { organizationId: string } }) => {
          state.activeOrgs.push({ token: tokenOf(userIdOfHeaders(headers)), organizationId: body.organizationId })
        },
      ),
      signOut: vi.fn(async ({ headers }: { headers: Headers }) => {
        state.signOuts.push(tokenOf(userIdOfHeaders(headers)))
      }),
      // Login por senha: toda conta do fake tem a senha 'senha-certa'.
      signInEmail: vi.fn(async ({ body }: { body: { email: string; password: string } }) => {
        const u = state.users.find(candidate => candidate.email === body.email.toLowerCase())
        if (!u || body.password !== 'senha-certa') throw new APIError('UNAUTHORIZED', { message: 'Invalid email or password' })
        return { token: tokenOf(u.id), user: { ...u } }
      }),
      // Portal CPF + e-mail: o plugin real é exercitado em member-access.test.ts;
      // aqui só a tradução do erro que ele lança para vínculo bloqueado.
      signInClientPortal: vi.fn(async () => {
        throw new APIError('FORBIDDEN', { message: 'Acesso indisponível. Fale com o clube.', code: 'ACCESS_UNAVAILABLE' })
      }),
      addMember: vi.fn(async ({ body }: { body: { userId: string; organizationId: string; role: string } }) => {
        state.members.push({ userId: body.userId, organizationId: body.organizationId, role: body.role })
        return { id: `${body.userId}:${body.organizationId}` }
      }),
    },
  },
}))

vi.mock('@/lib/audit', () => ({
  recordAudit: vi.fn(async () => {}),
  recordSystemAudit: vi.fn(async (entry: { action: string; resourceId: string; metadata: Record<string, unknown> }) => {
    state.audits.push(entry)
  }),
}))
vi.mock('@/lib/background', () => ({ runInBackground: vi.fn() }))

const { authService } = await import('@/modules/auth/service')
const { auth } = await import('@/lib/auth')

/** ID token falso (o fake do Better Auth "valida" qualquer um). */
function googleToken(claims: { sub: string; email: string; email_verified: boolean; name?: string }): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: 'https://accounts.google.com', ...claims })}.assinatura`
}

const NOT_LINKED = 'Esta conta Google não tem vínculo com este clube'
const STAFF =
  'Este e-mail já é usado por uma conta administrativa e não pode ser cadastrado como associado deste clube. Entre com outro e-mail do Google.'

beforeEach(() => {
  vi.clearAllMocks()
  state.users = [
    // Admin do mapcard2 criado pela plataforma, e-mail ainda não verificado.
    { id: 'u-vsiago24', email: 'vsiago24@gmail.com', name: 'Admin MapCard2', emailVerified: false, role: 'user' },
    // Outro admin do mesmo clube, já verificado.
    { id: 'u-admin', email: 'admin@mapcard2.com.br', name: 'Administrador MapCard2', emailVerified: true, role: 'user' },
    // Associado de OUTRO clube, não verificado.
    { id: 'u-outro', email: 'fulano@gmail.com', name: 'Fulano', emailVerified: false, role: 'user' },
    // Associada de OUTRO clube, já verificada.
    { id: 'u-beltrana', email: 'beltrana@gmail.com', name: 'Beltrana', emailVerified: true, role: 'user' },
    // Equipe da plataforma.
    { id: 'u-plataforma', email: 'ops@annetec.com.br', name: 'Ops', emailVerified: true, role: 'superadmin' },
    // Vendedora de OUTRO clube, já verificada.
    { id: 'u-vendedora', email: 'vendas@outro.com.br', name: 'Vendedora', emailVerified: true, role: 'user' },
  ]
  state.orgs = [
    { id: 'org-mapcard2', slug: 'mapcard2' },
    { id: 'org-outro', slug: 'outro' },
  ]
  state.members = [
    { userId: 'u-vsiago24', organizationId: 'org-mapcard2', role: 'admin' },
    { userId: 'u-admin', organizationId: 'org-mapcard2', role: 'admin' },
    { userId: 'u-outro', organizationId: 'org-outro', role: 'client' },
    { userId: 'u-beltrana', organizationId: 'org-outro', role: 'client' },
    { userId: 'u-vendedora', organizationId: 'org-outro', role: 'seller' },
  ]
  state.links = new Map()
  state.updates = []
  state.deletes = []
  state.signOuts = []
  state.activeOrgs = []
  state.audits = []
})

describe('login com Google — resolução de conta', () => {
  it('vincula só a conta com o MESMO e-mail (sem diferenciar maiúsculas) e não toca nas outras', async () => {
    const idToken = googleToken({ sub: 'g-vsiago24', email: 'VSiago24@Gmail.com', email_verified: true })

    const { token, session, onboarding } = await authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })

    expect(token).toBe(tokenOf('u-vsiago24'))
    expect(session.user.email).toBe('vsiago24@gmail.com')
    expect(onboarding).toEqual({ accountCreated: false, joinedOrganizationId: null })
    expect(state.links.get('g-vsiago24')).toBe('u-vsiago24')
    // O atalho só marcou como verificada a própria conta do e-mail…
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]!.params).toContain('u-vsiago24')
    expect(state.updates[0]!.values).not.toHaveProperty('email')
    expect(state.updates[0]!.values).not.toHaveProperty('name')
    // …e nada do Google sobrescreveu nome/e-mail da conta local.
    expect(state.users.find(u => u.id === 'u-vsiago24')).toMatchObject({
      email: 'vsiago24@gmail.com',
      name: 'Admin MapCard2',
    })
    expect(state.users.find(u => u.id === 'u-admin')).toMatchObject({ email: 'admin@mapcard2.com.br' })
    expect(auth.api.addMember).not.toHaveBeenCalled()
  })

  it('adotar conta local NÃO verificada apaga a senha local e todas as sessões dela antes de vincular', async () => {
    // Cadastro antecipado: alguém criou a conta com o e-mail de outra pessoa e
    // conhece a senha. Quando o dono do e-mail entra pelo Google, a senha e as
    // sessões antigas deixam de valer.
    const idToken = googleToken({ sub: 'g-vsiago24', email: 'vsiago24@gmail.com', email_verified: true })

    await authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })

    expect(state.deletes.map(d => d.table)).toEqual(['account', 'session'])
    const [senha, sessoes] = state.deletes
    expect(senha!.params).toEqual(expect.arrayContaining(['u-vsiago24', 'credential']))
    expect(sessoes!.params).toEqual(['u-vsiago24'])
    // Nada de outra conta foi tocado.
    for (const d of state.deletes) expect(d.params).not.toContain('u-admin')
  })

  it('conta local JÁ verificada não é adotada por este atalho: nada é apagado', async () => {
    const idToken = googleToken({ sub: 'g-admin', email: 'admin@mapcard2.com.br', email_verified: true })

    await authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })

    expect(state.deletes).toEqual([])
    expect(state.updates).toEqual([])
  })

  it('não adota conta local quando o login vem sem slug', async () => {
    const idToken = googleToken({ sub: 'g-vsiago24', email: 'vsiago24@gmail.com', email_verified: true })

    await expect(authService.loginGoogle({ idToken })).rejects.toMatchObject({ message: NOT_LINKED })
    expect(state.updates).toEqual([])
    expect(state.deletes).toEqual([])
  })

  it('não adota conta local quando o Google não afirma e-mail verificado', async () => {
    const idToken = googleToken({ sub: 'g-vsiago24', email: 'vsiago24@gmail.com', email_verified: false })

    await expect(authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })).rejects.toMatchObject({
      message: NOT_LINKED,
    })
    expect(state.updates).toEqual([])
  })

  it('Google já vinculado a uma conta de OUTRO e-mail é recusado e a sessão aberta é revogada', async () => {
    // Ex.: a conta local trocou de e-mail depois do vínculo, ou um vínculo
    // que não nasceu do e-mail exato. O Better Auth abre a sessão pelo `sub`.
    state.links.set('g-intruso', 'u-admin')
    const idToken = googleToken({ sub: 'g-intruso', email: 'vsiago24@gmail.com', email_verified: true })

    await expect(authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: NOT_LINKED,
    })
    expect(state.signOuts).toEqual([tokenOf('u-admin')])
    expect(auth.api.setActiveOrganization).not.toHaveBeenCalled()
  })

  it('Google já vinculado com o mesmo e-mail, mas token sem e-mail verificado, é recusado', async () => {
    state.links.set('g-admin', 'u-admin')
    const idToken = googleToken({ sub: 'g-admin', email: 'admin@mapcard2.com.br', email_verified: false })

    await expect(authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })).rejects.toMatchObject({
      message: NOT_LINKED,
    })
    expect(state.signOuts).toEqual([tokenOf('u-admin')])
  })

  it('Google já vinculado com o mesmo e-mail entra no slug do vínculo', async () => {
    state.links.set('g-admin', 'u-admin')
    const idToken = googleToken({ sub: 'g-admin', email: 'admin@mapcard2.com.br', email_verified: true })

    const { session, onboarding } = await authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })

    expect(session.user.id).toBe('u-admin')
    expect(state.activeOrgs).toEqual([{ token: tokenOf('u-admin'), organizationId: 'org-mapcard2' }])
    // Já é membro (admin): nenhum vínculo novo, papel intacto.
    expect(onboarding).toEqual({ accountCreated: false, joinedOrganizationId: null })
    expect(auth.api.addMember).not.toHaveBeenCalled()
    expect(state.members.filter(m => m.userId === 'u-admin')).toEqual([
      { userId: 'u-admin', organizationId: 'org-mapcard2', role: 'admin' },
    ])
  })

  it('admin de um clube, sem vínculo com o slug pedido, é recusado (sem virar associado) e a sessão revogada', async () => {
    state.links.set('g-admin', 'u-admin')
    const idToken = googleToken({ sub: 'g-admin', email: 'admin@mapcard2.com.br', email_verified: true })

    await expect(authService.loginGoogle({ idToken, tenantSlug: 'outro' })).rejects.toMatchObject({
      message: STAFF,
    })
    expect(state.signOuts).toEqual([tokenOf('u-admin')])
    expect(auth.api.addMember).not.toHaveBeenCalled()
    expect(auth.api.setActiveOrganization).not.toHaveBeenCalled()
  })
})

describe('login com Google — cadastro de associado na tela do clube', () => {
  it('e-mail sem conta cria conta nova SÓ como associado deste clube (nunca cai em outro admin)', async () => {
    const idToken = googleToken({ sub: 'g-novo', email: 'Nova.Pessoa@gmail.com', email_verified: true, name: 'Nova Pessoa' })

    const { token, session, onboarding } = await authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })

    const created = state.users.find(u => u.email === 'nova.pessoa@gmail.com')!
    expect(created).toMatchObject({ name: 'Nova Pessoa', emailVerified: true, role: 'user' })
    expect(token).toBe(tokenOf(created.id))
    expect(session.user.id).toBe(created.id)
    expect(onboarding).toEqual({ accountCreated: true, joinedOrganizationId: 'org-mapcard2' })
    // Um único vínculo, papel client, no clube do slug.
    expect(state.members.filter(m => m.userId === created.id)).toEqual([
      { userId: created.id, organizationId: 'org-mapcard2', role: 'client' },
    ])
    expect(auth.api.addMember).toHaveBeenCalledTimes(1)
    expect(state.activeOrgs).toEqual([{ token: tokenOf(created.id), organizationId: 'org-mapcard2' }])
    // O cadastro foi pedido explicitamente, só depois da recusa "signup disabled".
    const requested = vi
      .mocked(auth.api.signInSocial)
      .mock.calls.map(call => (call[0] as { body: { requestSignUp?: boolean } }).body.requestSignUp)
    expect(requested).toEqual([undefined, true])
    // Nenhuma conta existente foi tocada.
    expect(state.updates).toEqual([])
    expect(state.signOuts).toEqual([])
  })

  it('sem slug (login global), e-mail sem conta é recusado sem criar conta', async () => {
    const idToken = googleToken({ sub: 'g-estranho', email: 'qualquer@gmail.com', email_verified: true })

    await expect(authService.loginGoogle({ idToken })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: NOT_LINKED,
    })
    expect(state.users.some(u => u.email === 'qualquer@gmail.com')).toBe(false)
    expect(auth.api.signInSocial).toHaveBeenCalledTimes(1)
    expect(auth.api.addMember).not.toHaveBeenCalled()
    expect(auth.api.setActiveOrganization).not.toHaveBeenCalled()
  })

  it('e-mail NÃO verificado pelo Google é recusado sem criar conta', async () => {
    const idToken = googleToken({ sub: 'g-naoverificado', email: 'naoverificado@gmail.com', email_verified: false })

    await expect(authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })).rejects.toMatchObject({
      message: NOT_LINKED,
    })
    expect(state.users.some(u => u.email === 'naoverificado@gmail.com')).toBe(false)
    expect(auth.api.signInSocial).toHaveBeenCalledTimes(1)
    expect(auth.api.addMember).not.toHaveBeenCalled()
  })

  it('slug inexistente é recusado sem criar conta', async () => {
    const idToken = googleToken({ sub: 'g-x', email: 'x@gmail.com', email_verified: true })

    await expect(authService.loginGoogle({ idToken, tenantSlug: 'nao-existe' })).rejects.toMatchObject({
      message: NOT_LINKED,
    })
    expect(state.users.some(u => u.email === 'x@gmail.com')).toBe(false)
    expect(auth.api.addMember).not.toHaveBeenCalled()
  })

  it('associado de OUTRO clube (conta não verificada) ganha vínculo client neste clube', async () => {
    const idToken = googleToken({ sub: 'g-fulano', email: 'fulano@gmail.com', email_verified: true })

    const { session, onboarding } = await authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })

    expect(session.user.id).toBe('u-outro')
    expect(onboarding).toEqual({ accountCreated: false, joinedOrganizationId: 'org-mapcard2' })
    expect(state.links.get('g-fulano')).toBe('u-outro')
    // Só a própria conta foi marcada como verificada (o Google provou o e-mail).
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0]!.params).toContain('u-outro')
    expect(state.members.filter(m => m.userId === 'u-outro')).toEqual([
      { userId: 'u-outro', organizationId: 'org-outro', role: 'client' },
      { userId: 'u-outro', organizationId: 'org-mapcard2', role: 'client' },
    ])
    expect(state.activeOrgs).toEqual([{ token: tokenOf('u-outro'), organizationId: 'org-mapcard2' }])
  })

  it('associada de OUTRO clube (conta verificada) ganha vínculo client neste clube', async () => {
    const idToken = googleToken({ sub: 'g-beltrana', email: 'beltrana@gmail.com', email_verified: true })

    const { session, onboarding } = await authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })

    expect(session.user.id).toBe('u-beltrana')
    expect(onboarding.joinedOrganizationId).toBe('org-mapcard2')
    expect(state.members.filter(m => m.userId === 'u-beltrana').map(m => m.role)).toEqual(['client', 'client'])
    expect(state.updates).toEqual([])
  })

  it('conta de PLATAFORMA não ganha vínculo com o clube: recusa clara e sessão revogada', async () => {
    const idToken = googleToken({ sub: 'g-ops', email: 'ops@annetec.com.br', email_verified: true })

    await expect(authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: STAFF,
    })
    expect(auth.api.addMember).not.toHaveBeenCalled()
    expect(state.members.some(m => m.userId === 'u-plataforma')).toBe(false)
    expect(state.signOuts).toEqual([tokenOf('u-plataforma')])
  })

  it('VENDEDORA de outro clube não ganha vínculo client: recusa clara e sessão revogada', async () => {
    const idToken = googleToken({ sub: 'g-vendedora', email: 'vendas@outro.com.br', email_verified: true })

    await expect(authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })).rejects.toMatchObject({
      message: STAFF,
    })
    expect(auth.api.addMember).not.toHaveBeenCalled()
    expect(state.members.filter(m => m.userId === 'u-vendedora')).toEqual([
      { userId: 'u-vendedora', organizationId: 'org-outro', role: 'seller' },
    ])
    expect(state.signOuts).toEqual([tokenOf('u-vendedora')])
  })

  it('ADMIN de outro clube com conta não verificada: recusa clara sem marcar verificado nem vincular', async () => {
    const idToken = googleToken({ sub: 'g-vsiago24', email: 'vsiago24@gmail.com', email_verified: true })

    await expect(authService.loginGoogle({ idToken, tenantSlug: 'outro' })).rejects.toMatchObject({
      message: STAFF,
    })
    expect(state.updates).toEqual([])
    expect(state.deletes).toEqual([])
    expect(state.links.size).toBe(0)
    expect(auth.api.addMember).not.toHaveBeenCalled()
  })
})

describe('vínculo com o clube (excluído / bloqueado) em todos os logins', () => {
  const UNAVAILABLE = { code: 'ACCESS_UNAVAILABLE', message: 'Acesso indisponível. Fale com o clube.' }

  it('Google: associado BLOQUEADO é recusado com a mensagem genérica e a sessão é revogada', async () => {
    state.members.push({ userId: 'u-beltrana', organizationId: 'org-mapcard2', role: 'client', accessStatus: 'blocked' })
    const idToken = googleToken({ sub: 'g-beltrana', email: 'beltrana@gmail.com', email_verified: true })

    await expect(authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })).rejects.toMatchObject(UNAVAILABLE)
    expect(state.signOuts).toEqual([tokenOf('u-beltrana')])
    expect(state.activeOrgs).toEqual([])
    expect(auth.api.addMember).not.toHaveBeenCalled()
  })

  it('Google: associado EXCLUÍDO volta — mesmo id e mesmo vínculo reativados, auditoria client.returned e régua nova', async () => {
    state.members.push({ userId: 'u-beltrana', organizationId: 'org-mapcard2', role: 'client', accessStatus: 'removed' })
    const idToken = googleToken({ sub: 'g-beltrana', email: 'beltrana@gmail.com', email_verified: true })

    const { session, onboarding } = await authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })

    expect(session.user.id).toBe('u-beltrana')
    expect(session.membership).toMatchObject({ tenantId: 'org-mapcard2', tenantRole: 'client' })
    // Nenhum vínculo novo: o mesmo `member` voltou a `active`, na rodada 2 da régua.
    expect(auth.api.addMember).not.toHaveBeenCalled()
    expect(onboarding.joinedOrganizationId).toBeNull()
    expect(state.members.filter(m => m.userId === 'u-beltrana' && m.organizationId === 'org-mapcard2')).toEqual([
      { userId: 'u-beltrana', organizationId: 'org-mapcard2', role: 'client', accessStatus: 'active', onboardingRound: 2 },
    ])
    expect(state.audits).toEqual([
      expect.objectContaining({
        action: 'client.returned',
        resourceId: 'u-beltrana',
        metadata: expect.objectContaining({ via: 'google', rodadaOnboarding: 2, assinaturaExigida: true }),
      }),
    ])
    expect(state.signOuts).toEqual([])
  })

  it('Google: ADMIN desligado do clube não reabre sessão (equipe só volta pelo admin)', async () => {
    state.members.find(m => m.userId === 'u-admin')!.accessStatus = 'removed'
    const idToken = googleToken({ sub: 'g-admin', email: 'admin@mapcard2.com.br', email_verified: true })

    await expect(authService.loginGoogle({ idToken, tenantSlug: 'mapcard2' })).rejects.toMatchObject(UNAVAILABLE)
    expect(state.signOuts).toEqual([tokenOf('u-admin')])
    expect(state.activeOrgs).toEqual([])
  })

  it('senha: associado BLOQUEADO é recusado (com e sem slug) e a sessão é revogada', async () => {
    state.members.find(m => m.userId === 'u-beltrana')!.accessStatus = 'blocked'

    await expect(
      authService.login({ email: 'beltrana@gmail.com', password: 'senha-certa', tenantSlug: 'outro' }),
    ).rejects.toMatchObject(UNAVAILABLE)
    await expect(authService.login({ email: 'beltrana@gmail.com', password: 'senha-certa' })).rejects.toMatchObject(
      UNAVAILABLE,
    )
    expect(state.signOuts).toEqual([tokenOf('u-beltrana'), tokenOf('u-beltrana')])
    expect(state.activeOrgs).toEqual([])
  })

  it('senha: associado EXCLUÍDO entra reativando o mesmo vínculo', async () => {
    state.members.find(m => m.userId === 'u-beltrana')!.accessStatus = 'removed'

    const { session } = await authService.login({ email: 'beltrana@gmail.com', password: 'senha-certa' })

    expect(session.user.id).toBe('u-beltrana')
    expect(session.membership).toMatchObject({ tenantId: 'org-outro', tenantRole: 'client' })
    expect(state.members.find(m => m.userId === 'u-beltrana')).toMatchObject({ accessStatus: 'active', onboardingRound: 2 })
    expect(state.audits.map(a => a.action)).toEqual(['client.returned'])
  })

  it('senha: VENDEDORA e ADMIN inativos são recusados — nunca abre sessão de equipe desligada', async () => {
    state.members.find(m => m.userId === 'u-vendedora')!.accessStatus = 'removed'
    state.members.find(m => m.userId === 'u-admin')!.accessStatus = 'removed'

    await expect(authService.login({ email: 'vendas@outro.com.br', password: 'senha-certa' })).rejects.toMatchObject(
      UNAVAILABLE,
    )
    await expect(
      authService.login({ email: 'admin@mapcard2.com.br', password: 'senha-certa', tenantSlug: 'mapcard2' }),
    ).rejects.toMatchObject(UNAVAILABLE)
    expect(state.activeOrgs).toEqual([])
    expect(state.audits).toEqual([])
  })

  it('senha sem slug: com um vínculo ativo e outro bloqueado, entra pelo ativo', async () => {
    state.members.push({ userId: 'u-beltrana', organizationId: 'org-mapcard2', role: 'client', accessStatus: 'blocked' })

    const { session } = await authService.login({ email: 'beltrana@gmail.com', password: 'senha-certa' })

    expect(session.membership).toMatchObject({ tenantId: 'org-outro' })
  })

  it('portal CPF + e-mail: vínculo bloqueado vira ACCESS_UNAVAILABLE e não tenta outro clube', async () => {
    await expect(
      authService.loginClientPortal({ cpf: '12345678909', email: 'beltrana@gmail.com', tenantSlug: 'outro' }),
    ).rejects.toMatchObject(UNAVAILABLE)
    expect(auth.api.signInClientPortal).toHaveBeenCalledTimes(1)
  })
})
