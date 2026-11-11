import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLUBE_A, ID, semearConfig, semearLead, semearRede, uid } from './helpers/vendas-world'

/**
 * Correções de atribuição (banco em memória):
 *  - A2: agente inativo não recebe atribuição nem pelo cadastro legado (`platform_sellers`);
 *  - M1: auto-compra (CPF/e-mail/telefone do titular = agente) não atribui nem vincula;
 *  - M2: `?lead=` público só vale com `ref` do dono, CPF do titular batendo com o lead e dono ativo;
 *  - M5: sincronizar o lead com a proposta roda em savepoint (erro SQL não derruba a transação).
 */

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
      schema.platformSellers,
      schema.platformOnboardingProposals,
      schema.notifications,
    ],
    uniques: [{ table: schema.notifications, keys: ['audience', 'dedupeKey'] }],
  })
  memory.db = instance as unknown as Record<string, unknown>
  return { db: instance.db, sql: { end: async () => {} }, schema }
})
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}), recordSystemAudit: vi.fn(async () => {}) }))

const schema = await import('@/db/schema')
const { prepararAtribuicaoDoCheckout, vincularAssinaturaAoLead, sincronizarLeadComProposta } = await import('@/modules/vendas-rede/conversao-sync')
const { resolveReferral } = await import('@/modules/platform-sales/referral')
const { nomeDoVendedorPorCodigo } = await import('@/modules/vendas-rede/intake.service')

type Memory = import('./helpers/memory-db').MemoryDb
const mem = () => memory.db as unknown as Memory
const leads = () => mem().rows(schema.vendasLeads)
const eventos = (leadId: string) => mem().rows(schema.vendasLeadEventos).filter(e => e.leadId === leadId)
const agente = (id: string) => mem().rows(schema.vendasAgentes).find(a => a.id === id)!

beforeEach(() => {
  mem().reset()
  semearRede(mem(), schema)
  semearConfig(mem(), schema, { scope: 'platform', tenantId: null })
  semearConfig(mem(), schema, { scope: 'tenant', tenantId: CLUBE_A.id })
  mem().insertRow(schema.organization, { id: CLUBE_A.id, name: CLUBE_A.name, slug: CLUBE_A.slug })
})

/** Cadastro antigo do vendedor (`platform_sellers`) ainda marcado como ativo. */
function legado(userId: string, referralCode: string, active = true) {
  const conta = mem().rows(schema.user).find(u => u.id === userId)
  if (conta) conta.role = 'platform_seller'
  mem().insertRow(schema.platformSellers, { userId, referralCode, active })
}

describe('A2 - agente inativo nao cai no cadastro legado', () => {
  it('código do agente inativo (legado ainda ativo, mesmo código em minúsculas) = sem atribuição', async () => {
    legado('u-vendedor1', 'ven0001')
    expect(await resolveReferral('ven0001')).toMatchObject({ agenteId: ID.vendedor1 })
    agente(ID.vendedor1).ativo = false
    expect(await resolveReferral('ven0001')).toBeNull()
    expect(await resolveReferral('VEN0001')).toBeNull()
  })

  it('código antigo de quem já tem agente (código diferente) usa a linha nova: inativo = sem atribuição; ativo = agente', async () => {
    legado('u-vendedor1', 'vendedor-um')
    expect(await resolveReferral('vendedor-um')).toMatchObject({ agenteId: ID.vendedor1, referralCode: 'VEN0001' })
    agente(ID.vendedor1).ativo = false
    expect(await resolveReferral('vendedor-um')).toBeNull()
  })

  it('o legado só vale quando NÃO existe agente da Rede Comercial', async () => {
    mem().insertRow(schema.user, { id: 'u-antigo', name: 'Antigo', email: 'antigo@x.org', banned: false, role: 'platform_seller' })
    mem().insertRow(schema.platformSellers, { userId: 'u-antigo', referralCode: 'antigo', active: true })
    const ref = await resolveReferral('antigo')
    expect(ref).toMatchObject({ userId: 'u-antigo', referralCode: 'antigo' })
    expect(ref?.agenteId).toBeUndefined()
  })

  it('o lookup público do nome (`/ref/:codigo`) também não cai no legado quando o agente está inativo', async () => {
    legado('u-vendedor1', 'ven0001')
    expect(await nomeDoVendedorPorCodigo('VEN0001')).toEqual({ nomeVendedor: 'Vendedor Um' })
    agente(ID.vendedor1).ativo = false
    await expect(nomeDoVendedorPorCodigo('VEN0001')).rejects.toMatchObject({ code: 'VENDAS_CODIGO_INVALIDO' })
  })
})

