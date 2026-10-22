import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Migração de gateway da assinatura da plataforma (simulado → Asaas) com
 * banco FALSO em memória e gateway FAKE: cliente criado com CNPJ/nome/e-mail,
 * fatura aberta cancelada ("Migrada para o Asaas") e reemitida no destino com
 * `plt_<id novo>`, mesmo valor/itens/período, régua intacta, pagas intocadas,
 * vencimento no gateway pela regra da segunda via e idempotência.
 */

const state = vi.hoisted(() => ({
  sub: {} as Record<string, unknown>,
  charges: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  audits: [] as Record<string, unknown>[],
  oldGatewayCanceled: [] as string[],
}))

vi.mock('@/http/middleware/platform-access', () => ({ invalidatePlatformAccessCache: () => {} }))
vi.mock('@/lib/email', () => ({ sendEmail: async () => ({ id: 'mail', status: 'simulated' }) }))

vi.mock('@/modules/platform-billing/gateway', async importOriginal => {
  const original = await importOriginal<typeof import('@/modules/platform-billing/gateway')>()
  return {
    ...original,
    // Gateway de ORIGEM (simulado): só registra o cancelamento do pagamento antigo.
    platformGatewayFor: () => ({
      provider: 'simulated',
      sandbox: false,
      canSimulate: true,
      cancelCharge: async (id: string) => {
        state.oldGatewayCanceled.push(id)
      },
    }),
  }
})

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { is, Param, SQL } = await import('drizzle-orm')
  type Op = { name: string; args: unknown[] }
  const OPEN = ['pending', 'overdue', 'failed']

  /** Valores dos parâmetros de um `where` do drizzle (eq/and/inArray/ne). */
  function paramsOf(node: unknown, out: unknown[] = []): unknown[] {
    if (Array.isArray(node)) node.forEach(item => paramsOf(item, out))
    else if (is(node, Param)) out.push((node as InstanceType<typeof Param>).value)
    else if (is(node, SQL)) paramsOf((node as InstanceType<typeof SQL>).queryChunks, out)
    return out
  }

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
  const whereParams = (ops: Op[]) => paramsOf(arg(ops, 'where'))

  const db: Record<string, unknown> = {
    select: () =>
      chain(ops => {
        const table = arg(ops, 'from') as unknown
        if (table === schema.platformSubscriptions) return [{ ...state.sub }]
        if (table === schema.platformCharges) {
          const params = whereParams(ops)
          const byId = state.charges.filter(charge => params.includes(charge.id))
          if (byId.length > 0) return byId.map(charge => ({ ...charge }))
          return state.charges
            .filter(c => c.subscriptionId === state.sub.id && OPEN.includes(c.status as string) && !params.includes(c.gatewayProvider))
            .map(charge => ({ ...charge }))
        }
        return []
      }),
    insert: (table: unknown) =>
      chain(ops => {
        const values = arg(ops, 'values')
        if (table === schema.platformBillingEvents) {
          state.events.push(values)
          return []
        }
        if (table === schema.auditLogs) {
          state.audits.push(values)
          return []
        }
        if (table === schema.platformCharges) {
          const clash = state.charges.find(
            c => c.kind === 'monthly' && values.kind === 'monthly' && c.subscriptionId === values.subscriptionId && c.periodStart === values.periodStart && c.status !== 'canceled',
          )
          if (clash) throw new Error('duplicate key value violates unique constraint "platform_charges_sub_period_key"')
          const row = {
            id: randomUUID(),
            gatewayChargeId: null,
            invoiceUrl: null,
            pixPayload: null,
            pixQrCode: null,
            pixExpiresAt: null,
            boletoIdentificationField: null,
            boletoBarCode: null,
            boletoUrl: null,
            cardBrand: null,
            cardLast4: null,
            attempts: 0,
            lastAttemptAt: null,
            failureReason: null,
            reminderSentAt: null,
            overdueNotifiedAt: null,
            lastSyncedAt: null,
            paidAt: null,
            paidAmount: null,
            canceledAt: null,
            refundedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...values,
          }
          state.charges.push(row)
          return [{ ...row }]
        }
        return []
      }),
    update: (table: unknown) =>
      chain(ops => {
        const set = arg(ops, 'set')
        if (table === schema.platformSubscriptions) {
          Object.assign(state.sub, set)
          return [{ ...state.sub }]
        }
        if (table === schema.platformCharges) {
          const params = whereParams(ops)
          const charge = state.charges.find(c => params.includes(c.id))
          if (!charge) return []
          if (set.status === 'canceled' && !OPEN.includes(charge.status as string)) return []
          Object.assign(charge, set)
          return [{ ...charge }]
        }
        return []
      }),
    execute: async () => [],
  }
  db.transaction = async (work: (tx: unknown) => unknown) => work(db)
  return { db }
})

const { migratePlatformSubscriptionGateway, migratedChargeSchedule } = await import('@/modules/platform-billing/gateway-migration.service')
const { platformReference } = await import('@/modules/platform-billing/access-key')
type Gateway = import('@/integrations/payments/gateway').PaymentGateway
type CreateInput = import('@/integrations/payments/gateway').CreateChargeInput

