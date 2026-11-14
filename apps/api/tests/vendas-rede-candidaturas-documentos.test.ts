import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uid, semearRede } from './helpers/vendas-world'

/**
 * Documentos da candidatura (serviço, banco em memória, armazenamento falso):
 * upload grava, mesmo tipo substitui (anterior `replaced` + arquivo descartado),
 * limite conta só os ativos e permite a troca, magic bytes inválidos = 422,
 * `docId` de outra candidatura = 404, e arquivo órfão é descartado se o INSERT falha.
 */

const memory = vi.hoisted(() => ({ db: null as null | Record<string, any> }))
const storage = vi.hoisted(() => ({
  storeFile: vi.fn(),
  discardFile: vi.fn(async (_file: unknown) => {}),
}))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createMemoryDb } = await import('./helpers/memory-db')
  const instance = createMemoryDb({
    tables: [schema.user, schema.vendasCorretoras, schema.vendasEquipes, schema.vendasAgentes, schema.platformFiles, schema.vendasCandidaturas, schema.vendasCandidaturaDocumentos],
  })
  memory.db = instance as unknown as Record<string, any>
  return { db: instance.db, sql: { end: async () => {} }, schema }
})
vi.mock('@/lib/storage', async importOriginal => {
  const schema = await import('@/db/schema')
  return {
    ...(await importOriginal<typeof import('@/lib/storage')>()),
    storeFile: (input: unknown) => storage.storeFile(input),
    discardFile: (file: unknown) => storage.discardFile(file),
    findFile: async (id: string) => (memory.db!.rows(schema.platformFiles) as any[]).find(f => f.id === id) ?? null,
  }
})
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(async () => ({ id: 'e', status: 'simulated' })) }))
vi.mock('@/modules/users/access.service', () => ({ loadClubBrand: vi.fn(async () => null) }))

const schema = await import('@/db/schema')
const service = await import('@/modules/vendas-rede/candidaturas.service')
const { CANDIDATURA_MAX_DOCUMENTOS } = await import('@annetec/contracts')

const mem = () => memory.db as unknown as import('./helpers/memory-db').MemoryDb
const ESCOPO = { scope: 'platform' as const, tenantId: null, tenantSlug: null }

const pdf = () => new File([new Uint8Array([...new TextEncoder().encode('%PDF-1.4\n'), 1, 2, 3])], 'rg.pdf', { type: 'application/pdf' })
const falso = () => new File([new TextEncoder().encode('isto nao e um pdf')], 'rg.pdf', { type: 'application/pdf' })

function semearCandidatura(extra: Record<string, unknown> = {}) {
  return mem().insertRow(schema.vendasCandidaturas, {
    id: uid(9000 + mem().rows(schema.vendasCandidaturas).length + 1),
    scope: 'platform',
    tenantId: null,
    status: 'rascunho',
    tipoPessoa: 'pf',
    atuacao: 'vendedor_solo',
    nome: 'Maria da Silva',
    email: `p${mem().rows(schema.vendasCandidaturas).length}@exemplo.com`,
    telefone: '11988887777',
    cpf: '52998224725',
    ...extra,
  }) as { id: string }
}

function semearDoc(candidaturaId: string, kind: string) {
  const fileId = uid(8000 + mem().rows(schema.platformFiles).length + 1)
  mem().insertRow(schema.platformFiles, { id: fileId, fileName: `${kind}.pdf`, mimeType: 'application/pdf', sizeBytes: 100 })
  return mem().insertRow(schema.vendasCandidaturaDocumentos, { candidaturaId, kind, fileId }) as { id: string; fileId: string }
}

const docs = () => mem().rows(schema.vendasCandidaturaDocumentos) as any[]

beforeEach(() => {
  mem().reset()
  semearRede(mem(), schema)
  vi.clearAllMocks()
  storage.storeFile.mockImplementation(async () => {
    const id = uid(8500 + mem().rows(schema.platformFiles).length + 1)
    return mem().insertRow(schema.platformFiles, { id, fileName: 'novo.pdf', mimeType: 'application/pdf', sizeBytes: 12 })
  })
})

