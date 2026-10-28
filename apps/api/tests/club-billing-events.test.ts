import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Handler único de eventos + webhook, com um banco FALSO em memória (nenhuma
 * conexão real): dedupe por id do evento, idempotência por status (CONFIRMED
 * e RECEIVED mudam a cobrança uma vez só), ativação com carteirinha, payload
 * sem dado de cartão e token do webhook.
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
            set.status === 'paid' ? OPEN.includes(state.charge.status as string) : set.status === 'overdue' ? state.charge.status === 'pending' : true
          if (!allowed) return []
          state.chargeUpdates += 1
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
    transaction: async (work: (tx: unknown) => unknown) => work(db),
  }
  return { db, sql: {} }
})

// Webhook por clube: cada clube tem token próprio (org-2 = outro clube com conta; org-3 = sem conta).
vi.mock('@/modules/club-billing/receiving-account.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/club-billing/receiving-account.service')>()),
  loadClubWebhookToken: async (orgId: string) =>
    orgId === 'org-1' ? WEBHOOK_TOKEN : orgId === 'org-2' ? 'token-do-outro-clube-com-mais-de-32-caracteres' : null,
}))

const { handleGatewayEvent } = await import('@/modules/club-billing/events.service')
const { webhooksController } = await import('@/modules/club-billing/webhook-controller')
const { errorHandler } = await import('@/http/errors')

const CHARGE_ID = '6f1c2b1e-1111-4222-8333-944455556666'
const SUB_ID = '6f1c2b1e-1111-4222-8333-944455556667'

beforeEach(() => {
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
  state.chargeUpdates = 0
})

const received = (id: string, event = 'PAYMENT_RECEIVED') => ({
  id,
  event,
  payment: { id: 'pay_123', externalReference: CHARGE_ID, status: 'RECEIVED', value: 79.7, billingType: 'PIX' },
})

describe('handleGatewayEvent', () => {
  it('pagamento ativa a assinatura e emite a carteirinha', async () => {
    const outcome = await handleGatewayEvent(received('evt_1'), {
      source: 'webhook',
      provider: 'asaas',
      now: new Date('2026-09-27T15:00:00Z'),
    })
    expect(outcome.status).toBe('applied')
    expect(state.charge.status).toBe('paid')
    expect(state.charge.paidAmount).toBe('79.7')
    expect(state.sub.status).toBe('active')
    expect(state.sub.cardNumber).toBe('MAP-2026-00042')
    expect(state.sub.nextDueDate).toBe('2026-10-27')
    expect(state.events.map(e => e.type)).toEqual(['PAYMENT_RECEIVED', 'SUBSCRIPTION_ACTIVATED'])
  })

  it('evento repetido (mesmo id) é descartado sem mexer em nada', async () => {
    await handleGatewayEvent(received('evt_1'), { source: 'webhook', provider: 'asaas' })
    const updates = state.chargeUpdates
    const again = await handleGatewayEvent(received('evt_1'), { source: 'webhook', provider: 'asaas' })
    expect(again.status).toBe('duplicate')
    expect(state.chargeUpdates).toBe(updates)
    expect(state.events).toHaveLength(2)
  })

  it('outro evento com o mesmo efeito só registra (idempotência por status)', async () => {
    await handleGatewayEvent(received('evt_1', 'PAYMENT_CONFIRMED'), { source: 'webhook', provider: 'asaas' })
    const second = await handleGatewayEvent(received('evt_2', 'PAYMENT_RECEIVED'), { source: 'webhook', provider: 'asaas' })
    expect(second.status).toBe('recorded')
    expect(state.events.map(e => e.type)).toEqual(['PAYMENT_CONFIRMED', 'SUBSCRIPTION_ACTIVATED', 'PAYMENT_RECEIVED'])
  })

  it('evento de tipo desconhecido é gravado e não muda estado', async () => {
    const outcome = await handleGatewayEvent(received('evt_9', 'PAYMENT_BANK_SLIP_VIEWED'), { source: 'webhook', provider: 'asaas' })
    expect(outcome.status).toBe('recorded')
    expect(state.charge.status).toBe('pending')
  })

  it('nunca grava token ou número de cartão no payload do evento', async () => {
    await handleGatewayEvent(
      {
        id: 'evt_card',
        event: 'PAYMENT_CONFIRMED',
        payment: {
          id: 'pay_123',
          externalReference: CHARGE_ID,
          value: 79.7,
          creditCard: { creditCardNumber: '4444', creditCardBrand: 'MASTERCARD', creditCardToken: 'tok_segredo' },
        },
      },
      { source: 'webhook', provider: 'asaas' },
    )
    const stored = JSON.stringify(state.events)
    expect(stored).not.toContain('tok_segredo')
    expect(stored).toContain('"last4":"4444"')
    expect(state.sub.cardToken).toBe('tok_segredo') // token vai para a assinatura (recorrência), não para a timeline
  })
})

describe('POST /api/v1/webhooks/asaas/clube/:organizationId', () => {
  const app = new Hono().route('/api/v1/webhooks', webhooksController)
  app.onError(errorHandler)

  const post = (token: string | null, body: unknown, orgId = 'org-1') =>
    app.request(`/api/v1/webhooks/asaas/clube/${orgId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { 'asaas-access-token': token } : {}) },
      body: JSON.stringify(body),
    })

  it('token errado ou ausente → 401', async () => {
    expect((await post('errado', received('evt_1'))).status).toBe(401)
    expect((await post(null, received('evt_1'))).status).toBe(401)
    expect(state.events).toHaveLength(0)
  })

  it('clube sem conta de recebimento → 401 (mesmo com o token de outro clube)', async () => {
    expect((await post(WEBHOOK_TOKEN, received('evt_1'), 'org-3')).status).toBe(401)
    expect(state.events).toHaveLength(0)
  })

  it('token de um clube não vale no webhook de outro', async () => {
    expect((await post(WEBHOOK_TOKEN, received('evt_1'), 'org-2')).status).toBe(401)
    expect(state.charge.status).toBe('pending')
  })

  it('token certo → 200 { received: true } e processa pelo handler único', async () => {
    const response = await post(WEBHOOK_TOKEN, received('evt_1'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { received: true } })
    expect(state.charge.status).toBe('paid')
    // Reentrega do mesmo evento: 200 de novo, sem duplicar.
    expect((await post(WEBHOOK_TOKEN, received('evt_1'))).status).toBe(200)
    expect(state.events.filter(e => e.type === 'PAYMENT_RECEIVED')).toHaveLength(1)
  })

  it('cobrança de OUTRO clube no webhook deste → 200, registrada só no log e ignorada', async () => {
    const response = await post('token-do-outro-clube-com-mais-de-32-caracteres', received('evt_x'), 'org-2')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { received: true } })
    expect(state.charge.status).toBe('pending')
    expect(state.events).toHaveLength(0)
  })

  it('evento sem cobrança (ex.: transferência) → 200 sem processar', async () => {
    const response = await post(WEBHOOK_TOKEN, { id: 'evt_t', event: 'TRANSFER_DONE' })
    expect(response.status).toBe(200)
    expect(state.events).toHaveLength(0)
  })

  it('rota global antiga /webhooks/asaas → 410, sem processar', async () => {
    const response = await app.request('/api/v1/webhooks/asaas', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'asaas-access-token': WEBHOOK_TOKEN },
      body: JSON.stringify(received('evt_1')),
    })
    expect(response.status).toBe(410)
    expect(state.events).toHaveLength(0)
    expect(state.charge.status).toBe('pending')
  })
})