describe('M1 - auto-compra na atribuicao', () => {
  const plano = { id: uid(3001), name: 'Clube Plus' }
  const titular = (extra: Record<string, unknown> = {}) => ({ name: 'Vendedor do Clube', email: 'x@x.org', phone: '21977776666', cpf: '52998224725', ...extra })

  it('checkout público por ref: CPF, e-mail ou telefone do agente = sem atribuição e sem lead novo', async () => {
    agente(ID.vendedorA).cpf = '11144477735'
    agente(ID.vendedorA).telefone = '(21) 91111-2222'
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { ref: 'CLA0001' }, titular({ cpf: '111.444.777-35' }), plano)).toBeNull()
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { ref: 'CLA0001' }, titular({ email: 'U-VENDEDORA@teste.com' }), plano)).toBeNull()
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { ref: 'CLA0001' }, titular({ phone: '21911112222' }), plano)).toBeNull()
    expect(leads()).toHaveLength(0)
    // outro comprador continua atribuído
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { ref: 'CLA0001' }, titular(), plano)).toMatchObject({ agenteId: ID.vendedorA })
  })

  it('com ?lead= do próprio agente comprando: sem atribuição e evento no lead', async () => {
    semearLead(mem(), schema, { id: uid(601), scope: 'tenant', tenantId: CLUBE_A.id, agenteId: ID.vendedorA } as never)
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { lead: uid(601) }, titular({ email: 'u-vendedorA@teste.com' }), plano)).toBeNull()
    expect(eventos(uid(601)).map(e => [e.tipo, (e.dados as Record<string, unknown>).motivoNaoComissionavel])).toEqual([['sistema', 'auto_compra']])
  })

  it('vincularAssinaturaAoLead com titular = dono do lead: não grava snapshot nem avança, só o evento', async () => {
    semearLead(mem(), schema, { id: uid(601), scope: 'tenant', tenantId: CLUBE_A.id, agenteId: ID.vendedorA, etapa: 'em_contato' } as never)
    await vincularAssinaturaAoLead(uid(601), {
      id: uid(8001),
      status: 'pending_payment',
      planoId: plano.id,
      planoNome: plano.name,
      titular: { cpf: '52998224725', email: 'U-VENDEDORA@teste.com', telefone: null },
    })
    const lead = leads().find(l => l.id === uid(601))!
    expect(lead.etapa).toBe('em_contato')
    expect(lead.atribuicao).toBeNull()
    expect(lead.conversao).toBeNull()
    expect(eventos(uid(601)).map(e => e.tipo)).toEqual(['sistema'])
  })

  it('contratação pública indicada: contato do responsável igual ao agente = ignora o código', async () => {
    expect(await resolveReferral('VEN0001', { email: 'x@x.org', telefone: '11999990000' })).toMatchObject({ agenteId: ID.vendedor1 })
    expect(await resolveReferral('VEN0001', { email: 'U-VENDEDOR1@teste.com', telefone: '11999990000' })).toBeNull()
  })
})

