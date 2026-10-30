import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Autorização do papel `platform_seller` (vendedor ANNETEC) — o ponto mais
 * crítico da área de vendas. Usa o APP INTEIRO (`createApp`, todas as rotas
 * reais e os guards reais) com sessão falsa e um banco que FALHA se for
 * tocado: um 403 aqui prova que o guard barrou ANTES de qualquer leitura.
 *
 *  - toda rota `/api/v1/platform/*` que não é `/vendas` responde 403 ao vendedor
 *    (inventário automático de `routes`, não lista escrita à mão);
 *  - toda rota autenticada de clube `/api/v1/t/:slug/*` (regra A5) também;
 *  - a equipe não entra na área do vendedor;
 *  - o login devolve `scope: 'platform'` + `platformRole: 'platform_seller'`.
 */

const state = vi.hoisted(() => ({ session: null as unknown, dbTouched: [] as string[] }))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const explode = (name: string) => () => {
    state.dbTouched.push(name)
    throw new Error(`banco tocado no teste de autorização (${name})`)
  }
  const db = new Proxy({}, { get: (_t, prop) => explode(String(prop)) })
  return { db, sql: { end: async () => {} }, schema }
})
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => state.session) } } }))
vi.mock('@/http/middleware/tenant', () => ({
  resolveTenant: createMiddleware(async (c, next) => {
    c.set('tenant', { id: 'org-clube-a', slug: c.req.param('tenantSlug') ?? 'clube-a', name: 'Clube A', kind: 'operator' })
    await next()
  }),
  tenantOf: (c: { get: (key: 'tenant') => unknown }) => c.get('tenant'),
}))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}), recordSystemAudit: vi.fn(async () => {}) }))
vi.mock('@/modules/activity/service', () => ({ activityService: { record: vi.fn(async () => {}) } }))
vi.mock('@/lib/background', () => ({ runInBackground: vi.fn() }))
const login = vi.hoisted(() => vi.fn())
vi.mock('@/modules/auth/service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/auth/service')>()),
  authService: { login: (...args: unknown[]) => login(...args) },
}))

const { createApp } = await import('@/app')
const { routes } = await import('@/routes')
const { platformMayAccess } = await import('@/http/middleware/auth')
const { resolveActiveMembership } = await import('@/modules/auth/membership')

const app = createApp()
const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function session(platformRole: 'superadmin' | 'platform_admin' | 'platform_seller') {
  return {
    user: { id: `u-${platformRole}`, name: 'Pessoa', email: 'p@annetec.com.br', banned: false },
    session: { id: 's' },
    membership: { scope: 'platform', platformRole, tenantId: null, tenantSlug: null, tenantRole: null, impersonatedBy: null },
  }
}

async function call(method: string, path: string) {
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method)
  const response = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
    ...(hasBody ? { body: '{}' } : {}),
  })
  return response.status
}

/** Rotas reais (sem os middlewares `ALL`), com os parâmetros preenchidos. */
function inventory(filter: (path: string) => boolean) {
  const seen = new Set<string>()
  const list: { method: string; path: string }[] = []
  for (const route of routes.routes) {
    if (route.method === 'ALL' || route.path.includes('*') || !filter(route.path)) continue
    const path = route.path.replace(/:tenantSlug/g, 'clube-a').replace(/:[A-Za-z]+/g, UUID)
    const key = `${route.method} ${path}`
    if (seen.has(key)) continue
    seen.add(key)
    list.push({ method: route.method, path })
  }
  return list
}

const PLATFORM_STAFF_ROUTES = inventory(p => p.startsWith('/api/v1/platform/') && !p.startsWith('/api/v1/platform/vendas'))
const TENANT_ROUTES = inventory(
  p =>
    p.startsWith('/api/v1/t/') &&
    // Vitrine, checkout e convites do clube são PÚBLICOS (sem sessão) — fora do escopo.
    !p.startsWith('/api/v1/t/:tenantSlug/public'),
)
const SELLER_ROUTES = inventory(p => p.startsWith('/api/v1/platform/vendas'))

/**
 * Grupos FORA de `/api/v1/platform/*` e do painel de clube que não dependem do
 * papel de plataforma: sondas, a própria conta (`/auth`: login, `me`, senha),
 * jornadas públicas por chave/token (`/public`, vitrine/checkout do clube),
 * webhooks (token do gateway) e a rastreabilidade (anônima). Prefixo NOVO fora
 * desta lista faz o teste de inventário falhar — quem montar tem que decidir
 * se o vendedor ANNETEC passa ou não.
 */
const SELF_OR_PUBLIC_PREFIXES = [
  '/healthz',
  '/readyz',
  '/api/v1/auth/',
  '/api/v1/public/',
  '/api/v1/webhooks/',
  '/api/v1/activity/events',
  '/api/v1/t/:tenantSlug/public',
]

beforeEach(() => {
  state.session = null
  state.dbTouched = []
  login.mockReset()
})

