import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '@/http/types'

/**
 * Gestão das candidaturas pela HTTP (Hono em memória, `salesContext` falso que injeta o
 * contexto): `GET /rede/candidaturas` só para master (vendedor = 403) e aprovar exige
 * `requireEscrita` (agente inativo = 403 antes de tocar no serviço).
 */

const state = vi.hoisted(() => ({ ctx: null as unknown }))
const svc = vi.hoisted(() => ({
  listarCandidaturas: vi.fn(async (..._args: unknown[]) => ({ itens: [], pendentes: 0 })),
  aprovarCandidatura: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }))
vi.mock('@/modules/vendas-rede/candidaturas.service', () => ({
  aprovarCandidatura: svc.aprovarCandidatura,
  arquivoDoDocumentoDaGestao: vi.fn(),
  contarPendentes: vi.fn(async () => 0),
  detalharCandidatura: vi.fn(),
  listarCandidaturas: svc.listarCandidaturas,
  recusarCandidatura: vi.fn(),
}))

const { errorHandler } = await import('@/http/errors')
const { candidaturasController } = await import('@/modules/vendas-rede/controllers/candidaturas.controller')

const app = new Hono<AppEnv>()
  .use(
    '*',
    createMiddleware<AppEnv>(async (c, next) => {
      c.set('vendas', state.ctx as never)
      await next()
    }),
  )
  .route('/', candidaturasController)
app.onError(errorHandler)

const ctx = (extra: Record<string, unknown>) => ({
  scope: 'platform',
  tenantId: null,
  tenantSlug: null,
  userId: 'u1',
  userName: 'X',
  agente: null,
  papel: 'master',
  masterImplicito: true,
  podeEscrever: true,
  visibilidade: { tudo: true },
  ...extra,
})
const ID = '11111111-1111-4111-8111-111111111111'
const aprovar = () => app.request(`/rede/candidaturas/${ID}/aprovar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })

beforeEach(() => vi.clearAllMocks())

describe('gestão de candidaturas (HTTP)', () => {
  it('GET /rede/candidaturas: vendedor = 403, master = 200', async () => {
    state.ctx = ctx({ papel: 'vendedor', masterImplicito: false })
    expect((await app.request('/rede/candidaturas')).status).toBe(403)
    expect(svc.listarCandidaturas).not.toHaveBeenCalled()
    state.ctx = ctx({})
    expect((await app.request('/rede/candidaturas')).status).toBe(200)
    expect(svc.listarCandidaturas).toHaveBeenCalledTimes(1)
  })

  it('POST /:id/aprovar com agente inativo é bloqueado por requireEscrita', async () => {
    state.ctx = ctx({ podeEscrever: false })
    const resposta = await aprovar()
    expect(resposta.status).toBe(403)
    expect(((await resposta.json()) as any).error.code).toBe('VENDAS_PERFIL_INATIVO')
    expect(svc.aprovarCandidatura).not.toHaveBeenCalled()
  })
})
