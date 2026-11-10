import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rede Comercial, parte "Rede" (corretoras, unidades, equipes, agentes, convites,
 * desempenho e árvore) pela HTTP, com os middlewares REAIS do módulo (`salesContext`,
 * `requirePapel`), sessão falsa e um banco EM MEMÓRIA que interpreta as consultas do
 * drizzle (nada de mock de retorno por tabela):
 *
 *  - matriz de criação (master/gerente/supervisor/vendedor/balcão × corretora, unidade,
 *    equipe, agente) e consistência de vínculo;
 *  - unicidade de CNPJ (por escopo) e de código de indicação;
 *  - isolamento entre inquilinos e entre platform e tenant (id de outro escopo = 404);
 *  - criação de gerente liga `gerente_agente_id`; e-mail já existente;
 *  - desativar bloqueia a escrita do agente (mas não o login);
 *  - visibilidade da listagem e da árvore por papel; desempenho; reenvio de convite.
 */

const CLUB_A = { id: 'org-clube-a', slug: 'clube-a', name: 'Clube A', kind: 'operator' as const }
const CLUB_B = { id: 'org-clube-b', slug: 'clube-b', name: 'Clube B', kind: 'operator' as const }

const state = vi.hoisted(() => ({ session: null as unknown }))
const memory = vi.hoisted(() => ({ db: null as null | Record<string, unknown> }))
const fakes = vi.hoisted(() => ({
  audits: [] as { action: string; resourceId?: string | null; metadata?: Record<string, unknown> }[],
  sendEmail: vi.fn(async (_input: unknown) => ({ id: 'email-1', status: 'simulated' as const })),
  sendStaffInvite: vi.fn(async (_input: unknown) => ({ id: 'email-2', status: 'simulated' as const })),
  resetTenantUserPassword: vi.fn(async (..._args: unknown[]) => ({ email: 'x@x.test', emailStatus: 'simulated' as const, role: 'seller' as const })),
  platformCreate: vi.fn(),
  tenantCreate: vi.fn(),
  contador: 0,
}))

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => state.session) } } }))
vi.mock('@/lib/audit', () => ({
  recordAudit: vi.fn(async (_c: unknown, entry: { action: string; resourceId?: string | null; metadata?: Record<string, unknown> }) => {
    fakes.audits.push(entry)
  }),
}))
vi.mock('@/lib/email', () => ({ sendEmail: (input: unknown) => fakes.sendEmail(input) }))
vi.mock('@/modules/club-billing/access.service', () => ({ loadClubAccess: vi.fn() }))
vi.mock('@/modules/users/access.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/users/access.service')>()),
  sendStaffInvite: (input: unknown) => fakes.sendStaffInvite(input),
  resetTenantUserPassword: (...args: unknown[]) => fakes.resetTenantUserPassword(...args),
}))
vi.mock('@/modules/platform-users/service', () => ({
  platformUsersService: { create: (...args: unknown[]) => fakes.platformCreate(...args) },
}))
vi.mock('@/modules/users/service', () => ({
  usersService: { create: (...args: unknown[]) => fakes.tenantCreate(...args) },
}))
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
  const { createMemoryDb } = await import('./helpers/memory-db')
  const instance = createMemoryDb({
    tables: [
      schema.user,
      schema.member,
      schema.account,
      schema.session,
      schema.vendasConfig,
      schema.vendasCorretoras,
      schema.vendasUnidades,
      schema.vendasEquipes,
      schema.vendasAgentes,
      schema.vendasLeads,
      schema.vendasLeadEventos,
      schema.vendasComissoes,
    ],
    uniques: [
      { table: schema.vendasAgentes, keys: ['codigoIndicacao'] },
      { table: schema.vendasAgentes, keys: ['userId', 'scope'] },
      { table: schema.user, keys: ['email'] },
    ],
  })
  memory.db = instance as unknown as Record<string, unknown>
  return { db: instance.db, sql: { end: async () => {} }, schema }
})

const schema = await import('@/db/schema')
const { vendasRedePlatformRoutes, vendasRedeTenantRoutes } = await import('@/modules/vendas-rede')
const { errorHandler } = await import('@/http/errors')

type Memory = import('./helpers/memory-db').MemoryDb
const mem = () => memory.db as unknown as Memory

const app = new Hono().route('/api/v1/vendas', vendasRedePlatformRoutes).route('/api/v1/t/:tenantSlug/vendas', vendasRedeTenantRoutes)
app.onError(errorHandler)

const P = '/api/v1/vendas'
const TA = '/api/v1/t/clube-a/vendas'
const TB = '/api/v1/t/clube-b/vendas'

/** UUID v4 válido e legível. */
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const CNPJ_1 = '11222333000181'
const CNPJ_2 = '11444777000161'
const CNPJ_3 = '00000000000191'

const CORR1 = u(1)
const CORR2 = u(2)
const CORR3 = u(3) // sem gerente
const UN1 = u(11)
const UN2 = u(12)
const UNP = u(13) // unidade própria
const EQ1 = u(21)
const EQ2 = u(22)
const GER1 = u(31)
const SUP1 = u(32)
const VEN1 = u(33)
const BAL1 = u(34)
const GER2 = u(35)
const SUP2 = u(36)
const VEN2 = u(37)
const SOLO = u(38)
const BALP = u(39)
const CORRA = u(101)
const GERA = u(131)
const VENA = u(133)
const CORRB = u(201)

function platformSession(userId: string, platformRole: 'superadmin' | 'platform_admin' | 'platform_seller') {
  return {
    user: { id: userId, name: 'Pessoa', email: `${userId}@annetec.com.br`, banned: false },
    session: { id: 's' },
    membership: { scope: 'platform', platformRole, tenantId: null, tenantSlug: null, tenantRole: null, impersonatedBy: null },
  }
}

function tenantSession(userId: string, tenantRole: 'admin' | 'seller' | 'client', tenant = CLUB_A) {
  return {
    user: { id: userId, name: 'Pessoa', email: `${userId}@clube.test`, banned: false },
    session: { id: 's' },
    membership: { scope: 'tenant', platformRole: null, tenantId: tenant.id, tenantSlug: tenant.slug, tenantRole, impersonatedBy: null },
  }
}

const staff = () => platformSession('staff-1', 'superadmin')
const agentePlatform = (userId: string) => platformSession(userId, 'platform_seller')

async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer x' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let parsed: Record<string, any> = {}
  try {
    parsed = text ? JSON.parse(text) : {}
  } catch {
    parsed = {}
  }
  return { status: response.status, body: parsed, text }
}

let codigo = 0
function seedAgente(input: {
  id: string
  userId: string
  papel: 'master' | 'gerente' | 'supervisor' | 'vendedor' | 'balcao'
  scope?: 'platform' | 'tenant'
  tenantId?: string | null
  corretoraId?: string | null
  unidadeId?: string | null
  equipeId?: string | null
  ativo?: boolean
  nome?: string
}) {
  codigo += 1
  mem().insertRow(schema.user, {
    id: input.userId,
    name: input.nome ?? input.userId,
    email: `${input.userId}@x.test`,
    role: input.scope === 'tenant' ? 'user' : 'platform_seller',
  })
  return mem().insertRow(schema.vendasAgentes, {
    id: input.id,
    scope: input.scope ?? 'platform',
    tenantId: input.tenantId ?? null,
    userId: input.userId,
    papel: input.papel,
    corretoraId: input.corretoraId ?? null,
    unidadeId: input.unidadeId ?? null,
    equipeId: input.equipeId ?? null,
    codigoIndicacao: `SEED${String(codigo).padStart(3, '0')}`,
    ativo: input.ativo ?? true,
    nome: input.nome ?? input.userId,
  })
}

