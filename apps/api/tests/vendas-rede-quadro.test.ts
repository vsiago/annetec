import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENTES, CLUBE_A, CLUBE_B, ID, semearConfig, semearLead, semearRede, uid } from './helpers/vendas-world'

/**
 * Quadro do Funil (`GET /leads/quadro`) e temperatura do lead pela HTTP (app inteiro, guards reais,
 * banco em memória): visibilidade por papel, ordem dos cards, totais e soma por coluna, Disponíveis,
 * fechados do mês, filtros, sentimento gravado em `dados.sentimento` e a temperatura devolvida na
 * listagem e no detalhe.
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
const DIA = 86_400_000
const diasAtras = (n: number) => new Date(Date.now() - n * DIA)
const horasAtras = (n: number) => new Date(Date.now() - n * 3_600_000)

const L = {
  novo: uid(3001),
  contatoQuente: uid(3002),
  contatoFria: uid(3003),
  contatoAtrasado: uid(3004),
  propostaMorna: uid(3005),
  negociacaoA: uid(3006),
  negociacaoB: uid(3007),
  doV2: uid(3008),
  doV3: uid(3009),
  disponivelAntigo: uid(3010),
  disponivelNovo: uid(3011),
  ganhoMes: uid(3012),
  ganhoAntigo: uid(3013),
  perdidoMes: uid(3014),
  clubeA: uid(3015),
  clubeB: uid(3016),
}

const idsDe = (itens: { id: string }[]) => itens.map(i => i.id)
const coluna = (res: { body: Record<string, any> }, etapa: string) => (res.body.data.etapas as any[]).find(c => c.etapa === etapa)
const eventosDe = (leadId: string) => mem().rows(schema.vendasLeadEventos).filter(e => e.leadId === leadId)

/** Evento de contato semeado direto no banco (a rota grava com `em = agora`). */
function semearContato(leadId: string, em: Date, sentimento?: 'positivo' | 'neutro' | 'negativo') {
  mem().insertRow(schema.vendasLeadEventos, { leadId, tipo: 'ligacao', texto: 'Conversa', dados: sentimento ? { sentimento } : null, em })
}

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

  const v1 = ID.vendedor1
  // Novo, ainda sem contato.
  semearLead(mem(), schema, { id: L.novo, nome: 'Novo sem contato', agenteId: v1, etapa: 'novo', reivindicadoEm: diasAtras(1), origem: 'site' })
  // Em contato: um quente (positivo ontem), um frio (negativo), um atrasado (próximo passo vencido há 2 dias).
  semearLead(mem(), schema, { id: L.contatoQuente, nome: 'Quente', agenteId: v1, etapa: 'em_contato', ultimoContatoEm: diasAtras(1), valorEstimado: '1000.00', origem: 'indicacao' })
  semearContato(L.contatoQuente, diasAtras(1), 'positivo')
  semearLead(mem(), schema, { id: L.contatoFria, nome: 'Fria', agenteId: v1, etapa: 'em_contato', ultimoContatoEm: diasAtras(2), valorEstimado: '500.00', origem: 'site' })
  semearContato(L.contatoFria, diasAtras(2), 'negativo')
  semearLead(mem(), schema, {
    id: L.contatoAtrasado,
    nome: 'Atrasado',
    agenteId: v1,
    etapa: 'em_contato',
    ultimoContatoEm: diasAtras(3),
    proximoPasso: 'Ligar de novo',
    proximoPassoEm: diasAtras(2),
    valorEstimado: '250.50',
    origem: 'site',
  })
  semearLead(mem(), schema, { id: L.propostaMorna, nome: 'Proposta morna', agenteId: v1, etapa: 'proposta', ultimoContatoEm: diasAtras(5), valorEstimado: '3000.00' })
  semearContato(L.propostaMorna, diasAtras(5), 'neutro')
  semearLead(mem(), schema, { id: L.negociacaoA, nome: 'Negociação A', agenteId: v1, etapa: 'negociacao', ultimoContatoEm: diasAtras(1), valorEstimado: '2000.00' })
  semearLead(mem(), schema, { id: L.negociacaoB, nome: 'Negociação B', agenteId: v1, etapa: 'negociacao', ultimoContatoEm: diasAtras(6), valorEstimado: '1500.00' })
  // Outros agentes.
  semearLead(mem(), schema, { id: L.doV2, nome: 'Do V2', agenteId: ID.vendedor2, etapa: 'em_contato', ultimoContatoEm: diasAtras(1), valorEstimado: '700.00' })
  semearLead(mem(), schema, { id: L.doV3, nome: 'Do V3', agenteId: ID.vendedor3, etapa: 'proposta', ultimoContatoEm: diasAtras(1), valorEstimado: '900.00' })
  // Disponíveis (sem responsável).
  semearLead(mem(), schema, { id: L.disponivelAntigo, nome: 'Disponível antigo', agenteId: null, poolDesde: horasAtras(5) })
  semearLead(mem(), schema, { id: L.disponivelNovo, nome: 'Disponível novo', agenteId: null, poolDesde: horasAtras(1) })
  // Fechados.
  semearLead(mem(), schema, { id: L.ganhoMes, nome: 'Ganho do mês', agenteId: v1, etapa: 'ganho', ganhoEm: new Date(), valorEstimado: '4000.00' })
  semearLead(mem(), schema, { id: L.ganhoAntigo, nome: 'Ganho antigo', agenteId: v1, etapa: 'ganho', ganhoEm: diasAtras(90), valorEstimado: '9999.00' })
  semearLead(mem(), schema, { id: L.perdidoMes, nome: 'Perdido do mês', agenteId: v1, etapa: 'perdido', perdidoEm: new Date(), valorEstimado: '800.00' })
})

