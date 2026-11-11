import { RESULTADO_BALCAO_LABELS } from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENTES, CLUBE_A, CLUBE_B, ID, semearConfig, semearLead, semearRede, uid } from './helpers/vendas-world'

/**
 * Balcão da Rede Comercial pela HTTP (app inteiro, guards reais, sessão falsa por token, banco em
 * memória, checkout stubado): hoje, planos, simulação, pessoa, cada resultado de atendimento,
 * reaproveitamento de lead, validações, papéis e isolamento entre clubes.
 */

const state = vi.hoisted(() => ({ sessions: {} as Record<string, unknown> }))
const memory = vi.hoisted(() => ({ db: null as null | Record<string, unknown> }))
/** Falhas injetadas no banco em memória (atomicidade do atendimento). */
const falha = vi.hoisted(() => ({ gravarAtendimento: false, mudarEtapaNoMeio: false }))

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
      schema.vendasUnidades,
      schema.vendasAtendimentosBalcao,
      schema.clubPlans,
      schema.tenantPlans,
      schema.clubSubscriptions,
      schema.platformOnboardingProposals,
      schema.notifications,
    ],
    uniques: [{ table: schema.notifications, keys: ['audience', 'dedupeKey'] }],
    beforeWrite: (kind, table, values) => {
      if (kind === 'insert' && table === schema.vendasAtendimentosBalcao && falha.gravarAtendimento) throw new Error('banco fora ao gravar o atendimento')
      // Simula outro atendente fechando o lead (ganho) entre a leitura e a perda: o compare-and-swap da etapa tem de falhar.
      if (kind === 'insert' && table === schema.vendasLeadEventos && falha.mudarEtapaNoMeio && (values as { tipo?: string }).tipo === 'atendimento_balcao') {
        const leads = (memory.db as unknown as { rows: (t: unknown) => Record<string, unknown>[] }).rows(schema.vendasLeads)
        for (const lead of leads) lead.etapa = 'ganho'
      }
    },
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
const checkoutMock = vi.hoisted(() => ({ checkout: vi.fn() }))
vi.mock('@/modules/club-billing/checkout.service', () => ({ checkoutService: checkoutMock }))
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

const B = (slug: string) => `/api/v1/t/${slug}/vendas/balcao`

const CPF = '52998224725'
const CPF2 = '11144477735'
const CEL = '21988887777'
const PLANO_PLUS = uid(3001)
const PLANO_BASICO = uid(3002)
const PLANO_INATIVO = uid(3003)
const PLANO_B = uid(3004)
const UNIDADE = uid(4001)
const ASSINATURA = uid(5001)

const leadRow = (id: string) => mem().rows(schema.vendasLeads).find(r => r.id === id) as Record<string, any>
const leadsDoTenant = (tenantId: string) => mem().rows(schema.vendasLeads).filter(r => r.tenantId === tenantId) as Record<string, any>[]
const eventosDe = (leadId: string) => mem().rows(schema.vendasLeadEventos).filter(r => r.leadId === leadId) as Record<string, any>[]
const atendimentosDb = () => mem().rows(schema.vendasAtendimentosBalcao) as Record<string, any>[]

const ASSINAR = {
  nome: 'Maria da Silva',
  documento: CPF,
  telefone: CEL,
  email: 'maria@exemplo.com',
  dataNascimento: '1985-04-10',
  servico: 'Consulta cardiologia',
  valorTabela: 300,
  planoId: PLANO_PLUS,
  resultado: 'assinou',
}

