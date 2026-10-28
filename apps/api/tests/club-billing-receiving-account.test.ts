import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Conta de recebimento do clube (Asaas próprio do inquilino): regras puras da
 * chave e o serviço com banco FALSO em memória e cliente Asaas falso (nenhuma
 * chamada de rede). Conectar, rotação × troca de conta, webhook e desconectar.
 */

vi.hoisted(() => {
  // URL pública: o webhook do clube só é cadastrado com API em https fora de localhost.
  process.env.API_BASE_URL = 'https://api.teste.annetec.org.br'
})

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  linked: 0,
  forgotten: 0,
  info: {} as Record<string, unknown>,
  infoError: null as Error | null,
  status: {} as Record<string, unknown> | null,
  hooks: [] as Record<string, unknown>[],
  hookError: null as Error | null,
  created: [] as Record<string, unknown>[],
  updated: [] as { id: string; input: Record<string, unknown> }[],
  deleted: [] as string[],
  clients: [] as { apiKey: string; environment: string }[],
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  type Op = { name: string; args: unknown[] }
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
    select: (fields?: Record<string, unknown>) =>
      chain(ops => {
        const table = arg(ops, 'from') as unknown
        if (table === schema.tenantAsaasAccounts) return state.row ? [{ ...state.row }] : []
        if (table === schema.clubSubscriptions) return [{ total: state.linked }]
        if (table === schema.organization) return [{ slug: 'clube-a', email: 'contato@clube-a.com.br' }]
        throw new Error(`Tabela inesperada no fake de banco (${Object.keys(fields ?? {}).join(',')})`)
      }),
    insert: (table: unknown) =>
      chain(ops => {
        if (table !== schema.tenantAsaasAccounts) throw new Error('insert inesperado')
        const values = arg(ops, 'values')
        const conflict = arg(ops, 'onConflictDoUpdate') as { set: Record<string, unknown> }
        state.row = state.row
          ? { ...state.row, ...conflict.set }
          : { webhookStatus: 'pendente', webhookId: null, webhookTokenEncrypted: null, webhookLastError: null, ...values }
        return []
      }),
    update: (table: unknown) =>
      chain(ops => {
        const set = arg(ops, 'set')
        if (table === schema.tenantAsaasAccounts && state.row) Object.assign(state.row, set)
        if (table === schema.clubSubscriptions) state.forgotten += 1
        return []
      }),
    delete: (table: unknown) =>
      chain(() => {
        if (table === schema.tenantAsaasAccounts) state.row = null
        return []
      }),
  }
  return { db, sql: {} }
})

vi.mock('@/integrations/asaas/client', async importOriginal => {
  const original = await importOriginal<typeof import('@/integrations/asaas/client')>()
  return {
    ...original,
    createAsaasClient: (config: { apiKey: string; environment: string }) => {
      state.clients.push({ apiKey: config.apiKey, environment: config.environment })
      return {
        account: {
          commercialInfo: async () => {
            if (state.infoError) throw state.infoError
            return state.info
          },
          status: async () => state.status,
        },
        webhooks: {
          list: async () => {
            if (state.hookError) throw state.hookError
            return { data: state.hooks, hasMore: false, totalCount: state.hooks.length, limit: 100, offset: 0 }
          },
          create: async (input: Record<string, unknown>) => {
            state.created.push(input)
            return { id: 'wh_novo', ...input }
          },
          update: async (id: string, input: Record<string, unknown>) => {
            state.updated.push({ id, input })
            return { id, ...input }
          },
          delete: async (id: string) => {
            state.deleted.push(id)
            return { deleted: true, id }
          },
        },
      }
    },
  }
})

const rules = await import('@/modules/club-billing/receiving-account.rules')
const { allowedClubAsaasEnvironments } = await import('@/config/assert-production')
const { receivingAccountService, resolveClubAsaasCredentials, loadClubWebhookToken } = await import(
  '@/modules/club-billing/receiving-account.service'
)
const { AsaasApiError } = await import('@/integrations/asaas/client')
const { ASAAS_WEBHOOK_EVENTS } = await import('@/integrations/asaas/webhook-events')
const { AppError } = await import('@/http/errors')
const { env } = await import('@/config/env')

