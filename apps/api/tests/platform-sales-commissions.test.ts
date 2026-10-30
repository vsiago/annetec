import { activationChargeItems, sumChargeItems } from '@annetec/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Comissão automática por fatura da plataforma PAGA (banco FALSO): ativação
 * separa adesão e 1ª mensalidade; 2ª/3ª pela escala; 4ª não gera; fatura
 * repetida não duplica (índice único fatura+parte); sem vendedor não gera;
 * estorno cancela a não repassada e marca "a descontar" a repassada.
 */

const state = vi.hoisted(() => ({
  seller: 'seller-joao' as string | null,
  paidBefore: 0,
  commissions: new Map<string, Record<string, unknown>>(),
  audits: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  settingsRow: null as Record<string, unknown> | null,
  proposalLocks: [] as string[][],
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createFakeDb, argOf, whereValues } = await import('./helpers/fake-db')
  let seq = 0
  const db = createFakeDb(call => {
    if (call.kind === 'select') {
      if (call.table === schema.platformOnboardingProposals) {
        state.proposalLocks.push(call.ops.filter(op => op.name === 'for').map(op => String(op.args[0])))
        return state.seller ? [{ sellerUserId: state.seller, code: 'ANN-2610-ABCDE' }] : [{ sellerUserId: null, code: 'ANN-2610-ABCDE' }]
      }
      if (call.table === schema.platformSalesSettings) return state.settingsRow ? [state.settingsRow] : []
      if (call.table === schema.platformCharges) return [{ value: state.paidBefore }]
      if (call.table === schema.platformSalesCommissions) {
        const chargeId = whereValues(argOf(call.ops, 'where'))[0]
        return [...state.commissions.values()].filter(row => row.chargeId === chargeId)
      }
      return []
    }
    if (call.kind === 'insert') {
      const values = argOf(call.ops, 'values') as unknown
      const rows = (Array.isArray(values) ? values : [values]) as Record<string, unknown>[]
      if (call.table === schema.auditLogs) {
        state.audits.push(...rows)
        return []
      }
      if (call.table === schema.platformSalesCommissions) {
        const inserted: Record<string, unknown>[] = []
        for (const row of rows) {
          const key = `${row.chargeId}:${row.kind}`
          if (state.commissions.has(key)) continue // onConflictDoNothing (índice único)
          const saved = { ...row, id: `com-${++seq}` }
          state.commissions.set(key, saved)
          inserted.push(saved)
        }
        return inserted
      }
      return []
    }
    if (call.kind === 'update' && call.table === schema.platformSalesCommissions) {
      const set = argOf(call.ops, 'set')
      const [id, status] = whereValues(argOf(call.ops, 'where'))
      const row = [...state.commissions.values()].find(r => r.id === id && r.status === status)
      if (!row) return []
      Object.assign(row, set)
      state.updates.push({ id, ...set })
      return [{ id }]
    }
    return []
  })
  return { db }
})

const { recordCommissionsForPaidCharge, reverseCommissionsForCharge } = await import('@/modules/platform-sales/commissions.service')
const { db } = await import('@/db/client')

const PROFISSIONAL = { name: 'Profissional', priceMonthly: 697 }
const DISCOUNT = { setupFeePercent: 50, monthlyPercent: 20 }
const PAID_AT = new Date('2026-10-30T14:00:00Z')

function activation(id = 'ch-ativacao') {
  const items = activationChargeItems(PROFISSIONAL, { setupFee: 990 }, DISCOUNT)
  const amount = sumChargeItems(items)
  return {
    id,
    kind: 'activation' as const,
    proposalId: 'prop-1',
    organizationId: null,
    subscriptionId: null,
    amount: String(amount),
    paidAmount: String(amount),
    paidAt: PAID_AT,
    items,
  }
}

function monthly(id: string, amount = 557.6) {
  return {
    id,
    kind: 'monthly' as const,
    proposalId: 'prop-1',
    organizationId: 'org-1',
    subscriptionId: 'sub-1',
    amount: String(amount),
    paidAmount: String(amount),
    paidAt: PAID_AT,
    items: [{ kind: 'plan_fee', amount: 697 }, { kind: 'discount', amount: -139.4, appliesTo: 'plan_fee' as const }],
  }
}

