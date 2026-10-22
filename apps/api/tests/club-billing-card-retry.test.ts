import { ERROR_CODES } from '@annetec/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cartão com resposta inconclusiva do gateway (timeout/5xx): a tentativa
 * CONTA (`attempts + 1`, para a automação respeitar `maxCardRetries`) e a
 * próxima tentativa pede ao gateway para conferir pelo `externalReference`
 * antes de cobrar (`reuseExistingCardPayment`). Banco e gateway falsos.
 */

const state = vi.hoisted(() => ({
  charge: {} as Record<string, unknown>,
  sub: {} as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
  createInputs: [] as Record<string, unknown>[],
  createError: null as Error | null,
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  type Op = { name: string; args: unknown[] }
  function chain(resolve: (ops: Op[]) => unknown) {
    const ops: Op[] = []
    const proxy: unknown = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) =>
            Promise.resolve(resolve(ops)).then(onFulfilled, onRejected)
        }
        return (...args: unknown[]) => {
          ops.push({ name: String(prop), args })
          return proxy
        }
      },
    })
    return proxy
  }
  const arg = (ops: Op[], name: string) => ops.find(op => op.name === name)?.args[0] as Record<string, unknown>
  const db = {
    select: () =>
      chain(ops => {
        const table = arg(ops, 'from') as unknown
        if (table === schema.clubCharges) return [{ ...state.charge }]
        if (table === schema.clubSubscriptions) return [{ ...state.sub }]
        return []
      }),
    update: () =>
      chain(ops => {
        const set = arg(ops, 'set')
        state.updates.push(set)
        Object.assign(state.charge, set)
        return [{ ...state.charge }]
      }),
    insert: () => chain(() => [{ id: 'evt' }]),
    transaction: async (work: (tx: unknown) => unknown) => work(db),
  }
  return { db, sql: {} }
})

vi.mock('@/modules/club-billing/settings.service', () => ({
  loadBillingSettings: async () => ({ finePercent: 2, interestMonthlyPercent: 1, enabledMethods: ['pix', 'boleto', 'credit_card'] }),
}))

vi.mock('@/integrations/payments/provider', () => {
  const gateway = {
    provider: 'asaas',
    sandbox: false,
    canSimulate: false,
    ensureCustomer: async () => 'cus_1',
    createCharge: async (input: Record<string, unknown>) => {
      state.createInputs.push(input)
      if (state.createError) throw state.createError
      return { id: 'pay_ok', status: 'paid', paidAt: new Date(), paidAmount: 79.7, invoiceUrl: null, pix: null, boleto: null, card: null }
    },
  }
  return { getPaymentGateway: async () => gateway, getGatewayFor: async () => gateway, effectiveProvider: () => 'asaas' }
})

const { AsaasApiError } = await import('@/integrations/asaas/client')
const { submitChargeToGateway } = await import('@/modules/club-billing/charges.service')

const CHARGE_ID = '6f1c2b1e-1111-4222-8333-944455556666'

beforeEach(() => {
  state.charge = {
    id: CHARGE_ID,
    organizationId: 'org-1',
    subscriptionId: 'sub-1',
    kind: 'cycle',
    dueDate: '2026-09-27',
    amount: '79.70',
    method: 'credit_card',
    status: 'pending',
    description: 'Clube · Plano Plus',
    gatewayProvider: 'asaas',
    gatewayChargeId: null,
    attempts: 0,
    lastAttemptAt: null,
  }
  state.sub = { id: 'sub-1', gatewayProvider: 'asaas', gatewayCustomerId: 'cus_1', cardToken: 'tok_salvo', holderCpf: '52998224725' }
  state.updates = []
  state.createInputs = []
  state.createError = null
})

describe('cartão recorrente com resposta inconclusiva', () => {
  it('1ª tentativa sem consulta prévia; falha inconclusiva conta a tentativa e marca failed', async () => {
    state.createError = new AsaasApiError(ERROR_CODES.UPSTREAM_TIMEOUT, 'timeout', 0)
    const row = await submitChargeToGateway(CHARGE_ID, { method: 'credit_card', useSavedCard: true, source: 'automation' })
    expect(state.createInputs[0]).toMatchObject({ reuseExistingCardPayment: false, cardToken: 'tok_salvo' })
    expect(row.status).toBe('failed')
    const failure = state.updates.at(-1)!
    expect(failure.status).toBe('failed')
    expect(failure).toHaveProperty('attempts') // attempts + 1 (SQL)
    expect(failure.lastAttemptAt).toBeInstanceOf(Date)
  })

  it('nova tentativa numa cobrança que já teve tentativa → pede a conferência no gateway antes de cobrar', async () => {
    state.charge.attempts = 1
    state.charge.status = 'failed'
    state.charge.lastAttemptAt = new Date('2026-09-27T12:00:00Z')
    await submitChargeToGateway(CHARGE_ID, { method: 'credit_card', useSavedCard: true, source: 'automation' })
    expect(state.createInputs[0]).toMatchObject({ reuseExistingCardPayment: true })
  })

  it('Pix/boleto: falha do gateway não conta tentativa de cartão nem pede conferência', async () => {
    state.charge.method = 'pix'
    state.createError = new Error('fora do ar')
    await submitChargeToGateway(CHARGE_ID, { method: 'pix', source: 'automation' })
    expect(state.createInputs[0]).toMatchObject({ reuseExistingCardPayment: false })
    expect(state.updates.at(-1)).not.toHaveProperty('attempts')
  })
})
