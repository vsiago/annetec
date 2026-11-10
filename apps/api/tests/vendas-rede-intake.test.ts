import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLUBE_A, CLUBE_B, ID, horasAtras, semearConfig, semearLead, semearRede, uid } from './helpers/vendas-world'
import { whereValues } from './helpers/fake-db'

/**
 * Entrada pública de leads e atribuição de vendas: pool com evento, honeypot, rate limit
 * (10/h por IP), distribuição automática, dedupe de 24 h, avisos para quem está online,
 * `ref/:codigo`, atribuição do checkout (`ref`/`lead`), funil do agente na contratação
 * indicada e sincronização lead ← proposta.
 */

const memory = vi.hoisted(() => ({ db: null as null | Record<string, unknown> }))
const checkoutCalls = vi.hoisted(() => [] as { input: Record<string, any>; atribuicao: unknown }[])

vi.mock('@/config/env', async importOriginal => ({ ...(await importOriginal<typeof import('@/config/env')>()), isProduction: true }))
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
      schema.platformSellers,
      schema.platformOnboardingProposals,
      schema.notifications,
    ],
    uniques: [{ table: schema.notifications, keys: ['audience', 'dedupeKey'] }],
  })
  memory.db = instance as unknown as Record<string, unknown>
  return { db: instance.db, sql: { end: async () => {} }, schema }
})
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => null) } } }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}), recordSystemAudit: vi.fn(async () => {}) }))
vi.mock('@/modules/club-billing/access.service', () => ({ loadClubAccess: vi.fn() }))
vi.mock('@/modules/club-billing/checkout.service', () => ({
  checkoutService: {
    checkout: vi.fn(async (_tenant: unknown, input: Record<string, any>, _ip: unknown, _viewer: unknown, atribuicao: unknown) => {
      checkoutCalls.push({ input, atribuicao })
      return { subscriptionId: uid(8001), planName: 'Clube Plus', paymentMethod: 'pix', status: 'pending_payment', charge: { status: 'pending' } }
    }),
  },
}))
vi.mock('@/http/middleware/tenant', () => ({
  resolveTenant: createMiddleware(async (c, next) => {
    c.set('tenant', { ...CLUBE_A, kind: 'operator' })
    await next()
  }),
  tenantOf: () => ({ ...CLUBE_A, kind: 'operator' }),
}))

const schema = await import('@/db/schema')
const { errorHandler } = await import('@/http/errors')
const { vendasRedePublicRoutes } = await import('@/modules/vendas-rede')
const { clubCheckoutController } = await import('@/modules/club-billing/public-controller')
const { receberLead } = await import('@/modules/vendas-rede/intake.service')
const { prepararAtribuicaoDoCheckout, vincularAssinaturaAoLead, sincronizarLeadComProposta } = await import('@/modules/vendas-rede/conversao-sync')
const { capturePublicLead, publicLeadInput } = await import('@/modules/tenants/public-leads')
const { createReferralProspect, resolveReferral } = await import('@/modules/platform-sales/referral')
const { scopeCondition } = await import('@/modules/notifications/service')

type Memory = import('./helpers/memory-db').MemoryDb
const mem = () => memory.db as unknown as Memory
const app = new Hono().route('/api/v1/public/vendas', vendasRedePublicRoutes).route('/api/v1/t/:tenantSlug/public/checkout', clubCheckoutController)
app.onError(errorHandler)

