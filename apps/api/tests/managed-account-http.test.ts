import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Permissões da conta gerenciada pelo APP INTEIRO (rotas e guards reais,
 * sessão falsa, banco em memória): admin do clube só no próprio clube e só
 * ele faz o pedido (aceite); vendedor ANNETEC 403 em tudo; platform_admin lê
 * e não escreve; superadmin opera; desconectar conta gerenciada só superadmin.
 */

vi.hoisted(() => {
  process.env.PLATFORM_ASAAS_API_KEY = '$aact_hmlg_000PlataformaANNETECChaveDeTesteComTamanhoSuficiente'
})

const state = vi.hoisted(() => ({ session: null as unknown, touched: [] as string[] }))
const memory = vi.hoisted(() => ({ db: null as null | Record<string, unknown> }))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createMemoryDb } = await import('./helpers/memory-db')
  const instance = createMemoryDb({
    tables: [
      schema.organization,
      schema.tenantProfiles,
      schema.tenantAsaasAccounts,
      schema.managedAccountRequests,
      schema.managedAccountDebits,
      schema.platformCharges,
      schema.clubSubscriptions,
    ],
    uniques: [
      { table: schema.tenantAsaasAccounts, keys: ['organizationId'] },
      { table: schema.managedAccountRequests, keys: ['organizationId'], where: row => ['pendente', 'aprovando', 'falhou'].includes(String(row.status)) },
    ],
  })
  memory.db = instance as unknown as Record<string, unknown>
  const tracked = Object.fromEntries(
    Object.entries(instance.db).map(([key, value]) => [
      key,
      typeof value === 'function'
        ? (...args: unknown[]) => {
            state.touched.push(key)
            return (value as (...a: unknown[]) => unknown)(...args)
          }
        : value,
    ]),
  )
  return { db: tracked, sql: { end: async () => {} }, schema }
})
vi.mock('@/integrations/asaas/client', async importOriginal => {
  const original = await importOriginal<typeof import('@/integrations/asaas/client')>()
  const { fakeAsaasClient } = await import('./helpers/fake-asaas')
  return { ...original, createAsaasClient: fakeAsaasClient }
})
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => state.session) } } }))
vi.mock('@/http/middleware/tenant', () => ({
  resolveTenant: createMiddleware(async (c, next) => {
    const slug = c.req.param('tenantSlug') ?? 'clube-a'
    c.set('tenant', { id: `org-${slug}`, slug, name: slug, kind: 'operator' })
    await next()
  }),
  tenantOf: (c: { get: (key: 'tenant') => unknown }) => c.get('tenant'),
}))
vi.mock('@/http/middleware/platform-access', () => ({
  platformAccessGuard: createMiddleware(async (_c, next) => next()),
  invalidatePlatformAccessCache: () => {},
}))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}), recordSystemAudit: vi.fn(async () => {}) }))
vi.mock('@/modules/activity/service', () => ({ activityService: { record: vi.fn(async () => {}) } }))
vi.mock('@/lib/background', () => ({ runInBackground: vi.fn() }))
vi.mock('@/lib/notifications', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/notifications')>()),
  notify: async () => 1,
}))

const schema = await import('@/db/schema')
const { createApp } = await import('@/app')
const { routes } = await import('@/routes')
const { fakeAsaas } = await import('./helpers/fake-asaas')
const { encryptSecret } = await import('@/lib/crypto')
const { MANAGED_ACCOUNT_TERMS_VERSION } = await import('@annetec/contracts')

type Memory = import('./helpers/memory-db').MemoryDb
const db = () => memory.db as unknown as Memory
const app = createApp()
const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function platformSession(platformRole: 'superadmin' | 'platform_admin' | 'platform_seller') {
  return {
    user: { id: `u-${platformRole}`, name: 'Equipe', email: 'p@annetec.com.br', banned: false },
    session: { id: 's' },
    membership: { scope: 'platform', platformRole, tenantId: null, tenantSlug: null, tenantRole: null, impersonatedBy: null },
  }
}

function tenantSession(slug: string, tenantRole: 'admin' | 'seller' | 'client' = 'admin') {
  return {
    user: { id: `u-${tenantRole}-${slug}`, name: 'Ana Admin', email: `admin@${slug}.org`, banned: false },
    session: { id: 's' },
    membership: { scope: 'tenant', platformRole: null, tenantId: `org-${slug}`, tenantSlug: slug, tenantRole, impersonatedBy: null },
  }
}

const REQUEST_BODY = {
  companyType: 'ASSOCIATION',
  incomeValue: 25000,
  email: 'financeiro@clube-a.org.br',
  loginEmail: 'asaas@clube-a.org.br',
  mobilePhone: '21999998888',
  address: { postalCode: '20040-002', street: 'Rua do Ouvidor', number: '50', province: 'Centro' },
  acceptTerms: true,
  termsVersion: MANAGED_ACCOUNT_TERMS_VERSION,
}