const ORG = 'org-clube-a'
const PROD_KEY = '$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmY1ZTYwYTJmLWVjNWM6OiRhYWNoX2ZpbmFs1234'
const SANDBOX_KEY = '$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OmY1ZTYwYTJmLWVjNWM6OiRhYWNoX2ZpbmFsABCD'
const OTHER_SANDBOX_KEY = '$aact_hmlg_000T3V0cmFDb250YU91dHJhQ2hhdmVEb0FzYWFzUGFyYVRlc3RlczAx9999'
const ACTOR = { userId: 'u-admin' }

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

beforeEach(() => {
  state.row = null
  state.linked = 0
  state.forgotten = 0
  state.info = { companyName: 'Clube A Ltda', cpfCnpj: '12345678000190', email: 'financeiro@clube-a.com.br' }
  state.infoError = null
  state.status = { id: 'acc_clube_a', commercialInfo: 'APPROVED', bankAccountInfo: 'APPROVED', documentation: 'AWAITING_APPROVAL', general: 'AWAITING_APPROVAL' }
  state.hooks = []
  state.hookError = null
  state.created = []
  state.updated = []
  state.deleted = []
  state.clients = []
  env.API_BASE_URL = 'https://api.teste.annetec.org.br'
})

describe('regras da chave', () => {
  it('prefixo define o ambiente; outro formato é inválido', () => {
    expect(rules.parseAsaasApiKey(`  ${PROD_KEY} `)).toEqual({ apiKey: PROD_KEY, env: 'production' })
    expect(rules.parseAsaasApiKey(SANDBOX_KEY)).toEqual({ apiKey: SANDBOX_KEY, env: 'sandbox' })
    // Formato antigo (sem prod/hmlg), curto demais, com espaço ou lixo.
    expect(rules.parseAsaasApiKey('$aact_YTU5YTE0M2M2N2I4MTliNzk0YTI5N2U5MzdjNWZmNDQ6OjAwMDA')).toBeNull()
    expect(rules.parseAsaasApiKey('$aact_prod_curta')).toBeNull()
    expect(rules.parseAsaasApiKey('$aact_prod_000Mzkw ODA2MWY2OGM3MWRlMDU2NWM3MzJl')).toBeNull()
    expect(rules.parseAsaasApiKey('minha-chave')).toBeNull()
    expect(rules.keyHintOf(PROD_KEY)).toBe('1234')
  })

  it('política de ambiente espelha a trava de produção', () => {
    expect(allowedClubAsaasEnvironments({ NODE_ENV: 'development' })).toEqual(['sandbox', 'production'])
    expect(allowedClubAsaasEnvironments({ NODE_ENV: 'test' })).toEqual(['sandbox', 'production'])
    expect(allowedClubAsaasEnvironments({ NODE_ENV: 'production' })).toEqual(['production'])
    expect(allowedClubAsaasEnvironments({ NODE_ENV: 'production', DEPLOY_STAGE: 'preview' })).toEqual(['sandbox'])
    expect(rules.environmentPolicyIssue('production', ['production'])).toBeNull()
    expect(rules.environmentPolicyIssue('sandbox', ['production'])).toMatch(/só aceita chave de PRODUÇÃO/)
    expect(rules.environmentPolicyIssue('production', ['sandbox'])).toMatch(/só aceita chave da SANDBOX/)
  })

  it('máscaras, resumo da situação e identidade da conta', () => {
    expect(rules.maskCpfCnpj('12345678000190')).toBe('12.345.678/****-**')
    expect(rules.maskCpfCnpj('529.982.247-25')).toBe('***.982.247-**')
    expect(rules.maskCpfCnpj(null)).toBeNull()
    expect(rules.summarizeAccountStatus({ general: 'APPROVED', commercialInfo: 'APPROVED', bankAccountInfo: 'APPROVED', documentation: 'APPROVED' })).toEqual({
      approved: true,
      general: 'APPROVED',
      pending: [],
    })
    expect(rules.summarizeAccountStatus({ general: 'PENDING', documentation: 'AWAITING_APPROVAL', bankAccountInfo: 'REJECTED' })?.pending).toEqual([
      'Conta bancária: reprovada',
      'Documentação: aguardando aprovação',
    ])
    const base = { env: 'sandbox' as const, asaasAccountId: 'acc_1', accountCpfCnpj: '123' }
    expect(rules.sameAsaasAccount(base, { ...base })).toBe(true)
    expect(rules.sameAsaasAccount(base, { ...base, asaasAccountId: 'acc_2' })).toBe(false)
    expect(rules.sameAsaasAccount(base, { ...base, env: 'production' })).toBe(false)
    expect(rules.sameAsaasAccount({ ...base, asaasAccountId: null }, { ...base, asaasAccountId: null })).toBe(true)
    expect(rules.sameAsaasAccount({ ...base, asaasAccountId: null, accountCpfCnpj: null }, { ...base, asaasAccountId: null, accountCpfCnpj: null })).toBe(false)
  })
})

