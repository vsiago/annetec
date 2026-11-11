import { activationChargeItems, sumChargeItems } from '@annetec/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Correções de dinheiro e atribuição no gancho de comissão (`comissoes.service`), banco em memória:
 *  - A1: o gancho usa SÓ o `tx` recebido (o `db` global fica travado durante o teste);
 *  - A4: snapshot de atribuição de outro agente (lead reatribuído) é descartado: comissão vai ao agente atual;
 *  - M1: auto-compra (CPF, e-mail ou telefone do comprador = agente) não gera comissão;
 *  - M4: a adesão do clube vem da 1ª cobrança criada, não do ordinal das pagas (estorno da 1ª).
 */

const memory = vi.hoisted(() => ({ instance: null as null | Record<string, any>, travado: false }))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createMemoryDb } = await import('./helpers/memory-db')
  const instance = createMemoryDb({
    tables: [
      schema.user,
      schema.vendasConfig,
      schema.vendasCorretoras,
      schema.vendasEquipes,
      schema.vendasAgentes,
      schema.vendasLeads,
      schema.vendasLeadEventos,
      schema.vendasComissoes,
      schema.platformOnboardingProposals,
      schema.platformCharges,
      schema.clubSubscriptions,
      schema.clubCharges,
      schema.auditLogs,
    ],
    uniques: [
      { table: schema.vendasComissoes, keys: ['cobrancaOrigem', 'cobrancaRef', 'tipo', 'parte', 'beneficiarioAgenteId'], where: row => row.parte !== 'corretora' },
      { table: schema.vendasComissoes, keys: ['cobrancaOrigem', 'cobrancaRef', 'tipo', 'parte', 'beneficiarioCorretoraId'], where: row => row.parte === 'corretora' },
    ],
  })
  memory.instance = instance as unknown as Record<string, any>
  // `db` global: quando travado, QUALQUER uso dentro do gancho falha (a transação de pagamento já ocupa a conexão).
  const travavel = new Proxy(instance.db, {
    get(alvo, prop) {
      if (memory.travado && ['select', 'insert', 'update', 'delete', 'transaction', 'execute'].includes(String(prop))) {
        throw new Error(`db global tocado durante o gancho (${String(prop)})`)
      }
      return alvo[prop as string]
    },
  })
  return { db: travavel }
})

const schema = await import('@/db/schema')
const service = await import('@/modules/vendas-rede/comissoes.service')

type Mem = ReturnType<typeof import('./helpers/memory-db').createMemoryDb>
const mem = () => memory.instance as unknown as Mem
const tx = () => mem().db as never
const insert = (table: object, values: Record<string, unknown>) => mem().insertRow(table, values) as Record<string, any>
const rows = (table: object) => mem().rows(table) as Record<string, any>[]

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ID = {
  corretora1: uid(1),
  corretora2: uid(2),
  equipe1: uid(11),
  equipe2: uid(12),
  gerente1: uid(21),
  supervisor1: uid(22),
  vendedorA: uid(23),
  gerente2: uid(24),
  supervisor2: uid(25),
  vendedorB: uid(26),
  lead: uid(101),
  leadClube: uid(102),
  propostaLead: uid(201),
  propostaAuto: uid(202),
  assinatura: uid(301),
  agenteClube: uid(31),
}
const PAID_AT = new Date('2026-10-30T14:00:00Z')
const AGORA = new Date('2026-11-02T12:00:00Z')
const PROFISSIONAL = { name: 'Profissional', priceMonthly: 697 }

function agente(id: string, papel: string, extra: Record<string, unknown> = {}) {
  insert(schema.user, { id: `user-${id}`, name: `Agente ${id.slice(-2)}`, email: `${id.slice(-2)}@agentes.test`, banned: false })
  return insert(schema.vendasAgentes, {
    id,
    scope: 'platform',
    tenantId: null,
    userId: `user-${id}`,
    papel,
    nome: `Agente ${id.slice(-2)}`,
    codigoIndicacao: `C${id.slice(-5)}`,
    ativo: true,
    ...extra,
  })
}

function seedConfig() {
  insert(schema.vendasConfig, {
    scope: 'platform',
    tenantId: null,
    escalaMensal: [100, 50, 25],
    percentualAdesao: '50.00',
    overrides: { supervisor: 10, gerente: 5, corretora: 5 },
    balcaoPercentual: null,
  })
}

