import { activationChargeItems, sumChargeItems } from '@annetec/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Comissão automática por fatura da plataforma PAGA, agora pelo serviço da Rede
 * Comercial (`vendas-rede/comissoes.service`, banco FALSO em memória): ativação
 * separa adesão e 1ª mensalidade; escala [100, 50, 25] (a 4ª não gera); hierarquia
 * completa × solo; fatura repetida não duplica; pago a menor reparte na proporção;
 * regra vigente (config gravada) vale no pagamento; estorno cancela a não
 * repassada e marca "a descontar" a repassada. O vendedor vem da proposta
 * (`vendas_agente_id`) ou, na falta, de `seller_user_id`.
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
const { registrarComissoesDaCobrancaPaga, estornarComissoesDaCobranca } = await import('@/modules/vendas-rede/comissoes.service')

const mem = () => memory.instance as unknown as ReturnType<typeof import('./helpers/memory-db').createMemoryDb>
const insert = (table: object, values: Record<string, unknown>) => mem().insertRow(table, values) as Record<string, any>
const comissoes = () => mem().rows(schema.vendasComissoes) as Record<string, any>[]

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ID = { corretora: u(1), equipe: u(2), gerente: u(3), supervisor: u(4), vendedor: u(5), solo: u(6), propCadeia: u(7), propSolo: u(8), propLegada: u(9) }
const PROFISSIONAL = { name: 'Profissional', priceMonthly: 697 }
const DISCOUNT = { setupFeePercent: 50, monthlyPercent: 20 }
const PAID_AT = new Date('2026-10-30T14:00:00Z')

function agente(id: string, papel: string, extra: Record<string, unknown> = {}) {
  insert(schema.vendasAgentes, { id, scope: 'platform', tenantId: null, userId: `user-${id.slice(-2)}`, papel, nome: `Agente ${id.slice(-2)}`, codigoIndicacao: `C${id.slice(-5)}`, ativo: true, ...extra })
}

function seed() {
  insert(schema.vendasCorretoras, { id: ID.corretora, scope: 'platform', tenantId: null, nomeFantasia: 'Corretora', gerenteAgenteId: ID.gerente })
  insert(schema.vendasEquipes, { id: ID.equipe, scope: 'platform', tenantId: null, corretoraId: ID.corretora, nome: 'Equipe', supervisorAgenteId: ID.supervisor })
  agente(ID.gerente, 'gerente', { corretoraId: ID.corretora })
  agente(ID.supervisor, 'supervisor', { corretoraId: ID.corretora, equipeId: ID.equipe })
  agente(ID.vendedor, 'vendedor', { corretoraId: ID.corretora, equipeId: ID.equipe })
  agente(ID.solo, 'vendedor')
  insert(schema.platformOnboardingProposals, { id: ID.propCadeia, vendasAgenteId: ID.vendedor, sellerUserId: null })
  insert(schema.platformOnboardingProposals, { id: ID.propSolo, vendasAgenteId: ID.solo, sellerUserId: null })
}

function activation(proposalId: string, extra: Record<string, unknown> = {}) {
  const items = activationChargeItems(PROFISSIONAL, { setupFee: 990 }, DISCOUNT)
  const amount = String(sumChargeItems(items))
  return insert(schema.platformCharges, { proposalId, kind: 'activation', status: 'paid', amount, paidAmount: amount, paidAt: PAID_AT, items, organizationId: null, ...extra })
}

function monthly(proposalId: string, paidAt: Date, amount = '557.6') {
  return insert(schema.platformCharges, {
    proposalId,
    kind: 'monthly',
    status: 'paid',
    amount,
    paidAmount: amount,
    paidAt,
    organizationId: 'org-1',
    items: [{ kind: 'plan_fee', amount: 697 }, { kind: 'discount', amount: -139.4, appliesTo: 'plan_fee' }],
  })
}

const registrar = (cobranca: unknown) => registrarComissoesDaCobrancaPaga({ origem: 'platform', cobranca: cobranca as never, agora: new Date('2026-11-02T12:00:00Z') })
const resumo = (cobrancaRef: string) =>
  comissoes()
    .filter(c => c.cobrancaRef === cobrancaRef)
    .map(c => [c.parte, c.tipo, c.parcela, c.percentual, c.base, c.valor, c.status, c.mesReferencia])

beforeEach(() => {
  mem().reset()
  seed()
})

