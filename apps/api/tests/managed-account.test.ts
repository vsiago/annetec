import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Conta de recebimento GERENCIADA pela ANNETEC: regras puras, pedido do clube
 * (aceite, regra de troca 409), aprovação (cria a subconta com a chave da
 * plataforma, grava chave/carteira/webhook), falha ao gravar depois de criar
 * (erro crítico + recuperação da chave pela API), recusa, documentos/status
 * e as travas do recebimento (conectar chave própria, desconectar). Banco em
 * memória e cliente Asaas falso — nenhuma rede.
 */

const KEYS = vi.hoisted(() => {
  const platform = '$aact_hmlg_000PlataformaANNETECChaveDeTesteComTamanhoSuficiente'
  process.env.PLATFORM_ASAAS_API_KEY = platform
  process.env.API_BASE_URL = 'https://api.teste.annetec.org.br'
  return { platform }
})

const memory = vi.hoisted(() => ({ db: null as null | Record<string, unknown>, failWrite: null as null | ((kind: string, table: unknown) => boolean) }))
const notified = vi.hoisted(() => [] as Record<string, unknown>[])

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createMemoryDb } = await import('./helpers/memory-db')
  const OPEN = ['pendente', 'aprovando', 'falhou']
  const instance = createMemoryDb({
    tables: [
      schema.organization,
      schema.tenantProfiles,
      schema.tenantAsaasAccounts,
      schema.managedAccountRequests,
      schema.managedAccountDebits,
      schema.platformCharges,
      schema.clubSubscriptions,
    ],
    uniques: [
      { table: schema.tenantAsaasAccounts, keys: ['organizationId'] },
      { table: schema.managedAccountRequests, keys: ['organizationId'], where: row => OPEN.includes(String(row.status)) },
      { table: schema.managedAccountDebits, keys: ['chargeId'], where: row => row.status === 'em_andamento' },
    ],
    beforeWrite: (kind, table) => {
      if (memory.failWrite?.(kind, table)) throw new Error('conexão com o banco perdida')
    },
  })
  memory.db = instance as unknown as Record<string, unknown>
  return { db: instance.db, sql: {} }
})

vi.mock('@/integrations/asaas/client', async importOriginal => {
  const original = await importOriginal<typeof import('@/integrations/asaas/client')>()
  const { fakeAsaasClient } = await import('./helpers/fake-asaas')
  return { ...original, createAsaasClient: fakeAsaasClient }
})

vi.mock('@/lib/notifications', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/notifications')>()),
  notify: async (input: Record<string, unknown>) => {
    notified.push(input)
    return 1
  },
}))

const schema = await import('@/db/schema')
const { fakeAsaas } = await import('./helpers/fake-asaas')
const { managedAccountService, setPersistRetryDelayMs, KEY_RECOVERY_FORBIDDEN_MESSAGE } = await import('@/modules/managed-account/service')
const { receivingAccountService } = await import('@/modules/club-billing/receiving-account.service')
const rules = await import('@/modules/managed-account/rules')
const { AppError } = await import('@/http/errors')
const { AsaasApiError } = await import('@/integrations/asaas/client')
const { logger } = await import('@/lib/logger')
const { decryptSecret, encryptSecret } = await import('@/lib/crypto')
const { MANAGED_ACCOUNT_TERMS_TEXT, MANAGED_ACCOUNT_TERMS_VERSION, ERROR_CODES, companyTypeFromLegalNature } = await import('@annetec/contracts')
const { ASAAS_WEBHOOK_EVENTS } = await import('@/integrations/asaas/webhook-events')

type Memory = import('./helpers/memory-db').MemoryDb
const db = () => memory.db as unknown as Memory

const ORG = 'org-clube-a'
const CNPJ = '11222333000181'
const ACTOR = { userId: 'u-superadmin' }
const CLUB_ADMIN = { userId: 'u-admin-clube', userName: 'Ana Admin', ip: '200.100.50.25', userAgent: 'Mozilla/5.0 teste' }
const OWN_KEY = '$aact_hmlg_000ContaPropriaDoClubeChaveDeTesteComTamanhoSuficiente'

const REQUEST_INPUT = {
  companyType: 'ASSOCIATION' as const,
  incomeValue: 25_000,
  email: 'financeiro@clube-a.org.br',
  loginEmail: 'asaas@clube-a.org.br',
  mobilePhone: '21999998888',
  phone: '2133334444',
  address: { postalCode: '20040002', street: 'Rua do Ouvidor', number: '50', complement: 'Sala 2', province: 'Centro', city: 'Rio de Janeiro', state: 'RJ' },
  acceptTerms: true as const,
  termsVersion: MANAGED_ACCOUNT_TERMS_VERSION,
}

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

function seedClub() {
  db().insertRow(schema.organization, { id: ORG, name: 'Clube A', slug: 'clube-a' })
  db().insertRow(schema.tenantProfiles, {
    organizationId: ORG,
    legalName: 'ASSOCIACAO CLUBE A',
    document: CNPJ,
    email: 'contato@clube-a.org.br',
    phone: '2133334444',
    address: { cep: '20040002', street: 'Rua do Ouvidor', number: '50', neighborhood: 'Centro', city: 'Rio de Janeiro', state: 'RJ' },
    branding: { primaryColor: '#000000', secondaryColor: '#ffffff' },
  })
}

function seedOwnAccount() {
  db().insertRow(schema.tenantAsaasAccounts, {
    organizationId: ORG,
    source: 'api_key',
    apiKeyEncrypted: encryptSecret(OWN_KEY),
    env: 'sandbox',
    keyHint: OWN_KEY.slice(-4),
    asaasAccountId: 'acc_propria',
    webhookId: 'wh_propria',
    webhookStatus: 'ativo',
  })
}

