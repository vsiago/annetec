import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENTES, CLUBE_A, CLUBE_B, ID, semearConfig, semearLead, semearRede, uid } from './helpers/vendas-world'

/**
 * Correções pela HTTP (app inteiro, guards reais, banco em memória):
 *  - A4: reatribuir zera o snapshot e move as vendas em andamento para o novo agente;
 *  - A2: desativar/ativar agente espelha `platform_sellers.active`;
 *  - A5: escritas legadas (comissões/configuração/vendedores/reatribuir prospect e CRM do clube) = 410;
 *  - M3: `repasse` só do próprio agente ou do master; auditoria com diff mascarado;
 *  - M13: ganho manual só para master e gerente.
 */

const state = vi.hoisted(() => ({ sessions: {} as Record<string, unknown> }))
const memory = vi.hoisted(() => ({ db: null as null | Record<string, unknown> }))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createMemoryDb } = await import('./helpers/memory-db')
  const instance = createMemoryDb({
    tables: [
      schema.organization,
      schema.user,
      schema.vendasConfig,
      schema.vendasCorretoras,
      schema.vendasEquipes,
      schema.vendasAgentes,
      schema.vendasLeads,
      schema.vendasLeadEventos,
      schema.clubPlans,
      schema.tenantPlans,
      schema.clubSubscriptions,
      schema.platformOnboardingProposals,
      schema.platformSellers,
      schema.auditLogs,
      schema.notifications,
    ],
    uniques: [{ table: schema.notifications, keys: ['audience', 'dedupeKey'] }],
  })
  memory.db = instance as unknown as Record<string, unknown>
  return { db: instance.db, sql: { end: async () => {} }, schema }
})
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async ({ headers }: { headers: Headers }) => {
        const token = headers.get('authorization')?.replace('Bearer ', '') ?? ''
        return state.sessions[token] ?? null
      }),
    },
  },
}))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}), recordSystemAudit: vi.fn(async () => {}) }))
vi.mock('@/modules/club-billing/access.service', () => ({ loadClubAccess: vi.fn() }))
vi.mock('@/http/middleware/platform-access', () => ({
  platformAccessGuard: createMiddleware(async (_c, next) => next()),
  invalidatePlatformAccessCache: () => {},
}))
vi.mock('@/modules/activity/service', () => ({ activityService: { record: vi.fn(async () => {}) } }))
vi.mock('@/lib/background', () => ({ runInBackground: vi.fn() }))
vi.mock('@/http/middleware/tenant', () => ({
  resolveTenant: createMiddleware(async (c, next) => {
    const tenant = [CLUBE_A, CLUBE_B].find(item => item.slug === c.req.param('tenantSlug'))
    if (!tenant) return c.json({ error: { code: 'NOT_FOUND' } }, 404)
    c.set('tenant', { ...tenant, kind: 'operator' })
    await next()
  }),
  tenantOf: (c: { get: (key: 'tenant') => unknown }) => c.get('tenant'),
}))

const schema = await import('@/db/schema')
const { createApp } = await import('@/app')
type Memory = import('./helpers/memory-db').MemoryDb
const mem = () => memory.db as unknown as Memory
const app = createApp()

function platformSession(userId: string, platformRole: 'superadmin' | 'platform_admin' | 'platform_seller') {
  return {
    user: { id: userId, name: userId, email: `${userId}@annetec.com.br`, banned: false },
    session: { id: 's' },
    membership: { scope: 'platform', platformRole, tenantId: null, tenantSlug: null, tenantRole: null, impersonatedBy: null },
  }
}

function tenantSession(userId: string, tenant: typeof CLUBE_A, tenantRole: 'admin' | 'seller') {
  return {
    user: { id: userId, name: userId, email: `${userId}@clube.test`, banned: false },
    session: { id: 's' },
    membership: { scope: 'tenant', platformRole: null, tenantId: tenant.id, tenantSlug: tenant.slug, tenantRole, impersonatedBy: null },
  }
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let parsed: Record<string, any> = {}
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = {}
  }
  return { status: response.status, body: parsed }
}

