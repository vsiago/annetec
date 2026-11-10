import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Débito automático das faturas da ANNETEC no saldo da conta GERENCIADA do
 * clube — o caminho do dinheiro. Banco em memória que interpreta as
 * consultas, cliente Asaas falso e gateway da plataforma falso; o handler
 * ÚNICO de pagamento da plataforma é o REAL (assinatura, comissão do
 * vendedor e avisos rodam por ele).
 *
 *  - com saldo: transferência para a carteira da ANNETEC + fatura paga UMA vez
 *    + comissão UMA vez; rodar de novo não transfere;
 *  - sem saldo: sem transferência, aviso ao clube, nova tentativa no dia
 *    seguinte, para depois de 3;
 *  - idempotência: duas execuções simultâneas (mesmo processo e entre
 *    processos) → uma transferência; fatura paga por Pix antes → não transfere;
 *  - reconciliação: transferência pendente, resposta perdida, pagamento em
 *    duplicidade, baixa no gateway que falha;
 *  - webhook de validação: aprova só a nossa transferência.
 */

const KEYS = vi.hoisted(() => {
  const platform = '$aact_hmlg_000PlataformaANNETECChaveDeTesteComTamanhoSuficiente'
  const validation = 'token-de-validacao-de-transferencias-com-mais-de-32-caracteres'
  process.env.PLATFORM_ASAAS_API_KEY = platform
  process.env.ASAAS_TRANSFER_VALIDATION_TOKEN = validation
  return { platform, validation, sub: '$aact_hmlg_000SubcontaDoClubeAChaveDeTesteComTamanhoSuficiente' }
})

const memory = vi.hoisted(() => ({
  db: null as null | Record<string, unknown>,
  beforeWrite: null as null | ((kind: string, table: unknown, values: unknown) => void),
}))
const captured = vi.hoisted(() => ({
  notified: [] as Record<string, unknown>[],
  invoicePaid: [] as string[],
  commissions: [] as string[],
  emails: [] as string[],
}))
const gw = vi.hoisted(() => ({
  remote: new Map<string, string>(),
  received: [] as { id: string; date: string; amount: number }[],
  receiveError: null as Error | null,
  canceled: [] as string[],
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createMemoryDb } = await import('./helpers/memory-db')
  const instance = createMemoryDb({
    tables: [
      schema.organization,
      schema.tenantProfiles,
      schema.tenantAsaasAccounts,
      schema.managedAccountRequests,
      schema.managedAccountDebits,
      schema.platformSubscriptions,
      schema.platformCharges,
      schema.platformBillingEvents,
    ],
    uniques: [
      { table: schema.tenantAsaasAccounts, keys: ['organizationId'] },
      { table: schema.managedAccountDebits, keys: ['chargeId'], where: row => row.status === 'em_andamento' },
      { table: schema.managedAccountDebits, keys: ['chargeId'], where: row => row.status === 'concluida' },
      { table: schema.managedAccountDebits, keys: ['transferId'] },
      { table: schema.managedAccountDebits, keys: ['externalReference'] },
      { table: schema.platformBillingEvents, keys: ['gatewayProvider', 'externalEventId'] },
    ],
    beforeWrite: (kind, table, values) => memory.beforeWrite?.(kind, table, values),
  })
  memory.db = instance as unknown as Record<string, unknown>
  return { db: instance.db, sql: {} }
})

vi.mock('@/integrations/asaas/client', async importOriginal => {
  const original = await importOriginal<typeof import('@/integrations/asaas/client')>()
  const { fakeAsaasClient } = await import('./helpers/fake-asaas')
  return { ...original, createAsaasClient: fakeAsaasClient }
})

vi.mock('@/modules/platform-billing/gateway', async () => {
  const { fakeAsaas } = await import('./helpers/fake-asaas')
  const gateway = {
    provider: 'asaas',
    sandbox: true,
    canSimulate: false,
    getCharge: async (id: string) => ({
      id,
      status: gw.remote.get(id) ?? 'pending',
      paidAt: null,
      paidAmount: null,
      invoiceUrl: null,
      pix: null,
      boleto: null,
      card: null,
    }),
    receiveInCash: async (id: string, date: string, amount: number) => {
      if (gw.receiveError) throw gw.receiveError
      gw.received.push({ id, date, amount })
      gw.remote.set(id, 'paid')
      fakeAsaas.payments.set(id, 'RECEIVED_IN_CASH')
      return { id, status: 'paid' }
    },
    cancelCharge: async (id: string) => {
      gw.canceled.push(id)
    },
  }
  return {
    platformAsaasApiKey: () => process.env.PLATFORM_ASAAS_API_KEY,
    isPlatformAsaasConfigured: () => true,
    platformWebhookToken: () => undefined,
    effectivePlatformProvider: () => 'asaas',
    platformGatewayFor: () => gateway,
  }
})