describe('M2 - ?lead= publico nao atribui a quem tem so o UUID', () => {
  const plano = { id: uid(3001), name: 'Clube Plus' }
  const titular = { name: 'Ana Souza', email: 'ana@x.org', phone: '21977776666', cpf: '52998224725' }
  const novoAgenteDoClube = () => {
    mem().insertRow(schema.user, { id: 'u-vendedorA2', name: 'Outro do Clube A', email: 'a2@teste.com', banned: false })
    return mem().insertRow(schema.vendasAgentes, {
      id: uid(240),
      scope: 'tenant',
      tenantId: CLUBE_A.id,
      userId: 'u-vendedorA2',
      papel: 'vendedor',
      nome: 'Outro do Clube A',
      codigoIndicacao: 'CLA0002',
      ativo: true,
    })
  }

  it('lead com dono + ref de OUTRO agente: ignora o lead e usa o ref (lead novo do dono do ref)', async () => {
    novoAgenteDoClube()
    semearLead(mem(), schema, { id: uid(601), scope: 'tenant', tenantId: CLUBE_A.id, agenteId: ID.vendedorA } as never)
    const r = await prepararAtribuicaoDoCheckout(CLUBE_A.id, { lead: uid(601), ref: 'CLA0002' }, titular, plano)
    expect(r).toMatchObject({ agenteId: uid(240) })
    expect(r!.leadId).not.toBe(uid(601))
  })

  it('lead com dono + ref do próprio dono vale', async () => {
    semearLead(mem(), schema, { id: uid(601), scope: 'tenant', tenantId: CLUBE_A.id, agenteId: ID.vendedorA } as never)
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { lead: uid(601), ref: 'cla0001' }, titular, plano)).toEqual({ agenteId: ID.vendedorA, leadId: uid(601) })
  })

  it('lead com documento diferente do CPF do titular é ignorado (e usa o ref, se houver)', async () => {
    semearLead(mem(), schema, { id: uid(601), scope: 'tenant', tenantId: CLUBE_A.id, agenteId: ID.vendedorA, documento: '11144477735' } as never)
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { lead: uid(601) }, titular, plano)).toBeNull()
    const comRef = await prepararAtribuicaoDoCheckout(CLUBE_A.id, { lead: uid(601), ref: 'CLA0001' }, titular, plano)
    expect(comRef).toMatchObject({ agenteId: ID.vendedorA })
    expect(comRef!.leadId).not.toBe(uid(601))
    // mesmo CPF (com máscara no lead) vale
    leads().find(l => l.id === uid(601))!.documento = '529.982.247-25'
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { lead: uid(601) }, titular, plano)).toEqual({ agenteId: ID.vendedorA, leadId: uid(601) })
  })

  it('lead sem dono (pool) usa o ref; dono inativo: o lead não atribui', async () => {
    semearLead(mem(), schema, { id: uid(602), scope: 'tenant', tenantId: CLUBE_A.id, agenteId: null } as never)
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { lead: uid(602), ref: 'CLA0001' }, titular, plano)).toEqual({ agenteId: ID.vendedorA, leadId: uid(602) })
    semearLead(mem(), schema, { id: uid(603), scope: 'tenant', tenantId: CLUBE_A.id, agenteId: ID.vendedorA } as never)
    agente(ID.vendedorA).ativo = false
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { lead: uid(603) }, titular, plano)).toBeNull()
    expect(await prepararAtribuicaoDoCheckout(CLUBE_A.id, { lead: uid(603), ref: 'CLA0001' }, titular, plano)).toBeNull()
  })
})

describe('M5 - sincronizar lead x proposta em savepoint', () => {
  it('erro SQL no sincronizar não propaga e roda dentro de um savepoint (transaction aninhada)', async () => {
    semearLead(mem(), schema, { id: uid(701), agenteId: ID.vendedor1, etapa: 'em_contato' })
    const chamadas: string[] = []
    const base = mem().db as Record<string, any>
    const quebrado: Record<string, any> = {
      select: base.select,
      insert: base.insert,
      update: () => {
        throw new Error('erro SQL simulado')
      },
      transaction: async (work: (sp: unknown) => Promise<unknown>) => {
        chamadas.push('savepoint')
        return work(quebrado)
      },
    }
    await expect(sincronizarLeadComProposta(quebrado as never, { id: uid(7001), status: 'submitted', vendasLeadId: uid(701) })).resolves.toBeUndefined()
    expect(chamadas).toEqual(['savepoint'])
  })

  it('o caminho feliz continua atualizando o lead pelo savepoint', async () => {
    semearLead(mem(), schema, { id: uid(701), agenteId: ID.vendedor1, etapa: 'em_contato' })
    await sincronizarLeadComProposta(mem().db as never, { id: uid(7001), status: 'submitted', vendasLeadId: uid(701) })
    expect(leads().find(l => l.id === uid(701))!.etapa).toBe('negociacao')
  })
})
