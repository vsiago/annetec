import { activationChargeItems, sumChargeItems } from '@annetec/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Comissões da Rede Comercial (`comissoes.service`) com o banco FALSO em memória
 * (interpreta o `where` de verdade): geração idempotente por cobrança (platform e
 * club), cadeia completa vendedor + supervisor + gerente + corretora com a escala
 * [100, 50, 25] e overrides 10/5/5, solo, overrides próprios da corretora,
 * parcela fora da escala, adesão, estorno antes/depois do repasse, lead → ganho
 * na 1ª cobrança paga, leitura por papel, repasse só do master e isolamento
 * entre escopos/inquilinos.
 */

const memory = vi.hoisted(() => ({ instance: null as null | Record<string, any> }))

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
      {
        table: schema.vendasComissoes,
        keys: ['cobrancaOrigem', 'cobrancaRef', 'tipo', 'parte', 'beneficiarioAgenteId'],
        where: row => row.parte !== 'corretora',
      },
      {
        table: schema.vendasComissoes,
        keys: ['cobrancaOrigem', 'cobrancaRef', 'tipo', 'parte', 'beneficiarioCorretoraId'],
        where: row => row.parte === 'corretora',
      },
    ],
  })
  memory.instance = instance as unknown as Record<string, any>
  return { db: instance.db }
})

const schema = await import('@/db/schema')
const { visibilidade } = await import('@/modules/vendas-rede/rules')
const service = await import('@/modules/vendas-rede/comissoes.service')
const { AppError } = await import('@/http/errors')

const mem = () => memory.instance as unknown as ReturnType<typeof import('./helpers/memory-db').createMemoryDb>
const insert = (table: object, values: Record<string, unknown>) => mem().insertRow(table, values) as Record<string, any>
const rows = (table: object) => mem().rows(table)

const ID = {
  corretora: '00000000-0000-4000-8000-0000000000c1',
  corretora2: '00000000-0000-4000-8000-0000000000c2',
  equipe: '00000000-0000-4000-8000-0000000000e1',
  equipe2: '00000000-0000-4000-8000-0000000000e2',
  gerente: '00000000-0000-4000-8000-0000000000a1',
  supervisor: '00000000-0000-4000-8000-0000000000a2',
  vendedor: '00000000-0000-4000-8000-0000000000a3',
  solo: '00000000-0000-4000-8000-0000000000a4',
  outroVendedor: '00000000-0000-4000-8000-0000000000a5',
  agenteClubeA: '00000000-0000-4000-8000-0000000000b1',
  agenteClubeB: '00000000-0000-4000-8000-0000000000b2',
  leadPlatform: '00000000-0000-4000-8000-000000000101',
  leadSolo: '00000000-0000-4000-8000-000000000102',
  leadClube: '00000000-0000-4000-8000-000000000103',
  propostaCadeia: '00000000-0000-4000-8000-000000000201',
  propostaSolo: '00000000-0000-4000-8000-000000000202',
  propostaCorretora2: '00000000-0000-4000-8000-000000000203',
  propostaLegada: '00000000-0000-4000-8000-000000000204',
  propostaSemAgente: '00000000-0000-4000-8000-000000000205',
  assinaturaA: '00000000-0000-4000-8000-000000000301',
  assinaturaB: '00000000-0000-4000-8000-000000000302',
}
const CLUBE_A = 'org-clube-a'
const CLUBE_B = 'org-clube-b'
const PAID_AT = new Date('2026-10-30T14:00:00Z')
const AGORA = new Date('2026-11-02T12:00:00Z')

function agente(id: string, papel: string, extra: Record<string, unknown> = {}) {
  return insert(schema.vendasAgentes, {
    id,
    scope: 'platform',
    tenantId: null,
    userId: `user-${id.slice(-2)}`,
    papel,
    nome: `Agente ${id.slice(-2)}`,
    codigoIndicacao: `COD${id.slice(-4)}`,
    ativo: true,
    ...extra,
  })
}

