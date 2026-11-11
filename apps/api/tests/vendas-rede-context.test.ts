import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contexto comercial da Rede Comercial (`salesContext`), com os middlewares
 * REAIS (`requireAuth`, `requireTenantRole`, `salesContext`, `requirePapel`),
 * sessão e inquilino falsos e um banco falso que filtra pelo `where` de verdade:
 *
 *  - equipe ANNETEC e admin do clube são master IMPLÍCITO (sem linha de agente);
 *  - `platform_seller` sem agente → 403 `VENDAS_SEM_PERFIL`;
 *  - agente inativo lê e não escreve (403 `VENDAS_PERFIL_INATIVO`);
 *  - seller do clube A não entra no clube B; `platform_seller` não entra em rota de clube;
 *  - o heartbeat grava `ultima_presenca_em`;
 *  - a sessão (`resolveActiveMembership`) carrega `salesRole`/`salesAgentId`.
 */

const CLUB_A = { id: 'org-clube-a', slug: 'clube-a', name: 'Clube A', kind: 'operator' as const }
const CLUB_B = { id: 'org-clube-b', slug: 'clube-b', name: 'Clube B', kind: 'operator' as const }
const AGENTE_PLATFORM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AGENTE_INATIVO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AGENTE_CLUBE_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

type AgenteFake = {
  id: string
  scope: 'platform' | 'tenant'
  tenantId: string | null
  userId: string
  papel: 'master' | 'gerente' | 'supervisor' | 'vendedor' | 'balcao'
  ativo: boolean
}

const state = vi.hoisted(() => ({
  session: null as unknown,
  agentes: [] as unknown[],
  updates: [] as { table: string; set: Record<string, unknown>; where: unknown[] }[],
  onlineWheres: [] as unknown[][],
}))
const audits = vi.hoisted(() => [] as { action: string; metadata?: Record<string, unknown> }[])

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => state.session) } } }))
vi.mock('@/lib/audit', () => ({
  recordAudit: vi.fn(async (_c: unknown, entry: { action: string; metadata?: Record<string, unknown> }) => {
    audits.push(entry)
  }),
}))
vi.mock('@/modules/club-billing/access.service', () => ({ loadClubAccess: vi.fn() }))
const PLANOS_ANNETEC = vi.hoisted(() => [{ id: 'plano-1', name: 'Plano Empresa', priceMonthly: 99 }])
vi.mock('@/modules/platform-billing/pricing.service', () => ({ listPlanOffers: vi.fn(async () => PLANOS_ANNETEC) }))
vi.mock('@/http/middleware/tenant', () => ({
  resolveTenant: createMiddleware(async (c, next) => {
    const tenant = [CLUB_A, CLUB_B].find(item => item.slug === c.req.param('tenantSlug'))
    if (!tenant) return c.json({ error: { code: 'NOT_FOUND' } }, 404)
    c.set('tenant', tenant)
    await next()
  }),
  tenantOf: (c: { get: (key: 'tenant') => unknown }) => c.get('tenant'),
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createFakeDb, argOf, whereValues } = await import('./helpers/fake-db')
  const now = new Date('2026-11-10T12:00:00Z')
  const configRow = {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    scope: 'platform',
    tenantId: null,
    escalaMensal: [100, 50, 25],
    percentualAdesao: '50.00',
    overrides: { supervisor: 10, gerente: 5, corretora: 5 },
    balcaoPercentual: null,
    distribuicao: 'pool',
    poolRetornoHoras: 48,
    presencaMinutos: 3,
    balcaoDescontoPadrao: 30,
    metaMensalPadrao: 10,
    modelosMensagem: [],
    updatedByUserId: null,
    createdAt: now,
    updatedAt: now,
  }
  const db = createFakeDb(call => {
    const values = whereValues(argOf(call.ops, 'where'))
    if (call.kind === 'select') {
      if (call.table === schema.vendasAgentes) {
        if (call.fields && 'nome' in (call.fields as object)) {
          // Listagem de presença (`GET /presenca/online`): guarda o where para a asserção de visibilidade.
          state.onlineWheres.push(values)
          return []
        }
        const agentes = state.agentes as AgenteFake[]
        const row = agentes.find(
          a => values.includes(a.userId) && values.includes(a.scope) && (a.tenantId === null || values.includes(a.tenantId)),
        )
        return row
          ? [{ ...row, corretoraId: null, unidadeId: null, equipeId: null, codigoIndicacao: 'ABC2345', metaMensal: null, nome: 'Agente', cpf: null, telefone: null, dataNascimento: null, endereco: null, repasse: null, observacoes: null, ultimaPresencaEm: null, criadoPorUserId: null, createdAt: now, updatedAt: now }]
          : []
      }
      if (call.table === schema.vendasEquipes) return []
      if (call.table === schema.vendasConfig) return [configRow]
      if (call.table === schema.vendasLeads) return [{ pool: 2, minhaVez: 1, emAndamento: 3 }]
      if (call.table === schema.user) return [{ email: 'agente@annetec.com.br' }]
      return []
    }
    if (call.kind === 'update') {
      const table = call.table === schema.vendasAgentes ? 'agentes' : call.table === schema.vendasConfig ? 'config' : 'outra'
      state.updates.push({ table, set: argOf(call.ops, 'set'), where: values })
      if (table === 'config') return [{ ...configRow, ...argOf(call.ops, 'set'), updatedAt: now }]
      return [{ ultimaPresencaEm: now }]
    }
    return []
  })
  return { db, sql: { end: async () => {} }, schema }
})

