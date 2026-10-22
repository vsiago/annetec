import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Eventos "de exceção" do Asaas no handler único do clube, com banco FALSO em
 * memória: chargeback (cobrança estornada + assinatura suspensa, idempotente,
 * suspensão que a reativação automática não desfaz), pagamento órfão (id
 * antigo da cobrança → registro + log de erro, nada muda), restauração de
 * cobrança removida e webhook sempre 200.
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
  chargeUpdates: 0,
}))

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: log }))
vi.mock('@/lib/notifications', () => ({ notifyClubChargePaid: async () => {} }))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  type Op = { name: string; args: unknown[] }
  const OPEN = ['pending', 'overdue', 'failed']
  const CHARGEBACK = ['PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE']

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

  /** Simula o `chargebackHold`: chargeback de mensalidade sem reativação manual depois. */
  function holdRows() {
    let held = false
    for (const event of state.events) {
      if (CHARGEBACK.includes(event.type as string) && state.charge.kind === 'cycle') held = true
      if (event.type === 'SUBSCRIPTION_REACTIVATED' && event.source === 'manual') held = false
    }
    return held ? [{ id: 'hold' }] : []
  }

  const db = {
    select: (fields?: unknown) =>
      chain(ops => {
        const table = arg(ops, 'from') as unknown
        if (table === schema.clubCharges) return fields ? [] : [{ ...state.charge }]
        if (table === schema.clubSubscriptions) return [{ ...state.sub }]
        if (table === schema.paymentEvents) return holdRows()
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
          const current = state.charge.status as string
          const allowed =
            set.status === 'paid' || set.status === 'failed'
              ? OPEN.includes(current)
              : set.status === 'refunded'
                ? current === 'paid'
                : 'canceledAt' in set && set.canceledAt === null
                  ? current === 'canceled'
                  : set.status === 'overdue'
                    ? current === 'pending'
                    : true
          if (!allowed) return []
          state.chargeUpdates += 1
          Object.assign(state.charge, set)
          return [{ ...state.charge }]
        }
        if (table === schema.clubSubscriptions) {
          const current = state.sub.status as string
          const from: Record<string, string[]> = {
            active: ['pending_payment', 'past_due', 'suspended'],
            suspended: ['active', 'past_due'],
            past_due: ['active'],
          }
          if (typeof set.status === 'string' && from[set.status] && !from[set.status]!.includes(current)) return []
          Object.assign(state.sub, set)
          return [{ ...state.sub }]
        }
        return []
      }),
    execute: async () => [{ max: 41 }],
    transaction: async (work: (tx: unknown) => unknown) => work(db),
  }
  return { db, sql: {} }
})

const { db } = await import('@/db/client')
const { handleGatewayEvent, reactivateIfSettled } = await import('@/modules/club-billing/events.service')
const { webhooksController } = await import('@/modules/club-billing/webhook-controller')
const { errorHandler } = await import('@/http/errors')

const CHARGE_ID = '6f1c2b1e-1111-4222-8333-944455556666'
const SUB_ID = '6f1c2b1e-1111-4222-8333-944455556667'
const NOW = new Date('2026-10-20T15:00:00Z')

beforeEach(() => {
  state.charge = {
    id: CHARGE_ID,
    organizationId: 'org-1',
    subscriptionId: SUB_ID,
    kind: 'cycle',
    periodStart: '2026-09-27',
    periodEnd: '2026-10-27',
    dueDate: '2026-09-27',
    amount: '79.70',
    paidAmount: '79.70',
    method: 'credit_card',
    status: 'paid',
    description: 'Clube · Plano Plus · 09/2026',
    gatewayProvider: 'asaas',
    gatewayChargeId: 'pay_123',
    attempts: 1,
  }
  state.sub = { id: SUB_ID, organizationId: 'org-1', status: 'active', gatewayProvider: 'asaas' }
  state.events = []
  state.seen = new Set()
  state.chargeUpdates = 0
  for (const fn of Object.values(log)) fn.mockClear()
})