function seedRede() {
  insert(schema.vendasCorretoras, { id: ID.corretora, scope: 'platform', tenantId: null, nomeFantasia: 'Corretora Um', gerenteAgenteId: ID.gerente })
  insert(schema.vendasEquipes, { id: ID.equipe, scope: 'platform', tenantId: null, corretoraId: ID.corretora, nome: 'Equipe 1', supervisorAgenteId: ID.supervisor })
  agente(ID.gerente, 'gerente', { corretoraId: ID.corretora })
  agente(ID.supervisor, 'supervisor', { corretoraId: ID.corretora, equipeId: ID.equipe })
  agente(ID.vendedor, 'vendedor', { corretoraId: ID.corretora, equipeId: ID.equipe })
  agente(ID.solo, 'vendedor')
  insert(schema.vendasLeads, { id: ID.leadPlatform, scope: 'platform', tenantId: null, nome: 'Clínica Alfa', etapa: 'negociacao', agenteId: ID.vendedor })
  insert(schema.vendasLeads, { id: ID.leadSolo, scope: 'platform', tenantId: null, nome: 'Clínica Beta', etapa: 'proposta', agenteId: ID.solo })
  insert(schema.platformOnboardingProposals, { id: ID.propostaCadeia, vendasAgenteId: ID.vendedor, vendasLeadId: ID.leadPlatform, sellerUserId: null })
  insert(schema.platformOnboardingProposals, { id: ID.propostaSolo, vendasAgenteId: ID.solo, vendasLeadId: ID.leadSolo, sellerUserId: null })
}

const PROFISSIONAL = { name: 'Profissional', priceMonthly: 697 }
const DISCOUNT = { setupFeePercent: 50, monthlyPercent: 20 }

function faturaPlatform(proposalId: string, kind: 'activation' | 'monthly' | 'adjustment', paidAt: Date, paga = true) {
  if (kind === 'activation') {
    const items = activationChargeItems(PROFISSIONAL, { setupFee: 990 }, DISCOUNT)
    const amount = String(sumChargeItems(items))
    return insert(schema.platformCharges, { proposalId, kind, amount, paidAmount: amount, paidAt, items, status: paga ? 'paid' : 'pending', organizationId: null })
  }
  return insert(schema.platformCharges, {
    proposalId,
    kind,
    amount: '557.6',
    paidAmount: '557.6',
    paidAt,
    status: 'paid',
    organizationId: 'org-1',
    items: [{ kind: 'plan_fee', amount: 697 }, { kind: 'discount', amount: -139.4, appliesTo: 'plan_fee' }],
  })
}

const registrarPlatform = (cobranca: unknown, agora = AGORA) =>
  service.registrarComissoesDaCobrancaPaga({ origem: 'platform', cobranca: cobranca as never, agora })
const registrarClub = (cobranca: unknown) => service.registrarComissoesDaCobrancaPaga({ origem: 'club', cobranca: cobranca as never, agora: AGORA })

const comissoes = () => rows(schema.vendasComissoes) as Record<string, any>[]
const linha = (parte: string, tipo: string, ref?: string) =>
  comissoes().find(c => c.parte === parte && c.tipo === tipo && (!ref || c.cobrancaRef === ref))

beforeEach(() => {
  mem().reset()
})

