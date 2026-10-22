import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Redefinição de senha pelo ADMIN DO CLUBE (`POST /t/:slug/usuarios/:id/redefinir-senha`):
 * escopo do clube, recusa usuário de outro clube e conta da plataforma, a
 * senha é gerada no servidor e só sai no e-mail (marca do clube, nunca a da
 * plataforma, nunca "trocar123"). Hono em memória, sem banco.
 */

const CLUB_A = { id: '11111111-1111-4111-8111-111111111111', slug: 'clube-a', name: 'Clube A' }
const CLUB_B = { id: '22222222-2222-4222-8222-222222222222', slug: 'clube-b', name: 'Clube B' }
const ADMIN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SELLER_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SELLER_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const STAFF_IN_A = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const INACTIVE_A = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
/** Conta com vínculo nos DOIS clubes (associada em A, admin em B). */
const SHARED = 'ffffffff-ffff-4fff-8fff-ffffffffffff'

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: {} } }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }))
vi.mock('@/modules/club-billing/onboarding.service', () => ({ sendOnboardingWelcome: vi.fn(async () => null) }))
vi.mock('@/integrations/digitalsaude/provider', () => ({ getDigitalSaudeClient: vi.fn() }))

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

vi.mock('@/http/middleware/tenant', () => ({
  resolveTenant: createMiddleware(async (c, next) => {
    const slug = c.req.param('tenantSlug')
    const tenant = [CLUB_A, CLUB_B].find(item => item.slug === slug)
    if (!tenant) return c.json({ error: { code: 'NOT_FOUND' } }, 404)
    c.set('tenant', tenant)
    await next()
  }),
  tenantOf: (c: { get: (key: 'tenant') => unknown }) => c.get('tenant'),
}))

/** Membros por clube (o que `findTarget` leria de `member` + `user`). */
const MEMBERS: Record<string, Record<string, { email: string; name: string; platformRole: string; tenantRole: 'admin' | 'seller' | 'client'; active: boolean }>> = {
  [CLUB_A.id]: {
    [ADMIN_A]: { email: 'admin@a.com', name: 'Ana Admin', platformRole: 'user', tenantRole: 'admin', active: true },
    [SELLER_A]: { email: 'vendedor@a.com', name: 'Vitor Vendedor', platformRole: 'user', tenantRole: 'seller', active: true },
    [STAFF_IN_A]: { email: 'suporte@annetec.com', name: 'Equipe', platformRole: 'superadmin', tenantRole: 'admin', active: true },
    [INACTIVE_A]: { email: 'saiu@a.com', name: 'Ex Vendedor', platformRole: 'user', tenantRole: 'seller', active: false },
    [SHARED]: { email: 'vitima@gmail.com', name: 'Vítima', platformRole: 'user', tenantRole: 'client', active: true },
  },
  [CLUB_B.id]: {
    [SELLER_B]: { email: 'vendedor@b.com', name: 'Beto', platformRole: 'user', tenantRole: 'seller', active: true },
    [SHARED]: { email: 'vitima@gmail.com', name: 'Vítima', platformRole: 'user', tenantRole: 'admin', active: true },
  },
}

const fakes = vi.hoisted(() => ({
  setPassword: null as unknown as ReturnType<typeof vi.fn>,
  revokeSessions: null as unknown as ReturnType<typeof vi.fn>,
  send: null as unknown as ReturnType<typeof vi.fn>,
}))

vi.mock('@/modules/users/access.service', async importOriginal => {
  const original = await importOriginal<typeof import('@/modules/users/access.service')>()
  return {
    ...original,
    resetTenantUserPassword: (tenantId: string, userId: string, actor: string | null) =>
      original.resetTenantUserPassword(tenantId, userId, actor, {
        findTarget: async (t, u) => {
          const found = MEMBERS[t]?.[u]
          return found ? { userId: u, ...found } : null
        },
        countOtherMemberships: async (t, u) =>
          Object.entries(MEMBERS).filter(([club, members]) => club !== t && members[u]).length,
        setPassword: (...args) => fakes.setPassword(...args),
        revokeSessions: (...args) => fakes.revokeSessions(...args),
        loadClub: async t => {
          const club = [CLUB_A, CLUB_B].find(item => item.id === t)
          return club ? { name: club.name, slug: club.slug, primaryColor: '#0055aa', logoUrl: null } : null
        },
        send: (...args) => fakes.send(...args),
        senderEmail: () => 'nao-responda@exemplo.com',
        baseUrl: 'https://app.exemplo.com',
      }),
  }
})

const { usersController } = await import('@/modules/users/controller')
const { generateProvisionalPassword } = await import('@/modules/users/access.service')
const { renderEmail } = await import('@/lib/email/templates')
const { errorHandler } = await import('@/http/errors')

const app = new Hono().route('/t/:tenantSlug/usuarios', usersController)
app.onError(errorHandler)

function tenantSession(userId: string, tenantId: string, tenantRole: 'admin' | 'seller' | 'client') {
  return { user: { id: userId }, membership: { scope: 'tenant' as const, tenantId, tenantRole, platformRole: null } }
}

async function reset(slug: string, userId: string) {
  const response = await app.request(`/t/${slug}/usuarios/${userId}/redefinir-senha`, { method: 'POST' })
  return { status: response.status, body: (await response.json()) as Record<string, any> }
}

beforeEach(() => {
  fakes.setPassword = vi.fn(async () => {})
  fakes.revokeSessions = vi.fn(async () => {})
  fakes.send = vi.fn(async () => ({ id: 'email-1', status: 'simulated' }))
  current.session = tenantSession(ADMIN_A, CLUB_A.id, 'admin')
})

