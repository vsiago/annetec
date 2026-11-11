import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Controle de acesso endurecido antes de ir ao ar (auditoria de segurança):
 *  - A4: detalhe de demonstrativo/fatura por código não vaza dado de outro associado;
 *  - A5: sessão de plataforma só LÊ inquilino (escrita: superadmin ou inquilino-operador);
 *        rotas destrutivas da plataforma são só do superadmin;
 *  - B11: vendedor preso à própria carteira também nas rotas de detalhe;
 *  - A2: `/auth/register` não existe mais;
 *  - B15: login recusado vai para a trilha, sem senha.
 * Middleware REAL (`requireAuth`/`requireTenantRole`/`requirePlatformRole`),
 * sessão, inquilino e services falsos.
 */

const CLUB = { id: '11111111-1111-4111-8111-111111111111', slug: 'clube-a', name: 'Clube A', kind: 'operator' as const }
const OPERATOR = { id: '99999999-9999-4999-8999-999999999999', slug: 'annetec', name: 'Annetec', kind: 'platform' as const }
const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_CLIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SELLER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const OTHER_SELLER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

const state = vi.hoisted(() => ({ session: null as unknown }))
const audits = vi.hoisted(() => [] as { action: string; metadata?: Record<string, unknown> }[])

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => state.session) } } }))
vi.mock('@/lib/audit', () => ({
  recordAudit: vi.fn(async (_c: unknown, entry: { action: string; metadata?: Record<string, unknown> }) => {
    audits.push(entry)
  }),
}))
vi.mock('@/modules/club-billing/access.service', () => ({ loadClubAccess: vi.fn() }))
vi.mock('@/http/middleware/tenant', () => ({
  resolveTenant: createMiddleware(async (c, next) => {
    const tenant = [CLUB, OPERATOR].find(item => item.slug === c.req.param('tenantSlug'))
    if (!tenant) return c.json({ error: { code: 'NOT_FOUND' } }, 404)
    c.set('tenant', tenant)
    await next()
  }),
  tenantOf: (c: { get: (key: 'tenant') => unknown }) => c.get('tenant'),
}))

// Contratos do espelho: C-1 é do CLIENT (vendido por SELLER); C-2 de outro associado/vendedor.
const CONTRACTS: Record<string, { upstreamCodigo: string; clientUserId: string | null; sellerUserId: string | null }> = {
  'C-1': { upstreamCodigo: 'C-1', clientUserId: CLIENT, sellerUserId: SELLER },
  'C-2': { upstreamCodigo: 'C-2', clientUserId: OTHER_CLIENT, sellerUserId: OTHER_SELLER },
}
const fakes = vi.hoisted(() => ({
  refresh: vi.fn(),
  attach: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
  declare: vi.fn(async (..._args: unknown[]) => ({ ok: true })),
  getStatement: vi.fn(async (_t: string, codigo: string) => ({ upstreamCodigo: codigo, cpf: '00000000000' })),
  getReceipt: vi.fn(async (_t: string, codigo: string, _owner?: unknown) => ({ upstreamCodigo: codigo })),
  getLead: vi.fn(async (..._args: unknown[]) => ({ id: 'lead' })),
  updateLead: vi.fn(async (..._args: unknown[]) => ({ id: 'lead' })),
  updateSale: vi.fn(async (..._args: unknown[]) => ({ id: 'sale' })),
  login: vi.fn(),
  tenantUpdate: vi.fn(async (..._args: unknown[]) => ({ status: 'active' })),
  manualPayment: vi.fn(),
}))