describe('geração na cobrança paga (platform)', () => {
  it('ativação com cadeia completa: adesão e 1ª mensalidade × vendedor, supervisor, gerente e corretora', async () => {
    seedRede()
    const ativacao = faturaPlatform(ID.propostaCadeia, 'activation', PAID_AT)
    expect(await registrarPlatform(ativacao)).toBe(8)

    // Mensalidade nº 1: 100% de 557,60 (vendedor); overrides 10/5/5 SOBRE a comissão do vendedor.
    expect(linha('vendedor', 'mensalidade')).toMatchObject({ beneficiarioAgenteId: ID.vendedor, parcela: 1, percentual: '100', base: '557.6', valor: '557.6', status: 'a_pagar', mesReferencia: '2026-10' })
    expect(linha('supervisor', 'mensalidade')).toMatchObject({ beneficiarioAgenteId: ID.supervisor, percentual: '10', base: '557.6', valor: '55.76' })
    expect(linha('gerente', 'mensalidade')).toMatchObject({ beneficiarioAgenteId: ID.gerente, percentual: '5', valor: '27.88' })
    expect(linha('corretora', 'mensalidade')).toMatchObject({ beneficiarioCorretoraId: ID.corretora, beneficiarioAgenteId: null, percentual: '5', valor: '27.88' })
    // Adesão (platform = 50% de 495): vendedor 247,50; supervisor 10% disso.
    expect(linha('vendedor', 'adesao')).toMatchObject({ percentual: '50', base: '495', valor: '247.5', parcela: 1 })
    expect(linha('supervisor', 'adesao')).toMatchObject({ valor: '24.75' })
    expect(comissoes().every(c => c.scope === 'platform' && c.tenantId === null && c.leadId === ID.leadPlatform)).toBe(true)
    expect((rows(schema.auditLogs) as Record<string, any>[]).filter(a => a.action === 'vendas.comissao_criada')).toHaveLength(8)
  })

  it('idempotente: a mesma cobrança de novo não duplica nem audita de novo', async () => {
    seedRede()
    const ativacao = faturaPlatform(ID.propostaCadeia, 'activation', PAID_AT)
    await registrarPlatform(ativacao)
    expect(await registrarPlatform(ativacao)).toBe(0)
    expect(comissoes()).toHaveLength(8)
    expect(rows(schema.auditLogs)).toHaveLength(8)
  })

  it('1ª cobrança paga: o lead vira ganho (ganho_em + evento "conversao"); a 2ª não mexe', async () => {
    seedRede()
    await registrarPlatform(faturaPlatform(ID.propostaCadeia, 'activation', PAID_AT))
    const lead = rows(schema.vendasLeads).find((l: Record<string, any>) => l.id === ID.leadPlatform) as Record<string, any>
    expect(lead.etapa).toBe('ganho')
    expect(lead.ganhoEm).toEqual(PAID_AT)
    const eventos = rows(schema.vendasLeadEventos) as Record<string, any>[]
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ leadId: ID.leadPlatform, tipo: 'conversao', texto: 'Primeiro pagamento confirmado' })

    await registrarPlatform(faturaPlatform(ID.propostaCadeia, 'monthly', new Date('2026-11-30T14:00:00Z')), new Date('2026-12-01T12:00:00Z'))
    expect(rows(schema.vendasLeadEventos)).toHaveLength(1)
    expect(lead.ganhoEm).toEqual(PAID_AT)
  })

  it('grava o snapshot da cadeia no lead (supervisor, gerente, corretora)', async () => {
    seedRede()
    await registrarPlatform(faturaPlatform(ID.propostaCadeia, 'activation', PAID_AT))
    const lead = rows(schema.vendasLeads).find((l: Record<string, any>) => l.id === ID.leadPlatform) as Record<string, any>
    expect(lead.atribuicao).toEqual({
      agenteId: ID.vendedor,
      papel: 'vendedor',
      equipeId: ID.equipe,
      supervisorAgenteId: ID.supervisor,
      unidadeId: null,
      corretoraId: ID.corretora,
      gerenteAgenteId: ID.gerente,
    })
  })

  it('o snapshot do lead vale mesmo que a cadeia atual tenha mudado', async () => {
    seedRede()
    const lead = rows(schema.vendasLeads).find((l: Record<string, any>) => l.id === ID.leadPlatform) as Record<string, any>
    lead.atribuicao = { agenteId: ID.vendedor, papel: 'vendedor', equipeId: null, supervisorAgenteId: null, unidadeId: null, corretoraId: null, gerenteAgenteId: null }
    await registrarPlatform(faturaPlatform(ID.propostaCadeia, 'activation', PAID_AT))
    // Só o vendedor: no momento da conversão ele era solo.
    expect(comissoes().map(c => c.parte).sort()).toEqual(['vendedor', 'vendedor'])
  })

  it('2ª e 3ª mensalidades pela escala (50% e 25%); a 4ª não gera', async () => {
    seedRede()
    await registrarPlatform(faturaPlatform(ID.propostaCadeia, 'activation', PAID_AT))
    const m2 = faturaPlatform(ID.propostaCadeia, 'monthly', new Date('2026-11-30T14:00:00Z'))
    await registrarPlatform(m2)
    const m3 = faturaPlatform(ID.propostaCadeia, 'monthly', new Date('2026-12-30T14:00:00Z'))
    await registrarPlatform(m3)
    const m4 = faturaPlatform(ID.propostaCadeia, 'monthly', new Date('2027-01-30T14:00:00Z'))
    expect(await registrarPlatform(m4)).toBe(0)

    expect(linha('vendedor', 'mensalidade', m2.id)).toMatchObject({ parcela: 2, percentual: '50', valor: '278.8' })
    expect(linha('supervisor', 'mensalidade', m2.id)).toMatchObject({ valor: '27.88' })
    expect(linha('vendedor', 'mensalidade', m3.id)).toMatchObject({ parcela: 3, percentual: '25', valor: '139.4' })
    expect(comissoes().filter(c => c.cobrancaRef === m4.id)).toHaveLength(0)
  })

  it('solo (sem equipe e sem corretora): só a linha do vendedor, sem overrides', async () => {
    seedRede()
    await registrarPlatform(faturaPlatform(ID.propostaSolo, 'activation', PAID_AT))
    expect(comissoes().map(c => [c.parte, c.tipo, c.beneficiarioAgenteId, c.valor])).toEqual([
      ['vendedor', 'adesao', ID.solo, '247.5'],
      ['vendedor', 'mensalidade', ID.solo, '557.6'],
    ])
  })

  it('corretora com overrides próprios sobrescreve os da config (chave a chave; 0 não gera linha)', async () => {
    seedRede()
    const corretora = rows(schema.vendasCorretoras)[0] as Record<string, any>
    corretora.comissaoOverrides = { supervisor: 20, gerente: 0, corretora: 10 }
    await registrarPlatform(faturaPlatform(ID.propostaCadeia, 'activation', PAID_AT))
    expect(linha('supervisor', 'mensalidade')).toMatchObject({ percentual: '20', valor: '111.52' })
    expect(linha('corretora', 'mensalidade')).toMatchObject({ percentual: '10', valor: '55.76' })
    expect(linha('gerente', 'mensalidade')).toBeUndefined()
  })

  it('sem atribuição nova usa o vendedor legado (seller_user_id → agente do mesmo usuário)', async () => {
    seedRede()
    insert(schema.platformOnboardingProposals, { id: ID.propostaLegada, vendasAgenteId: null, vendasLeadId: null, sellerUserId: `user-${ID.solo.slice(-2)}` })
    await registrarPlatform(faturaPlatform(ID.propostaLegada, 'activation', PAID_AT))
    expect(comissoes().map(c => c.beneficiarioAgenteId)).toEqual([ID.solo, ID.solo])
  })

  it('proposta sem vendedor e fatura avulsa não geram nada', async () => {
    seedRede()
    insert(schema.platformOnboardingProposals, { id: ID.propostaSemAgente, vendasAgenteId: null, vendasLeadId: null, sellerUserId: null })
    expect(await registrarPlatform(faturaPlatform(ID.propostaSemAgente, 'activation', PAID_AT))).toBe(0)
    expect(await registrarPlatform(faturaPlatform(ID.propostaCadeia, 'adjustment', PAID_AT))).toBe(0)
    expect(comissoes()).toHaveLength(0)
  })
})