async function call(method: string, path: string, body?: unknown) {
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method)
  const response = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer x', 'x-forwarded-for': '200.100.50.25' },
    ...(hasBody ? { body: JSON.stringify(body ?? {}) } : {}),
  })
  return { status: response.status, body: (await response.json().catch(() => null)) as { data?: unknown; error?: { code?: string } } | null }
}

function managedRoutes(prefix: string) {
  const seen = new Set<string>()
  return routes.routes
    .filter(route => route.method !== 'ALL' && route.path.startsWith(prefix))
    .map(route => ({ method: route.method, path: route.path.replace(/:tenantSlug/g, 'clube-a').replace(/:orgId/g, ORG_ID) }))
    .filter(route => {
      const key = `${route.method} ${route.path}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

const PLATFORM = managedRoutes('/api/v1/platform/contas-gerenciadas')
const CLUB = managedRoutes('/api/v1/t/:tenantSlug/faturamento/configuracoes/recebimento/gerenciada')

function seedClub(slug: string) {
  db().insertRow(schema.organization, { id: `org-${slug}`, name: `Clube ${slug}`, slug })
  db().insertRow(schema.tenantProfiles, {
    organizationId: `org-${slug}`,
    legalName: `ASSOCIACAO ${slug.toUpperCase()}`,
    document: '11222333000181',
    email: `contato@${slug}.org`,
    phone: '2133334444',
    address: { cep: '20040002', street: 'Rua', number: '1', neighborhood: 'Centro', city: 'Rio', state: 'RJ' },
    branding: { primaryColor: '#000000', secondaryColor: '#ffffff' },
  })
}

beforeEach(() => {
  db().reset()
  fakeAsaas.reset()
  state.session = null
  state.touched.length = 0
  seedClub('clube-a')
  seedClub('clube-b')
})

describe('inventário', () => {
  it('as rotas novas estão montadas', () => {
    expect(PLATFORM.map(route => `${route.method} ${route.path.replace(ORG_ID, ':orgId')}`).sort()).toEqual(
      [
        'GET /api/v1/platform/contas-gerenciadas',
        'GET /api/v1/platform/contas-gerenciadas/:orgId',
        'PATCH /api/v1/platform/contas-gerenciadas/:orgId/debito-automatico',
        'PATCH /api/v1/platform/contas-gerenciadas/:orgId/pedido',
        'POST /api/v1/platform/contas-gerenciadas/:orgId/aprovar',
        'POST /api/v1/platform/contas-gerenciadas/:orgId/atualizar-status',
        'POST /api/v1/platform/contas-gerenciadas/:orgId/debitar-agora',
        'POST /api/v1/platform/contas-gerenciadas/:orgId/desconectar',
        'POST /api/v1/platform/contas-gerenciadas/:orgId/recuperar-chave',
        'POST /api/v1/platform/contas-gerenciadas/:orgId/recusar',
      ].sort(),
    )
    expect(CLUB).toHaveLength(5)
  })
})

describe('vendedor ANNETEC', () => {
  it('403 em toda rota da conta gerenciada (plataforma e clube), antes de tocar o banco', async () => {
    state.session = platformSession('platform_seller')
    for (const route of [...PLATFORM, ...CLUB]) {
      expect(`${route.method} ${route.path} → ${(await call(route.method, route.path)).status}`).toMatch(/→ 403$/)
    }
    expect(state.touched).toEqual([])
  })
})

describe('platform_admin', () => {
  it('lê a lista e o detalhe; não escreve nada (403 sem tocar o banco)', async () => {
    state.session = platformSession('platform_admin')
    expect((await call('GET', '/api/v1/platform/contas-gerenciadas')).status).toBe(200)
    expect((await call('GET', '/api/v1/platform/contas-gerenciadas/org-clube-a')).status).toBe(200)
    state.touched.length = 0
    for (const route of PLATFORM.filter(route => route.method !== 'GET')) {
      expect(`${route.method} ${route.path} → ${(await call(route.method, route.path, { reason: 'motivo', enabled: false })).status}`).toMatch(/→ 403$/)
    }
    // No painel do clube a equipe só lê: pedir é escrita (403 do guard) e, para o superadmin, é do clube (403).
    expect((await call('POST', '/api/v1/t/clube-a/faturamento/configuracoes/recebimento/gerenciada', REQUEST_BODY)).status).toBe(403)
    expect(state.touched).toEqual([])
  })
})

describe('superadmin', () => {
  it('passa dos guards (sem pedido = 409); não faz o pedido pelo clube (o aceite é do clube)', async () => {
    state.session = platformSession('superadmin')
    const approve = await call('POST', '/api/v1/platform/contas-gerenciadas/org-clube-a/aprovar')
    expect(approve.status).toBe(409)
    const refuse = await call('POST', '/api/v1/platform/contas-gerenciadas/org-clube-a/recusar', { reason: 'Dados divergentes' })
    expect(refuse.status).toBe(409)
    const request = await call('POST', '/api/v1/t/clube-a/faturamento/configuracoes/recebimento/gerenciada', REQUEST_BODY)
    expect(request.status).toBe(403)
    expect(db().rows(schema.managedAccountRequests)).toHaveLength(0)
  })

  it('corrige o pedido antes de aprovar (só superadmin) e audita o antes/depois', async () => {
    state.session = tenantSession('clube-a')
    expect((await call('POST', '/api/v1/t/clube-a/faturamento/configuracoes/recebimento/gerenciada', { ...REQUEST_BODY, companyType: 'MEI' })).status).toBe(201)

    state.session = platformSession('platform_admin')
    expect((await call('PATCH', '/api/v1/platform/contas-gerenciadas/org-clube-a/pedido', { companyType: 'ASSOCIATION' })).status).toBe(403)

    state.session = platformSession('superadmin')
    expect((await call('PATCH', '/api/v1/platform/contas-gerenciadas/org-clube-a/pedido', {})).status).toBe(400)
    const fixed = await call('PATCH', '/api/v1/platform/contas-gerenciadas/org-clube-a/pedido', { companyType: 'ASSOCIATION', incomeValue: 30000 })
    expect(fixed.status).toBe(200)
    expect(fixed.body?.data).toMatchObject({ request: { companyType: 'ASSOCIATION', incomeValue: 30000, cpfCnpj: '11.222.333/0001-81' } })
    const { recordAudit } = await import('@/lib/audit')
    expect(recordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'managed_account.request_corrected',
        metadata: expect.objectContaining({
          alteracoes: { companyType: { de: 'MEI', para: 'ASSOCIATION' }, incomeValue: { de: 25000, para: 30000 } },
        }),
      }),
    )
  })
})

describe('admin do clube', () => {
  it('pede no próprio clube (201, IP do aceite gravado) e não alcança outro clube nem a plataforma', async () => {
    state.session = tenantSession('clube-a')
    const own = await call('GET', '/api/v1/t/clube-a/faturamento/configuracoes/recebimento/gerenciada')
    expect(own.status).toBe(200)
    expect(own.body?.data).toMatchObject({ canRequest: true, request: null })

    const created = await call('POST', '/api/v1/t/clube-a/faturamento/configuracoes/recebimento/gerenciada', REQUEST_BODY)
    expect(created.status).toBe(201)
    expect(db().rows(schema.managedAccountRequests)).toEqual([
      expect.objectContaining({ organizationId: 'org-clube-a', status: 'pendente', acceptedByUserId: 'u-admin-clube-a', acceptedIp: '200.100.50.25' }),
    ])

    const other = await call('GET', '/api/v1/t/clube-b/faturamento/configuracoes/recebimento/gerenciada')
    expect(other.status).toBe(403)
    expect(other.body?.error?.code).toBe('TENANT_MISMATCH')
    expect((await call('POST', '/api/v1/t/clube-b/faturamento/configuracoes/recebimento/gerenciada', REQUEST_BODY)).status).toBe(403)
    expect((await call('GET', '/api/v1/platform/contas-gerenciadas')).status).toBe(403)
    expect((await call('POST', '/api/v1/platform/contas-gerenciadas/org-clube-a/aprovar')).status).toBe(403)
  })

  it('aceite obrigatório (400) e vendedor/associado do clube não acessam', async () => {
    state.session = tenantSession('clube-a')
    expect((await call('POST', '/api/v1/t/clube-a/faturamento/configuracoes/recebimento/gerenciada', { ...REQUEST_BODY, acceptTerms: false })).status).toBe(400)
    for (const role of ['seller', 'client'] as const) {
      state.session = tenantSession('clube-a', role)
      expect((await call('GET', '/api/v1/t/clube-a/faturamento/configuracoes/recebimento/gerenciada')).status).toBe(403)
    }
  })

  it('desconectar a conta gerenciada: admin do clube 403; superadmin 200', async () => {
    db().insertRow(schema.tenantAsaasAccounts, {
      organizationId: 'org-clube-a',
      source: 'subaccount',
      apiKeyEncrypted: encryptSecret('$aact_hmlg_000SubcontaChaveDeTesteComTamanhoSuficienteParaValer'),
      env: 'sandbox',
      keyHint: 'aler',
      asaasAccountId: 'acc_sub',
      walletId: 'wallet_sub',
      autoDebitEnabled: true,
    })
    state.session = tenantSession('clube-a')
    expect((await call('DELETE', '/api/v1/t/clube-a/faturamento/configuracoes/recebimento')).status).toBe(403)
    expect(db().rows(schema.tenantAsaasAccounts)).toHaveLength(1)

    state.session = platformSession('superadmin')
    expect((await call('DELETE', '/api/v1/t/clube-a/faturamento/configuracoes/recebimento')).status).toBe(200)
    expect(db().rows(schema.tenantAsaasAccounts)).toHaveLength(0)
  })
})
