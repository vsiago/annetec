import { describe, beforeEach, expect, it, vi } from 'vitest'

/**
 * Fatura da plataforma no cartão salvo: `lastAttemptAt` é gravado ANTES de
 * chamar o gateway (processo derrubado entre a resposta e a gravação → a
 * próxima tentativa confere no gateway em vez de cobrar de novo), e falha ao
 * criar o cliente no gateway não conta tentativa de cartão. Banco e gateway falsos.
 */

const state = vi.hoisted(() => ({
  charge: {} as Record<string, unknown>,
  sub: {} as Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
  createInputs: [] as Record<string, unknown>[],
  atGateway: [] as Record<string, unknown>[],
  customerError: null as Error | null,
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
  const db: Record<string, unknown> = {
    select: () =>
      chain(ops => {
        const table = arg(ops, 'from') as unknown
        if (table === schema.platformCharges) return [{ ...state.charge }]
        if (table === schema.platformSubscriptions) return [{ ...state.sub }]
        return []
      }),
    update: (table: unknown) =>
      chain(ops => {
        const set = arg(ops, 'set')
        if (table !== schema.platformCharges) return []
        state.updates.push(set)
        Object.assign(state.charge, set)
        return [{ ...state.charge }]
      }),
    insert: () => chain(() => [{ id: 'evt' }]),
    execute: async () => [],
  }
  db.transaction = async (work: (tx: unknown) => unknown) => work(db)
  return { db }
})

const { AsaasApiError } = await import('@/integrations/asaas/client')
const { ERROR_CODES } = await import('@annetec/contracts')
const { submitPlatformChargeToGateway } = await import('@/modules/platform-billing/charges.service')

const gateway = {
  provider: 'asaas',
  sandbox: false,
  canSimulate: false,
  ensureCustomer: async () => {
    if (state.customerError) throw state.customerError
    return 'cus_1'
  },
  createCharge: async (input: Record<string, unknown>) => {
    state.createInputs.push(input)
    state.atGateway.push({ ...state.charge })
    return { id: 'pay_ok', status: 'pending', invoiceUrl: null, pix: null, boleto: null, card: null }
  },
} as never

const CHARGE_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const attempt = { method: 'credit_card' as const, useSavedCard: true, source: 'automation' as const, gateway }

beforeEach(() => {
  state.charge = {
    id: CHARGE_ID,
    organizationId: 'org-1',
    subscriptionId: 'sub-1',
    proposalId: null,
    kind: 'monthly',
    dueDate: '2026-10-10',
    amount: '990.00',
    method: 'credit_card',
    status: 'pending',
    description: 'Mensalidade ANNETEC',
    gatewayProvider: 'asaas',
    gatewayChargeId: null,
    attempts: 0,
    lastAttemptAt: null,
  }
  state.sub = {
    id: 'sub-1',
    organizationId: 'org-1',
    billingName: 'Clube',
    billingDocument: '11222333000181',
    billingEmail: 'fin@clube.org',
    gatewayProvider: 'asaas',
    gatewayCustomerId: 'cus_1',
    cardToken: 'tok_salvo',
  }
  state.updates = []
  state.createInputs = []
  state.atGateway = []
  state.customerError = null
})

describe('fatura da plataforma no cartão salvo', () => {
  it('lastAttemptAt gravado antes do gateway; processo derrubado → a próxima tentativa confere no gateway', async () => {
    await submitPlatformChargeToGateway(CHARGE_ID, attempt)
    expect(state.atGateway[0]!.lastAttemptAt).toBeInstanceOf(Date)
    expect(state.atGateway[0]!.attempts).toBe(0)
    expect(state.createInputs[0]).toMatchObject({ reuseExistingCardPayment: false, cardToken: 'tok_salvo' })

    state.charge = { ...state.atGateway[0]! }
    state.createInputs = []
    await submitPlatformChargeToGateway(CHARGE_ID, attempt)
    expect(state.createInputs[0]).toMatchObject({ reuseExistingCardPayment: true })
  })

  it('falha ao criar o cliente no gateway não conta tentativa de cartão', async () => {
    state.sub.gatewayCustomerId = null
    state.customerError = new AsaasApiError(ERROR_CODES.UPSTREAM_TIMEOUT, 'timeout', 0)
    const row = await submitPlatformChargeToGateway(CHARGE_ID, attempt)
    expect(state.createInputs).toHaveLength(0)
    expect(row.status).toBe('failed')
    expect(state.updates.at(-1)).not.toHaveProperty('attempts')
  })
})
