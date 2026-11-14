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
const { MANAGED_ACCOUNT_TERMS_VERSION, isCelular, celular } = await import('@annetec/contracts')

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
    expect(CLUB).toHaveLength(6)
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

  it('correção com celular fixo é rejeitada (400) e não altera o pedido', async () => {
    state.session = tenantSession('clube-a')
    expect((await call('POST', '/api/v1/t/clube-a/faturamento/configuracoes/recebimento/gerenciada', REQUEST_BODY)).status).toBe(201)
    state.session = platformSession('superadmin')
    const res = await call('PATCH', '/api/v1/platform/contas-gerenciadas/org-clube-a/pedido', { mobilePhone: '2133829150' })
    expect(res.status).toBe(400)
    expect(db().rows(schema.managedAccountRequests)[0]).toMatchObject({ data: expect.objectContaining({ mobilePhone: '21999998888' }) })
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

describe('isCelular / celular', () => {
  it('aceita celular com DDD e rejeita fixo, 3º dígito != 9 e DDD com zero', () => {
    expect(isCelular('(21) 99999-8888')).toBe(true)
    expect(isCelular('21999998888')).toBe(true)
    expect(isCelular('2133829150')).toBe(false)
    expect(isCelular('21333344445')).toBe(false)
    expect(isCelular('01999998888')).toBe(false)
    expect(celular.safeParse('(21) 99999-8888')).toMatchObject({ success: true, data: '21999998888' })
    expect(celular.safeParse('21999998888').success).toBe(true)
    for (const bad of ['2133829150', '21333344445', '01999998888']) expect(celular.safeParse(bad).success).toBe(false)
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

  it('pedido do clube com celular fixo é rejeitado na validação (400), sem gravar', async () => {
    state.session = tenantSession('clube-a')
    for (const mobilePhone of ['2133829150', '21333344445', '01999998888']) {
      const res = await call('POST', '/api/v1/t/clube-a/faturamento/configuracoes/recebimento/gerenciada', { ...REQUEST_BODY, mobilePhone })
      expect(res.status).toBe(400)
    }
    expect(db().rows(schema.managedAccountRequests)).toHaveLength(0)
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

// ---------------------------------------------------------------------------
// Upload de documento (multipart) e webhook ACCOUNT_STATUS
// ---------------------------------------------------------------------------

const SUB_KEY = '$aact_hmlg_000SubcontaDocumentosChaveDeTesteComTamanhoSuficiente'
const DOC_URL = '/api/v1/t/clube-a/faturamento/configuracoes/recebimento/gerenciada/documentos/grp_1'
const WEBHOOK_TOKEN = 'token-do-webhook-da-subconta-com-mais-de-32-caracteres'

function seedSubaccount() {
  db().insertRow(schema.tenantAsaasAccounts, {
    organizationId: 'org-clube-a',
    source: 'subaccount',
    apiKeyEncrypted: encryptSecret(SUB_KEY),
    env: 'sandbox',
    keyHint: 'ente',
    asaasAccountId: 'acc_sub',
    walletId: 'wallet_sub',
    webhookId: 'wh_1',
    webhookTokenEncrypted: encryptSecret(WEBHOOK_TOKEN),
    webhookStatus: 'ativo',
    autoDebitEnabled: true,
    accountStatusJson: { id: 'acc_sub', general: 'PENDING', documentation: 'PENDING' },
  })
  fakeAsaas.documents.set(SUB_KEY, { rejectReasons: null, data: [{ id: 'grp_1', status: 'NOT_SENT', type: 'IDENTIFICATION', title: 'RG' }] })
}

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 1, 2, 3])
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

async function upload(bytes: Uint8Array, name = 'rg.pdf', url = DOC_URL) {
  const form = new FormData()
  form.set('file', new Blob([bytes as unknown as ArrayBuffer]), name)
  const response = await app.request(url, {
    method: 'POST',
    headers: { authorization: 'Bearer x', 'x-forwarded-for': '200.100.50.25' },
    body: form,
  })
  return { status: response.status, body: (await response.json().catch(() => null)) as { data?: Record<string, unknown>; error?: { code?: string } } | null }
}

describe('upload de documento da subconta', () => {
  it('admin do clube: 200, repassa ao Asaas, devolve a conta e audita só metadados', async () => {
    seedSubaccount()
    state.session = tenantSession('clube-a')
    const res = await upload(PDF_BYTES)
    expect(res.status).toBe(200)
    expect(res.body?.data).toMatchObject({ connected: true, source: 'subaccount', managed: expect.objectContaining({ documents: expect.any(Array) }) })
    const sent = fakeAsaas.calls.find(call => call.call === 'account.uploadDocument')!
    expect(sent.apiKey).toBe(SUB_KEY)
    expect(sent.args).toMatchObject({ groupId: 'grp_1', contentType: 'application/pdf', type: 'IDENTIFICATION', size: PDF_BYTES.length })
    const { recordAudit } = await import('@/lib/audit')
    const audit = vi.mocked(recordAudit).mock.calls.find(call => call[1].action === 'managed_account.document_sent')!
    expect(audit[1]).toMatchObject({
      resource: 'managed_account',
      resourceId: 'grp_1',
      metadata: { groupId: 'grp_1', groupType: 'IDENTIFICATION', size: PDF_BYTES.length, sha256: expect.stringMatching(/^[0-9a-f]{64}$/), asaasFileStatus: 'PENDING' },
    })
    expect(JSON.stringify(audit[1])).not.toContain('bytes')
  })

  it('aceita PNG; tipo errado → 422; arquivo vazio → 422; sem campo file → 400', async () => {
    seedSubaccount()
    state.session = tenantSession('clube-a')
    expect((await upload(PNG_BYTES, 'rg.png')).status).toBe(200)
    expect((await upload(new TextEncoder().encode('MZ executavel'), 'rg.pdf')).status).toBe(422)
    expect((await upload(new Uint8Array(0))).status).toBe(422)
    const response = await app.request(DOC_URL, { method: 'POST', headers: { authorization: 'Bearer x' }, body: new FormData() })
    expect(response.status).toBe(400)
    expect(fakeAsaas.uploadedFiles).toHaveLength(1)
  })

  it('acima de 10 MB → 413, sem chamar o Asaas', async () => {
    seedSubaccount()
    state.session = tenantSession('clube-a')
    const big = new Uint8Array(10 * 1024 * 1024 + 300 * 1024)
    big.set(PDF_BYTES)
    expect((await upload(big)).status).toBe(413)
    const slightlyOver = new Uint8Array(10 * 1024 * 1024 + 1)
    slightlyOver.set(PDF_BYTES)
    expect((await upload(slightlyOver)).status).toBe(413)
    expect(fakeAsaas.calls.some(call => call.call === 'account.uploadDocument')).toBe(false)
  })

  it('vendedor ANNETEC e platform_admin: 403; superadmin: 200; vendedor/associado do clube: 403', async () => {
    seedSubaccount()
    state.session = platformSession('platform_seller')
    expect((await upload(PDF_BYTES)).status).toBe(403)
    state.session = platformSession('platform_admin')
    expect((await upload(PDF_BYTES)).status).toBe(403)
    for (const role of ['seller', 'client'] as const) {
      state.session = tenantSession('clube-a', role)
      expect((await upload(PDF_BYTES)).status).toBe(403)
    }
    expect(fakeAsaas.calls.some(call => call.call === 'account.uploadDocument')).toBe(false)
    state.session = platformSession('superadmin')
    expect((await upload(PDF_BYTES)).status).toBe(200)
  })

  it('erros do serviço chegam com o código certo (grupo inexistente 404, link 422, em análise 422)', async () => {
    seedSubaccount()
    state.session = tenantSession('clube-a')
    const missing = await upload(PDF_BYTES, 'rg.pdf', DOC_URL.replace('grp_1', 'grp_x'))
    expect(missing.status).toBe(404)
    expect(missing.body?.error?.code).toBe('MANAGED_DOCUMENT_GROUP_NOT_FOUND')
    fakeAsaas.documents.set(SUB_KEY, { rejectReasons: null, data: [{ id: 'grp_1', status: 'NOT_SENT', type: 'X', onboardingUrl: 'https://a.test/b' }] })
    expect((await upload(PDF_BYTES)).body?.error?.code).toBe('MANAGED_DOCUMENT_LINK_ONLY')
    fakeAsaas.documents.set(SUB_KEY, { rejectReasons: null, data: [{ id: 'grp_1', status: 'PENDING', type: 'X' }] })
    const pending = await upload(PDF_BYTES)
    expect(pending.status).toBe(422)
    expect(pending.body?.error?.code).toBe('MANAGED_DOCUMENT_NOT_PENDING')
  })

  it('clube sem subconta (chave própria): 422 e nada é enviado', async () => {
    db().insertRow(schema.tenantAsaasAccounts, {
      organizationId: 'org-clube-a',
      source: 'api_key',
      apiKeyEncrypted: encryptSecret(SUB_KEY),
      env: 'sandbox',
      keyHint: 'ente',
    })
    state.session = tenantSession('clube-a')
    expect((await upload(PDF_BYTES)).status).toBe(422)
    expect(fakeAsaas.calls.some(call => call.call === 'account.uploadDocument')).toBe(false)
  })
})

describe('webhook ACCOUNT_STATUS do clube', () => {
  const URL_WEBHOOK = '/api/v1/webhooks/asaas/clube/org-clube-a'
  const statusBody = (accountId = 'acc_sub') => ({
    id: 'evt_1',
    event: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
    dateCreated: '2026-11-14 10:00:00',
    account: { id: accountId, ownerId: 'owner_1' },
    accountStatus: { id: 'st_1', commercialInfo: 'APPROVED', bankAccountInfo: 'APPROVED', documentation: 'APPROVED', general: 'APPROVED' },
  })
  async function hook(body: unknown, token: string | null = WEBHOOK_TOKEN) {
    const response = await app.request(URL_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { 'asaas-access-token': token } : {}) },
      body: JSON.stringify(body),
    })
    return response.status
  }
  const accountRow = () => db().rows(schema.tenantAsaasAccounts)[0] as { accountStatusJson: { general: string }; lastCheckedAt: Date | null }

  it('token certo: 200, grava accountStatus na hora e dispara o refresh em segundo plano', async () => {
    seedSubaccount()
    const { runInBackground } = await import('@/lib/background')
    vi.mocked(runInBackground).mockClear()
    expect(await hook(statusBody())).toBe(200)
    expect(accountRow().accountStatusJson).toMatchObject({ general: 'APPROVED', documentation: 'APPROVED' })
    expect(accountRow().lastCheckedAt).not.toBeNull()
    expect(runInBackground).toHaveBeenCalledTimes(1)
    // idempotente: reentrega só repete o refresh
    expect(await hook(statusBody())).toBe(200)
    expect(accountRow().accountStatusJson.general).toBe('APPROVED')
    // runInBackground está mockado, mas o trabalho já começou: deixa terminar antes do próximo teste.
    await new Promise(resolve => setTimeout(resolve, 50))
  })

  it('token errado ou ausente → 401, sem alterar nada', async () => {
    seedSubaccount()
    expect(await hook(statusBody(), 'errado')).toBe(401)
    expect(await hook(statusBody(), null)).toBe(401)
    expect(accountRow().accountStatusJson.general).toBe('PENDING')
  })

  it('account.id divergente → 200 sem alterar nada nem disparar refresh', async () => {
    seedSubaccount()
    const { runInBackground } = await import('@/lib/background')
    vi.mocked(runInBackground).mockClear()
    expect(await hook(statusBody('acc_de_outro_clube'))).toBe(200)
    expect(accountRow().accountStatusJson.general).toBe('PENDING')
    expect(runInBackground).not.toHaveBeenCalled()
  })

  it('clube com chave própria ignora ACCOUNT_STATUS (200); evento de pagamento segue o fluxo antigo (200, sem refresh)', async () => {
    seedSubaccount()
    ;(db().rows(schema.tenantAsaasAccounts)[0] as { source: string }).source = 'api_key'
    const { runInBackground } = await import('@/lib/background')
    vi.mocked(runInBackground).mockClear()
    expect(await hook(statusBody())).toBe(200)
    expect(accountRow().accountStatusJson.general).toBe('PENDING')
    expect(await hook({ id: 'evt_pay', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', status: 'RECEIVED' } })).toBe(200)
    expect(runInBackground).not.toHaveBeenCalled()
  })
})