function seedLinkedSubscription() {
  db().insertRow(schema.clubSubscriptions, {
    organizationId: ORG,
    userId: 'u-associado',
    planName: 'Plano',
    planPriceMonthly: '50',
    amount: '50',
    paymentMethod: 'pix',
    status: 'active',
    dueDay: 10,
    holderName: 'Fulano',
    holderCpf: '52998224725',
    holderEmail: 'f@x.com',
    gatewayProvider: 'asaas',
    gatewayCustomerId: 'cus_1',
  })
}

const account = () => db().rows(schema.tenantAsaasAccounts).find(row => row.organizationId === ORG) ?? null
const requests = () => db().rows(schema.managedAccountRequests).filter(row => row.organizationId === ORG)

beforeEach(() => {
  db().reset()
  fakeAsaas.reset()
  fakeAsaas.platformKey = KEYS.platform
  memory.failWrite = null
  notified.length = 0
  setPersistRetryDelayMs(0)
  vi.restoreAllMocks()
  seedClub()
})

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

describe('regras', () => {
  it('corpo da criação da subconta: PJ leva companyType, PF leva birthDate; só dígitos', () => {
    const base = {
      name: 'ASSOCIACAO CLUBE A',
      cpfCnpj: CNPJ,
      companyType: 'ASSOCIATION' as const,
      birthDate: '1990-01-01',
      incomeValue: 25_000.456,
      email: 'f@a.org',
      loginEmail: 'l@a.org',
      phone: '(21) 3333-4444',
      mobilePhone: '(21) 99999-8888',
      site: null,
      address: { postalCode: '20040-002', street: 'Rua', number: '1', complement: null, province: 'Centro' },
    }
    expect(rules.subaccountPayload(base)).toEqual({
      name: 'ASSOCIACAO CLUBE A',
      email: 'f@a.org',
      loginEmail: 'l@a.org',
      cpfCnpj: CNPJ,
      companyType: 'ASSOCIATION',
      mobilePhone: '21999998888',
      phone: '2133334444',
      incomeValue: 25_000.46,
      address: 'Rua',
      addressNumber: '1',
      province: 'Centro',
      postalCode: '20040002',
    })
    const pf = rules.subaccountPayload({ ...base, cpfCnpj: '52998224725' })
    expect(pf.birthDate).toBe('1990-01-01')
    expect(pf.companyType).toBeUndefined()
    expect(rules.formatCpfCnpj(CNPJ)).toBe('11.222.333/0001-81')
  })

  it('situação geral e documentos que pedem ação do clube', () => {
    expect(rules.generalStatusOf({ general: 'APPROVED' })).toBe('aprovada')
    expect(rules.generalStatusOf({ general: 'AWAITING_APPROVAL' })).toBe('em_analise')
    expect(rules.generalStatusOf({ general: 'PENDING' })).toBe('pendente')
    expect(rules.generalStatusOf(null)).toBe('desconhecida')
    const snapshot = rules.documentsSnapshotOf({
      rejectReasons: 'Documento ilegível',
      data: [
        { id: 'g1', status: 'NOT_SENT', type: 'IDENTIFICATION', title: 'Documento do responsável', onboardingUrl: 'https://asaas.com/onboarding/1', responsible: { name: 'Ana' } },
        { id: 'g2', status: 'PENDING', type: 'MINUTES_OF_ELECTION', title: 'Ata de eleição' },
        { id: 'g3', status: 'REJECTED', type: 'SOCIAL_CONTRACT', title: 'Estatuto' },
        { id: 'g4', status: 'APPROVED', type: 'CUSTOM', title: 'Outro' },
      ],
    })
    const docs = rules.documentsOf(snapshot)
    expect(docs.map(doc => [doc.id, doc.statusLabel, doc.actionRequired])).toEqual([
      ['g1', 'Não enviado', true],
      ['g2', 'Em análise', false],
      ['g3', 'Recusado', true],
      ['g4', 'Aprovado', false],
    ])
    expect(docs[0]).toMatchObject({ onboardingUrl: 'https://asaas.com/onboarding/1', responsibleName: 'Ana' })
  })

  it('quando debitar: vencida/em aberto; cartão só esgotado; limite e intervalo; concluída nunca; em andamento confere', () => {
    const now = new Date('2026-11-10T12:00:00Z')
    const today = '2026-11-10'
    const config = { maxAttempts: 3, retryIntervalHours: 24 }
    const charge = { status: 'pending', kind: 'monthly', method: 'pix', dueDate: today, amount: '199.90', organizationId: ORG }
    const failed = (hoursAgo: number, failureCode: 'saldo_insuficiente' | 'fatura_paga' = 'saldo_insuficiente') => ({
      status: 'falhou' as const,
      failureCode,
      startedAt: new Date(now.getTime() - hoursAgo * 3_600_000),
    })
    expect(rules.debitDecision(charge, [], today, now, config, 'automation')).toEqual({ action: 'debit' })
    expect(rules.debitDecision({ ...charge, dueDate: '2026-11-11' }, [], today, now, config, 'automation').action).toBe('skip')
    expect(rules.debitDecision({ ...charge, status: 'paid' }, [], today, now, config, 'automation').action).toBe('skip')
    expect(rules.debitDecision({ ...charge, kind: 'activation' }, [], today, now, config, 'automation').action).toBe('skip')
    expect(rules.debitDecision({ ...charge, method: 'credit_card' }, [], today, now, config, 'automation').action).toBe('skip')
    expect(rules.debitDecision({ ...charge, method: 'credit_card', status: 'overdue' }, [], today, now, config, 'automation').action).toBe('debit')
    // Uma por dia, até 3 falhas (a "fatura paga" não conta).
    expect(rules.debitDecision(charge, [failed(2)], today, now, config, 'automation').action).toBe('skip')
    expect(rules.debitDecision(charge, [failed(25)], today, now, config, 'automation').action).toBe('debit')
    expect(rules.debitDecision(charge, [failed(73), failed(49), failed(25)], today, now, config, 'automation')).toMatchObject({ action: 'skip', reason: 'Tentativas esgotadas (3)' })
    expect(rules.debitDecision(charge, [failed(73, 'fatura_paga'), failed(49), failed(25)], today, now, config, 'automation').action).toBe('debit')
    // Manual (superadmin) ignora limite e intervalo, mas nunca a concluída/andamento.
    expect(rules.debitDecision(charge, [failed(73), failed(49), failed(1)], today, now, config, 'manual').action).toBe('debit')
    expect(rules.debitDecision(charge, [{ status: 'concluida', failureCode: null, startedAt: now }], today, now, config, 'manual')).toMatchObject({ action: 'skip', done: true })
    expect(rules.debitDecision(charge, [{ status: 'em_andamento', failureCode: null, startedAt: now }], today, now, config, 'manual').action).toBe('reconcile')
  })

  it('webhook de validação: só a NOSSA transferência em andamento é aprovada', () => {
    const transfer = { id: 'tra_1', value: 199.9, walletId: 'wallet_annetec', type: 'INTERNAL' }
    const debit = { status: 'em_andamento' as const, amount: '199.90', destinationWalletId: 'wallet_annetec', managedAccount: true, chargeOpen: true }
    expect(rules.transferValidationDecision('TRANSFER', transfer, debit, false)).toEqual({ status: 'APPROVED' })
    expect(rules.transferValidationDecision('TRANSFER', { ...transfer, walletId: null, type: null }, debit, false)).toEqual({ status: 'APPROVED' })
    expect(rules.transferValidationDecision('TRANSFER', { ...transfer, value: 199.91 }, debit, false).status).toBe('REFUSED')
    expect(rules.transferValidationDecision('TRANSFER', { ...transfer, walletId: 'wallet_outra' }, debit, false).status).toBe('REFUSED')
    // `transfer.type` é o tipo de DESTINO no payload do Asaas (BANK_ACCOUNT/ASAAS_ACCOUNT/INTERNAL, documentado de formas diferentes):
    // não pode recusar a nossa transferência — o vínculo é o id gravado da resposta do nosso POST.
    for (const type of ['BANK_ACCOUNT', 'ASAAS_ACCOUNT', 'INTERNAL']) {
      expect(rules.transferValidationDecision('TRANSFER', { ...transfer, type }, debit, false)).toEqual({ status: 'APPROVED' })
    }
    // Fatura paga por Pix/boleto entre a conferência e a validação: recusa (o dinheiro fica no saldo do clube).
    expect(rules.transferValidationDecision('TRANSFER', transfer, { ...debit, chargeOpen: false }, false).status).toBe('REFUSED')
    expect(rules.transferValidationDecision('TRANSFER', transfer, { ...debit, destinationWalletId: null }, false).status).toBe('REFUSED')
    expect(rules.transferValidationDecision('TRANSFER', transfer, { ...debit, status: 'falhou' }, false).status).toBe('REFUSED')
    expect(rules.transferValidationDecision('TRANSFER', transfer, { ...debit, managedAccount: false }, false).status).toBe('REFUSED')
    expect(rules.transferValidationDecision('TRANSFER', transfer, null, false).status).toBe('REFUSED')
    expect(rules.transferValidationDecision('TRANSFER', transfer, null, true)).toEqual({ status: 'RETRY' })
    expect(rules.transferValidationDecision('PIX_QR_CODE', transfer, debit, false).status).toBe('REFUSED')
    expect(rules.transferValidationDecision('BILL', null, null, true).status).toBe('REFUSED')
  })
})