let postsPublicos = 0
async function postLead(body: Record<string, unknown>) {
  postsPublicos += 1
  const response = await app.request('/api/v1/public/vendas/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json()) as Record<string, any> }
}

const PEDIDO = {
  nome: 'Carla Mendes',
  email: 'carla@entidade.org',
  telefone: '(11) 98888-7777',
  origemDetalhe: 'entidades',
  empresa: 'Entidade Exemplo',
}

const leads = () => mem().rows(schema.vendasLeads)
const eventos = (leadId: string) => mem().rows(schema.vendasLeadEventos).filter(e => e.leadId === leadId)
const avisos = (kind?: string) => mem().rows(schema.notifications).filter(n => !kind || n.kind === kind)
const agente = (id: string) => mem().rows(schema.vendasAgentes).find(a => a.id === id)!

beforeEach(() => {
  mem().reset()
  checkoutCalls.length = 0
  semearRede(mem(), schema)
  semearConfig(mem(), schema, { scope: 'platform', tenantId: null })
  semearConfig(mem(), schema, { scope: 'tenant', tenantId: CLUBE_A.id })
  mem().insertRow(schema.organization, { id: CLUBE_A.id, name: CLUBE_A.name, slug: CLUBE_A.slug })
  mem().insertRow(schema.organization, { id: CLUBE_B.id, name: CLUBE_B.name, slug: CLUBE_B.slug })
})

function colocarOnline(...ids: string[]) {
  for (const id of ids) agente(id).ultimaPresencaEm = new Date()
}

describe('POST /public/vendas/leads', () => {
  it('lead público cai no pool com evento criado e telefone só com dígitos', async () => {
    const res = await postLead(PEDIDO)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, data: { recebido: true } })
    expect(leads()).toHaveLength(1)
    const lead = leads()[0]!
    expect(lead).toMatchObject({
      scope: 'platform',
      tenantId: null,
      tipo: 'empresa',
      nome: 'Carla Mendes',
      email: 'carla@entidade.org',
      telefone: '11988887777',
      origem: 'site',
      origemDetalhe: 'entidades',
      etapa: 'novo',
      agenteId: null,
    })
    expect(lead.poolDesde).toBeInstanceOf(Date)
    expect(lead.dados).toMatchObject({ empresa: 'Entidade Exemplo' })
    expect(eventos(lead.id as string).map(e => e.tipo)).toEqual(['criado'])
  })

  it('honeypot preenchido: responde 200 igual ao sucesso e não grava nada', async () => {
    const res = await postLead({ ...PEDIDO, website: 'http://spam.example' })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ recebido: true })
    expect(leads()).toHaveLength(0)
    expect(avisos()).toHaveLength(0)
  })

  it('corpo inválido = 400', async () => {
    expect((await postLead({ nome: 'A' })).status).toBe(400)
  })
})

describe('avisos do pool', () => {
  it('avisa quem está online (≠ balcão), os masters explícitos e a equipe; ninguém offline', async () => {
    mem().insertRow(schema.vendasAgentes, { id: uid(301), scope: 'platform', tenantId: null, userId: 'u-master', papel: 'master', nome: 'Master', ativo: true, codigoIndicacao: 'MAS0001' })
    colocarOnline(ID.vendedor1, ID.solo)
    // vendedor2 offline; supervisor2 online mas inativo
    agente(ID.supervisor2).ultimaPresencaEm = new Date()
    agente(ID.supervisor2).ativo = false

    await receberLead({ scope: 'platform', tenantId: null, tipo: 'empresa', nome: 'Entidade X', telefone: '11977776666', origemDetalhe: 'entidades' })
    const sales = avisos('vendas_lead_novo').filter(n => n.audience === 'sales')
    expect(sales.map(n => n.recipientUserId).sort()).toEqual(['u-master', 'u-solo', 'u-vendedor1'])
    for (const aviso of sales) expect(aviso).toMatchObject({ organizationId: null, title: 'Novo lead no pool' })
    const equipe = avisos('vendas_lead_novo').filter(n => n.audience === 'platform')
    expect(equipe).toHaveLength(1)
    expect(avisos().every(n => n.audience === 'sales' || n.audience === 'platform')).toBe(true)
  })

  it('no clube avisa os agentes online do clube e o admin (público tenant), sem tocar nos da plataforma', async () => {
    colocarOnline(ID.vendedor1, ID.vendedorA, ID.balcaoA)
    const res = await capturePublicLead(CLUBE_A.id, publicLeadInput.parse({ name: 'Pessoa Interessada', phone: '21999990000', origin: 'cadastro' }))
    expect(res.leadId).toBeTruthy()
    const sales = avisos('vendas_lead_novo').filter(n => n.audience === 'sales')
    expect(sales.map(n => n.recipientUserId)).toEqual(['u-vendedorA'])
    expect(sales[0]).toMatchObject({ organizationId: CLUBE_A.id, link: expect.stringContaining('/clube-a/vendas/funil?lead=') })
    expect(avisos('vendas_lead_novo').filter(n => n.audience === 'tenant')).toHaveLength(1)
  })

  it('o público sales só enxerga as linhas da própria pessoa no escopo da rota', () => {
    const plataforma = whereValues(scopeCondition({ audience: 'sales', organizationId: null, userId: 'u-1' }))
    expect(plataforma).toEqual(expect.arrayContaining(['sales', 'u-1']))
    const clube = whereValues(scopeCondition({ audience: 'sales', organizationId: 'org-1', userId: 'u-1' }))
    expect(clube).toEqual(expect.arrayContaining(['sales', 'u-1', 'org-1']))
  })
})