const event = (id: string, type: string, paymentId = 'pay_123') => ({
  id,
  event: type,
  payment: { id: paymentId, externalReference: CHARGE_ID, value: 79.7, billingType: 'CREDIT_CARD' },
})
const webhook = { source: 'webhook' as const, provider: 'asaas' as const, now: NOW }

describe('chargeback', () => {
  it('cobrança paga → estornada, assinatura suspensa, log de erro; reentrega e disputa não repetem nada', async () => {
    const first = await handleGatewayEvent(event('evt_cb_1', 'PAYMENT_CHARGEBACK_REQUESTED'), webhook)
    expect(first.status).toBe('applied')
    expect(state.charge.status).toBe('refunded')
    expect(state.charge.refundedAt).toEqual(NOW)
    expect(state.charge.failureReason).toMatch(/chargeback/i)
    expect(state.sub.status).toBe('suspended')
    expect(state.sub.suspendedAt).toEqual(NOW)
    expect(state.events.map(e => e.type)).toEqual(['PAYMENT_CHARGEBACK_REQUESTED', 'SUBSCRIPTION_SUSPENDED'])
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ alert: 'chargeback', chargeId: CHARGE_ID, value: 79.7 }), expect.any(String))

    const updates = state.chargeUpdates
    expect((await handleGatewayEvent(event('evt_cb_1', 'PAYMENT_CHARGEBACK_REQUESTED'), webhook)).status).toBe('duplicate')
    expect((await handleGatewayEvent(event('evt_cb_2', 'PAYMENT_CHARGEBACK_DISPUTE'), webhook)).status).toBe('recorded')
    expect(state.chargeUpdates).toBe(updates)
    expect(state.events.filter(e => e.type === 'SUBSCRIPTION_SUSPENDED')).toHaveLength(1)
  })

  it('a reativação automática não libera a assinatura até uma reativação manual', async () => {
    await handleGatewayEvent(event('evt_cb_1', 'PAYMENT_CHARGEBACK_REQUESTED'), webhook)
    const ctx = { source: 'automation' as const, provider: 'asaas' as const }
    expect(await reactivateIfSettled(db as never, { id: SUB_ID, organizationId: 'org-1' }, ctx, NOW)).toBe(false)
    expect(state.sub.status).toBe('suspended')

    // "Reativar" do admin grava SUBSCRIPTION_REACTIVATED manual → a trava cai.
    state.events.push({ type: 'SUBSCRIPTION_REACTIVATED', source: 'manual' })
    state.sub.status = 'past_due'
    expect(await reactivateIfSettled(db as never, { id: SUB_ID, organizationId: 'org-1' }, ctx, NOW)).toBe(true)
    expect(state.sub.status).toBe('active')
  })

  it('avulsa com chargeback: só a cobrança muda', async () => {
    state.charge.kind = 'one_off'
    const outcome = await handleGatewayEvent(event('evt_cb_3', 'PAYMENT_CHARGEBACK_REQUESTED'), webhook)
    expect(outcome.status).toBe('applied')
    expect(state.charge.status).toBe('refunded')
    expect(state.sub.status).toBe('active')
  })

  it('reversão aguardando e estorno parcial: só registram (e logam)', async () => {
    expect((await handleGatewayEvent(event('evt_r', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL'), webhook)).status).toBe('recorded')
    expect((await handleGatewayEvent(event('evt_p', 'PAYMENT_PARTIALLY_REFUNDED'), webhook)).status).toBe('recorded')
    expect(state.charge.status).toBe('paid')
    expect(state.sub.status).toBe('active')
    expect(log.warn).toHaveBeenCalledTimes(2)
  })
})

describe('pagamento órfão (id antigo da cobrança)', () => {
  beforeEach(() => {
    state.charge.status = 'pending'
    state.charge.method = 'pix'
    state.charge.gatewayChargeId = 'pay_novo'
    state.charge.paidAmount = null
    state.sub.status = 'pending_payment'
  })

  it('dinheiro no pagamento antigo: grava PAYMENT_ORPHAN_RECEIVED com dados do estorno e loga erro; nada muda', async () => {
    const outcome = await handleGatewayEvent(event('evt_o1', 'PAYMENT_RECEIVED', 'pay_antigo'), webhook)
    expect(outcome.status).toBe('recorded')
    expect(state.charge.status).toBe('pending')
    expect(state.sub.status).toBe('pending_payment')
    expect(state.chargeUpdates).toBe(0)
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({ type: 'PAYMENT_ORPHAN_RECEIVED', chargeId: CHARGE_ID, externalEventId: 'evt_o1' })
    expect(state.events[0]!.payload).toMatchObject({ orphan: true, currentGatewayChargeId: 'pay_novo', payment: { id: 'pay_antigo', value: 79.7 } })
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ alert: 'orphan_payment', chargeId: CHARGE_ID, gatewayPaymentId: 'pay_antigo', value: 79.7 }),
      expect.stringMatching(/ESTORNO MANUAL/),
    )
    // Reentrega: não duplica a linha nem o alerta.
    expect((await handleGatewayEvent(event('evt_o1', 'PAYMENT_RECEIVED', 'pay_antigo'), webhook)).status).toBe('duplicate')
    expect(log.error).toHaveBeenCalledTimes(1)
  })

  it('PAYMENT_DELETED do pagamento antigo (cancelamento que deu certo) segue ignorado', async () => {
    const outcome = await handleGatewayEvent(event('evt_o2', 'PAYMENT_DELETED', 'pay_antigo'), webhook)
    expect(outcome.status).toBe('ignored')
    expect(state.events).toHaveLength(0)
    expect(state.charge.status).toBe('pending')
  })

  it('pagamento numa cobrança encerrada (ex.: checkout substituído) loga erro para estorno', async () => {
    state.charge.status = 'canceled'
    state.charge.gatewayChargeId = 'pay_123'
    const outcome = await handleGatewayEvent(event('evt_o3', 'PAYMENT_RECEIVED'), webhook)
    expect(outcome.status).toBe('recorded')
    expect(state.charge.status).toBe('canceled')
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ alert: 'payment_on_closed_charge', chargeId: CHARGE_ID }), expect.any(String))
  })
})