describe('POST /t/:slug/usuarios/:id/redefinir-senha', () => {
  it('admin do clube redefine a senha de um vendedor do próprio clube; a senha só vai no e-mail', async () => {
    const { status, body } = await reset(CLUB_A.slug, SELLER_A)
    expect(status).toBe(200)
    expect(body.data).toEqual({ email: 'vendedor@a.com', emailStatus: 'simulated' })
    expect(JSON.stringify(body)).not.toMatch(/senha|password/i)

    expect(fakes.setPassword).toHaveBeenCalledTimes(1)
    const [userId, password] = fakes.setPassword.mock.calls[0]!
    expect(userId).toBe(SELLER_A)
    expect(password).toMatch(/^[A-Za-z2-9]{16}$/)
    expect(password).not.toBe('trocar123')
    expect(fakes.revokeSessions).toHaveBeenCalledWith(SELLER_A)

    const email = fakes.send.mock.calls[0]![0]
    expect(email.template).toBe('club_staff_password_reset')
    expect(email.to.email).toBe('vendedor@a.com')
    expect(email.organizationId).toBe(CLUB_A.id)
    expect(email.secrets).toEqual([password])
    expect(email.data.loginUrl).toBe('https://app.exemplo.com/clube-a/login')

    const rendered = renderEmail(email.template, email.data)
    expect(rendered.subject).toBe('Clube A: sua senha de acesso foi redefinida')
    expect(rendered.from).toBe('Clube A <nao-responda@exemplo.com>')
    expect(rendered.text).toContain(password)
    for (const body of [rendered.subject, rendered.text, rendered.html]) {
      expect(body).not.toMatch(/annetec/i)
      expect(body).not.toContain('trocar123')
    }
  })

  it('usuário de OUTRO clube = 404 e nada é alterado nem enviado', async () => {
    const { status } = await reset(CLUB_A.slug, SELLER_B)
    expect(status).toBe(404)
    expect(fakes.setPassword).not.toHaveBeenCalled()
    expect(fakes.send).not.toHaveBeenCalled()
  })

  it('admin do clube A pela URL do clube B = 403 (sessão não pertence ao inquilino)', async () => {
    const { status, body } = await reset(CLUB_B.slug, SELLER_B)
    expect(status).toBe(403)
    expect(body.error.code).toBe('TENANT_MISMATCH')
    expect(fakes.setPassword).not.toHaveBeenCalled()
  })

  it('conta da equipe da plataforma, mesmo vinculada ao clube = 403', async () => {
    const { status } = await reset(CLUB_A.slug, STAFF_IN_A)
    expect(status).toBe(403)
    expect(fakes.setPassword).not.toHaveBeenCalled()
    expect(fakes.send).not.toHaveBeenCalled()
  })

  it('conta que também está em OUTRO clube = 403: o admin de A não redefine a senha que a pessoa usa em B', async () => {
    const { status, body } = await reset(CLUB_A.slug, SHARED)
    expect(status).toBe(403)
    expect(body.error.message).toMatch(/outro clube/)
    expect(fakes.setPassword).not.toHaveBeenCalled()
    expect(fakes.revokeSessions).not.toHaveBeenCalled()
    expect(fakes.send).not.toHaveBeenCalled()
  })

  it('vínculo desativado no clube = 422 (reative antes)', async () => {
    const { status } = await reset(CLUB_A.slug, INACTIVE_A)
    expect(status).toBe(422)
    expect(fakes.setPassword).not.toHaveBeenCalled()
  })

  it('vendedor não pode redefinir senha de ninguém', async () => {
    current.session = tenantSession(SELLER_A, CLUB_A.id, 'seller')
    const { status } = await reset(CLUB_A.slug, ADMIN_A)
    expect(status).toBe(403)
    expect(fakes.setPassword).not.toHaveBeenCalled()
  })

  it('sessão de plataforma não usa esta rota (tem a rota própria)', async () => {
    current.session = {
      user: { id: 'platform-user' },
      membership: { scope: 'platform', tenantId: null, tenantRole: null, platformRole: 'superadmin' },
    }
    const { status } = await reset(CLUB_A.slug, SELLER_A)
    expect(status).toBe(403)
    expect(fakes.setPassword).not.toHaveBeenCalled()
  })

  it('admin redefinindo a própria senha não derruba a própria sessão', async () => {
    const { status } = await reset(CLUB_A.slug, ADMIN_A)
    expect(status).toBe(200)
    expect(fakes.setPassword).toHaveBeenCalledTimes(1)
    expect(fakes.revokeSessions).not.toHaveBeenCalled()
  })
})

describe('senha provisória e convite', () => {
  it('gera senhas fortes e distintas', () => {
    const passwords = new Set(Array.from({ length: 200 }, () => generateProvisionalPassword()))
    expect(passwords.size).toBe(200)
    for (const password of passwords) expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/)
  })

  it('convite de acesso sai com a marca do clube; sem senha quando a conta já existia', () => {
    const withPassword = renderEmail('club_staff_invite', {
      clubName: 'Clube A',
      holderName: 'Vitor Vendedor',
      roleLabel: 'Vendedor',
      loginUrl: 'https://app.exemplo.com/clube-a/login',
      loginEmail: 'vendedor@a.com',
      password: 'Xy7kQ2mN9pR4sT6v',
    })
    expect(withPassword.subject).toBe('Clube A: seu acesso foi criado')
    expect(withPassword.text).toContain('Senha provisória: Xy7kQ2mN9pR4sT6v')
    expect(withPassword.text).not.toMatch(/annetec/i)

    const reused = renderEmail('club_staff_invite', {
      clubName: 'Clube A',
      holderName: 'Vitor',
      loginEmail: 'vendedor@a.com',
      password: null,
    })
    expect(reused.text).not.toContain('Senha provisória')
    expect(reused.text).toContain('senha que você já usa')
  })
})
