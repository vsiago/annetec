import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Notificações em tempo real: `notify` nunca derruba a operação, textos,
 * ESCOPO (admin de outro clube, vendedor e equipe x clube) e o loop do
 * stream SSE entregando o que veio depois do cursor — tudo sem Postgres.
 */

const state = vi.hoisted(() => ({
  session: null as unknown,
  dbFails: false,
}))

vi.mock('@/db/client', async () => {
  type Op = { name: string; args: unknown[] }
  function chain(resolve: (ops: Op[]) => unknown) {
    const ops: Op[] = []
    const proxy: unknown = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
            try {
              return Promise.resolve(resolve(ops)).then(ok, ko)
            } catch (error) {
              return Promise.reject(error).then(ok, ko)
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
  const fail = () => {
    if (state.dbFails) throw new Error('banco fora do ar')
  }
  // `resolveTenant`: todo slug resolve para o clube A.
  const select = () =>
    chain(() => {
      fail()
      return [{ id: 'org-A', slug: 'clube-a', name: 'Clube A', status: 'active' }]
    })
  const insert = () =>
    chain(() => {
      fail()
      return []
    })
  return { db: { select, insert, execute: async () => (fail(), [{ ms: Date.now() }]) }, sql: {} }
})

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => state.session) } },
}))

vi.mock('@/modules/club-billing/access.service', () => ({
  loadClubAccess: vi.fn(async () => ({ status: 'active', needsSubscription: false })),
}))

const listSpy = vi.hoisted(() => vi.fn())
vi.mock('@/modules/notifications/service', async importOriginal => {
  const original = await importOriginal<typeof import('@/modules/notifications/service')>()
  return {
    ...original,
    listNotifications: listSpy.mockImplementation(async (scope: unknown) => ({
      items: [],
      unread: 0,
      cursor: new Date().toISOString(),
      demoToolsEnabled: true,
      scope,
    })),
  }
})

const notificationsLib = await import('@/lib/notifications')
const { notify, notifyClubChargePaid, notifyClientSignup, clubPaymentNotifications, clientSignupNotifications } = notificationsLib
const service = await import('@/modules/notifications/service')
const { tenantNotificationsController, platformNotificationsController } = await import('@/modules/notifications/controller')
const { errorHandler } = await import('@/http/errors')
const { PgDialect } = await import('drizzle-orm/pg-core')

beforeEach(() => {
  state.session = null
  state.dbFails = false
  listSpy.mockClear()
})

const TENANT = { id: 'org-A', slug: 'mapcard2', name: 'MapCard2' }

// ---------------------------------------------------------------------------

