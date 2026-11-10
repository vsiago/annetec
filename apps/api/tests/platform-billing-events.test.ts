import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Handler único da cobrança da PLATAFORMA + webhook próprio, com banco FALSO
 * em memória (nenhuma conexão real): ativação paga dispara o provisionamento
 * UMA vez (evento repetido = duplicate; CONFIRMED + RECEIVED mudam a fatura
 * uma vez só), mensalidade paga reativa o painel e limpa o cache do guard,
 * vencimento põe em atraso, payload sem dado de cartão e token do webhook.
 */

const WEBHOOK_TOKEN = vi.hoisted(() => {
  const token = 'token-do-webhook-da-plataforma-com-mais-de-32-caracteres'
  process.env.PLATFORM_ASAAS_WEBHOOK_TOKEN = token
  return token
})

const state = vi.hoisted(() => ({
  charge: {} as Record<string, unknown>,
  sub: null as Record<string, unknown> | null,
  events: [] as Record<string, unknown>[],
  seen: new Set<string>(),
  chargeUpdates: 0,
  tenantUpdates: [] as Record<string, unknown>[],
  otherOverdue: false,
  onActivationPaid: [] as unknown[][],
  emails: [] as { template: string; to: { email: string } }[],
  invalidated: [] as unknown[],
}))