const SUB_ID = '39524096-1430-4cb1-9cf6-6e27f70cb64f'
const OLD_ID = '384d4fe7-e542-4464-9e83-8787a0fc30fa'
const PAID_ID = '0ad2b881-a7a6-439c-831b-2da6bf04eb1a'
const ORG = 'de3bc135-e287-42ac-8c79-280571c8c3fe'
const PAST_DUE_AT = new Date('2026-10-09T10:45:56.908Z')
const ITEMS = [{ kind: 'plan', description: 'Plano Starter · 10/2026', quantity: 1, unitAmount: 499, amount: 499 }]

function fakeAsaas() {
  const calls = { customers: [] as Record<string, unknown>[], charges: [] as CreateInput[] }
  const gateway = {
    provider: 'asaas',
    sandbox: true,
    canSimulate: true,
    ensureCustomer: async (input: Record<string, unknown>) => {
      calls.customers.push(input)
      return 'cus_000001'
    },
    createCharge: async (input: CreateInput) => {
      calls.charges.push(input)
      return {
        id: `pay_${calls.charges.length}`,
        status: 'pending',
        paidAt: null,
        paidAmount: null,
        invoiceUrl: 'https://sandbox.asaas.com/i/abc',
        pix: { payload: '00020101...6304ABCD', qrCodeBase64: 'iVBORw0KGgo=', expiresAt: '2027-10-14T23:59:59.000Z' },
        boleto: null,
        card: null,
      }
    },
    getCharge: async () => {
      throw new Error('não usado')
    },
    cancelCharge: async () => {},
    refundCharge: async () => {
      throw new Error('não usado')
    },
    receiveInCash: async () => {
      throw new Error('não usado')
    },
    simulatePayment: async () => {},
  } as unknown as Gateway
  return { gateway, calls }
}

