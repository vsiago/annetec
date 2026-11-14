import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLUBE_A, ID, semearRede } from './helpers/vendas-world'

/**
 * Rotas PÚBLICAS das candidaturas ("Seja um parceiro comercial") pela HTTP (Hono em
 * memória + banco em memória): chave errada = 404, honeypot = 201 sem gravar, upload
 * acima de 4 MB = 413, clube inexistente = 404, escopo trocado = 404 e rate limit.
 */

const memory = vi.hoisted(() => ({ db: null as null | Record<string, unknown> }))
const fakes = vi.hoisted(() => ({
  sendEmail: vi.fn(async (_input: unknown) => ({ id: 'email-1', status: 'simulated' as const })),
  notify: vi.fn(async (_input: unknown) => 1),
}))

vi.mock('@/config/env', async importOriginal => ({ ...(await importOriginal<typeof import('@/config/env')>()), isProduction: true }))
vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createMemoryDb } = await import('./helpers/memory-db')
  const instance = createMemoryDb({
    tables: [
      schema.user,
      schema.vendasCorretoras,
      schema.vendasEquipes,
      schema.vendasAgentes,
      schema.platformFiles,
      schema.vendasCandidaturas,
      schema.vendasCandidaturaDocumentos,
    ],
  })
  memory.db = instance as unknown as Record<string, unknown>
  return { db: instance.db, sql: { end: async () => {} }, schema }
})
vi.mock('@/lib/email', () => ({ sendEmail: (input: unknown) => fakes.sendEmail(input) }))
vi.mock('@/lib/notifications', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/notifications')>()),
  notify: (input: unknown) => fakes.notify(input),
}))
vi.mock('@/modules/users/access.service', () => ({ loadClubBrand: vi.fn(async () => null) }))
vi.mock('@/modules/tenants/service', async () => {
  const { AppError } = await import('@/http/errors')
  return {
    tenantsService: {
      getPublicBySlug: vi.fn(async (slug: string) => {
        if (slug !== 'clube-a') throw AppError.notFound('Inquilino')
        return { id: 'org-clube-a', slug: 'clube-a', name: 'Clube A', status: 'active' }
      }),
    },
  }
})

const schema = await import('@/db/schema')
const { errorHandler } = await import('@/http/errors')
const { vendasRedePublicRoutes, vendasRedeTenantPublicRoutes } = await import('@/modules/vendas-rede')
const { candidaturaAccessKey } = await import('@/modules/vendas-rede/candidaturas-access-key')

type Memory = import('./helpers/memory-db').MemoryDb
const mem = () => memory.db as unknown as Memory

const app = new Hono()
  .route('/api/v1/public/vendas', vendasRedePublicRoutes)
  .route('/api/v1/t/:tenantSlug/public/vendas', vendasRedeTenantPublicRoutes)
app.onError(errorHandler)

const P = '/api/v1/public/vendas/candidaturas'
const T = '/api/v1/t/clube-a/public/vendas/candidaturas'

const PEDIDO = {
  tipoPessoa: 'pf',
  atuacao: 'vendedor_solo',
  nome: 'Maria da Silva',
  email: 'maria@exemplo.com',
  telefone: '11988887777',
  cpf: '52998224725',
}

async function req(method: string, path: string, body?: unknown) {
  const response = await app.request(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, any> | null }
}

function semear(scope: 'platform' | 'tenant' = 'platform') {
  return mem().insertRow(schema.vendasCandidaturas, {
    scope,
    tenantId: scope === 'tenant' ? CLUBE_A.id : null,
    status: 'rascunho',
    tipoPessoa: 'pf',
    atuacao: 'vendedor_solo',
    nome: 'Maria da Silva',
    email: 'maria@exemplo.com',
    telefone: '11988887777',
    cpf: '52998224725',
  }) as { id: string }
}

function arquivo(tamanho: number) {
  const bytes = new Uint8Array(tamanho)
  bytes.set(new TextEncoder().encode('%PDF-1.4\n'))
  const form = new FormData()
  form.set('file', new File([bytes], 'rg.pdf', { type: 'application/pdf' }))
  form.set('kind', 'documento_identidade')
  return form
}

