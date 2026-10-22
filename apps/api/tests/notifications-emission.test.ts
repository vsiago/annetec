import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Emissão das notificações de pagamento pelo handler único de eventos —
 * com o mesmo banco FALSO em memória de `club-billing-events.test.ts`:
 * só emite quando a cobrança MUDOU para `paid` (webhook reprocessado,
 * CONFIRMED + RECEIVED, evento sem efeito → nada), 1º pagamento vira
 * "Nova assinatura paga", e a emissão acontece depois do commit.
 */

const WEBHOOK_TOKEN = vi.hoisted(() => {
  const token = 'token-de-webhook-de-teste-com-mais-de-32-caracteres'
  process.env.ASAAS_WEBHOOK_TOKEN = token
  return token
})

const state = vi.hoisted(() => ({
  charge: {} as Record<string, unknown>,
  sub: {} as Record<string, unknown>,
  events: [] as Record<string, unknown>[],
  seen: new Set<string>(),
  inTransaction: false,
  emittedInsideTransaction: false,
}))

const notifyClubChargePaid = vi.hoisted(() =>
  vi.fn(async (_input: { chargeId: string; firstPayment: boolean }) => {
    if (state.inTransaction) state.emittedInsideTransaction = true
  }),
)

vi.mock('@/lib/notifications', () => ({ notifyClubChargePaid }))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  type Op = { name: string; args: unknown[] }
  const OPEN = ['pending', 'overdue', 'failed']

  function chain(resolve: (ops: Op[]) => unknown) {
    const ops: Op[] = []
    const proxy: unknown = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) => {
            try {
              return Promise.resolve(resolve(ops)).then(onFulfilled, onRejected)
            } catch (error) {
              return Promise.reject(error).then(onFulfilled, onRejected)
            }
          }
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
    select: (fields?: unknown) =>
      chain(ops => {
        const table = arg(ops, 'from') as unknown
        if (table === schema.clubCharges) return fields ? [] : [{ ...state.charge }]
        if (table === schema.clubSubscriptions) return [{ ...state.sub }]
        if (table === schema.organization) return [{ slug: 'mapcard2' }]
        return []
      }),
    insert: (table: unknown) =>
      chain(ops => {
        const values = arg(ops, 'values')
        if (table !== schema.paymentEvents) return []
        const external = values.externalEventId as string | null
        if (external && state.seen.has(`${values.gatewayProvider}:${external}`)) return []
        if (external) state.seen.add(`${values.gatewayProvider}:${external}`)
        state.events.push(values)
        return [{ id: `evt-row-${state.events.length}` }]
      }),
    update: (table: unknown) =>
      chain(ops => {
        const set = arg(ops, 'set')
        if (table === schema.clubCharges) {
          const allowed =
            set.status === 'paid'
              ? OPEN.includes(state.charge.status as string)
              : set.status === 'overdue'
                ? state.charge.status === 'pending'
                : set.status === 'refunded'
                  ? state.charge.status === 'paid'
                  : true
          if (!allowed) return []
          Object.assign(state.charge, set)
          return [{ ...state.charge }]
        }
        if (table === schema.clubSubscriptions) {
          if (set.status === 'active' && !['pending_payment', 'past_due', 'suspended'].includes(state.sub.status as string)) return []
          Object.assign(state.sub, set)
          return [{ ...state.sub }]
        }
        return []
      }),
    execute: async () => [{ max: 41 }],
    transaction: async (work: (tx: unknown) => unknown) => {
      state.inTransaction = true
      try {
        return await work(db)
      } finally {
        state.inTransaction = false
      }
    },
  }
  return { db, sql: {} }
})

const { handleGatewayEvent } = await import('@/modules/club-billing/events.service')
const { webhooksController } = await import('@/modules/club-billing/webhook-controller')
const { errorHandler } = await import('@/http/errors')