describe('PAYMENT_RESTORED', () => {
  it('cobrança cancelada com o mesmo pagamento volta vencida e põe a assinatura em atraso', async () => {
    state.charge.status = 'canceled'
    state.charge.canceledAt = new Date('2026-10-01T12:00:00Z')
    const outcome = await handleGatewayEvent(event('evt_rs', 'PAYMENT_RESTORED'), webhook)
    expect(outcome.status).toBe('applied')
    expect(state.charge.status).toBe('overdue')
    expect(state.charge.canceledAt).toBeNull()
    expect(state.sub.status).toBe('past_due')
  })

  it('assinatura cancelada: só registra', async () => {
    state.charge.status = 'canceled'
    state.sub.status = 'canceled'
    expect((await handleGatewayEvent(event('evt_rs2', 'PAYMENT_RESTORED'), webhook)).status).toBe('recorded')
    expect(state.charge.status).toBe('canceled')
  })
})

describe('webhook: eventos novos sempre 200', () => {
  const app = new Hono().route('/api/v1/webhooks', webhooksController)
  app.onError(errorHandler)
  const post = (body: unknown) =>
    app.request('/api/v1/webhooks/asaas', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'asaas-access-token': WEBHOOK_TOKEN },
      body: JSON.stringify(body),
    })

  it('chargeback, PAYMENT_UPDATED e órfão → 200 { received: true }', async () => {
    for (const body of [
      event('evt_w1', 'PAYMENT_CHARGEBACK_REQUESTED'),
      event('evt_w2', 'PAYMENT_UPDATED'),
      event('evt_w3', 'PAYMENT_RECEIVED', 'pay_outro'),
    ]) {
      const response = await post(body)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ success: true, data: { received: true } })
    }
    expect(state.sub.status).toBe('suspended')
    expect(state.events.map(e => e.type)).toEqual([
      'PAYMENT_CHARGEBACK_REQUESTED',
      'SUBSCRIPTION_SUSPENDED',
      'PAYMENT_UPDATED',
      'PAYMENT_ORPHAN_RECEIVED',
    ])
  })
})