function seed() {
  const corretora = (id: string, cnpj: string, nome: string, extra: Record<string, unknown> = {}) =>
    mem().insertRow(schema.vendasCorretoras, { id, scope: 'platform', tenantId: null, cnpj, nomeFantasia: nome, razaoSocial: `${nome} Ltda`, status: 'ativa', ...extra })
  corretora(CORR1, CNPJ_1, 'Corretora Um', { gerenteAgenteId: GER1 })
  corretora(CORR2, CNPJ_2, 'Corretora Dois', { gerenteAgenteId: GER2 })
  corretora(CORR3, CNPJ_3, 'Corretora Três')
  const unidade = (id: string, corretoraId: string | null, nome: string, tipo = 'loja') =>
    mem().insertRow(schema.vendasUnidades, { id, scope: 'platform', tenantId: null, corretoraId, nome, tipo, status: 'ativa' })
  unidade(UN1, CORR1, 'Unidade Um')
  unidade(UN2, CORR2, 'Unidade Dois')
  unidade(UNP, null, 'Clínica Própria', 'clinica')
  const equipe = (id: string, corretoraId: string, unidadeId: string, nome: string, supervisorAgenteId: string) =>
    mem().insertRow(schema.vendasEquipes, { id, scope: 'platform', tenantId: null, corretoraId, unidadeId, nome, supervisorAgenteId, status: 'ativa' })
  equipe(EQ1, CORR1, UN1, 'Equipe Um', SUP1)
  equipe(EQ2, CORR2, UN2, 'Equipe Dois', SUP2)

  seedAgente({ id: GER1, userId: 'u-ger1', papel: 'gerente', corretoraId: CORR1, nome: 'Gerente Um' })
  seedAgente({ id: SUP1, userId: 'u-sup1', papel: 'supervisor', corretoraId: CORR1, nome: 'Supervisor Um' })
  seedAgente({ id: VEN1, userId: 'u-ven1', papel: 'vendedor', corretoraId: CORR1, unidadeId: UN1, equipeId: EQ1, nome: 'Vendedor Um' })
  seedAgente({ id: BAL1, userId: 'u-bal1', papel: 'balcao', corretoraId: CORR1, unidadeId: UN1, nome: 'Balcão Um' })
  seedAgente({ id: GER2, userId: 'u-ger2', papel: 'gerente', corretoraId: CORR2, nome: 'Gerente Dois' })
  seedAgente({ id: SUP2, userId: 'u-sup2', papel: 'supervisor', corretoraId: CORR2, nome: 'Supervisor Dois' })
  seedAgente({ id: VEN2, userId: 'u-ven2', papel: 'vendedor', corretoraId: CORR2, unidadeId: UN2, equipeId: EQ2, nome: 'Vendedor Dois' })
  seedAgente({ id: SOLO, userId: 'u-solo', papel: 'vendedor', nome: 'Vendedor Solo' })
  seedAgente({ id: BALP, userId: 'u-balp', papel: 'balcao', unidadeId: UNP, nome: 'Balcão Próprio' })

  // Inquilinos: A tem corretora e gerente; B só a corretora (isolamento).
  mem().insertRow(schema.vendasCorretoras, { id: CORRA, scope: 'tenant', tenantId: CLUB_A.id, cnpj: CNPJ_1, nomeFantasia: 'Corretora do Clube A', razaoSocial: 'A Ltda', status: 'ativa', gerenteAgenteId: GERA })
  mem().insertRow(schema.vendasCorretoras, { id: CORRB, scope: 'tenant', tenantId: CLUB_B.id, cnpj: CNPJ_2, nomeFantasia: 'Corretora do Clube B', razaoSocial: 'B Ltda', status: 'ativa' })
  seedAgente({ id: GERA, userId: 'u-gera', papel: 'gerente', scope: 'tenant', tenantId: CLUB_A.id, corretoraId: CORRA, nome: 'Gerente A' })
  seedAgente({ id: VENA, userId: 'u-vena', papel: 'vendedor', scope: 'tenant', tenantId: CLUB_A.id, nome: 'Vendedor A' })
}

const agentes = () => mem().rows(schema.vendasAgentes) as Record<string, any>[]
const corretoras = () => mem().rows(schema.vendasCorretoras) as Record<string, any>[]
const usuarios = () => mem().rows(schema.user) as Record<string, any>[]
const auditou = (action: string) => fakes.audits.filter(a => a.action === action)

beforeEach(() => {
  mem().reset()
  codigo = 0
  fakes.contador = 0
  fakes.audits.length = 0
  fakes.sendEmail.mockClear()
  fakes.sendStaffInvite.mockClear()
  fakes.resetTenantUserPassword.mockClear()
  state.session = null
  // Contas novas (mocks de `platformUsersService`/`usersService`): inserem em `user` como os reais.
  fakes.platformCreate.mockReset().mockImplementation(async (input: { name: string; email: string; phone?: string }) => {
    fakes.contador += 1
    const row = mem().insertRow(schema.user, { id: `novo-${fakes.contador}`, name: input.name, email: input.email, role: 'platform_seller', phone: input.phone ?? null })
    return { id: row.id, name: row.name, email: row.email }
  })
  fakes.tenantCreate.mockReset().mockImplementation(async (tenantId: string, input: { name: string; email: string }) => {
    fakes.contador += 1
    const row = mem().insertRow(schema.user, { id: `novo-${fakes.contador}`, name: input.name, email: input.email, role: 'user' })
    mem().insertRow(schema.member, { id: `m-${fakes.contador}`, organizationId: tenantId, userId: row.id as string, role: 'seller', accessStatus: 'active' })
    return { tenantUser: { id: row.id, name: row.name, email: row.email, role: 'seller' }, provisionalPassword: 'SenhaProvisoria123' }
  })
  seed()
})

let n = 0
const cadastro = (extra: Record<string, unknown> = {}) => {
  n += 1
  return { nome: `Pessoa Nova ${n}`, email: `nova${n}@exemplo.test`, cpf: '52998224725', telefone: '11987654321', ...extra }
}

// ---------------------------------------------------------------------------
// Corretoras
// ---------------------------------------------------------------------------