vi.mock('@/lib/notifications', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/notifications')>()),
  notify: async (input: Record<string, unknown>) => {
    captured.notified.push(input)
    return 1
  },
  notifyPlatformInvoicePaid: async (input: { chargeId: string }) => {
    captured.invoicePaid.push(input.chargeId)
  },
}))

vi.mock('@/modules/vendas-rede/comissoes.service', () => ({
  safely: async (tx: unknown, _label: string, work: (tx: unknown) => Promise<unknown>) => {
    await work(tx)
  },
  registrarComissoesDaCobrancaPaga: async ({ cobranca }: { cobranca: { id: string } }) => {
    captured.commissions.push(cobranca.id)
    return 1
  },
  estornarComissoesDaCobranca: async () => 0,
}))

vi.mock('@/http/middleware/platform-access', () => ({ invalidatePlatformAccessCache: () => {} }))
vi.mock('@/lib/email', () => ({
  sendEmail: async (input: { template: string }) => {
    captured.emails.push(input.template)
    return { id: 'mail', status: 'simulated' }
  },
}))

const schema = await import('@/db/schema')
const { fakeAsaas } = await import('./helpers/fake-asaas')
const debits = await import('@/modules/managed-account/debit.service')
const { validateTransferRequest, transferValidationController } = await import('@/modules/managed-account/transfer-validation')
const { resetPlatformWalletCache } = await import('@/modules/managed-account/asaas')
const { AsaasApiError } = await import('@/integrations/asaas/client')
const { encryptSecret } = await import('@/lib/crypto')
const { logger } = await import('@/lib/logger')
const { ERROR_CODES } = await import('@annetec/contracts')
const { errorHandler } = await import('@/http/errors')
const { Hono } = await import('hono')

type Memory = import('./helpers/memory-db').MemoryDb
const db = () => memory.db as unknown as Memory

const ORG = 'org-clube-a'
const SUB_ID = '5b1a2c3d-0000-4000-8000-0000000000a1'
const CHARGE_ID = '7c2b3d4e-0000-4000-8000-0000000000c1'
const PROPOSAL_ID = '8d3c4e5f-0000-4000-8000-0000000000e1'
const NOW = new Date('2026-11-10T15:00:00Z')
const HOUR = 3_600_000
const PLATFORM_WALLET = 'wallet_annetec_0001'

const charge = () => db().rows(schema.platformCharges).find(row => row.id === CHARGE_ID)!
const attempts = () => db().rows(schema.managedAccountDebits)
const events = (type: string) => db().rows(schema.platformBillingEvents).filter(row => row.type === type)
const transfers = () => fakeAsaas.transfers

function seed(options: { balance?: number; method?: string; status?: string; dueDate?: string; autoDebit?: boolean } = {}) {
  db().insertRow(schema.organization, { id: ORG, name: 'Clube A', slug: 'clube-a' })
  db().insertRow(schema.tenantAsaasAccounts, {
    organizationId: ORG,
    source: 'subaccount',
    apiKeyEncrypted: encryptSecret(KEYS.sub),
    env: 'sandbox',
    keyHint: KEYS.sub.slice(-4),
    asaasAccountId: 'acc_sub_a',
    walletId: 'wallet_sub_a',
    autoDebitEnabled: options.autoDebit ?? true,
    webhookStatus: 'ativo',
  })
  db().insertRow(schema.platformSubscriptions, {
    id: SUB_ID,
    organizationId: ORG,
    proposalId: PROPOSAL_ID,
    planName: 'Plano Pro',
    planPriceMonthly: '199.90',
    memberLimit: 500,
    status: 'active',
    paymentMethod: 'pix',
    dueDay: 10,
    gatewayProvider: 'asaas',
    billingName: 'Clube A',
    billingDocument: '11222333000181',
    billingEmail: 'financeiro@clube-a.org.br',
  })
  db().insertRow(schema.platformCharges, {
    id: CHARGE_ID,
    organizationId: ORG,
    subscriptionId: SUB_ID,
    proposalId: PROPOSAL_ID,
    kind: 'monthly',
    periodStart: '2026-11-10',
    periodEnd: '2026-12-09',
    dueDate: options.dueDate ?? '2026-11-10',
    amount: '199.90',
    method: options.method ?? 'pix',
    status: options.status ?? 'pending',
    description: 'Mensalidade ANNETEC 11/2026',
    gatewayProvider: 'asaas',
    gatewayChargeId: 'pay_plataforma_1',
  })
  fakeAsaas.subaccounts.push({ id: 'acc_sub_a', walletId: 'wallet_sub_a', cpfCnpj: '11222333000181', name: 'Clube A', email: 'f@a', apiKey: KEYS.sub })
  fakeAsaas.balance.set(KEYS.sub, options.balance ?? 500)
}

