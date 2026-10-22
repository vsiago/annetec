import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guard de restrição da plataforma (blueprint §0.8) com banco e sessão
 * FALSOS: restringe só admin/vendedor de inquilino gerenciado; associado,
 * vitrine (`/public`), portal (`/cliente`) e "Minha assinatura" NUNCA são
 * bloqueados; falha de leitura libera (fail-open).
 */

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  fail: false,
  session: null as unknown,
  reads: 0,
}))

vi.mock('@/db/client', () => {
  function chain(resolve: () => unknown) {
    const proxy: unknown = new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) => {
            try {
              return Promise.resolve(resolve()).then(onFulfilled, onRejected)
            } catch (error) {
              return Promise.reject(error).then(onFulfilled, onRejected)
            }
          }
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
          state.reads += 1
          if (state.fail) throw new Error('relation "platform_subscriptions" does not exist')
          return state.row ? [state.row] : []
        }),
    },
  }
})

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: async () => state.session } } }))

const { platformAccessGuard, invalidatePlatformAccessCache, tenantSubPath } = await import('@/http/middleware/platform-access')
const { errorHandler } = await import('@/http/errors')

const app = new Hono()
app.use('/api/v1/t/:tenantSlug/*', platformAccessGuard)
app.all('/api/v1/t/:tenantSlug/*', c => c.json({ success: true, data: 'ok' }))
app.onError(errorHandler)

const ORG = 'org-mapcard2'
const SUSPENDED_AT = new Date('2026-09-20T15:00:00Z')
const RESTRICTED_AT = new Date('2026-09-10T15:00:00Z')

function managed(status: string, extra: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    subscriptionId: 'sub-1',
    status,
    accessOverride: null,
    accessOverrideUntil: null,
    accessOverrideAt: null,
    restrictedAt: status === 'restricted' || status === 'suspended' ? RESTRICTED_AT : null,
    suspendedAt: status === 'suspended' ? SUSPENDED_AT : null,
    canceledAt: null,
    ...extra,
  }
}

const unmanaged = { organizationId: ORG, subscriptionId: null, status: null }

function session(role: 'admin' | 'seller' | 'client' | 'platform') {
  return role === 'platform'
    ? { user: { id: 'u-plat' }, membership: { scope: 'platform', platformRole: 'superadmin', tenantId: null, tenantRole: null } }
    : { user: { id: `u-${role}` }, membership: { scope: 'tenant', platformRole: null, tenantId: ORG, tenantRole: role } }
}

async function call(method: string, path: string) {
  const res = await app.request(`/api/v1/t/mapcard2${path}`, { method })
  const text = method === 'HEAD' ? '' : await res.text()
  const body = (text ? JSON.parse(text) : { success: res.ok }) as { success: boolean; error?: { code: string; message: string } }
  return { status: res.status, body }
}

beforeEach(() => {
  invalidatePlatformAccessCache()
  state.row = null
  state.fail = false
  state.session = null
  state.reads = 0
})

describe('guard da plataforma — quem é bloqueado', () => {
  it('inquilino sem assinatura de plataforma (mepcard/real) nunca é afetado', async () => {
    state.row = unmanaged
    state.session = session('admin')
    expect((await call('POST', '/faturamento/planos')).status).toBe(200)
    expect((await call('DELETE', '/crm/leads/1')).status).toBe(200)
  })

  it('em dia (e em atraso sem restrição) → acesso completo', async () => {
    state.session = session('admin')
    state.row = managed('active')
    expect((await call('POST', '/faturamento/planos')).status).toBe(200)
    invalidatePlatformAccessCache()
    state.row = managed('past_due')
    expect((await call('PATCH', '/faturamento/planos/1')).status).toBe(200)
  })

  it('restrita: admin e vendedor só leem; escrita → 403 com data e "Assinatura da plataforma"', async () => {
    state.row = managed('restricted')
    state.session = session('admin')
    expect((await call('GET', '/faturamento/resumo')).status).toBe(200)
    expect((await call('HEAD', '/faturamento/resumo')).status).toBe(200)
    const blocked = await call('POST', '/faturamento/planos')
    expect(blocked.status).toBe(403)
    expect(blocked.body.error?.code).toBe('FORBIDDEN')
    expect(blocked.body.error?.message).toContain('Assinatura da plataforma')
    expect(blocked.body.error?.message).toContain('10/09/2026')
    expect((await call('DELETE', '/usuarios/2')).status).toBe(403)
    state.session = session('seller')
    expect((await call('GET', '/crm/leads')).status).toBe(200)
    expect((await call('POST', '/crm/leads')).status).toBe(403)
  })

  it('suspensa: painel bloqueado até para leitura, exceto "Assinatura da plataforma"', async () => {
    state.row = managed('suspended')
    state.session = session('admin')
    const blocked = await call('GET', '/faturamento/resumo')
    expect(blocked.status).toBe(403)
    expect(blocked.body.error?.message).toContain('20/09/2026')
    expect(blocked.body.error?.message).toContain('Assinatura da plataforma')
    expect((await call('GET', '/assinatura-annetec')).status).toBe(200)
    expect((await call('GET', '/assinatura-annetec/acesso')).status).toBe(200)
    expect((await call('POST', '/assinatura-annetec/plano')).status).toBe(200)
    state.session = session('seller')
    expect((await call('GET', '/crm/leads')).status).toBe(403)
  })

  it('assinatura cancelada também bloqueia o painel (nunca o inquilino)', async () => {
    state.row = managed('canceled', { canceledAt: new Date('2026-09-25T15:00:00Z') })
    state.session = session('admin')
    const res = await call('GET', '/usuarios')
    expect(res.status).toBe(403)
    expect(res.body.error?.message).toContain('cancelada')
  })
})