function seedState() {
  state.sub = {
    id: SUB_ID,
    organizationId: ORG,
    status: 'past_due',
    planName: 'Starter',
    dueDay: 10,
    paymentMethod: 'pix',
    gatewayProvider: 'simulated',
    gatewayCustomerId: 'sim_cus_154084f37ba21a3c',
    cardToken: null,
    billingName: 'MapCard2 Administradora de Benefícios LTDA',
    billingDocument: '12345678000195',
    billingEmail: 'contato@mapcard2.com.br',
    pastDueAt: PAST_DUE_AT,
    restrictedAt: null,
  }
  const base = {
    organizationId: ORG,
    subscriptionId: SUB_ID,
    proposalId: null,
    kind: 'monthly',
    amount: '499.00',
    items: ITEMS,
    livesCount: 60,
    method: 'pix',
    description: 'ANNETEC · MapCard2 · Plano Starter · 10/2026',
    gatewayProvider: 'simulated',
    attempts: 0,
    failureReason: null,
    canceledAt: null,
  }
  state.charges = [
    { ...base, id: PAID_ID, status: 'paid', periodStart: '2026-09-10', periodEnd: '2026-10-10', dueDate: '2026-09-10', gatewayChargeId: 'sim_paid' },
    {
      ...base,
      id: OLD_ID,
      status: 'overdue',
      periodStart: '2026-10-10',
      periodEnd: '2026-11-10',
      dueDate: '2026-10-01',
      gatewayChargeId: 'sim_pay_pix_0_94761b41',
      reminderSentAt: new Date('2026-09-28T03:00:29Z'),
      overdueNotifiedAt: new Date('2026-10-09T10:45:41Z'),
    },
  ]
  state.events = []
  state.audits = []
  state.oldGatewayCanceled = []
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-09T15:00:00Z'))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(seedState)

describe('migração de gateway da assinatura da plataforma', () => {
  it('cria o cliente, cancela a aberta e reemite no destino mantendo a régua', async () => {
    const { gateway, calls } = fakeAsaas()
    const result = await migratePlatformSubscriptionGateway(SUB_ID, 'asaas', { gateway, actorUserId: 'superadmin-1' })

    expect(calls.customers).toEqual([
      expect.objectContaining({
        name: 'MapCard2 Administradora de Benefícios LTDA',
        cpf: '12345678000195',
        email: 'contato@mapcard2.com.br',
        externalReference: ORG,
      }),
    ])
    expect(state.sub).toMatchObject({ gatewayProvider: 'asaas', gatewayCustomerId: 'cus_000001', status: 'past_due', pastDueAt: PAST_DUE_AT })

    const old = state.charges.find(c => c.id === OLD_ID)!
    expect(old.status).toBe('canceled')
    expect(state.oldGatewayCanceled).toEqual(['sim_pay_pix_0_94761b41'])
    expect(state.charges.find(c => c.id === PAID_ID)).toMatchObject({ status: 'paid', gatewayProvider: 'simulated' })

    expect(result.charges).toHaveLength(1)
    const migrated = result.charges[0]!
    const fresh = state.charges.find(c => c.id === migrated.newId)!
    expect(fresh).toMatchObject({
      kind: 'monthly',
      amount: '499.00',
      items: ITEMS,
      livesCount: 60,
      periodStart: '2026-10-10',
      periodEnd: '2026-11-10',
      // Obrigação preservada: a régua conta o atraso pelo mesmo dia.
      dueDate: '2026-10-01',
      status: 'overdue',
      method: 'pix',
      gatewayProvider: 'asaas',
      gatewayChargeId: 'pay_1',
      invoiceUrl: 'https://sandbox.asaas.com/i/abc',
      overdueNotifiedAt: old.overdueNotifiedAt,
    })
    expect(fresh.pixPayload).toBe('00020101...6304ABCD')

    // Gateway: mesmo valor, `plt_<id novo>`, vencimento pela regra da segunda via (hoje + 5).
    expect(calls.charges).toHaveLength(1)
    expect(calls.charges[0]).toMatchObject({
      customerId: 'cus_000001',
      method: 'pix',
      amount: 499,
      dueDate: '2026-10-14',
      externalReference: platformReference(migrated.newId),
    })
    expect(migrated).toMatchObject({ oldId: OLD_ID, status: 'overdue', dueDate: '2026-10-01', gatewayDueDate: '2026-10-14', gatewayChargeId: 'pay_1' })
    expect(migrated.publicUrl).toContain(`/fatura-annetec/${migrated.newId}?chave=`)

    const types = state.events.map(e => e.type)
    expect(types).toEqual(expect.arrayContaining(['SUBSCRIPTION_GATEWAY_MIGRATED', 'CHARGE_CANCELED', 'CHARGE_GENERATED', 'PAYMENT_CREATED']))
    const canceledEvent = state.events.find(e => e.type === 'CHARGE_CANCELED')!
    expect(canceledEvent.message).toContain('Migrada para o Asaas')
    expect(canceledEvent.chargeId).toBe(OLD_ID)
    // Nenhum evento mexe no status da assinatura.
    expect(types).not.toContain('SUBSCRIPTION_REACTIVATED')

    expect(state.audits).toEqual([
      expect.objectContaining({ action: 'platform_subscription.gateway_migrated', resourceId: SUB_ID, organizationId: ORG, actorId: 'superadmin-1' }),
    ])
  })

  it('realinhada à regra do ciclo: vence no 1º dia do período e vai ao gateway com essa data', async () => {
    const { gateway, calls } = fakeAsaas()
    const result = await migratePlatformSubscriptionGateway(SUB_ID, 'asaas', { gateway, realignMonthlyDueDate: true })
    const migrated = result.charges[0]!
    expect(migrated).toMatchObject({ dueDate: '2026-10-10', gatewayDueDate: '2026-10-10', status: 'pending' })
    expect(calls.charges[0]!.dueDate).toBe('2026-10-10')
    // Mudou a obrigação: o aviso de vencida antigo não vale para ela.
    expect(state.charges.find(c => c.id === migrated.newId)!.overdueNotifiedAt).toBeNull()
  })

  it('é idempotente: rodar de novo não cria cliente nem cobrança', async () => {
    const first = fakeAsaas()
    await migratePlatformSubscriptionGateway(SUB_ID, 'asaas', { gateway: first.gateway })
    const second = fakeAsaas()
    const again = await migratePlatformSubscriptionGateway(SUB_ID, 'asaas', { gateway: second.gateway })
    expect(again.charges).toEqual([])
    expect(second.calls.customers).toEqual([])
    expect(second.calls.charges).toEqual([])
    expect(state.charges.filter(c => c.status !== 'canceled' && c.status !== 'paid')).toHaveLength(1)
  })

  it('cartão aberto vira Pix (segunda via sem cartão na mão)', async () => {
    state.charges[1]!.method = 'credit_card'
    const { gateway, calls } = fakeAsaas()
    await migratePlatformSubscriptionGateway(SUB_ID, 'asaas', { gateway })
    expect(calls.charges[0]!.method).toBe('pix')
  })
})

describe('migratedChargeSchedule — vencimento no gateway nunca antes da obrigação', () => {
  const opts = { today: '2026-10-09', boletoDueDays: 5, dueDay: 10 }
  it('futura: mesma data; vencida: hoje + boletoDueDays (segunda via), linha mantém a obrigação', () => {
    expect(migratedChargeSchedule({ kind: 'monthly', periodStart: '2026-10-10', dueDate: '2026-10-10' }, opts)).toEqual({
      dueDate: '2026-10-10',
      gatewayDueDate: '2026-10-10',
      status: 'pending',
    })
    expect(migratedChargeSchedule({ kind: 'monthly', periodStart: '2026-10-10', dueDate: '2026-10-01' }, opts)).toEqual({
      dueDate: '2026-10-01',
      gatewayDueDate: '2026-10-14',
      status: 'overdue',
    })
  })
  it('realinhamento só mexe em mensalidade', () => {
    expect(
      migratedChargeSchedule({ kind: 'activation', periodStart: '2026-04-27', dueDate: '2026-10-01' }, { ...opts, realignMonthlyDueDate: true }).dueDate,
    ).toBe('2026-10-01')
  })
})