describe('upload de documentos', () => {
  it('grava o documento e devolve a candidatura com ele', async () => {
    const row = semearCandidatura()
    const publica = await service.uploadDocumentoCandidatura(ESCOPO, row.id, pdf(), { kind: 'documento_identidade' })
    expect(storage.storeFile).toHaveBeenCalledTimes(1)
    expect(publica.documentos).toHaveLength(1)
    expect(publica.documentos[0]).toMatchObject({ kind: 'documento_identidade' })
  })

  it('mesmo tipo substitui: anterior vira replaced e o arquivo antigo é descartado', async () => {
    const row = semearCandidatura()
    const antigo = semearDoc(row.id, 'documento_identidade')
    const publica = await service.uploadDocumentoCandidatura(ESCOPO, row.id, pdf(), { kind: 'documento_identidade' })
    expect(docs().find(d => d.id === antigo.id)).toMatchObject({ status: 'replaced' })
    expect(publica.documentos).toHaveLength(1)
    expect(publica.documentos[0]!.id).not.toBe(antigo.id)
    expect(storage.discardFile).toHaveBeenCalledTimes(1)
    expect(storage.discardFile.mock.calls[0]![0]).toMatchObject({ id: antigo.fileId })
  })

  it('"outro" aceita vários e não descarta nada', async () => {
    const row = semearCandidatura()
    semearDoc(row.id, 'outro')
    const publica = await service.uploadDocumentoCandidatura(ESCOPO, row.id, pdf(), { kind: 'outro' })
    expect(publica.documentos).toHaveLength(2)
    expect(storage.discardFile).not.toHaveBeenCalled()
  })

  it('limite conta só os ativos: no máximo, mais um = 422; trocar um tipo existente passa', async () => {
    const row = semearCandidatura()
    semearDoc(row.id, 'documento_identidade')
    for (let i = 0; i < CANDIDATURA_MAX_DOCUMENTOS - 1; i++) semearDoc(row.id, 'outro')
    expect(docs().filter(d => d.status === 'uploaded')).toHaveLength(CANDIDATURA_MAX_DOCUMENTOS)
    await expect(service.uploadDocumentoCandidatura(ESCOPO, row.id, pdf(), { kind: 'outro' })).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
    const publica = await service.uploadDocumentoCandidatura(ESCOPO, row.id, pdf(), { kind: 'documento_identidade' })
    expect(publica.documentos).toHaveLength(CANDIDATURA_MAX_DOCUMENTOS)
  })

  it('magic bytes inválidos = 422 e nada é gravado', async () => {
    const row = semearCandidatura()
    await expect(service.uploadDocumentoCandidatura(ESCOPO, row.id, falso(), { kind: 'documento_identidade' })).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
    expect(storage.storeFile).not.toHaveBeenCalled()
    expect(docs()).toHaveLength(0)
  })

  it('se o INSERT da linha falha, o arquivo recém-gravado é descartado e o erro sobe', async () => {
    const row = semearCandidatura()
    const memDb = memory.db!.db as Record<string, (...a: unknown[]) => unknown>
    const original = memDb.insert!.bind(memDb)
    const spy = vi.spyOn(memDb, 'insert').mockImplementation(((tabela: unknown) => {
      if (tabela === schema.vendasCandidaturaDocumentos) throw new Error('insert falhou')
      return original(tabela)
    }) as never)
    await expect(service.uploadDocumentoCandidatura(ESCOPO, row.id, pdf(), { kind: 'documento_identidade' })).rejects.toThrow('insert falhou')
    spy.mockRestore()
    expect(storage.discardFile).toHaveBeenCalledTimes(1)
    expect(storage.discardFile.mock.calls[0]![0]).toMatchObject({ fileName: 'novo.pdf' })
  })
})

describe('docId de outra candidatura', () => {
  it('remover e baixar o arquivo = 404', async () => {
    const minha = semearCandidatura()
    const outra = semearCandidatura()
    const docDeOutra = semearDoc(outra.id, 'documento_identidade')
    await expect(service.removerDocumentoCandidatura(ESCOPO, minha.id, docDeOutra.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(service.arquivoDoDocumento(ESCOPO, minha.id, docDeOutra.id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(docs()).toHaveLength(1)
    expect(storage.discardFile).not.toHaveBeenCalled()
    await expect(service.arquivoDoDocumento(ESCOPO, outra.id, docDeOutra.id)).resolves.toMatchObject({ id: docDeOutra.fileId })
  })
})