function seedRede(comConfig = true) {
  insert(schema.vendasCorretoras, { id: ID.corretora1, scope: 'platform', tenantId: null, nomeFantasia: 'Corretora 1', gerenteAgenteId: ID.gerente1 })
  insert(schema.vendasCorretoras, { id: ID.corretora2, scope: 'platform', tenantId: null, nomeFantasia: 'Corretora 2', gerenteAgenteId: ID.gerente2 })
  insert(schema.vendasEquipes, { id: ID.equipe1, scope: 'platform', tenantId: null, corretoraId: ID.corretora1, nome: 'Equipe 1', supervisorAgenteId: ID.supervisor1 })
  insert(schema.vendasEquipes, { id: ID.equipe2, scope: 'platform', tenantId: null, corretoraId: ID.corretora2, nome: 'Equipe 2', supervisorAgenteId: ID.supervisor2 })
  agente(ID.gerente1, 'gerente', { corretoraId: ID.corretora1 })
  agente(ID.supervisor1, 'supervisor', { corretoraId: ID.corretora1, equipeId: ID.equipe1 })
  agente(ID.vendedorA, 'vendedor', { corretoraId: ID.corretora1, equipeId: ID.equipe1 })
  agente(ID.gerente2, 'gerente', { corretoraId: ID.corretora2 })
  agente(ID.supervisor2, 'supervisor', { corretoraId: ID.corretora2, equipeId: ID.equipe2 })
  agente(ID.vendedorB, 'vendedor', { corretoraId: ID.corretora2, equipeId: ID.equipe2 })
  if (comConfig) seedConfig()
}

function ativacao(proposalId: string, paidAt = PAID_AT) {
  const items = activationChargeItems(PROFISSIONAL, { setupFee: 990 }, { setupFeePercent: 50, monthlyPercent: 20 })
  const amount = String(sumChargeItems(items))
  return insert(schema.platformCharges, { proposalId, kind: 'activation', amount, paidAmount: amount, paidAt, items, status: 'paid', organizationId: null })
}

const registrarPlatform = (cobranca: unknown) =>
  service.registrarComissoesDaCobrancaPaga({ origem: 'platform', cobranca: cobranca as never, agora: AGORA, tx: tx() })
const registrarClub = (cobranca: unknown) => service.registrarComissoesDaCobrancaPaga({ origem: 'club', cobranca: cobranca as never, agora: AGORA, tx: tx() })
const comissoes = () => rows(schema.vendasComissoes)

beforeEach(() => {
  memory.travado = false
  mem().reset()
})

describe('A1 - o gancho usa so o tx', () => {
  it('registrar comissões (inclusive criar a config padrão) não toca o db global', async () => {
    seedRede(false) // sem config no escopo: `getOrCreateConfig` precisa ler E inserir pelo tx
    insert(schema.platformOnboardingProposals, { id: ID.propostaLead, vendasAgenteId: ID.vendedorA, vendasLeadId: ID.lead, sellerUserId: null })
    insert(schema.vendasLeads, { id: ID.lead, scope: 'platform', tenantId: null, nome: 'Clínica', etapa: 'negociacao', agenteId: ID.vendedorA })
    const cobranca = ativacao(ID.propostaLead)
    memory.travado = true
    expect(await registrarPlatform(cobranca)).toBeGreaterThan(0)
    memory.travado = false
    expect(rows(schema.vendasConfig)).toHaveLength(1)
    expect(rows(schema.vendasLeads)[0]!.etapa).toBe('ganho')
  })

  it('estornar também só usa o tx', async () => {
    seedRede()
    insert(schema.platformOnboardingProposals, { id: ID.propostaLead, vendasAgenteId: ID.vendedorA, vendasLeadId: null, sellerUserId: null })
    const cobranca = ativacao(ID.propostaLead)
    await registrarPlatform(cobranca)
    memory.travado = true
    expect(await service.estornarComissoesDaCobranca('platform', cobranca.id, 'Estorno', AGORA, tx())).toBeGreaterThan(0)
    memory.travado = false
    expect(comissoes().every(c => c.status === 'cancelada')).toBe(true)
  })

  it('safely sobre o tx engole a falha sem tocar o db global', async () => {
    memory.travado = true
    await expect(
      service.safely(tx(), 'teste', async () => {
        throw new Error('falha')
      }),
    ).resolves.toBeUndefined()
  })
})