// ---------------------------------------------------------------------------
// Pedido do clube
// ---------------------------------------------------------------------------

describe('tipo de empresa pela natureza jurídica (Receita)', () => {
  it('correspondências inequívocas pelo código ou pelo nome', () => {
    expect(companyTypeFromLegalNature({ code: '3999', name: 'Associação Privada' })).toBe('ASSOCIATION')
    expect(companyTypeFromLegalNature({ code: '206-2', name: 'Sociedade Empresária Limitada' })).toBe('LIMITED')
    expect(companyTypeFromLegalNature({ code: '2240' })).toBe('LIMITED')
    expect(companyTypeFromLegalNature({ code: '2135', name: 'Empresário (Individual)' })).toBe('INDIVIDUAL')
    expect(companyTypeFromLegalNature({ code: '2135', name: 'Empresário (Individual)', mei: true })).toBe('MEI')
    expect(companyTypeFromLegalNature({ name: 'Associação Privada' })).toBe('ASSOCIATION')
    expect(companyTypeFromLegalNature({ name: 'Sociedade Empresária Limitada' })).toBe('LIMITED')
  })

  it('sem correspondência (sindicato, fundação, S.A., nada informado): null — a tela pede escolha e confirmação', () => {
    expect(companyTypeFromLegalNature({ code: '3131', name: 'Entidade Sindical' })).toBeNull()
    expect(companyTypeFromLegalNature({ code: '3069', name: 'Fundação Privada' })).toBeNull()
    expect(companyTypeFromLegalNature({ code: '2054', name: 'Sociedade Anônima Fechada' })).toBeNull()
    expect(companyTypeFromLegalNature({})).toBeNull()
    expect(companyTypeFromLegalNature({ name: 'Associação de qualquer coisa' })).toBeNull()
  })
})