const P = '/api/v1/vendas'
const leadRow = (id: string) => mem().rows(schema.vendasLeads).find(l => l.id === id)!
const LEAD = uid(1001)
const LEAD_SEM_VENDA = uid(1002)
const PROPOSTA = uid(2001)
const ASSINATURA = uid(3001)

beforeEach(() => {
  mem().reset()
  state.sessions = {
    staff: platformSession('staff', 'superadmin'),
    'staff-admin': platformSession('staff-admin', 'platform_admin'),
    'admin-a': tenantSession('admin-a', CLUBE_A, 'admin'),
  }
  for (const a of AGENTES) {
    state.sessions[a.userId] =
      a.scope === 'tenant' ? tenantSession(a.userId, a.tenantId === CLUBE_A.id ? CLUBE_A : CLUBE_B, 'seller') : platformSession(a.userId, 'platform_seller')
  }
  semearRede(mem(), schema)
  semearConfig(mem(), schema, { scope: 'platform', tenantId: null })
  semearConfig(mem(), schema, { scope: 'tenant', tenantId: CLUBE_A.id })
})

describe('A4 - reatribuir muda quem recebe as comissoes ainda nao geradas', () => {
  it('zera o snapshot e aponta proposta e assinatura do lead para o novo agente (ou limpa, se for ao pool)', async () => {
    const snapshot = { agenteId: ID.vendedor1, papel: 'vendedor', equipeId: ID.equipe1, supervisorAgenteId: ID.supervisor1, unidadeId: null, corretoraId: ID.corretora1, gerenteAgenteId: ID.gerente1 }
    semearLead(mem(), schema, { id: LEAD, agenteId: ID.vendedor1, etapa: 'negociacao', atribuicao: snapshot } as never)
    mem().insertRow(schema.platformOnboardingProposals, { id: PROPOSTA, vendasAgenteId: ID.vendedor1, vendasLeadId: LEAD, sellerUserId: 'u-vendedor1' })
    mem().insertRow(schema.clubSubscriptions, { id: ASSINATURA, organizationId: CLUBE_A.id, vendasAgenteId: ID.vendedor1, vendasLeadId: LEAD })

    const res = await call('staff', 'POST', `${P}/leads/${LEAD}/reatribuir`, { agenteId: ID.vendedor3 })
    expect(res.status).toBe(200)
    expect(leadRow(LEAD)).toMatchObject({ agenteId: ID.vendedor3, atribuicao: null })
    expect(mem().rows(schema.platformOnboardingProposals)[0]).toMatchObject({ vendasAgenteId: ID.vendedor3, sellerUserId: 'u-vendedor3' })
    expect(mem().rows(schema.clubSubscriptions)[0]).toMatchObject({ vendasAgenteId: ID.vendedor3 })

    const pool = await call('staff', 'POST', `${P}/leads/${LEAD}/reatribuir`, { agenteId: null })
    expect(pool.status).toBe(200)
    expect(mem().rows(schema.platformOnboardingProposals)[0]!.vendasAgenteId).toBeNull()
    expect(mem().rows(schema.clubSubscriptions)[0]!.vendasAgenteId).toBeNull()
  })

  it('não mexe em venda de outro lead', async () => {
    semearLead(mem(), schema, { id: LEAD, agenteId: ID.vendedor1, etapa: 'negociacao' } as never)
    mem().insertRow(schema.platformOnboardingProposals, { id: PROPOSTA, vendasAgenteId: ID.vendedor2, vendasLeadId: uid(9999), sellerUserId: 'u-vendedor2' })
    await call('staff', 'POST', `${P}/leads/${LEAD}/reatribuir`, { agenteId: ID.vendedor3 })
    expect(mem().rows(schema.platformOnboardingProposals)[0]).toMatchObject({ vendasAgenteId: ID.vendedor2, sellerUserId: 'u-vendedor2' })
  })
})