describe('distribuição automática', () => {
  beforeEach(() => {
    mem().rows(schema.vendasConfig).find(c => c.scope === 'platform')!.distribuicao = 'automatica'
  })

  it('escolhe o online com menor carga nos últimos 7 dias (offline e inativo ficam de fora)', async () => {
    colocarOnline(ID.vendedor1, ID.solo, ID.supervisor1, ID.vendedor3)
    agente(ID.vendedor3).ativo = false
    // cargas: vendedor1 = 2, supervisor1 = 1, solo = 0 (um lead antigo de 10 dias não conta)
    semearLead(mem(), schema, { id: uid(401), agenteId: ID.vendedor1, reivindicadoEm: horasAtras(5) })
    semearLead(mem(), schema, { id: uid(402), agenteId: ID.vendedor1, reivindicadoEm: horasAtras(30) })
    semearLead(mem(), schema, { id: uid(403), agenteId: ID.supervisor1, reivindicadoEm: horasAtras(2) })
    semearLead(mem(), schema, { id: uid(404), agenteId: ID.solo, reivindicadoEm: horasAtras(240) })

    const resultado = await receberLead({ scope: 'platform', tenantId: null, tipo: 'empresa', nome: 'Entidade Y', telefone: '11966665555', origemDetalhe: 'entidades' })
    expect(resultado).toMatchObject({ duplicado: false, agenteId: ID.solo })
    const lead = leads().find(l => l.id === resultado.leadId)!
    expect(lead.agenteId).toBe(ID.solo)
    expect(lead.poolDesde).toBeNull()
    expect(lead.reivindicadoEm).toBeInstanceOf(Date)
    expect(eventos(lead.id as string).map(e => e.tipo)).toEqual(['criado', 'atribuido'])
    expect(avisos('vendas_lead_atribuido').map(n => n.recipientUserId)).toEqual(['u-solo'])
    expect(avisos('vendas_lead_novo').filter(n => n.audience === 'sales')).toHaveLength(0)
  })

  it('ninguém online: o lead fica no pool', async () => {
    const resultado = await receberLead({ scope: 'platform', tenantId: null, tipo: 'empresa', nome: 'Entidade Z', telefone: '11955554444', origemDetalhe: 'entidades' })
    expect(resultado.agenteId).toBeNull()
    expect(leads().find(l => l.id === resultado.leadId)!.poolDesde).toBeInstanceOf(Date)
    expect(avisos('vendas_lead_novo').some(n => n.audience === 'platform')).toBe(true)
  })
})

describe('dedupe de 24 h', () => {
  const entrada = { scope: 'platform' as const, tenantId: null, tipo: 'empresa' as const, nome: 'Carla', telefone: '11944443333', email: 'carla@x.org', origemDetalhe: 'entidades' }

  it('mesmo telefone com lead aberto acrescenta evento "Novo pedido pelo site" em vez de duplicar', async () => {
    const primeiro = await receberLead(entrada)
    const segundo = await receberLead({ ...entrada, nome: 'Carla de novo', email: 'outro@x.org', observacoes: 'Quero falar de novo' })
    expect(segundo).toMatchObject({ leadId: primeiro.leadId, duplicado: true })
    expect(leads()).toHaveLength(1)
    const linha = eventos(primeiro.leadId)
    expect(linha.map(e => e.tipo)).toEqual(['criado', 'sistema'])
    expect(linha[1]).toMatchObject({ texto: 'Novo pedido pelo site' })
    // só o primeiro pedido avisou o pool
    expect(avisos('vendas_lead_novo').filter(n => n.audience === 'platform')).toHaveLength(1)
  })

  it('mesmo e-mail também deduplica; escopos diferentes não se misturam', async () => {
    const primeiro = await receberLead(entrada)
    expect((await receberLead({ ...entrada, telefone: '11933332222' })).leadId).toBe(primeiro.leadId)
    const outroClube = await receberLead({ ...entrada, scope: 'tenant', tenantId: CLUBE_A.id, tipo: 'pessoa' })
    expect(outroClube.leadId).not.toBe(primeiro.leadId)
    expect(leads()).toHaveLength(2)
  })

  it('lead encerrado ou com mais de 24 h não bloqueia um novo pedido', async () => {
    semearLead(mem(), schema, { id: uid(501), telefone: '11944443333', etapa: 'ganho' })
    semearLead(mem(), schema, { id: uid(502), email: 'carla@x.org', createdAt: horasAtras(25) })
    const novo = await receberLead(entrada)
    expect(novo.duplicado).toBe(false)
    expect(leads()).toHaveLength(3)
  })
})