describe('estorno / chargeback', () => {
  it('antes do repasse → cancelada; depois do repasse → a_descontar; repetir não muda mais nada', async () => {
    seedRede()
    const ativacao = faturaPlatform(ID.propostaCadeia, 'activation', PAID_AT)
    await registrarPlatform(ativacao)
    linha('vendedor', 'mensalidade')!.status = 'paga'

    expect(await service.estornarComissoesDaCobranca('platform', ativacao.id, 'Fatura estornada', AGORA)).toBe(8)
    expect(linha('vendedor', 'mensalidade')).toMatchObject({ status: 'a_descontar', observacao: 'Fatura estornada' })
    expect(linha('supervisor', 'mensalidade')).toMatchObject({ status: 'cancelada', observacao: 'Fatura estornada' })
    expect(await service.estornarComissoesDaCobranca('platform', ativacao.id, 'de novo', AGORA)).toBe(0)
    expect(linha('vendedor', 'mensalidade')).toMatchObject({ status: 'a_descontar', observacao: 'Fatura estornada' })
  })
})

describe('geração na cobrança paga (club)', () => {
  function seedClube() {
    for (const [id, tenantId] of [
      [ID.agenteClubeA, CLUBE_A],
      [ID.agenteClubeB, CLUBE_B],
    ] as const) {
      insert(schema.vendasAgentes, { id, scope: 'tenant', tenantId, userId: `user-${id.slice(-2)}`, papel: 'vendedor', nome: `Vendedor ${tenantId}`, codigoIndicacao: `CL${id.slice(-4)}`, ativo: true })
    }
    insert(schema.vendasLeads, { id: ID.leadClube, scope: 'tenant', tenantId: CLUBE_A, nome: 'Maria Associada', etapa: 'negociacao', agenteId: ID.agenteClubeA })
    insert(schema.clubSubscriptions, { id: ID.assinaturaA, organizationId: CLUBE_A, vendasAgenteId: ID.agenteClubeA, vendasLeadId: ID.leadClube, enrollmentFee: '100' })
    // Assinatura do clube B apontando para um agente do clube A: isolamento (não comissiona).
    insert(schema.clubSubscriptions, { id: ID.assinaturaB, organizationId: CLUBE_B, vendasAgenteId: ID.agenteClubeA, vendasLeadId: null, enrollmentFee: '0' })
  }
  const cobrancaClube = (subscriptionId: string, organizationId: string, paidAt: Date, extra: Record<string, unknown> = {}) =>
    insert(schema.clubCharges, { subscriptionId, organizationId, kind: 'cycle', amount: '200', paidAmount: '200', paidAt, periodStart: paidAt.toISOString().slice(0, 10), status: 'paid', ...extra })

  it('mensalidade: parcela 1 (100%), lead ganho e tenant/scope corretos; adesão do clube com % padrão 0 não gera', async () => {
    seedClube()
    const c1 = cobrancaClube(ID.assinaturaA, CLUBE_A, PAID_AT)
    expect(await registrarClub(c1)).toBe(1)
    expect(comissoes()[0]).toMatchObject({
      scope: 'tenant',
      tenantId: CLUBE_A,
      leadId: ID.leadClube,
      cobrancaOrigem: 'club',
      cobrancaRef: c1.id,
      parte: 'vendedor',
      tipo: 'mensalidade',
      parcela: 1,
      // 1ª cobrança de R$ 200 inclui R$ 100 de adesão: a mensalidade paga é a outra metade.
      base: '100',
      valor: '100',
    })
    expect((rows(schema.vendasLeads)[0] as Record<string, any>).etapa).toBe('ganho')
  })

  it('adesão do clube com percentual configurado entra como tipo adesao; 2ª cobrança = parcela 2 (50%)', async () => {
    seedClube()
    insert(schema.vendasConfig, {
      scope: 'tenant',
      tenantId: CLUBE_A,
      escalaMensal: [100, 50, 25],
      percentualAdesao: '10',
      overrides: { supervisor: 10, gerente: 5, corretora: 5 },
      balcaoPercentual: null,
    })
    const c1 = cobrancaClube(ID.assinaturaA, CLUBE_A, PAID_AT)
    await registrarClub(c1)
    expect(linha('vendedor', 'adesao')).toMatchObject({ base: '100', percentual: '10', valor: '10' })
    expect(linha('vendedor', 'mensalidade')).toMatchObject({ base: '100', percentual: '100', valor: '100' })
    const c2 = cobrancaClube(ID.assinaturaA, CLUBE_A, new Date('2026-11-30T14:00:00Z'))
    await registrarClub(c2)
    expect(linha('vendedor', 'mensalidade', c2.id)).toMatchObject({ parcela: 2, base: '200', percentual: '50', valor: '100' })
    expect(await registrarClub(c2)).toBe(0)
  })

  it('cobrança avulsa (one_off) não comissiona; agente de outro inquilino não recebe; estorno do clube', async () => {
    seedClube()
    expect(await registrarClub(cobrancaClube(ID.assinaturaA, CLUBE_A, PAID_AT, { kind: 'one_off' }))).toBe(0)
    expect(await registrarClub(cobrancaClube(ID.assinaturaB, CLUBE_B, PAID_AT))).toBe(0)
    expect(comissoes()).toHaveLength(0)

    const c1 = cobrancaClube(ID.assinaturaA, CLUBE_A, PAID_AT)
    await registrarClub(c1)
    expect(await service.estornarComissoesDaCobranca('club', c1.id, 'Chargeback (contestação do cartão)', AGORA)).toBe(1)
    expect(comissoes()[0]).toMatchObject({ status: 'cancelada', observacao: 'Chargeback (contestação do cartão)' })
  })
})