describe('A2 - desativar espelha platform_sellers.active', () => {
  it('desativar e reativar o agente da plataforma altera o cadastro legado', async () => {
    mem().insertRow(schema.platformSellers, { userId: 'u-vendedor1', referralCode: 'ven0001', active: true })
    expect((await call('staff', 'POST', `${P}/rede/agentes/${ID.vendedor1}/desativar`)).status).toBe(200)
    expect(mem().rows(schema.platformSellers)[0]!.active).toBe(false)
    expect((await call('staff', 'POST', `${P}/rede/agentes/${ID.vendedor1}/ativar`)).status).toBe(200)
    expect(mem().rows(schema.platformSellers)[0]!.active).toBe(true)
  })
})

describe('M13 - ganho manual so para master e gerente', () => {
  beforeEach(() => {
    semearLead(mem(), schema, { id: LEAD_SEM_VENDA, agenteId: ID.vendedor1, etapa: 'proposta' } as never)
  })

  it('vendedor e supervisor recebem 422 VENDAS_TRANSICAO_INVALIDA; master e gerente passam', async () => {
    for (const token of ['u-vendedor1', 'u-supervisor1']) {
      const res = await call(token, 'POST', `${P}/leads/${LEAD_SEM_VENDA}/etapa`, { etapa: 'ganho', confirmar: true })
      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('VENDAS_TRANSICAO_INVALIDA')
      expect(res.body.error.message).toContain('fluxo de venda')
    }
    expect(leadRow(LEAD_SEM_VENDA).etapa).toBe('proposta')
    expect((await call('u-gerente1', 'POST', `${P}/leads/${LEAD_SEM_VENDA}/etapa`, { etapa: 'ganho', confirmar: true })).status).toBe(200)
    leadRow(LEAD_SEM_VENDA).etapa = 'proposta'
    expect((await call('staff', 'POST', `${P}/leads/${LEAD_SEM_VENDA}/etapa`, { etapa: 'ganho', confirmar: true })).status).toBe(200)
  })

  it('com venda vinculada (conversão) o vendedor segue podendo ganhar', async () => {
    semearLead(mem(), schema, {
      id: LEAD,
      agenteId: ID.vendedor1,
      etapa: 'proposta',
      conversao: { tipo: 'proposta', id: PROPOSTA, status: 'active', atualizadoEm: new Date().toISOString() },
    } as never)
    expect((await call('u-vendedor1', 'POST', `${P}/leads/${LEAD}/etapa`, { etapa: 'ganho' })).status).toBe(200)
  })
})