const { vendasRedePlatformRoutes, vendasRedeTenantRoutes } = await import('@/modules/vendas-rede')
const { errorHandler } = await import('@/http/errors')
const { resolveActiveMembership } = await import('@/modules/auth/membership')
const { toSessionUser } = await import('@/modules/auth/presenter')

const app = new Hono().route('/api/v1/vendas', vendasRedePlatformRoutes).route('/api/v1/t/:tenantSlug/vendas', vendasRedeTenantRoutes)
app.onError(errorHandler)

function platformSession(userId: string, platformRole: 'superadmin' | 'platform_admin' | 'platform_seller') {
  return {
    user: { id: userId, name: 'Pessoa', email: 'p@annetec.com.br', banned: false },
    session: { id: 's' },
    membership: { scope: 'platform', platformRole, tenantId: null, tenantSlug: null, tenantRole: null, impersonatedBy: null },
  }
}

function tenantSession(userId: string, tenantRole: 'admin' | 'seller' | 'client', tenant = CLUB_A) {
  return {
    user: { id: userId, name: 'Pessoa', email: 'p@clube.test', banned: false },
    session: { id: 's' },
    membership: { scope: 'tenant', platformRole: null, tenantId: tenant.id, tenantSlug: tenant.slug, tenantRole, impersonatedBy: null },
  }
}

async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let parsed: Record<string, any> | null = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  return { status: response.status, body: parsed as Record<string, any> }
}

beforeEach(() => {
  state.session = null
  state.agentes = [
    { id: AGENTE_PLATFORM, scope: 'platform', tenantId: null, userId: 'seller-ativo', papel: 'vendedor', ativo: true },
    { id: AGENTE_INATIVO, scope: 'platform', tenantId: null, userId: 'seller-inativo', papel: 'vendedor', ativo: false },
    { id: AGENTE_CLUBE_A, scope: 'tenant', tenantId: CLUB_A.id, userId: 'seller-a', papel: 'vendedor', ativo: true },
  ] satisfies AgenteFake[]
  state.updates = []
  state.onlineWheres = []
  audits.length = 0
})

const CONFIG_BODY = {
  escalaMensal: [100, 50],
  percentualAdesao: 40,
  overrides: { supervisor: 10, gerente: 5, corretora: 5 },
  balcaoPercentual: null,
  distribuicao: 'pool',
  poolRetornoHoras: 24,
  presencaMinutos: 5,
  balcaoDescontoPadrao: 30,
  metaMensalPadrao: 10,
  modelosMensagem: [],
}