describe('geração na fatura paga', () => {
  it('ativação com hierarquia completa: adesão (50%) e 1ª mensalidade (100%) + overrides 10/5/5, competência do pagamento', async () => {
    const fatura = activation(ID.propCadeia)
    expect(await registrar(fatura)).toBe(8)
    expect(resumo(fatura.id)).toEqual([
      ['vendedor', 'adesao', 1, '50', '495', '247.5', 'a_pagar', '2026-10'],
      ['supervisor', 'adesao', 1, '10', '247.5', '24.75', 'a_pagar', '2026-10'],
      ['gerente', 'adesao', 1, '5', '247.5', '12.38', 'a_pagar', '2026-10'],
      ['corretora', 'adesao', 1, '5', '247.5', '12.38', 'a_pagar', '2026-10'],
      ['vendedor', 'mensalidade', 1, '100', '557.6', '557.6', 'a_pagar', '2026-10'],
      ['supervisor', 'mensalidade', 1, '10', '557.6', '55.76', 'a_pagar', '2026-10'],
      ['gerente', 'mensalidade', 1, '5', '557.6', '27.88', 'a_pagar', '2026-10'],
      ['corretora', 'mensalidade', 1, '5', '557.6', '27.88', 'a_pagar', '2026-10'],
    ])
  })

  it('vendedor solo: só a linha dele (100% da 1ª mensalidade), sem overrides', async () => {
    const fatura = activation(ID.propSolo)
    expect(await registrar(fatura)).toBe(2)
    expect(resumo(fatura.id).map(l => [l[0], l[1], l[5]])).toEqual([
      ['vendedor', 'adesao', '247.5'],
      ['vendedor', 'mensalidade', '557.6'],
    ])
  })

  it('escala [100, 50, 25] nas mensalidades; a 4ª não gera; fatura repetida não duplica', async () => {
    await registrar(activation(ID.propSolo))
    const m2 = monthly(ID.propSolo, new Date('2026-11-30T14:00:00Z'))
    const m3 = monthly(ID.propSolo, new Date('2026-12-30T14:00:00Z'))
    const m4 = monthly(ID.propSolo, new Date('2027-01-30T14:00:00Z'), '697')
    expect(await registrar(m2)).toBe(1)
    expect(await registrar(m3)).toBe(1)
    expect(await registrar(m4)).toBe(0)
    expect(await registrar(m2)).toBe(0)
    expect(resumo(m2.id)).toEqual([['vendedor', 'mensalidade', 2, '50', '557.6', '278.8', 'a_pagar', '2026-11']])
    expect(resumo(m3.id)).toEqual([['vendedor', 'mensalidade', 3, '25', '557.6', '139.4', 'a_pagar', '2026-12']])
    expect(resumo(m4.id)).toEqual([])
    expect(comissoes()).toHaveLength(4)
  })

  it('regra vigente no pagamento: a configuração gravada (ex.: 4 parcelas) é a que vale', async () => {
    insert(schema.vendasConfig, { scope: 'platform', tenantId: null, escalaMensal: [40, 30, 20, 10], percentualAdesao: '30', overrides: { supervisor: 0, gerente: 0, corretora: 0 }, balcaoPercentual: null })
    await registrar(activation(ID.propSolo))
    await registrar(monthly(ID.propSolo, new Date('2026-11-30T14:00:00Z')))
    await registrar(monthly(ID.propSolo, new Date('2026-12-30T14:00:00Z')))
    const m4 = monthly(ID.propSolo, new Date('2027-01-30T14:00:00Z'), '697')
    expect(await registrar(m4)).toBe(1)
    expect(resumo(m4.id)).toEqual([['vendedor', 'mensalidade', 4, '10', '697', '69.7', 'a_pagar', '2027-01']])
  })

  it('pago a menor reparte na proporção (multa/juros e a diferença não entram)', async () => {
    const fatura = activation(ID.propSolo, { paidAmount: String(sumChargeItems(activationChargeItems(PROFISSIONAL, { setupFee: 990 }, DISCOUNT)) / 2) })
    await registrar(fatura)
    expect(resumo(fatura.id).map(l => [l[1], l[4], l[5]])).toEqual([
      ['adesao', '247.5', '123.75'],
      ['mensalidade', '278.8', '278.8'],
    ])
  })

  it('sem atribuição nova usa o vendedor legado (seller_user_id); proposta sem vendedor e fatura avulsa não geram', async () => {
    insert(schema.platformOnboardingProposals, { id: ID.propLegada, vendasAgenteId: null, sellerUserId: `user-${ID.solo.slice(-2)}` })
    expect(await registrar(activation(ID.propLegada))).toBe(2)
    expect(new Set(comissoes().map(c => c.beneficiarioAgenteId))).toEqual(new Set([ID.solo]))

    mem().reset()
    seed()
    insert(schema.platformOnboardingProposals, { id: ID.propLegada, vendasAgenteId: null, sellerUserId: null })
    expect(await registrar(activation(ID.propLegada))).toBe(0)
    expect(await registrar({ ...monthly(ID.propSolo, PAID_AT), kind: 'adjustment' })).toBe(0)
    expect(comissoes()).toHaveLength(0)
  })
})

describe('estorno / chargeback', () => {
  it('não repassada → cancelada; repassada → a descontar; já cancelada fica como está', async () => {
    const fatura = activation(ID.propCadeia)
    await registrar(fatura)
    const repassada = comissoes().find(c => c.parte === 'vendedor' && c.tipo === 'mensalidade')!
    repassada.status = 'paga'
    comissoes().find(c => c.parte === 'gerente' && c.tipo === 'adesao')!.status = 'cancelada'

    expect(await estornarComissoesDaCobranca('platform', fatura.id, 'Fatura estornada', new Date())).toBe(7)
    expect(repassada.status).toBe('a_descontar')
    expect(comissoes().filter(c => c.status === 'cancelada')).toHaveLength(7)
    const acoes = (mem().rows(schema.auditLogs) as Record<string, any>[]).map(a => a.action)
    expect(acoes.filter(a => a === 'vendas.comissao_a_descontar')).toHaveLength(1)
  })
})
