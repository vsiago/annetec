import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Provider do club-billing com a conta Asaas DO CLUBE: cache por
 * clube + `updated_at`, bloqueio sem conta (409 RECEBIMENTO_NAO_CONFIGURADO)
 * no checkout, telas que abrem mesmo assim, e automação que pula o clube sem
 * derrubar a rodada. Banco falso; nada sai para a rede.
 */

vi.hoisted(() => {
  // Determinístico, seja qual for o `.env` local: o clube usa o Asaas.
  process.env.PAYMENT_GATEWAY = 'asaas'
})

const state = vi.hoisted(() => ({
  credentials: new Map<string, { apiKey: string; env: 'sandbox' | 'production'; updatedAt: Date }>(),
  clubCards: [] as Record<string, unknown>[],
  submitted: [] as string[],
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
  const from = (ops: Op[]) => ops.find(op => op.name === 'from')?.args[0]
  const db: Record<string, unknown> = {
    select: (fields?: Record<string, unknown>) =>
      chain(ops => {
        // Só a consulta do passo "cartão" (`select({ charge })`) devolve linhas.
        if (fields && 'charge' in fields && !('sub' in fields) && from(ops) === schema.clubCharges) {
          return state.clubCards.map(charge => ({ charge }))
        }
        return []
      }),
    selectDistinct: () => chain(() => []),
    insert: () => chain(() => []),
    update: () => chain(() => []),
    delete: () => chain(() => []),
    execute: async () => [],
  }
  db.transaction = async (work: (tx: unknown) => unknown) => work(db)
  return { db, sql: { end: async () => undefined } }
})

vi.mock('@/modules/club-billing/receiving-account.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/club-billing/receiving-account.service')>()),
  resolveClubAsaasCredentials: async (orgId: string) => state.credentials.get(orgId) ?? null,
}))

vi.mock('@/modules/club-billing/charges.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/club-billing/charges.service')>()),
  withChargeLock: async (_id: string, work: () => Promise<unknown>) => work(),
  submitChargeToGateway: async (id: string) => {
    state.submitted.push(id)
    return { id, status: 'paid' }
  },
}))

const provider = await import('@/integrations/payments/provider')
const { checkoutService } = await import('@/modules/club-billing/checkout.service')
const automation = await import('@/modules/club-billing/automation.service')
const { settingsService } = await import('@/modules/club-billing/settings.service')
const { AppError } = await import('@/http/errors')
const { GatewayNotConfiguredError } = await import('@/integrations/payments/gateway')
const { logger } = await import('@/lib/logger')

const SANDBOX = '$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmY1ZTYwYTJm'
const NOW = new Date('2026-10-20T15:00:00Z')
const TENANT = { id: 'org-sem-conta', slug: 'clube-sem-conta', name: 'Clube Sem Conta' }

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => {
      throw new Error('esperava erro')
    },
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(AppError)
  return error as InstanceType<typeof AppError>
}

function cardCharge(id: string) {
  return { id, method: 'credit_card', status: 'pending', dueDate: '2026-10-10', attempts: 0, lastAttemptAt: null, gatewayChargeId: null }
}

beforeEach(() => {
  state.credentials.clear()
  state.clubCards = []
  state.submitted = []
})