vi.mock('@/modules/contracts/service', () => ({
  contractsService: {
    getByCodigo: vi.fn(async (_t: string, codigo: string) => {
      const found = CONTRACTS[codigo]
      if (!found) throw new Error('contrato inexistente no fake')
      return found
    }),
    refreshFromUpstream: (...args: unknown[]) => fakes.refresh(...args),
    attachDocument: (...args: unknown[]) => fakes.attach(...args),
    declarePathology: (...args: unknown[]) => fakes.declare(...args),
    findBeneficiaryOwner: vi.fn(async (_t: string, beneficiario: string) =>
      beneficiario === 'B-1' ? { clientUserId: CLIENT, sellerUserId: SELLER } : { clientUserId: OTHER_CLIENT, sellerUserId: OTHER_SELLER },
    ),
  },
}))
vi.mock('@/modules/billing/service', () => ({
  billingService: {
    getPaymentStatement: (...args: [string, string]) => fakes.getStatement(...args),
    listPaymentStatements: vi.fn(async (_t: string, contrato: string) =>
      contrato === 'C-1' ? [{ upstreamCodigo: 'D-1', cpf: '1' }] : [{ upstreamCodigo: 'D-2', cpf: '2' }],
    ),
    getCommissionReceipt: (...args: [string, string, unknown?]) => fakes.getReceipt(...args),
  },
}))
vi.mock('@/modules/users/service', () => ({
  sellersService: { upstreamProdutorCodigo: vi.fn(async () => 'PROD-7') },
}))
vi.mock('@/modules/crm/service', () => ({
  crmService: {
    getLead: (...args: unknown[]) => fakes.getLead(...args),
    updateLead: (...args: unknown[]) => fakes.updateLead(...args),
    updateSale: (...args: unknown[]) => fakes.updateSale(...args),
  },
}))
vi.mock('@/modules/auth/service', () => ({ authService: { login: (...args: unknown[]) => fakes.login(...args) } }))
vi.mock('@/modules/auth/presenter', () => ({ presentSessionUser: vi.fn(async () => ({})) }))
vi.mock('@/modules/activity/service', () => ({ activityService: { record: vi.fn(async () => {}) } }))
vi.mock('@/lib/background', () => ({ runInBackground: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notifyClientSignup: vi.fn() }))
vi.mock('@/modules/club-billing/onboarding.service', () => ({ sendOnboardingWelcome: vi.fn() }))
vi.mock('@/modules/tenants/service', () => ({
  tenantsService: { update: (...args: unknown[]) => fakes.tenantUpdate(...args), cancel: vi.fn(), saveIntegration: vi.fn() },
}))
vi.mock('@/modules/tenants/members.service', () => ({ tenantMembersService: {} }))
vi.mock('@/modules/holding/cache', () => ({ invalidateHoldingCache: vi.fn() }))
vi.mock('@/modules/platform-billing/automation.service', () => ({ runPlatformAutomation: vi.fn() }))
vi.mock('@/modules/platform-billing/charges.service', () => ({
  platformChargesService: { manualPayment: (...args: unknown[]) => fakes.manualPayment(...args), cancel: vi.fn() },
}))
vi.mock('@/modules/platform-billing/console.service', () => ({
  listPlatformCharges: vi.fn(),
  listPlatformEvents: vi.fn(),
  platformChargeDetail: vi.fn(async () => ({})),
}))
vi.mock('@/modules/platform-billing/pricing.service', () => ({ listPlanOffers: vi.fn(), updatePlanPricing: vi.fn() }))
vi.mock('@/modules/platform-billing/queries', () => ({
  loadPlatformCharge: vi.fn(async () => ({ id: 'ch-1', organizationId: CLUB.id, amount: '10' })),
}))
vi.mock('@/modules/platform-billing/settings.service', () => ({
  loadPlatformSettings: vi.fn(),
  toPlatformSettingsDto: vi.fn(),
  updatePlatformSettings: vi.fn(),
}))
vi.mock('@/modules/platform-billing/subscriptions.service', () => ({
  cancelPlatformSubscription: vi.fn(),
  changePlatformPlan: vi.fn(),
  demoTimeTravel: vi.fn(),
  listSubscriptions: vi.fn(),
  reactivatePlatformSubscription: vi.fn(),
  subscriptionDetail: vi.fn(),
}))
vi.mock('@/modules/platform-billing/summary.service', () => ({ getPlatformBillingSummary: vi.fn() }))