describe('pedido do clube', () => {
  it('grava os dados e o aceite (texto, versão, usuário, data, IP) e avisa a equipe; outro pedido fica bloqueado', async () => {
    const before = await managedAccountService.clubStatus(ORG)
    expect(before).toMatchObject({ request: null, canRequest: true, blockedReason: null, terms: { version: MANAGED_ACCOUNT_TERMS_VERSION } })
    expect(before.defaults).toMatchObject({ name: 'ASSOCIACAO CLUBE A', cpfCnpj: '11.222.333/0001-81', personType: 'PJ', address: { postalCode: '20040002', province: 'Centro' } })

    const status = await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    expect(status.request).toMatchObject({
      status: 'pendente',
      name: 'ASSOCIACAO CLUBE A',
      cpfCnpj: '11.222.333/****-**',
      companyType: 'ASSOCIATION',
      incomeValue: 25_000,
      loginEmail: 'asaas@clube-a.org.br',
      terms: { version: MANAGED_ACCOUNT_TERMS_VERSION, text: MANAGED_ACCOUNT_TERMS_TEXT, acceptedByName: 'Ana Admin', acceptedIp: '200.100.50.25' },
    })
    expect(status.canRequest).toBe(false)
    const [row] = requests()
    expect(row).toMatchObject({ acceptedByUserId: 'u-admin-clube', acceptedUserAgent: 'Mozilla/5.0 teste', termsText: MANAGED_ACCOUNT_TERMS_TEXT })
    expect(row!.acceptedAt).toBeInstanceOf(Date)
    expect(notified).toEqual([
      expect.objectContaining({
        audience: 'platform',
        kind: 'managed_account_requested',
        organizationId: ORG,
        // O pedido abre direto na central de Aprovações, na aba e no clube certos.
        link: `/admin/compliance?tipo=contas-gerenciadas&clube=${ORG}`,
      }),
    ])

    const again = await rejection(managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN))
    expect(again.code).toBe(ERROR_CODES.CONFLICT)
    expect(again.message).toMatch(/pedido em análise/)
    expect(requests()).toHaveLength(1)
  })

  it('dois envios simultâneos gravam um pedido só (índice único parcial)', async () => {
    const results = await Promise.allSettled([
      managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN),
      managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(requests()).toHaveLength(1)
  })

  it('termo de versão antiga é recusado; CNPJ exige natureza jurídica', async () => {
    const outdated = await rejection(managedAccountService.submitRequest(ORG, { ...REQUEST_INPUT, termsVersion: '2020-01-01' }, CLUB_ADMIN))
    expect(outdated.code).toBe(ERROR_CODES.BUSINESS_RULE_VIOLATION)
    const missing = await rejection(managedAccountService.submitRequest(ORG, { ...REQUEST_INPUT, companyType: undefined }, CLUB_ADMIN))
    expect(missing.code).toBe(ERROR_CODES.VALIDATION_ERROR)
    expect(requests()).toHaveLength(0)
  })

  it('regra de troca: conta própria com assinaturas vinculadas → 409; sem vínculo pode pedir', async () => {
    seedOwnAccount()
    seedLinkedSubscription()
    const blocked = await rejection(managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN))
    expect(blocked.code).toBe(ERROR_CODES.CONFLICT)
    expect(blocked.message).toMatch(/1 assinatura vinculada/)
    expect((await managedAccountService.clubStatus(ORG)).canRequest).toBe(false)

    db().rows(schema.clubSubscriptions).length = 0
    const status = await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    expect(status.request?.status).toBe('pendente')
  })
})

// ---------------------------------------------------------------------------
// Aprovação, recusa e recuperação
// ---------------------------------------------------------------------------

