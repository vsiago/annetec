import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { afterAll, describe, expect, it } from 'vitest'
import { createLocalBackend, signS3Request } from '@/lib/storage/drivers'
import { checkUpload, contentDisposition, sanitizeFileName, sniffFileType } from '@/lib/storage/sniff'
import { allowCrossOriginEmbed } from '@/modules/platform-onboarding/http'

/** Magic bytes, limites de tamanho, nome do arquivo, disco local, SigV4 e CORP do logo público. */

const PDF = new TextEncoder().encode('%PDF-1.4\n%demo\n')
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16])
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03])
const FAKE_PDF = new TextEncoder().encode('<script>alert(1)</script> %PDF-1.4')

function sized(prefix: Uint8Array, size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set(prefix)
  return bytes
}

describe('tipo real pelo conteúdo (magic bytes)', () => {
  it('reconhece PDF, PNG e JPEG; recusa executável e PDF falso', () => {
    expect(sniffFileType(PDF)).toEqual({ mime: 'application/pdf', ext: 'pdf' })
    expect(sniffFileType(PNG)).toEqual({ mime: 'image/png', ext: 'png' })
    expect(sniffFileType(JPEG)).toEqual({ mime: 'image/jpeg', ext: 'jpg' })
    expect(sniffFileType(EXE)).toBeNull()
    expect(sniffFileType(FAKE_PDF)).toBeNull()
    expect(sniffFileType(new Uint8Array([0x25, 0x50]))).toBeNull()
  })

  it('documento KYB: 4 MB no máximo (acima = too_large → 413), tipo falso = unsupported_type (→ 422)', () => {
    expect(checkUpload('kyb_document', sized(PDF, 4 * 1024 * 1024))).toMatchObject({ ok: true })
    expect(checkUpload('kyb_document', sized(PDF, 4 * 1024 * 1024 + 1))).toMatchObject({ ok: false, reason: 'too_large' })
    expect(checkUpload('kyb_document', FAKE_PDF)).toMatchObject({ ok: false, reason: 'unsupported_type' })
    expect(checkUpload('kyb_document', EXE)).toMatchObject({ ok: false, reason: 'unsupported_type' })
    expect(checkUpload('kyb_document', new Uint8Array())).toMatchObject({ ok: false, reason: 'empty' })
  })

  it('logo: só PNG/JPEG até 1 MB (PDF e SVG fora)', () => {
    expect(checkUpload('brand_logo', PNG)).toMatchObject({ ok: true, type: { mime: 'image/png' } })
    expect(checkUpload('brand_logo', PDF)).toMatchObject({ ok: false, reason: 'unsupported_type' })
    expect(checkUpload('brand_logo', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toMatchObject({
      ok: false,
      reason: 'unsupported_type',
    })
    expect(checkUpload('brand_logo', sized(PNG, 1024 * 1024 + 1))).toMatchObject({ ok: false, reason: 'too_large' })
  })

  it('nome do arquivo: sem caminho, sem controle, extensão do tipo real', () => {
    expect(sanitizeFileName('C:\\fakepath\\Estatuto "social".exe', 'pdf')).toBe('Estatuto social.pdf')
    expect(sanitizeFileName('../../etc/passwd', 'png')).toBe('passwd.png')
    expect(sanitizeFileName('', 'pdf', 'Ata')).toBe('Ata.pdf')
    expect(contentDisposition('inline', 'Ata de eleição.pdf')).toBe(
      `inline; filename="Ata de eleicao.pdf"; filename*=UTF-8''Ata%20de%20elei%C3%A7%C3%A3o.pdf`,
    )
  })
})

describe('driver local', () => {
  let dir = ''
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('grava, lê e remove; chave com ".." é recusada', async () => {
    dir = await mkdtemp(join(tmpdir(), 'annetec-storage-test-'))
    const backend = createLocalBackend(dir)
    await backend.put('kyb/p1/a.pdf', PDF, 'application/pdf')
    expect(new Uint8Array(await backend.get('kyb/p1/a.pdf'))).toEqual(PDF)
    await backend.remove('kyb/p1/a.pdf')
    await expect(backend.get('kyb/p1/a.pdf')).rejects.toThrow(/não encontrado/)
    await expect(backend.put('../fora.pdf', PDF, 'application/pdf')).rejects.toThrow(/inválida/)
  })
})

describe('S3 SigV4', () => {
  it('bate com o vetor oficial da AWS ("GET Object" com Range)', () => {
    const headers = signS3Request({
      method: 'GET',
      path: '/test.txt',
      host: 'examplebucket.s3.amazonaws.com',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      now: new Date('2013-05-24T00:00:00Z'),
      headers: { range: 'bytes=0-9' },
    })
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
    expect(headers['x-amz-date']).toBe('20130524T000000Z')
  })
})

describe('logo público embutível pela web', () => {
  it('fixa Cross-Origin-Resource-Policy: cross-origin mesmo com secureHeaders/cors globais', async () => {
    const app = new Hono()
    app.use('*', secureHeaders())
    app.use('/api/*', cors({ origin: 'http://localhost:3000' }))
    app.get('/api/logo', allowCrossOriginEmbed, c => c.body('png'))
    app.get('/api/outra', c => c.body('x'))
    const logo = await app.request('/api/logo', { headers: { origin: 'http://localhost:3000' } })
    expect(logo.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(logo.headers.get('x-content-type-options')).toBe('nosniff')
    const other = await app.request('/api/outra')
    expect(other.headers.get('cross-origin-resource-policy')).toBe('same-origin')
  })
})