describe('getGatewayFor (Asaas do clube)', () => {
  it('sem conta conectada → GatewayNotConfiguredError 409 RECEBIMENTO_NAO_CONFIGURADO (nunca a chave global)', async () => {
    const error = await rejection(provider.getGatewayFor('org-a', 'asaas'))
    expect(error).toBeInstanceOf(GatewayNotConfiguredError)
    expect(error.code).toBe('RECEBIMENTO_NAO_CONFIGURADO')
    expect(error.status).toBe(409)
    expect(error.message).toBe('Este clube ainda não configurou o recebimento das mensalidades.')
  })

  it('cache por clube + updated_at: mesma chave reaproveita; chave trocada cria outro cliente', async () => {
    state.credentials.set('org-a', { apiKey: SANDBOX, env: 'sandbox', updatedAt: new Date(1_000) })
    state.credentials.set('org-b', { apiKey: SANDBOX, env: 'production', updatedAt: new Date(1_000) })
    const first = await provider.getGatewayFor('org-a', 'asaas')
    expect(await provider.getGatewayFor('org-a', 'asaas')).toBe(first)
    expect(first.sandbox).toBe(true)

    const other = await provider.getGatewayFor('org-b', 'asaas')
    expect(other).not.toBe(first)
    expect(other.sandbox).toBe(false)

    state.credentials.set('org-a', { apiKey: SANDBOX, env: 'sandbox', updatedAt: new Date(2_000) })
    const rotated = await provider.getGatewayFor('org-a', 'asaas')
    expect(rotated).not.toBe(first)
    expect(await provider.getGatewayFor('org-a', 'asaas')).toBe(rotated)
  })

  it('telas (describeGateway) abrem sem conta; quem cria cobrança recebe 409', async () => {
    expect(await provider.describeGateway('org-a', 'asaas')).toEqual({ provider: 'asaas', sandbox: false, receivingConfigured: false })
    expect((await rejection(provider.resolveReadyGatewayProvider('org-a'))).code).toBe('RECEBIMENTO_NAO_CONFIGURADO')

    state.credentials.set('org-a', { apiKey: SANDBOX, env: 'sandbox', updatedAt: new Date(1_000) })
    expect(await provider.describeGateway('org-a', 'asaas')).toEqual({ provider: 'asaas', sandbox: true, receivingConfigured: true })
    expect(await provider.resolveReadyGatewayProvider('org-a')).toBe('asaas')
  })

  it('configurações: asaasConfigured reflete a conta do clube, não a env', async () => {
    expect((await settingsService.get('org-a')).asaasConfigured).toBe(false)
    state.credentials.set('org-a', { apiKey: SANDBOX, env: 'sandbox', updatedAt: new Date(1_000) })
    const settings = await settingsService.get('org-a')
    expect(settings).toMatchObject({ gateway: 'asaas', asaasConfigured: true, sandbox: true })
  })
})

describe('checkout sem conta de recebimento', () => {
  it('adesão → 409 RECEBIMENTO_NAO_CONFIGURADO antes de criar conta ou assinatura', async () => {
    const input = {
      planId: '0b9b1f43-8a8e-4d5d-9a51-1f1f1f1f1f1f',
      holder: { name: 'Ana Souza', cpf: '52998224725', email: 'ana@exemplo.com', phone: '21999998888', birthDate: '1990-05-10' },
      dependents: [],
      payment: { method: 'pix' },
      acceptTerms: true,
    }
    const error = await rejection(checkoutService.checkout(TENANT as never, input as never))
    expect(error.code).toBe('RECEBIMENTO_NAO_CONFIGURADO')
    expect(error.status).toBe(409)
    expect(error.message).toMatch(/ainda não configurou o recebimento/)
  })

  it('contexto da vitrine abre com receivingConfigured: false (a tela avisa)', async () => {
    const context = await checkoutService.context(TENANT as never)
    expect(context).toMatchObject({ gateway: 'asaas', receivingConfigured: false, canSimulatePayment: false })
  })
})

describe('automação sem conta de recebimento', () => {
  it('pula o clube no que depende do gateway, sem derrubar a rodada, com alerta 1× por clube', async () => {
    const warn = vi.spyOn(logger, 'warn')
    state.clubCards = [cardCharge('c-1'), cardCharge('c-2')]

    const report = await automation.runForTenant(TENANT.id, NOW)
    expect(state.submitted).toEqual([])
    expect(report.errors.some(item => item.includes('recebimento não configurado'))).toBe(true)
    expect(report.cardCharged).toBe(0)

    await automation.runForTenant(TENANT.id, NOW)
    const alerts = warn.mock.calls.filter(call => String(call[1] ?? '').includes('Clube sem conta de recebimento'))
    expect(alerts).toHaveLength(1)

    // runAll (timer) também não derruba.
    await expect(automation.runAll(NOW)).resolves.toBeInstanceOf(Array)

    // Conectou a conta: a próxima rodada cobra normalmente.
    state.credentials.set(TENANT.id, { apiKey: SANDBOX, env: 'sandbox', updatedAt: new Date(1_000) })
    const after = await automation.runForTenant(TENANT.id, NOW)
    expect(state.submitted).toEqual(['c-1', 'c-2'])
    expect(after.errors.some(item => item.includes('recebimento não configurado'))).toBe(false)
    warn.mockRestore()
  })
})