describe('GET /leads/quadro: forma e ordem', () => {
  it('devolve as 4 colunas abertas, Disponíveis, fechados do mês e o resumo', async () => {
    const res = await call('u-vendedor1', 'GET', `${P}/leads/quadro`)
    expect(res.status).toBe(200)
    expect((res.body.data.etapas as any[]).map(c => c.etapa)).toEqual(['novo', 'em_contato', 'proposta', 'negociacao'])
    expect(res.body.data.disponiveis.total).toBe(2)
    expect(res.body.data.fechados.ganhos).toEqual({ total: 1, valor: 4000 })
    expect(res.body.data.fechados.perdidos).toEqual({ total: 1, valor: 800 })
    expect(typeof res.body.data.geradoEm).toBe('string')
  })

  it('cada coluna traz total, soma do valor estimado e atrasados; o resumo soma as abertas', async () => {
    const res = await call('u-vendedor1', 'GET', `${P}/leads/quadro`)
    expect(coluna(res, 'novo')).toMatchObject({ total: 1, valor: 0, atrasados: 0 })
    expect(coluna(res, 'em_contato')).toMatchObject({ total: 3, valor: 1750.5, atrasados: 1 })
    expect(coluna(res, 'proposta')).toMatchObject({ total: 1, valor: 3000, atrasados: 0 })
    expect(coluna(res, 'negociacao')).toMatchObject({ total: 2, valor: 3500, atrasados: 0 })
    expect(res.body.data.resumo).toEqual({ emAndamento: 7, valorNegociacao: 3500, valorAberto: 8250.5, atrasados: 1 })
  })

  it('ordem dos cards: atrasados, depois quente, morna e fria', async () => {
    const res = await call('u-vendedor1', 'GET', `${P}/leads/quadro`)
    expect(idsDe(coluna(res, 'em_contato').itens)).toEqual([L.contatoAtrasado, L.contatoQuente, L.contatoFria])
    // Negociação: A (contato ontem) é quente; B (contato há 6 dias) é morna.
    expect(idsDe(coluna(res, 'negociacao').itens)).toEqual([L.negociacaoA, L.negociacaoB])
  })

  it('cada card traz temperatura, motivo, reação e desde quando está na etapa', async () => {
    const res = await call('u-vendedor1', 'GET', `${P}/leads/quadro`)
    const itens = coluna(res, 'em_contato').itens as any[]
    const quente = itens.find(i => i.id === L.contatoQuente)
    expect(quente).toMatchObject({ temperatura: 'quente', ultimoSentimento: 'positivo', temperaturaMotivo: 'Reagiu com interesse há 1 dia' })
    const fria = itens.find(i => i.id === L.contatoFria)
    expect(fria).toMatchObject({ temperatura: 'fria', ultimoSentimento: 'negativo' })
    expect(typeof quente.etapaDesde).toBe('string')
    const novo = coluna(res, 'novo').itens[0]
    expect(novo).toMatchObject({ id: L.novo, temperatura: null, temperaturaMotivo: null })
  })

  it('etapaDesde usa o último evento de etapa', async () => {
    mem().insertRow(schema.vendasLeadEventos, { leadId: L.propostaMorna, tipo: 'etapa', texto: 'x', dados: { de: 'em_contato', para: 'proposta' }, em: diasAtras(4) })
    mem().insertRow(schema.vendasLeadEventos, { leadId: L.propostaMorna, tipo: 'etapa', texto: 'y', dados: { de: 'novo', para: 'em_contato' }, em: diasAtras(10) })
    const res = await call('u-vendedor1', 'GET', `${P}/leads/quadro`)
    const card = coluna(res, 'proposta').itens[0]
    expect(Math.round((Date.now() - Date.parse(card.etapaDesde)) / DIA)).toBe(4)
  })

  it('limite corta os cards mas o total e a soma continuam exatos', async () => {
    const res = await call('u-vendedor1', 'GET', `${P}/leads/quadro?limite=1`)
    const c = coluna(res, 'em_contato')
    expect(c.itens).toHaveLength(1)
    expect(c.itens[0].id).toBe(L.contatoAtrasado)
    expect(c).toMatchObject({ total: 3, valor: 1750.5 })
  })

  it('Disponíveis: sem responsável, os mais antigos primeiro, fora das colunas', async () => {
    const res = await call('u-vendedor1', 'GET', `${P}/leads/quadro`)
    expect(idsDe(res.body.data.disponiveis.itens)).toEqual([L.disponivelAntigo, L.disponivelNovo])
    const todosCards = (res.body.data.etapas as any[]).flatMap(c => idsDe(c.itens))
    expect(todosCards).not.toContain(L.disponivelAntigo)
  })

  it('fechados: só ganhos e perdidos do mês corrente, os mais recentes nos itens', async () => {
    const res = await call('u-vendedor1', 'GET', `${P}/leads/quadro`)
    expect(idsDe(res.body.data.fechados.itens).sort()).toEqual([L.ganhoMes, L.perdidoMes].sort())
    expect(idsDe(res.body.data.fechados.itens)).not.toContain(L.ganhoAntigo)
  })
})

