import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cobrança AVULSA no handler único de eventos (banco falso em memória): paga,
 * vencida ou recusada, ela muda só a própria linha — nunca ativa, renova,
 * reativa, emite carteirinha, troca o cartão da recorrência nem põe a
 * assinatura em atraso. Mensalidade adiantada paga se comporta como qualquer
 * mensalidade paga.
 */

const state = vi.hoisted(() => ({
  charge: {} as Record<string, unknown>,
  sub: {} as Record<string, unknown>,
  events: [] as Record<string, unknown>[],
  seen: new Set<string>(),
  subUpdates: 0,
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
        return []
      }),
    insert: (table: unknown) =>
      chain(ops => {
        const values = arg(ops, 'values')
        if (table !== schema.paymentEvents) return []
        const external = values.externalEventId as string | null
        if (external && state.seen.has(external)) return []
        if (external) state.seen.add(external)
        state.events.push(values)
        return [{ id: `evt-${state.events.length}` }]
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
                : set.status === 'failed'
                  ? ['pending', 'failed'].includes(state.charge.status as string)
                  : true
          if (!allowed) return []
          Object.assign(state.charge, set)
          return [{ ...state.charge }]
        }
        if (table === schema.clubSubscriptions) {
          state.subUpdates += 1
          if (set.status === 'past_due' && state.sub.status !== 'active') return []
          if (set.status === 'active' && !['pending_payment', 'past_due', 'suspended'].includes(state.sub.status as string)) return []
          Object.assign(state.sub, set)
          return [{ ...state.sub }]
        }
        return []
      }),
    execute: async () => [{ max: 0 }],
    transaction: async (work: (tx: unknown) => unknown) => work(db),
  }
  return { db, sql: {} }
})

const { handleGatewayEvent } = await import('@/modules/club-billing/events.service')
const { clubPaymentNotifications } = await import('@/lib/notifications')

const CHARGE_ID = '6f1c2b1e-1111-4222-8333-944455556666'
const SUB_ID = '6f1c2b1e-1111-4222-8333-944455556667'

function setup(kind: 'one_off' | 'cycle', subStatus: string, chargeOverrides: Record<string, unknown> = {}) {
  state.charge = {
    id: CHARGE_ID,
    organizationId: 'org-1',
    subscriptionId: SUB_ID,
    kind,
    description: kind === 'one_off' ? '2ª via da carteirinha' : 'Mapcard · Plano Plus · 11/2026',
    periodStart: kind === 'one_off' ? '2026-10-09' : '2026-11-10',
    periodEnd: kind === 'one_off' ? '2026-10-09' : '2026-12-10',
    dueDate: '2026-10-12',
    amount: '5.00',
    method: 'pix',
    status: 'pending',
    gatewayProvider: 'asaas',
    gatewayChargeId: 'pay_1',
    attempts: 0,
    ...chargeOverrides,
  }
  state.sub = {
    id: SUB_ID,
    organizationId: 'org-1',
    status: subStatus,
    cardNumber: 'MAP-2026-00001',
    startedAt: new Date('2026-09-10T12:00:00Z'),
    currentPeriodStart: '2026-10-10',
    currentPeriodEnd: '2026-11-10',
    nextDueDate: '2026-11-10',
    gatewayProvider: 'asaas',
    cardToken: 'tok_antigo',
  }
}

const paid = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  event: 'PAYMENT_RECEIVED',
  payment: { id: 'pay_1', externalReference: CHARGE_ID, value: 5, billingType: 'PIX', ...extra },
})

beforeEach(() => {
  state.events = []
  state.seen = new Set()
  state.subUpdates = 0
})

