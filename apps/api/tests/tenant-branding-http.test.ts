import { rmSync } from 'node:fs'
import sharp from 'sharp'
import { createMiddleware } from 'hono/factory'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Logo e ícone do clube pela HTTP (app inteiro, guards reais, sessão falsa,
 * banco em memória, disco local temporário): admin só no próprio clube,
 * papéis, limites, merge do branding, ícone enviado x automático, cabeçalhos
 * do arquivo servido e rotas da plataforma (só superadmin).
 */

const ids = vi.hoisted(() => {
  process.env.STORAGE_LOCAL_DIR = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/annetec-marca-${process.pid}-${Date.now()}`
  return {
    'clube-a': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'clube-b': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  } as Record<string, string>
})
const state = vi.hoisted(() => ({ session: null as unknown }))
const memory = vi.hoisted(() => ({ db: null as null | Record<string, unknown> }))

vi.mock('@/db/client', async () => {
  const schema = await import('@/db/schema')
  const { createMemoryDb } = await import('./helpers/memory-db')
  const instance = createMemoryDb({ tables: [schema.organization, schema.tenantProfiles, schema.platformFiles] })
  memory.db = instance as unknown as Record<string, unknown>
  return { db: instance.db, sql: { end: async () => {} }, schema }
})
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => state.session) } } }))
vi.mock('@/http/middleware/tenant', () => ({
  resolveTenant: createMiddleware(async (c, next) => {
    const slug = c.req.param('tenantSlug') ?? 'clube-a'
    c.set('tenant', { id: ids[slug]!, slug, name: slug, kind: 'operator' })
    await next()
  }),
  tenantOf: (c: { get: (key: 'tenant') => unknown }) => c.get('tenant'),
}))
vi.mock('@/http/middleware/platform-access', () => ({
  platformAccessGuard: createMiddleware(async (_c, next) => next()),
  invalidatePlatformAccessCache: () => {},
}))
vi.mock('@/lib/audit', () => ({ recordAudit: vi.fn(async () => {}), recordSystemAudit: vi.fn(async () => {}) }))
vi.mock('@/modules/activity/service', () => ({ activityService: { record: vi.fn(async () => {}) } }))
vi.mock('@/lib/background', () => ({ runInBackground: vi.fn() }))

const schema = await import('@/db/schema')
const { createApp } = await import('@/app')

type Memory = import('./helpers/memory-db').MemoryDb
const db = () => memory.db as unknown as Memory
const app = createApp()

afterAll(() => {
  rmSync(process.env.STORAGE_LOCAL_DIR!, { recursive: true, force: true })
})

function tenantSession(slug: string, tenantRole: 'admin' | 'seller' | 'client' = 'admin') {
  return {
    user: { id: `u-${tenantRole}-${slug}`, name: 'Ana', email: `a@${slug}.org`, banned: false },
    session: { id: 's' },
    membership: { scope: 'tenant', platformRole: null, tenantId: ids[slug], tenantSlug: slug, tenantRole, impersonatedBy: null },
  }
}

function platformSession(platformRole: 'superadmin' | 'platform_admin' | 'platform_seller') {
  return {
    user: { id: `u-${platformRole}`, name: 'Equipe', email: 'p@annetec.com.br', banned: false },
    session: { id: 's' },
    membership: { scope: 'platform', platformRole, tenantId: null, tenantSlug: null, tenantRole: null, impersonatedBy: null },
  }
}

type Branding = Record<string, string | undefined>
type Body = { data?: { branding?: Branding; warnings?: string[]; suggestedColors?: string[]; width?: number }; error?: { code?: string; message?: string } }

const IMAGE_BLUE = { r: 30, g: 136, b: 229 }

/** Logo transparente (retângulo azul furado, 800×400 de conteúdo). */
async function transparentLogo(): Promise<Buffer> {
  // Moldura fina (cobertura opaca < 55%): só assim a versão branca (logoLight) é gerada.
  const block = await sharp({ create: { width: 800, height: 400, channels: 4, background: { ...IMAGE_BLUE, alpha: 1 } } }).png().toBuffer()
  const hole = await sharp({ create: { width: 700, height: 330, channels: 4, background: '#fff' } }).png().toBuffer()
  const holed = await sharp(block).composite([{ input: hole, gravity: 'centre', blend: 'dest-out' }]).png().toBuffer()
  return sharp({ create: { width: 1000, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: holed, gravity: 'centre' }])
    .png()
    .toBuffer()
}

/** Símbolo quadrado vermelho furado. */
async function symbolPng(): Promise<Buffer> {
  const block = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 220, g: 30, b: 40, alpha: 1 } } }).png().toBuffer()
  const hole = await sharp({ create: { width: 150, height: 150, channels: 4, background: '#fff' } }).png().toBuffer()
  return sharp(block).composite([{ input: hole, gravity: 'centre', blend: 'dest-out' }]).png().toBuffer()
}

async function send(method: string, path: string, file?: { bytes: Uint8Array; name?: string; type?: string }, json?: unknown) {
  const headers: Record<string, string> = { authorization: 'Bearer x', 'x-forwarded-for': '200.100.50.25' }
  let body: FormData | string | undefined
  if (file) {
    const form = new FormData()
    form.set('file', new File([file.bytes], file.name ?? 'logo.png', { type: file.type ?? 'image/png' }))
    body = form
  } else if (json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(json)
  }
  const response = await app.request(path, { method, headers, body })
  return { status: response.status, body: (await response.json().catch(() => null)) as Body | null }
}

const upload = (path: string, bytes: Uint8Array) => send('POST', path, { bytes })
const LOGO = '/api/v1/t/clube-a/marca/logo'
const ICON = '/api/v1/t/clube-a/marca/icone'

function brandingOf(slug: string): Branding {
  const row = db().rows(schema.tenantProfiles).find(r => r.organizationId === ids[slug])
  return row!.branding as Branding
}

function seedClub(slug: string) {
  db().insertRow(schema.organization, { id: ids[slug], name: `Clube ${slug}`, slug })
  db().insertRow(schema.tenantProfiles, {
    organizationId: ids[slug],
    legalName: `ASSOCIACAO ${slug.toUpperCase()}`,
    document: '11222333000181',
    email: `contato@${slug}.org`,
    phone: '2133334444',
    address: { cep: '20040002', street: 'Rua', number: '1', neighborhood: 'Centro', city: 'Rio', state: 'RJ' },
    branding: { primaryColor: '#112233', secondaryColor: '#ffeedd' },
  })
}

beforeEach(() => {
  db().reset()
  state.session = tenantSession('clube-a')
  seedClub('clube-a')
  seedClub('clube-b')
})

describe('logo — admin do clube', () => {
  it('envia o logo: gera todas as variantes, faz merge e preserva as cores', async () => {
    const result = await upload(LOGO, await transparentLogo())
    expect(result.status).toBe(200)
    const data = result.body!.data!
    expect(data.suggestedColors).toEqual(['#1E88E5'])
    expect(data.branding).toMatchObject({ primaryColor: '#112233', secondaryColor: '#ffeedd', iconSource: 'auto' })
    for (const key of ['logoUrl', 'logoLightUrl', 'iconUrl', 'iconSmallUrl', 'appleTouchIconUrl', 'faviconUrl']) {
      expect(data.branding![key]).toMatch(/^http:\/\/localhost:3333\/api\/v1\/public\/arquivos\/[0-9a-f-]{36}$/)
    }
    expect(brandingOf('clube-a')).toEqual(data.branding)
    // clube B intocado
    expect(brandingOf('clube-b')).toEqual({ primaryColor: '#112233', secondaryColor: '#ffeedd' })
  })

  it('arquivo servido: PNG, cache imutável de 1 ano e CORP cross-origin', async () => {
    const { body } = await upload(LOGO, await transparentLogo())
    const path = new URL(body!.data!.branding!.logoUrl!).pathname
    const response = await app.request(path)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata()
    expect(meta.format).toBe('png')
  })

  it('reenvio gera URLs novas e não apaga os arquivos antigos; sem transparência remove o logoLight', async () => {
    const first = (await upload(LOGO, await transparentLogo())).body!.data!.branding!
    const opaque = await sharp({ create: { width: 700, height: 300, channels: 3, background: '#ffffff' } })
      .composite([{ input: await sharp({ create: { width: 400, height: 150, channels: 3, background: IMAGE_BLUE } }).png().toBuffer(), gravity: 'centre' }])
      .jpeg()
      .toBuffer()
    const second = await send('POST', LOGO, { bytes: opaque, name: 'logo.jpg', type: 'image/jpeg' })
    expect(second.status).toBe(200)
    const branding = second.body!.data!.branding!
    expect(branding.logoUrl).not.toBe(first.logoUrl)
    expect(branding.logoLightUrl).toBeUndefined()
    const antigo = await app.request(new URL(first.logoUrl!).pathname)
    expect(antigo.status).toBe(200)
  })

  it('SVG seguro é aceito (vira PNG); SVG com script = 422', async () => {
    const ok = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#1E88E5"/><circle cx="300" cy="150" r="80" fill="#DC1E28"/></svg>`
    const accepted = await send('POST', LOGO, { bytes: new TextEncoder().encode(ok), name: 'logo.svg', type: 'image/svg+xml' })
    expect(accepted.status).toBe(200)
    const served = await app.request(new URL(accepted.body!.data!.branding!.logoUrl!).pathname)
    expect(served.headers.get('content-type')).toBe('image/png')

    const evil = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>`
    const refused = await send('POST', LOGO, { bytes: new TextEncoder().encode(evil), name: 'x.svg', type: 'image/svg+xml' })
    expect(refused.status).toBe(422)
    expect(refused.body!.error!.message).toMatch(/segurança/)
  })

  it('acima de 5 MB = 413; tipo não aceito (PDF) = 422; imagem pequena é ampliada', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 10)
    big.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect((await upload(LOGO, big)).status).toBe(413)
    expect((await upload(LOGO, new TextEncoder().encode('%PDF-1.4\n'))).status).toBe(422)
    const tiny = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#ffffff' } })
      .composite([{ input: await sharp({ create: { width: 60, height: 40, channels: 3, background: IMAGE_BLUE } }).png().toBuffer(), gravity: 'centre' }])
      .png()
      .toBuffer()
    const small = await upload(LOGO, tiny)
    expect(small.status).toBeLessThan(300)
  })

  it('sem arquivo = 400', async () => {
    const response = await app.request(LOGO, { method: 'POST', headers: { authorization: 'Bearer x' }, body: new FormData() })
    expect(response.status).toBe(400)
  })

  it('DELETE limpa logo e (ícones automáticos) ícones, mantendo as cores', async () => {
    await upload(LOGO, await transparentLogo())
    const result = await send('DELETE', LOGO)
    expect(result.status).toBe(200)
    expect(brandingOf('clube-a')).toEqual({ primaryColor: '#112233', secondaryColor: '#ffeedd' })
  })
})

describe('permissões', () => {
  it('sem sessão = 401', async () => {
    state.session = null
    expect((await upload(LOGO, await transparentLogo())).status).toBe(401)
    expect((await send('DELETE', ICON)).status).toBe(401)
  })

  it.each(['seller', 'client'] as const)('papel %s = 403', async role => {
    state.session = tenantSession('clube-a', role)
    for (const path of [LOGO, ICON]) {
      expect((await upload(path, await transparentLogo())).status).toBe(403)
      expect((await send('DELETE', path)).status).toBe(403)
    }
    expect((await send('PATCH', '/api/v1/t/clube-a/marca', undefined, { primaryColor: '#000000', secondaryColor: '#ffffff' })).status).toBe(403)
    expect(brandingOf('clube-a')).toEqual({ primaryColor: '#112233', secondaryColor: '#ffeedd' })
  })

  it('admin do clube B não mexe no clube A (logo, ícone e cores)', async () => {
    state.session = tenantSession('clube-b')
    expect((await upload(LOGO, await transparentLogo())).status).toBe(403)
    expect((await upload(ICON, await symbolPng())).status).toBe(403)
    expect((await send('DELETE', LOGO)).status).toBe(403)
    expect((await send('DELETE', ICON)).status).toBe(403)
    expect((await send('PATCH', '/api/v1/t/clube-a/marca', undefined, { primaryColor: '#000000', secondaryColor: '#ffffff' })).status).toBe(403)
    expect(brandingOf('clube-a')).toEqual({ primaryColor: '#112233', secondaryColor: '#ffeedd' })
  })

  it('vendedor ANNETEC e platform_admin = 403; superadmin pode', async () => {
    state.session = platformSession('platform_seller')
    expect((await upload(LOGO, await transparentLogo())).status).toBe(403)
    state.session = platformSession('platform_admin')
    expect((await upload(LOGO, await transparentLogo())).status).toBe(403)
    state.session = platformSession('superadmin')
    expect((await upload(LOGO, await transparentLogo())).status).toBe(200)
  })
})

describe('cores (PATCH)', () => {
  it('valida hexadecimal e faz merge sem tocar no logo', async () => {
    await upload(LOGO, await transparentLogo())
    const before = brandingOf('clube-a')
    const bad = await send('PATCH', '/api/v1/t/clube-a/marca', undefined, { primaryColor: 'azul', secondaryColor: '#ffffff' })
    expect(bad.status).toBe(400)
    expect(brandingOf('clube-a')).toEqual(before)

    const good = await send('PATCH', '/api/v1/t/clube-a/marca', undefined, { primaryColor: '#1E88E5', secondaryColor: '#fff' })
    expect(good.status).toBe(200)
    expect(brandingOf('clube-a')).toEqual({ ...before, primaryColor: '#1E88E5', secondaryColor: '#fff' })
  })
})

describe('ícone', () => {
  it('envio do ícone: 4 variantes, iconSource=upload, logo intocado; reenvio do logo não sobrescreve o ícone', async () => {
    const logo = (await upload(LOGO, await transparentLogo())).body!.data!.branding!
    const result = await upload(ICON, await symbolPng())
    expect(result.status).toBe(200)
    expect(result.body!.data!.suggestedColors).toEqual([])
    const withIcon = brandingOf('clube-a')
    expect(withIcon.iconSource).toBe('upload')
    expect(withIcon.logoUrl).toBe(logo.logoUrl)
    expect(withIcon.logoLightUrl).toBe(logo.logoLightUrl)
    for (const key of ['iconUrl', 'iconSmallUrl', 'appleTouchIconUrl', 'faviconUrl']) expect(withIcon[key]).not.toBe(logo[key])

    // reenvia o logo: logo muda, ícones enviados ficam
    const again = await upload(LOGO, await transparentLogo())
    const after = again.body!.data!.branding!
    expect(after.logoUrl).not.toBe(withIcon.logoUrl)
    for (const key of ['iconUrl', 'iconSmallUrl', 'appleTouchIconUrl', 'faviconUrl']) expect(after[key]).toBe(withIcon[key])
    expect(after.iconSource).toBe('upload')

    // apagar o logo com ícone enviado: o ícone fica
    await send('DELETE', LOGO)
    const kept = brandingOf('clube-a')
    expect(kept.logoUrl).toBeUndefined()
    expect(kept.iconUrl).toBe(withIcon.iconUrl)
    expect(kept.iconSource).toBe('upload')
  })

  it('ícones têm os tamanhos certos e o da Apple é opaco', async () => {
    await upload(ICON, await symbolPng())
    const branding = brandingOf('clube-a')
    const sizes: Record<string, number> = { iconUrl: 512, iconSmallUrl: 192, appleTouchIconUrl: 180, faviconUrl: 48 }
    for (const [key, size] of Object.entries(sizes)) {
      const response = await app.request(new URL(branding[key]!).pathname)
      const image = sharp(Buffer.from(await response.arrayBuffer()))
      expect((await image.metadata()).width).toBe(size)
      const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      expect(data[3]).toBe(key === 'appleTouchIconUrl' ? 255 : 0)
    }
  })

  it('DELETE do ícone volta ao automático a partir do logo atual', async () => {
    await upload(LOGO, await transparentLogo())
    await upload(ICON, await symbolPng())
    const uploaded = brandingOf('clube-a')
    expect(uploaded.iconSource).toBe('upload')

    const result = await send('DELETE', ICON)
    expect(result.status).toBe(200)
    const reverted = brandingOf('clube-a')
    expect(reverted.iconSource).toBe('auto')
    expect(reverted.iconUrl).toBeDefined()
    expect(reverted.iconUrl).not.toBe(uploaded.iconUrl)
    expect(reverted.logoUrl).toBe(uploaded.logoUrl)
    const served = await app.request(new URL(reverted.iconUrl!).pathname)
    expect((await sharp(Buffer.from(await served.arrayBuffer())).metadata()).width).toBe(512)
  })

  it('DELETE do ícone sem logo remove os campos de ícone', async () => {
    await upload(ICON, await symbolPng())
    expect((await send('DELETE', ICON)).status).toBe(200)
    expect(brandingOf('clube-a')).toEqual({ primaryColor: '#112233', secondaryColor: '#ffeedd' })
  })

  it('platform: envia/remove logo e ícone de um clube pelo id', async () => {
    state.session = platformSession('superadmin')
    const base = `/api/v1/platform/tenants/${ids['clube-b']}`
    expect((await upload(`${base}/logo`, await transparentLogo())).status).toBe(200)
    expect(brandingOf('clube-b').iconSource).toBe('auto')
    expect((await upload(`${base}/icone`, await symbolPng())).status).toBe(200)
    expect(brandingOf('clube-b').iconSource).toBe('upload')
    expect((await send('DELETE', `${base}/icone`)).status).toBe(200)
    expect(brandingOf('clube-b').iconSource).toBe('auto')
    expect((await send('DELETE', `${base}/logo`)).status).toBe(200)
    expect(brandingOf('clube-b')).toEqual({ primaryColor: '#112233', secondaryColor: '#ffeedd' })
    expect(brandingOf('clube-a')).toEqual({ primaryColor: '#112233', secondaryColor: '#ffeedd' })
  })

  it('platform: só superadmin e id inexistente = 404', async () => {
    const base = `/api/v1/platform/tenants/${ids['clube-b']}`
    state.session = platformSession('platform_admin')
    expect((await upload(`${base}/logo`, await transparentLogo())).status).toBe(403)
    expect((await upload(`${base}/icone`, await symbolPng())).status).toBe(403)
    expect((await send('DELETE', `${base}/logo`)).status).toBe(403)
    state.session = tenantSession('clube-b')
    expect((await upload(`${base}/logo`, await transparentLogo())).status).toBe(403)
    state.session = platformSession('superadmin')
    expect((await upload('/api/v1/platform/tenants/cccccccc-cccc-4ccc-8ccc-cccccccccccc/logo', await transparentLogo())).status).toBe(404)
  })
})

describe('platform PATCH /tenants/:id — marca server-side segura', () => {
  it('só aplica as cores; mantém todas as imagens guardadas, mesmo que o corpo mande outras', async () => {
    state.session = platformSession('superadmin')
    const base = `/api/v1/platform/tenants/${ids['clube-a']}`
    await upload(`${base}/logo`, await transparentLogo())
    await upload(`${base}/icone`, await symbolPng())
    const before = brandingOf('clube-a')
    expect(before.iconSource).toBe('upload')
    // o banco em memória não suporta o select com join do `getById`; só a gravação importa aqui
    const { tenantsService } = await import('@/modules/tenants/service')
    vi.spyOn(tenantsService, 'getById').mockResolvedValue({ id: ids['clube-a'] } as never)

    const result = await send('PATCH', base, undefined, {
      branding: {
        primaryColor: '#010203',
        secondaryColor: '#040506',
        logoUrl: 'https://evil.example/x.png',
        iconUrl: 'https://evil.example/i.png',
        iconSource: 'auto',
      },
    })
    expect(result.status).toBe(200)
    expect(brandingOf('clube-a')).toEqual({ ...before, primaryColor: '#010203', secondaryColor: '#040506' })
  })

  it('mergeBrandColors: sem marca guardada só tem cores', async () => {
    const { mergeBrandColors } = await import('@/modules/tenants/service')
    expect(mergeBrandColors(undefined, { primaryColor: '#111111', secondaryColor: '#222222' })).toEqual({
      primaryColor: '#111111',
      secondaryColor: '#222222',
    })
  })
})