describe('connect', () => {
  it('valida no Asaas, grava cifrado, cadastra o webhook do clube e nunca devolve a chave', async () => {
    const result = await receivingAccountService.connect(ORG, { apiKey: SANDBOX_KEY }, ACTOR)

    expect(state.clients[0]).toEqual({ apiKey: SANDBOX_KEY, environment: 'sandbox' })
    expect(result.replaced).toBe(false)
    expect(result.account).toMatchObject({
      connected: true,
      env: 'sandbox',
      keyHint: 'ABCD',
      accountName: 'Clube A Ltda',
      cpfCnpj: '12.345.678/****-**',
      email: 'financeiro@clube-a.com.br',
      webhookStatus: 'ativo',
      webhookLastError: null,
      webhookUrl: `https://api.teste.annetec.org.br/api/v1/webhooks/asaas/clube/${ORG}`,
      accountStatus: { approved: false, general: 'AWAITING_APPROVAL', pending: ['Documentação: aguardando aprovação'] },
    })
    // Segredo nem na resposta nem em claro no banco.
    expect(JSON.stringify(result.account)).not.toContain(SANDBOX_KEY)
    expect(state.row!.apiKeyEncrypted).not.toContain(SANDBOX_KEY)
    expect(state.row!.asaasAccountId).toBe('acc_clube_a')
    expect(state.row!.connectedBy).toBe('u-admin')

    expect(state.created).toHaveLength(1)
    const hook = state.created[0]!
    expect(hook).toMatchObject({
      name: 'ANNETEC — Clube clube-a',
      url: `https://api.teste.annetec.org.br/api/v1/webhooks/asaas/clube/${ORG}`,
      email: 'financeiro@clube-a.com.br',
      enabled: true,
      interrupted: false,
      sendType: 'SEQUENTIALLY',
      apiVersion: 3,
    })
    expect(hook.events).toEqual([...ASAAS_WEBHOOK_EVENTS])
    // O token mandado ao Asaas é o que o webhook confere (guardado cifrado).
    expect(String(hook.authToken)).toMatch(/^[0-9a-f]{64}$/)
    expect(await loadClubWebhookToken(ORG)).toBe(hook.authToken)
    expect(state.row!.webhookId).toBe('wh_novo')

    const credentials = await resolveClubAsaasCredentials(ORG)
    expect(credentials).toMatchObject({ apiKey: SANDBOX_KEY, env: 'sandbox' })
  })

  it('chave em formato inválido → 400 sem chamar o Asaas; chave recusada pelo Asaas → 422', async () => {
    const invalid = await rejection(receivingAccountService.connect(ORG, { apiKey: 'abc123' }, ACTOR))
    expect(invalid.status).toBe(400)
    expect(invalid.message).toMatch(/Chave de API inválida/)
    expect(state.clients).toHaveLength(0)

    state.infoError = new AsaasApiError('UPSTREAM_UNAUTHORIZED', 'recusada', 401)
    const refused = await rejection(receivingAccountService.connect(ORG, { apiKey: SANDBOX_KEY }, ACTOR))
    expect(refused.status).toBe(422)
    expect(refused.message).toMatch(/O Asaas recusou esta chave/)
    expect(state.row).toBeNull()
  })

  it('webhook já existente (mesma URL) é atualizado com PUT, não duplicado', async () => {
    state.hooks = [{ id: 'wh_antigo', url: `https://api.teste.annetec.org.br/api/v1/webhooks/asaas/clube/${ORG}/`, name: 'qualquer', interrupted: true }]
    const result = await receivingAccountService.connect(ORG, { apiKey: SANDBOX_KEY }, ACTOR)
    expect(state.created).toHaveLength(0)
    expect(state.updated).toHaveLength(1)
    expect(state.updated[0]).toMatchObject({ id: 'wh_antigo', input: { enabled: true, interrupted: false, sendType: 'SEQUENTIALLY' } })
    expect(state.updated[0]!.input).not.toHaveProperty('email')
    expect(result.account.webhookStatus).toBe('ativo')
  })

  it('falha do Asaas no webhook: a conexão fica salva com status erro e o motivo', async () => {
    state.hookError = new AsaasApiError('UPSTREAM_ERROR', 'O Asaas respondeu 500', 500)
    const result = await receivingAccountService.connect(ORG, { apiKey: SANDBOX_KEY }, ACTOR)
    expect(result.account.connected).toBe(true)
    expect(result.account.webhookStatus).toBe('erro')
    expect(result.account.webhookLastError).toMatch(/O Asaas respondeu 500/)
  })

  it('API sem URL pública (localhost): webhook pendente com o motivo, sem chamar o Asaas', async () => {
    env.API_BASE_URL = 'http://localhost:3333'
    const result = await receivingAccountService.connect(ORG, { apiKey: SANDBOX_KEY }, ACTOR)
    expect(result.account.connected).toBe(true)
    expect(result.account.webhookStatus).toBe('pendente')
    expect(result.account.webhookLastError).toMatch(/não alcança este servidor/)
    expect(state.created).toHaveLength(0)
    expect(state.updated).toHaveLength(0)
  })

  it('rotação na MESMA conta é livre mesmo com assinaturas vinculadas (mantém o webhook)', async () => {
    await receivingAccountService.connect(ORG, { apiKey: SANDBOX_KEY }, ACTOR)
    const firstToken = await loadClubWebhookToken(ORG)
    state.hooks = [{ id: 'wh_novo', url: `https://api.teste.annetec.org.br/api/v1/webhooks/asaas/clube/${ORG}` }]
    state.linked = 4

    const result = await receivingAccountService.connect(ORG, { apiKey: OTHER_SANDBOX_KEY }, { userId: 'u-outro' })
    expect(result).toMatchObject({ replaced: true, accountChanged: false })
    expect(result.account.keyHint).toBe('9999')
    expect(state.updated.at(-1)?.id).toBe('wh_novo')
    expect(await loadClubWebhookToken(ORG)).toBe(firstToken)
    expect((await resolveClubAsaasCredentials(ORG))?.apiKey).toBe(OTHER_SANDBOX_KEY)
  })

  it('troca para OUTRA conta com assinaturas vinculadas → 409; sem vínculo, troca, apaga o webhook antigo e gira o token', async () => {
    await receivingAccountService.connect(ORG, { apiKey: SANDBOX_KEY }, ACTOR)
    const firstToken = await loadClubWebhookToken(ORG)
    state.status = { id: 'acc_outra_conta', general: 'APPROVED' }
    state.info = { name: 'Outra Pessoa', cpfCnpj: '52998224725', email: 'outra@exemplo.com' }
    state.linked = 3

    const conflict = await rejection(receivingAccountService.connect(ORG, { apiKey: OTHER_SANDBOX_KEY }, ACTOR))
    expect(conflict.status).toBe(409)
    expect(conflict.message).toMatch(/a conta atual ainda tem 3 assinaturas vinculadas/i)
    expect((await resolveClubAsaasCredentials(ORG))?.apiKey).toBe(SANDBOX_KEY)
    // Recusado: nada muda na conta antiga.
    expect(state.deleted).toEqual([])
    expect(await loadClubWebhookToken(ORG)).toBe(firstToken)

    state.linked = 0
    state.forgotten = 0
    state.clients = []
    const result = await receivingAccountService.connect(ORG, { apiKey: OTHER_SANDBOX_KEY }, ACTOR)
    expect(result).toMatchObject({ replaced: true, accountChanged: true })
    expect(result.account.accountName).toBe('Outra Pessoa')
    expect(state.forgotten).toBe(1) // clientes/cartões de assinaturas encerradas esquecidos
    // O webhook da conta antiga é apagado com a chave ANTIGA: o token dele ficaria visível lá.
    expect(state.deleted).toEqual(['wh_novo'])
    expect(state.clients.at(-1)).toEqual({ apiKey: SANDBOX_KEY, environment: 'sandbox' })
    // Conta nova: webhook novo com token NOVO (o antigo deixa de valer na rota do clube).
    const nextToken = await loadClubWebhookToken(ORG)
    expect(nextToken).toMatch(/^[0-9a-f]{64}$/)
    expect(nextToken).not.toBe(firstToken)
    expect(state.created.at(-1)).toMatchObject({ email: 'outra@exemplo.com', authToken: nextToken })
    expect(result.account.webhookStatus).toBe('ativo')
  })
})

