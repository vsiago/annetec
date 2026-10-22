import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rotas públicas de upload pela HTTP (Hono em memória, sem banco): chave
 * errada = 404, corpo > 4 MB = 413, tipo falso (magic bytes) = 422, logo
 * PDF = 422, logo > 1 MB = 413, proposta fora de edição = 422.
 */

const ID = '0b6f6c2e-3f1a-4c55-9d0e-1a2b3c4d5e6f'
const proposal = vi.hoisted(() => ({ status: 'draft' as string }))

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/modules/platform-billing/activation', () => ({
  getActivationCharge: vi.fn(async () => null),
  cancelActivationCharge: vi.fn(),
  createActivationCharge: vi.fn(),
  createPlatformSubscription: vi.fn(),
}))
vi.mock('@/modules/platform-onboarding/repository', async importOriginal => ({
  ...(await importOriginal<typeof import('@/modules/platform-onboarding/repository')>()),
  getProposal: vi.fn(async (id: string) => (id === ID ? { id, status: proposal.status, legalForm: 'associacao' } : null)),
  loadPeople: vi.fn(async () => []),
}))

const { onboardingPublicController } = await import('@/modules/platform-onboarding/public-controller')
const { onboardingAccessKey } = await import('@/modules/platform-onboarding/access-key')
const { errorHandler } = await import('@/http/errors')

const app = new Hono().route('/c', onboardingPublicController)
app.onError(errorHandler)

const KEY = onboardingAccessKey(ID)
const PDF_HEADER = new TextEncoder().encode('%PDF-1.4\n')
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function file(prefix: Uint8Array, size: number, name: string, type: string): File {
  const bytes = new Uint8Array(size)
  bytes.set(prefix)
  return new File([bytes], name, { type })
}

async function upload(path: string, f: File, fields: Record<string, string> = {}) {
  const form = new FormData()
  form.set('file', f)
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  const response = await app.request(path, { method: 'POST', body: form })
  return { status: response.status, body: (await response.json()) as { error?: { code: string; message: string } } }
}

beforeEach(() => {
  proposal.status = 'draft'
})

describe('upload de documentos e logo', () => {
  it('chave errada ou ausente = 404 (como se a proposta não existisse)', async () => {
    expect((await app.request(`/c/propostas/${ID}?chave=errada`)).status).toBe(404)
    expect((await app.request(`/c/propostas/${ID}`)).status).toBe(404)
    const wrong = await upload(`/c/propostas/${ID}/documentos?chave=${'x'.repeat(32)}`, file(PDF_HEADER, 100, 'a.pdf', 'application/pdf'), {
      kind: 'estatuto_social',
    })
    expect(wrong.status).toBe(404)
  })

  it('arquivo de 5 MB = 413 com mensagem clara', async () => {
    const result = await upload(`/c/propostas/${ID}/documentos?chave=${KEY}`, file(PDF_HEADER, 5 * 1024 * 1024, 'grande.pdf', 'application/pdf'), {
      kind: 'estatuto_social',
    })
    expect(result.status).toBe(413)
    expect(result.body.error?.message).toMatch(/4 MB/)
  })

  it('4 MB + 1 byte (cabe no envelope) também = 413', async () => {
    const result = await upload(`/c/propostas/${ID}/documentos?chave=${KEY}`, file(PDF_HEADER, 4 * 1024 * 1024 + 1, 'limite.pdf', 'application/pdf'), {
      kind: 'estatuto_social',
    })
    expect(result.status).toBe(413)
  })

  it('executável renomeado para .pdf = 422 (magic bytes)', async () => {
    const result = await upload(
      `/c/propostas/${ID}/documentos?chave=${KEY}`,
      file(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), 2048, 'estatuto.pdf', 'application/pdf'),
      { kind: 'estatuto_social' },
    )
    expect(result.status).toBe(422)
    expect(result.body.error?.message).toMatch(/PDF, JPEG ou PNG/)
  })

  it('documento pessoal sem pessoa = 400; tipo fora da forma jurídica = 400', async () => {
    const pdf = file(PDF_HEADER, 100, 'rg.pdf', 'application/pdf')
    expect((await upload(`/c/propostas/${ID}/documentos?chave=${KEY}`, pdf, { kind: 'documento_identidade' })).status).toBe(400)
    expect((await upload(`/c/propostas/${ID}/documentos?chave=${KEY}`, pdf, { kind: 'registro_sindical' })).status).toBe(400)
  })

  it('proposta enviada não aceita upload (422)', async () => {
    proposal.status = 'submitted'
    const result = await upload(`/c/propostas/${ID}/documentos?chave=${KEY}`, file(PDF_HEADER, 100, 'a.pdf', 'application/pdf'), {
      kind: 'estatuto_social',
    })
    expect(result.status).toBe(422)
  })

  it('logo: PDF = 422; PNG acima de 1 MB = 413', async () => {
    expect((await upload(`/c/propostas/${ID}/logo?chave=${KEY}`, file(PDF_HEADER, 100, 'logo.pdf', 'application/pdf'))).status).toBe(422)
    expect((await upload(`/c/propostas/${ID}/logo?chave=${KEY}`, file(PNG_HEADER, 1024 * 1024 + 10, 'logo.png', 'image/png'))).status).toBe(413)
  })
})