vi.mock('@/http/middleware/platform-access', () => ({
  invalidatePlatformAccessCache: (id?: string) => {
    state.invalidated.push(id)
  },
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

  /** Valores (parâmetros) de um `where` do drizzle. */
  function whereValues(node: unknown, out: unknown[] = []): unknown[] {
    if (typeof node === 'string') out.push(node)
    else if (node && typeof node === 'object') {
      if (Array.isArray((node as { queryChunks?: unknown[] }).queryChunks)) {
        for (const chunk of (node as { queryChunks: unknown[] }).queryChunks) whereValues(chunk, out)
      } else if ((node as object).constructor?.name === 'Param') out.push((node as { value: unknown }).value)
    }
    return out
  }

  const db: Record<string, unknown> = {
    select: (fields?: unknown) =>
      chain(ops => {
        const table = arg(ops, 'from') as unknown
        if (table === schema.platformCharges) return fields ? (state.otherOverdue ? [{ id: 'outra' }] : []) : [{ ...state.charge }]
        if (table === schema.platformSubscriptions) {
          if (!state.sub) return []
          return fields
            ? [{ email: state.sub.billingEmail, name: state.sub.billingName, orgId: state.sub.organizationId }]
            : [{ ...state.sub }]
        }
        if (table === schema.platformBillingEvents && fields && 'orphanEventId' in (fields as object)) {
          const values = whereValues(arg(ops, 'where'))
          return state.events
            .filter(e => e.type === 'PAYMENT_ORPHAN_RECEIVED')
            .filter(e => values.includes((e.payload as { payment: { id: string } }).payment.id))
            .map(() => ({ orphanEventId: 'orfao' }))
        }
        if (table === schema.organization) return [{ name: 'Clube ASSERV', slug: 'asserv' }]
        if (table === schema.platformOnboardingProposals) {
          return [
            {
              id: 'b2c1f9a4-0000-4000-8000-000000000001',
              code: 'ANN-2609-ABCDE',
              status: 'awaiting_payment',
              cnpj: '11222333000181',
              legalName: 'ASSOCIACAO DOS SERVIDORES DO VALE',
              tradeName: 'ASSERV',
              planId: 'plan-pro',
              paymentMethod: 'pix',
              organizationId: null,
              applicant: { name: 'Mariana Costa Lima', email: 'mariana@asserv.org', phone: '21999990000' },
              company: null,
            },
          ]
        }
        return []
      }),
    insert: (table: unknown) =>
      chain(ops => {
        const values = arg(ops, 'values')
        if (table !== schema.platformBillingEvents) return []
        const external = values.externalEventId as string | null
        if (external && state.seen.has(`${values.gatewayProvider}:${external}`)) return []
        if (external) state.seen.add(`${values.gatewayProvider}:${external}`)
        state.events.push(values)
        return [{ id: `evt-${state.events.length}` }]
      }),
    update: (table: unknown) =>
      chain(ops => {
        const set = arg(ops, 'set')
        if (table === schema.platformCharges) {
          const current = state.charge.status as string
          const allowed =
            set.status === 'paid'
              ? OPEN.includes(current)
              : set.status === 'overdue'
                ? current === 'pending'
                : set.status === 'refunded'
                  ? current === 'paid'
                  : true
          if (!allowed) return []
          state.chargeUpdates += 1
          Object.assign(state.charge, set)
          return [{ ...state.charge }]
        }
        if (table === schema.platformSubscriptions) {
          if (!state.sub) return []
          const current = state.sub.status as string
          if (set.status === 'active' && !['past_due', 'restricted', 'suspended'].includes(current)) return []
          if (set.status === 'past_due' && current !== 'active') return []
          Object.assign(state.sub, set)
          return [{ id: state.sub.id }]
        }
        if (table === schema.tenantProfiles) {
          state.tenantUpdates.push(set)
          return []
        }
        return []
      }),
    execute: async () => [],
  }
  db.transaction = async (work: (tx: unknown) => unknown) => work(db)
  return { db }
})

// Comissão do vendedor: o handler chama dentro da transação do pagamento (savepoint).
const commissionCalls = vi.hoisted(() => ({ recorded: [] as unknown[], reversed: [] as unknown[][] }))
vi.mock('@/modules/vendas-rede/comissoes.service', () => ({
  safely: async (tx: unknown, _label: string, work: (tx: unknown) => Promise<unknown>) => {
    await work(tx)
  },
  registrarComissoesDaCobrancaPaga: async ({ cobranca: charge }: { cobranca: unknown }) => {
    commissionCalls.recorded.push(charge)
    return 1
  },
  estornarComissoesDaCobranca: async (_origem: string, chargeId: string, reason: string) => {
    commissionCalls.reversed.push([chargeId, reason])
    return 1
  },
}))

vi.mock('@/modules/platform-onboarding/provisioning.service', () => ({
  onActivationPaid: async (...args: unknown[]) => {
    state.onActivationPaid.push(args)
  },
}))

vi.mock('@/lib/email', () => ({
  sendEmail: async (input: { template: string; to: { email: string } }) => {
    state.emails.push(input)
    return { id: 'mail', status: 'simulated' }
  },
}))

const { handlePlatformGatewayEvent, platformSyntheticEventId } = await import('@/modules/platform-billing/events.service')
const { logger } = await import('@/lib/logger')
const { platformReference } = await import('@/modules/platform-billing/access-key')
const { platformWebhookController } = await import('@/modules/platform-billing/webhook-controller')
const { errorHandler } = await import('@/http/errors')
const { Hono } = await import('hono')

const webhookApp = new Hono()
webhookApp.route('/webhook', platformWebhookController)
webhookApp.onError(errorHandler)

const CHARGE_ID = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const PROPOSAL_ID = 'b2c1f9a4-0000-4000-8000-000000000001'
const ORG = 'org-asserv'

function activationCharge() {
  return {
    id: CHARGE_ID,
    organizationId: null,
    subscriptionId: null,
    proposalId: PROPOSAL_ID,
    kind: 'activation',
    status: 'pending',
    amount: '1980.00',
    method: 'pix',
    dueDate: '2026-10-02',
    description: 'ANNETEC · Ativação do plano Pro · ANN-2609-ABCDE',
    gatewayProvider: 'simulated',
    gatewayChargeId: 'sim_pay_pix_0_abcd1234',
    attempts: 0,
  }
}

function monthlyCharge(status = 'overdue') {
  return {
    ...activationCharge(),
    organizationId: ORG,
    subscriptionId: 'sub-1',
    kind: 'monthly',
    status,
    amount: '990.00',
    dueDate: '2026-09-10',
    description: 'ANNETEC · Clube ASSERV · Plano Pro · 09/2026',
  }
}

function subscription(status: string) {
  return {
    id: 'sub-1',
    organizationId: ORG,
    status,
    billingEmail: 'financeiro@asserv.org',
    billingName: 'ASSOCIACAO DOS SERVIDORES DO VALE',
    gatewayProvider: 'simulated',
  }
}

const received = (id: string | null, event = 'PAYMENT_RECEIVED', extra: Record<string, unknown> = {}) => ({
  id,
  event,
  payment: { id: 'sim_pay_pix_0_abcd1234', externalReference: platformReference(CHARGE_ID), value: 1980, billingType: 'pix', ...extra },
})

beforeEach(() => {
  state.charge = activationCharge()
  state.sub = null
  state.events = []
  state.seen = new Set()
  state.chargeUpdates = 0
  state.tenantUpdates = []
  state.otherOverdue = false
  state.onActivationPaid = []
  state.emails = []
  state.invalidated = []
  commissionCalls.recorded = []
  commissionCalls.reversed = []
})

describe('handler único da plataforma — ativação', () => {
  it('ativação paga dispara onActivationPaid UMA vez; evento repetido = duplicate', async () => {
    const eventId = platformSyntheticEventId('sim_pay_pix_0_abcd1234', 'PAYMENT_RECEIVED')
    const first = await handlePlatformGatewayEvent(received(eventId), { source: 'simulation', provider: 'simulated' })
    expect(first.status).toBe('applied')
    expect(state.charge.status).toBe('paid')
    expect(state.onActivationPaid).toEqual([[PROPOSAL_ID, { source: 'simulation' }]])
    expect(state.emails.map(e => [e.template, e.to.email])).toEqual([['platform_invoice_paid', 'mariana@asserv.org']])

    const again = await handlePlatformGatewayEvent(received(eventId), { source: 'simulation', provider: 'simulated' })
    expect(again.status).toBe('duplicate')

    // CONFIRMED depois de RECEIVED (outro id): grava na timeline, não muda nada.
    const confirmed = await handlePlatformGatewayEvent(received('evt_asaas_2', 'PAYMENT_CONFIRMED'), { source: 'webhook', provider: 'simulated' })
    expect(confirmed.status).toBe('recorded')
    expect(state.onActivationPaid).toHaveLength(1)
    expect(state.chargeUpdates).toBe(1)
    expect(state.events).toHaveLength(2)
  })

  it('referência que não é da plataforma (uuid do clube) sem id do gateway é ignorada', async () => {
    const outcome = await handlePlatformGatewayEvent(
      { id: 'evt_x', event: 'PAYMENT_RECEIVED', payment: { id: null, externalReference: CHARGE_ID } },
      { source: 'webhook', provider: 'asaas' },
    )
    expect(outcome.status).toBe('ignored')
    expect(state.events).toHaveLength(0)
  })

  it('payload gravado nunca leva número/token do cartão', async () => {
    state.charge = { ...activationCharge(), method: 'credit_card', gatewayChargeId: null }
    await handlePlatformGatewayEvent(
      {
        id: 'evt_card',
        event: 'PAYMENT_CONFIRMED',
        payment: {
          id: 'sim_pay_card_1_x',
          externalReference: platformReference(CHARGE_ID),
          value: 1980,
          creditCard: { creditCardNumber: '4111111111111111', creditCardBrand: 'VISA', creditCardToken: 'tok_segredo' },
        },
      },
      { source: 'tenant', provider: 'simulated' },
    )
    const payload = JSON.stringify(state.events[0]?.payload)
    expect(payload).not.toContain('tok_segredo')
    expect(payload).not.toContain('4111111111111111')
    expect(payload).toContain('1111')
    expect(state.charge.cardLast4).toBe('1111')
  })
})

describe('handler único da plataforma — mensalidade e régua', () => {
  it('pagar a única vencida reativa (restrita → ativa), espelha o inquilino e limpa o cache do guard', async () => {
    state.charge = monthlyCharge('overdue')
    state.sub = subscription('restricted')
    const outcome = await handlePlatformGatewayEvent(
      { ...received('evt_m1'), payment: { ...received('evt_m1').payment, value: 990 } },
      { source: 'simulation', provider: 'simulated' },
    )
    expect(outcome.status).toBe('applied')
    expect(state.sub.status).toBe('active')
    expect(state.tenantUpdates).toEqual([expect.objectContaining({ status: 'active' })])
    expect(state.events.map(e => e.type)).toEqual(['PAYMENT_RECEIVED', 'SUBSCRIPTION_REACTIVATED'])
    expect(state.emails.map(e => e.template).sort()).toEqual(['platform_access_reactivated', 'platform_invoice_paid'])
    expect(state.invalidated).toContain(ORG)
    expect(state.onActivationPaid).toHaveLength(0)
  })

  it('ainda resta outra vencida → continua restrita', async () => {
    state.charge = monthlyCharge('overdue')
    state.sub = subscription('restricted')
    state.otherOverdue = true
    await handlePlatformGatewayEvent(received('evt_m2'), { source: 'simulation', provider: 'simulated' })
    expect(state.charge.status).toBe('paid')
    expect(state.sub.status).toBe('restricted')
    expect(state.events.map(e => e.type)).toEqual(['PAYMENT_RECEIVED'])
  })

  it('vencimento: pendente → vencida e assinatura ativa → em atraso', async () => {
    state.charge = monthlyCharge('pending')
    state.sub = subscription('active')
    const outcome = await handlePlatformGatewayEvent(
      { id: 'evt_overdue', event: 'PAYMENT_OVERDUE', payment: { id: 'sim_pay_pix_0_abcd1234', externalReference: platformReference(CHARGE_ID) } },
      { source: 'automation', provider: 'simulated' },
    )
    expect(outcome.status).toBe('applied')
    expect(state.charge.status).toBe('overdue')
    expect(state.sub.status).toBe('past_due')
    expect(state.events.map(e => e.type)).toEqual(['PAYMENT_OVERDUE', 'SUBSCRIPTION_PAST_DUE'])
  })
})

describe('webhook próprio da plataforma', () => {
  it('token errado → 401; token certo → sempre 200 { received: true }', async () => {
    const wrong = await webhookApp.request('/webhook', {
      method: 'POST',
      headers: { 'asaas-access-token': 'errado', 'content-type': 'application/json' },
      body: JSON.stringify(received('evt_w1')),
    })
    expect(wrong.status).toBe(401)

    // A fatura precisa estar com ESTE pagamento (outro id = pagamento órfão, ver o teste próprio).
    state.charge = { ...activationCharge(), gatewayProvider: 'asaas', gatewayChargeId: 'pay_123' }
    const ok = await webhookApp.request('/webhook', {
      method: 'POST',
      headers: { 'asaas-access-token': WEBHOOK_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ ...received('evt_w2'), payment: { ...received('evt_w2').payment, id: 'pay_123' } }),
    })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ success: true, data: { received: true } })
    expect(state.charge.status).toBe('paid')
    expect(state.onActivationPaid).toHaveLength(1)
  })
})