describe('aprovação pelo superadmin', () => {
  it('cria a subconta com a chave da PLATAFORMA e grava chave (cifrada), carteira e webhook do clube', async () => {
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    notified.length = 0
    const detail = await managedAccountService.approve(ORG, ACTOR)

    // POST /v3/accounts com a chave da ANNETEC, depois de conferir que não há subconta deste CNPJ.
    const platformCalls = fakeAsaas.calls.filter(call => call.apiKey === KEYS.platform).map(call => call.call)
    expect(platformCalls).toEqual(['accounts.list', 'accounts.create'])
    expect(fakeAsaas.createdPayloads[0]).toMatchObject({
      name: 'ASSOCIACAO CLUBE A',
      cpfCnpj: CNPJ,
      companyType: 'ASSOCIATION',
      incomeValue: 25_000,
      mobilePhone: '21999998888',
      postalCode: '20040002',
      address: 'Rua do Ouvidor',
      addressNumber: '50',
      province: 'Centro',
      loginEmail: 'asaas@clube-a.org.br',
    })
    const sub = fakeAsaas.subaccounts[0]!
    const row = account()!
    expect(row).toMatchObject({ source: 'subaccount', env: 'sandbox', asaasAccountId: sub.id, walletId: sub.walletId, autoDebitEnabled: true, keyHint: sub.apiKey.slice(-4) })
    expect(String(row.apiKeyEncrypted)).not.toContain(sub.apiKey)
    expect(decryptSecret(String(row.apiKeyEncrypted))).toBe(sub.apiKey)
    expect(requests()[0]).toMatchObject({ status: 'aprovado', asaasAccountId: sub.id, walletId: sub.walletId, decidedByUserId: 'u-superadmin' })

    // Webhook do clube cadastrado NA SUBCONTA (chave dela), com o token guardado cifrado.
    expect(fakeAsaas.webhooks).toHaveLength(1)
    const hook = fakeAsaas.webhooks[0]!
    expect(hook.apiKey).toBe(sub.apiKey)
    expect(hook.input).toMatchObject({ url: `https://api.teste.annetec.org.br/api/v1/webhooks/asaas/clube/${ORG}`, events: [...ASAAS_WEBHOOK_EVENTS] })
    expect(decryptSecret(String(row.webhookTokenEncrypted))).toBe(hook.input.authToken)
    expect(row.webhookStatus).toBe('ativo')

    expect(detail).toMatchObject({ asaasAccountId: sub.id, walletId: sub.walletId, keyRecoveryNeeded: false })
    expect(detail.account).toMatchObject({ connected: true, source: 'subaccount', managed: { autoDebitEnabled: true, generalStatus: 'desconhecida', lastDebit: null } })
    expect(JSON.stringify(detail)).not.toContain(sub.apiKey)
    expect(notified).toEqual([expect.objectContaining({ audience: 'tenant', kind: 'managed_account_decided', title: 'Conta gerenciada aprovada' })])

    // O provider do club-billing passa a usar a subconta.
    const { resolveClubAsaasCredentials } = await import('@/modules/club-billing/receiving-account.service')
    expect((await resolveClubAsaasCredentials(ORG))?.apiKey).toBe(sub.apiKey)
  })

  it('troca da conta própria SEM vínculos: apaga o webhook da conta antiga e passa a usar a subconta', async () => {
    seedOwnAccount()
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    await managedAccountService.approve(ORG, ACTOR)
    expect(fakeAsaas.calls).toContainEqual({ apiKey: OWN_KEY, call: 'webhooks.delete', args: 'wh_propria' })
    expect(account()).toMatchObject({ source: 'subaccount' })
  })

  it('vínculo surgido depois do pedido: aprovação recusada (409) e o pedido volta a pendente', async () => {
    seedOwnAccount()
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    seedLinkedSubscription()
    const error = await rejection(managedAccountService.approve(ORG, ACTOR))
    expect(error.code).toBe(ERROR_CODES.CONFLICT)
    expect(fakeAsaas.createdPayloads).toHaveLength(0)
    expect(requests()[0]).toMatchObject({ status: 'pendente' })
    expect(account()).toMatchObject({ source: 'api_key' })
  })

  it('já existe subconta deste CNPJ (ex.: criação anterior sem resposta): não cria a segunda', async () => {
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    fakeAsaas.createSubaccountThrowsAfterCreate = new AsaasApiError(ERROR_CODES.UPSTREAM_TIMEOUT, 'O Asaas não respondeu a tempo', 0)
    await expect(managedAccountService.approve(ORG, ACTOR)).rejects.toThrow(/não respondeu a tempo/)
    expect(requests()[0]).toMatchObject({ status: 'falhou' })
    expect(fakeAsaas.subaccounts).toHaveLength(1)

    fakeAsaas.createSubaccountThrowsAfterCreate = null
    const again = await rejection(managedAccountService.approve(ORG, ACTOR))
    expect(again.code).toBe(ERROR_CODES.CONFLICT)
    expect(again.message).toMatch(/Recuperar chave/)
    expect(fakeAsaas.subaccounts).toHaveLength(1)
    expect(requests()[0]).toMatchObject({ status: 'falhou', asaasAccountId: fakeAsaas.subaccounts[0]!.id })
    expect((await managedAccountService.detail(ORG)).keyRecoveryNeeded).toBe(true)
  })

  it('Asaas recusa os dados: pedido falhou com o motivo (pode recusar ou aprovar de novo)', async () => {
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    fakeAsaas.createSubaccountError = new AsaasApiError(ERROR_CODES.BUSINESS_RULE_VIOLATION, 'O CEP informado não foi encontrado', 400)
    const error = await rejection(managedAccountService.approve(ORG, ACTOR))
    expect(error.code).toBe(ERROR_CODES.BUSINESS_RULE_VIOLATION)
    expect(requests()[0]).toMatchObject({ status: 'falhou', lastError: expect.stringMatching(/CEP informado/) })
    expect(account()).toBeNull()
  })

  it('falha ao GRAVAR depois de criar: erro crítico com o id da subconta (sem a chave no log) e recuperação pela API', async () => {
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    const errors = vi.spyOn(logger, 'error')
    memory.failWrite = (kind, table) => kind === 'insert' && table === schema.tenantAsaasAccounts

    const error = await rejection(managedAccountService.approve(ORG, ACTOR))
    const sub = fakeAsaas.subaccounts[0]!
    expect(error.code).toBe(ERROR_CODES.INTERNAL_ERROR)
    expect(error.message).toContain(sub.id)
    expect(account()).toBeNull()
    expect(requests()[0]).toMatchObject({ status: 'falhou', asaasAccountId: sub.id, walletId: sub.walletId })
    const critical = errors.mock.calls.find(call => (call[0] as { alert?: string }).alert === 'managed_account_key_not_saved')
    expect(critical?.[0]).toMatchObject({ organizationId: ORG, asaasAccountId: sub.id, walletId: sub.walletId })
    expect(JSON.stringify(errors.mock.calls)).not.toContain(sub.apiKey)

    // Recuperação: nova chave pela API (POST /accounts/{id}/accessTokens) e gravação normal.
    memory.failWrite = null
    const detail = await managedAccountService.recoverKey(ORG, ACTOR)
    expect(fakeAsaas.accessTokensCreated).toEqual([{ accountId: sub.id, apiKey: sub.apiKey }])
    expect(decryptSecret(String(account()!.apiKeyEncrypted))).toBe(sub.apiKey)
    expect(account()).toMatchObject({ source: 'subaccount', asaasAccountId: sub.id, walletId: sub.walletId, autoDebitEnabled: true })
    expect(requests()[0]).toMatchObject({ status: 'aprovado' })
    expect(detail.keyRecoveryNeeded).toBe(false)
    expect(fakeAsaas.webhooks.filter(hook => hook.apiKey === sub.apiKey)).toHaveLength(1)
  })

  it('Asaas ignora o filtro de CPF/CNPJ: a subconta de OUTRO clube nunca é conectada nem tem chave gerada', async () => {
    const other = { id: 'acc_clube_b', walletId: 'wallet_clube_b', cpfCnpj: '99888777000166', name: 'Clube B', email: 'b@b', apiKey: '$aact_hmlg_000SubcontaDoClubeBChaveDeTesteComTamanhoSuficiente' }
    fakeAsaas.subaccounts.push(other)
    fakeAsaas.accountsListIgnoresFilter = true
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    // Criação sem resposta e SEM subconta criada: pedido falhou sem id.
    fakeAsaas.createSubaccountError = new AsaasApiError(ERROR_CODES.UPSTREAM_TIMEOUT, 'O Asaas não respondeu a tempo', 0)
    await rejection(managedAccountService.approve(ORG, ACTOR))
    expect(requests()[0]).toMatchObject({ status: 'falhou' })
    expect(requests()[0]!.asaasAccountId ?? null).toBeNull()

    // Recuperar: a lista devolve só a subconta do clube B → não serve (CPF/CNPJ diferente).
    const error = await rejection(managedAccountService.recoverKey(ORG, ACTOR))
    expect(error.code).toBe(ERROR_CODES.NOT_FOUND)
    expect(fakeAsaas.accessTokensCreated).toHaveLength(0)
    expect(account()).toBeNull()

    // Aprovar de novo: a subconta do B não conta como "já existe" — cria a do clube A.
    fakeAsaas.createSubaccountError = null
    await managedAccountService.approve(ORG, ACTOR)
    expect(fakeAsaas.createdPayloads).toHaveLength(1)
    expect(account()).toMatchObject({ source: 'subaccount', accountCpfCnpj: CNPJ })
    expect(account()!.asaasAccountId).not.toBe(other.id)
  })

  it('recuperar chave de subconta que já é de outro clube → 409, sem gerar chave', async () => {
    db().insertRow(schema.organization, { id: 'org-clube-b', name: 'Clube B', slug: 'clube-b' })
    db().insertRow(schema.tenantAsaasAccounts, {
      organizationId: 'org-clube-b',
      source: 'subaccount',
      apiKeyEncrypted: encryptSecret('$aact_hmlg_000SubcontaDoClubeBChaveDeTesteComTamanhoSuficiente'),
      env: 'sandbox',
      keyHint: 'ente',
      asaasAccountId: 'acc_clube_b',
      walletId: 'wallet_clube_b',
    })
    fakeAsaas.subaccounts.push({ id: 'acc_clube_b', walletId: 'wallet_clube_b', cpfCnpj: CNPJ, name: 'Clube B', email: 'b@b', apiKey: 'x' })
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    Object.assign(requests()[0]!, { status: 'falhou', asaasAccountId: 'acc_clube_b' })

    const error = await rejection(managedAccountService.recoverKey(ORG, ACTOR))
    expect(error.code).toBe(ERROR_CODES.CONFLICT)
    expect(error.message).toMatch(/outro clube/)
    expect(fakeAsaas.accessTokensCreated).toHaveLength(0)
    expect(account()).toBeNull()
  })

  it('resposta 2xx ilegível na criação: tratada como "pode ter sido criada", sem repassar o texto (traria a chave)', async () => {
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    const leaked = '$aact_hmlg_000VazadaNaMensagemDoErro'
    fakeAsaas.createSubaccountThrowsAfterCreate = new SyntaxError(`Unexpected token in JSON: {"accessToken":{"apiKey":"${leaked}"`)
    const errors = vi.spyOn(logger, 'error')
    const error = await rejection(managedAccountService.approve(ORG, ACTOR))
    expect(error.code).toBe(ERROR_CODES.UPSTREAM_ERROR)
    expect(error.message).not.toContain(leaked)
    expect(String(requests()[0]!.lastError)).not.toContain(leaked)
    expect(JSON.stringify(errors.mock.calls)).not.toContain(leaked)
    // Aprovar de novo acha a subconta criada (nunca cria a segunda).
    fakeAsaas.createSubaccountThrowsAfterCreate = null
    expect((await rejection(managedAccountService.approve(ORG, ACTOR))).message).toMatch(/Recuperar chave/)
    expect(fakeAsaas.subaccounts).toHaveLength(1)
  })

  it('recuperação sem a habilitação no painel (403): orienta o superadmin', async () => {
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    memory.failWrite = (kind, table) => kind === 'insert' && table === schema.tenantAsaasAccounts
    await rejection(managedAccountService.approve(ORG, ACTOR))
    memory.failWrite = null
    fakeAsaas.accessTokenError = new AsaasApiError(ERROR_CODES.UPSTREAM_UNAUTHORIZED, 'Forbidden', 403)
    const error = await rejection(managedAccountService.recoverKey(ORG, ACTOR))
    expect(error.message).toBe(KEY_RECOVERY_FORBIDDEN_MESSAGE)
  })

  it('recusa com motivo avisa o clube; sem pedido em aberto → 409', async () => {
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    notified.length = 0
    const detail = await managedAccountService.refuse(ORG, 'CNPJ diferente do estatuto', ACTOR)
    expect(detail.request).toMatchObject({ status: 'recusado', refuseReason: 'CNPJ diferente do estatuto' })
    expect(notified).toEqual([expect.objectContaining({ audience: 'tenant', kind: 'managed_account_decided', body: 'CNPJ diferente do estatuto' })])
    expect(fakeAsaas.createdPayloads).toHaveLength(0)
    expect((await rejection(managedAccountService.refuse(ORG, 'de novo', ACTOR))).code).toBe(ERROR_CODES.CONFLICT)
    expect((await rejection(managedAccountService.approve(ORG, ACTOR))).code).toBe(ERROR_CODES.CONFLICT)
    // Recusado não bloqueia um pedido novo.
    expect((await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)).request?.status).toBe('pendente')
  })
})

