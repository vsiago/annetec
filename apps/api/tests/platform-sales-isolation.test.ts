import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Isolamento entre vendedores (serviço REAL de prospects, banco FALSO que
 * filtra pelo `where` de verdade): o vendedor só vê/edita os próprios
 * prospects e propostas — o de outro responde 404, e `sellerUserId` na query
 * é ignorado; comissões saem sempre filtradas pelo vendedor da SESSÃO; perfil
 * inativo só consulta. A equipe lê o funil de todos.
 */

const JOAO = 'seller-joao'
const MARIA = 'seller-maria'
const P_JOAO = '11111111-1111-4111-8111-111111111111'
const P_MARIA = '22222222-2222-4222-8222-222222222222'
const PROP_MARIA = '33333333-3333-4333-8333-333333333333'

const state = vi.hoisted(() => ({
  session: null as unknown,
  profiles: {} as Record<string, { active: boolean }>,
  prospects: [] as Record<string, unknown>[],
  proposals: [] as Record<string, unknown>[],
  updates: [] as { table: string; set: Record<string, unknown>; where: unknown[] }[],
  inserts: [] as { table: string; values: unknown }[],
  commissionQueries: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => state.session) } } }))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }))
vi.mock('@/modules/platform-sales/commissions.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/platform-sales/commissions.service')>()),
  listCommissions: vi.fn(async (query: Record<string, unknown>) => {
    state.commissionQueries.push(query)
    return { items: [], totals: { prevista: 0, a_pagar: 0, paga: 0, cancelada: 0, a_descontar: 0, net: 0 }, total: 0, page: 1, perPage: 20 }
  }),
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createFakeDb, argOf, whereValues } = await import('./helpers/fake-db')
  const sellers = [JOAO, MARIA]
  const name = (table: unknown) =>
    table === schema.platformProspects ? 'prospects' : table === schema.platformProspectInteractions ? 'interactions' : 'other'
  const db = createFakeDb(call => {
    const fields = (call.fields ?? {}) as Record<string, unknown>
    const values = whereValues(argOf(call.ops, 'where'))
    const seller = values.find(v => sellers.includes(v as string)) as string | undefined
    if (call.kind === 'select') {
      if (call.table === schema.platformSellers) {
        const id = values.find(v => typeof v === 'string' && state.profiles[v as string]) as string | undefined
        if (!id) return []
        const now = new Date('2026-10-01T12:00:00Z')
        return [
          {
            profile: { userId: id, referralCode: id, active: state.profiles[id]!.active, monthlyGoal: null, createdByUserId: null, createdAt: now, updatedAt: now },
            name: id === JOAO ? 'João Silva' : 'Maria Souza',
            email: `${id}@annetec.com.br`,
            phone: null,
            banned: false,
            role: 'platform_seller',
          },
        ]
      }
      if (call.table === schema.platformProspects) {
        const id = values.find(v => state.prospects.some(p => p.id === v))
        const rows = state.prospects.filter(p => (!seller || p.sellerUserId === seller) && (!id || p.id === id))
        if ('value' in fields) return [{ value: rows.length }]
        if ('prospect' in fields) {
          return rows.map(p => ({ prospect: p, sellerName: p.sellerUserId, planName: null, proposalCode: null, proposalStatus: null }))
        }
        return []
      }
      if (call.table === schema.platformOnboardingProposals) {
        const rows = state.proposals.filter(p => !seller || p.sellerUserId === seller)
        if ('value' in fields) return [{ value: rows.length }]
        return rows.map(p => ({ proposal: p, planName: null }))
      }
      return []
    }
    if (call.kind === 'update') {
      state.updates.push({ table: name(call.table), set: argOf(call.ops, 'set'), where: values })
      return []
    }
    if (call.kind === 'insert') {
      state.inserts.push({ table: name(call.table), values: argOf(call.ops, 'values') })
      return [{ id: '44444444-4444-4444-8444-444444444444' }]
    }
    return []
  })
  return { db }
})

const { platformSellerController } = await import('@/modules/platform-sales/seller-controller')
const { platformSalesTeamController } = await import('@/modules/platform-sales/team-controller')
const { errorHandler } = await import('@/http/errors')

const app = new Hono().route('/vendas', platformSellerController).route('/comercial', platformSalesTeamController)
app.onError(errorHandler)

function prospect(id: string, sellerUserId: string, name: string) {
  const at = new Date('2026-10-10T12:00:00Z')
  return {
    id,
    sellerUserId,
    name,
    cnpj: null,
    contactName: null,
    email: null,
    phone: null,
    city: null,
    state: null,
    estimatedLives: null,
    interestPlanId: null,
    estimatedValue: null,
    origin: 'indicacao',
    stage: 'em_contato',
    lostReason: null,
    nextAction: null,
    nextActionAt: null,
    proposalId: null,
    stageChangedAt: at,
    wonAt: null,
    lostAt: null,
    createdAt: at,
    updatedAt: at,
  }
}

function sellerSession(userId: string) {
  return {
    user: { id: userId, name: userId === JOAO ? 'João Silva' : 'Maria Souza', email: `${userId}@annetec.com.br`, banned: false },
    session: { id: 's' },
    membership: { scope: 'platform', platformRole: 'platform_seller', tenantId: null, tenantSlug: null, tenantRole: null, impersonatedBy: null },
  }
}
const staffSession = {
  user: { id: 'staff-1', name: 'Equipe', email: 'ops@annetec.com.br', banned: false },
  session: { id: 's' },
  membership: { scope: 'platform', platformRole: 'platform_admin', tenantId: null, tenantSlug: null, tenantRole: null, impersonatedBy: null },
}