describe('vitrine do clube', () => {
  it('cadastro e contato viram lead pessoa; "empresas" vira empresa com CNPJ; tudo origem site no pool do clube', async () => {
    const cadastro = await capturePublicLead(CLUBE_A.id, publicLeadInput.parse({ name: 'João Pessoa', phone: '(21) 99999-0001', origin: 'cadastro', email: 'JOAO@x.org' }))
    const empresas = await capturePublicLead(
      CLUBE_A.id,
      publicLeadInput.parse({ name: 'Rita RH', phone: '2133334444', origin: 'empresas', company: { name: 'Empresa Ltda', document: '11222333000181', employees: '50' } }),
    )
    const a = leads().find(l => l.id === cadastro.leadId)!
    const e = leads().find(l => l.id === empresas.leadId)!
    expect(a).toMatchObject({ scope: 'tenant', tenantId: CLUBE_A.id, tipo: 'pessoa', origem: 'site', origemDetalhe: 'cadastro', agenteId: null, email: 'joao@x.org', telefone: '21999990001' })
    expect(a.poolDesde).toBeInstanceOf(Date)
    expect(e).toMatchObject({ tipo: 'empresa', origemDetalhe: 'empresas', documento: '11222333000181' })
    expect(e.dados).toMatchObject({ empresa: 'Empresa Ltda', colaboradores: '50' })
    expect(eventos(a.id as string).map(x => x.tipo)).toEqual(['criado'])
  })

  it('honeypot da vitrine não grava', async () => {
    const res = await capturePublicLead(CLUBE_A.id, publicLeadInput.parse({ name: 'Robô', phone: '21999990002', origin: 'contato', website: 'http://spam' }))
    expect(res.leadId).toBeNull()
    expect(leads()).toHaveLength(0)
  })
})

describe('GET /public/vendas/ref/:codigo', () => {
  async function ref(codigo: string) {
    const response = await app.request(`/api/v1/public/vendas/ref/${codigo}`)
    return { status: response.status, body: (await response.json()) as Record<string, any> }
  }

  it('200 com o nome do vendedor (sem diferenciar maiúsculas; também código de clube)', async () => {
    expect(await ref('VEN0001')).toMatchObject({ status: 200, body: { data: { nomeVendedor: 'Vendedor Um' } } })
    expect((await ref('ven0001')).body.data.nomeVendedor).toBe('Vendedor Um')
    expect((await ref('CLA0001')).body.data.nomeVendedor).toBe('Vendedor do Clube A')
  })

  it('404 VENDAS_CODIGO_INVALIDO para código desconhecido ou de agente inativo', async () => {
    const desconhecido = await ref('NAOEXISTE')
    expect(desconhecido.status).toBe(404)
    expect(desconhecido.body.error.code).toBe('VENDAS_CODIGO_INVALIDO')
    agente(ID.vendedor1).ativo = false
    expect((await ref('VEN0001')).status).toBe(404)
  })
})