beforeEach(async () => {
  mem().reset()
  falha.gravarAtendimento = false
  falha.mudarEtapaNoMeio = false
  checkoutMock.checkout.mockReset()
  checkoutMock.checkout.mockResolvedValue({ subscriptionId: ASSINATURA, status: 'pending_payment', session: { token: 'x' } })
  state.sessions = {
    'admin-a': tenantSession('admin-a', CLUBE_A, 'admin'),
    'admin-b': tenantSession('admin-b', CLUBE_B, 'admin'),
    staff: platformSession('staff', 'superadmin'),
  }
  for (const agente of AGENTES) {
    state.sessions[agente.userId] =
      agente.scope === 'tenant'
        ? tenantSession(agente.userId, agente.tenantId === CLUBE_A.id ? CLUBE_A : CLUBE_B, 'seller')
        : platformSession(agente.userId, 'platform_seller')
  }
  semearRede(mem(), schema)
  semearConfig(mem(), schema, { scope: 'tenant', tenantId: CLUBE_A.id })
  semearConfig(mem(), schema, { scope: 'tenant', tenantId: CLUBE_B.id })
  // Segundo balcão do clube A (para isolar atendimentos entre agentes).
  mem().insertRow(schema.vendasAgentes, { id: uid(234), scope: 'tenant', tenantId: CLUBE_A.id, userId: 'u-balcaoA2', papel: 'balcao', nome: 'Balcão A2', ativo: true, codigoIndicacao: 'BAL0002' })
  mem().insertRow(schema.user, { id: 'u-balcaoA2', name: 'Balcão A2', email: 'u-balcaoA2@teste.com', banned: false })
  state.sessions['u-balcaoA2'] = tenantSession('u-balcaoA2', CLUBE_A, 'seller')
  mem().insertRow(schema.vendasUnidades, { id: UNIDADE, scope: 'tenant', tenantId: CLUBE_A.id, nome: 'Clínica Centro', tipo: 'clinica' })
  await (mem() as any).db.update(schema.vendasAgentes).set({ unidadeId: UNIDADE, metaMensal: 220 }).where(eq(schema.vendasAgentes.id, ID.balcaoA))
  mem().insertRow(schema.clubPlans, { id: PLANO_PLUS, organizationId: CLUBE_A.id, name: 'Clube Plus', status: 'active', priceMonthly: '49.90', enrollmentFee: '20', balcaoDescontoPercentual: 40, highlight: true, coverages: [{ id: 'c1', title: 'Telemedicina' }, { id: 'c2', title: 'Consultas com desconto' }], features: [] })
  mem().insertRow(schema.clubPlans, { id: PLANO_BASICO, organizationId: CLUBE_A.id, name: 'Clube Básico', status: 'active', priceMonthly: '29.90', features: ['Telemedicina'], coverages: [] })
  mem().insertRow(schema.clubPlans, { id: PLANO_INATIVO, organizationId: CLUBE_A.id, name: 'Antigo', status: 'inactive', priceMonthly: '10' })
  mem().insertRow(schema.clubPlans, { id: PLANO_B, organizationId: CLUBE_B.id, name: 'Plano do B', status: 'active', priceMonthly: '99' })
})