describe('chargeback e pagamento órfão (plataforma)', () => {
  it('chargeback na mensalidade paga: fatura estornada, painel bloqueado por override e cache limpo — idempotente', async () => {
    state.charge = { ...monthlyCharge('paid'), gatewayProvider: 'asaas', gatewayChargeId: 'pay_m1' }
    state.sub = subscription('active')
    const chargeback = (id: string, event = 'PAYMENT_CHARGEBACK_REQUESTED') => ({
      id,
      event,
      payment: { id: 'pay_m1', externalReference: platformReference(CHARGE_ID), value: 990, billingType: 'CREDIT_CARD' },
    })

    const first = await handlePlatformGatewayEvent(chargeback('evt_cb_1'), { source: 'webhook', provider: 'asaas' })
    expect(first.status).toBe('applied')
    expect(state.charge.status).toBe('refunded')
    expect(state.charge.failureReason).toMatch(/chargeback/i)
    expect(state.sub?.accessOverride).toBe('blocked')
    expect(state.sub?.accessOverrideUntil).toBeNull()
    expect(state.events.map(e => e.type)).toEqual(['PAYMENT_CHARGEBACK_REQUESTED', 'ACCESS_OVERRIDE_SET'])
    expect(state.invalidated).toContain(ORG)

    // Reentrega e disputa (outro id): nada muda de novo.
    expect((await handlePlatformGatewayEvent(chargeback('evt_cb_1'), { source: 'webhook', provider: 'asaas' })).status).toBe('duplicate')
    const dispute = await handlePlatformGatewayEvent(chargeback('evt_cb_2', 'PAYMENT_CHARGEBACK_DISPUTE'), { source: 'webhook', provider: 'asaas' })
    expect(dispute.status).toBe('recorded')
    expect(state.events.filter(e => e.type === 'ACCESS_OVERRIDE_SET')).toHaveLength(1)
  })

  it('pagamento num id antigo da fatura: grava PAYMENT_ORPHAN_RECEIVED e não toca na fatura', async () => {
    state.charge = { ...activationCharge(), gatewayProvider: 'asaas', gatewayChargeId: 'pay_novo' }
    const orphan = {
      id: 'evt_orfao',
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_antigo', externalReference: platformReference(CHARGE_ID), value: 1980, billingType: 'PIX' },
    }
    const outcome = await handlePlatformGatewayEvent(orphan, { source: 'webhook', provider: 'asaas' })
    expect(outcome.status).toBe('recorded')
    expect(state.charge.status).toBe('pending')
    expect(state.chargeUpdates).toBe(0)
    expect(state.onActivationPaid).toHaveLength(0)
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({ type: 'PAYMENT_ORPHAN_RECEIVED', chargeId: CHARGE_ID, externalEventId: 'evt_orfao' })
    expect((await handlePlatformGatewayEvent(orphan, { source: 'webhook', provider: 'asaas' })).status).toBe('duplicate')
  })

  it('disputa sem efeito loga aviso (o erro saiu só no chargeback que estornou)', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined as never)
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined as never)
    try {
      state.charge = { ...monthlyCharge('paid'), gatewayProvider: 'asaas', gatewayChargeId: 'pay_m1' }
      state.sub = subscription('active')
      const chargeback = (id: string, event: string) => ({
        id,
        event,
        payment: { id: 'pay_m1', externalReference: platformReference(CHARGE_ID), value: 990, billingType: 'CREDIT_CARD' },
      })
      await handlePlatformGatewayEvent(chargeback('evt_cb_a', 'PAYMENT_CHARGEBACK_REQUESTED'), { source: 'webhook', provider: 'asaas' })
      await handlePlatformGatewayEvent(chargeback('evt_cb_b', 'PAYMENT_CHARGEBACK_DISPUTE'), { source: 'webhook', provider: 'asaas' })
      const alerts = (spy: typeof error) => spy.mock.calls.filter(call => (call[0] as { alert?: string }).alert === 'chargeback')
      expect(alerts(error)).toHaveLength(1)
      expect(alerts(warn)).toHaveLength(1)
    } finally {
      error.mockRestore()
      warn.mockRestore()
    }
  })

  it('CONFIRMED + RECEIVED do mesmo pagamento órfão: duas linhas, um alerta só', async () => {
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined as never)
    try {
      state.charge = { ...activationCharge(), gatewayProvider: 'asaas', gatewayChargeId: 'pay_novo' }
      const orphan = (id: string, event: string, paymentId = 'pay_antigo') => ({
        id,
        event,
        payment: { id: paymentId, externalReference: platformReference(CHARGE_ID), value: 1980, billingType: 'PIX' },
      })
      await handlePlatformGatewayEvent(orphan('evt_oc', 'PAYMENT_CONFIRMED'), { source: 'webhook', provider: 'asaas' })
      await handlePlatformGatewayEvent(orphan('evt_or', 'PAYMENT_RECEIVED'), { source: 'webhook', provider: 'asaas' })
      expect(state.events.filter(e => e.type === 'PAYMENT_ORPHAN_RECEIVED')).toHaveLength(2)
      const alerts = () => error.mock.calls.filter(call => (call[0] as { alert?: string }).alert === 'orphan_payment')
      expect(alerts()).toHaveLength(1)
      await handlePlatformGatewayEvent(orphan('evt_o2', 'PAYMENT_RECEIVED', 'pay_outro'), { source: 'webhook', provider: 'asaas' })
      expect(alerts()).toHaveLength(2)
    } finally {
      error.mockRestore()
    }
  })
})

