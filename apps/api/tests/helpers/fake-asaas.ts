/**
 * Cliente Asaas FALSO (nenhuma chamada de rede) para os testes da conta
 * gerenciada: subcontas, chaves, documentos, saldo, carteiras,
 * transferências e webhooks — cada conta identificada pela chave de API.
 * Use num `vi.mock('@/integrations/asaas/client', …)` que troca só o
 * `createAsaasClient` (o `AsaasApiError` real continua valendo).
 */

export interface FakeSubaccount {
  id: string
  walletId: string
  cpfCnpj: string
  name: string
  email: string
  apiKey: string
}

export interface FakeTransfer {
  id: string
  value: number
  walletId: string
  externalReference: string | null
  status: string
  ownerKey: string
  authorized: boolean
  failReason: string | null
  type: string
}

export interface FakeWebhook {
  apiKey: string
  id: string
  input: Record<string, unknown>
}

type Status = { id?: string; commercialInfo?: string; bankAccountInfo?: string; documentation?: string; general?: string }

function freshState() {
  return {
    platformKey: '',
    platformWallet: 'wallet_annetec_0001',
    subaccounts: [] as FakeSubaccount[],
    createSubaccountError: null as Error | null,
    /** Cria a subconta e DEPOIS lança (timeout depois de o Asaas ter criado). */
    createSubaccountThrowsAfterCreate: null as Error | null,
    createdPayloads: [] as Record<string, unknown>[],
    /** `GET /accounts` ignora o filtro `cpfCnpj` (devolve todas as subcontas). */
    accountsListIgnoresFilter: false,
    accessTokenError: null as Error | null,
    accessTokensCreated: [] as { accountId: string; apiKey: string }[],
    status: new Map<string, Status>(),
    statusError: null as Error | null,
    documents: new Map<string, Record<string, unknown>>(),
    documentsError: null as Error | null,
    balance: new Map<string, number>(),
    balanceError: null as Error | null,
    transfers: [] as FakeTransfer[],
    transferCreateStatus: 'DONE',
    transferCreateError: null as Error | null,
    /** Cria a transferência e DEPOIS lança (resposta perdida). */
    transferThrowsAfterCreate: null as Error | null,
    transferCancelError: null as Error | null,
    webhooks: [] as FakeWebhook[],
    /** Status cru dos pagamentos da conta da ANNETEC (`payments.get`). */
    payments: new Map<string, string>(),
    clients: [] as { apiKey: string; environment: string }[],
    calls: [] as { apiKey: string; call: string; args?: unknown }[],
  }
}

export const fakeAsaas = {
  ...freshState(),
  reset() {
    Object.assign(fakeAsaas, freshState())
  },
}

let seq = 0
const nextId = (prefix: string) => `${prefix}_${String(++seq).padStart(6, '0')}`

function transferDto(transfer: FakeTransfer) {
  return {
    object: 'transfer',
    id: transfer.id,
    type: transfer.type,
    value: transfer.value,
    walletId: transfer.walletId,
    status: transfer.status,
    authorized: transfer.authorized,
    failReason: transfer.failReason,
    externalReference: transfer.externalReference,
  }
}