describe('M3 - repasse', () => {
  const pix = { tipo: 'pix', chavePix: 'chave-secreta-1234' }

  it('gerente e supervisor recebem 403 ao trocar o repasse de outro agente', async () => {
    const gerente = await call('u-gerente1', 'PATCH', `${P}/rede/agentes/${ID.vendedor1}`, { repasse: pix })
    expect(gerente.status).toBe(403)
    expect(gerente.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
    const supervisor = await call('u-supervisor1', 'PATCH', `${P}/rede/agentes/${ID.vendedor1}`, { repasse: pix })
    expect(supervisor.status).toBe(403)
    expect(mem().rows(schema.vendasAgentes).find(a => a.id === ID.vendedor1)!.repasse ?? null).toBeNull()
    // outros campos continuam com a gestão
    expect((await call('u-gerente1', 'PATCH', `${P}/rede/agentes/${ID.vendedor1}`, { observacoes: 'ok' })).status).toBe(200)
  })

  it('o próprio agente e o master trocam; a auditoria guarda diff mascarado (Pix com 4 finais, conta mascarada)', async () => {
    expect((await call('u-vendedor1', 'PATCH', `${P}/rede/agentes/${ID.vendedor1}`, { repasse: pix })).status).toBe(200)
    expect(mem().rows(schema.vendasAgentes).find(a => a.id === ID.vendedor1)!.repasse).toMatchObject({ chavePix: 'chave-secreta-1234' })
    const conta = { tipo: 'conta', banco: '341', agencia: '0001', conta: '98765-4', titular: 'Vendedor Um', documento: '52998224725' }
    expect((await call('staff', 'PATCH', `${P}/rede/agentes/${ID.vendedor1}`, { repasse: conta })).status).toBe(200)

    const auditorias = mem().rows(schema.auditLogs).filter(a => a.action === 'vendas.agente_repasse_alterado')
    expect(auditorias).toHaveLength(2)
    expect(auditorias[0]!.metadata).toMatchObject({ antes: null, depois: { tipo: 'pix', chavePix: '••••1234' } })
    expect(auditorias[1]!.metadata).toMatchObject({
      antes: { chavePix: '••••1234' },
      depois: { banco: '341', agencia: '0001', conta: '••••-4', documento: '••••25', chavePix: null },
    })
    expect(JSON.stringify(auditorias)).not.toContain('chave-secreta')
    expect(JSON.stringify(auditorias)).not.toContain('98765')
  })

  it('reenviar o mesmo repasse não é alteração (gerente não leva 403 num formulário completo)', async () => {
    await call('staff', 'PATCH', `${P}/rede/agentes/${ID.vendedor1}`, { repasse: pix })
    expect((await call('u-gerente1', 'PATCH', `${P}/rede/agentes/${ID.vendedor1}`, { repasse: pix, observacoes: 'x' })).status).toBe(200)
  })
})

describe('A5 - escritas legadas respondem 410', () => {
  const COMERCIAL = '/api/v1/platform/comercial'

  it('pagar comissão, configuração, criar vendedor e reatribuir prospect: 410 RECURSO_LEGADO_DESATIVADO (superadmin)', async () => {
    const chamadas: [string, string, unknown][] = [
      ['POST', `${COMERCIAL}/comissoes/pagar`, { ids: [uid(1)], payoutDate: '2026-11-01' }],
      ['PUT', `${COMERCIAL}/configuracao`, { monthlySchedule: [100], setupFeePercent: 10 }],
      ['POST', `${COMERCIAL}/vendedores`, { name: 'Novo', email: 'novo@x.org' }],
      ['POST', `${COMERCIAL}/prospects/${uid(5)}/reatribuir`, { sellerUserId: 'u-x' }],
      ['PATCH', `${COMERCIAL}/vendedores/u-vendedor1`, { active: false }],
    ]
    for (const [method, path, body] of chamadas) {
      const res = await call('staff', method, path, body)
      expect(res.status, `${method} ${path}`).toBe(410)
      expect(res.body.error.code).toBe('RECURSO_LEGADO_DESATIVADO')
      expect(res.body.error.message).toContain('Rede Comercial')
    }
  })

  it('quem não é superadmin continua recebendo 403 (o 410 vem depois dos guards)', async () => {
    expect((await call('staff-admin', 'POST', `${COMERCIAL}/comissoes/pagar`, {})).status).toBe(403)
    expect((await call('u-vendedor1', 'PUT', `${COMERCIAL}/configuracao`, {})).status).toBe(403)
  })

  it('CRM antigo do clube: toda escrita é 410; o guard de papel segue valendo', async () => {
    const base = '/api/v1/t/clube-a/crm'
    for (const [method, path] of [
      ['POST', '/leads'],
      ['PATCH', `/leads/${uid(1)}`],
      ['DELETE', `/leads/${uid(1)}`],
      ['POST', `/leads/${uid(1)}/interacoes`],
      ['POST', '/vendas'],
      ['PATCH', `/vendas/${uid(1)}`],
      ['PUT', '/metas'],
    ] as const) {
      const res = await call('admin-a', method, base + path, {})
      expect(res.status, `${method} ${path}`).toBe(410)
      expect(res.body.error.code).toBe('RECURSO_LEGADO_DESATIVADO')
    }
    // sem sessão: 401, nunca 410
    expect((await call('ninguem', 'POST', `${base}/leads`, {})).status).toBe(401)
  })
})