const { billingController } = await import('@/modules/billing/controller')
const { contractsController } = await import('@/modules/contracts/controller')
const { crmController } = await import('@/modules/crm/controller')
const { authController } = await import('@/modules/auth/controller')
const { tenantsController } = await import('@/modules/tenants/controller')
const { platformBillingController } = await import('@/modules/platform-billing/admin-controller')
const { platformMayAccess } = await import('@/http/middleware/auth')
const { AppError, errorHandler } = await import('@/http/errors')
const { ERROR_CODES } = await import('@annetec/contracts')

const app = new Hono()
  .route('/t/:tenantSlug/financeiro', billingController)
  .route('/t/:tenantSlug/contratos', contractsController)
  .route('/t/:tenantSlug/crm', crmController)
  .route('/auth', authController)
  .route('/platform/tenants', tenantsController)
  .route('/platform/billing', platformBillingController)
app.onError(errorHandler)

function tenantSession(userId: string, tenantRole: 'admin' | 'seller' | 'client', tenantId = CLUB.id) {
  return {
    user: { id: userId, name: 'X', email: 'x@x.com', banned: false },
    session: { id: 's' },
    membership: { scope: 'tenant', tenantId, tenantSlug: 'clube-a', tenantRole, platformRole: null, impersonatedBy: null },
  }
}
function platformSession(platformRole: 'superadmin' | 'platform_admin') {
  return {
    user: { id: `staff-${platformRole}`, name: 'Equipe', email: 'ops@annetec.com.br', banned: false },
    session: { id: 's' },
    membership: { scope: 'platform', tenantId: null, tenantSlug: null, tenantRole: null, platformRole, impersonatedBy: null },
  }
}

