import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  assertSafeSvg,
  BrandImageError,
  deriveIconsFromLogo,
  processIcon,
  processLogo,
} from '@/lib/branding/logo-pipeline'

/**
 * Pipeline de adaptação do logo (puro, sem storage): corte de bordas, 800×400,
 * ícones, versão clara, cores sugeridas, SVG seguro e metadados removidos.
 * Fixtures geradas com o próprio sharp — nada binário versionado.
 */

type Rgba = { r: number; g: number; b: number; alpha: number }
const BLUE = { r: 30, g: 136, b: 229 } // #1E88E5
const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, alpha: 0 }
const WHITE: Rgba = { r: 255, g: 255, b: 255, alpha: 1 }

/** Quadro `width`×`height` com fundo `bg` e um retângulo `box` de cor sólida no meio. */
async function logoPng(opts: {
  width: number
  height: number
  bg: Rgba
  box: { width: number; height: number }
  color?: typeof BLUE
  /** Fura o retângulo no meio (transparência de verdade dentro do logo, que sobrevive ao corte). */
  hole?: boolean
  /** Fração (0–1) de cada lado do furo; padrão 0,4. */
  holeRatio?: number
}) {
  let block = await sharp({
    create: { width: opts.box.width, height: opts.box.height, channels: 4, background: { ...(opts.color ?? BLUE), alpha: 1 } },
  })
    .png()
    .toBuffer()
  if (opts.hole) {
    const hole = await sharp({
      create: { width: Math.round(opts.box.width * (opts.holeRatio ?? 0.4)), height: Math.round(opts.box.height * (opts.holeRatio ?? 0.4)), channels: 4, background: WHITE },
    })
      .png()
      .toBuffer()
    block = await sharp(block).composite([{ input: hole, gravity: 'centre', blend: 'dest-out' }]).png().toBuffer()
  }
  return sharp({ create: { width: opts.width, height: opts.height, channels: 4, background: opts.bg } })
    .composite([{ input: block, gravity: 'centre' }])
    .png()
    .toBuffer()
}