describe('GET /vendas/planos (catálogo ANNETEC para gerar proposta)', () => {
  it('equipe (superadmin e platform_admin, master implícito) e vendedor ANNETEC leem os planos', async () => {
    for (const [userId, role] of [
      ['staff-super', 'superadmin'],
      ['staff-admin', 'platform_admin'],
      ['seller-ativo', 'platform_seller'],
    ] as const) {
      state.session = platformSession(userId, role)
      const { status, body } = await call('GET', '/api/v1/vendas/planos')
      expect(status, role).toBe(200)
      expect(body.data).toEqual(PLANOS_ANNETEC)
    }
  })

  it('platform_seller sem perfil = 403 VENDAS_SEM_PERFIL; sem sessão = 401', async () => {
    state.session = platformSession('seller-sem-perfil', 'platform_seller')
    const sem = await call('GET', '/api/v1/vendas/planos')
    expect(sem.status).toBe(403)
    expect(sem.body.error.code).toBe('VENDAS_SEM_PERFIL')
    state.session = null
    expect((await call('GET', '/api/v1/vendas/planos')).status).toBe(401)
  })

  it('usuário de clube não lê o catálogo ANNETEC; a rota não existe no escopo do clube', async () => {
    state.session = tenantSession('seller-a', 'seller')
    expect((await call('GET', '/api/v1/vendas/planos')).status).toBe(403)
    expect((await call('GET', '/api/v1/t/clube-a/vendas/planos')).status).toBe(404)
  })
})

describe('escopo platform', () => {
  it('sem sessão = 401', async () => {
    expect((await call('GET', '/api/v1/vendas/eu')).status).toBe(401)
  })

  it('equipe ANNETEC é master implícito (sem linha em vendas_agentes)', async () => {
    for (const role of ['superadmin', 'platform_admin'] as const) {
      state.session = platformSession(`staff-${role}`, role)
      const { status, body } = await call('GET', '/api/v1/vendas/eu')
      expect(status).toBe(200)
      expect(body.data).toMatchObject({
        scope: 'platform',
        tenantId: null,
        papel: 'master',
        masterImplicito: true,
        podeEscrever: true,
        agente: null,
        contadores: { pool: 2, minhaVez: 1, emAndamento: 3 },
      })
    }
  })

  it('platform_seller sem agente = 403 VENDAS_SEM_PERFIL', async () => {
    state.session = platformSession('seller-sem-perfil', 'platform_seller')
    const { status, body } = await call('GET', '/api/v1/vendas/eu')
    expect(status).toBe(403)
    expect(body.error.code).toBe('VENDAS_SEM_PERFIL')
  })

  it('platform_seller com agente ativo lê o próprio perfil', async () => {
    state.session = platformSession('seller-ativo', 'platform_seller')
    const { status, body } = await call('GET', '/api/v1/vendas/eu')
    expect(status).toBe(200)
    expect(body.data).toMatchObject({ papel: 'vendedor', masterImplicito: false, podeEscrever: true })
    expect(body.data.agente).toMatchObject({ id: AGENTE_PLATFORM, ativo: true, email: 'agente@annetec.com.br' })
  })

  it('agente inativo lê e não escreve', async () => {
    state.session = platformSession('seller-inativo', 'platform_seller')
    const leitura = await call('GET', '/api/v1/vendas/eu')
    expect(leitura.status).toBe(200)
    expect(leitura.body.data.podeEscrever).toBe(false)

    const escrita = await call('POST', '/api/v1/vendas/presenca')
    expect(escrita.status).toBe(403)
    expect(escrita.body.error.code).toBe('VENDAS_PERFIL_INATIVO')
    expect(state.updates).toEqual([])
  })

  it('cliente/seller de clube não entra no escopo platform', async () => {
    state.session = tenantSession('seller-a', 'seller')
    expect((await call('GET', '/api/v1/vendas/eu')).status).toBe(403)
  })

  it('heartbeat atualiza a presença do agente da sessão', async () => {
    state.session = platformSession('seller-ativo', 'platform_seller')
    const { status, body } = await call('POST', '/api/v1/vendas/presenca')
    expect(status).toBe(200)
    expect(body.data).toMatchObject({ registrada: true })
    expect(body.data.ultimaPresencaEm).toBeTruthy()
    const update = state.updates.find(u => u.table === 'agentes')
    expect(update).toBeTruthy()
    expect(Object.keys(update!.set)).toEqual(['ultimaPresencaEm'])
    expect(update!.where).toContain(AGENTE_PLATFORM)
  })

  it('heartbeat do master implícito não grava nada', async () => {
    state.session = platformSession('staff-1', 'superadmin')
    const { status, body } = await call('POST', '/api/v1/vendas/presenca')
    expect(status).toBe(200)
    expect(body.data).toEqual({ registrada: false, ultimaPresencaEm: null })
    expect(state.updates).toEqual([])
  })

  it('GET /presenca/online: vendedor só enxerga a si mesmo; master, o escopo todo', async () => {
    state.session = platformSession('seller-ativo', 'platform_seller')
    expect((await call('GET', '/api/v1/vendas/presenca/online')).status).toBe(200)
    expect(state.onlineWheres.at(-1)).toContain(AGENTE_PLATFORM)

    state.session = platformSession('staff-1', 'superadmin')
    expect((await call('GET', '/api/v1/vendas/presenca/online')).status).toBe(200)
    expect(state.onlineWheres.at(-1)).not.toContain(AGENTE_PLATFORM)
  })
})