describe('A4 - snapshot de outro agente e descartado', () => {
  it('lead de A (com snapshot) reatribuído a B: a comissão vai para B e para a cadeia de B; a já paga de A não muda', async () => {
    seedRede()
    insert(schema.vendasLeads, {
      id: ID.lead,
      scope: 'platform',
      tenantId: null,
      nome: 'Clínica',
      etapa: 'negociacao',
      agenteId: ID.vendedorB,
      // Snapshot antigo: era do vendedor A.
      atribuicao: {
        agenteId: ID.vendedorA,
        papel: 'vendedor',
        equipeId: ID.equipe1,
        supervisorAgenteId: ID.supervisor1,
        unidadeId: null,
        corretoraId: ID.corretora1,
        gerenteAgenteId: ID.gerente1,
      },
    })
    insert(schema.platformOnboardingProposals, { id: ID.propostaLead, vendasAgenteId: ID.vendedorB, vendasLeadId: ID.lead, sellerUserId: null })
    // Comissão já registrada e paga ao A numa cobrança anterior.
    const anterior = insert(schema.vendasComissoes, {
      scope: 'platform',
      tenantId: null,
      leadId: ID.lead,
      beneficiarioAgenteId: ID.vendedorA,
      parte: 'vendedor',
      tipo: 'adesao',
      parcela: 1,
      cobrancaOrigem: 'platform',
      cobrancaRef: uid(999),
      base: '100',
      percentual: '50',
      valor: '50',
      status: 'paga',
      mesReferencia: '2026-09',
    })

    await registrarPlatform(ativacao(ID.propostaLead))

    const novas = comissoes().filter(c => c.id !== anterior.id)
    expect(novas.length).toBeGreaterThan(0)
    const beneficiarios = new Set(novas.map(c => c.beneficiarioAgenteId ?? `corretora:${c.beneficiarioCorretoraId}`))
    expect(beneficiarios).toEqual(new Set([ID.vendedorB, ID.supervisor2, ID.gerente2, `corretora:${ID.corretora2}`]))
    expect(novas.some(c => c.beneficiarioAgenteId === ID.vendedorA)).toBe(false)
    expect(anterior).toMatchObject({ beneficiarioAgenteId: ID.vendedorA, status: 'paga', valor: '50' })
    // O snapshot do lead passa a ser o de B.
    expect(rows(schema.vendasLeads)[0]!.atribuicao).toMatchObject({ agenteId: ID.vendedorB, supervisorAgenteId: ID.supervisor2 })
  })

  it('proposta ligada a lead sem agente novo NÃO volta ao vendedor legado (seller_user_id)', async () => {
    seedRede()
    insert(schema.vendasLeads, { id: ID.lead, scope: 'platform', tenantId: null, nome: 'Clínica', etapa: 'negociacao', agenteId: null })
    insert(schema.platformOnboardingProposals, { id: ID.propostaLead, vendasAgenteId: null, vendasLeadId: ID.lead, sellerUserId: `user-${ID.vendedorA}` })
    expect(await registrarPlatform(ativacao(ID.propostaLead))).toBe(0)
    expect(comissoes()).toHaveLength(0)
  })
})