describe('comissão do vendedor ANNETEC no handler da cobrança', () => {
  it('ativação paga gera a comissão UMA vez (evento repetido e CONFIRMED depois não geram de novo)', async () => {
    const eventId = platformSyntheticEventId('sim_pay_pix_0_abcd1234', 'PAYMENT_RECEIVED')
    await handlePlatformGatewayEvent(received(eventId), { source: 'simulation', provider: 'simulated' })
    await handlePlatformGatewayEvent(received(eventId), { source: 'simulation', provider: 'simulated' })
    await handlePlatformGatewayEvent(received('evt_asaas_9', 'PAYMENT_CONFIRMED'), { source: 'webhook', provider: 'simulated' })
    expect(commissionCalls.recorded).toHaveLength(1)
    expect(commissionCalls.recorded[0]).toMatchObject({ id: CHARGE_ID, kind: 'activation', status: 'paid', proposalId: PROPOSAL_ID })
  })

  it('mensalidade paga também passa pela comissão; vencimento não', async () => {
    state.charge = monthlyCharge('overdue')
    state.sub = subscription('restricted')
    await handlePlatformGatewayEvent(received('evt_cm1'), { source: 'simulation', provider: 'simulated' })
    expect(commissionCalls.recorded).toHaveLength(1)
    state.charge = monthlyCharge('pending')
    await handlePlatformGatewayEvent(
      { id: 'evt_cm2', event: 'PAYMENT_OVERDUE', payment: { id: 'sim_pay_pix_0_abcd1234', externalReference: platformReference(CHARGE_ID) } },
      { source: 'automation', provider: 'simulated' },
    )
    expect(commissionCalls.recorded).toHaveLength(1)
  })

  it('estorno e chargeback revertem as comissões da fatura', async () => {
    state.charge = { ...monthlyCharge('paid'), gatewayProvider: 'asaas', gatewayChargeId: 'pay_m1' }
    await handlePlatformGatewayEvent(
      { id: 'evt_ref', event: 'PAYMENT_REFUNDED', payment: { id: 'pay_m1', externalReference: platformReference(CHARGE_ID), value: 990 } },
      { source: 'webhook', provider: 'asaas' },
    )
    expect(commissionCalls.reversed).toEqual([[CHARGE_ID, 'Fatura estornada']])

    state.charge = { ...monthlyCharge('paid'), gatewayProvider: 'asaas', gatewayChargeId: 'pay_m1' }
    state.sub = subscription('active')
    await handlePlatformGatewayEvent(
      { id: 'evt_cb_c', event: 'PAYMENT_CHARGEBACK_REQUESTED', payment: { id: 'pay_m1', externalReference: platformReference(CHARGE_ID), value: 990 } },
      { source: 'webhook', provider: 'asaas' },
    )
    expect(commissionCalls.reversed[1]).toEqual([CHARGE_ID, 'Chargeback (contestação do cartão)'])
  })
})