// ---------------------------------------------------------------------------
// Documentos/status e travas do recebimento
// ---------------------------------------------------------------------------

describe('correção do pedido pelo superadmin (antes de aprovar)', () => {
  const SUPERADMIN = { userId: 'u-superadmin', name: 'Sara Superadmin' }

  it('corrige tipo de empresa, faturamento, contatos e endereço; mantém o aceite original; a aprovação usa os dados novos', async () => {
    await managedAccountService.submitRequest(ORG, { ...REQUEST_INPUT, companyType: 'MEI' }, CLUB_ADMIN)
    const before = requests()[0]!
    const { detail, changes, requestId } = await managedAccountService.updateRequest(
      ORG,
      {
        companyType: 'ASSOCIATION',
        incomeValue: 40_000.456,
        mobilePhone: '21988887777',
        phone: null,
        address: { ...REQUEST_INPUT.address, number: '52', state: 'rj' },
      },
      SUPERADMIN,
    )
    expect(requestId).toBe(before.id)
    expect(changes).toEqual({
      companyType: { de: 'MEI', para: 'ASSOCIATION' },
      incomeValue: { de: 25_000, para: 40_000.46 },
      phone: { de: '2133334444', para: null },
      mobilePhone: { de: '21999998888', para: '21988887777' },
      address: { de: expect.objectContaining({ number: '50' }), para: expect.objectContaining({ number: '52', state: 'RJ' }) },
    })
    // Console: CNPJ completo e o histórico da correção; o aceite (quem, quando, IP) é o original.
    expect(detail.request).toMatchObject({
      cpfCnpj: '11.222.333/0001-81',
      companyType: 'ASSOCIATION',
      incomeValue: 40_000.46,
      phone: null,
      terms: { acceptedByName: 'Ana Admin', acceptedIp: '200.100.50.25' },
      corrections: [{ byName: 'Sara Superadmin', fields: ['Tipo de empresa', 'Faturamento mensal', 'Telefone fixo', 'Celular', 'Endereço'] }],
    })
    const after = requests()[0]!
    expect(after.acceptedAt).toEqual(before.acceptedAt)
    expect(after.acceptedByUserId).toBe('u-admin-clube')

    // O clube continua vendo o documento mascarado.
    expect((await managedAccountService.clubStatus(ORG)).request?.cpfCnpj).toBe('11.222.333/****-**')

    await managedAccountService.approve(ORG, ACTOR)
    expect(fakeAsaas.createdPayloads[0]).toMatchObject({ companyType: 'ASSOCIATION', incomeValue: 40_000.46, mobilePhone: '21988887777', addressNumber: '52' })
    expect(fakeAsaas.createdPayloads[0]).not.toHaveProperty('phone')

    // Depois de aprovado não corrige mais.
    const late = await rejection(managedAccountService.updateRequest(ORG, { incomeValue: 1 }, SUPERADMIN))
    expect(late.code).toBe(ERROR_CODES.CONFLICT)
  })

  it('sem mudança real não grava correção; CNPJ não aceita data de nascimento', async () => {
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    const same = await managedAccountService.updateRequest(ORG, { companyType: 'ASSOCIATION', email: REQUEST_INPUT.email }, SUPERADMIN)
    expect(same.changes).toEqual({})
    expect((requests()[0]!.data as { corrections?: unknown }).corrections).toBeUndefined()

    const wrong = await rejection(managedAccountService.updateRequest(ORG, { birthDate: '1990-01-01' }, SUPERADMIN))
    expect(wrong.code).toBe(ERROR_CODES.VALIDATION_ERROR)
  })

  it('sem pedido em aberto, ou recusado → 409', async () => {
    expect((await rejection(managedAccountService.updateRequest(ORG, { incomeValue: 10 }, SUPERADMIN))).code).toBe(ERROR_CODES.CONFLICT)
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    await managedAccountService.refuse(ORG, 'CNPJ não confere', ACTOR)
    expect((await rejection(managedAccountService.updateRequest(ORG, { incomeValue: 10 }, SUPERADMIN))).code).toBe(ERROR_CODES.CONFLICT)
  })
})