describe('vendedor ANNETEC fora das rotas da equipe', () => {
  it('o inventário enxerga as rotas (sanidade do teste)', () => {
    expect(PLATFORM_STAFF_ROUTES.length).toBeGreaterThan(80)
    expect(PLATFORM_STAFF_ROUTES.some(r => r.path.startsWith('/api/v1/platform/comercial/descontos'))).toBe(true)
    expect(PLATFORM_STAFF_ROUTES.some(r => r.path.startsWith('/api/v1/platform/tenants'))).toBe(true)
    expect(PLATFORM_STAFF_ROUTES.some(r => r.path.startsWith('/api/v1/platform/holding'))).toBe(true)
    expect(TENANT_ROUTES.length).toBeGreaterThan(50)
    expect(SELLER_ROUTES.length).toBeGreaterThan(10)
  })

  it('inventário completo: toda rota montada é da equipe, do vendedor, de clube ou de um grupo público/da própria conta conhecido', () => {
    const unclassified = routes.routes
      .filter(route => route.method !== 'ALL' && !route.path.includes('*'))
      .map(route => `${route.method} ${route.path}`)
      .filter(key => {
        const path = key.slice(key.indexOf(' ') + 1)
        if (path.startsWith('/api/v1/platform/') || path.startsWith('/api/v1/t/')) return false
        return !SELF_OR_PUBLIC_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix))
      })
    expect(unclassified).toEqual([])
  })

  it('TODA rota /api/v1/platform/* da equipe (tenants, holding, cobrança, contratação, e-mails, atividade, usuários, planos, notificações, comercial) = 403', async () => {
    state.session = session('platform_seller')
    const leaks: string[] = []
    for (const route of PLATFORM_STAFF_ROUTES) {
      const status = await call(route.method, route.path)
      if (status !== 403) leaks.push(`${route.method} ${route.path} → ${status}`)
    }
    expect(leaks).toEqual([])
    expect(state.dbTouched).toEqual([])
  })

  it('A5: vendedor não lê nem escreve painel de clube (/api/v1/t/:slug/* autenticado) = 403', async () => {
    state.session = session('platform_seller')
    const leaks: string[] = []
    for (const route of TENANT_ROUTES) {
      const status = await call(route.method, route.path)
      if (status !== 403) leaks.push(`${route.method} ${route.path} → ${status}`)
    }
    expect(leaks).toEqual([])
    expect(platformMayAccess('GET', 'platform_seller', 'operator')).toBe(false)
    expect(platformMayAccess('GET', 'platform_seller', 'platform')).toBe(false)
    expect(platformMayAccess('GET', null, 'operator')).toBe(false)
    // A equipe segue como antes.
    expect(platformMayAccess('GET', 'platform_admin', 'operator')).toBe(true)
    expect(platformMayAccess('POST', 'superadmin', 'operator')).toBe(true)
  })

  it('controle positivo: a equipe PASSA dos guards (o banco falso é tocado → 500)', async () => {
    state.session = session('platform_admin')
    expect(await call('GET', '/api/v1/platform/users')).toBe(500)
    expect(await call('GET', '/api/v1/platform/comercial/vendedores')).toBe(500)
    expect(state.dbTouched.length).toBeGreaterThan(0)
  })

  it('escrita comercial (descontos, vendedores, comissões, regra, reatribuir) é só do superadmin', async () => {
    state.session = session('platform_admin')
    const writes = PLATFORM_STAFF_ROUTES.filter(r => r.path.startsWith('/api/v1/platform/comercial') && r.method !== 'GET')
    expect(writes.length).toBeGreaterThanOrEqual(7)
    for (const route of writes) expect(`${route.method} ${route.path} → ${await call(route.method, route.path)}`).toMatch(/→ 403$/)
    expect(state.dbTouched).toEqual([])
  })
})

describe('área do vendedor', () => {
  it('equipe (superadmin e platform_admin) recebe 403 em TODA rota /api/v1/platform/vendas/*', async () => {
    for (const role of ['superadmin', 'platform_admin'] as const) {
      state.session = session(role)
      for (const route of SELLER_ROUTES) {
        expect(`${role} ${route.method} ${route.path} → ${await call(route.method, route.path)}`).toMatch(/→ 403$/)
      }
    }
    expect(state.dbTouched).toEqual([])
  })

  it('sem sessão: 401', async () => {
    expect(await call('GET', '/api/v1/platform/vendas/painel')).toBe(401)
    expect(await call('GET', '/api/v1/platform/comercial/vendedores')).toBe(401)
  })

  it('o vendedor passa do guard da própria área (o banco falso é tocado → 500)', async () => {
    state.session = session('platform_seller')
    expect(await call('GET', '/api/v1/platform/vendas/perfil')).toBe(500)
    expect(state.dbTouched.length).toBeGreaterThan(0)
  })
})

describe('sessão e login do vendedor', () => {
  it('conta platform_seller resolve escopo de plataforma com o papel próprio (sem banco)', async () => {
    const membership = await resolveActiveMembership({ id: 'u1', role: 'platform_seller', banned: false }, {})
    expect(membership).toMatchObject({ scope: 'platform', platformRole: 'platform_seller', tenantId: null })
    const banned = await resolveActiveMembership({ id: 'u1', role: 'platform_seller', banned: true }, {})
    expect(banned).toMatchObject({ scope: 'tenant', platformRole: null })
  })

  it('POST /auth/login devolve scope "platform" e platformRole "platform_seller" para a web rotear', async () => {
    login.mockResolvedValue({ token: 'tok', session: session('platform_seller') })
    const response = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'vendedor@annetec.com.br', password: 'senha-forte-123' }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { token: string; user: { scope: string; platformRole: string } } }
    expect(body.data.token).toBe('tok')
    expect(body.data.user).toMatchObject({ scope: 'platform', platformRole: 'platform_seller', tenantRole: null })
  })
})