describe('notify — nunca derruba a operação', () => {
  it('gravação que lança vira 0, sem exceção', async () => {
    const insert = vi.fn(async () => {
      throw new Error('relation "notifications" does not exist')
    })
    await expect(notify(clientSignupNotifications({ tenant: TENANT, userId: 'u1', personName: 'Maria Lima', via: 'google' }), { insert })).resolves.toBe(0)
    expect(insert).toHaveBeenCalledTimes(1)
  })

  it('emissores com leitura do banco engolem o erro (banco fora)', async () => {
    state.dbFails = true
    await expect(notifyClubChargePaid({ chargeId: 'c1', firstPayment: true })).resolves.toBeUndefined()
    await expect(notifyClientSignup({ organizationId: 'org-A', userId: 'u1', via: 'checkout' })).resolves.toBeUndefined()
    await expect(notificationsLib.notifyPlatformInvoicePaid({ chargeId: 'p1' })).resolves.toBeUndefined()
  })

  it('lista vazia não toca o banco', async () => {
    const insert = vi.fn(async () => 1)
    expect(await notify([], { insert })).toBe(0)
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('textos', () => {
  const payment = {
    tenant: TENANT,
    chargeId: 'charge-1',
    subscriptionId: 'sub-1',
    userId: 'user-1',
    personName: 'Iago Souza',
    planName: 'Plano Plus',
    amount: 49.9,
    methodLabel: 'Pix',
  }

  it('1ª cobrança: "Nova assinatura paga" para o clube e para a plataforma, com a mesma chave de dedupe', () => {
    const [tenant, platform] = clubPaymentNotifications({ ...payment, firstPayment: true })
    expect(tenant).toMatchObject({
      audience: 'tenant',
      kind: 'subscription_activated',
      organizationId: 'org-A',
      title: 'Nova assinatura paga',
      body: 'Iago Souza · Plano Plus · Pix',
      amount: 49.9,
      link: '/mapcard2/admin/financeiro/recebimento?cobranca=charge-1',
      dedupeKey: 'club_charge_paid:charge-1',
    })
    expect(platform!.audience).toBe('platform')
    expect(platform!.title.replace(/ /g, ' ')).toBe('MapCard2 · nova assinatura R$ 49,90')
    expect(platform!.link).toBe('/admin/inquilinos/org-A')
    expect(platform!.dedupeKey).toBe(tenant!.dedupeKey)
  })

  it('recorrência: "Pagamento recebido"; teste não usa dedupe', () => {
    const [tenant, platform] = clubPaymentNotifications({ ...payment, firstPayment: false, test: true })
    expect(tenant!.kind).toBe('payment_received')
    expect(tenant!.title).toBe('Pagamento recebido')
    expect(platform!.title.replace(/ /g, ' ')).toBe('MapCard2 · pagamento R$ 49,90')
    expect(tenant!.dedupeKey).toBeNull()
    expect(tenant!.payload?.test).toBe(true)
  })

  it('cadastro: tenant abre o associado, plataforma abre o clube', () => {
    const [tenant, platform] = clientSignupNotifications({ tenant: TENANT, userId: 'u-9', personName: 'Maria Lima', via: 'checkout', planName: 'Plano Plus' })
    expect(tenant).toMatchObject({ title: 'Novo cadastro', body: 'Maria Lima · Plano Plus · pelo site', link: '/mapcard2/admin/clientes/u-9' })
    expect(platform).toMatchObject({ title: 'MapCard2 · novo cadastro', link: '/admin/inquilinos/org-A' })
  })

  it('forma de pagamento com cartão', () => {
    expect(notificationsLib.paymentMethodLabel('credit_card', 'visa', '4242')).toBe('Cartão Visa •••• 4242')
    expect(notificationsLib.paymentMethodLabel('pix')).toBe('Pix')
  })

  it('pedidos que esperam decisão levam à central de Aprovações, na aba e no detalhe certos', () => {
    const discount = notificationsLib.discountRequestedNotification({
      requestId: 'req-1',
      proposalId: 'prop-1',
      proposalCode: 'ANN-0001',
      customerName: 'Clube X',
      sellerUserId: 'seller-1',
      sellerName: 'Vera Vendas',
      summary: 'adesão 50%',
    })
    expect(discount.link).toBe('/admin/compliance?tipo=descontos&pedido=req-1')

    const submitted = notificationsLib.proposalSubmittedNotification({
      proposalId: 'prop-1',
      code: 'ANN-0001',
      clubName: 'Clube X',
      resubmission: false,
      submittedAt: new Date('2026-10-30T12:00:00.000Z'),
    })
    expect(submitted).toMatchObject({
      audience: 'platform',
      kind: 'onboarding_submitted',
      title: 'Clube X enviou a contratação para análise',
      body: 'proposta ANN-0001 · Aprovações › Novos clubes',
      link: '/admin/compliance/prop-1',
      payload: { proposalId: 'prop-1' },
    })
    // Reenvio depois de correção é outro aviso (outra chave de dedupe).
    const again = notificationsLib.proposalSubmittedNotification({
      proposalId: 'prop-1',
      code: 'ANN-0001',
      clubName: 'Clube X',
      resubmission: true,
      submittedAt: new Date('2026-10-31T09:00:00.000Z'),
    })
    expect(again.title).toBe('Clube X reenviou a contratação com as correções')
    expect(again.dedupeKey).not.toBe(submitted.dedupeKey)
  })

  it('links antigos gravados no banco são traduzidos para Aprovações, preservando o foco', async () => {
    const { approvalsHrefFromLegacy, approvalsHref } = await import('@annetec/contracts')
    expect(approvalsHrefFromLegacy('/admin/financeiro/contas-gerenciadas?clube=org-9')).toBe(
      '/admin/compliance?tipo=contas-gerenciadas&clube=org-9',
    )
    expect(approvalsHrefFromLegacy('/admin/comercial/descontos?pedido=req-7')).toBe('/admin/compliance?tipo=descontos&pedido=req-7')
    expect(approvalsHrefFromLegacy('/admin/comercial/descontos')).toBe('/admin/compliance?tipo=descontos')
    expect(approvalsHrefFromLegacy('/admin/inquilinos/org-A')).toBe('/admin/inquilinos/org-A')
    expect(approvalsHrefFromLegacy(null)).toBeNull()
    expect(approvalsHref('contas-gerenciadas', { clube: 'org 1', situacao: 'todas', pedido: null })).toBe(
      '/admin/compliance?tipo=contas-gerenciadas&situacao=todas&clube=org%201',
    )
    // Parâmetro antigo com "+" (espaço) e caractere especial: decodificado e recodificado.
    expect(approvalsHrefFromLegacy('/admin/comercial/descontos?proposta=a+b&pedido=x%2Fy')).toBe(
      '/admin/compliance?tipo=descontos&proposta=a%20b&pedido=x%2Fy',
    )
  })
})

// ---------------------------------------------------------------------------

describe('escopo', () => {
  const dialect = new PgDialect({ casing: 'snake_case' })
  const compile = (scope: Parameters<typeof service.scopeCondition>[0]) => dialect.sqlToQuery(service.scopeCondition(scope))

  it('clube: só linhas do público tenant DAQUELE clube', () => {
    const query = compile({ audience: 'tenant', organizationId: 'org-A', userId: 'u' })
    expect(query.sql).toContain('"audience"')
    expect(query.sql).toContain('"organization_id"')
    expect(query.params).toEqual(['tenant', 'org-A'])
  })

  it('clube sem id nunca vira "todas"', () => {
    expect(compile({ audience: 'tenant', organizationId: null, userId: 'u' }).sql).toBe('false')
  })

  it('plataforma: público platform de todos os clubes', () => {
    const query = compile({ audience: 'platform', organizationId: 'org-A', userId: 'u' })
    expect(query.params).toEqual(['platform'])
    expect(query.sql).not.toContain('organization_id')
  })

  const app = new Hono()
    .route('/t/:tenantSlug/notificacoes', tenantNotificationsController)
    .route('/platform/notificacoes', platformNotificationsController)
  app.onError(errorHandler)

  const adminOf = (tenantId: string, role = 'admin') => ({
    user: { id: `user-${tenantId}-${role}`, email: 'x@x.com', name: 'X' },
    membership: { scope: 'tenant', tenantId, tenantRole: role },
  })

  it('admin de OUTRO clube não lê, não abre o stream e não marca como lida', async () => {
    state.session = adminOf('org-B')
    const list = await app.request('/t/clube-a/notificacoes')
    expect(list.status).toBe(403)
    expect(((await list.json()) as { error: { code: string } }).error.code).toBe('TENANT_MISMATCH')
    expect((await app.request('/t/clube-a/notificacoes/stream')).status).toBe(403)
    const read = await app.request('/t/clube-a/notificacoes/lidas', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(read.status).toBe(403)
    expect(listSpy).not.toHaveBeenCalled()
  })

  it('vendedor do próprio clube não recebe', async () => {
    state.session = adminOf('org-A', 'seller')
    expect((await app.request('/t/clube-a/notificacoes')).status).toBe(403)
  })

  it('admin do clube lê com o escopo do clube da rota', async () => {
    state.session = adminOf('org-A')
    const response = await app.request('/t/clube-a/notificacoes?limit=5')
    expect(response.status).toBe(200)
    expect(listSpy).toHaveBeenCalledWith({ audience: 'tenant', organizationId: 'org-A', userId: 'user-org-A-admin' }, 5, true)
  })

  it('admin de clube não entra no sino da plataforma; equipe Annetec entra', async () => {
    state.session = adminOf('org-A')
    expect((await app.request('/platform/notificacoes')).status).toBe(403)

    state.session = { user: { id: 'super-1', email: 's@a.com', name: 'S' }, membership: { scope: 'platform', platformRole: 'superadmin' } }
    expect((await app.request('/platform/notificacoes')).status).toBe(200)
    expect(listSpy).toHaveBeenLastCalledWith({ audience: 'platform', organizationId: null, userId: 'super-1' }, 20, true)
  })

  it('sem sessão: 401', async () => {
    expect((await app.request('/t/clube-a/notificacoes')).status).toBe(401)
    expect((await app.request('/platform/notificacoes/stream')).status).toBe(401)
  })
})

// ---------------------------------------------------------------------------

describe('stream (SSE)', () => {
  const T0 = Date.parse('2026-10-09T15:00:00.000Z')
  const scope = { audience: 'tenant' as const, organizationId: 'org-A', userId: 'u' }

  function record(id: string, at: number, organizationId = 'org-A') {
    return {
      id,
      audience: 'tenant' as const,
      kind: 'payment_received' as const,
      organizationId,
      title: 'Pagamento recebido',
      body: null,
      amount: '49.90',
      payload: {},
      link: null,
      createdAt: new Date(at),
      readAt: null,
      orgSlug: 'mapcard2',
      orgName: 'MapCard2',
      orgLogo: null,
      branding: null,
    }
  }

  function harness(initial: ReturnType<typeof record>[], inserts: { at: number; row: ReturnType<typeof record> }[] = []) {
    let now = T0
    const rows = [...initial]
    const written: { event?: string; id?: string; data: string }[] = []
    const store: import('@/modules/notifications/service').NotificationStore = {
      now: async () => new Date(now),
      latest: async () => [],
      unreadCount: async () => 0,
      markRead: async () => 0,
      createdAfter: async (s, since, exclude, limit) =>
        rows
          .filter(r => r.organizationId === s.organizationId && r.createdAt.getTime() > since.getTime() && !exclude.includes(r.id))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, limit),
    }
    const writer = {
      aborted: false,
      closed: false,
      writeSSE: async (message: { event?: string; id?: string; data: string }) => {
        written.push(message)
      },
      write: async () => undefined,
      sleep: async (ms: number) => {
        now += ms
        for (const insert of inserts) if (insert.at <= now && !rows.includes(insert.row)) rows.push(insert.row)
      },
    }
    return { store, writer, written, clock: () => now }
  }

  it('entrega o que veio depois do cursor, uma vez cada, e fecha sozinho', async () => {
    const h = harness(
      [record('antiga', T0 - 60_000), record('outro-clube', T0 + 500, 'org-B')],
      [
        { at: T0 + 3_000, row: record('nova', T0 + 2_900) },
        // Commit atrasado: carimbo ANTES do cursor já avançado — a margem de releitura pega.
        { at: T0 + 7_000, row: record('atrasada', T0 + 4_500) },
      ],
    )
    const result = await service.runNotificationStream(h.writer, scope, new Date(T0), {
      timing: { pollMs: 2_000, heartbeatMs: 15_000, maxMs: 25_000, retryMs: 1_000 },
      store: h.store,
      clock: h.clock,
    })

    const notifications = h.written.filter(m => m.event === 'notification').map(m => JSON.parse(m.data).id)
    expect(notifications).toEqual(['nova', 'atrasada'])
    expect(result.delivered).toBe(2)

    const first = h.written[0]!
    expect(first.event).toBe('ready')
    expect(first.id).toBe(new Date(T0).toISOString())

    // Todo `id:` é um cursor ISO e nunca anda para trás.
    const ids = h.written.map(m => Date.parse(m.id!))
    expect(ids.every((value, index) => index === 0 || value >= ids[index - 1]!)).toBe(true)
    expect(h.written.some(m => m.event === 'ping')).toBe(true)
    expect(h.written.at(-1)!.event).toBe('cursor')
    expect(h.clock() - T0).toBeLessThanOrEqual(25_000)
  })

  it('reconexão com Last-Event-ID retoma sem perder o que chegou no intervalo', async () => {
    const h = harness([record('entre-conexoes', T0 + 1_000)])
    const start = service.parseStreamCursor(new Date(T0).toISOString(), new Date(T0 + 2_000))!
    await service.runNotificationStream(h.writer, scope, start, {
      timing: { pollMs: 2_000, heartbeatMs: 15_000, maxMs: 4_000, retryMs: 1_000 },
      store: h.store,
      clock: h.clock,
    })
    expect(h.written.filter(m => m.event === 'notification').map(m => JSON.parse(m.data).id)).toEqual(['entre-conexoes'])
  })

  it('cursor inválido ou no futuro é ignorado; muito antigo é limitado a 24 h', () => {
    const now = new Date(T0)
    expect(service.parseStreamCursor('lixo', now)).toBeNull()
    expect(service.parseStreamCursor(new Date(T0 + 10 * 60_000).toISOString(), now)).toBeNull()
    expect(service.parseStreamCursor(new Date(T0 - 3 * 86_400_000).toISOString(), now)!.getTime()).toBe(T0 - 86_400_000)
  })

  it('desligamento (sinal abortado): fecha na hora, mesmo no meio da espera entre consultas', async () => {
    const h = harness([])
    // `sleep` que nunca acorda sozinho: só o sinal tira o loop daqui.
    const writer = { ...h.writer, sleep: () => new Promise<void>(() => {}) }
    const controller = new AbortController()
    const running = service.runNotificationStream(writer, scope, new Date(T0), {
      store: h.store,
      clock: h.clock,
      signal: controller.signal,
    })
    await new Promise(resolve => setTimeout(resolve, 10))
    controller.abort()
    await expect(running).resolves.toMatchObject({ delivered: 0 })
    expect(h.written.map(m => m.event)).toEqual(['ready', 'cursor'])

    // Conexão que chega já durante o desligamento: `ready` e `cursor`, sem consultar o banco.
    const late = harness([])
    let queried = false
    late.store.createdAfter = async () => {
      queried = true
      return []
    }
    await service.runNotificationStream(late.writer, scope, new Date(T0), { store: late.store, clock: late.clock, signal: controller.signal })
    expect(queried).toBe(false)
    expect(late.written.map(m => m.event)).toEqual(['ready', 'cursor'])
  })

  it('falha do banco encerra a resposta (o navegador reconecta) sem lançar', async () => {
    const h = harness([])
    h.store.createdAfter = async () => {
      throw new Error('conexão perdida')
    }
    await expect(
      service.runNotificationStream(h.writer, scope, new Date(T0), { store: h.store, clock: h.clock }),
    ).resolves.toEqual({ delivered: 0, cursor: new Date(T0) })
  })
})