describe('guard da plataforma — associado e vitrine NUNCA são bloqueados', () => {
  it.each(['suspended', 'canceled', 'restricted'])('inquilino %s: portal, carteirinhas, vitrine e checkout seguem', async status => {
    state.row = managed(status)

    state.session = session('client')
    for (const [method, path] of [
      ['GET', '/cliente/assinatura'],
      ['POST', '/cliente/cobrancas/1/pagamento'],
      ['GET', '/carteirinhas'],
      ['GET', '/contratos'],
      ['POST', '/atendimentos'],
    ] as const) {
      expect((await call(method, path)).status, `${method} ${path} (associado)`).toBe(200)
    }

    state.session = null
    for (const [method, path] of [
      ['GET', '/public/vitrine'],
      ['GET', '/public/planos'],
      ['POST', '/public/checkout'],
      ['GET', '/public/checkout/contexto'],
      ['GET', '/rede'],
    ] as const) {
      expect((await call(method, path)).status, `${method} ${path} (sem sessão)`).toBe(200)
    }

    // Admin mexendo no portal/vitrine do próprio clube também passa (sub-caminhos liberados).
    state.session = session('admin')
    expect((await call('POST', '/public/checkout')).status).toBe(200)
    expect((await call('GET', '/cliente/assinatura')).status).toBe(200)
  })

  it('equipe da plataforma passa sempre (suporte)', async () => {
    state.row = managed('suspended')
    state.session = session('platform')
    expect((await call('POST', '/faturamento/planos')).status).toBe(200)
  })
})

describe('guard da plataforma — override, cache e falha', () => {
  it('override manual vigente vence a régua; vencido volta à régua', async () => {
    state.session = session('admin')
    state.row = managed('active', { accessOverride: 'blocked', accessOverrideUntil: new Date(Date.now() + 86_400_000), accessOverrideAt: new Date() })
    const res = await call('GET', '/faturamento/resumo')
    expect(res.status).toBe(403)
    expect(res.body.error?.message).toContain('decisão da operadora')

    invalidatePlatformAccessCache('mapcard2')
    state.row = managed('active', { accessOverride: 'blocked', accessOverrideUntil: new Date(Date.now() - 1000) })
    expect((await call('GET', '/faturamento/resumo')).status).toBe(200)

    invalidatePlatformAccessCache(ORG)
    state.row = managed('suspended', { accessOverride: 'full', accessOverrideUntil: null })
    expect((await call('POST', '/faturamento/planos')).status).toBe(200)
  })

  it('cache de 30 s por slug; invalidar por slug ou por id do inquilino relê', async () => {
    state.session = session('admin')
    state.row = managed('suspended')
    expect((await call('GET', '/usuarios')).status).toBe(403)
    state.row = managed('active')
    expect((await call('GET', '/usuarios')).status).toBe(403) // ainda no cache
    invalidatePlatformAccessCache(ORG)
    expect((await call('GET', '/usuarios')).status).toBe(200) // pagou → cache limpo → libera
    expect(state.reads).toBe(2)
  })

  it('falha ao ler o acesso (tabela ainda sem migration) → libera', async () => {
    state.fail = true
    state.session = session('admin')
    expect((await call('POST', '/faturamento/planos')).status).toBe(200)
  })

  it('sub-caminho extraído do path', () => {
    expect(tenantSubPath('/api/v1/t/mapcard2/cliente/assinatura')).toBe('cliente')
    expect(tenantSubPath('/api/v1/t/mapcard2/public')).toBe('public')
    expect(tenantSubPath('/api/v1/t/mapcard2')).toBe('')
  })
})