describe('config (master)', () => {
  it('vendedor lê só a parte pública e não escreve (VENDAS_SEM_PERMISSAO_NA_REDE)', async () => {
    state.session = platformSession('seller-ativo', 'platform_seller')
    const leitura = await call('GET', '/api/v1/vendas/config')
    expect(leitura.status).toBe(200)
    expect(leitura.body.data.completa).toBeNull()
    expect(leitura.body.data.publica).toMatchObject({ presencaMinutos: 3, distribuicao: 'pool' })

    const escrita = await call('PUT', '/api/v1/vendas/config', CONFIG_BODY)
    expect(escrita.status).toBe(403)
    expect(escrita.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
  })

  it('master lê a regra completa e salva com auditoria', async () => {
    state.session = platformSession('staff-1', 'superadmin')
    const leitura = await call('GET', '/api/v1/vendas/config')
    expect(leitura.body.data.completa).toMatchObject({ escalaMensal: [100, 50, 25], percentualAdesao: 50 })

    const escrita = await call('PUT', '/api/v1/vendas/config', CONFIG_BODY)
    expect(escrita.status).toBe(200)
    expect(escrita.body.data.completa).toMatchObject({ escalaMensal: [100, 50], percentualAdesao: 40, presencaMinutos: 5 })
    expect(state.updates.find(u => u.table === 'config')?.set).toMatchObject({ updatedByUserId: 'staff-1', percentualAdesao: '40' })
    expect(audits.map(a => a.action)).toContain('vendas.config_updated')
  })

  it('config inválida = 400', async () => {
    state.session = platformSession('staff-1', 'superadmin')
    const { status } = await call('PUT', '/api/v1/vendas/config', { ...CONFIG_BODY, escalaMensal: [] })
    expect(status).toBe(400)
  })
})

describe('escopo tenant', () => {
  it('admin do clube é master implícito', async () => {
    state.session = tenantSession('admin-a', 'admin')
    const { status, body } = await call('GET', '/api/v1/t/clube-a/vendas/eu')
    expect(status).toBe(200)
    expect(body.data).toMatchObject({ scope: 'tenant', tenantId: CLUB_A.id, papel: 'master', masterImplicito: true, agente: null })
  })

  it('seller do clube A resolve o próprio agente', async () => {
    state.session = tenantSession('seller-a', 'seller')
    const { status, body } = await call('GET', '/api/v1/t/clube-a/vendas/eu')
    expect(status).toBe(200)
    expect(body.data).toMatchObject({ papel: 'vendedor', masterImplicito: false })
    expect(body.data.agente.id).toBe(AGENTE_CLUBE_A)
  })

  it('seller sem agente = 403 VENDAS_SEM_PERFIL', async () => {
    state.session = tenantSession('seller-sem-perfil', 'seller')
    const { status, body } = await call('GET', '/api/v1/t/clube-a/vendas/eu')
    expect(status).toBe(403)
    expect(body.error.code).toBe('VENDAS_SEM_PERFIL')
  })

  it('seller do clube A não acessa /t/clube-b/vendas/eu', async () => {
    state.session = tenantSession('seller-a', 'seller', CLUB_A)
    const { status, body } = await call('GET', '/api/v1/t/clube-b/vendas/eu')
    expect(status).toBe(403)
    expect(body.error.code).toBe('TENANT_MISMATCH')
  })

  it('associado (client) não entra', async () => {
    state.session = tenantSession('cliente-1', 'client')
    expect((await call('GET', '/api/v1/t/clube-a/vendas/eu')).status).toBe(403)
  })

  it('platform_seller não acessa rota de tenant', async () => {
    state.session = platformSession('seller-ativo', 'platform_seller')
    expect((await call('GET', '/api/v1/t/clube-a/vendas/eu')).status).toBe(403)
    expect((await call('POST', '/api/v1/t/clube-a/vendas/presenca')).status).toBe(403)
  })

  it('equipe ANNETEC lê o clube como master implícito; escrita só superadmin', async () => {
    state.session = platformSession('staff-admin', 'platform_admin')
    const leitura = await call('GET', '/api/v1/t/clube-a/vendas/eu')
    expect(leitura.status).toBe(200)
    expect(leitura.body.data).toMatchObject({ papel: 'master', masterImplicito: true, tenantId: CLUB_A.id })
    expect((await call('PUT', '/api/v1/t/clube-a/vendas/config', CONFIG_BODY)).status).toBe(403)

    state.session = platformSession('staff-super', 'superadmin')
    expect((await call('PUT', '/api/v1/t/clube-a/vendas/config', CONFIG_BODY)).status).toBe(200)
  })

  it('o balcão só existe no escopo tenant', async () => {
    state.session = platformSession('staff-super', 'superadmin')
    expect((await call('GET', '/api/v1/vendas/balcao/hoje')).status).toBe(404)
  })
})

describe('sessão carrega o perfil comercial', () => {
  it('platform_seller e seller do clube recebem salesRole/salesAgentId; os demais, null', async () => {
    const seller = await resolveActiveMembership({ id: 'seller-ativo', role: 'platform_seller', banned: false }, {})
    expect(seller).toMatchObject({ scope: 'platform', salesRole: 'vendedor', salesAgentId: AGENTE_PLATFORM })

    const semPerfil = await resolveActiveMembership({ id: 'seller-sem-perfil', role: 'platform_seller', banned: false }, {})
    expect(semPerfil).toMatchObject({ salesRole: null, salesAgentId: null })

    const staff = await resolveActiveMembership({ id: 'staff-1', role: 'superadmin', banned: false }, {})
    expect(staff).toMatchObject({ platformRole: 'superadmin', salesRole: null, salesAgentId: null })

    const banido = await resolveActiveMembership({ id: 'seller-ativo', role: 'platform_seller', banned: true }, {})
    expect(banido).toMatchObject({ salesRole: null, salesAgentId: null })
  })

  it('/auth/session (toSessionUser) expõe salesRole e salesAgentId', () => {
    const session = { ...platformSession('seller-ativo', 'platform_seller'), membership: { ...platformSession('x', 'platform_seller').membership, salesRole: 'balcao', salesAgentId: AGENTE_PLATFORM } }
    expect(toSessionUser(session as never)).toMatchObject({ salesRole: 'balcao', salesAgentId: AGENTE_PLATFORM })
    expect(toSessionUser(platformSession('staff', 'superadmin') as never)).toMatchObject({ salesRole: null, salesAgentId: null })
  })
})