describe('test e disconnect', () => {
  it('testar sem conta → 409 RECEBIMENTO_NAO_CONFIGURADO; com conta revalida e reativa o webhook', async () => {
    const missing = await rejection(receivingAccountService.test(ORG))
    expect(missing.code).toBe('RECEBIMENTO_NAO_CONFIGURADO')
    expect(missing.status).toBe(409)

    await receivingAccountService.connect(ORG, { apiKey: SANDBOX_KEY }, ACTOR)
    state.hooks = [{ id: 'wh_novo', url: 'https://outra-url.example/antiga', interrupted: true }]
    state.status = { id: 'acc_clube_a', general: 'APPROVED', commercialInfo: 'APPROVED', bankAccountInfo: 'APPROVED', documentation: 'APPROVED' }
    const account = await receivingAccountService.test(ORG)
    expect(account.accountStatus).toEqual({ approved: true, general: 'APPROVED', pending: [] })
    expect(state.updated.at(-1)).toMatchObject({ id: 'wh_novo', input: { interrupted: false, enabled: true } })
    expect(account.webhookStatus).toBe('ativo')
  })

  it('desconectar com assinaturas vinculadas → 409; sem vínculo apaga o webhook e a linha', async () => {
    await receivingAccountService.connect(ORG, { apiKey: SANDBOX_KEY }, ACTOR)
    state.linked = 1
    const blocked = await rejection(receivingAccountService.disconnect(ORG))
    expect(blocked.status).toBe(409)
    expect(blocked.message).toMatch(/1 assinatura vinculada/)
    expect(state.row).not.toBeNull()

    state.linked = 0
    const result = await receivingAccountService.disconnect(ORG)
    expect(result.removed).toBe(true)
    expect(result.account.connected).toBe(false)
    expect(state.deleted).toEqual(['wh_novo'])
    expect(state.row).toBeNull()
    expect(await resolveClubAsaasCredentials(ORG)).toBeNull()
    expect(await loadClubWebhookToken(ORG)).toBeNull()

    // Idempotente.
    expect((await receivingAccountService.disconnect(ORG)).removed).toBe(false)
  })
})