describe('balcão: acesso e isolamento', () => {
  it('vendedor comum recebe 403 em todas as rotas; platform não tem /balcao', async () => {
    for (const [method, path, body] of [
      ['GET', '/hoje'],
      ['GET', '/planos'],
      ['POST', '/simular', { valorTabela: 100 }],
      ['GET', `/pessoa?documento=${CPF}`],
      ['GET', '/atendimentos'],
      ['POST', '/atendimentos', { ...ASSINAR, resultado: 'so_informacao' }],
    ] as [string, string, unknown?][]) {
      const res = await call('u-vendedorA', method, `${B('clube-a')}${path}`, body)
      expect(res.status, `${method} ${path}`).toBe(403)
      expect(res.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
    }
    expect((await call('staff', 'GET', '/api/v1/vendas/balcao/hoje')).status).toBe(404)
    expect((await call('u-vendedor1', 'GET', '/api/v1/vendas/balcao/hoje')).status).toBe(404)
  })

  it('balcão do clube B não entra no clube A', async () => {
    const res = await call('u-vendedorB', 'GET', `${B('clube-a')}/hoje`)
    expect([403, 404]).toContain(res.status)
  })

  it('planos e simulação mostram só os planos ativos do próprio clube', async () => {
    const a = await call('u-balcaoA', 'GET', `${B('clube-a')}/planos`)
    expect(a.body.data.map((p: { nome: string }) => p.nome)).not.toContain('Plano do B')
    const b = await call('admin-b', 'GET', `${B('clube-b')}/planos`)
    expect(b.body.data.map((p: { nome: string }) => p.nome)).toEqual(['Plano do B'])
    const outro = await call('u-balcaoA', 'POST', `${B('clube-a')}/simular`, { valorTabela: 100, planoId: PLANO_B })
    expect(outro.status).toBe(404)
  })
})

describe('balcão: planos e simulação', () => {
  it('desconto do plano vs padrão do clube, destaque primeiro, resumo e só ativos', async () => {
    const res = await call('u-balcaoA', 'GET', `${B('clube-a')}/planos`)
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([
      { id: PLANO_PLUS, nome: 'Clube Plus', precoMensal: 49.9, adesao: 20, descontoPercentual: 40, destaque: true, resumo: ['Telemedicina', 'Consultas com desconto'], vendavel: true },
      { id: PLANO_BASICO, nome: 'Clube Básico', precoMensal: 29.9, adesao: 0, descontoPercentual: 30, destaque: false, resumo: ['Telemedicina'], vendavel: true },
    ])
  })

  it('simula uma linha por plano ou só o plano pedido', async () => {
    const todos = await call('u-balcaoA', 'POST', `${B('clube-a')}/simular`, { valorTabela: 200 })
    expect(todos.status).toBe(200)
    expect(todos.body.data).toHaveLength(2)
    expect(todos.body.data[0]).toEqual({
      planoId: PLANO_PLUS,
      planoNome: 'Clube Plus',
      descontoPercentual: 40,
      precoMensal: 49.9,
      adesao: 20,
      valorComPlano: 120,
      economiaNaConsulta: 80,
      economiaAnual12: 960,
      consultasParaCompensar: 1,
    })
    const um = await call('u-balcaoA', 'POST', `${B('clube-a')}/simular`, { valorTabela: 200, planoId: PLANO_BASICO })
    expect(um.body.data).toHaveLength(1)
    expect(um.body.data[0]).toMatchObject({ descontoPercentual: 30, valorComPlano: 140, economiaNaConsulta: 60 })
    expect((await call('u-balcaoA', 'POST', `${B('clube-a')}/simular`, { valorTabela: 0 })).status).toBe(400)
  })
})

describe('balcão: pessoa', () => {
  it('ninguém encontrado', async () => {
    const res = await call('u-balcaoA', 'GET', `${B('clube-a')}/pessoa?documento=${CPF}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ jaAssociado: false, assinatura: null, lead: null, nome: null })
    expect((await call('u-balcaoA', 'GET', `${B('clube-a')}/pessoa`)).status).toBe(400)
  })

  it('já associado (por CPF do titular) com plano e vencimento', async () => {
    mem().insertRow(schema.clubSubscriptions, { id: ASSINATURA, organizationId: CLUBE_A.id, status: 'active', planName: 'Clube Plus', holderName: 'Maria da Silva', holderCpf: CPF, holderEmail: 'maria@exemplo.com', holderPhone: CEL, nextDueDate: '2026-12-05' })
    const res = await call('u-balcaoA', 'GET', `${B('clube-a')}/pessoa?documento=${CPF}`)
    expect(res.body.data.jaAssociado).toBe(true)
    // Só status e plano (sem id, vencimento, telefone ou e-mail); o nome vem porque a busca foi pelo CPF do titular.
    expect(res.body.data.assinatura).toEqual({ status: 'active', planoNome: 'Clube Plus' })
    expect(res.body.data.nome).toBe('Maria da Silva')
    expect(res.body.data).not.toHaveProperty('telefone')
    expect(res.body.data).not.toHaveProperty('email')
    expect(res.body.data.lead).toBeNull()
    expect(res.body.data.leadAberto).toBeNull()
    // Pelo celular o nome do titular não é revelado (pode ser de um familiar).
    const porTelefone = await call('u-balcaoA', 'GET', `${B('clube-a')}/pessoa?telefone=${CEL}`)
    expect(porTelefone.body.data.jaAssociado).toBe(true)
    expect(porTelefone.body.data.assinatura).toEqual({ status: 'active', planoNome: 'Clube Plus' })
    expect(porTelefone.body.data.nome).toBeNull()
    // assinatura de outro clube não conta
    const outro = await call('admin-b', 'GET', `${B('clube-b')}/pessoa?documento=${CPF}`)
    expect(outro.body.data.jaAssociado).toBe(false)
  })

  it('lead aberto do próprio atendente vem completo; lead perdido não aparece; outro clube não vê', async () => {
    semearLead(mem(), schema, { id: uid(6001), scope: 'tenant', tenantId: CLUBE_A.id, tipo: 'pessoa', nome: 'Joana', agenteId: ID.balcaoA, etapa: 'em_contato', telefone: CEL } as never)
    semearLead(mem(), schema, { id: uid(6002), scope: 'tenant', tenantId: CLUBE_A.id, tipo: 'pessoa', nome: 'Perdida', agenteId: ID.balcaoA, etapa: 'perdido', documento: CPF2 } as never)
    const res = await call('u-balcaoA', 'GET', `${B('clube-a')}/pessoa?telefone=${CEL}`)
    expect(res.body.data.jaAssociado).toBe(false)
    expect(res.body.data.lead).toMatchObject({ id: uid(6001), nome: 'Joana', etapa: 'em_contato', agenteNome: 'Balcão A' })
    expect(res.body.data.leadAberto).toEqual({ existe: true, etapa: 'em_contato', proprio: true })
    expect(res.body.data.nome).toBe('Joana')
    const perdida = await call('u-balcaoA', 'GET', `${B('clube-a')}/pessoa?documento=${CPF2}`)
    expect(perdida.body.data.lead).toBeNull()
    expect(perdida.body.data.leadAberto).toBeNull()
    const outroClube = await call('admin-b', 'GET', `${B('clube-b')}/pessoa?telefone=${CEL}`)
    expect(outroClube.body.data.lead).toBeNull()
    expect(outroClube.body.data.leadAberto).toBeNull()
  })

  it('lead aberto de OUTRO atendente: só existe/etapa, sem nome, observações, atribuição ou conversão', async () => {
    semearLead(mem(), schema, { id: uid(6006), scope: 'tenant', tenantId: CLUBE_A.id, tipo: 'pessoa', nome: 'Segredo da Silva', agenteId: ID.vendedorA, etapa: 'negociacao', documento: CPF, telefone: CEL, email: 'segredo@exemplo.com', observacoes: 'cliente VIP', atribuicao: { agenteId: ID.vendedorA }, conversao: { subscriptionId: 'x' } } as never)
    for (const filtro of [`documento=${CPF}`, `telefone=${CEL}`]) {
      const res = await call('u-balcaoA', 'GET', `${B('clube-a')}/pessoa?${filtro}`)
      expect(res.status).toBe(200)
      expect(res.body.data.lead).toBeNull()
      expect(res.body.data.nome).toBeNull()
      expect(res.body.data.leadAberto).toEqual({ existe: true, etapa: 'negociacao', proprio: false })
      const texto = JSON.stringify(res.body.data)
      for (const vazamento of ['Segredo', 'VIP', 'segredo@exemplo.com', ID.vendedorA, 'Vendedor do Clube A', CPF, CEL]) {
        expect(texto, vazamento).not.toContain(vazamento)
      }
    }
  })

  it('a busca é filtrada em SQL: só casa CPF e celular exatos (dígitos), ignorando clubes e leads fechados', async () => {
    semearLead(mem(), schema, { id: uid(6007), scope: 'tenant', tenantId: CLUBE_A.id, tipo: 'pessoa', nome: 'Outra', agenteId: ID.balcaoA, etapa: 'novo', documento: CPF2, telefone: '21911112222' } as never)
    const mascarado = await call('u-balcaoA', 'GET', `${B('clube-a')}/pessoa?documento=529.982.247-25`)
    expect(mascarado.body.data.lead).toBeNull()
    const outro = await call('u-balcaoA', 'GET', `${B('clube-a')}/pessoa?documento=111.444.777-35`)
    expect(outro.body.data.lead).toMatchObject({ id: uid(6007) })
  })
})

describe('balcão: atendimentos', () => {
  it('assinou: cria lead balcão, chama o checkout (pix por padrão) e grava a assinatura', async () => {
    const res = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, ASSINAR)
    expect(res.status).toBe(201)
    const { atendimento, lead, checkout } = res.body.data
    expect(atendimento).toMatchObject({
      agenteId: ID.balcaoA,
      unidadeId: UNIDADE,
      resultado: 'assinou',
      resultadoLabel: 'Assinou',
      valorTabela: 300,
      descontoPercentual: 40,
      valorComPlano: 180,
      assinaturaId: ASSINATURA,
      documento: CPF,
    })
    expect(checkout).toMatchObject({ subscriptionId: ASSINATURA, session: null })
    expect(lead).toMatchObject({ origem: 'balcao', agenteId: ID.balcaoA, id: atendimento.leadId })
    expect(checkoutMock.checkout).toHaveBeenCalledTimes(1)
    const [, payload] = checkoutMock.checkout.mock.calls[0]!
    expect(payload).toMatchObject({ planId: PLANO_PLUS, payment: { method: 'pix' }, holder: { cpf: CPF, email: 'maria@exemplo.com', birthDate: '1985-04-10' } })
    expect(eventosDe(atendimento.leadId).map(e => e.tipo)).toContain('atendimento_balcao')
    expect(atendimentosDb()).toHaveLength(1)
  })

  it('assinou com boleto repassa a forma de pagamento', async () => {
    const res = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { ...ASSINAR, formaPagamento: 'boleto' })
    expect(res.status).toBe(201)
    expect(checkoutMock.checkout.mock.calls[0]![1]).toMatchObject({ payment: { method: 'boleto' } })
  })

  it('vai_pensar: lead em_contato com próximo passo em 2 dias e evento com os dados', async () => {
    const res = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { nome: 'Ana', telefone: CEL, servico: 'Exame de sangue', valorTabela: 100, planoId: PLANO_BASICO, resultado: 'vai_pensar' })
    expect(res.status).toBe(201)
    const { atendimento, lead, checkout } = res.body.data
    expect(checkout).toBeNull()
    expect(lead).toMatchObject({ origem: 'balcao', etapa: 'em_contato', agenteId: ID.balcaoA, proximoPasso: 'Retomar contato do balcão' })
    const dias = (new Date(lead.proximoPassoEm).getTime() - Date.now()) / 86_400_000
    expect(dias).toBeGreaterThan(1.9)
    expect(dias).toBeLessThan(2.1)
    const evento = eventosDe(atendimento.leadId).find(e => e.tipo === 'atendimento_balcao')!
    expect(evento.dados).toEqual({ servico: 'Exame de sangue', valorTabela: 100, desconto: 30, planoId: PLANO_BASICO })
    expect(atendimento).toMatchObject({ descontoPercentual: 30, valorComPlano: 70 })
    expect(checkoutMock.checkout).not.toHaveBeenCalled()
  })

  it('recusou: lead perdido com motivo (observações ou padrão)', async () => {
    const base = { nome: 'Pedro', documento: CPF2, servico: 'Consulta', valorTabela: 150, planoId: PLANO_BASICO, resultado: 'recusou' }
    const a = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { ...base, observacoes: 'Achou caro' })
    expect(a.body.data.lead).toMatchObject({ etapa: 'perdido', motivoPerda: 'Achou caro' })
    const b = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { ...base, documento: CPF, nome: 'Paulo' })
    expect(b.body.data.lead).toMatchObject({ etapa: 'perdido', motivoPerda: 'Não quis no balcão' })
  })

  it('ja_associado e so_informacao não criam lead', async () => {
    for (const resultado of ['ja_associado', 'so_informacao']) {
      const res = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { nome: 'Carlos', servico: 'Consulta', valorTabela: 100, resultado })
      expect(res.status).toBe(201)
      expect(res.body.data.lead).toBeNull()
      expect(res.body.data.checkout).toBeNull()
      expect(res.body.data.atendimento).toMatchObject({ leadId: null, resultado, descontoPercentual: 0, valorComPlano: 100 })
    }
    expect(leadsDoTenant(CLUBE_A.id)).toHaveLength(0)
  })

  it('valida: assinou sem plano/documento/telefone e vai_pensar sem telefone dão 422', async () => {
    const semPlano = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { ...ASSINAR, planoId: undefined })
    expect(semPlano.status).toBe(422)
    expect(semPlano.body.error.code).toBe('VENDAS_ATENDIMENTO_INVALIDO')
    const semDoc = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { ...ASSINAR, documento: undefined })
    expect(semDoc.status).toBe(422)
    const semTel = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { ...ASSINAR, telefone: undefined })
    expect(semTel.status).toBe(422)
    const pensar = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { nome: 'Ana', servico: 'Consulta', valorTabela: 100, resultado: 'vai_pensar' })
    expect(pensar.status).toBe(422)
    expect(pensar.body.error.code).toBe('VENDAS_ATENDIMENTO_INVALIDO')
    expect(atendimentosDb()).toHaveLength(0)
    expect(checkoutMock.checkout).not.toHaveBeenCalled()
    // plano de outro clube
    const outroPlano = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { ...ASSINAR, planoId: PLANO_B })
    expect(outroPlano.status).toBe(404)
  })

  it('master sem perfil de agente não registra atendimento', async () => {
    const res = await call('admin-a', 'POST', `${B('clube-a')}/atendimentos`, { nome: 'Ana', servico: 'Consulta', valorTabela: 100, resultado: 'so_informacao' })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('VENDAS_SEM_PERFIL')
  })

  it('reaproveita o próprio lead aberto (mesmo documento): não duplica', async () => {
    semearLead(mem(), schema, { id: uid(6003), scope: 'tenant', tenantId: CLUBE_A.id, tipo: 'pessoa', nome: 'Maria da Silva', agenteId: ID.balcaoA, etapa: 'em_contato', documento: CPF } as never)
    const res = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { ...ASSINAR, telefone: CEL })
    expect(res.status).toBe(201)
    expect(res.body.data.atendimento.leadId).toBe(uid(6003))
    expect(leadsDoTenant(CLUBE_A.id)).toHaveLength(1)
    expect(leadRow(uid(6003))).toMatchObject({ email: 'maria@exemplo.com', telefone: CEL })
    expect(leadRow(uid(6003)).dados.dataNascimento).toBe('1985-04-10')
    expect(checkoutMock.checkout).toHaveBeenCalledTimes(1)
  })

  it('lead aberto de outro dono (vai_pensar): só registra o evento e não muda o dono', async () => {
    semearLead(mem(), schema, { id: uid(6004), scope: 'tenant', tenantId: CLUBE_A.id, tipo: 'pessoa', nome: 'Joana', agenteId: ID.vendedorA, etapa: 'novo', telefone: CEL } as never)
    const res = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { nome: 'Joana', telefone: CEL, servico: 'Consulta', valorTabela: 100, planoId: PLANO_PLUS, resultado: 'vai_pensar' })
    expect(res.status).toBe(201)
    expect(res.body.data.atendimento.leadId).toBe(uid(6004))
    // O lead de outro dono não volta na resposta.
    expect(res.body.data.lead).toBeNull()
    expect(leadsDoTenant(CLUBE_A.id)).toHaveLength(1)
    expect(leadRow(uid(6004))).toMatchObject({ agenteId: ID.vendedorA, etapa: 'novo', proximoPasso: null })
    expect(eventosDe(uid(6004)).map(e => e.tipo)).toEqual(['atendimento_balcao'])
  })

  it('lead de outro dono que assina no balcão: usa o lead existente sem trocar o dono', async () => {
    semearLead(mem(), schema, { id: uid(6005), scope: 'tenant', tenantId: CLUBE_A.id, tipo: 'pessoa', nome: 'Maria da Silva', agenteId: ID.vendedorA, etapa: 'em_contato', documento: CPF } as never)
    const res = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, ASSINAR)
    expect(res.status).toBe(201)
    expect(res.body.data.atendimento.leadId).toBe(uid(6005))
    expect(leadRow(uid(6005)).agenteId).toBe(ID.vendedorA)
    expect(leadsDoTenant(CLUBE_A.id)).toHaveLength(1)
    expect(checkoutMock.checkout.mock.calls[0]![4]).toMatchObject({ lead: uid(6005), ref: 'CLA0001' })
  })
})

describe('balcão: hoje e histórico', () => {
  async function registrar(token: string, corpo: Record<string, unknown>) {
    const res = await call(token, 'POST', `${B('clube-a')}/atendimentos`, corpo)
    expect(res.status).toBe(201)
    return res.body.data
  }

  it('contadores do dia, economia média, meta do dia e lista (mais recentes primeiro)', async () => {
    await registrar('u-balcaoA', { ...ASSINAR, valorTabela: 300 }) // plus 40%: economia 120
    await registrar('u-balcaoA', { nome: 'Ana', telefone: CEL, servico: 'Exame', valorTabela: 100, planoId: PLANO_BASICO, resultado: 'vai_pensar' }) // 30%: economia 30
    await registrar('u-balcaoA', { nome: 'Rui', servico: 'Informação', valorTabela: 50, resultado: 'so_informacao' })
    await registrar('u-balcaoA2', { nome: 'Outro', servico: 'Consulta', valorTabela: 80, resultado: 'so_informacao' })

    const res = await call('u-balcaoA', 'GET', `${B('clube-a')}/hoje`)
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(d.agente).toEqual({ id: ID.balcaoA, nome: 'Balcão A', unidade: { id: UNIDADE, nome: 'Clínica Centro', tipo: 'clinica' } })
    expect(d.totais).toEqual({ atendimentos: 3, ofertas: 2, adesoes: 1, vaiPensar: 1, economiaMedia: 75, ticketMedioEconomia: 75 })
    expect(d.metaDia).toBe(10)
    expect(d.atendimentos).toHaveLength(3)
    expect(d.atendimentos[0]).toMatchObject({ nome: 'Rui', resultadoLabel: RESULTADO_BALCAO_LABELS.so_informacao, agenteNome: 'Balcão A' })

    // outro atendente: só os dele; sem meta
    const outro = await call('u-balcaoA2', 'GET', `${B('clube-a')}/hoje`)
    expect(outro.body.data.totais.atendimentos).toBe(1)
    expect(outro.body.data.metaDia).toBeNull()
    expect(outro.body.data.agente.unidade).toBeNull()

    // master vê o clube todo
    const master = await call('admin-a', 'GET', `${B('clube-a')}/hoje`)
    expect(master.body.data.totais.atendimentos).toBe(4)
    expect(master.body.data.agente).toBeNull()
    // clube B não vê nada
    const b = await call('admin-b', 'GET', `${B('clube-b')}/hoje`)
    expect(b.body.data.totais.atendimentos).toBe(0)
  })

  it('histórico: só os do agente, filtros por resultado e dia, paginação; master filtra por agente', async () => {
    await registrar('u-balcaoA', { nome: 'Rui', servico: 'Informação', valorTabela: 50, resultado: 'so_informacao' })
    await registrar('u-balcaoA', { nome: 'Sol', servico: 'Informação', valorTabela: 50, resultado: 'ja_associado' })
    await registrar('u-balcaoA2', { nome: 'Outro', servico: 'Consulta', valorTabela: 80, resultado: 'so_informacao' })
    // atendimento antigo (ontem)
    mem().insertRow(schema.vendasAtendimentosBalcao, { tenantId: CLUBE_A.id, agenteId: ID.balcaoA, nome: 'Antigo', servico: 'Consulta', valorTabela: '10', valorComPlano: '10', resultado: 'recusou', createdAt: new Date(Date.now() - 2 * 86_400_000) })

    const todos = await call('u-balcaoA', 'GET', `${B('clube-a')}/atendimentos`)
    expect(todos.body.meta.total).toBe(3)
    expect(todos.body.data.map((a: { nome: string }) => a.nome).sort()).toEqual(['Antigo', 'Rui', 'Sol'])
    expect(todos.body.data[2].nome).toBe('Antigo')
    const filtro = await call('u-balcaoA', 'GET', `${B('clube-a')}/atendimentos?resultado=ja_associado`)
    expect(filtro.body.data.map((a: { nome: string }) => a.nome)).toEqual(['Sol'])
    const dia = await call('u-balcaoA', 'GET', `${B('clube-a')}/atendimentos?dia=${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })}`)
    expect(dia.body.meta.total).toBe(2)
    const pagina = await call('u-balcaoA', 'GET', `${B('clube-a')}/atendimentos?perPage=1&page=2`)
    expect(pagina.body.meta).toMatchObject({ page: 2, perPage: 1, total: 3, totalPages: 3 })

    const master = await call('admin-a', 'GET', `${B('clube-a')}/atendimentos`)
    expect(master.body.meta.total).toBe(4)
    const doA2 = await call('admin-a', 'GET', `${B('clube-a')}/atendimentos?agente=${uid(234)}`)
    expect(doA2.body.data.map((a: { nome: string }) => a.nome)).toEqual(['Outro'])
    // o balcão ignora o filtro de agente (continua só nos seus)
    const ignora = await call('u-balcaoA', 'GET', `${B('clube-a')}/atendimentos?agente=${uid(234)}`)
    expect(ignora.body.meta.total).toBe(3)
    // clube B não enxerga
    expect((await call('admin-b', 'GET', `${B('clube-b')}/atendimentos`)).body.meta.total).toBe(0)
  })
})

describe('balcão: atendimento atômico e idempotente', () => {
  const PENSAR = { nome: 'Ana Souza', telefone: CEL, servico: 'Consulta', valorTabela: 100, planoId: PLANO_PLUS, resultado: 'vai_pensar' }

  it('mesmo atendimento repetido em 60 s devolve o já gravado (duplo clique não duplica)', async () => {
    const primeira = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, PENSAR)
    const segunda = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, PENSAR)
    expect(primeira.status).toBe(201)
    expect(segunda.status).toBe(201)
    expect(segunda.body.data.atendimento.id).toBe(primeira.body.data.atendimento.id)
    expect(atendimentosDb()).toHaveLength(1)
    expect(leadsDoTenant(CLUBE_A.id)).toHaveLength(1)
    const eventos = eventosDe(primeira.body.data.atendimento.leadId).map(e => e.tipo)
    expect(eventos.filter(t => t === 'atendimento_balcao')).toHaveLength(1)
    // resultado diferente não é repetição
    const recusou = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { ...PENSAR, resultado: 'recusou' })
    expect(recusou.body.data.atendimento.id).not.toBe(primeira.body.data.atendimento.id)
    expect(atendimentosDb()).toHaveLength(2)
  })

  it('depois de 60 s o mesmo atendimento é um registro novo', async () => {
    await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, PENSAR)
    atendimentosDb()[0]!.createdAt = new Date(Date.now() - 120_000)
    const outra = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, PENSAR)
    expect(outra.status).toBe(201)
    expect(atendimentosDb()).toHaveLength(2)
  })

  it('outro atendente não reaproveita o atendimento alheio', async () => {
    await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, PENSAR)
    const outro = await call('u-balcaoA2', 'POST', `${B('clube-a')}/atendimentos`, PENSAR)
    expect(outro.status).toBe(201)
    expect(atendimentosDb()).toHaveLength(2)
  })

  it('erro ao gravar o atendimento desfaz o lead e os eventos (tudo ou nada)', async () => {
    falha.gravarAtendimento = true
    const res = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, PENSAR)
    expect(res.status).toBe(500)
    expect(atendimentosDb()).toHaveLength(0)
    expect(leadsDoTenant(CLUBE_A.id)).toHaveLength(0)
    expect(mem().rows(schema.vendasLeadEventos)).toHaveLength(0)
    // sem a falha, a mesma chamada passa e grava tudo junto
    falha.gravarAtendimento = false
    const ok = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, PENSAR)
    expect(ok.status).toBe(201)
    expect(atendimentosDb()).toHaveLength(1)
    expect(leadsDoTenant(CLUBE_A.id)).toHaveLength(1)
    expect(eventosDe(ok.body.data.atendimento.leadId).map(e => e.tipo)).toEqual(['criado', 'atendimento_balcao', 'etapa', 'proximo_passo'])
  })

  it('recusou num lead próprio que mudou de etapa no meio: 422 e nada fica gravado', async () => {
    semearLead(mem(), schema, { id: uid(6010), scope: 'tenant', tenantId: CLUBE_A.id, tipo: 'pessoa', nome: 'Ana Souza', agenteId: ID.balcaoA, etapa: 'em_contato', telefone: CEL } as never)
    falha.mudarEtapaNoMeio = true
    const res = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { ...PENSAR, resultado: 'recusou' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VENDAS_TRANSICAO_INVALIDA')
    expect(atendimentosDb()).toHaveLength(0)
    expect(eventosDe(uid(6010))).toHaveLength(0)
    expect(leadRow(uid(6010))).toMatchObject({ etapa: 'em_contato', ultimoContatoEm: null, motivoPerda: null })
  })

  it('recusou grava lead, evento, perda e atendimento juntos', async () => {
    const res = await call('u-balcaoA', 'POST', `${B('clube-a')}/atendimentos`, { ...PENSAR, resultado: 'recusou', observacoes: 'Achou caro' })
    expect(res.status).toBe(201)
    const leadId = res.body.data.atendimento.leadId
    expect(leadRow(leadId)).toMatchObject({ etapa: 'perdido', motivoPerda: 'Achou caro', agenteId: ID.balcaoA, origem: 'balcao' })
    expect(res.body.data.lead).toMatchObject({ id: leadId, etapa: 'perdido' })
    expect(eventosDe(leadId).map(e => e.tipo)).toEqual(['criado', 'atendimento_balcao', 'etapa', 'etapa'])
  })
})