describe('documentos e situação da subconta', () => {
  it('atualizar status grava o retrato e o DTO mostra documentos pendentes com links', async () => {
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    await managedAccountService.approve(ORG, ACTOR)
    const sub = fakeAsaas.subaccounts[0]!
    fakeAsaas.status.set(sub.apiKey, { id: sub.id, general: 'AWAITING_APPROVAL', documentation: 'PENDING', commercialInfo: 'APPROVED' })
    fakeAsaas.documents.set(sub.apiKey, {
      rejectReasons: null,
      data: [
        { id: 'grp_1', status: 'NOT_SENT', type: 'IDENTIFICATION', title: 'Documento de identificação', onboardingUrl: 'https://sandbox.asaas.com/onboarding/abc', onboardingUrlExpirationDate: '2026-11-30 23:59:59' },
        { id: 'grp_2', status: 'APPROVED', type: 'SOCIAL_CONTRACT', title: 'Estatuto' },
      ],
    })
    const dto = await managedAccountService.refreshStatus(ORG)
    expect(fakeAsaas.calls.filter(call => call.apiKey === sub.apiKey).map(call => call.call)).toEqual(
      expect.arrayContaining(['account.status', 'account.documents']),
    )
    expect(dto.managed).toMatchObject({
      generalStatus: 'em_analise',
      generalStatusLabel: 'Em análise',
      pendingDocuments: 1,
      documents: [
        { id: 'grp_1', actionRequired: true, onboardingUrl: 'https://sandbox.asaas.com/onboarding/abc', statusLabel: 'Não enviado' },
        { id: 'grp_2', actionRequired: false },
      ],
    })
    expect(dto.managed?.documentsCheckedAt).not.toBeNull()
    expect(dto.accountStatus).toMatchObject({ approved: false, general: 'AWAITING_APPROVAL' })
  })

  it('chave da subconta recusada pelo Asaas → 422 orientando a recuperação; conta própria não tem este status', async () => {
    seedOwnAccount()
    expect((await rejection(managedAccountService.refreshStatus(ORG))).code).toBe(ERROR_CODES.BUSINESS_RULE_VIOLATION)
    db().rows(schema.tenantAsaasAccounts).length = 0
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    await managedAccountService.approve(ORG, ACTOR)
    fakeAsaas.statusError = new AsaasApiError(ERROR_CODES.UPSTREAM_UNAUTHORIZED, 'chave inválida', 401)
    const error = await rejection(managedAccountService.refreshStatus(ORG))
    expect(error.message).toMatch(/Recuperar chave/)
  })
})

