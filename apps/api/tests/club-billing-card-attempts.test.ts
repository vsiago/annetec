import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Freios de card testing no checkout PÚBLICO do clube:
 *  - teto persistente de recusas de cartão (24 h) por assinatura e por CPF,
 *    contado em `payment_events` (banco falso aqui);
 *  - limite por IP nas rotas `POST /` e `POST /:id/pagamento` (5 em 10 min,
 *    com `isProduction` ligado para não cair no multiplicador de dev).
 */

const state = vi.hoisted(() => ({
  /** Respostas das contagens, na ordem das consultas. */
  counts: [] as number[],
  queries: 0,
  retries: 0,
}))

vi.mock('@/config/env', async importOriginal => ({ ...(await importOriginal<typeof import('@/config/env')>()), isProduction: true }))

vi.mock('@/db/client', () => {
  function chain(resolve: () => unknown) {
    const proxy: unknown = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) =>
            Promise.resolve(resolve()).then(onFulfilled, onRejected)
        }
        return () => proxy
      },
    })
    return proxy
  }
  return {
    db: {
      select: () =>
        chain(() => {
          const value = state.counts[state.queries] ?? 0
          state.queries += 1
          return [{ value }]
        }),
    },
    sql: {},
  }
})

const TENANT = { id: 'org-1', slug: 'clube', name: 'Clube' }
vi.mock('@/http/middleware/tenant', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    resolveTenant: createMiddleware(async (c, next) => {
      c.set('tenant' as never, TENANT as never)
      await next()
    }),
    tenantOf: () => TENANT,
  }
})
vi.mock('@/http/middleware/auth', async () => {
  const { createMiddleware } = await import('hono/factory')
  return { optionalAuth: createMiddleware(async (_c, next) => next()) }
})
vi.mock('@/lib/audit', () => ({ recordAudit: async () => {} }))
vi.mock('@/modules/club-billing/checkout.service', () => ({
  checkoutService: {
    retry: async () => {
      state.retries += 1
      return { charge: { status: 'pending' } }
    },
  },
}))

const {
  CARD_ATTEMPTS_BLOCKED_MESSAGE,
  MAX_CARD_REFUSALS_PER_CPF,
  MAX_CARD_REFUSALS_PER_SUBSCRIPTION,
  assertCardAttemptsAllowed,
  cardAttemptsBlocked,
} = await import('@/modules/club-billing/card-attempts')
const { clubCheckoutController } = await import('@/modules/club-billing/public-controller')
const { checkoutAccessKey } = await import('@/modules/club-billing/access-key')
const { errorHandler } = await import('@/http/errors')

beforeEach(() => {
  state.counts = []
  state.queries = 0
  state.retries = 0
})

describe('teto de recusas de cartão (persistente, 24 h)', () => {
  it('regra: 3 por assinatura, 5 por CPF', () => {
    expect(MAX_CARD_REFUSALS_PER_SUBSCRIPTION).toBe(3)
    expect(MAX_CARD_REFUSALS_PER_CPF).toBe(5)
    expect(cardAttemptsBlocked({ subscription: 2, cpf: 4 })).toBe(false)
    expect(cardAttemptsBlocked({ subscription: 3, cpf: 3 })).toBe(true)
    expect(cardAttemptsBlocked({ subscription: null, cpf: 4 })).toBe(false)
    expect(cardAttemptsBlocked({ subscription: null, cpf: 5 })).toBe(true)
  })

  it('assinatura com 3 recusas → 429 com mensagem em português', async () => {
    state.counts = [3, 3]
    await expect(assertCardAttemptsAllowed({ organizationId: 'org-1', cpf: '52998224725', subscriptionId: 'sub-1' })).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      message: CARD_ATTEMPTS_BLOCKED_MESSAGE,
    })
    expect(CARD_ATTEMPTS_BLOCKED_MESSAGE).toMatch(/24 horas/)
  })

  it('CPF com 5 recusas (somando checkouts anteriores) bloqueia mesmo sem assinatura', async () => {
    state.counts = [5]
    await expect(assertCardAttemptsAllowed({ organizationId: 'org-1', cpf: '52998224725' })).rejects.toMatchObject({ status: 429 })
    expect(state.queries).toBe(1) // sem assinatura: só a contagem por CPF
  })

  it('abaixo do teto passa', async () => {
    state.counts = [2, 4]
    await expect(assertCardAttemptsAllowed({ organizationId: 'org-1', cpf: '52998224725', subscriptionId: 'sub-1' })).resolves.toBeUndefined()
  })
})

describe('limite por IP nas rotas públicas do checkout', () => {
  const app = new Hono().route('/t/clube/public/checkout', clubCheckoutController)
  app.onError(errorHandler)
  const SUB = '6f1c2b1e-1111-4222-8333-944455556667'

  const retry = (ip: string) =>
    app.request(`/t/clube/public/checkout/${SUB}/pagamento?chave=${checkoutAccessKey(SUB)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ method: 'pix' }),
    })
  const checkout = (ip: string) =>
    app.request('/t/clube/public/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({}),
    })

  it('POST /:id/pagamento: 5 por IP em 10 min, a 6ª → 429 com Retry-After; outro IP segue', async () => {
    for (let i = 0; i < 5; i++) expect((await retry('203.0.113.10')).status).toBe(200)
    const blocked = await retry('203.0.113.10')
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBeTruthy()
    expect(((await blocked.json()) as { error: { message: string } }).error.message).toMatch(/Muitas tentativas/)
    expect(state.retries).toBe(5)
    expect((await retry('203.0.113.11')).status).toBe(200)
  })

  it('POST /: 5 por IP em 10 min (conta antes da validação), a 6ª → 429', async () => {
    for (let i = 0; i < 5; i++) expect((await checkout('198.51.100.7')).status).not.toBe(429)
    expect((await checkout('198.51.100.7')).status).toBe(429)
  })
})