beforeEach(() => {
  db().reset()
  fakeAsaas.reset()
  fakeAsaas.platformKey = KEYS.platform
  memory.beforeWrite = null
  gw.remote.clear()
  gw.received.length = 0
  gw.receiveError = null
  gw.canceled.length = 0
  captured.notified.length = 0
  captured.invoicePaid.length = 0
  captured.commissions.length = 0
  captured.emails.length = 0
  resetPlatformWalletCache()
  vi.restoreAllMocks()
  // Relógio parado no dia do vencimento (só a data: a fila de tarefas segue real).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('débito no vencimento com saldo', () => {
  it('transfere para a carteira da ANNETEC com a chave da subconta e dá a fatura como paga UMA vez', async () => {
    seed()
    const result = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })

    expect(result.outcome).toBe('concluida')
    expect(transfers()).toHaveLength(1)
    const [transfer] = transfers()
    expect(transfer).toMatchObject({ value: 199.9, walletId: PLATFORM_WALLET, ownerKey: KEYS.sub, status: 'DONE' })
    expect(transfer!.externalReference).toBe(`adb_${String(result.debit!.id).replace(/-/g, '')}`)
    // Carteira da ANNETEC lida com a chave da PLATAFORMA; saldo com a da subconta.
    expect(fakeAsaas.calls).toContainEqual({ apiKey: KEYS.platform, call: 'wallets.list', args: undefined })
    expect(fakeAsaas.calls).toContainEqual({ apiKey: KEYS.sub, call: 'finance.balance', args: undefined })

    // Mesmo caminho do pagamento confirmado: baixa no Asaas da ANNETEC + handler único.
    expect(gw.received).toEqual([{ id: 'pay_plataforma_1', date: '2026-11-10', amount: 199.9 }])
    expect(charge()).toMatchObject({ status: 'paid', paidAmount: '199.9' })
    expect(captured.commissions).toEqual([CHARGE_ID])
    expect(captured.invoicePaid).toEqual([CHARGE_ID])
    expect(captured.emails).toContain('platform_invoice_paid')
    expect(events('PAYMENT_RECEIVED')).toHaveLength(1)
    expect(events('PAYMENT_RECEIVED')[0]!.message).toMatch(/débito automático do saldo/)
    expect(events('CHARGE_AUTO_DEBIT')).toHaveLength(1)
    expect(attempts()).toEqual([expect.objectContaining({ status: 'concluida', attempt: 1, balance: '500', transferId: transfer!.id, transferStatus: 'DONE', destinationWalletId: PLATFORM_WALLET })])
    expect(attempts()[0]!.gatewaySettledAt).toBeInstanceOf(Date)

    // De novo (automação seguinte, superadmin "debitar agora"): nada transfere.
    const again = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: new Date(NOW.getTime() + 2 * HOUR) })
    expect(again.outcome).toBe('ignorada')
    const forced = await debits.forceDebit(ORG, CHARGE_ID, 'u-superadmin')
    expect(forced.outcome).toBe('ignorada')
    expect(transfers()).toHaveLength(1)
    expect(captured.commissions).toHaveLength(1)
    expect(attempts()).toHaveLength(1)
  })

  it('a automação acha a fatura vencida do clube com débito ligado; desligado não debita', async () => {
    seed({ autoDebit: false })
    expect(await debits.runManagedDebits(NOW)).toMatchObject({ concluded: 0, failed: 0 })
    expect(transfers()).toHaveLength(0)

    db().rows(schema.tenantAsaasAccounts)[0]!.autoDebitEnabled = true
    expect(await debits.runManagedDebits(NOW)).toMatchObject({ concluded: 1, failed: 0, errors: [] })
    expect(charge().status).toBe('paid')
    expect(await debits.runManagedDebits(new Date(NOW.getTime() + 26 * HOUR))).toMatchObject({ concluded: 0, failed: 0 })
    expect(transfers()).toHaveLength(1)
  })

  it('fatura que ainda não venceu e cartão com tentativas pendentes não são debitadas', async () => {
    seed({ dueDate: '2026-11-11' })
    expect((await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })).outcome).toBe('ignorada')
    db().reset()
    fakeAsaas.reset()
    fakeAsaas.platformKey = KEYS.platform
    seed({ method: 'credit_card' })
    expect((await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })).message).toMatch(/cartão/)
    expect(transfers()).toHaveLength(0)
  })
})

