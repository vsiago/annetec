import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLUBE_A, uid } from './helpers/vendas-world'

/**
 * Balcão x módulos LEGADOS do clube (M10). O balcão autentica como `member.role = 'seller'`, então
 * passaria em `requireTenantRole('admin', 'seller')`; o guard `bloquearBalcao` (sessão com
 * `salesRole === 'balcao'`) responde 403 em CRM, contratos, comissões/faturas, cotação e atendimentos de
 * suporte. Vendedor comercial e admin não são barrados pelo guard (o resto da resposta é problema do handler,
 * que aqui roda sobre um banco vazio: só garantimos que NÃO é 403 do guard).
 */

const state = vi.hoisted(() => ({ sessions: {} as Record<string, unknown> }))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createMemoryDb } = await import('./helpers/memory-db')
  const instance = createMemoryDb({ tables: [schema.organization, schema.user, schema.vendasAgentes] })
  return { db: instance.db, sql: { end: async () => {} }, schema }
})
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async ({ headers }: { headers: Headers }) => {
        const token = headers.get('authorization')?.replace('Bearer ', '') ?? ''
        return state.sessions[token] ?? null
      }),
    },
  },
}))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}), recordSystemAudit: vi.fn(async () => {}) }))
vi.mock('@/modules/club-billing/access.service', () => ({ loadClubAccess: vi.fn() }))
vi.mock('@/http/middleware/platform-access', () => ({
  platformAccessGuard: createMiddleware(async (_c, next) => next()),
  invalidatePlatformAccessCache: () => {},
}))
vi.mock('@/modules/activity/service', () => ({ activityService: { record: vi.fn(async () => {}) } }))
vi.mock('@/lib/background', () => ({ runInBackground: vi.fn() }))
vi.mock('@/http/middleware/tenant', () => ({
  resolveTenant: createMiddleware(async (c, next) => {
    if (c.req.param('tenantSlug') !== CLUBE_A.slug) return c.json({ error: { code: 'NOT_FOUND' } }, 404)
    c.set('tenant', { ...CLUBE_A, kind: 'operator' })
    await next()
  }),
  tenantOf: (c: { get: (key: 'tenant') => unknown }) => c.get('tenant'),
}))

const { createApp } = await import('@/app')
const app = createApp()

function sessao(userId: string, tenantRole: 'admin' | 'seller', salesRole: string | null) {
  return {
    user: { id: userId, name: userId, email: `${userId}@clube.test`, banned: false },
    session: { id: 's' },
    membership: {
      scope: 'tenant',
      platformRole: null,
      tenantId: CLUBE_A.id,
      tenantSlug: CLUBE_A.slug,
      tenantRole,
      impersonatedBy: null,
      salesRole,
      salesAgentId: salesRole ? uid(900) : null,
    },
  }
}

async function chamar(token: string, method: string, path: string, body?: unknown) {
  const response = await app.request(`/api/v1/t/clube-a${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let corpo: Record<string, any> = {}
  try {
    corpo = text ? JSON.parse(text) : {}
  } catch {
    corpo = {}
  }
  return { status: response.status, body: corpo }
}

/** Rotas legadas de vendedor/admin que o balcão (seller) alcançaria sem o guard. */
const ROTAS: [string, string, unknown?][] = [
  ['GET', '/crm/leads'],
  ['POST', '/crm/leads', {}],
  ['GET', '/crm/vendas'],
  ['POST', '/contratos', {}],
  ['POST', '/contratos/ABC123/sync'],
  ['POST', '/contratos/anexos', {}],
  ['POST', '/contratos/patologias', {}],
  ['GET', '/financeiro/comissoes'],
  ['GET', '/financeiro/comissoes/ABC123'],
  ['GET', '/financeiro/faturas/ABC123'],
  ['POST', '/catalogo/cotacao', {}],
  ['PATCH', `/atendimentos/${uid(1)}`, {}],
]

beforeEach(() => {
  state.sessions = {
    balcao: sessao('balcao', 'seller', 'balcao'),
    vendedor: sessao('vendedor', 'seller', 'vendedor'),
    'seller-sem-perfil': sessao('seller-sem-perfil', 'seller', null),
    admin: sessao('admin', 'admin', null),
  }
})

describe('balcão nos módulos legados do clube', () => {
  it.each(ROTAS)('balcão recebe 403 em %s %s', async (method, path, body) => {
    const res = await chamar('balcao', method, path, body)
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
  })

  it.each(ROTAS)('vendedor comercial não é barrado pelo guard em %s %s', async (method, path, body) => {
    const res = await chamar('vendedor', method, path, body)
    expect(res.body?.error?.code).not.toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
    expect(res.status).not.toBe(403)
  })

  it.each(ROTAS)('admin do clube não é barrado pelo guard em %s %s', async (method, path, body) => {
    const res = await chamar('admin', method, path, body)
    expect(res.body?.error?.code).not.toBe('VENDAS_SEM_PERMISSAO_NA_REDE')
  })

  it('seller sem papel comercial (conta legada) segue como antes', async () => {
    const res = await chamar('seller-sem-perfil', 'POST', '/catalogo/cotacao', {})
    expect(res.status).not.toBe(403)
  })
})