describe('leitura, repasse e cancelamento por papel', () => {
  type Papel = 'master' | 'gerente' | 'supervisor' | 'vendedor'
  function ctxDe(papel: Papel, agenteId: string | null, extra: Record<string, unknown> = {}) {
    const row = agenteId ? (rows(schema.vendasAgentes) as Record<string, any>[]).find(a => a.id === agenteId) : null
    return {
      scope: 'platform' as const,
      tenantId: null,
      tenantSlug: null,
      userId: `user-${papel}`,
      userName: papel,
      agente: row ?? null,
      papel,
      masterImplicito: !row,
      podeEscrever: true,
      visibilidade: visibilidade({
        papel,
        agenteId,
        corretoraId: row?.corretoraId ?? null,
        equipeIds: papel === 'supervisor' ? [ID.equipe] : undefined,
      }),
      ...extra,
    } as never
  }
  const query = { page: 1, perPage: 50 } as never

  async function seedComissoes() {
    seedRede()
    await registrarPlatform(faturaPlatform(ID.propostaCadeia, 'activation', PAID_AT))
    await registrarPlatform(faturaPlatform(ID.propostaSolo, 'activation', PAID_AT))
  }

  it('vendedor vê só as suas; supervisor as suas + da equipe; gerente tudo da corretora (inclui a parte da corretora); master tudo', async () => {
    await seedComissoes()
    const vendedor = await service.listar(ctxDe('vendedor', ID.vendedor), query)
    expect(new Set(vendedor.items.map(i => i.beneficiarioAgenteId))).toEqual(new Set([ID.vendedor]))
    expect(vendedor.total).toBe(2)

    const supervisor = await service.listar(ctxDe('supervisor', ID.supervisor), query)
    expect(new Set(supervisor.items.map(i => i.parte))).toEqual(new Set(['vendedor', 'supervisor']))
    expect(supervisor.total).toBe(4)

    const gerente = await service.listar(ctxDe('gerente', ID.gerente), query)
    expect(new Set(gerente.items.map(i => i.parte))).toEqual(new Set(['vendedor', 'supervisor', 'gerente', 'corretora']))
    expect(gerente.total).toBe(8)
    expect(gerente.items.find(i => i.parte === 'corretora')?.beneficiarioNome).toBe('Corretora Um')

    const master = await service.listar(ctxDe('master', null), query)
    expect(master.total).toBe(10) // 8 da cadeia + 2 do solo

    const solo = await service.listar(ctxDe('vendedor', ID.solo), query)
    expect(solo.total).toBe(2)
  })

  it('filtros de mês, status e agente; totais por status ignoram o filtro de status', async () => {
    await seedComissoes()
    comissoes().find(c => c.parte === 'vendedor' && c.tipo === 'mensalidade' && c.beneficiarioAgenteId === ID.vendedor)!.status = 'paga'
    const master = ctxDe('master', null)

    const pagas = await service.listar(master, { ...(query as object), status: 'paga' } as never)
    expect(pagas.total).toBe(1)
    expect(pagas.totais.paga).toBe(557.6)
    expect(pagas.totais.a_pagar).toBeGreaterThan(0)

    expect((await service.listar(master, { ...(query as object), mes: '2026-09' } as never)).total).toBe(0)
    expect((await service.listar(master, { ...(query as object), mes: '2026-10' } as never)).total).toBe(10)
    expect((await service.listar(master, { ...(query as object), agente: ID.solo } as never)).total).toBe(2)
    // Agente fora da visibilidade: vazio, não vaza.
    expect((await service.listar(ctxDe('vendedor', ID.vendedor), { ...(query as object), agente: ID.solo } as never)).total).toBe(0)
  })

  it('resumo por beneficiário no mês', async () => {
    await seedComissoes()
    const resumo = await service.resumo(ctxDe('master', null), '2026-10')
    expect(resumo.mes).toBe('2026-10')
    const vendedor = resumo.beneficiarios.find(b => b.beneficiarioAgenteId === ID.vendedor)!
    expect(vendedor.totais.a_pagar).toBe(805.1) // 247,50 (adesão) + 557,60 (mensalidade)
    expect(vendedor.liquido).toBe(805.1)
    expect(resumo.beneficiarios.find(b => b.beneficiarioCorretoraId === ID.corretora)?.nome).toBe('Corretora Um')
    expect((await service.resumo(ctxDe('vendedor', ID.vendedor), '2026-10')).beneficiarios).toHaveLength(1)
  })

  it('pagar: só o master; só "a pagar"; ignora o que não é; audita', async () => {
    await seedComissoes()
    const ids = comissoes().slice(0, 2).map(c => c.id as string)
    await expect(service.pagar(ctxDe('vendedor', ID.vendedor), { ids })).rejects.toBeInstanceOf(AppError)
    await expect(service.pagar(ctxDe('gerente', ID.gerente), { ids })).rejects.toBeInstanceOf(AppError)
    expect(comissoes().every(c => c.status === 'a_pagar')).toBe(true)

    const resultado = await service.pagar(ctxDe('master', null), { ids: [...ids, '00000000-0000-4000-8000-00000000ffff'], pagamentoRef: 'PIX-123', pagoEm: '2026-11-03T10:00:00.000Z' })
    expect(resultado.pagas.map(p => p.id).sort()).toEqual([...ids].sort())
    expect(resultado.pagas.every(p => p.status === 'paga' && p.pagamentoRef === 'PIX-123')).toBe(true)
    expect(resultado.ignoradas).toEqual(['00000000-0000-4000-8000-00000000ffff'])
    expect(comissoes().find(c => c.id === ids[0])).toMatchObject({ pagoEm: new Date('2026-11-03T10:00:00.000Z'), pagoPorUserId: 'user-master' })
    expect((rows(schema.auditLogs) as Record<string, any>[]).some(a => a.action === 'vendas.comissoes_pagas')).toBe(true)
    // Já pagas: nada a pagar → erro de regra de negócio.
    await expect(service.pagar(ctxDe('master', null), { ids })).rejects.toBeInstanceOf(AppError)
  })

  it('cancelar: só o master; a pagar → cancelada com motivo; paga → a_descontar; cancelada não cancela de novo', async () => {
    await seedComissoes()
    const [primeira, segunda] = comissoes()
    await expect(service.cancelar(ctxDe('supervisor', ID.supervisor), primeira!.id, 'Cliente desistiu')).rejects.toBeInstanceOf(AppError)

    const cancelada = await service.cancelar(ctxDe('master', null), primeira!.id, 'Cliente desistiu')
    expect(cancelada).toMatchObject({ status: 'cancelada', observacao: 'Cliente desistiu' })
    await expect(service.cancelar(ctxDe('master', null), primeira!.id, 'Cliente desistiu')).rejects.toBeInstanceOf(AppError)

    segunda!.status = 'paga'
    expect((await service.cancelar(ctxDe('master', null), segunda!.id, 'Erro de lançamento')).status).toBe('a_descontar')
    await expect(service.cancelar(ctxDe('master', null), '00000000-0000-4000-8000-00000000ffff', 'Não existe')).rejects.toBeInstanceOf(AppError)
  })

  it('isolamento: o master de um inquilino não lista, não paga e não cancela comissões de outro escopo', async () => {
    await seedComissoes()
    const masterClubeB = {
      ...(ctxDe('master', null) as object),
      scope: 'tenant',
      tenantId: CLUBE_B,
      visibilidade: visibilidade({ papel: 'master', agenteId: null }),
    } as never
    const alvo = comissoes()[0]!.id as string

    expect((await service.listar(masterClubeB, query)).total).toBe(0)
    await expect(service.pagar(masterClubeB, { ids: [alvo] })).rejects.toBeInstanceOf(AppError)
    await expect(service.cancelar(masterClubeB, alvo, 'Tentativa de acesso')).rejects.toBeInstanceOf(AppError)
    expect(comissoes()[0]!.status).toBe('a_pagar')
  })
})