describe('sem saldo suficiente', () => {
  it('não transfere, avisa o clube, tenta 1× por dia e para depois de 3', async () => {
    seed({ balance: 120 })
    const first = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    expect(first).toMatchObject({ outcome: 'falhou' })
    expect(first.debit).toMatchObject({ status: 'falhou', failureCode: 'saldo_insuficiente', balance: '120' })
    expect(first.message).toMatch(/R\$\s?120,00.*R\$\s?199,90/)
    expect(transfers()).toHaveLength(0)
    expect(charge().status).toBe('pending')
    expect(captured.notified).toEqual([
      expect.objectContaining({ audience: 'tenant', kind: 'platform_auto_debit_failed', organizationId: ORG, link: '/clube-a/admin/assinatura', dedupeKey: `auto_debit_failed:${first.debit!.id}` }),
    ])
    expect(String(captured.notified[0]!.body)).toMatch(/restam 2/)
    expect(events('CHARGE_AUTO_DEBIT_FAILED')).toHaveLength(1)

    // Mesmo dia: não tenta de novo.
    expect((await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: new Date(NOW.getTime() + 3 * HOUR) })).outcome).toBe('ignorada')
    // Dia seguinte e o outro: tenta (2ª e 3ª).
    expect((await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: new Date(NOW.getTime() + 25 * HOUR) })).debit?.attempt).toBe(2)
    expect((await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: new Date(NOW.getTime() + 50 * HOUR) })).debit?.attempt).toBe(3)
    expect(String(captured.notified.at(-1)!.body)).toMatch(/Sem novas tentativas/)
    // 4º dia: esgotado — a régua normal segue.
    const fourth = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: new Date(NOW.getTime() + 75 * HOUR) })
    expect(fourth).toMatchObject({ outcome: 'ignorada', message: 'Tentativas esgotadas (3)' })
    expect(attempts()).toHaveLength(3)
    expect(transfers()).toHaveLength(0)
    expect(charge().status).toBe('pending')
  })

  it('o superadmin pode forçar depois de esgotado; com saldo novo, debita', async () => {
    seed({ balance: 10 })
    for (const hours of [0, 25, 50]) await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: new Date(NOW.getTime() + hours * HOUR) })
    fakeAsaas.balance.set(KEYS.sub, 300)
    const forced = await debits.forceDebit(ORG, undefined, 'u-superadmin')
    expect(forced.outcome).toBe('concluida')
    expect(forced.debit).toMatchObject({ attempt: 4, source: 'manual', status: 'concluida', chargeDescription: 'Mensalidade ANNETEC 11/2026' })
    expect(charge().status).toBe('paid')
    expect(transfers()).toHaveLength(1)
  })
})