async function call(path: string, init: RequestInit = {}) {
  const response = await app.request(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await response.text()
  let body: Record<string, any> | null = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  return { status: response.status, body: body as Record<string, any> }
}

beforeEach(() => {
  vi.clearAllMocks()
  audits.length = 0
  state.session = null
})

describe('A4 — demonstrativo por código', () => {
  it('associado sem dizer o contrato = 400 e o ERP nem é consultado', async () => {
    state.session = tenantSession(CLIENT, 'client')
    const { status } = await call('/t/clube-a/financeiro/demonstrativos/D-2')
    expect(status).toBe(400)
    expect(fakes.getStatement).not.toHaveBeenCalled()
  })

  it('associado pedindo pelo contrato de OUTRO associado = 403', async () => {
    state.session = tenantSession(CLIENT, 'client')
    const { status } = await call('/t/clube-a/financeiro/demonstrativos/D-2?contratoCodigo=C-2')
    expect(status).toBe(403)
  })

  it('associado: demonstrativo que não está no próprio contrato = 404', async () => {
    state.session = tenantSession(CLIENT, 'client')
    const { status } = await call('/t/clube-a/financeiro/demonstrativos/D-2?contratoCodigo=C-1')
    expect(status).toBe(404)
  })

  it('associado: o próprio demonstrativo, dentro do próprio contrato = 200', async () => {
    state.session = tenantSession(CLIENT, 'client')
    const { status, body } = await call('/t/clube-a/financeiro/demonstrativos/D-1?contratoCodigo=C-1')
    expect(status).toBe(200)
    expect(body.data.upstreamCodigo).toBe('D-1')
  })

  it('admin do clube consulta direto pelo código', async () => {
    state.session = tenantSession('admin-1', 'admin')
    const { status } = await call('/t/clube-a/financeiro/demonstrativos/D-2')
    expect(status).toBe(200)
    expect(fakes.getStatement).toHaveBeenCalledWith(CLUB.id, 'D-2')
  })
})

describe('B11 — vendedor preso à própria carteira nas rotas de detalhe', () => {
  it('contrato de outro vendedor = 403 (detalhe, sync, anexo)', async () => {
    state.session = tenantSession(SELLER, 'seller')
    expect((await call('/t/clube-a/contratos/C-2')).status).toBe(403)
    expect((await call('/t/clube-a/contratos/C-2/sync', { method: 'POST' })).status).toBe(403)
    const anexo = await call('/t/clube-a/contratos/anexos', {
      method: 'POST',
      body: JSON.stringify({ contractUpstreamCodigo: 'C-2', fileName: 'a.pdf', fileUrl: 'https://x.com/a.pdf' }),
    })
    expect(anexo.status).toBe(403)
    expect(fakes.refresh).not.toHaveBeenCalled()
    expect(fakes.attach).not.toHaveBeenCalled()
  })

  it('contrato que o vendedor produziu = 200', async () => {
    state.session = tenantSession(SELLER, 'seller')
    expect((await call('/t/clube-a/contratos/C-1')).status).toBe(200)
  })

  it('patologia para beneficiário de contrato de outro vendedor = 403', async () => {
    state.session = tenantSession(SELLER, 'seller')
    const outro = await call('/t/clube-a/contratos/patologias', {
      method: 'POST',
      body: JSON.stringify({ beneficiaryUpstreamCodigo: 'B-9', name: 'Asma' }),
    })
    expect(outro.status).toBe(403)
    const proprio = await call('/t/clube-a/contratos/patologias', {
      method: 'POST',
      body: JSON.stringify({ beneficiaryUpstreamCodigo: 'B-1', name: 'Asma' }),
    })
    expect(proprio.status).toBe(201)
    expect(fakes.declare).toHaveBeenCalledTimes(1)
  })

  it('recibo de comissão: vendedor só pelo próprio produtor; admin sem filtro', async () => {
    state.session = tenantSession(SELLER, 'seller')
    await call('/t/clube-a/financeiro/comissoes/R-1')
    expect(fakes.getReceipt).toHaveBeenLastCalledWith(CLUB.id, 'R-1', { produtorCodigo: 'PROD-7' })

    state.session = tenantSession('admin-1', 'admin')
    await call('/t/clube-a/financeiro/comissoes/R-1')
    expect(fakes.getReceipt).toHaveBeenLastCalledWith(CLUB.id, 'R-1')
  })

  it('CRM: lead/venda por id recebem o escopo do vendedor; admin não', async () => {
    const lead = '55555555-5555-4555-8555-555555555555'
    state.session = tenantSession(SELLER, 'seller')
    await call(`/t/clube-a/crm/leads/${lead}`)
    expect(fakes.getLead).toHaveBeenLastCalledWith(CLUB.id, lead, SELLER)
    // Escritas do CRM antigo estão desativadas (410) e nem chegam ao serviço.
    fakes.updateLead.mockClear()
    fakes.updateSale.mockClear()
    const patchLead = await call(`/t/clube-a/crm/leads/${lead}`, { method: 'PATCH', body: JSON.stringify({ sellerId: OTHER_SELLER }) })
    expect(patchLead.status).toBe(410)
    const patchSale = await call(`/t/clube-a/crm/vendas/${lead}`, { method: 'PATCH', body: JSON.stringify({ planName: 'X' }) })
    expect(patchSale.status).toBe(410)
    expect(fakes.updateLead).not.toHaveBeenCalled()
    expect(fakes.updateSale).not.toHaveBeenCalled()

    state.session = tenantSession('admin-1', 'admin')
    await call(`/t/clube-a/crm/leads/${lead}`)
    expect(fakes.getLead).toHaveBeenLastCalledWith(CLUB.id, lead, undefined)
  })
})

describe('A5 — equipe Annetec nas rotas de inquilino', () => {
  it('regra pura: leitura sempre; escrita só superadmin ou no inquilino-operador', () => {
    expect(platformMayAccess('GET', 'platform_admin', 'operator')).toBe(true)
    expect(platformMayAccess('head', 'platform_admin', null)).toBe(true)
    expect(platformMayAccess('POST', 'platform_admin', 'operator')).toBe(false)
    expect(platformMayAccess('DELETE', 'platform_admin', null)).toBe(false)
    expect(platformMayAccess('PATCH', 'superadmin', 'operator')).toBe(true)
    expect(platformMayAccess('POST', 'platform_admin', 'platform')).toBe(true)
  })

  it('platform_admin LÊ o clube, mas não escreve nele', async () => {
    state.session = platformSession('platform_admin')
    expect((await call('/t/clube-a/contratos/C-1')).status).toBe(200)
    const sync = await call('/t/clube-a/contratos/C-1/sync', { method: 'POST' })
    expect(sync.status).toBe(403)
    expect(fakes.refresh).not.toHaveBeenCalled()
  })

  it('superadmin escreve; platform_admin escreve no inquilino-operador (a própria Annetec)', async () => {
    fakes.refresh.mockResolvedValue({ status: 'ativo', beneficiaries: [] })
    state.session = platformSession('superadmin')
    expect((await call('/t/clube-a/contratos/C-1/sync', { method: 'POST' })).status).toBe(200)
    state.session = platformSession('platform_admin')
    expect((await call('/t/annetec/contratos/C-1/sync', { method: 'POST' })).status).toBe(200)
  })

  it('PATCH/DELETE de inquilino e credenciais do ERP: só superadmin', async () => {
    const id = CLUB.id
    state.session = platformSession('platform_admin')
    expect((await call(`/platform/tenants/${id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Novo' }) })).status).toBe(403)
    expect((await call(`/platform/tenants/${id}`, { method: 'DELETE' })).status).toBe(403)
    const integracao = await call(`/platform/tenants/${id}/integration`, {
      method: 'PUT',
      body: JSON.stringify({ baseUrl: 'https://erp.exemplo.com', appToken: 't', apiPassword: 'p', enabled: true }),
    })
    expect(integracao.status).toBe(403)
    expect(fakes.tenantUpdate).not.toHaveBeenCalled()

    state.session = platformSession('superadmin')
    expect((await call(`/platform/tenants/${id}`, { method: 'PATCH', body: JSON.stringify({ name: 'Novo' }) })).status).toBe(200)
  })

  it('baixa manual e cancelamento de fatura da plataforma: só superadmin', async () => {
    const charge = '66666666-6666-4666-8666-666666666666'
    state.session = platformSession('platform_admin')
    expect((await call(`/platform/billing/faturas/${charge}/baixa-manual`, { method: 'POST' })).status).toBe(403)
    expect((await call(`/platform/billing/faturas/${charge}/cancelar`, { method: 'POST' })).status).toBe(403)
    expect(fakes.manualPayment).not.toHaveBeenCalled()
  })
})

describe('A2 / B15 — autenticação', () => {
  it('/auth/register não existe mais', async () => {
    const { status } = await call('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'X', email: 'vitima@gmail.com', password: 'qualquer123', cpf: '52998224725', tenantSlug: 'clube-a' }),
    })
    expect(status).toBe(404)
  })

  it('login recusado vai para a trilha com e-mail e motivo — nunca a senha', async () => {
    fakes.login.mockRejectedValue(new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'E-mail ou senha inválidos'))
    const { status } = await call('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'Alguem@Exemplo.com', password: 'segredo-super-secreto' }),
    })
    expect(status).toBe(401)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      action: 'auth.login_failed',
      metadata: { via: 'password', email: 'alguem@exemplo.com', motivo: 'INVALID_CREDENTIALS' },
    })
    expect(JSON.stringify(audits)).not.toContain('segredo-super-secreto')
  })

  it('falha que não é recusa de login (ERP fora, bug) não vira linha de login falho', async () => {
    fakes.login.mockRejectedValue(new Error('banco fora'))
    await call('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'a@b.com', password: 'x' }) })
    expect(audits).toHaveLength(0)
  })
})