async function call(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  return { status: response.status, body: (await response.json()) as { data?: any; meta?: any } }
}

beforeEach(() => {
  state.session = sellerSession(JOAO)
  state.profiles = { [JOAO]: { active: true }, [MARIA]: { active: true } }
  state.prospects = [prospect(P_JOAO, JOAO, 'Clube do João'), prospect(P_MARIA, MARIA, 'Clube da Maria')]
  state.proposals = []
  state.updates = []
  state.inserts = []
  state.commissionQueries = []
})

describe('isolamento entre vendedores', () => {
  it('lista só os próprios prospects — mesmo pedindo os de outra pessoa na query', async () => {
    const own = await call('GET', '/vendas/prospects')
    expect(own.status).toBe(200)
    expect(own.body.data.map((p: { id: string }) => p.id)).toEqual([P_JOAO])
    const sneaky = await call('GET', `/vendas/prospects?sellerUserId=${MARIA}`)
    expect(sneaky.body.data.map((p: { id: string }) => p.id)).toEqual([P_JOAO])
  })

  it('prospect de outro vendedor = 404 em ler, editar, registrar interação e gerar link', async () => {
    expect((await call('GET', `/vendas/prospects/${P_MARIA}`)).status).toBe(404)
    expect((await call('PATCH', `/vendas/prospects/${P_MARIA}`, { name: 'Roubado' })).status).toBe(404)
    expect((await call('POST', `/vendas/prospects/${P_MARIA}/interacoes`, { kind: 'ligacao', description: 'Tentei falar' })).status).toBe(404)
    const link = await call('POST', `/vendas/prospects/${P_MARIA}/link`, {
      legalForm: 'associacao',
      cnpj: '11.222.333/0001-81',
      planId: '55555555-5555-4555-8555-555555555555',
      expectedLives: 100,
      applicant: { name: 'Fulano de Tal', email: 'fulano@clube.org', phone: '21999990000' },
    })
    expect(link.status).toBe(404)
    expect(state.updates.filter(u => u.table === 'prospects')).toEqual([])
    expect(state.inserts.filter(i => i.table === 'interactions')).toEqual([])
  })

  it('o próprio prospect: lê e edita (a escrita filtra pelo dono)', async () => {
    expect((await call('GET', `/vendas/prospects/${P_JOAO}`)).status).toBe(200)
    const edit = await call('PATCH', `/vendas/prospects/${P_JOAO}`, { stage: 'proposta_enviada' })
    expect(edit.status).toBe(200)
    const update = state.updates.find(u => u.table === 'prospects')
    expect(update?.set.stage).toBe('proposta_enviada')
    expect(update?.where).toEqual(expect.arrayContaining([P_JOAO, JOAO]))
  })

  it('propostas: só as atribuídas ao vendedor da sessão; a de outro = 404', async () => {
    state.proposals = [{ id: PROP_MARIA, sellerUserId: MARIA }]
    const list = await call('GET', '/vendas/propostas')
    expect(list.status).toBe(200)
    expect(list.body.data).toEqual([])
    expect((await call('GET', `/vendas/propostas/${PROP_MARIA}`)).status).toBe(404)
  })

  it('comissões: sempre do vendedor da sessão, ignorando sellerUserId da query', async () => {
    await call('GET', `/vendas/comissoes?sellerUserId=${MARIA}&mes=2026-10`)
    expect(state.commissionQueries).toEqual([expect.objectContaining({ sellerUserId: JOAO, mes: '2026-10' })])
  })

  it('perfil inativo: consulta, mas não registra prospect novo', async () => {
    state.profiles[JOAO] = { active: false }
    expect((await call('GET', '/vendas/prospects')).status).toBe(200)
    const created = await call('POST', '/vendas/prospects', { name: 'Clube Novo' })
    expect(created.status).toBe(403)
    expect(state.inserts).toEqual([])
  })

  it('conta de plataforma sem perfil de vendedor não usa a área', async () => {
    state.session = sellerSession('seller-sem-perfil')
    expect((await call('GET', '/vendas/perfil')).status).toBe(403)
  })
})

describe('visão da equipe', () => {
  it('platform_admin lê o funil de todos e filtra por vendedor', async () => {
    state.session = staffSession
    const all = await call('GET', '/comercial/prospects')
    expect(all.body.data.map((p: { id: string }) => p.id).sort()).toEqual([P_JOAO, P_MARIA].sort())
    const maria = await call('GET', `/comercial/prospects?sellerUserId=${MARIA}`)
    expect(maria.body.data.map((p: { id: string }) => p.id)).toEqual([P_MARIA])
    expect((await call('GET', `/comercial/prospects/${P_MARIA}`)).status).toBe(200)
  })

  it('platform_admin não reatribui (só superadmin); vendedor nem chega na equipe', async () => {
    state.session = staffSession
    expect((await call('POST', `/comercial/prospects/${P_MARIA}/reatribuir`, { sellerUserId: JOAO })).status).toBe(403)
    state.session = sellerSession(JOAO)
    expect((await call('GET', '/comercial/prospects')).status).toBe(403)
    expect((await call('POST', `/comercial/prospects/${P_MARIA}/reatribuir`, { sellerUserId: JOAO })).status).toBe(403)
    expect(state.updates).toEqual([])
  })
})