beforeEach(() => {
  mem().reset()
  semearRede(mem(), schema)
  vi.clearAllMocks()
})

describe('candidaturas públicas (HTTP)', () => {
  it('chave inválida ou ausente = 404 em todas as rotas com :id', async () => {
    const { id } = semear()
    const errada = `?chave=${'x'.repeat(32)}`
    expect((await req('GET', `${P}/${id}${errada}`)).status).toBe(404)
    expect((await req('GET', `${P}/${id}`)).status).toBe(404)
    expect((await req('GET', `${P}/nao-e-uuid?chave=${candidaturaAccessKey(id)}`)).status).toBe(404)
    expect((await req('PUT', `${P}/${id}/dados${errada}`, {})).status).toBe(404)
    expect((await req('POST', `${P}/${id}/enviar${errada}`, {})).status).toBe(404)
    expect((await req('DELETE', `${P}/${id}/documentos/${id}${errada}`)).status).toBe(404)
    const upload = await app.request(`${P}/${id}/documentos${errada}`, { method: 'POST', body: arquivo(100) })
    expect(upload.status).toBe(404)
  })

  it('com a chave certa devolve a candidatura do candidato', async () => {
    const { id } = semear()
    const { status, body } = await req('GET', `${P}/${id}?chave=${candidaturaAccessKey(id)}`)
    expect(status).toBe(200)
    expect(body?.data).toMatchObject({ id, status: 'rascunho', nome: 'Maria da Silva', loginPath: null })
    expect(body?.data.pendencias.length).toBeGreaterThan(0)
  })

  it('a chave de uma candidatura da plataforma não abre pela rota do clube (e vice-versa)', async () => {
    const plataforma = semear('platform')
    const clube = semear('tenant')
    expect((await req('GET', `${T}/${plataforma.id}?chave=${candidaturaAccessKey(plataforma.id)}`)).status).toBe(404)
    expect((await req('GET', `${P}/${clube.id}?chave=${candidaturaAccessKey(clube.id)}`)).status).toBe(404)
    expect((await req('GET', `${T}/${clube.id}?chave=${candidaturaAccessKey(clube.id)}`)).status).toBe(200)
  })

  it('POST / cria o rascunho (201) e valida o corpo', async () => {
    const { status, body } = await req('POST', P, PEDIDO)
    expect(status).toBe(201)
    expect(body?.data.acompanhamentoPath).toBe(`/seja-parceiro/${body?.data.id}?chave=${body?.data.chave}`)
    expect(body?.data.chave).toBe(candidaturaAccessKey(body?.data.id))
    expect(mem().rows(schema.vendasCandidaturas)).toHaveLength(1)

    const invalido = await req('POST', P, { ...PEDIDO, email: 'nao-e-email' })
    expect(invalido.status).toBe(400)
    expect(mem().rows(schema.vendasCandidaturas)).toHaveLength(1)
  })

  it('honeypot preenchido responde 201 com id e chave, mas não grava nada', async () => {
    const { status, body } = await req('POST', P, { ...PEDIDO, website: 'https://spam.test' })
    expect(status).toBe(201)
    expect(body?.data.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body?.data.chave).toMatch(/^[0-9a-f]{32}$/)
    expect(body?.data.acompanhamentoPath).toContain(body?.data.id)
    expect(mem().rows(schema.vendasCandidaturas)).toHaveLength(0)
    const doClube = await req('POST', T, { ...PEDIDO, website: 'x' })
    expect(doClube.status).toBe(201)
    expect(doClube.body?.data.acompanhamentoPath).toMatch(/^\/clube-a\/seja-parceiro\//)
    expect(mem().rows(schema.vendasCandidaturas)).toHaveLength(0)
  })

  it('clube inexistente = 404; clube existente grava com o inquilino', async () => {
    expect((await req('POST', '/api/v1/t/nao-existe/public/vendas/candidaturas', PEDIDO)).status).toBe(404)
    expect((await req('GET', '/api/v1/t/nao-existe/public/vendas/candidaturas/codigo/ABCD')).status).toBe(404)
    const criado = await req('POST', T, PEDIDO)
    expect(criado.status).toBe(201)
    expect(mem().rows(schema.vendasCandidaturas)[0]).toMatchObject({ scope: 'tenant', tenantId: CLUBE_A.id })
  })

  it('upload acima do limite de 4 MB = 413; arquivo pequeno passa do limite e segue a validação do serviço', async () => {
    const { id } = semear()
    const grande = await app.request(`${P}/${id}/documentos?chave=${candidaturaAccessKey(id)}`, { method: 'POST', body: arquivo(5 * 1024 * 1024) })
    expect(grande.status).toBe(413)
    expect(((await grande.json()) as Record<string, any>).error.message).toMatch(/4 MB/)
    const limite = await app.request(`${P}/${id}/documentos?chave=${candidaturaAccessKey(id)}`, { method: 'POST', body: arquivo(4 * 1024 * 1024 + 1) })
    expect(limite.status).toBe(413)
    // Tipo desconhecido no `kind` = 400 (antes de gravar qualquer coisa).
    const form = arquivo(100)
    form.set('kind', 'inexistente')
    const invalido = await app.request(`${P}/${id}/documentos?chave=${candidaturaAccessKey(id)}`, { method: 'POST', body: form })
    expect(invalido.status).toBe(400)
  })

  it('PUT /dados com dataNascimento impossível ou futura = erro de validação (não 500)', async () => {
    const { id } = semear()
    const chave = candidaturaAccessKey(id)
    const endereco = { cep: '20000000', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Rio de Janeiro', uf: 'RJ' }
    for (const dataNascimento of ['2026-13-45', '2999-01-01', '1850-01-01']) {
      const r = await req('PUT', `${P}/${id}/dados?chave=${chave}`, { atuacao: 'vendedor_solo', endereco, dataNascimento })
      expect(r.status).toBe(400)
      expect(r.body?.error.code).toBe('VALIDATION_ERROR')
    }
    const ok = await req('PUT', `${P}/${id}/dados?chave=${chave}`, { atuacao: 'vendedor_solo', endereco, dataNascimento: '1990-05-10' })
    expect(ok.status).toBe(200)
  })

  it('GET /codigo/:codigo devolve nome e papel do agente do escopo; código desconhecido = 404', async () => {
    const achou = await req('GET', `${P}/codigo/sup0001`)
    expect(achou.status).toBe(200)
    expect(achou.body?.data).toEqual({ nome: 'Supervisor Um', papel: 'supervisor' })
    expect((await req('GET', `${P}/codigo/NAOEXISTE`)).status).toBe(404)
    // Código da plataforma não vale no clube.
    expect((await req('GET', `${T}/codigo/SUP0001`)).status).toBe(404)
    expect(ID.supervisor1).toBeTruthy()
  })

  it('recuperar acesso responde sempre igual e limita a 5 por hora por IP', async () => {
    semear()
    const existente = await req('POST', `${P}/recuperar-acesso`, { email: 'maria@exemplo.com' })
    const inexistente = await req('POST', `${P}/recuperar-acesso`, { email: 'ninguem@exemplo.com' })
    expect(existente.status).toBe(200)
    expect(existente.body).toEqual(inexistente.body)
    expect(existente.body?.data).toEqual({ enviado: true })
    expect(fakes.sendEmail).toHaveBeenCalledTimes(1)

    for (let i = 0; i < 3; i++) expect((await req('POST', `${P}/recuperar-acesso`, { email: 'ninguem@exemplo.com' })).status).toBe(200)
    const barrado = await req('POST', `${P}/recuperar-acesso`, { email: 'ninguem@exemplo.com' })
    expect(barrado.status).toBe(429)
    expect(barrado.body?.error.code).toBe('RATE_LIMITED')
  })
})