const CHARGE_ID = '6f1c2b1e-1111-4222-8333-944455556666'
const SUB_ID = '6f1c2b1e-1111-4222-8333-944455556667'

beforeEach(() => {
  notifyClubChargePaid.mockClear()
  state.charge = {
    id: CHARGE_ID,
    organizationId: 'org-1',
    subscriptionId: SUB_ID,
    periodStart: '2026-09-27',
    periodEnd: '2026-10-27',
    dueDate: '2026-09-27',
    amount: '79.70',
    method: 'pix',
    status: 'pending',
    gatewayProvider: 'asaas',
    gatewayChargeId: 'pay_123',
    attempts: 0,
  }
  state.sub = {
    id: SUB_ID,
    organizationId: 'org-1',
    status: 'pending_payment',
    cardNumber: null,
    startedAt: null,
    currentPeriodStart: null,
    nextDueDate: null,
    gatewayProvider: 'asaas',
  }
  state.events = []
  state.seen = new Set()
  state.emittedInsideTransaction = false
})

const event = (id: string, type = 'PAYMENT_RECEIVED') => ({
  id,
  event: type,
  payment: { id: 'pay_123', externalReference: CHARGE_ID, status: 'RECEIVED', value: 79.7, billingType: 'PIX' },
})
const ctx = { source: 'webhook' as const, provider: 'asaas' as const }

describe('notificação de pagamento (handler único de eventos)', () => {
  it('1º pagamento: uma notificação só, "nova assinatura paga", depois do commit', async () => {
    await handleGatewayEvent(event('evt_1'), ctx)
    expect(notifyClubChargePaid).toHaveBeenCalledTimes(1)
    expect(notifyClubChargePaid).toHaveBeenCalledWith({ chargeId: CHARGE_ID, firstPayment: true })
    expect(state.emittedInsideTransaction).toBe(false)
  })

  it('webhook reprocessado (mesmo id) não duplica', async () => {
    await handleGatewayEvent(event('evt_1'), ctx)
    const again = await handleGatewayEvent(event('evt_1'), ctx)
    expect(again.status).toBe('duplicate')
    expect(notifyClubChargePaid).toHaveBeenCalledTimes(1)
  })

  it('CONFIRMED e depois RECEIVED (mesmo efeito) notificam uma vez', async () => {
    await handleGatewayEvent(event('evt_1', 'PAYMENT_CONFIRMED'), ctx)
    const second = await handleGatewayEvent(event('evt_2', 'PAYMENT_RECEIVED'), ctx)
    expect(second.status).toBe('recorded')
    expect(notifyClubChargePaid).toHaveBeenCalledTimes(1)
  })

  it('pagamento de ciclo (assinatura já ativa) → "pagamento recebido"', async () => {
    state.sub.status = 'active'
    state.sub.cardNumber = 'MAP-2026-00001'
    await handleGatewayEvent(event('evt_ciclo'), ctx)
    expect(notifyClubChargePaid).toHaveBeenCalledWith({ chargeId: CHARGE_ID, firstPayment: false })
  })

  it('eventos que não são pagamento não notificam', async () => {
    await handleGatewayEvent(event('evt_o', 'PAYMENT_OVERDUE'), ctx)
    await handleGatewayEvent(event('evt_v', 'PAYMENT_BANK_SLIP_VIEWED'), ctx)
    expect(notifyClubChargePaid).not.toHaveBeenCalled()
  })

  it('reentrega pelo webhook HTTP também não duplica', async () => {
    const app = new Hono().route('/api/v1/webhooks', webhooksController)
    app.onError(errorHandler)
    const post = () =>
      app.request('/api/v1/webhooks/asaas', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'asaas-access-token': WEBHOOK_TOKEN },
        body: JSON.stringify(event('evt_http')),
      })
    expect((await post()).status).toBe(200)
    expect((await post()).status).toBe(200)
    expect((await post()).status).toBe(200)
    expect(notifyClubChargePaid).toHaveBeenCalledTimes(1)
  })
})