describe('idempotência', () => {
  it('duas execuções simultâneas no mesmo processo → UMA transferência, fatura paga e comissão uma vez', async () => {
    seed()
    const results = await Promise.all([
      debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW }),
      debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW }),
      debits.forceDebit(ORG, CHARGE_ID, 'u-superadmin'),
    ])
    expect(results.filter(result => result.outcome === 'concluida')).toHaveLength(1)
    expect(transfers()).toHaveLength(1)
    expect(captured.commissions).toEqual([CHARGE_ID])
    expect(events('PAYMENT_RECEIVED')).toHaveLength(1)
    expect(attempts().filter(row => row.status === 'concluida')).toHaveLength(1)
  })

  it('outro processo reivindica a fatura no meio (índice único da tentativa em andamento) → não transfere', async () => {
    seed()
    let competitor = false
    memory.beforeWrite = (kind, table) => {
      if (kind === 'insert' && table === schema.managedAccountDebits && !competitor) {
        competitor = true
        db().insertRow(schema.managedAccountDebits, {
          organizationId: ORG,
          chargeId: CHARGE_ID,
          status: 'em_andamento',
          source: 'automation',
          amount: '199.90',
          externalReference: 'adb_outro_processo',
          startedAt: NOW,
        })
      }
    }
    const result = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    expect(result).toMatchObject({ outcome: 'ignorada', message: 'Outra tentativa de débito desta fatura está em andamento' })
    expect(transfers()).toHaveLength(0)
    expect(attempts()).toHaveLength(1)
  })

  it('tentativa em andamento de outra rodada é só CONFERIDA (nunca transfere de novo)', async () => {
    seed()
    fakeAsaas.transferCreateStatus = 'PENDING'
    const first = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    expect(first.outcome).toBe('em_andamento')
    const second = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: new Date(NOW.getTime() + 60_000) })
    expect(second.outcome).toBe('em_andamento')
    expect(transfers()).toHaveLength(1)
    expect(fakeAsaas.calls.filter(call => call.call === 'transfers.get')).toHaveLength(1)
  })

  it('fatura paga por Pix antes do débito (o gateway já sabe) → não transfere nem avisa o clube', async () => {
    seed()
    gw.remote.set('pay_plataforma_1', 'paid')
    const result = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    expect(result.debit).toMatchObject({ status: 'falhou', failureCode: 'fatura_paga' })
    expect(transfers()).toHaveLength(0)
    expect(fakeAsaas.calls.some(call => call.call === 'finance.balance')).toBe(false)
    expect(charge().status).toBe('paid')
    expect(captured.commissions).toEqual([CHARGE_ID])
    expect(captured.notified).toHaveLength(0)
  })

  it('valor da fatura mudou entre a leitura e a reivindicação → não transfere valor diferente', async () => {
    seed()
    memory.beforeWrite = (kind, table) => {
      if (kind === 'insert' && table === schema.managedAccountDebits) charge().amount = '250.00'
    }
    const result = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    expect(result.debit).toMatchObject({ status: 'falhou', failureCode: 'erro_asaas', amount: '199.90' })
    expect(transfers()).toHaveLength(0)
    expect(charge().status).toBe('pending')
  })

  it('destino é sempre a carteira da conta da ANNETEC: PLATFORM_ASAAS_WALLET_ID de outra conta bloqueia o débito', async () => {
    const { env } = await import('@/config/env')
    const original = env.PLATFORM_ASAAS_WALLET_ID
    try {
      seed()
      // Ex.: alguém colou a carteira de uma subconta na variável.
      env.PLATFORM_ASAAS_WALLET_ID = 'wallet_sub_b_0001'
      const blocked = await debits.attemptAutoDebit(CHARGE_ID, { source: 'manual', now: NOW })
      expect(blocked.debit).toMatchObject({ status: 'falhou', failureCode: 'erro_asaas' })
      expect(transfers()).toHaveLength(0)

      // A carteira certa (a da chave da plataforma) é aceita.
      resetPlatformWalletCache()
      env.PLATFORM_ASAAS_WALLET_ID = PLATFORM_WALLET
      const ok = await debits.attemptAutoDebit(CHARGE_ID, { source: 'manual', now: NOW })
      expect(ok.outcome).toBe('concluida')
      expect(transfers()).toEqual([expect.objectContaining({ walletId: PLATFORM_WALLET, value: 199.9 })])
    } finally {
      env.PLATFORM_ASAAS_WALLET_ID = original
    }
  })

  it('gateway fora na conferência → não transfere (lado seguro)', async () => {
    seed()
    const original = gw.remote.get.bind(gw.remote)
    vi.spyOn(gw.remote, 'get').mockImplementation(() => {
      throw new AsaasApiError(ERROR_CODES.UPSTREAM_TIMEOUT, 'O Asaas não respondeu a tempo', 0)
    })
    const result = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    expect(result.debit).toMatchObject({ status: 'falhou', failureCode: 'erro_asaas' })
    expect(transfers()).toHaveLength(0)
    void original
  })
})