describe('checkout público: ref e lead', () => {
  const titular = { name: 'Ana Souza', email: 'ana@x.org', phone: '21977776666', cpf: '52998224725' }
  const plano = { id: uid(3001), name: 'Clube Plus' }

  it('só `ref`: cria lead negociacao (origem link) com dono = agente do próprio clube', async () => {
    const atribuicao = await prepararAtribuicaoDoCheckout(CLUBE_A.id, { ref: 'cla0001' }, titular, plano)
    expect(atribuicao).toMatchObject({ agenteId: ID.vendedorA })
    const lead = leads().find(l => l.id === atribuicao!.leadId)!
    expect(lead).toMatchObject({
      scope: 'tenant',
      tenantId: CLUBE_A.id,
      etapa: 'negociacao',
      origem: 'link',
      agenteId: ID.vendedorA,
      documento: titular.cpf,
      interessePlanoId: plano.id,
    })
    expect(lead.atribuicao).toMatchObject({ agenteId: ID.vendedorA, papel: 'vendedor' })
    expect(eventos(lead.id as string).map(e => e.tipo)).toEqual(['criado'])
    // segunda compra do mesmo CPF com o mesmo agente reaproveita o lead aberto
    const repetida = await prepararAtribuicaoDoCheckout(CLUBE_A.id, { ref: 'CLA0001' }, titular, plano)
    expect(repetida!.leadId).toBe(lead.id)
    expect(leads()).toHaveLength(1)
  })

  it('`lead` válido do clube vale (dono do lead é o agente); ref de outro clube/código inválido é ignorado', async () => {
    semearLead(mem(), schema, { id: uid(601), scope: 'tenant', tenantId: CLUBE_A.id, agenteId: ID.vendedorA } as never)
    semearLead(mem(), schema, { id: uid(602), scope: 'tenant', tenantId: CLUBE_B.id, agenteId: ID.vendedorB } as never)
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { lead: uid(601) }, titular, plano)).toEqual({ agenteId: ID.vendedorA, leadId: uid(601) })
    // lead de outro clube e códigos de outros escopos não atribuem nada
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { lead: uid(602) }, titular, plano)).toBeNull()
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { ref: 'CLB0001' }, titular, plano)).toBeNull()
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { ref: 'VEN0001' }, titular, plano)).toBeNull()
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { ref: 'lixo', lead: 'nao-e-uuid' }, titular, plano)).toBeNull()
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, {}, titular, plano)).toBeNull()
  })

  it('assinatura criada: o lead aponta para ela, vai a negociacao e ganha snapshot e evento conversao', async () => {
    semearLead(mem(), schema, { id: uid(601), scope: 'tenant', tenantId: CLUBE_A.id, agenteId: ID.vendedorA, etapa: 'em_contato' } as never)
    await vincularAssinaturaAoLead(uid(601), { id: uid(8001), status: 'pending_payment', planoId: plano.id, planoNome: plano.name })
    const lead = leads().find(l => l.id === uid(601))!
    expect(lead.etapa).toBe('negociacao')
    expect(lead.conversao).toMatchObject({ tipo: 'assinatura', id: uid(8001), status: 'pending_payment' })
    expect(lead.atribuicao).toMatchObject({ agenteId: ID.vendedorA })
    expect(eventos(uid(601)).map(e => e.tipo)).toEqual(['etapa', 'conversao'])
  })

  it('o controller do checkout repassa ref/lead (corpo ou query) ao serviço', async () => {
    const corpo = {
      planId: plano.id,
      holder: { name: 'Ana Souza', cpf: titular.cpf, email: 'ana@x.org', phone: '21977776666', birthDate: '1990-05-10' },
      dependents: [],
      payment: { method: 'pix' },
      acceptTerms: true,
    }
    const post = (path: string, body: unknown) =>
      app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const comCorpo = await post('/api/v1/t/clube-a/public/checkout', { ...corpo, ref: 'CLA0001', lead: uid(601) })
    expect(comCorpo.status).toBe(201)
    expect(checkoutCalls[0]!.atribuicao).toEqual({ ref: 'CLA0001', lead: uid(601) })
    const comQuery = await post('/api/v1/t/clube-a/public/checkout?ref=cla0001&lead=' + uid(602), corpo)
    expect(comQuery.status).toBe(201)
    expect(checkoutCalls[1]!.atribuicao).toEqual({ ref: 'cla0001', lead: uid(602) })
    const semNada = await post('/api/v1/t/clube-a/public/checkout', corpo)
    expect(semNada.status).toBe(201)
    expect(checkoutCalls[2]!.atribuicao).toEqual({ ref: undefined, lead: undefined })
  })
})