describe('Avulsa no handler de eventos', () => {
  it('paga: só a cobrança vira paga — assinatura em atraso continua em atraso, sem renovar período', async () => {
    setup('one_off', 'past_due')
    const outcome = await handleGatewayEvent(paid('evt_1'), { source: 'webhook', provider: 'asaas', now: new Date('2026-10-10T15:00:00Z') })
    expect(outcome.status).toBe('applied')
    expect(state.charge.status).toBe('paid')
    expect(state.sub).toMatchObject({ status: 'past_due', currentPeriodStart: '2026-10-10', nextDueDate: '2026-11-10', cardToken: 'tok_antigo' })
    expect(state.subUpdates).toBe(0)
    expect(state.events.map(e => e.type)).toEqual(['PAYMENT_RECEIVED'])
    expect(String(state.events[0]!.message)).toContain('avulsa: 2ª via da carteirinha')
  })

  it('paga no cartão: não troca o cartão salvo da recorrência', async () => {
    setup('one_off', 'active', { method: 'credit_card' })
    await handleGatewayEvent(
      paid('evt_c', { billingType: 'CREDIT_CARD', creditCard: { creditCardNumber: '1111', creditCardBrand: 'VISA', creditCardToken: 'tok_novo' } }),
      { source: 'webhook', provider: 'asaas' },
    )
    expect(state.charge.status).toBe('paid')
    expect(state.sub.cardToken).toBe('tok_antigo')
  })

  it('vencida ou recusada: não deixa a assinatura em atraso', async () => {
    setup('one_off', 'active')
    await handleGatewayEvent(
      { id: 'evt_o', event: 'PAYMENT_OVERDUE', payment: { id: 'pay_1', externalReference: CHARGE_ID, value: 5 } },
      { source: 'webhook', provider: 'asaas', now: new Date('2026-10-13T15:00:00Z') },
    )
    expect(state.charge.status).toBe('overdue')
    expect(state.sub.status).toBe('active')

    setup('one_off', 'active', { method: 'credit_card', dueDate: '2026-10-09', gatewayChargeId: null })
    await handleGatewayEvent(
      { id: null, event: 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', payment: { id: null, externalReference: CHARGE_ID, value: 5 } },
      { source: 'manual', provider: 'asaas', failureReason: 'Não autorizada', now: new Date('2026-10-10T15:00:00Z') },
    )
    expect(state.charge.status).toBe('failed')
    expect(state.sub.status).toBe('active')
    expect(state.events.some(e => e.type === 'SUBSCRIPTION_PAST_DUE')).toBe(false)
  })

  it('mensalidade adiantada paga se comporta como mensalidade paga (renova o período)', async () => {
    setup('cycle', 'active')
    await handleGatewayEvent(paid('evt_a'), { source: 'webhook', provider: 'asaas', now: new Date('2026-10-10T15:00:00Z') })
    expect(state.charge.status).toBe('paid')
    expect(state.sub).toMatchObject({ currentPeriodStart: '2026-11-10', currentPeriodEnd: '2026-12-10', nextDueDate: '2026-12-10' })
  })

  it('mensalidade vencida continua pondo a assinatura em atraso (régua intacta)', async () => {
    setup('cycle', 'active')
    await handleGatewayEvent(
      { id: 'evt_oc', event: 'PAYMENT_OVERDUE', payment: { id: 'pay_1', externalReference: CHARGE_ID, value: 5 } },
      { source: 'webhook', provider: 'asaas' },
    )
    expect(state.sub.status).toBe('past_due')
  })
})

describe('Notificação de pagamento da avulsa', () => {
  it('"Pagamento recebido" com a descrição da avulsa e a mesma chave de deduplicação', () => {
    const rows = clubPaymentNotifications({
      tenant: { id: 'org-1', slug: 'mapcard2', name: 'Mapcard' },
      chargeId: CHARGE_ID,
      subscriptionId: SUB_ID,
      userId: 'user-1',
      personName: 'Maria Souza',
      planName: 'Plus',
      amount: 5,
      methodLabel: 'Pix',
      firstPayment: false,
      chargeDescription: '2ª via da carteirinha',
    })
    expect(rows[0]).toMatchObject({
      kind: 'payment_received',
      title: 'Pagamento recebido',
      body: 'Maria Souza · 2ª via da carteirinha · Pix',
      dedupeKey: `club_charge_paid:${CHARGE_ID}`,
      payload: { chargeDescription: '2ª via da carteirinha' },
    })
    expect(rows[1]!.dedupeKey).toBe(`club_charge_paid:${CHARGE_ID}`)
  })
})