describe('reconciliação', () => {
  it('transferência pendente: aguarda; concluída na rodada seguinte → quita a fatura', async () => {
    seed()
    fakeAsaas.transferCreateStatus = 'PENDING'
    const first = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    expect(first.outcome).toBe('em_andamento')
    expect(charge().status).toBe('pending')

    fakeAsaas.transfers[0]!.status = 'DONE'
    const report = await debits.runManagedDebits(new Date(NOW.getTime() + 60_000))
    expect(report).toMatchObject({ concluded: 1 })
    expect(charge().status).toBe('paid')
    expect(transfers()).toHaveLength(1)
    expect(captured.commissions).toHaveLength(1)
  })

  it('pendente e a fatura foi paga por outro meio → cancela a transferência no Asaas', async () => {
    seed()
    fakeAsaas.transferCreateStatus = 'PENDING'
    await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    charge().status = 'paid'
    const report = await debits.runManagedDebits(new Date(NOW.getTime() + 60_000))
    expect(report.failed).toBe(1)
    expect(fakeAsaas.transfers[0]!.status).toBe('CANCELLED')
    expect(attempts()[0]).toMatchObject({ status: 'falhou', failureCode: 'fatura_paga', transferStatus: 'CANCELLED' })
  })

  it('pendente há mais de 24 h (sem autorização) → cancela e libera nova tentativa', async () => {
    seed()
    fakeAsaas.transferCreateStatus = 'PENDING'
    await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    const later = new Date(NOW.getTime() + 25 * HOUR)
    await debits.reconcileDebit(attempts()[0] as never, { now: later })
    expect(attempts()[0]).toMatchObject({ status: 'falhou', failureCode: 'transferencia_cancelada' })
    fakeAsaas.transferCreateStatus = 'DONE'
    expect((await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: new Date(later.getTime() + 25 * HOUR) })).outcome).toBe('concluida')
    expect(transfers().map(t => t.status)).toEqual(['CANCELLED', 'DONE'])
  })

  it('resposta do POST perdida: acha a transferência pela externalReference e conclui — sem segunda transferência', async () => {
    seed()
    fakeAsaas.transferThrowsAfterCreate = new AsaasApiError(ERROR_CODES.UPSTREAM_TIMEOUT, 'O Asaas não respondeu a tempo', 0)
    const first = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    expect(first.outcome).toBe('em_andamento')
    expect(attempts()[0]).toMatchObject({ status: 'em_andamento', transferId: null })
    expect(attempts()[0]!.transferRequestedAt).toBeInstanceOf(Date)

    fakeAsaas.transferThrowsAfterCreate = null
    const report = await debits.runManagedDebits(new Date(NOW.getTime() + 5 * 60_000))
    expect(report.concluded).toBe(1)
    expect(transfers()).toHaveLength(1)
    expect(attempts()[0]).toMatchObject({ status: 'concluida', transferId: transfers()[0]!.id })
    expect(charge().status).toBe('paid')
  })

  it('resposta perdida e a transferência com a nossa referência tem outro valor: não é adotada nem aprovada', async () => {
    seed()
    fakeAsaas.transferCreateStatus = 'PENDING'
    fakeAsaas.transferThrowsAfterCreate = new AsaasApiError(ERROR_CODES.UPSTREAM_TIMEOUT, 'O Asaas não respondeu a tempo', 0)
    await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    fakeAsaas.transferThrowsAfterCreate = null
    fakeAsaas.transfers[0]!.value = 999
    const errors = vi.spyOn(logger, 'error')

    const soon = await debits.reconcileDebit(attempts()[0] as never, { now: new Date(NOW.getTime() + 5 * 60_000) })
    expect(soon.outcome).toBe('em_andamento')
    expect(attempts()[0]).toMatchObject({ status: 'em_andamento', transferId: null })
    expect(errors.mock.calls.some(call => (call[0] as { alert?: string }).alert === 'auto_debit_reference_mismatch')).toBe(true)
    expect(await validateTransferRequest({ type: 'TRANSFER', transfer: { id: fakeAsaas.transfers[0]!.id, value: 999 } })).toMatchObject({ status: 'REFUSED' })

    const later = await debits.reconcileDebit(attempts()[0] as never, { now: new Date(NOW.getTime() + 31 * 60_000) })
    expect(later.debit).toMatchObject({ status: 'falhou', failureCode: 'erro_asaas' })
    expect(charge().status).toBe('pending')
  })

  it('transferiu mas a fatura já estava paga: concluída com devolução pendente + alerta (nunca outra transferência)', async () => {
    seed()
    fakeAsaas.transferCreateStatus = 'PENDING'
    await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    // O Pix caiu enquanto a transferência estava no ar e ela foi efetivada assim mesmo.
    charge().status = 'paid'
    fakeAsaas.transfers[0]!.status = 'DONE'
    const errors = vi.spyOn(logger, 'error')
    const result = await debits.reconcileDebit(attempts()[0] as never, { now: new Date(NOW.getTime() + 60_000) })
    expect(result.outcome).toBe('falhou')
    expect(attempts()[0]).toMatchObject({ status: 'concluida', refundRequired: true, failureCode: 'pagamento_duplicado' })
    expect(errors.mock.calls.some(call => (call[0] as { alert?: string }).alert === 'auto_debit_refund_required')).toBe(true)
    expect(captured.notified).toEqual([expect.objectContaining({ audience: 'platform', kind: 'platform_auto_debit_failed' })])
    expect((await debits.forceDebit(ORG, CHARGE_ID, 'u-superadmin')).outcome).toBe('ignorada')
    expect(transfers()).toHaveLength(1)
  })

  it('conferências simultâneas da mesma transferência concluída → baixa e quitação uma vez', async () => {
    seed()
    fakeAsaas.transferCreateStatus = 'PENDING'
    await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    fakeAsaas.transfers[0]!.status = 'DONE'
    const row = { ...attempts()[0]! }
    const later = new Date(NOW.getTime() + 60_000)
    await Promise.all([
      debits.reconcileDebit(row as never, { now: later }),
      debits.reconcileDebit(row as never, { now: later }),
      debits.runManagedDebits(later),
      debits.forceDebit(ORG, CHARGE_ID, 'u-superadmin'),
    ])
    // A trava pode adiar a quitação para a rodada seguinte, nunca duplicá-la.
    await debits.runManagedDebits(new Date(later.getTime() + 60_000))
    expect(gw.received).toHaveLength(1)
    expect(captured.commissions).toHaveLength(1)
    expect(charge().status).toBe('paid')
    expect(attempts()).toEqual([expect.objectContaining({ status: 'concluida' })])
    expect(transfers()).toHaveLength(1)
  })

  it('baixa no Asaas da ANNETEC falha: a fatura fica paga e a cobrança lá é cancelada', async () => {
    seed()
    gw.receiveError = new AsaasApiError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'Não é possível receber em dinheiro', 400)
    const result = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    expect(result.outcome).toBe('concluida')
    expect(charge().status).toBe('paid')
    expect(gw.canceled).toEqual(['pay_plataforma_1'])
    expect(captured.commissions).toHaveLength(1)
  })

  it('queda depois da transferência DONE e antes de quitar: a rodada seguinte quita uma vez', async () => {
    seed()
    let failed = false
    memory.beforeWrite = (kind, table, values) => {
      if (!failed && kind === 'update' && table === schema.platformCharges && (values as { status?: string })?.status === 'paid') {
        failed = true
        throw new Error('conexão com o banco perdida')
      }
    }
    const first = await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    expect(first.outcome).toBe('em_andamento')
    expect(attempts()[0]).toMatchObject({ status: 'em_andamento', transferStatus: 'DONE' })
    expect(charge().status).toBe('pending')

    const report = await debits.runManagedDebits(new Date(NOW.getTime() + 60_000))
    expect(report.concluded).toBe(1)
    expect(charge().status).toBe('paid')
    expect(transfers()).toHaveLength(1)
    expect(captured.commissions).toHaveLength(1)
  })
})