describe('GET /leads/quadro: filtros', () => {
  it('temperatura filtra cards e também as contagens e somas da coluna', async () => {
    const res = await call('u-vendedor1', 'GET', `${P}/leads/quadro?temperatura=fria`)
    expect(idsDe(coluna(res, 'em_contato').itens)).toEqual([L.contatoFria])
    expect(coluna(res, 'em_contato')).toMatchObject({ total: 1, valor: 500, atrasados: 0 })
    expect(coluna(res, 'negociacao').total).toBe(0)
  })

  it('atrasados=true mostra só quem tem próximo passo vencido', async () => {
    const res = await call('u-vendedor1', 'GET', `${P}/leads/quadro?atrasados=true`)
    expect(idsDe(coluna(res, 'em_contato').itens)).toEqual([L.contatoAtrasado])
    expect(res.body.data.resumo).toMatchObject({ emAndamento: 1, atrasados: 1 })
  })

  it('origem filtra colunas e Disponíveis', async () => {
    const res = await call('u-vendedor1', 'GET', `${P}/leads/quadro?origem=indicacao`)
    expect(idsDe(coluna(res, 'em_contato').itens)).toEqual([L.contatoQuente])
    expect(res.body.data.disponiveis.total).toBe(0)
  })

  it('agente filtra as colunas de quem vê equipe', async () => {
    const res = await call('u-gerente1', 'GET', `${P}/leads/quadro?agente=${ID.vendedor2}`)
    expect(idsDe(coluna(res, 'em_contato').itens)).toEqual([L.doV2])
    expect(coluna(res, 'novo').total).toBe(0)
  })

  it('parâmetros inválidos dão 400 (VALIDATION_ERROR)', async () => {
    expect((await call('u-vendedor1', 'GET', `${P}/leads/quadro?temperatura=azul`)).status).toBe(400)
    expect((await call('u-vendedor1', 'GET', `${P}/leads/quadro?limite=0`)).status).toBe(400)
    expect((await call('u-vendedor1', 'GET', `${P}/leads/quadro?limite=500`)).status).toBe(400)
  })
})