describe('corretoras', () => {
  const corpo = (extra: Record<string, unknown> = {}) => ({ nomeFantasia: 'Nova Corretora', razaoSocial: 'Nova Corretora Ltda', cnpj: '45.723.174/0001-10', ...extra })

  it('master cria e lista; auditoria registrada; CNPJ só dígitos', async () => {
    state.session = staff()
    const criada = await call('POST', `${P}/rede/corretoras`, corpo())
    expect(criada.status).toBe(201)
    expect(criada.body.data).toMatchObject({ cnpj: '45723174000110', status: 'ativa', gerenteAgenteId: null })
    expect(auditou('vendas.corretora_created')).toHaveLength(1)

    const lista = await call('GET', `${P}/rede/corretoras?q=nova`)
    expect(lista.status).toBe(200)
    expect(lista.body.data.map((c: { nomeFantasia: string }) => c.nomeFantasia)).toEqual(['Nova Corretora'])
    expect(lista.body.meta).toMatchObject({ total: 1 })
  })

  it('CNPJ inválido = 400; CNPJ repetido no escopo = 409; o mesmo CNPJ em outro escopo é permitido', async () => {
    state.session = staff()
    expect((await call('POST', `${P}/rede/corretoras`, corpo({ cnpj: '11111111111111' }))).status).toBe(400)

    const repetida = await call('POST', `${P}/rede/corretoras`, corpo({ cnpj: CNPJ_1 }))
    expect(repetida.status).toBe(409)
    expect(repetida.body.error.code).toBe('ALREADY_EXISTS')

    // O CNPJ 11222333000181 já é da corretora do clube A: o clube B pode cadastrá-lo.
    state.session = tenantSession('admin-b', 'admin', CLUB_B)
    expect((await call('POST', `${TB}/rede/corretoras`, corpo({ cnpj: CNPJ_1 }))).status).toBe(201)
    // E o clube A não pode duplicar o próprio.
    state.session = tenantSession('admin-a', 'admin', CLUB_A)
    expect((await call('POST', `${TA}/rede/corretoras`, corpo({ cnpj: CNPJ_1 }))).status).toBe(409)
  })

  it('PATCH com CNPJ de outra corretora = 409; mantém o próprio CNPJ sem erro', async () => {
    state.session = staff()
    expect((await call('PATCH', `${P}/rede/corretoras/${CORR1}`, { cnpj: CNPJ_2 })).status).toBe(409)
    const ok = await call('PATCH', `${P}/rede/corretoras/${CORR1}`, { cnpj: CNPJ_1, nomeFantasia: 'Renomeada' })
    expect(ok.status).toBe(200)
    expect(ok.body.data.nomeFantasia).toBe('Renomeada')
    expect(auditou('vendas.corretora_updated')).toHaveLength(1)
  })

  it('só master: gerente, supervisor, vendedor e balcão recebem VENDAS_SEM_PERMISSAO_NA_REDE', async () => {
    for (const user of ['u-ger1', 'u-sup1', 'u-ven1', 'u-bal1']) {
      state.session = agentePlatform(user)
      for (const [method, path, body] of [
        ['GET', `${P}/rede/corretoras`, undefined],
        ['POST', `${P}/rede/corretoras`, corpo()],
        ['GET', `${P}/rede/corretoras/${CORR1}`, undefined],
        ['PATCH', `${P}/rede/corretoras/${CORR1}`, { nomeFantasia: 'X Y' }],
        ['DELETE', `${P}/rede/corretoras/${CORR1}`, undefined],
        ['POST', `${P}/rede/corretoras/${CORR3}/gerente`, cadastro()],
      ] as const) {
        const resposta = await call(method, path, body)
        expect(resposta.status, `${user} ${method} ${path}`).toBe(403)
        expect(resposta.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
      }
    }
    expect(corretoras()).toHaveLength(5)
  })

  it('DELETE: com agentes só inativa; vazia, apaga', async () => {
    state.session = staff()
    const comAgentes = await call('DELETE', `${P}/rede/corretoras/${CORR1}`)
    expect(comAgentes.status).toBe(200)
    expect(comAgentes.body.data.resultado).toBe('inativada')
    expect(corretoras().find(c => c.id === CORR1)?.status).toBe('inativa')
    expect(auditou('vendas.corretora_deactivated')).toHaveLength(1)

    const vazia = await call('DELETE', `${P}/rede/corretoras/${CORR3}`)
    expect(vazia.body.data.resultado).toBe('removida')
    expect(corretoras().some(c => c.id === CORR3)).toBe(false)
    expect(auditou('vendas.corretora_removed')).toHaveLength(1)
  })

  it('isolamento: id de outro escopo é 404 (platform x tenant e clube A x clube B)', async () => {
    state.session = staff()
    expect((await call('GET', `${P}/rede/corretoras/${CORRA}`)).status).toBe(404)
    expect((await call('PATCH', `${P}/rede/corretoras/${CORRB}`, { nomeFantasia: 'Invasor' })).status).toBe(404)
    expect((await call('DELETE', `${P}/rede/corretoras/${CORRA}`)).status).toBe(404)

    state.session = tenantSession('admin-a', 'admin', CLUB_A)
    expect((await call('GET', `${TA}/rede/corretoras/${CORRB}`)).status).toBe(404)
    expect((await call('GET', `${TA}/rede/corretoras/${CORR1}`)).status).toBe(404)
    expect((await call('GET', `${TA}/rede/corretoras/${CORRA}`)).status).toBe(200)
    const lista = await call('GET', `${TA}/rede/corretoras`)
    expect(lista.body.data.map((c: { id: string }) => c.id)).toEqual([CORRA])
    expect(corretoras().find(c => c.id === CORRB)?.nomeFantasia).toBe('Corretora do Clube B')
  })
})

describe('gerente da corretora', () => {
  it('cria o usuário, o agente gerente e liga gerente_agente_id; convite enviado sem expor a senha', async () => {
    state.session = staff()
    const resposta = await call('POST', `${P}/rede/corretoras/${CORR3}/gerente`, cadastro({ email: 'gerente3@exemplo.test' }))
    expect(resposta.status).toBe(201)
    const { agente, convite } = resposta.body.data
    expect(agente).toMatchObject({ papel: 'gerente', corretoraId: CORR3, unidadeId: null, equipeId: null, ativo: true, scope: 'platform', email: 'gerente3@exemplo.test' })
    expect(agente.codigoIndicacao).toMatch(/^[A-HJ-NP-Z2-9]{7}$/)
    expect(convite).toMatchObject({ enviado: true, status: 'simulated', contaNova: true })
    expect(corretoras().find(c => c.id === CORR3)?.gerenteAgenteId).toBe(agente.id)
    expect(usuarios().find(x => x.email === 'gerente3@exemplo.test')?.role).toBe('platform_seller')
    // E-mail com a marca da plataforma; a senha vai em `secrets`, nunca na resposta ou na auditoria.
    const envio = fakes.sendEmail.mock.calls[0]![0] as { template: string; secrets: string[]; data: Record<string, unknown> }
    expect(envio.template).toBe('club_staff_invite')
    expect(envio.secrets).toHaveLength(1)
    expect(envio.data.clubName).toBe('ANNETEC')
    expect(resposta.text).not.toContain(envio.secrets[0])
    expect(JSON.stringify(fakes.audits)).not.toContain(envio.secrets[0])
    expect(auditou('vendas.gerente_created')).toHaveLength(1)
  })

  it('segundo gerente na mesma corretora = 409; corretora de outro escopo = 404', async () => {
    state.session = staff()
    expect((await call('POST', `${P}/rede/corretoras/${CORR1}/gerente`, cadastro())).status).toBe(409)
    expect((await call('POST', `${P}/rede/corretoras/${CORRA}/gerente`, cadastro())).status).toBe(404)
    expect(fakes.platformCreate).not.toHaveBeenCalled()
  })

  it('e-mail já existente: vendedor ANNETEC sem agente é reaproveitado; agente existente = 409; conta que não é de vendedor = 409', async () => {
    mem().insertRow(schema.user, { id: 'u-livre', name: 'Livre', email: 'livre@exemplo.test', role: 'platform_seller' })
    mem().insertRow(schema.user, { id: 'u-equipe', name: 'Equipe', email: 'equipe@exemplo.test', role: 'platform_admin' })
    state.session = staff()

    const reaproveitado = await call('POST', `${P}/rede/corretoras/${CORR3}/gerente`, cadastro({ email: 'Livre@Exemplo.test' }))
    expect(reaproveitado.status).toBe(201)
    expect(reaproveitado.body.data.agente.userId).toBe('u-livre')
    expect(reaproveitado.body.data.convite.contaNova).toBe(false)
    expect(fakes.platformCreate).not.toHaveBeenCalled()
    const envio = fakes.sendEmail.mock.calls[0]![0] as { secrets: string[] }
    expect(envio.secrets).toEqual([])

    const comAgente = await call('POST', `${P}/rede/agentes`, cadastro({ email: 'u-sup1@x.test', papel: 'vendedor' }))
    expect(comAgente.status).toBe(409)
    expect(comAgente.body.error.code).toBe('ALREADY_EXISTS')

    const deEquipe = await call('POST', `${P}/rede/agentes`, cadastro({ email: 'equipe@exemplo.test', papel: 'vendedor' }))
    expect(deEquipe.status).toBe(409)
    expect(agentes().some(a => a.userId === 'u-equipe')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

describe('unidades', () => {
  const corpo = (extra: Record<string, unknown> = {}) => ({ nome: 'Nova Unidade', tipo: 'loja', ...extra })

  it('master cria em qualquer corretora e também unidade própria', async () => {
    state.session = staff()
    expect((await call('POST', `${P}/rede/unidades`, corpo({ corretoraId: CORR2 }))).status).toBe(201)
    const propria = await call('POST', `${P}/rede/unidades`, corpo({ tipo: 'hospital' }))
    expect(propria.status).toBe(201)
    expect(propria.body.data.corretoraId).toBeNull()
    expect(auditou('vendas.unidade_created')).toHaveLength(2)
  })

  it('gerente: só na própria corretora (corretoraId obrigatório e igual ao dele)', async () => {
    state.session = agentePlatform('u-ger1')
    expect((await call('POST', `${P}/rede/unidades`, corpo({ corretoraId: CORR1 }))).status).toBe(201)
    for (const body of [corpo({ corretoraId: CORR2 }), corpo()]) {
      const resposta = await call('POST', `${P}/rede/unidades`, body)
      expect(resposta.status).toBe(403)
      expect(resposta.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
    }
    expect((await call('PATCH', `${P}/rede/unidades/${UN1}`, { nome: 'Renomeada' })).status).toBe(200)
    expect((await call('PATCH', `${P}/rede/unidades/${UN2}`, { nome: 'Invasora' })).status).toBe(403)
    expect((await call('PATCH', `${P}/rede/unidades/${UN1}`, { corretoraId: CORR2 })).status).toBe(403)
    expect((await call('DELETE', `${P}/rede/unidades/${UN2}`)).status).toBe(403)
    expect((await call('DELETE', `${P}/rede/unidades/${UNP}`)).status).toBe(403)
  })

  it('supervisor, vendedor e balcão: 403 VENDAS_SEM_PERMISSAO_NA_REDE em todas as escritas', async () => {
    for (const user of ['u-sup1', 'u-ven1', 'u-bal1']) {
      state.session = agentePlatform(user)
      for (const [method, path, body] of [
        ['POST', `${P}/rede/unidades`, corpo({ corretoraId: CORR1 })],
        ['PATCH', `${P}/rede/unidades/${UN1}`, { nome: 'Outra' }],
        ['DELETE', `${P}/rede/unidades/${UN1}`, undefined],
      ] as const) {
        const resposta = await call(method, path, body)
        expect(resposta.status).toBe(403)
        expect(resposta.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
      }
    }
  })

  it('corretora inexistente ou de outro inquilino = 404; DELETE inativa quando há equipe/agente', async () => {
    state.session = tenantSession('admin-a', 'admin', CLUB_A)
    expect((await call('POST', `${TA}/rede/unidades`, corpo({ corretoraId: CORRB }))).status).toBe(404)
    expect((await call('PATCH', `${TA}/rede/unidades/${UN1}`, { nome: 'X Y' })).status).toBe(404)

    state.session = staff()
    const inativada = await call('DELETE', `${P}/rede/unidades/${UN1}`)
    expect(inativada.body.data.resultado).toBe('inativada')
    const nova = await call('POST', `${P}/rede/unidades`, corpo({ corretoraId: CORR3 }))
    const removida = await call('DELETE', `${P}/rede/unidades/${nova.body.data.id}`)
    expect(removida.body.data.resultado).toBe('removida')
  })

  it('responsável precisa ser agente da mesma corretora', async () => {
    state.session = staff()
    expect((await call('POST', `${P}/rede/unidades`, corpo({ corretoraId: CORR1, responsavelAgenteId: VEN2 }))).status).toBe(422)
    expect((await call('POST', `${P}/rede/unidades`, corpo({ corretoraId: CORR1, responsavelAgenteId: VEN1 }))).status).toBe(201)
  })

  it('listagem respeita o papel: gerente só as da corretora; vendedor só a sua', async () => {
    state.session = agentePlatform('u-ger1')
    expect((await call('GET', `${P}/rede/unidades`)).body.data.map((x: { id: string }) => x.id)).toEqual([UN1])
    state.session = agentePlatform('u-ven1')
    expect((await call('GET', `${P}/rede/unidades`)).body.data.map((x: { id: string }) => x.id)).toEqual([UN1])
    state.session = staff()
    expect((await call('GET', `${P}/rede/unidades`)).body.data).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// Equipes
// ---------------------------------------------------------------------------

describe('equipes', () => {
  const corpo = (extra: Record<string, unknown> = {}) => ({ nome: 'Nova Equipe', corretoraId: CORR1, ...extra })

  it('master cria em qualquer corretora, com supervisor da mesma corretora', async () => {
    state.session = staff()
    const criada = await call('POST', `${P}/rede/equipes`, corpo({ corretoraId: CORR2, supervisorAgenteId: SUP2 }))
    expect(criada.status).toBe(201)
    expect(criada.body.data).toMatchObject({ corretoraId: CORR2, supervisorAgenteId: SUP2, status: 'ativa' })
    expect(auditou('vendas.equipe_created')).toHaveLength(1)
  })

  it('gerente só na própria corretora; supervisor, vendedor e balcão não criam', async () => {
    state.session = agentePlatform('u-ger1')
    expect((await call('POST', `${P}/rede/equipes`, corpo({ supervisorAgenteId: SUP1 }))).status).toBe(201)
    expect((await call('POST', `${P}/rede/equipes`, corpo({ corretoraId: CORR2 }))).status).toBe(403)
    expect((await call('PATCH', `${P}/rede/equipes/${EQ2}`, { nome: 'Invasora' })).status).toBe(403)
    expect((await call('DELETE', `${P}/rede/equipes/${EQ2}`)).status).toBe(403)

    for (const user of ['u-sup1', 'u-ven1', 'u-bal1']) {
      state.session = agentePlatform(user)
      const resposta = await call('POST', `${P}/rede/equipes`, corpo())
      expect(resposta.status).toBe(403)
      expect(resposta.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
    }
  })

  it('supervisor precisa ter papel supervisor, estar ativo e ser da mesma corretora', async () => {
    state.session = staff()
    expect((await call('POST', `${P}/rede/equipes`, corpo({ supervisorAgenteId: VEN1 }))).status).toBe(422)
    expect((await call('POST', `${P}/rede/equipes`, corpo({ supervisorAgenteId: SUP2 }))).status).toBe(422)
    await call('POST', `${P}/rede/agentes/${SUP1}/desativar`)
    expect((await call('POST', `${P}/rede/equipes`, corpo({ supervisorAgenteId: SUP1 }))).status).toBe(422)
    expect((await call('PATCH', `${P}/rede/equipes/${EQ1}`, { supervisorAgenteId: SUP2 })).status).toBe(422)
  })

  it('vínculo: unidade de outra corretora = 422; sem corretora e sem unidade = 422; corretora derivada da unidade', async () => {
    state.session = staff()
    expect((await call('POST', `${P}/rede/equipes`, corpo({ unidadeId: UN2 }))).status).toBe(422)
    expect((await call('POST', `${P}/rede/equipes`, { nome: 'Sem vínculo' })).status).toBe(422)
    const derivada = await call('POST', `${P}/rede/equipes`, { nome: 'Pela unidade', unidadeId: UN2 })
    expect(derivada.status).toBe(201)
    expect(derivada.body.data.corretoraId).toBe(CORR2)
    const propria = await call('POST', `${P}/rede/equipes`, { nome: 'Da clínica', unidadeId: UNP })
    expect(propria.status).toBe(201)
    expect(propria.body.data.corretoraId).toBeNull()
  })

  it('trocar a corretora com agentes dentro = 422; trocar a unidade leva os agentes junto; DELETE inativa se houver agentes', async () => {
    state.session = staff()
    expect((await call('PATCH', `${P}/rede/equipes/${EQ1}`, { corretoraId: CORR3 })).status).toBe(422)
    const nova = await call('POST', `${P}/rede/unidades`, { corretoraId: CORR1, nome: 'Outra unidade' })
    expect((await call('PATCH', `${P}/rede/equipes/${EQ1}`, { unidadeId: nova.body.data.id })).status).toBe(200)
    expect(agentes().find(a => a.id === VEN1)?.unidadeId).toBe(nova.body.data.id)
    expect((await call('DELETE', `${P}/rede/equipes/${EQ1}`)).body.data.resultado).toBe('inativada')
  })

  it('isolamento entre inquilinos', async () => {
    state.session = tenantSession('admin-a', 'admin', CLUB_A)
    expect((await call('POST', `${TA}/rede/equipes`, { nome: 'Cruzada', corretoraId: CORRB })).status).toBe(404)
    expect((await call('PATCH', `${TA}/rede/equipes/${EQ1}`, { nome: 'Cruzada' })).status).toBe(404)
    expect((await call('GET', `${TA}/rede/equipes`)).body.data).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Agentes: matriz de criação
// ---------------------------------------------------------------------------

describe('agentes: quem cria quem', () => {
  const criar = (extra: Record<string, unknown>) => call('POST', `${P}/rede/agentes`, cadastro(extra))

  it('master cria qualquer papel e vínculo (gerente liga a corretora)', async () => {
    state.session = staff()
    const gerente = await criar({ papel: 'gerente', corretoraId: CORR3 })
    expect(gerente.status).toBe(201)
    expect(corretoras().find(c => c.id === CORR3)?.gerenteAgenteId).toBe(gerente.body.data.agente.id)
    expect((await criar({ papel: 'supervisor', corretoraId: CORR1 })).status).toBe(201)
    expect((await criar({ papel: 'vendedor', equipeId: EQ2 })).status).toBe(201)
    expect((await criar({ papel: 'vendedor' })).status).toBe(201)
    expect((await criar({ papel: 'balcao', unidadeId: UNP })).status).toBe(201)
    expect((await criar({ papel: 'master' })).status).toBe(201)
    expect(auditou('vendas.agente_created')).toHaveLength(6)
    expect(usuarios().filter(x => String(x.id).startsWith('novo-'))).toHaveLength(6)
  })

  it('gerente: supervisor, vendedor e balcão da PRÓPRIA corretora; nada além disso', async () => {
    state.session = agentePlatform('u-ger1')
    expect((await criar({ papel: 'supervisor', corretoraId: CORR1 })).status).toBe(201)
    expect((await criar({ papel: 'vendedor', equipeId: EQ1 })).status).toBe(201)
    expect((await criar({ papel: 'balcao', unidadeId: UN1 })).status).toBe(201)

    for (const extra of [
      { papel: 'vendedor', corretoraId: CORR2 },
      { papel: 'vendedor', equipeId: EQ2 },
      { papel: 'balcao', unidadeId: UN2 },
      { papel: 'vendedor' },
      { papel: 'gerente', corretoraId: CORR1 },
      { papel: 'master' },
    ]) {
      const resposta = await criar(extra)
      expect(resposta.status, JSON.stringify(extra)).toBe(403)
      expect(resposta.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
    }
  })

  it('supervisor: só vendedor, só nas suas equipes', async () => {
    state.session = agentePlatform('u-sup1')
    const criado = await criar({ papel: 'vendedor', equipeId: EQ1 })
    expect(criado.status).toBe(201)
    expect(criado.body.data.agente).toMatchObject({ papel: 'vendedor', equipeId: EQ1, corretoraId: CORR1, unidadeId: UN1 })

    for (const extra of [
      { papel: 'vendedor', equipeId: EQ2 },
      { papel: 'vendedor' },
      { papel: 'vendedor', corretoraId: CORR1 },
      { papel: 'supervisor', corretoraId: CORR1 },
      { papel: 'balcao', unidadeId: UN1 },
    ]) {
      const resposta = await criar(extra)
      expect(resposta.status, JSON.stringify(extra)).toBe(403)
      expect(resposta.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
    }
  })

  it('vendedor e balcão não cadastram ninguém', async () => {
    for (const user of ['u-ven1', 'u-bal1']) {
      state.session = agentePlatform(user)
      for (const [method, path, body] of [
        ['POST', `${P}/rede/agentes`, cadastro({ papel: 'vendedor', equipeId: EQ1 })],
        ['PATCH', `${P}/rede/agentes/${VEN1}`, { nome: 'Outro Nome' }],
        ['POST', `${P}/rede/agentes/${VEN1}/desativar`, undefined],
        ['POST', `${P}/rede/agentes/${VEN1}/reenviar-convite`, undefined],
      ] as const) {
        const resposta = await call(method, path, body)
        expect(resposta.status).toBe(403)
        expect(resposta.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
      }
    }
    expect(fakes.platformCreate).not.toHaveBeenCalled()
  })

  it('consistência de vínculo: equipe implica corretora/unidade; conflito = 422; balcão exige unidade; master sem vínculo', async () => {
    state.session = staff()
    const pelaEquipe = await criar({ papel: 'vendedor', equipeId: EQ1 })
    expect(pelaEquipe.body.data.agente).toMatchObject({ corretoraId: CORR1, unidadeId: UN1, equipeId: EQ1 })

    expect((await criar({ papel: 'vendedor', equipeId: EQ1, corretoraId: CORR2 })).status).toBe(422)
    expect((await criar({ papel: 'vendedor', equipeId: EQ1, unidadeId: UN2 })).status).toBe(422)
    expect((await criar({ papel: 'vendedor', unidadeId: UN1, corretoraId: CORR2 })).status).toBe(422)
    expect((await criar({ papel: 'vendedor', unidadeId: UNP, corretoraId: CORR1 })).status).toBe(422)
    expect((await criar({ papel: 'balcao', corretoraId: CORR1 })).status).toBe(422)
    expect((await criar({ papel: 'master', corretoraId: CORR1 })).status).toBe(422)
    expect((await criar({ papel: 'gerente' })).status).toBe(422)
    expect((await criar({ papel: 'gerente', equipeId: EQ1 })).status).toBe(422)

    const unidadeDeCorretora = await criar({ papel: 'balcao', unidadeId: UN2 })
    expect(unidadeDeCorretora.body.data.agente).toMatchObject({ corretoraId: CORR2, unidadeId: UN2 })

    // Nada vazou para o banco nos casos recusados.
    expect(fakes.platformCreate).toHaveBeenCalledTimes(2)
  })

  it('gerente na corretora que já tem gerente = 409', async () => {
    state.session = staff()
    const resposta = await criar({ papel: 'gerente', corretoraId: CORR1 })
    expect(resposta.status).toBe(409)
    expect(corretoras().find(c => c.id === CORR1)?.gerenteAgenteId).toBe(GER1)
  })

  it('código de indicação único: colisão sorteada gera outro código', async () => {
    const existente = agentes().find(a => a.id === VEN1)!
    existente.codigoIndicacao = 'AAAAAAA'
    const sorteio = vi.spyOn(Math, 'random')
    for (let i = 0; i < 7; i++) sorteio.mockReturnValueOnce(0)
    try {
      state.session = staff()
      const criado = await criar({ papel: 'vendedor' })
      expect(criado.status).toBe(201)
      expect(criado.body.data.agente.codigoIndicacao).not.toBe('AAAAAAA')
      expect(criado.body.data.agente.codigoIndicacao).toMatch(/^[A-HJ-NP-Z2-9]{7}$/)
    } finally {
      sorteio.mockRestore()
    }
    const codigos = agentes().map(a => a.codigoIndicacao)
    expect(new Set(codigos).size).toBe(codigos.length)
  })

  it('platform: o vendedor ANNETEC já existente é reaproveitado (sem nova conta); conta alheia = 409', async () => {
    mem().insertRow(schema.user, { id: 'u-antigo', name: 'Antigo', email: 'antigo@exemplo.test', role: 'platform_seller' })
    state.session = staff()
    const resposta = await criar({ papel: 'vendedor', email: 'antigo@exemplo.test' })
    expect(resposta.status).toBe(201)
    expect(resposta.body.data.agente.userId).toBe('u-antigo')
    expect(fakes.platformCreate).not.toHaveBeenCalled()
  })

  it('sem convite quando enviarConvite = false', async () => {
    state.session = staff()
    const resposta = await criar({ papel: 'vendedor', enviarConvite: false })
    expect(resposta.body.data.convite).toMatchObject({ enviado: false, status: 'nao_enviado' })
    expect(fakes.sendEmail).not.toHaveBeenCalled()
  })

  it('validação do corpo = 400 (CPF inválido, e-mail ausente)', async () => {
    state.session = staff()
    expect((await criar({ papel: 'vendedor', cpf: '11111111111' })).status).toBe(400)
    expect((await call('POST', `${P}/rede/agentes`, { ...cadastro({ papel: 'vendedor' }), email: undefined })).status).toBe(400)
  })
})

describe('agentes: escopo tenant', () => {
  it('admin do clube cria vendedor como seller do clube (member), preso ao inquilino', async () => {
    state.session = tenantSession('admin-a', 'admin', CLUB_A)
    const resposta = await call('POST', `${TA}/rede/agentes`, cadastro({ papel: 'vendedor' }))
    expect(resposta.status).toBe(201)
    expect(fakes.tenantCreate).toHaveBeenCalledWith(CLUB_A.id, expect.objectContaining({ role: 'seller', active: true }))
    expect(resposta.body.data.agente).toMatchObject({ scope: 'tenant', tenantId: CLUB_A.id, papel: 'vendedor' })
    expect(fakes.sendStaffInvite).toHaveBeenCalledWith(expect.objectContaining({ tenantId: CLUB_A.id, role: 'seller', password: 'SenhaProvisoria123' }))
    expect(fakes.sendEmail).not.toHaveBeenCalled()
    expect(JSON.stringify(fakes.audits)).not.toContain('SenhaProvisoria123')
    expect(resposta.text).not.toContain('SenhaProvisoria123')
  })

  it('e-mail já existente no clube: seller inativo é reativado; admin do clube = 409; conta nova de outro papel segue o fluxo do clube', async () => {
    mem().insertRow(schema.user, { id: 'u-removido', name: 'Removido', email: 'removido@exemplo.test', role: 'user' })
    mem().insertRow(schema.member, { id: 'm-removido', organizationId: CLUB_A.id, userId: 'u-removido', role: 'seller', accessStatus: 'removed' })
    mem().insertRow(schema.user, { id: 'u-adm', name: 'Admin', email: 'adm@exemplo.test', role: 'user' })
    mem().insertRow(schema.member, { id: 'm-adm', organizationId: CLUB_A.id, userId: 'u-adm', role: 'admin', accessStatus: 'active' })
    state.session = tenantSession('admin-a', 'admin', CLUB_A)

    const reativado = await call('POST', `${TA}/rede/agentes`, cadastro({ papel: 'vendedor', email: 'removido@exemplo.test' }))
    expect(reativado.status).toBe(201)
    expect(reativado.body.data.convite.contaNova).toBe(false)
    expect((mem().rows(schema.member) as Record<string, any>[]).find(m => m.id === 'm-removido')?.accessStatus).toBe('active')
    expect(fakes.tenantCreate).not.toHaveBeenCalled()

    const admin = await call('POST', `${TA}/rede/agentes`, cadastro({ papel: 'vendedor', email: 'adm@exemplo.test' }))
    expect(admin.status).toBe(409)
  })

  it('o mesmo e-mail pode ser agente do clube e da plataforma (escopos separados é por conta diferente); isolamento A x B', async () => {
    state.session = tenantSession('admin-a', 'admin', CLUB_A)
    // Corretora/equipe de outro inquilino ou da plataforma = 404.
    expect((await call('POST', `${TA}/rede/agentes`, cadastro({ papel: 'gerente', corretoraId: CORRB }))).status).toBe(404)
    expect((await call('POST', `${TA}/rede/agentes`, cadastro({ papel: 'vendedor', equipeId: EQ1 }))).status).toBe(404)
    // Agentes de outros escopos não aparecem nem abrem.
    const lista = await call('GET', `${TA}/rede/agentes`)
    expect(lista.body.data.map((a: { id: string }) => a.id).sort()).toEqual([GERA, VENA].sort())
    expect((await call('GET', `${TA}/rede/agentes/${VEN1}`)).status).toBe(404)
    expect((await call('PATCH', `${TA}/rede/agentes/${VEN1}`, { nome: 'Invasor' })).status).toBe(404)
    expect((await call('POST', `${TA}/rede/agentes/${VEN1}/desativar`)).status).toBe(404)

    state.session = tenantSession('admin-b', 'admin', CLUB_B)
    expect((await call('GET', `${TB}/rede/agentes`)).body.data).toEqual([])
    expect((await call('GET', `${TB}/rede/agentes/${VENA}`)).status).toBe(404)

    state.session = staff()
    expect((await call('GET', `${P}/rede/agentes/${VENA}`)).status).toBe(404)
  })

  it('gerente do clube cria só na sua corretora; seller solo não cria', async () => {
    state.session = tenantSession('u-gera', 'seller', CLUB_A)
    expect((await call('POST', `${TA}/rede/agentes`, cadastro({ papel: 'vendedor', corretoraId: CORRA }))).status).toBe(201)
    expect((await call('POST', `${TA}/rede/agentes`, cadastro({ papel: 'vendedor' }))).status).toBe(403)

    state.session = tenantSession('u-vena', 'seller', CLUB_A)
    const resposta = await call('POST', `${TA}/rede/agentes`, cadastro({ papel: 'vendedor' }))
    expect(resposta.status).toBe(403)
    expect(resposta.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
  })
})

// ---------------------------------------------------------------------------
// Agentes: leitura
// ---------------------------------------------------------------------------

describe('agentes: listagem e leitura por papel', () => {
  const ids = async (path: string) => ((await call('GET', path)).body.data as { id: string }[]).map(a => a.id).sort()

  it('master vê o escopo todo; gerente a corretora; supervisor a equipe + ele; vendedor e balcão só eles', async () => {
    state.session = staff()
    expect(await ids(`${P}/rede/agentes?perPage=100`)).toHaveLength(9)

    state.session = agentePlatform('u-ger1')
    expect(await ids(`${P}/rede/agentes`)).toEqual([GER1, SUP1, VEN1, BAL1].sort())

    state.session = agentePlatform('u-sup1')
    expect(await ids(`${P}/rede/agentes`)).toEqual([SUP1, VEN1].sort())

    state.session = agentePlatform('u-ven1')
    expect(await ids(`${P}/rede/agentes`)).toEqual([VEN1])

    state.session = agentePlatform('u-bal1')
    expect(await ids(`${P}/rede/agentes`)).toEqual([BAL1])
  })

  it('filtros: papel, corretora, unidade, equipe, ativo, busca e paginação', async () => {
    state.session = staff()
    expect(await ids(`${P}/rede/agentes?papel=gerente`)).toEqual([GER1, GER2].sort())
    expect(await ids(`${P}/rede/agentes?corretoraId=${CORR2}`)).toEqual([GER2, SUP2, VEN2].sort())
    expect(await ids(`${P}/rede/agentes?unidadeId=${UNP}`)).toEqual([BALP])
    expect(await ids(`${P}/rede/agentes?equipeId=${EQ1}`)).toEqual([VEN1])
    expect(await ids(`${P}/rede/agentes?q=solo`)).toEqual([SOLO])
    expect(await ids(`${P}/rede/agentes?q=${encodeURIComponent('balcão')}`)).toEqual([BAL1, BALP].sort())
    await call('POST', `${P}/rede/agentes/${VEN1}/desativar`)
    expect(await ids(`${P}/rede/agentes?ativo=false`)).toEqual([VEN1])
    const pagina = await call('GET', `${P}/rede/agentes?perPage=4&page=3`)
    expect(pagina.body.data).toHaveLength(1)
    expect(pagina.body.meta).toMatchObject({ total: 9, totalPages: 3, page: 3 })
  })

  it('GET /rede/agentes/:id fora da visibilidade = 404; dentro, devolve o cadastro com e-mail', async () => {
    state.session = agentePlatform('u-ger1')
    expect((await call('GET', `${P}/rede/agentes/${VEN2}`)).status).toBe(404)
    const dentro = await call('GET', `${P}/rede/agentes/${VEN1}`)
    expect(dentro.status).toBe(200)
    expect(dentro.body.data).toMatchObject({ id: VEN1, email: 'u-ven1@x.test', papel: 'vendedor' })
    state.session = agentePlatform('u-ven1')
    expect((await call('GET', `${P}/rede/agentes/${SUP1}`)).status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Agentes: alteração
// ---------------------------------------------------------------------------

describe('agentes: PATCH', () => {
  it('master muda papel e vínculo; o vínculo novo precisa ser consistente', async () => {
    state.session = staff()
    const movido = await call('PATCH', `${P}/rede/agentes/${VEN1}`, { equipeId: EQ2 })
    expect(movido.status).toBe(200)
    expect(movido.body.data).toMatchObject({ equipeId: EQ2, corretoraId: CORR2, unidadeId: UN2, papel: 'vendedor' })

    const solo = await call('PATCH', `${P}/rede/agentes/${VEN1}`, { equipeId: null, corretoraId: null, unidadeId: null })
    expect(solo.body.data).toMatchObject({ equipeId: null, corretoraId: null, unidadeId: null })

    expect((await call('PATCH', `${P}/rede/agentes/${VEN1}`, { papel: 'balcao' })).status).toBe(422)
    expect((await call('PATCH', `${P}/rede/agentes/${VEN1}`, { papel: 'balcao', unidadeId: UN1 })).status).toBe(200)
    expect((await call('PATCH', `${P}/rede/agentes/${VEN1}`, { papel: 'master' })).status).toBe(422)
    expect(auditou('vendas.agente_updated')).toHaveLength(3)
  })

  it('mudar o vínculo não altera comissões já geradas (snapshot)', async () => {
    mem().insertRow(schema.vendasComissoes, {
      id: u(900),
      scope: 'platform',
      tenantId: null,
      beneficiarioAgenteId: VEN1,
      parte: 'vendedor',
      tipo: 'mensalidade',
      cobrancaOrigem: 'platform',
      cobrancaRef: 'c1',
      base: '100.00',
      percentual: '100.00',
      valor: '100.00',
      status: 'a_pagar',
      mesReferencia: '2026-11',
    })
    const antes = JSON.stringify(mem().rows(schema.vendasComissoes))
    state.session = staff()
    expect((await call('PATCH', `${P}/rede/agentes/${VEN1}`, { equipeId: EQ2 })).status).toBe(200)
    expect(JSON.stringify(mem().rows(schema.vendasComissoes))).toBe(antes)
  })

  it('gerente: move dentro da corretora; não promove a gerente nem leva para outra corretora; não mexe em agente alheio', async () => {
    state.session = agentePlatform('u-ger1')
    expect((await call('PATCH', `${P}/rede/agentes/${VEN1}`, { papel: 'supervisor', equipeId: null, unidadeId: null })).status).toBe(200)
    expect((await call('PATCH', `${P}/rede/agentes/${SUP1}`, { papel: 'gerente' })).status).toBe(403)
    expect((await call('PATCH', `${P}/rede/agentes/${SUP1}`, { papel: 'master', corretoraId: null })).status).toBe(403)
    expect((await call('PATCH', `${P}/rede/agentes/${SUP1}`, { corretoraId: CORR2 })).status).toBe(403)
    expect((await call('PATCH', `${P}/rede/agentes/${BAL1}`, { equipeId: EQ2 })).status).toBe(403)
    expect((await call('PATCH', `${P}/rede/agentes/${VEN2}`, { nome: 'Alheio' })).status).toBe(404)
  })

  it('supervisor: edita vendedor da equipe e o move entre as suas; não muda papel nem sai da equipe dele', async () => {
    state.session = agentePlatform('u-sup1')
    expect((await call('PATCH', `${P}/rede/agentes/${VEN1}`, { nome: 'Vendedor Renomeado', metaMensal: 8 })).body.data.nome).toBe('Vendedor Renomeado')
    expect((await call('PATCH', `${P}/rede/agentes/${VEN1}`, { papel: 'supervisor' })).status).toBe(403)
    expect((await call('PATCH', `${P}/rede/agentes/${VEN1}`, { equipeId: EQ2 })).status).toBe(403)
    expect((await call('PATCH', `${P}/rede/agentes/${VEN1}`, { equipeId: null, corretoraId: null, unidadeId: null })).status).toBe(403)
    expect((await call('PATCH', `${P}/rede/agentes/${SUP1}`, { papel: 'vendedor' })).status).toBe(403)
  })

  it('o próprio agente não troca o seu papel/vínculo, mas edita o cadastro', async () => {
    state.session = agentePlatform('u-ger1')
    expect((await call('PATCH', `${P}/rede/agentes/${GER1}`, { telefone: '11999998888' })).status).toBe(200)
    expect((await call('PATCH', `${P}/rede/agentes/${GER1}`, { papel: 'vendedor' })).status).toBe(403)
  })

  it('supervisor com equipe sob sua responsabilidade não troca de papel; gerente que sai da corretora solta o ponteiro', async () => {
    state.session = staff()
    const supervisor = await call('PATCH', `${P}/rede/agentes/${SUP1}`, { papel: 'vendedor' })
    expect(supervisor.status).toBe(422)

    const movido = await call('PATCH', `${P}/rede/agentes/${GER2}`, { papel: 'supervisor' })
    expect(movido.status).toBe(200)
    expect(corretoras().find(c => c.id === CORR2)?.gerenteAgenteId).toBeNull()

    const novo = await call('PATCH', `${P}/rede/agentes/${SOLO}`, { papel: 'gerente', corretoraId: CORR2 })
    expect(novo.status).toBe(200)
    expect(corretoras().find(c => c.id === CORR2)?.gerenteAgenteId).toBe(SOLO)
    expect((await call('PATCH', `${P}/rede/agentes/${BALP}`, { papel: 'gerente', corretoraId: CORR2, unidadeId: null })).status).toBe(409)
  })
})

// ---------------------------------------------------------------------------
// Ativar, desativar e convite
// ---------------------------------------------------------------------------

describe('ativar, desativar e reenviar convite', () => {
  it('desativar põe só ativo=false: o agente continua lendo, não escreve, e a conta não é bloqueada', async () => {
    state.session = staff()
    const desativado = await call('POST', `${P}/rede/agentes/${VEN1}/desativar`)
    expect(desativado.status).toBe(200)
    expect(desativado.body.data.ativo).toBe(false)
    expect(usuarios().find(x => x.id === 'u-ven1')?.banned ?? false).toBe(false)
    expect(auditou('vendas.agente_deactivated')).toHaveLength(1)

    state.session = agentePlatform('u-ven1')
    expect((await call('GET', `${P}/eu`)).body.data.podeEscrever).toBe(false)
    const escrita = await call('POST', `${P}/presenca`)
    expect(escrita.status).toBe(403)
    expect(escrita.body.error.code).toBe('VENDAS_PERFIL_INATIVO')

    state.session = staff()
    const ativado = await call('POST', `${P}/rede/agentes/${VEN1}/ativar`)
    expect(ativado.body.data.ativo).toBe(true)
    state.session = agentePlatform('u-ven1')
    expect((await call('GET', `${P}/eu`)).body.data.podeEscrever).toBe(true)
    expect(auditou('vendas.agente_activated')).toHaveLength(1)
  })

  it('gerente desativado também só lê (não cadastra mais ninguém)', async () => {
    state.session = staff()
    await call('POST', `${P}/rede/agentes/${GER1}/desativar`)
    state.session = agentePlatform('u-ger1')
    expect((await call('GET', `${P}/rede/agentes`)).status).toBe(200)
    const escrita = await call('POST', `${P}/rede/agentes`, cadastro({ papel: 'vendedor', equipeId: EQ1 }))
    expect(escrita.status).toBe(403)
    expect(escrita.body.error.code).toBe('VENDAS_PERFIL_INATIVO')
  })

  it('gerente só desativa quem é da sua corretora; supervisor só vendedor da equipe; ninguém desativa a si mesmo', async () => {
    state.session = agentePlatform('u-ger1')
    expect((await call('POST', `${P}/rede/agentes/${BAL1}/desativar`)).status).toBe(200)
    expect((await call('POST', `${P}/rede/agentes/${VEN2}/desativar`)).status).toBe(404)
    expect((await call('POST', `${P}/rede/agentes/${GER1}/desativar`)).status).toBe(422)

    state.session = agentePlatform('u-sup1')
    expect((await call('POST', `${P}/rede/agentes/${VEN1}/desativar`)).status).toBe(200)
    expect((await call('POST', `${P}/rede/agentes/${SUP1}/desativar`)).status).toBe(422)
  })

  it('reenviar convite (platform): nova senha provisória por e-mail, sem expor a senha', async () => {
    state.session = staff()
    const resposta = await call('POST', `${P}/rede/agentes/${VEN1}/reenviar-convite`)
    expect(resposta.status).toBe(200)
    expect(resposta.body.data).toMatchObject({ enviado: true, status: 'simulated' })
    const envio = fakes.sendEmail.mock.calls[0]![0] as { template: string; to: { email: string }; secrets: string[] }
    expect(envio.template).toBe('club_staff_password_reset')
    expect(envio.to.email).toBe('u-ven1@x.test')
    expect(envio.secrets).toHaveLength(1)
    expect(resposta.text).not.toContain(envio.secrets[0])
    expect((mem().rows(schema.account) as Record<string, any>[]).find(a => a.userId === 'u-ven1')?.password).toBeTruthy()
    expect(auditou('vendas.agente_invite_resent')).toHaveLength(1)

    state.session = agentePlatform('u-ger1')
    expect((await call('POST', `${P}/rede/agentes/${VEN1}/reenviar-convite`)).status).toBe(200)
    expect((await call('POST', `${P}/rede/agentes/${VEN2}/reenviar-convite`)).status).toBe(404)
  })

  it('reenviar convite (tenant): usa a redefinição de senha do clube; conta compartilhada recebe só o lembrete', async () => {
    state.session = tenantSession('admin-a', 'admin', CLUB_A)
    const resposta = await call('POST', `${TA}/rede/agentes/${VENA}/reenviar-convite`)
    expect(resposta.status).toBe(200)
    expect(fakes.resetTenantUserPassword).toHaveBeenCalledWith(CLUB_A.id, 'u-vena', 'admin-a')

    const { AppError } = await import('@/http/errors')
    fakes.resetTenantUserPassword.mockRejectedValueOnce(AppError.forbidden('conta compartilhada'))
    const lembrete = await call('POST', `${TA}/rede/agentes/${VENA}/reenviar-convite`)
    expect(lembrete.status).toBe(200)
    expect(fakes.sendStaffInvite).toHaveBeenCalledWith(expect.objectContaining({ tenantId: CLUB_A.id, userId: 'u-vena', password: null }))
  })
})

// ---------------------------------------------------------------------------
// Desempenho
// ---------------------------------------------------------------------------

describe('desempenho do agente', () => {
  const dias = (d: number) => new Date(Date.now() - d * 86_400_000)

  function seedDesempenho() {
    const lead = (id: number, extra: Record<string, unknown>) =>
      mem().insertRow(schema.vendasLeads, { id: u(id), scope: 'platform', tenantId: null, nome: `Lead ${id}`, agenteId: VEN1, ...extra })
    lead(701, { etapa: 'ganho', createdAt: dias(10), ganhoEm: dias(5), valorEstimado: '1000.00' })
    lead(702, { etapa: 'proposta', createdAt: dias(3) })
    lead(703, { etapa: 'novo', createdAt: dias(100) })
    lead(704, { etapa: 'novo', createdAt: dias(2), agenteId: VEN2 })
    const evento = (tipo: string, em: Date, porAgenteId = VEN1) =>
      mem().insertRow(schema.vendasLeadEventos, { leadId: u(701), tipo, em, porAgenteId })
    evento('ligacao', dias(4))
    evento('whatsapp', dias(1))
    evento('nota', dias(1))
    evento('reuniao', dias(60))
    evento('ligacao', dias(1), VEN2)
    const comissao = (id: number, status: string, valor: string, createdAt: Date) =>
      mem().insertRow(schema.vendasComissoes, {
        id: u(id), scope: 'platform', tenantId: null, beneficiarioAgenteId: VEN1, parte: 'vendedor', tipo: 'mensalidade',
        cobrancaOrigem: 'platform', cobrancaRef: `c${id}`, base: valor, percentual: '100.00', valor, status, mesReferencia: '2026-11', createdAt,
      })
    comissao(801, 'prevista', '10.50', dias(2))
    comissao(802, 'a_pagar', '20.00', dias(2))
    comissao(803, 'paga', '5.00', dias(60))
  }

  it('KPIs do período (30d) lendo leads, eventos e comissões', async () => {
    seedDesempenho()
    state.session = staff()
    const resposta = await call('GET', `${P}/rede/agentes/${VEN1}/desempenho`)
    expect(resposta.status).toBe(200)
    expect(resposta.body.data.kpis).toEqual({
      leadsRecebidos: 2,
      contatos: 2,
      propostas: 2,
      ganhos: 1,
      taxaConversao: 50,
      valorGanho: 1000,
      comissaoPrevista: 10.5,
      comissaoAPagar: 20,
      comissaoPaga: 0,
    })
    const trimestre = await call('GET', `${P}/rede/agentes/${VEN1}/desempenho?periodo=trimestre`)
    expect(trimestre.body.data.kpis).toMatchObject({ leadsRecebidos: 2, contatos: 3, comissaoPaga: 5 })
  })

  it('só de agente visível: gerente da corretora vê; de outra corretora = 404; supervisor vê o da equipe; vendedor, só o seu', async () => {
    seedDesempenho()
    state.session = agentePlatform('u-ger1')
    expect((await call('GET', `${P}/rede/agentes/${VEN1}/desempenho`)).status).toBe(200)
    expect((await call('GET', `${P}/rede/agentes/${VEN2}/desempenho`)).status).toBe(404)
    state.session = agentePlatform('u-sup1')
    expect((await call('GET', `${P}/rede/agentes/${VEN1}/desempenho`)).status).toBe(200)
    state.session = agentePlatform('u-ven1')
    expect((await call('GET', `${P}/rede/agentes/${VEN1}/desempenho`)).status).toBe(200)
    expect((await call('GET', `${P}/rede/agentes/${SUP1}/desempenho`)).status).toBe(404)
  })

  it('periodo inválido = 400', async () => {
    state.session = staff()
    expect((await call('GET', `${P}/rede/agentes/${VEN1}/desempenho?periodo=ano`)).status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Árvore
// ---------------------------------------------------------------------------

describe('árvore da rede', () => {
  const nomes = (lista: { id: string }[]) => lista.map(item => item.id).sort()

  it('master vê tudo: corretoras → unidades → equipes → agentes, unidades próprias e solos', async () => {
    state.session = staff()
    const { status, body } = await call('GET', `${P}/rede/arvore`)
    expect(status).toBe(200)
    const arvore = body.data
    expect(nomes(arvore.corretoras)).toEqual([CORR1, CORR2, CORR3].sort())

    const c1 = arvore.corretoras.find((c: { id: string }) => c.id === CORR1)
    expect(c1.gerente).toMatchObject({ id: GER1, papel: 'gerente', online: false, ativo: true })
    expect(nomes(c1.unidades)).toEqual([UN1])
    const un1 = c1.unidades[0]
    expect(nomes(un1.agentes)).toEqual([BAL1])
    expect(nomes(un1.equipes)).toEqual([EQ1])
    // O supervisor aparece dentro da equipe que supervisiona.
    expect(un1.equipes[0].agentes.map((a: { id: string }) => a.id)).toEqual([SUP1, VEN1])
    expect(c1.equipes).toEqual([])
    expect(c1.agentes).toEqual([])

    expect(nomes(arvore.unidadesProprias)).toEqual([UNP])
    expect(nomes(arvore.unidadesProprias[0].agentes)).toEqual([BALP])
    expect(nomes(arvore.solos)).toEqual([SOLO])
    expect(arvore.corretoras.find((c: { id: string }) => c.id === CORR3).gerente).toBeNull()
  })

  it('online sai da presença dentro da janela configurada', async () => {
    agentes().find(a => a.id === VEN1)!.ultimaPresencaEm = new Date()
    agentes().find(a => a.id === BAL1)!.ultimaPresencaEm = new Date(Date.now() - 60 * 60_000)
    state.session = staff()
    const arvore = (await call('GET', `${P}/rede/arvore`)).body.data
    const un1 = arvore.corretoras.find((c: { id: string }) => c.id === CORR1).unidades[0]
    expect(un1.equipes[0].agentes.find((a: { id: string }) => a.id === VEN1).online).toBe(true)
    expect(un1.agentes.find((a: { id: string }) => a.id === BAL1).online).toBe(false)
  })

  it('gerente só enxerga a própria corretora', async () => {
    state.session = agentePlatform('u-ger1')
    const arvore = (await call('GET', `${P}/rede/arvore`)).body.data
    expect(nomes(arvore.corretoras)).toEqual([CORR1])
    expect(arvore.unidadesProprias).toEqual([])
    expect(arvore.solos).toEqual([])
    expect(arvore.corretoras[0].gerente.id).toBe(GER1)
    expect(JSON.stringify(arvore)).not.toContain(VEN2)
  })

  it('supervisor vê a sua equipe (sem o gerente nem o balcão); vendedor, só o ramo onde está', async () => {
    state.session = agentePlatform('u-sup1')
    const doSupervisor = (await call('GET', `${P}/rede/arvore`)).body.data
    expect(nomes(doSupervisor.corretoras)).toEqual([CORR1])
    expect(doSupervisor.corretoras[0].gerente).toBeNull()
    const equipe = doSupervisor.corretoras[0].unidades[0].equipes[0]
    expect(equipe.agentes.map((a: { id: string }) => a.id)).toEqual([SUP1, VEN1])
    expect(doSupervisor.corretoras[0].unidades[0].agentes).toEqual([])

    state.session = agentePlatform('u-ven1')
    const doVendedor = (await call('GET', `${P}/rede/arvore`)).body.data
    expect(doVendedor.corretoras[0].unidades[0].equipes[0].agentes.map((a: { id: string }) => a.id)).toEqual([VEN1])

    state.session = agentePlatform('u-solo')
    const solo = (await call('GET', `${P}/rede/arvore`)).body.data
    expect(solo.corretoras).toEqual([])
    expect(nomes(solo.solos)).toEqual([SOLO])
  })

  it('tenant: árvore só do clube (nada da plataforma nem de outro clube)', async () => {
    state.session = tenantSession('admin-a', 'admin', CLUB_A)
    const arvore = (await call('GET', `${TA}/rede/arvore`)).body.data
    expect(nomes(arvore.corretoras)).toEqual([CORRA])
    expect(arvore.corretoras[0].gerente.id).toBe(GERA)
    expect(nomes(arvore.solos)).toEqual([VENA])
    expect(JSON.stringify(arvore)).not.toContain(CORRB)
    expect(JSON.stringify(arvore)).not.toContain(CORR1)
  })
})