describe('webhook de validação de transferências', () => {
  const app = new Hono()
  app.route('/validacao', transferValidationController)
  app.onError(errorHandler)

  async function post(body: unknown, token: string | null = KEYS.validation) {
    const response = await app.request('/validacao', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { 'asaas-access-token': token } : {}) },
      body: JSON.stringify(body),
    })
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null }
  }

  it('aprova só a transferência da nossa tentativa em andamento (mesmo valor e carteira)', async () => {
    seed()
    fakeAsaas.transferCreateStatus = 'PENDING'
    await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    const transfer = transfers()[0]!

    const ok = await post({ type: 'TRANSFER', transfer: { id: transfer.id, value: 199.9, walletId: PLATFORM_WALLET, type: 'INTERNAL', status: 'PENDING' } })
    expect(ok).toEqual({ status: 200, body: { status: 'APPROVED' } })
    expect(attempts()[0]!.validatedAt).toBeInstanceOf(Date)

    expect((await post({ type: 'TRANSFER', transfer: { id: transfer.id, value: 1999 } })).body).toMatchObject({ status: 'REFUSED' })
    expect((await post({ type: 'TRANSFER', transfer: { id: transfer.id, value: 199.9, walletId: 'wallet_de_terceiro' } })).body).toMatchObject({ status: 'REFUSED' })
    expect((await post({ type: 'TRANSFER', transfer: { id: 'tra_desconhecida', value: 50 } })).body).toMatchObject({ status: 'REFUSED' })
    expect((await post({ type: 'PIX_QR_CODE', pixQrCode: { id: 'x', value: 199.9 } })).body).toMatchObject({ status: 'REFUSED' })
    expect((await post({ type: 'BILL', bill: { id: 'b' } })).body).toMatchObject({ status: 'REFUSED' })

    // Tentativa encerrada: a mesma transferência passa a ser recusada.
    attempts()[0]!.status = 'falhou'
    expect((await post({ type: 'TRANSFER', transfer: { id: transfer.id, value: 199.9 } })).body).toMatchObject({ status: 'REFUSED' })
  })

  it('payload real do Asaas (`type` = tipo de destino, sem walletId) é aprovado; fatura paga no meio → recusa', async () => {
    seed()
    fakeAsaas.transferCreateStatus = 'PENDING'
    await debits.attemptAutoDebit(CHARGE_ID, { source: 'automation', now: NOW })
    const transfer = transfers()[0]!
    for (const type of ['BANK_ACCOUNT', 'ASAAS_ACCOUNT']) {
      const result = await post({ type: 'TRANSFER', transfer: { object: 'transfer', id: transfer.id, value: 199.9, type, operationType: 'INTERNAL', status: 'PENDING' } })
      expect(result).toEqual({ status: 200, body: { status: 'APPROVED' } })
    }
    // O Pix da fatura caiu (webhook da plataforma processado) antes da nova validação: recusa.
    charge().status = 'paid'
    const refused = await post({ type: 'TRANSFER', transfer: { id: transfer.id, value: 199.9, type: 'ASAAS_ACCOUNT' } })
    expect(refused).toMatchObject({ status: 200, body: { status: 'REFUSED' } })
    expect(JSON.stringify(refused.body)).not.toContain(ORG)

    // Recusada → o Asaas cancela; a conferência encerra como "fatura paga" (sem aviso de falha ao clube, não conta tentativa).
    transfer.status = 'CANCELLED'
    const result = await debits.reconcileDebit(attempts()[0] as never, { now: new Date(NOW.getTime() + 60_000) })
    expect(result.debit).toMatchObject({ status: 'falhou', failureCode: 'fatura_paga', transferStatus: 'CANCELLED' })
    expect(captured.notified).toHaveLength(0)
    expect(gw.received).toHaveLength(0)
  })

  it('token ausente/errado → 401; resposta do POST ainda não gravada → 503 (o Asaas repete)', async () => {
    seed()
    expect((await post({ type: 'TRANSFER', transfer: { id: 'x', value: 1 } }, null)).status).toBe(401)
    expect((await post({ type: 'TRANSFER', transfer: { id: 'x', value: 1 } }, 'token-errado-token-errado-token-errado')).status).toBe(401)

    db().insertRow(schema.managedAccountDebits, {
      organizationId: ORG,
      chargeId: CHARGE_ID,
      status: 'em_andamento',
      source: 'automation',
      amount: '199.90',
      externalReference: 'adb_no_ar',
      destinationWalletId: PLATFORM_WALLET,
      transferRequestedAt: new Date(),
    })
    expect((await post({ type: 'TRANSFER', transfer: { id: 'tra_ainda_sem_id', value: 199.9 } })).status).toBe(503)
    expect(await validateTransferRequest({ type: 'TRANSFER', transfer: { id: 'tra_outro_valor', value: 10 } })).toMatchObject({ status: 'REFUSED' })
  })
})