describe('GET /leads/quadro: visibilidade por papel', () => {
  const todosOsCards = (res: { body: Record<string, any> }) => (res.body.data.etapas as any[]).flatMap(c => idsDe(c.itens))

  it('vendedor vê só os próprios leads abertos e os Disponíveis', async () => {
    const res = await call('u-vendedor1', 'GET', `${P}/leads/quadro`)
    const ids = todosOsCards(res)
    expect(ids).not.toContain(L.doV2)
    expect(ids).not.toContain(L.doV3)
    expect(ids).toContain(L.contatoQuente)
    expect(res.body.data.resumo.emAndamento).toBe(7)
  })

  it('supervisor vê a própria equipe (vendedor1), não a de outro supervisor', async () => {
    const res = await call('u-supervisor1', 'GET', `${P}/leads/quadro`)
    const ids = todosOsCards(res)
    expect(ids).toContain(L.contatoQuente)
    expect(ids).not.toContain(L.doV2)
    expect(ids).not.toContain(L.doV3)
  })

  it('gerente vê a corretora inteira (V1 e V2), não outra corretora', async () => {
    const res = await call('u-gerente1', 'GET', `${P}/leads/quadro`)
    const ids = todosOsCards(res)
    expect(ids).toContain(L.contatoQuente)
    expect(ids).toContain(L.doV2)
    expect(ids).not.toContain(L.doV3)
    expect(res.body.data.resumo.emAndamento).toBe(8)
  })

  it('master implícito (equipe ANNETEC) vê tudo do escopo platform', async () => {
    const res = await call('staff', 'GET', `${P}/leads/quadro`)
    const ids = todosOsCards(res)
    expect(ids).toEqual(expect.arrayContaining([L.contatoQuente, L.doV2, L.doV3]))
    expect(res.body.data.resumo.emAndamento).toBe(9)
    expect(res.body.data.disponiveis.total).toBe(2)
  })

  it('balcão não acessa o quadro (403)', async () => {
    const res = await call('u-balcaoA', 'GET', `${T('clube-a')}/leads/quadro`)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
  })

  it('o quadro do clube A não mistura leads do clube B nem da plataforma', async () => {
    semearLead(mem(), schema, { id: L.clubeA, scope: 'tenant', tenantId: CLUBE_A.id, nome: 'Lead do Clube A', agenteId: ID.vendedorA, etapa: 'em_contato', ultimoContatoEm: diasAtras(1) } as never)
    semearLead(mem(), schema, { id: L.clubeB, scope: 'tenant', tenantId: CLUBE_B.id, nome: 'Lead do Clube B', agenteId: ID.vendedorB, etapa: 'em_contato', ultimoContatoEm: diasAtras(1) } as never)
    const a = await call('admin-a', 'GET', `${T('clube-a')}/leads/quadro`)
    expect(todosOsCards(a)).toEqual([L.clubeA])
    expect(a.body.data.disponiveis.total).toBe(0)
    const b = await call('admin-b', 'GET', `${T('clube-b')}/leads/quadro`)
    expect(todosOsCards(b)).toEqual([L.clubeB])
    const plataforma = await call('staff', 'GET', `${P}/leads/quadro`)
    expect(todosOsCards(plataforma)).not.toContain(L.clubeA)
    expect(todosOsCards(plataforma)).not.toContain(L.clubeB)
  })

  it('sem sessão = 401', async () => {
    const res = await app.request(`${P}/leads/quadro`)
    expect(res.status).toBe(401)
  })
})