export function fakeAsaasClient(config: { apiKey: string; environment: string }) {
  const apiKey = config.apiKey
  fakeAsaas.clients.push({ apiKey, environment: config.environment })
  const log = (call: string, args?: unknown) => fakeAsaas.calls.push({ apiKey, call, args })
  const isPlatform = () => apiKey === fakeAsaas.platformKey
  const sub = () => fakeAsaas.subaccounts.find(account => account.apiKey === apiKey)

  return {
    account: {
      commercialInfo: async () => {
        log('account.commercialInfo')
        const account = sub()
        return { companyName: account?.name ?? 'ANNETEC', cpfCnpj: account?.cpfCnpj ?? '00000000000191', email: account?.email ?? 'financeiro@annetec.org.br' }
      },
      status: async () => {
        log('account.status')
        if (fakeAsaas.statusError) throw fakeAsaas.statusError
        return fakeAsaas.status.get(apiKey) ?? { id: sub()?.id, general: 'AWAITING_APPROVAL', documentation: 'PENDING' }
      },
      documents: async () => {
        log('account.documents')
        if (fakeAsaas.documentsError) throw fakeAsaas.documentsError
        return fakeAsaas.documents.get(apiKey) ?? { rejectReasons: null, data: [] }
      },
    },
    accounts: {
      create: async (input: Record<string, unknown>) => {
        log('accounts.create', input)
        if (!isPlatform()) throw new Error('subconta criada com chave que não é a da plataforma')
        if (fakeAsaas.createSubaccountError) throw fakeAsaas.createSubaccountError
        fakeAsaas.createdPayloads.push(input)
        const id = nextId('acc')
        const created: FakeSubaccount = {
          id,
          walletId: `wallet_${id}`,
          cpfCnpj: String(input.cpfCnpj),
          name: String(input.name),
          email: String(input.email),
          apiKey: `$aact_hmlg_000SubcontaFalsa${id}ChaveDeTesteComTamanho`,
        }
        fakeAsaas.subaccounts.push(created)
        if (fakeAsaas.createSubaccountThrowsAfterCreate) throw fakeAsaas.createSubaccountThrowsAfterCreate
        return {
          object: 'account',
          id,
          name: created.name,
          email: created.email,
          cpfCnpj: created.cpfCnpj,
          walletId: created.walletId,
          accessToken: { id: nextId('tok'), enabled: true, apiKey: created.apiKey },
        }
      },
      list: async (query: { cpfCnpj?: string } = {}) => {
        log('accounts.list', query)
        if (!isPlatform()) throw new Error('lista de subcontas com chave que não é a da plataforma')
        const data = fakeAsaas.subaccounts
          .filter(account => fakeAsaas.accountsListIgnoresFilter || !query.cpfCnpj || account.cpfCnpj === query.cpfCnpj)
          .map(account => ({ id: account.id, walletId: account.walletId, cpfCnpj: account.cpfCnpj, name: account.name, email: account.email }))
        return { object: 'list', hasMore: false, totalCount: data.length, limit: 10, offset: 0, data }
      },
      createAccessToken: async (accountId: string) => {
        log('accounts.createAccessToken', accountId)
        if (!isPlatform()) throw new Error('chave de subconta gerada com chave que não é a da plataforma')
        if (fakeAsaas.accessTokenError) throw fakeAsaas.accessTokenError
        const account = fakeAsaas.subaccounts.find(item => item.id === accountId)
        if (!account) throw new Error('subconta inexistente')
        account.apiKey = `$aact_hmlg_000ChaveRecuperada${accountId}${fakeAsaas.accessTokensCreated.length}Final`
        fakeAsaas.accessTokensCreated.push({ accountId, apiKey: account.apiKey })
        return { id: nextId('tok'), enabled: true, apiKey: account.apiKey }
      },
    },
    finance: {
      balance: async () => {
        log('finance.balance')
        if (fakeAsaas.balanceError) throw fakeAsaas.balanceError
        return { balance: fakeAsaas.balance.get(apiKey) ?? 0 }
      },
    },
    wallets: {
      list: async () => {
        log('wallets.list')
        const id = isPlatform() ? fakeAsaas.platformWallet : sub()?.walletId
        return { object: 'list', hasMore: false, totalCount: id ? 1 : 0, limit: 10, offset: 0, data: id ? [{ object: 'wallet', id }] : [] }
      },
    },
    transfers: {
      create: async (input: { value: number; walletId: string; externalReference?: string }) => {
        log('transfers.create', input)
        if (fakeAsaas.transferCreateError) throw fakeAsaas.transferCreateError
        const transfer: FakeTransfer = {
          id: nextId('tra'),
          value: input.value,
          walletId: input.walletId,
          externalReference: input.externalReference ?? null,
          status: fakeAsaas.transferCreateStatus,
          ownerKey: apiKey,
          authorized: fakeAsaas.transferCreateStatus !== 'PENDING',
          failReason: null,
          type: 'INTERNAL',
        }
        fakeAsaas.transfers.push(transfer)
        const balance = fakeAsaas.balance.get(apiKey)
        if (balance !== undefined && transfer.status === 'DONE') fakeAsaas.balance.set(apiKey, Math.round((balance - input.value) * 100) / 100)
        if (fakeAsaas.transferThrowsAfterCreate) throw fakeAsaas.transferThrowsAfterCreate
        return transferDto(transfer)
      },
      get: async (id: string) => {
        log('transfers.get', id)
        const transfer = fakeAsaas.transfers.find(item => item.id === id && item.ownerKey === apiKey)
        if (!transfer) throw new Error('transferência não encontrada')
        return transferDto(transfer)
      },
      list: async () => {
        log('transfers.list')
        const data = fakeAsaas.transfers.filter(item => item.ownerKey === apiKey).map(transferDto)
        return { object: 'list', hasMore: false, totalCount: data.length, limit: 100, offset: 0, data }
      },
      cancel: async (id: string) => {
        log('transfers.cancel', id)
        if (fakeAsaas.transferCancelError) throw fakeAsaas.transferCancelError
        const transfer = fakeAsaas.transfers.find(item => item.id === id && item.ownerKey === apiKey)
        if (!transfer) throw new Error('transferência não encontrada')
        if (transfer.status === 'PENDING' || transfer.status === 'BANK_PROCESSING') transfer.status = 'CANCELLED'
        return transferDto(transfer)
      },
    },
    webhooks: {
      list: async () => {
        log('webhooks.list')
        const data = fakeAsaas.webhooks.filter(hook => hook.apiKey === apiKey).map(hook => ({ id: hook.id, ...hook.input }))
        return { data, hasMore: false, totalCount: data.length, limit: 100, offset: 0 }
      },
      create: async (input: Record<string, unknown>) => {
        log('webhooks.create', input)
        const hook = { apiKey, id: nextId('wh'), input }
        fakeAsaas.webhooks.push(hook)
        return { id: hook.id, ...input }
      },
      update: async (id: string, input: Record<string, unknown>) => {
        log('webhooks.update', { id, input })
        const hook = fakeAsaas.webhooks.find(item => item.id === id && item.apiKey === apiKey)
        if (hook) Object.assign(hook.input, input)
        return { id, ...input }
      },
      delete: async (id: string) => {
        log('webhooks.delete', id)
        fakeAsaas.webhooks = fakeAsaas.webhooks.filter(item => !(item.id === id && item.apiKey === apiKey))
        return { deleted: true, id }
      },
    },
    payments: {
      get: async (id: string) => {
        log('payments.get', id)
        return { id, status: fakeAsaas.payments.get(id) ?? 'PENDING' }
      },
    },
  }
}