async function stats(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

const pixel = (s: { data: Buffer; width: number }, x: number, y: number) => {
  const i = (y * s.width + x) * 4
  return { r: s.data[i]!, g: s.data[i + 1]!, b: s.data[i + 2]!, a: s.data[i + 3]! }
}

describe('processLogo — corte e tamanhos', () => {
  it('corta bordas transparentes e de cor sólida', async () => {
    const transparent = await logoPng({ width: 1200, height: 900, bg: TRANSPARENT, box: { width: 600, height: 300 } })
    const solid = await logoPng({ width: 1200, height: 900, bg: WHITE, box: { width: 600, height: 300 } })
    for (const input of [transparent, solid]) {
      const { meta } = await processLogo(input, 'image/png')
      expect(meta).toMatchObject({ width: 1200, height: 900, trimmedWidth: 600, trimmedHeight: 300 })
    }
  })

  it('logo cabe em 800×400 sem ampliar; imagem menor mantém o tamanho', async () => {
    const big = await logoPng({ width: 2000, height: 1600, bg: TRANSPARENT, box: { width: 1800, height: 1000 } })
    const { variants } = await processLogo(big, 'image/png')
    const out = await sharp(variants.logo).metadata()
    expect(out.format).toBe('png')
    expect(out.width).toBeLessThanOrEqual(800)
    expect(out.height).toBeLessThanOrEqual(400)
    expect(out.width).toBe(720) // 1800×1000 → limitado pela altura (400): 720×400

    const small = await logoPng({ width: 400, height: 400, bg: WHITE, box: { width: 300, height: 200 } })
    const kept = await sharp((await processLogo(small, 'image/png')).variants.logo).metadata()
    expect([kept.width, kept.height]).toEqual([300, 200])
  })

  it('ícone 512×512 transparente, com respiro, logo contido no centro', async () => {
    const input = await logoPng({ width: 1000, height: 1000, bg: TRANSPARENT, box: { width: 800, height: 400 } })
    const { variants } = await processLogo(input, 'image/png')
    const icon = await stats(variants.icon)
    expect([icon.width, icon.height]).toEqual([512, 512])
    expect(pixel(icon, 2, 2).a).toBe(0) // canto transparente
    expect(pixel(icon, 256, 256).a).toBe(255) // centro opaco
    expect(pixel(icon, 256, 20).a).toBe(0) // acima do logo (contido) há transparência
    expect(pixel(icon, 30, 256).a).toBe(0) // ~10% de respiro lateral (51 px)
  })

  it('4 ícones: tamanhos certos; só o da Apple é opaco', async () => {
    const input = await logoPng({ width: 800, height: 800, bg: TRANSPARENT, box: { width: 500, height: 300 } })
    const { variants } = await processLogo(input, 'image/png')
    const expected = { icon: 512, iconSmall: 192, appleTouchIcon: 180, favicon: 48 } as const
    for (const [key, size] of Object.entries(expected)) {
      const s = await stats(variants[key as keyof typeof expected])
      expect([s.width, s.height]).toEqual([size, size])
      const corner = pixel(s, 0, 0)
      if (key === 'appleTouchIcon') expect(corner).toEqual({ r: 255, g: 255, b: 255, a: 255 })
      else expect(corner.a).toBe(0)
    }
    const apple = await stats(variants.appleTouchIcon)
    expect(apple.data.filter((_, i) => i % 4 === 3).every(a => a === 255)).toBe(true)
  })

  it('logoLight só com transparência, e é branco com alpha preservado', async () => {
    const transparent = await logoPng({ width: 800, height: 600, bg: TRANSPARENT, box: { width: 400, height: 200 }, hole: true, holeRatio: 0.8 })
    const { variants } = await processLogo(transparent, 'image/png')
    expect(variants.logoLight).toBeDefined()
    const light = await stats(variants.logoLight!)
    const logo = await stats(variants.logo)
    expect([light.width, light.height]).toEqual([logo.width, logo.height])
    expect(pixel(light, 5, 5)).toEqual({ r: 255, g: 255, b: 255, a: 255 }) // parte opaca do logo vira branca
    expect(pixel(light, Math.floor(light.width / 2), Math.floor(light.height / 2)).a).toBe(0) // o furo continua transparente
    expect(light.data.some((v, i) => i % 4 !== 3 && v !== 255 && light.data[i - (i % 4) + 3] !== 0)).toBe(false)
  })

  it('logo de bloco preenchido (cobertura > 55%) não gera logoLight; traço fino gera', async () => {
    const block = await logoPng({ width: 800, height: 600, bg: TRANSPARENT, box: { width: 400, height: 200 }, hole: true, holeRatio: 0.4 })
    const filled = await processLogo(block, 'image/png')
    expect(filled.meta.hasTransparency).toBe(true)
    expect(filled.variants.logoLight).toBeUndefined()
    const frame = await logoPng({ width: 800, height: 600, bg: TRANSPARENT, box: { width: 400, height: 200 }, hole: true, holeRatio: 0.8 })
    expect((await processLogo(frame, 'image/png')).variants.logoLight).toBeDefined()
  })

  it('entrada JPEG (sem alpha) não gera logoLight e marca hasTransparency=false', async () => {
    const jpeg = await sharp(await logoPng({ width: 900, height: 500, bg: WHITE, box: { width: 600, height: 300 } })).jpeg().toBuffer()
    const { variants, meta } = await processLogo(jpeg, 'image/jpeg')
    expect(variants.logoLight).toBeUndefined()
    expect(meta.hasTransparency).toBe(false)
  })

  it('JPEG com fundo branco e ruído tem as bordas cortadas', async () => {
    const png = await logoPng({ width: 1000, height: 800, bg: WHITE, box: { width: 500, height: 300 } })
    const jpeg = await sharp(png).jpeg({ quality: 70 }).toBuffer()
    const { meta } = await processLogo(jpeg, 'image/jpeg')
    expect(Math.abs(meta.trimmedWidth - 500)).toBeLessThanOrEqual(4)
    expect(Math.abs(meta.trimmedHeight - 300)).toBeLessThanOrEqual(4)
  })

  it('WebP é aceito', async () => {
    const png = await logoPng({ width: 600, height: 400, bg: TRANSPARENT, box: { width: 300, height: 200 }, hole: true })
    const webp = await sharp(png).webp().toBuffer()
    const { meta } = await processLogo(webp, 'image/webp')
    expect(meta.hasTransparency).toBe(true)
  })

  it('remove EXIF/metadados e aplica a orientação', async () => {
    const base = await logoPng({ width: 700, height: 400, bg: WHITE, box: { width: 500, height: 200 } })
    const jpeg = await sharp(base)
      .jpeg()
      .withExif({ IFD0: { Copyright: 'Segredo', Artist: 'Fulano' } })
      .withMetadata({ orientation: 6 })
      .toBuffer()
    expect((await sharp(jpeg).metadata()).exif).toBeDefined()
    const { variants, meta } = await processLogo(jpeg, 'image/jpeg')
    // orientação 6 = girar 90°: a imagem "em pé" tem 400×700 e o logo 200×500
    expect([meta.width, meta.height]).toEqual([400, 700])
    expect([meta.trimmedWidth, meta.trimmedHeight].map(n => Math.round(n / 10) * 10)).toEqual([200, 500])
    for (const bytes of Object.values(variants)) {
      const m = await sharp(bytes).metadata()
      expect(m.exif).toBeUndefined()
      expect(m.icc).toBeUndefined()
      expect(m.orientation).toBeUndefined()
    }
  })
})

describe('processLogo — limites e avisos', () => {
  it('imagem pequena (< 128 px após o corte) é ampliada, com aviso, nunca recusada', async () => {
    const tiny = await logoPng({ width: 400, height: 400, bg: WHITE, box: { width: 100, height: 60 } })
    const { variants, meta } = await processLogo(tiny, 'image/png')
    expect(meta.warnings.join(' ')).toMatch(/foi ampliada/)
    expect(meta.trimmedWidth).toBeGreaterThanOrEqual(512)
    const m = await sharp(variants.logo).metadata()
    expect(m.width).toBeLessThanOrEqual(800)
    expect(m.height).toBeLessThanOrEqual(400)
  })

  it('PNG chato enorme (> 24 MP) é aceito e adaptado às variantes', async () => {
    const big = await logoPng({ width: 6000, height: 5000, bg: TRANSPARENT, box: { width: 4000, height: 3000 }, hole: false })
    const { variants, meta } = await processLogo(big, 'image/png')
    expect(meta.width).toBe(6000)
    const m = await sharp(variants.logo).metadata()
    expect(m.width).toBeLessThanOrEqual(800)
    expect(m.height).toBeLessThanOrEqual(400)
    expect((await sharp(variants.icon).metadata()).width).toBe(512)
  })

  it('acima de ~100 MP é recusado com o tamanho real na mensagem', async () => {
    const huge = await sharp({ create: { width: 12000, height: 9000, channels: 3, background: '#1E88E5' } }).png({ compressionLevel: 9 }).toBuffer()
    await expect(processLogo(huge, 'image/png')).rejects.toThrow(/12000 × 9000 px; o máximo é cerca de 100 megapixels/)
    await expect(processLogo(huge, 'image/png')).rejects.toBeInstanceOf(BrandImageError)
  }, 30_000)

  it('avisa quando o lado maior tem menos de 512 px', async () => {
    const input = await logoPng({ width: 400, height: 300, bg: WHITE, box: { width: 300, height: 200 } })
    const { meta } = await processLogo(input, 'image/png')
    expect(meta.warnings).toContain('A imagem tem menos de 512 px; pode ficar borrada em telas grandes.')
    const ok = await logoPng({ width: 900, height: 700, bg: WHITE, box: { width: 700, height: 300 } })
    expect((await processLogo(ok, 'image/png')).meta.warnings).toEqual([])
  })

  it('arquivo corrompido vira erro de usuário', async () => {
    const png = await logoPng({ width: 400, height: 400, bg: WHITE, box: { width: 300, height: 200 } })
    await expect(processLogo(png.subarray(0, 60), 'image/png')).rejects.toBeInstanceOf(BrandImageError)
  })

  it('imagem de cor uniforme não é recusada: processa a imagem inteira sem cortar', async () => {
    const blank = await sharp({ create: { width: 500, height: 500, channels: 3, background: WHITE } }).png().toBuffer()
    const { meta, variants } = await processLogo(blank, 'image/png')
    expect(meta).toMatchObject({ trimmedWidth: 500, trimmedHeight: 500 })
    expect(variants.logo.length).toBeGreaterThan(0)
  })

  it('imagem totalmente transparente é recusada com mensagem clara', async () => {
    const empty = await sharp({ create: { width: 500, height: 500, channels: 4, background: TRANSPARENT } }).png().toBuffer()
    await expect(processLogo(empty, 'image/png')).rejects.toThrow(/totalmente transparente/)
    await expect(processLogo(empty, 'image/png')).rejects.toBeInstanceOf(BrandImageError)
  })
})

describe('cores sugeridas', () => {
  it('logo de cor sólida devolve a cor dominante', async () => {
    const input = await logoPng({ width: 800, height: 600, bg: TRANSPARENT, box: { width: 500, height: 300 } })
    const { meta } = await processLogo(input, 'image/png')
    expect(meta.suggestedColors).toEqual(['#1E88E5'])
  })

  it('duas cores distintas → até 2 sugestões; branco/preto/cinza são ignorados', async () => {
    const red = await sharp({ create: { width: 300, height: 400, channels: 3, background: { r: 220, g: 30, b: 40 } } }).png().toBuffer()
    const base = await logoPng({ width: 900, height: 500, bg: TRANSPARENT, box: { width: 300, height: 400 } })
    const input = await sharp(base).composite([{ input: red, left: 600, top: 50 }]).png().toBuffer()
    const { meta } = await processLogo(input, 'image/png')
    expect(meta.suggestedColors).toHaveLength(2)
    expect(meta.suggestedColors).toContain('#1E88E5')
    expect(meta.suggestedColors).toContain('#DC1E28')

    const grey = await logoPng({ width: 600, height: 400, bg: WHITE, box: { width: 400, height: 200 }, color: { r: 20, g: 20, b: 20 } })
    expect((await processLogo(grey, 'image/png')).meta.suggestedColors).toEqual([])
  })
})

describe('SVG', () => {
  const svg = (body: string, attrs = 'width="600" height="300" viewBox="0 0 600 300"') =>
    new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${body}</svg>`)

  it('SVG com viewBox enorme e sem width/height é aceito (raster ~2048 px)', async () => {
    const { meta } = await processLogo(svg('<rect width="10000" height="10000" fill="#FFFFFF"/><circle cx="5000" cy="5000" r="3000" fill="#1E88E5"/>', 'viewBox="0 0 10000 10000"'), 'image/svg+xml')
    expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(2100)
    expect(Math.max(meta.width, meta.height)).toBeGreaterThanOrEqual(2000)
  })

  it('SVG minúsculo (24×24) é rasterizado para cima', async () => {
    const { meta } = await processIcon(svg('<circle cx="12" cy="12" r="10" fill="#1E88E5"/>', 'width="24" height="24" viewBox="0 0 24 24"'), 'image/svg+xml')
    expect(Math.max(meta.width, meta.height)).toBeGreaterThanOrEqual(2000)
  })

  it('SVG seguro é rasterizado com ≥ 1024 px no lado maior', async () => {
    const { variants, meta } = await processLogo(svg('<rect x="20" y="20" width="560" height="260" fill="#1E88E5"/>'), 'image/svg+xml')
    expect(Math.max(meta.width, meta.height)).toBeGreaterThanOrEqual(1024)
    expect(meta.hasTransparency).toBe(false) // retângulo cobre quase tudo
    expect((await sharp(variants.logo).metadata()).format).toBe('png')
    expect(meta.suggestedColors).toEqual(['#1E88E5'])
  })

  it('SVG com <image href="data:image/…"> e href="#id" passam', () => {
    expect(() =>
      assertSafeSvg('<svg><defs><g id="a"/></defs><use href="#a"/><use xlink:href="#a"/><image href="data:image/png;base64,AAAA"/></svg>'),
    ).not.toThrow()
  })

  it.each([
    ['script', '<script>alert(1)</script>'],
    ['foreignObject', '<foreignObject><div/></foreignObject>'],
    ['evento', '<rect width="10" height="10" onload="alert(1)"/>'],
    ['href externo', '<image href="https://evil.example/x.png"/>'],
    ['xlink:href externo', '<image xlink:href="http://evil.example/x.png"/>'],
    ['href file', '<image href="file:///etc/passwd"/>'],
    ['href javascript', '<a href="javascript:alert(1)"><rect width="1" height="1"/></a>'],
    ['url() externo', '<rect width="10" height="10" style="fill:url(http://evil.example/a)"/>'],
  ])('SVG inseguro recusado: %s', async (_name, body) => {
    await expect(processLogo(svg(body), 'image/svg+xml')).rejects.toThrow(/segurança/)
  })

  it('SVG com DOCTYPE/ENTITY recusado', async () => {
    const doctype = new TextEncoder().encode('<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')
    await expect(processLogo(doctype, 'image/svg+xml')).rejects.toBeInstanceOf(BrandImageError)
    expect(() => assertSafeSvg('<!ENTITY a "b"><svg/>')).toThrow(/segurança/)
  })
})

describe('processIcon / deriveIconsFromLogo', () => {
  it('símbolo quadrado → 4 ícones, sem avisos', async () => {
    const input = await logoPng({ width: 600, height: 600, bg: TRANSPARENT, box: { width: 400, height: 400 } })
    const { variants, meta } = await processIcon(input, 'image/png')
    expect(meta.warnings).toEqual([])
    expect(meta.suggestedColors).toEqual([])
    const sizes = await Promise.all(Object.values(variants).map(async b => (await sharp(b).metadata()).width))
    expect(sizes).toEqual([512, 192, 180, 48])
    expect(pixel(await stats(variants.appleTouchIcon), 0, 0).a).toBe(255)
    expect(pixel(await stats(variants.favicon), 0, 0).a).toBe(0)
  })

  it('não quadrado avisa para enviar só o símbolo; < 256 px avisa; < 64 px amplia', async () => {
    const wide = await logoPng({ width: 900, height: 500, bg: TRANSPARENT, box: { width: 800, height: 300 } })
    expect((await processIcon(wide, 'image/png')).meta.warnings.join(' ')).toMatch(/só o símbolo/)
    const small = await logoPng({ width: 200, height: 200, bg: TRANSPARENT, box: { width: 150, height: 150 } })
    expect((await processIcon(small, 'image/png')).meta.warnings.join(' ')).toMatch(/menos de 256 px/)
    const tiny = await logoPng({ width: 200, height: 200, bg: TRANSPARENT, box: { width: 40, height: 40 } })
    const up = await processIcon(tiny, 'image/png')
    expect(up.meta.warnings.join(' ')).toMatch(/foi ampliada/)
    expect((await sharp(up.variants.icon).metadata()).width).toBe(512)
  })

  it('deriveIconsFromLogo gera os mesmos 4 tamanhos a partir de um logo processado', async () => {
    const input = await logoPng({ width: 900, height: 500, bg: TRANSPARENT, box: { width: 700, height: 200 }, hole: true })
    const { variants } = await processLogo(input, 'image/png')
    const icons = await deriveIconsFromLogo(variants.logo)
    expect((await sharp(icons.icon).metadata()).width).toBe(512)
    expect((await sharp(icons.favicon).metadata()).width).toBe(48)
  })
})
