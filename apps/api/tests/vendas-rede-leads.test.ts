import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENTES, CLUBE_A, CLUBE_B, ID, horasAtras, semearConfig, semearLead, semearRede, uid } from './helpers/vendas-world'

/**
 * Leads da Rede Comercial pela HTTP (app inteiro, guards reais, sessão falsa por token,
 * banco em memória): funil por visibilidade, claim atômico, balcão fora do funil, isolamento
 * entre escopos/clubes, transições, eventos de contato, retorno ao pool, reatribuição por
 * papel, mensagem pronta e carteira.
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

function platformSession(userId: string, platformRole: 'superadmin' | 'platform_seller') {
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
  return { status: response.status, body: parsed as Record<string, any> }
}

const P = '/api/v1/vendas'
const T = (slug: string) => `/api/v1/t/${slug}/vendas`

const L = {
  v1: uid(1001),
  v1Pool48: uid(1002),
  v2: uid(1003),
  v3: uid(1004),
  pool: uid(1005),
  solo: uid(1006),
  clubeA: uid(1007),
  clubeB: uid(1008),
  contato: uid(1009),
  v1Recente: uid(1010),
}
const PLANO_PLATFORM = uid(2001)

beforeEach(() => {
  mem().reset()
  state.sessions = {
    staff: platformSession('staff', 'superadmin'),
    'admin-a': tenantSession('admin-a', CLUBE_A, 'admin'),
    'admin-b': tenantSession('admin-b', CLUBE_B, 'admin'),
  }
  for (const agente of AGENTES) {
    state.sessions[agente.userId] =
      agente.scope === 'tenant'
        ? tenantSession(agente.userId, agente.tenantId === CLUBE_A.id ? CLUBE_A : CLUBE_B, 'seller')
        : platformSession(agente.userId, 'platform_seller')
  }
  semearRede(mem(), schema)
  semearConfig(mem(), schema, { scope: 'platform', tenantId: null })
  semearConfig(mem(), schema, { scope: 'tenant', tenantId: CLUBE_A.id })
  semearConfig(mem(), schema, { scope: 'tenant', tenantId: CLUBE_B.id })
  semearLead(mem(), schema, { id: L.v1, nome: 'Lead do V1', agenteId: ID.vendedor1 })
  semearLead(mem(), schema, { id: L.v2, nome: 'Lead do V2', agenteId: ID.vendedor2 })
  semearLead(mem(), schema, { id: L.v3, nome: 'Lead do V3', agenteId: ID.vendedor3 })
  semearLead(mem(), schema, { id: L.solo, nome: 'Lead do Solo', agenteId: ID.solo })
  semearLead(mem(), schema, { id: L.pool, nome: 'Lead no pool', agenteId: null, poolDesde: new Date() })
})

const nomesDe = (res: { body: Record<string, any> }) => (res.body.data as { nome: string }[]).map(l => l.nome).sort()
const eventosDe = (leadId: string) =>
  mem()
    .rows(schema.vendasLeadEventos)
    .filter(e => e.leadId === leadId)
    .map(e => e.tipo as string)
const leadRow = (id: string) => mem().rows(schema.vendasLeads).find(l => l.id === id)!

describe('visibilidade do funil', () => {
  it('vendedor vê o próprio lead e o pool, nunca o de outro vendedor', async () => {
    const lista = await call('u-vendedor1', 'GET', `${P}/leads`)
    expect(lista.status).toBe(200)
    expect(nomesDe(lista)).toEqual(['Lead do V1', 'Lead no pool'])
    expect((await call('u-vendedor1', 'GET', `${P}/leads/${L.v2}`)).status).toBe(404)
    expect((await call('u-vendedor1', 'GET', `${P}/leads/${L.v1}`)).status).toBe(200)
  })

  it('supervisor vê a própria equipe e não vê a de outro supervisor', async () => {
    const lista = await call('u-supervisor1', 'GET', `${P}/leads`)
    expect(nomesDe(lista)).toEqual(['Lead do V1', 'Lead no pool'])
    expect((await call('u-supervisor1', 'GET', `${P}/leads/${L.v2}`)).status).toBe(404)
  })

  it('gerente vê a corretora inteira e não vê outra corretora', async () => {
    const lista = await call('u-gerente1', 'GET', `${P}/leads`)
    expect(nomesDe(lista)).toEqual(['Lead do V1', 'Lead do V2', 'Lead no pool'])
    expect((await call('u-gerente1', 'GET', `${P}/leads/${L.v3}`)).status).toBe(404)
  })

  it('master implícito (equipe ANNETEC) vê tudo do escopo; as estações separam pool/novos/andamento', async () => {
    mem().rows(schema.vendasLeads).find(l => l.id === L.v2)!.etapa = 'em_contato'
    expect(nomesDe(await call('staff', 'GET', `${P}/leads`))).toHaveLength(5)
    expect(nomesDe(await call('staff', 'GET', `${P}/leads/pool`))).toEqual(['Lead no pool'])
    expect(nomesDe(await call('staff', 'GET', `${P}/leads?estacao=andamento`))).toEqual(['Lead do V2'])
    const contadores = await call('staff', 'GET', `${P}/leads/contadores`)
    expect(contadores.body.data).toEqual({ pool: 1, novos: 3, andamento: 1, fechados: 0 })
  })

  it('GET /leads devolve a lista paginada com a forma do contrato', async () => {
    const lista = await call('u-vendedor1', 'GET', `${P}/leads?perPage=1`)
    expect(lista.body.meta).toMatchObject({ page: 1, perPage: 1, total: 2, totalPages: 2 })
    const lead = lista.body.data[0]
    expect(lead).toMatchObject({ scope: 'platform', tenantId: null, etapa: 'novo' })
    expect(lead.jornada).toHaveLength(6)
    expect(lead.proximoPassoInfo).toMatchObject({ quem: 'voce', atrasado: false })
  })

  it('balcão não vê funil nem pool e não reivindica (403); fora o funil, ninguém atravessa clubes', async () => {
    semearLead(mem(), schema, { id: L.clubeA, scope: 'tenant', tenantId: CLUBE_A.id, nome: 'Lead do Clube A', tipo: 'pessoa' } as never)
    semearLead(mem(), schema, { id: L.clubeB, scope: 'tenant', tenantId: CLUBE_B.id, nome: 'Lead do Clube B', tipo: 'pessoa' } as never)
    for (const [method, path] of [
      ['GET', `${T('clube-a')}/leads`],
      ['GET', `${T('clube-a')}/leads/pool`],
      ['POST', `${T('clube-a')}/leads/${L.clubeA}/reivindicar`],
      ['GET', `${T('clube-a')}/carteira`],
    ] as const) {
      const res = await call('u-balcaoA', method, path)
      expect(res.status, `${method} ${path}`).toBe(403)
      expect(res.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
    }
    // O lead sem dono do clube A não aparece nem no detalhe para o balcão.
    expect((await call('u-balcaoA', 'GET', `${T('clube-a')}/leads/${L.clubeA}`)).status).toBe(404)
  })

  it('clube A não enxerga clube B, e a plataforma não enxerga lead de clube', async () => {
    semearLead(mem(), schema, { id: L.clubeA, scope: 'tenant', tenantId: CLUBE_A.id, nome: 'Lead do Clube A', tipo: 'pessoa' } as never)
    semearLead(mem(), schema, { id: L.clubeB, scope: 'tenant', tenantId: CLUBE_B.id, nome: 'Lead do Clube B', tipo: 'pessoa' } as never)
    expect(nomesDe(await call('admin-a', 'GET', `${T('clube-a')}/leads`))).toEqual(['Lead do Clube A'])
    expect(nomesDe(await call('admin-b', 'GET', `${T('clube-b')}/leads`))).toEqual(['Lead do Clube B'])
    expect((await call('admin-b', 'GET', `${T('clube-b')}/leads/${L.clubeA}`)).status).toBe(404)
    expect((await call('admin-a', 'GET', `${T('clube-a')}/leads/${L.clubeB}`)).status).toBe(404)
    expect((await call('staff', 'GET', `${P}/leads/${L.clubeA}`)).status).toBe(404)
    // Vendedor do clube B tentando reivindicar lead sem dono do clube A.
    expect((await call('u-vendedorB', 'POST', `${T('clube-b')}/leads/${L.clubeA}/reivindicar`)).status).toBe(404)
    expect(leadRow(L.clubeA).agenteId).toBeNull()
  })
})

describe('pool: reivindicar', () => {
  it('claim atômico: duas tentativas simultâneas, uma vence e a outra recebe 409', async () => {
    const [a, b] = await Promise.all([
      call('u-vendedor1', 'POST', `${P}/leads/${L.pool}/reivindicar`),
      call('u-solo', 'POST', `${P}/leads/${L.pool}/reivindicar`),
    ])
    const status = [a.status, b.status].sort()
    expect(status).toEqual([200, 409])
    const perdedor = a.status === 409 ? a : b
    expect(perdedor.body.error.code).toBe('VENDAS_LEAD_JA_REIVINDICADO')
    const vencedor = a.status === 200 ? ID.vendedor1 : ID.solo
    const lead = leadRow(L.pool)
    expect(lead.agenteId).toBe(vencedor)
    expect(lead.poolDesde).toBeNull()
    expect(lead.reivindicadoEm).toBeInstanceOf(Date)
    expect(eventosDe(L.pool).filter(t => t === 'reivindicado')).toHaveLength(1)
  })

  it('lead que já tem dono = 409; id inexistente = 404; master sem perfil de agente não reivindica (403)', async () => {
    expect((await call('u-vendedor1', 'POST', `${P}/leads/${L.v2}/reivindicar`)).body.error.code).toBe('VENDAS_LEAD_JA_REIVINDICADO')
    expect((await call('u-vendedor1', 'POST', `${P}/leads/${uid(9999)}/reivindicar`)).status).toBe(404)
    expect((await call('staff', 'POST', `${P}/leads/${L.pool}/reivindicar`)).status).toBe(403)
  })

  it('lead que ficou 48 h sem contato volta ao pool ao listar (com evento devolvido_pool)', async () => {
    semearLead(mem(), schema, { id: L.v1Pool48, nome: 'Esquecido', agenteId: ID.vendedor1, reivindicadoEm: horasAtras(49) })
    semearLead(mem(), schema, { id: L.v1Recente, nome: 'Recente', agenteId: ID.vendedor1, reivindicadoEm: horasAtras(10) })
    semearLead(mem(), schema, {
      id: L.contato,
      nome: 'Com contato',
      agenteId: ID.vendedor1,
      reivindicadoEm: horasAtras(60),
      ultimoContatoEm: horasAtras(30),
    })
    const pool = await call('u-vendedor1', 'GET', `${P}/leads/pool`)
    expect(nomesDe(pool)).toEqual(['Esquecido', 'Lead no pool'])
    const lead = leadRow(L.v1Pool48)
    expect(lead.agenteId).toBeNull()
    expect(lead.poolDesde).toBeInstanceOf(Date)
    expect(eventosDe(L.v1Pool48)).toContain('devolvido_pool')
    expect(leadRow(L.v1Recente).agenteId).toBe(ID.vendedor1)
    expect(leadRow(L.contato).agenteId).toBe(ID.vendedor1)
  })
})

describe('etapas e eventos', () => {
  it('transição válida grava ganhoEm/perdidoEm e o evento etapa com {de, para}', async () => {
    const res = await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/etapa`, { etapa: 'em_contato' })
    expect(res.status).toBe(200)
    expect(res.body.data.etapa).toBe('em_contato')
    const evento = mem().rows(schema.vendasLeadEventos).find(e => e.leadId === L.v1 && e.tipo === 'etapa')!
    expect(evento.dados).toMatchObject({ de: 'novo', para: 'em_contato' })
  })

  it('transição inválida = 422 VENDAS_TRANSICAO_INVALIDA', async () => {
    const res = await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/etapa`, { etapa: 'proposta' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VENDAS_TRANSICAO_INVALIDA')
    expect(leadRow(L.v1).etapa).toBe('novo')
  })

  it('perdido exige motivo; com motivo grava perdidoEm e o motivo', async () => {
    const sem = await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/etapa`, { etapa: 'perdido' })
    expect(sem.status).toBe(400)
    const com = await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/etapa`, { etapa: 'perdido', motivoPerda: 'Sem interesse' })
    expect(com.status).toBe(200)
    expect(com.body.data).toMatchObject({ etapa: 'perdido', motivoPerda: 'Sem interesse' })
    expect(leadRow(L.v1).perdidoEm).toBeInstanceOf(Date)
    // reabrir: perdido → novo limpa o encerramento
    const reabre = await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/etapa`, { etapa: 'novo' })
    expect(reabre.status).toBe(200)
    expect(leadRow(L.v1).perdidoEm).toBeNull()
  })

  it('ganho manual exige confirmar:true (sem conversão) e grava o snapshot da cadeia', async () => {
    await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/etapa`, { etapa: 'em_contato' })
    await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/etapa`, { etapa: 'proposta' })
    const sem = await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/etapa`, { etapa: 'ganho' })
    expect(sem.status).toBe(422)
    // M13: vendedor não marca ganho sem venda (nem com confirmar); o gerente da corretora marca.
    const vendedor = await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/etapa`, { etapa: 'ganho', confirmar: true })
    expect(vendedor.status).toBe(422)
    expect(vendedor.body.error.code).toBe('VENDAS_TRANSICAO_INVALIDA')
    const com = await call('u-gerente1', 'POST', `${P}/leads/${L.v1}/etapa`, { etapa: 'ganho', confirmar: true })
    expect(com.status).toBe(200)
    expect(com.body.data.atribuicao).toMatchObject({
      agenteId: ID.vendedor1,
      papel: 'vendedor',
      equipeId: ID.equipe1,
      supervisorAgenteId: ID.supervisor1,
      corretoraId: ID.corretora1,
      gerenteAgenteId: ID.gerente1,
    })
    expect(leadRow(L.v1).ganhoEm).toBeInstanceOf(Date)
    // ganho é final: vendedor não reabre
    expect((await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/etapa`, { etapa: 'novo' })).body.error.code).toBe('VENDAS_TRANSICAO_INVALIDA')
  })

  it('com conversão existente o ganho dispensa a confirmação', async () => {
    semearLead(mem(), schema, {
      id: L.v1Recente,
      nome: 'Com proposta',
      agenteId: ID.vendedor1,
      etapa: 'proposta',
      conversao: { tipo: 'proposta', id: 'p1', status: 'active', atualizadoEm: new Date().toISOString() },
    })
    expect((await call('u-vendedor1', 'POST', `${P}/leads/${L.v1Recente}/etapa`, { etapa: 'ganho' })).status).toBe(200)
  })

  it('evento de contato atualiza ultimo_contato_em e leva novo → em_contato; nota não', async () => {
    const nota = await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/eventos`, { tipo: 'nota', texto: 'Cliente pediu retorno' })
    expect(nota.status).toBe(201)
    expect(leadRow(L.v1).etapa).toBe('novo')
    expect(leadRow(L.v1).ultimoContatoEm).toBeNull()

    const ligacao = await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/eventos`, { tipo: 'ligacao', texto: 'Liguei e falei com o RH' })
    expect(ligacao.status).toBe(201)
    expect(ligacao.body.data).toMatchObject({ tipo: 'ligacao', texto: 'Liguei e falei com o RH', porAgenteId: ID.vendedor1 })
    expect(leadRow(L.v1).etapa).toBe('em_contato')
    expect(leadRow(L.v1).ultimoContatoEm).toBeInstanceOf(Date)
    expect(eventosDe(L.v1)).toContain('etapa')
  })

  it('lead de outro vendedor e lead do pool não são editáveis por vendedor (403/404)', async () => {
    expect((await call('u-vendedor1', 'POST', `${P}/leads/${L.v2}/eventos`, { tipo: 'nota', texto: 'oi aí' })).status).toBe(404)
    const pool = await call('u-vendedor1', 'POST', `${P}/leads/${L.pool}/eventos`, { tipo: 'nota', texto: 'oi aí' })
    expect(pool.status).toBe(403)
    expect(pool.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
  })

  it('próximo passo grava texto e data e aparece no detalhe', async () => {
    const em = new Date(Date.now() + 86_400_000).toISOString()
    const res = await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/proximo-passo`, { texto: 'Ligar para o diretor', em })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ proximoPasso: 'Ligar para o diretor', proximoPassoInfo: { quem: 'voce', texto: 'Ligar para o diretor', atrasado: false } })
    const detalhe = await call('u-vendedor1', 'GET', `${P}/leads/${L.v1}`)
    expect(detalhe.body.data.eventos.map((e: { tipo: string }) => e.tipo)).toContain('proximo_passo')
    expect(detalhe.body.data.jornada).toHaveLength(6)
  })
})

describe('criar e reatribuir', () => {
  it('vendedor cria o lead com ele como dono; platform é sempre empresa', async () => {
    const res = await call('u-vendedor1', 'POST', `${P}/leads`, { nome: 'Empresa Nova', tipo: 'pessoa', origem: 'indicacao' })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({ nome: 'Empresa Nova', tipo: 'empresa', agenteId: ID.vendedor1, etapa: 'novo', poolDesde: null })
    expect(eventosDe(res.body.data.id)).toContain('criado')
  })

  it('vendedor não cria para outro agente; supervisor cria para a equipe e o agente recebe aviso', async () => {
    const negado = await call('u-vendedor1', 'POST', `${P}/leads`, { nome: 'Empresa Nova', agenteId: ID.vendedor2 })
    expect(negado.status).toBe(403)
    const fora = await call('u-supervisor1', 'POST', `${P}/leads`, { nome: 'Empresa Nova', agenteId: ID.vendedor2 })
    expect(fora.status).toBe(403)
    const ok = await call('u-supervisor1', 'POST', `${P}/leads`, { nome: 'Empresa Nova', agenteId: ID.vendedor1b })
    expect(ok.status).toBe(201)
    expect(ok.body.data.agenteId).toBe(ID.vendedor1b)
    const aviso = mem().rows(schema.notifications).find(n => n.kind === 'vendas_lead_atribuido')!
    expect(aviso).toMatchObject({ audience: 'sales', recipientUserId: 'u-vendedor1b', organizationId: null })
  })

  it('master reatribui para qualquer agente e devolve ao pool; evento e aviso ao novo dono', async () => {
    const res = await call('staff', 'POST', `${P}/leads/${L.v1}/reatribuir`, { agenteId: ID.vendedor3 })
    expect(res.status).toBe(200)
    expect(res.body.data.agenteId).toBe(ID.vendedor3)
    expect(eventosDe(L.v1)).toContain('atribuido')
    expect(mem().rows(schema.notifications).filter(n => n.kind === 'vendas_lead_atribuido' && n.recipientUserId === 'u-vendedor3')).toHaveLength(1)

    const pool = await call('staff', 'POST', `${P}/leads/${L.v1}/reatribuir`, { agenteId: null })
    expect(pool.status).toBe(200)
    expect(leadRow(L.v1).agenteId).toBeNull()
    expect(leadRow(L.v1).poolDesde).toBeInstanceOf(Date)
    expect(eventosDe(L.v1)).toContain('devolvido_pool')
  })

  it('supervisor só reatribui dentro da equipe; gerente só dentro da corretora; vendedor nunca', async () => {
    expect((await call('u-supervisor1', 'POST', `${P}/leads/${L.v1}/reatribuir`, { agenteId: ID.vendedor1b })).status).toBe(200)
    expect((await call('u-supervisor1', 'POST', `${P}/leads/${L.v1}/reatribuir`, { agenteId: ID.vendedor2 })).status).toBe(403)
    expect((await call('u-gerente1', 'POST', `${P}/leads/${L.v1}/reatribuir`, { agenteId: ID.vendedor2 })).status).toBe(200)
    expect((await call('u-gerente1', 'POST', `${P}/leads/${L.v2}/reatribuir`, { agenteId: ID.vendedor3 })).status).toBe(403)
    expect((await call('u-vendedor2', 'POST', `${P}/leads/${L.v2}/reatribuir`, { agenteId: ID.vendedor1 })).status).toBe(403)
    // agente de outro escopo/inexistente = 404
    expect((await call('staff', 'POST', `${P}/leads/${L.v2}/reatribuir`, { agenteId: ID.vendedorA })).status).toBe(404)
  })

  it('gerente assume o pool para alguém da corretora; supervisor devolve ao pool lead da equipe', async () => {
    expect((await call('u-gerente1', 'POST', `${P}/leads/${L.pool}/reatribuir`, { agenteId: ID.vendedor2 })).status).toBe(200)
    expect((await call('u-supervisor2', 'POST', `${P}/leads/${L.v2}/reatribuir`, { agenteId: null })).status).toBe(200)
    expect(leadRow(L.v2).agenteId).toBeNull()
  })
})

describe('mensagem pronta e carteira', () => {
  const modelo = {
    id: 'primeiro-contato',
    titulo: 'Primeiro contato',
    canal: 'whatsapp',
    texto: 'Olá, {{nome}}! Aqui é {{vendedor}}. Sobre o plano {{plano}}: {{link}}',
  }

  it('preenche os placeholders e monta o link do WhatsApp', async () => {
    const config = mem().rows(schema.vendasConfig).find(c => c.scope === 'platform')!
    config.modelosMensagem = [modelo, { ...modelo, id: 'email', canal: 'email' }]
    mem().insertRow(schema.tenantPlans, { id: PLANO_PLATFORM, name: 'Plano Ouro', priceMonthly: '100', memberLimit: 10 })
    const lead = leadRow(L.v1)
    lead.nome = 'Maria Souza'
    lead.telefone = '11999998888'
    lead.interessePlanoId = PLANO_PLATFORM

    const res = await call('u-vendedor1', 'GET', `${P}/leads/${L.v1}/mensagem?modelo=primeiro-contato`)
    expect(res.status).toBe(200)
    expect(res.body.data.modeloId).toBe('primeiro-contato')
    expect(res.body.data.canal).toBe('whatsapp')
    expect(res.body.data.texto).toContain('Olá, Maria Souza! Aqui é Vendedor Um. Sobre o plano Plano Ouro: ')
    expect(res.body.data.texto).toContain('/contratar?ref=VEN0001')
    expect(res.body.data.texto).not.toContain('{{')
    const link = res.body.data.linkWhatsapp as string
    expect(link.startsWith('https://wa.me/5511999998888?text=')).toBe(true)
    expect(decodeURIComponent(link.split('?text=')[1]!)).toBe(res.body.data.texto)

    const email = await call('u-vendedor1', 'GET', `${P}/leads/${L.v1}/mensagem?modelo=email`)
    expect(email.body.data.linkWhatsapp).toBeNull()
  })

  it('telefone inválido = sem link; modelo inexistente = 404; lead de outro = 404', async () => {
    mem().rows(schema.vendasConfig).find(c => c.scope === 'platform')!.modelosMensagem = [modelo]
    leadRow(L.v1).telefone = '123'
    const res = await call('u-vendedor1', 'GET', `${P}/leads/${L.v1}/mensagem?modelo=primeiro-contato`)
    expect(res.body.data.linkWhatsapp).toBeNull()
    expect(res.body.data.texto).toContain('nossos planos')
    expect((await call('u-vendedor1', 'GET', `${P}/leads/${L.v1}/mensagem?modelo=nao-existe`)).status).toBe(404)
    expect((await call('u-vendedor1', 'GET', `${P}/leads/${L.v2}/mensagem?modelo=primeiro-contato`)).status).toBe(404)
  })

  it('tenant: link da mensagem é o checkout do clube com plano, ref e lead', async () => {
    mem().rows(schema.vendasConfig).find(c => c.tenantId === CLUBE_A.id)!.modelosMensagem = [modelo]
    semearLead(mem(), schema, { id: L.clubeA, scope: 'tenant', tenantId: CLUBE_A.id, nome: 'Pessoa', tipo: 'pessoa', agenteId: ID.vendedorA, telefone: '21988887777', interessePlanoId: uid(3001) } as never)
    const res = await call('u-vendedorA', 'GET', `${T('clube-a')}/leads/${L.clubeA}/mensagem?modelo=primeiro-contato`)
    expect(res.status).toBe(200)
    expect(res.body.data.texto).toContain('/clube-a/assinar?plano=')
    expect(res.body.data.texto).toContain('ref=CLA0001')
    expect(res.body.data.texto).toContain(`lead=${L.clubeA}`)
  })

  it('carteira do clube: ganho + assinatura ativa com vencimento em frase; só os leads visíveis', async () => {
    const vence = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 12 * 86_400_000))
    semearLead(mem(), schema, { id: L.clubeA, scope: 'tenant', tenantId: CLUBE_A.id, nome: 'Associada Ativa', tipo: 'pessoa', agenteId: ID.vendedorA, etapa: 'ganho', ganhoEm: new Date() } as never)
    semearLead(mem(), schema, { id: L.clubeB, scope: 'tenant', tenantId: CLUBE_A.id, nome: 'Associada Atrasada', tipo: 'pessoa', agenteId: ID.vendedorA, etapa: 'ganho', ganhoEm: new Date() } as never)
    semearLead(mem(), schema, { id: L.v3, scope: 'tenant', tenantId: CLUBE_A.id, nome: 'De Outro Vendedor', tipo: 'pessoa', agenteId: ID.balcaoA, etapa: 'ganho', ganhoEm: new Date() } as never)
    mem().insertRow(schema.clubSubscriptions, { id: uid(4001), organizationId: CLUBE_A.id, vendasLeadId: L.clubeA, status: 'active', planName: 'Clube Plus', amount: '89.9', nextDueDate: vence })
    mem().insertRow(schema.clubSubscriptions, { id: uid(4002), organizationId: CLUBE_A.id, vendasLeadId: L.clubeB, status: 'past_due', planName: 'Clube Plus', amount: '89.9', nextDueDate: vence })

    const res = await call('u-vendedorA', 'GET', `${T('clube-a')}/carteira`)
    expect(res.status).toBe(200)
    expect(res.body.data.totais).toEqual({ ativa: 1, atrasada: 1, cancelada: 0, pendente: 0 })
    const itens = res.body.data.items as { situacao: string; resumo: string; lead: { nome: string }; assinatura: { status: string; planoNome: string; valorMensal: number } }[]
    expect(itens.map(i => i.lead.nome).sort()).toEqual(['Associada Ativa', 'Associada Atrasada'])
    const ativa = itens.find(i => i.situacao === 'ativa')!
    expect(ativa.resumo).toBe('Ativa · vence em 12 dias')
    expect(ativa.assinatura).toMatchObject({ status: 'active', planoNome: 'Clube Plus', valorMensal: 89.9 })
    expect(itens.find(i => i.situacao === 'atrasada')!.resumo).toBe('Atrasada')

    const filtrado = await call('u-vendedorA', 'GET', `${T('clube-a')}/carteira?situacao=atrasada`)
    expect(filtrado.body.data.items).toHaveLength(1)
    expect(filtrado.body.meta.total).toBe(1)
  })

  it('carteira da plataforma: status do clube e da proposta', async () => {
    semearLead(mem(), schema, {
      id: L.v1Recente,
      nome: 'Clube Ativado',
      agenteId: ID.vendedor1,
      etapa: 'ganho',
      ganhoEm: new Date(),
      conversao: { tipo: 'proposta', id: uid(5001), status: 'active', atualizadoEm: new Date().toISOString() },
    })
    mem().insertRow(schema.platformOnboardingProposals, { id: uid(5001), status: 'active', organizationId: 'org-novo', planId: PLANO_PLATFORM })
    mem().insertRow(schema.organization, { id: 'org-novo', name: 'Clube Novo', slug: 'clube-novo' })
    mem().insertRow(schema.tenantPlans, { id: PLANO_PLATFORM, name: 'Plano Ouro', priceMonthly: '100', memberLimit: 10 })
    const res = await call('u-vendedor1', 'GET', `${P}/carteira`)
    expect(res.status).toBe(200)
    expect(res.body.data.items).toHaveLength(1)
    expect(res.body.data.items[0]).toMatchObject({
      situacao: 'ativa',
      resumo: 'Clube ativo',
      assinatura: null,
      clube: { propostaStatus: 'active', organizacaoId: 'org-novo', nome: 'Clube Novo', planoNome: 'Plano Ouro' },
    })
  })
})

describe('conversão', () => {
  it('link de adesão (tenant) aponta para o checkout com ref e lead e guarda o plano de interesse', async () => {
    const plano = uid(3001)
    mem().insertRow(schema.clubPlans, { id: plano, organizationId: CLUBE_A.id, name: 'Clube Plus', status: 'active' })
    semearLead(mem(), schema, { id: L.clubeA, scope: 'tenant', tenantId: CLUBE_A.id, nome: 'Pessoa', tipo: 'pessoa', agenteId: ID.vendedorA } as never)
    const res = await call('u-vendedorA', 'POST', `${T('clube-a')}/leads/${L.clubeA}/link-adesao`, { planoId: plano })
    expect(res.status).toBe(201)
    expect(res.body.data.ref).toBe('CLA0001')
    const url = new URL(res.body.data.url as string)
    expect(url.pathname).toBe('/clube-a/assinar')
    expect(url.searchParams.get('plano')).toBe(plano)
    expect(url.searchParams.get('ref')).toBe('CLA0001')
    expect(url.searchParams.get('lead')).toBe(L.clubeA)
    expect(leadRow(L.clubeA).interessePlanoId).toBe(plano)
    // plano de outro clube = 404; rota de tenant na plataforma = 404
    mem().insertRow(schema.clubPlans, { id: uid(3002), organizationId: CLUBE_B.id, name: 'Outro', status: 'active' })
    expect((await call('u-vendedorA', 'POST', `${T('clube-a')}/leads/${L.clubeA}/link-adesao`, { planoId: uid(3002) })).status).toBe(404)
    expect((await call('staff', 'POST', `${P}/leads/${L.v1}/link-adesao`, { planoId: plano })).status).toBe(404)
  })

  it('proposta da plataforma exige o cadastro completo do lead (CNPJ, e-mail, telefone, vidas)', async () => {
    const res = await call('u-vendedor1', 'POST', `${P}/leads/${L.v1}/proposta`, { planoId: PLANO_PLATFORM })
    expect(res.status).toBe(400)
    expect(res.body.error.issues.map((i: { path: string }) => i.path).sort()).toEqual(['documento', 'email', 'telefone', 'vidasEstimadas'])
    expect((await call('u-vendedor1', 'GET', `${P}/leads/${L.v1}/proposta`)).status).toBe(404)
  })

  it('assinar exige o cadastro do titular e recusa cartão; só no tenant', async () => {
    const plano = uid(3001)
    mem().insertRow(schema.clubPlans, { id: plano, organizationId: CLUBE_A.id, name: 'Clube Plus', status: 'active' })
    semearLead(mem(), schema, { id: L.clubeA, scope: 'tenant', tenantId: CLUBE_A.id, nome: 'Pessoa', tipo: 'pessoa', agenteId: ID.vendedorA } as never)
    const incompleto = await call('u-vendedorA', 'POST', `${T('clube-a')}/leads/${L.clubeA}/assinar`, { planoId: plano })
    expect(incompleto.status).toBe(400)
    expect(incompleto.body.error.issues.map((i: { path: string }) => i.path)).toEqual(['documento', 'email', 'telefone', 'dados.dataNascimento'])
    const cartao = await call('u-vendedorA', 'POST', `${T('clube-a')}/leads/${L.clubeA}/assinar`, { planoId: plano, metodoPagamento: 'credit_card' })
    expect(cartao.status).toBe(400)
    expect((await call('staff', 'POST', `${P}/leads/${L.v1}/assinar`, { planoId: plano })).status).toBe(404)
  })
})