describe('M1 - auto-compra no gancho', () => {
  it('CPF do titular igual ao do agente: sem comissão, auditado, evento no lead e lead ganho', async () => {
    seedRede()
    insert(schema.vendasLeads, { id: ID.leadClube, scope: 'tenant', tenantId: 'org-a', nome: 'Pessoa', etapa: 'negociacao', agenteId: ID.agenteClube })
    insert(schema.user, { id: 'user-clube', name: 'Vend Clube', email: 'vend@clube.test', banned: false })
    insert(schema.vendasAgentes, {
      id: ID.agenteClube,
      scope: 'tenant',
      tenantId: 'org-a',
      userId: 'user-clube',
      papel: 'vendedor',
      nome: 'Vend Clube',
      codigoIndicacao: 'CLU0001',
      ativo: true,
      cpf: '52998224725',
    })
    insert(schema.clubSubscriptions, {
      id: ID.assinatura,
      organizationId: 'org-a',
      vendasAgenteId: ID.agenteClube,
      vendasLeadId: ID.leadClube,
      enrollmentFee: '0',
      holderCpf: '529.982.247-25',
      holderEmail: 'outro@x.org',
      holderPhone: '11900000000',
    })
    const cobranca = insert(schema.clubCharges, {
      subscriptionId: ID.assinatura,
      organizationId: 'org-a',
      kind: 'cycle',
      amount: '200',
      paidAmount: '200',
      paidAt: PAID_AT,
      periodStart: '2026-10-30',
      status: 'paid',
    })
    expect(await registrarClub(cobranca)).toBe(0)
    expect(comissoes()).toHaveLength(0)
    expect(rows(schema.auditLogs).map(a => a.action)).toEqual(['vendas.comissao_bloqueada'])
    expect(rows(schema.auditLogs)[0]!.metadata).toMatchObject({ motivoNaoComissionavel: 'auto_compra' })
    const evento = rows(schema.vendasLeadEventos).find(e => e.tipo === 'sistema')!
    expect(evento.dados).toMatchObject({ motivoNaoComissionavel: 'auto_compra' })
  })

  it('e-mail (sem diferenciar maiúsculas) ou telefone (só dígitos) iguais também bloqueiam; outro comprador comissiona', async () => {
    seedRede()
    rows(schema.vendasAgentes).find(a => a.id === ID.vendedorA)!.telefone = '(11) 98888-7777'
    const emailDoAgente = `${ID.vendedorA.slice(-2)}@agentes.test`.toUpperCase()
    const porEmail = insert(schema.platformOnboardingProposals, {
      id: ID.propostaAuto,
      vendasAgenteId: ID.vendedorA,
      vendasLeadId: null,
      sellerUserId: null,
      applicant: { name: 'X', email: emailDoAgente, phone: '000' },
    })
    expect(await registrarPlatform(ativacao(porEmail.id))).toBe(0)
    const porTelefone = insert(schema.platformOnboardingProposals, {
      id: uid(203),
      vendasAgenteId: ID.vendedorA,
      vendasLeadId: null,
      sellerUserId: null,
      applicant: { name: 'X', email: 'x@x.org', phone: '11988887777' },
    })
    expect(await registrarPlatform(ativacao(porTelefone.id))).toBe(0)
    const outro = insert(schema.platformOnboardingProposals, {
      id: uid(204),
      vendasAgenteId: ID.vendedorA,
      vendasLeadId: null,
      sellerUserId: null,
      applicant: { name: 'X', email: 'cliente@x.org', phone: '11977776666' },
    })
    expect(await registrarPlatform(ativacao(outro.id))).toBeGreaterThan(0)
  })
})

describe('M4 - adesao do clube pela 1a cobranca criada, nao pelo ordinal das pagas', () => {
  function seedClube() {
    insert(schema.vendasAgentes, {
      id: ID.agenteClube,
      scope: 'tenant',
      tenantId: 'org-a',
      userId: 'user-clube',
      papel: 'vendedor',
      nome: 'Vend Clube',
      codigoIndicacao: 'CLU0001',
      ativo: true,
    })
    insert(schema.vendasConfig, {
      scope: 'tenant',
      tenantId: 'org-a',
      escalaMensal: [100, 50, 25],
      percentualAdesao: '10',
      overrides: { supervisor: 10, gerente: 5, corretora: 5 },
      balcaoPercentual: null,
    })
    insert(schema.clubSubscriptions, { id: ID.assinatura, organizationId: 'org-a', vendasAgenteId: ID.agenteClube, vendasLeadId: null, enrollmentFee: '100' })
  }
  const cobranca = (periodStart: string, status: string, paidAt: Date | null, amount: string) =>
    insert(schema.clubCharges, {
      subscriptionId: ID.assinatura,
      organizationId: 'org-a',
      kind: 'cycle',
      amount,
      paidAmount: paidAt ? amount : null,
      paidAt,
      periodStart,
      status,
    })

  it('1ª fatura (com adesão) estornada e 2ª paga: sem comissão de adesão e mensalidade na escala da 1ª parcela paga', async () => {
    seedClube()
    cobranca('2026-10-01', 'refunded', new Date('2026-10-01T12:00:00Z'), '300')
    const segunda = cobranca('2026-11-01', 'paid', PAID_AT, '200')
    expect(await registrarClub(segunda)).toBe(1)
    expect(comissoes().map(c => [c.tipo, c.parcela, c.percentual, c.base, c.valor])).toEqual([['mensalidade', 1, '100', '200', '200']])
  })

  it('1ª fatura paga leva a adesão; a 2ª (parcela 2) não', async () => {
    seedClube()
    const primeira = cobranca('2026-10-01', 'paid', new Date('2026-10-01T12:00:00Z'), '300')
    const segunda = cobranca('2026-11-01', 'paid', PAID_AT, '200')
    await registrarClub(primeira)
    await registrarClub(segunda)
    expect(comissoes().filter(c => c.cobrancaRef === primeira.id).map(c => [c.tipo, c.parcela, c.base])).toEqual(
      expect.arrayContaining([
        ['adesao', 1, '100'],
        ['mensalidade', 1, '200'],
      ]),
    )
    expect(comissoes().filter(c => c.cobrancaRef === segunda.id).map(c => [c.tipo, c.parcela, c.percentual])).toEqual([['mensalidade', 2, '50']])
  })
})