const rows = () => [...state.commissions.values()]

beforeEach(() => {
  state.seller = 'seller-joao'
  state.paidBefore = 0
  state.commissions = new Map()
  state.audits = []
  state.updates = []
  state.settingsRow = null
  state.proposalLocks = []
})

describe('geração na fatura paga', () => {
  it('ativação: dois lançamentos (adesão e 1ª mensalidade), competência do pagamento, auditados', async () => {
    const count = await recordCommissionsForPaidCharge(db as never, activation())
    expect(count).toBe(2)
    expect(rows().map(r => [r.kind, r.installment, r.baseAmount, r.percent, r.amount, r.status, r.referenceMonth, r.sellerUserId])).toEqual([
      ['setup_fee', null, '495', '50', '247.5', 'a_pagar', '2026-10', 'seller-joao'],
      ['monthly', 1, '557.6', '50', '278.8', 'a_pagar', '2026-10', 'seller-joao'],
    ])
    expect(state.audits.map(a => a.action)).toEqual(['sales_commission.created', 'sales_commission.created'])
  })

  it('idempotente: a mesma fatura de novo não duplica nem audita de novo', async () => {
    await recordCommissionsForPaidCharge(db as never, activation())
    const again = await recordCommissionsForPaidCharge(db as never, activation())
    expect(again).toBe(0)
    expect(rows()).toHaveLength(2)
    expect(state.audits).toHaveLength(2)
  })

  it('2ª e 3ª mensalidades pela escala; a 4ª não gera', async () => {
    state.paidBefore = 1
    await recordCommissionsForPaidCharge(db as never, monthly('ch-m2'))
    state.paidBefore = 2
    await recordCommissionsForPaidCharge(db as never, monthly('ch-m3'))
    state.paidBefore = 3
    const fourth = await recordCommissionsForPaidCharge(db as never, monthly('ch-m4', 697))
    expect(fourth).toBe(0)
    expect(rows().map(r => [r.chargeId, r.installment, r.percent, r.amount])).toEqual([
      ['ch-m2', 2, '20', '111.52'],
      ['ch-m3', 3, '10', '55.76'],
    ])
  })

  it('trava a proposta (FOR UPDATE) antes de contar as mensalidades — duas faturas pagas juntas não repetem o nº', async () => {
    state.paidBefore = 1
    await recordCommissionsForPaidCharge(db as never, monthly('ch-m2'))
    expect(state.proposalLocks).toEqual([['update']])
  })

  it('regra vigente no pagamento (configuração gravada) é a que vale', async () => {
    state.settingsRow = { id: 'default', monthlySchedule: [40, 30, 20, 10], setupFeePercent: '30', updatedAt: new Date(), updatedByName: 'Super' }
    state.paidBefore = 3
    await recordCommissionsForPaidCharge(db as never, monthly('ch-m4', 697))
    expect(rows().map(r => [r.installment, r.percent, r.amount])).toEqual([[4, '10', '69.7']])
  })

  it('clube sem vendedor atribuído e fatura avulsa não geram', async () => {
    state.seller = null
    expect(await recordCommissionsForPaidCharge(db as never, activation())).toBe(0)
    state.seller = 'seller-joao'
    expect(await recordCommissionsForPaidCharge(db as never, { ...monthly('ch-aj'), kind: 'adjustment' })).toBe(0)
    expect(rows()).toHaveLength(0)
  })
})

describe('estorno / chargeback', () => {
  it('não repassada → cancelada; repassada → a descontar; já cancelada fica', async () => {
    await recordCommissionsForPaidCharge(db as never, activation())
    const [setup, first] = rows()
    first!.status = 'paga'
    state.commissions.set('ch-ativacao:extra', { id: 'com-x', chargeId: 'ch-ativacao', kind: 'extra', status: 'cancelada', amount: '1' })
    const changed = await reverseCommissionsForCharge(db as never, 'ch-ativacao', 'Fatura estornada')
    expect(changed).toBe(2)
    expect(setup!.status).toBe('cancelada')
    expect(first!.status).toBe('a_descontar')
    expect(state.audits.slice(-2).map(a => a.action)).toEqual(['sales_commission.canceled', 'sales_commission.clawback'])
  })
})