describe('contratação indicada (`/contratar?ref=`)', () => {
  const entrada = {
    proposalId: uid(7001),
    proposalCode: 'PRO-2026-0001',
    name: 'Clube Novo Ltda',
    cnpj: '11222333000181',
    applicant: { name: 'Responsável', email: 'resp@clubenovo.org', phone: '11999990000' },
    expectedLives: 120,
    planId: uid(2001),
    city: 'Niterói',
    state: 'RJ',
  }

  it('resolve o código do agente (sem diferenciar maiúsculas) e ignora agente inativo', async () => {
    expect(await resolveReferral('ven0001')).toMatchObject({ userId: 'u-vendedor1', name: 'Vendedor Um', referralCode: 'VEN0001', agenteId: ID.vendedor1 })
    expect(await resolveReferral('CLA0001')).toBeNull() // código de clube não vale na plataforma
    agente(ID.vendedor1).ativo = false
    expect(await resolveReferral('VEN0001')).toBeNull()
    expect(await resolveReferral('')).toBeNull()
  })

  it('cria o lead no funil do agente (negociacao, origem link) e liga a proposta a ele', async () => {
    mem().insertRow(schema.platformOnboardingProposals, { id: entrada.proposalId, status: 'draft' })
    const seller = (await resolveReferral('VEN0001'))!
    await createReferralProspect({ ...entrada, seller })
    expect(leads()).toHaveLength(1)
    const lead = leads()[0]!
    expect(lead).toMatchObject({
      scope: 'platform',
      tipo: 'empresa',
      etapa: 'negociacao',
      origem: 'link',
      agenteId: ID.vendedor1,
      documento: entrada.cnpj,
      vidasEstimadas: 120,
      uf: 'RJ',
    })
    expect(lead.conversao).toMatchObject({ tipo: 'proposta', id: entrada.proposalId, status: 'draft' })
    expect(lead.atribuicao).toMatchObject({ agenteId: ID.vendedor1, supervisorAgenteId: ID.supervisor1, gerenteAgenteId: ID.gerente1, corretoraId: ID.corretora1 })
    const proposta = mem().rows(schema.platformOnboardingProposals).find(p => p.id === entrada.proposalId)!
    expect(proposta).toMatchObject({ vendasLeadId: lead.id, vendasAgenteId: ID.vendedor1 })
    // nova indicação do mesmo CNPJ ao mesmo agente reaproveita o lead aberto
    await createReferralProspect({ ...entrada, seller })
    expect(leads()).toHaveLength(1)
  })
})

describe('sincronização lead ← proposta', () => {
  const proposta = (status: string, extra: Record<string, unknown> = {}) => ({ id: uid(7001), status: status as never, vendasLeadId: uid(701), ...extra })
  const lead = () => leads().find(l => l.id === uid(701))!

  beforeEach(() => {
    semearLead(mem(), schema, {
      id: uid(701),
      agenteId: ID.vendedor1,
      etapa: 'em_contato',
      conversao: { tipo: 'proposta', id: uid(7001), status: 'draft', atualizadoEm: new Date().toISOString() },
    })
  })

  it('em análise/aprovação/aguardando pagamento → negociacao (e atualiza conversao.status)', async () => {
    await sincronizarLeadComProposta(mem().db as never, proposta('submitted'))
    expect(lead().etapa).toBe('negociacao')
    expect(lead().conversao).toMatchObject({ status: 'submitted' })
    expect(lead().atribuicao).toMatchObject({ agenteId: ID.vendedor1 })
    await sincronizarLeadComProposta(mem().db as never, proposta('awaiting_payment'))
    expect(lead().etapa).toBe('negociacao')
    expect(lead().conversao).toMatchObject({ status: 'awaiting_payment' })
  })

  it('ativação → ganho com ganho_em e evento conversao; cancelamento posterior não rebaixa', async () => {
    await sincronizarLeadComProposta(mem().db as never, proposta('active'))
    expect(lead().etapa).toBe('ganho')
    expect(lead().ganhoEm).toBeInstanceOf(Date)
    expect(eventos(uid(701)).map(e => e.tipo)).toEqual(['etapa', 'conversao'])
    await sincronizarLeadComProposta(mem().db as never, proposta('canceled'))
    expect(lead().etapa).toBe('ganho')
    expect(lead().conversao).toMatchObject({ status: 'canceled' })
  })

  it('cancelada/reprovada → perdido com motivo; repetir o mesmo status não duplica evento', async () => {
    await sincronizarLeadComProposta(mem().db as never, proposta('rejected', { rejectionReason: 'CNPJ inapto' }))
    expect(lead()).toMatchObject({ etapa: 'perdido', motivoPerda: 'Proposta reprovada na análise: CNPJ inapto' })
    expect(lead().perdidoEm).toBeInstanceOf(Date)
    const antes = eventos(uid(701)).length
    await sincronizarLeadComProposta(mem().db as never, proposta('rejected', { rejectionReason: 'CNPJ inapto' }))
    expect(eventos(uid(701))).toHaveLength(antes)
  })
})

describe('rate limit', () => {
  it('10 pedidos por hora por IP: o 11º recebe 429', async () => {
    const restantes = 10 - postsPublicos
    expect(restantes).toBeGreaterThan(0)
    for (let i = 0; i < restantes; i++) {
      expect((await postLead({ ...PEDIDO, telefone: `1190000${String(i).padStart(4, '0')}`, website: 'robo' })).status).toBe(200)
    }
    const bloqueado = await postLead({ ...PEDIDO, website: 'robo' })
    expect(bloqueado.status).toBe(429)
    expect(bloqueado.body.error.code).toBe('RATE_LIMITED')
  })
})