describe('travas do recebimento com conta gerenciada', () => {
  async function managed() {
    await managedAccountService.submitRequest(ORG, REQUEST_INPUT, CLUB_ADMIN)
    await managedAccountService.approve(ORG, ACTOR)
  }

  it('admin do clube não cola chave própria por cima da conta gerenciada (409)', async () => {
    await managed()
    const error = await rejection(receivingAccountService.connect(ORG, { apiKey: OWN_KEY }, { userId: 'u-admin-clube' }))
    expect(error.code).toBe(ERROR_CODES.CONFLICT)
    expect(account()).toMatchObject({ source: 'subaccount' })
  })

  it('desconectar: admin do clube 403; superadmin pode (a subconta continua no Asaas); débito em andamento bloqueia', async () => {
    await managed()
    expect((await rejection(receivingAccountService.disconnect(ORG))).code).toBe(ERROR_CODES.FORBIDDEN)

    db().insertRow(schema.managedAccountDebits, { organizationId: ORG, chargeId: null, status: 'em_andamento', source: 'automation', amount: '10', externalReference: 'adb_x' })
    expect((await rejection(managedAccountService.disconnect(ORG))).code).toBe(ERROR_CODES.CONFLICT)
    db().rows(schema.managedAccountDebits).length = 0

    const detail = await managedAccountService.disconnect(ORG)
    expect(account()).toBeNull()
    expect(detail.account.connected).toBe(false)
    expect(fakeAsaas.subaccounts).toHaveLength(1)
    // Desconectada, o clube pode pedir de novo ou conectar conta própria.
    expect((await managedAccountService.clubStatus(ORG)).blockedReason).toBeNull()
  })

  it('liga/desliga o débito automático só em conta gerenciada', async () => {
    seedOwnAccount()
    expect((await rejection(managedAccountService.setAutoDebit(ORG, false))).code).toBe(ERROR_CODES.BUSINESS_RULE_VIOLATION)
    db().rows(schema.tenantAsaasAccounts).length = 0
    await managed()
    expect((await managedAccountService.setAutoDebit(ORG, false)).account.managed?.autoDebitEnabled).toBe(false)
    expect(account()!.autoDebitEnabled).toBe(false)
  })

  it('lista da plataforma: pedidos em aberto primeiro, sem saldo', async () => {
    db().insertRow(schema.organization, { id: 'org-b', name: 'Bravo', slug: 'bravo' })
    await managed()
    db().insertRow(schema.managedAccountRequests, {
      organizationId: 'org-b',
      status: 'pendente',
      data: { ...REQUEST_INPUT, name: 'Bravo', cpfCnpj: CNPJ, birthDate: null, site: null, phone: null },
      termsVersion: MANAGED_ACCOUNT_TERMS_VERSION,
      termsText: MANAGED_ACCOUNT_TERMS_TEXT,
      acceptedByUserId: 'u-b',
      acceptedAt: new Date(),
    })
    const list = await managedAccountService.list()
    expect(list.map(item => [item.tenantSlug, item.request?.status, item.source])).toEqual([
      ['bravo', 'pendente', null],
      ['clube-a', 'aprovado', 'subaccount'],
    ])
    expect(await managedAccountService.list({ status: 'aprovado' })).toHaveLength(1)
    expect(fakeAsaas.calls.some(call => call.call === 'finance.balance')).toBe(false)
  })
})