describe('sentimento do contato e temperatura', () => {
  it('registrar contato com sentimento grava dados.sentimento e esquenta o lead', async () => {
    const res = await call('u-vendedor1', 'POST', `${P}/leads/${L.novo}/eventos`, { tipo: 'ligacao', texto: 'Falei com o RH', sentimento: 'positivo' })
    expect(res.status).toBe(201)
    expect(res.body.data.dados).toEqual({ sentimento: 'positivo' })
    expect(eventosDe(L.novo).find(e => e.tipo === 'ligacao')?.dados).toEqual({ sentimento: 'positivo' })

    const detalhe = await call('u-vendedor1', 'GET', `${P}/leads/${L.novo}`)
    expect(detalhe.body.data).toMatchObject({
      etapa: 'em_contato',
      temperatura: 'quente',
      temperaturaMotivo: 'Reagiu com interesse hoje',
      ultimoSentimento: 'positivo',
    })
    const lista = await call('u-vendedor1', 'GET', `${P}/leads?etapa=em_contato`)
    expect((lista.body.data as any[]).find(l => l.id === L.novo)).toMatchObject({ temperatura: 'quente', ultimoSentimento: 'positivo' })
  })

  it('o último contato manda: sentimento negativo depois do positivo esfria o lead', async () => {
    await call('u-vendedor1', 'POST', `${P}/leads/${L.novo}/eventos`, { tipo: 'whatsapp', texto: 'Mandei a proposta', sentimento: 'positivo' })
    // Garante que o 2º contato é o mais recente.
    const primeiro = eventosDe(L.novo).find(e => e.tipo === 'whatsapp')!
    primeiro.em = new Date(Date.now() - 60_000)
    await call('u-vendedor1', 'POST', `${P}/leads/${L.novo}/eventos`, { tipo: 'ligacao', texto: 'Disse que não quer', sentimento: 'negativo' })
    const detalhe = await call('u-vendedor1', 'GET', `${P}/leads/${L.novo}`)
    expect(detalhe.body.data).toMatchObject({ temperatura: 'fria', ultimoSentimento: 'negativo' })
  })

  it('contato sem sentimento é aceito (pergunta opcional) e deixa a temperatura morna', async () => {
    const res = await call('u-vendedor1', 'POST', `${P}/leads/${L.novo}/eventos`, { tipo: 'ligacao', texto: 'Não atendeu, deixei recado' })
    expect(res.status).toBe(201)
    expect(res.body.data.dados).toBeNull()
    const detalhe = await call('u-vendedor1', 'GET', `${P}/leads/${L.novo}`)
    expect(detalhe.body.data).toMatchObject({ temperatura: 'morna', ultimoSentimento: null })
  })

  it('nota com sentimento = 400 (a reação só vale para contatos); sentimento inválido também', async () => {
    const nota = await call('u-vendedor1', 'POST', `${P}/leads/${L.novo}/eventos`, { tipo: 'nota', texto: 'Cliente pediu retorno', sentimento: 'positivo' })
    expect(nota.status).toBe(400)
    expect(eventosDe(L.novo).filter(e => e.tipo === 'nota')).toHaveLength(0)
    const invalido = await call('u-vendedor1', 'POST', `${P}/leads/${L.novo}/eventos`, { tipo: 'ligacao', texto: 'Falei com ele', sentimento: 'animado' })
    expect(invalido.status).toBe(400)
  })

  it('lead novo sem contato e lead fechado não têm temperatura', async () => {
    const novo = await call('u-vendedor1', 'GET', `${P}/leads/${L.novo}`)
    expect(novo.body.data).toMatchObject({ temperatura: null, temperaturaMotivo: null })
    const ganho = await call('u-vendedor1', 'GET', `${P}/leads/${L.ganhoMes}`)
    expect(ganho.body.data.temperatura).toBeNull()
  })

  it('a listagem calcula a temperatura de vários leads de uma vez (sem depender do detalhe)', async () => {
    const lista = await call('staff', 'GET', `${P}/leads?perPage=100`)
    const porId = new Map((lista.body.data as any[]).map(l => [l.id, l]))
    expect(porId.get(L.contatoQuente)).toMatchObject({ temperatura: 'quente' })
    expect(porId.get(L.contatoFria)).toMatchObject({ temperatura: 'fria' })
    expect(porId.get(L.propostaMorna)).toMatchObject({ temperatura: 'morna', ultimoSentimento: 'neutro' })
    expect(porId.get(L.contatoAtrasado)).toMatchObject({ temperatura: 'morna' })
  })

  it('lead de outro vendedor continua 404 ao registrar contato com sentimento', async () => {
    const res = await call('u-vendedor1', 'POST', `${P}/leads/${L.doV2}/eventos`, { tipo: 'ligacao', texto: 'Tentando', sentimento: 'positivo' })
    expect([403, 404]).toContain(res.status)
  })
})
