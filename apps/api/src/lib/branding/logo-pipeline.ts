import sharp from 'sharp'

/**
 * Adaptação automática da marca do clube: UMA imagem enviada vira todas as
 * variantes usadas pelo produto (site, menus laterais, login, carteirinha,
 * favicon/ícone do app, e-mails, OG). Funções PURAS — recebem bytes e devolvem
 * bytes; armazenamento fica em `logo-storage.ts`.
 *
 * Segurança: SVG nunca é guardado nem servido — só é rasterizado depois de
 * passar por `assertSafeSvg`. Toda a saída é reencodada (sem EXIF/ICC/metadados).
 * Memória (container de 512 MB): entrada limitada a ~100 megapixels (lida em
 * streaming e reduzida logo de início) e trabalho em no máximo 2400 px do lado maior.
 */

// Defensivo para o container pequeno: sem cache do libvips e uma thread só.
sharp.cache(false)
sharp.concurrency(1)

const LIMIT_INPUT_PIXELS = 24_000_000
const WORK_SIDE = 2400
const LIMIT_NORMALIZE_PIXELS = 100_000_000
/** Lado maior (px) do SVG rasterizado (reduz SVGs enormes e amplia os minúsculos). */
const SVG_RASTER_SIDE = 2048
const SVG_MAX_PIXELS = 50_000_000
const SVG_MAX_SIDE = 30_000
const MIN_LOGO_SIDE = 128
const MIN_ICON_SIDE = 64
const WARN_LOGO_SIDE = 512
const WARN_ICON_SIDE = 256
const NON_SQUARE_RATIO = 1.3

/**
 * No máximo 2 processamentos de imagem ao mesmo tempo no processo todo: cada
 * um chega a ~150 MB de pico (24 MP decodificados), e o container tem 512 MB.
 * O limite de envios é por clube — sem isto, vários clubes juntos estourariam
 * a memória.
 */
const MAX_CONCURRENT_JOBS = 2
let running = 0
const waiting: (() => void)[] = []
async function limited<T>(work: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_JOBS) await new Promise<void>(resolve => waiting.push(resolve)) // a vaga é repassada
  else running++
  try {
    return await work()
  } finally {
    const next = waiting.shift()
    if (next) next()
    else running--
  }
}

export const LOGO_MAX_SIZE = { width: 800, height: 400 } as const

/** Erro de entrada do usuário (imagem inválida/insegura/pequena) — mensagem em pt-BR, pronta para exibir. */
export class BrandImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BrandImageError'
  }
}

export interface IconVariants {
  /** 512×512, transparente, ~10% de respiro. */
  icon: Buffer
  /** 192×192, transparente. */
  iconSmall: Buffer
  /** 180×180, OPACO (fundo branco). */
  appleTouchIcon: Buffer
  /** 48×48, transparente, respiro mínimo. */
  favicon: Buffer
}

export interface LogoVariants extends IconVariants {
  /** Cabe em 800×400, sem ampliar. */
  logo: Buffer
  /** Versão toda branca — só quando a imagem tem transparência E é de traço (cobertura opaca ≤ 55%). */
  logoLight?: Buffer
}

export interface ImageMeta {
  /** Dimensões da imagem original (SVG: tamanho rasterizado). */
  width: number
  height: number
  /** Dimensões depois de cortar as bordas uniformes. */
  trimmedWidth: number
  trimmedHeight: number
  hasTransparency: boolean
  /** Até 2 cores de marca dominantes (`#RRGGBB`). */
  suggestedColors: string[]
  warnings: string[]
}

export interface ProcessedLogo {
  variants: LogoVariants
  meta: ImageMeta
}

export interface ProcessedIcon {
  variants: IconVariants
  meta: ImageMeta
}

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

/** Recusa SVG com script, entidades, conteúdo embutido ou referência externa. */
export function assertSafeSvg(text: string): void {
  const unsafe = (reason: string) =>
    new BrandImageError(`O SVG não pôde ser aceito por segurança (${reason}). Exporte o logo como PNG ou como SVG simples, sem scripts.`)
  if (/<!DOCTYPE/i.test(text)) throw unsafe('contém DOCTYPE')
  if (/<!ENTITY/i.test(text)) throw unsafe('contém entidades')
  if (/<script/i.test(text)) throw unsafe('contém script')
  if (/<foreignObject/i.test(text)) throw unsafe('contém foreignObject')
  if (/<(?:iframe|embed|object)\b/i.test(text)) throw unsafe('contém conteúdo embutido')
  if (/[\s"'/]on[a-z]+\s*=/i.test(text)) throw unsafe('contém eventos')
  if (/@import/i.test(text)) throw unsafe('importa arquivos externos')
  for (const match of text.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gis)) {
    const value = match[2]!.trim()
    if (!value.startsWith('#') && !/^data:image\//i.test(value)) throw unsafe('referencia arquivos externos')
  }
  for (const match of text.matchAll(/url\(\s*(["']?)([^)"']*)\1\s*\)/gi)) {
    const value = match[2]!.trim()
    if (!value.startsWith('#') && !/^data:image\//i.test(value)) throw unsafe('referencia arquivos externos')
  }
}

// ---------------------------------------------------------------------------
// Decodificação + corte das bordas
// ---------------------------------------------------------------------------

interface RawImage {
  data: Buffer
  width: number
  height: number
}

const UNREADABLE = 'Não foi possível ler a imagem. Verifique se o arquivo não está corrompido e tente de novo.'

/**
 * Densidade (dpi) para o SVG sair com ~`SVG_RASTER_SIDE` px no lado maior, sem o
 * lado menor sumir (SVG 1×100000 precisa de ≥ 1 px) e sem passar de ~50 MP.
 */
function svgDensity(width: number, height: number): number {
  const longest = Math.max(width, height)
  const shortest = Math.min(width, height)
  let scale = Math.max(SVG_RASTER_SIDE / longest, 1 / shortest) // px por unidade do SVG
  const pixels = width * scale * height * scale
  if (pixels > SVG_MAX_PIXELS) scale *= Math.sqrt(SVG_MAX_PIXELS / pixels)
  // librsvg não rasteriza lado > 32767 px.
  scale = Math.min(scale, SVG_MAX_SIDE / longest)
  return Math.min(10_000, Math.max(1, 72 * scale))
}

/** Dimensões intrínsecas do SVG: metadata do sharp (72 dpi) ou, sem width/height, o viewBox. */
async function svgIntrinsicSize(input: Buffer, text: string): Promise<{ width: number; height: number }> {
  let width = 0
  let height = 0
  try {
    const meta = await sharp(input, { limitInputPixels: false, failOn: 'error' }).metadata()
    width = meta.width ?? 0
    height = meta.height ?? 0
  } catch {
    // cai no viewBox abaixo
  }
  if (!width || !height) {
    // Tamanho declarado grande demais para o libvips (> 32767 px): lê width/height da raiz.
    const root = /<svg[^>]*>/i.exec(text)?.[0] ?? ''
    const attr = (name: string) =>
      Number(new RegExp(String.raw`\s${name}\s*=\s*["']\s*([\d.]+)\s*(?:px)?\s*["']`, 'i').exec(root)?.[1] ?? 0)
    width = attr('width')
    height = attr('height')
  }
  if (!width || !height) {
    const box = /viewBox\s*=\s*["']\s*[-\d.eE]+[\s,]+[-\d.eE]+[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)\s*["']/i.exec(text)
    width = Number(box?.[1] ?? 0)
    height = Number(box?.[2] ?? 0)
  }
  if (!(width > 0) || !(height > 0)) throw new BrandImageError('O SVG não tem dimensões (width/height ou viewBox).')
  return { width, height }
}

/**
 * Etapa 1 — normaliza: lê a entrada (qualquer tamanho até ~100 MP; SVG por
 * tamanho-alvo), aplica EXIF, primeira página e reduz para caber em
 * `WORK_SIDE`. Devolve um PNG pequeno + o tamanho original.
 */
async function normalize(input: Buffer, mime: string): Promise<{ png: Buffer; originalWidth: number; originalHeight: number }> {
  let pipeline: sharp.Sharp
  let originalWidth: number
  let originalHeight: number
  if (mime === 'image/svg+xml') {
    const text = new TextDecoder('utf-8').decode(input)
    assertSafeSvg(text)
    const size = await svgIntrinsicSize(input, text)
    const density = svgDensity(size.width, size.height)
    originalWidth = Math.max(1, Math.round((size.width * density) / 72))
    originalHeight = Math.max(1, Math.round((size.height * density) / 72))
    pipeline = sharp(input, { density, limitInputPixels: LIMIT_NORMALIZE_PIXELS, failOn: 'error' })
  } else {
    const meta = await sharp(input, { limitInputPixels: false, failOn: 'error', pages: 1 }).metadata()
    const swapped = (meta.orientation ?? 1) >= 5
    originalWidth = (swapped ? meta.height : meta.width) ?? 0
    originalHeight = (swapped ? meta.width : meta.height) ?? 0
    if (originalWidth * originalHeight > LIMIT_NORMALIZE_PIXELS) {
      throw new BrandImageError(
        `A imagem tem ${originalWidth} × ${originalHeight} px; o máximo é cerca de 100 megapixels.`,
      )
    }
    pipeline = sharp(input, { sequentialRead: true, limitInputPixels: LIMIT_NORMALIZE_PIXELS, failOn: 'error', pages: 1 }).rotate()
  }
  const png = await pipeline
    .toColourspace('srgb')
    .ensureAlpha()
    .resize(WORK_SIDE, WORK_SIDE, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 1 })
    .toBuffer()
  return { png, originalWidth, originalHeight }
}

/** Decodifica para RGBA sRGB (EXIF aplicado), no máximo `WORK_SIDE` px, e devolve o tamanho original. */
async function decode(bytes: Uint8Array, mime: string): Promise<{ raw: RawImage; originalWidth: number; originalHeight: number }> {
  const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  try {
    const { png, originalWidth, originalHeight } = await normalize(input, mime)
    // Etapa 2: a partir daqui a imagem tem no máximo 2400 px (< 24 MP).
    const { data, info } = await sharp(png, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: 'error' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    return { raw: { data, width: info.width, height: info.height }, originalWidth, originalHeight }
  } catch (error) {
    if (error instanceof BrandImageError) throw error
    const message = error instanceof Error ? error.message : ''
    if (mime === 'image/svg+xml' && /zero-sized|32767|pixel limit/i.test(message)) {
      throw new BrandImageError('As dimensões do SVG são exageradas (muito largo/alto para rasterizar). Exporte o logo como PNG ou ajuste o tamanho do SVG.')
    }
    if (/pixel limit/i.test(message)) {
      throw new BrandImageError('A imagem é grande demais (máximo de cerca de 100 megapixels). Reduza as dimensões e tente de novo.')
    }
    throw new BrandImageError(UNREADABLE)
  }
}

const TRIM_TOLERANCE = 28
const TRANSPARENT_ALPHA = 16

/**
 * Corta bordas uniformes: transparentes ou de uma cor sólida (a do canto
 * superior esquerdo), com tolerância para o ruído do JPEG.
 */
export function trimUniformBorders(image: RawImage): RawImage {
  const { data, width, height } = image
  const at = (x: number, y: number) => (y * width + x) * 4
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)]
  const transparentBackground = corners.every(i => data[i + 3]! < TRANSPARENT_ALPHA)
  const bg = { r: data[0]!, g: data[1]!, b: data[2]!, a: data[3]! }

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = data[i + 3]!
      const content = transparentBackground
        ? a >= TRANSPARENT_ALPHA
        : Math.abs(a - bg.a) > TRIM_TOLERANCE ||
          Math.abs(data[i]! - bg.r) > TRIM_TOLERANCE ||
          Math.abs(data[i + 1]! - bg.g) > TRIM_TOLERANCE ||
          Math.abs(data[i + 2]! - bg.b) > TRIM_TOLERANCE
      if (content) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) {
    // Totalmente transparente: não há nada para mostrar.
    if (transparentBackground) throw new BrandImageError('A imagem é totalmente transparente. Envie um arquivo com o logo visível.')
    // Cor uniforme (parece "em branco"): nunca recusa — usa a imagem inteira, sem cortar.
    return image
  }

  const outWidth = maxX - minX + 1
  const outHeight = maxY - minY + 1
  if (outWidth === width && outHeight === height) return image
  const out = Buffer.allocUnsafe(outWidth * outHeight * 4)
  for (let y = 0; y < outHeight; y++) {
    const from = ((minY + y) * width + minX) * 4
    data.copy(out, y * outWidth * 4, from, from + outWidth * 4)
  }
  return { data: out, width: outWidth, height: outHeight }
}

function sharpOf(image: RawImage): sharp.Sharp {
  return sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } })
}

// ---------------------------------------------------------------------------
// Análise
// ---------------------------------------------------------------------------

/** Há transparência "de verdade" (≥ 0,5% dos pixels com alpha < 250), não só borda suavizada. */
function detectTransparency(image: RawImage): boolean {
  const total = image.width * image.height
  let transparent = 0
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i]! < 250) transparent++
  return transparent / total >= 0.005
}

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase()

/**
 * Até 2 cores dominantes "de marca": ignora transparentes, quase brancos,
 * quase pretos e acinzentados. Quantiza em 16 níveis por canal numa miniatura.
 */
export async function suggestColors(image: RawImage): Promise<string[]> {
  const { data, info } = await sharpOf(image)
    .resize(64, 64, { fit: 'inside', kernel: 'nearest' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>()
  let counted = 0
  for (let i = 0; i < info.width * info.height * 4; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    if (data[i + 3]! < 200) continue
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (min >= 235) continue // quase branco
    if (max <= 35) continue // quase preto
    if (max - min < 20) continue // cinza
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 }
    bucket.count++
    bucket.r += r
    bucket.g += g
    bucket.b += b
    buckets.set(key, bucket)
    counted++
  }
  if (counted === 0) return []
  const ranked = [...buckets.values()]
    .sort((x, y) => y.count - x.count)
    .map(bucket => ({ count: bucket.count, r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count }))
  const first = ranked[0]!
  const colors = [`#${hex(first.r)}${hex(first.g)}${hex(first.b)}`]
  const second = ranked.find(
    candidate =>
      candidate.count / counted >= 0.03 &&
      Math.hypot(candidate.r - first.r, candidate.g - first.g, candidate.b - first.b) > 80,
  )
  if (second) colors.push(`#${hex(second.r)}${hex(second.g)}${hex(second.b)}`)
  return colors
}

// ---------------------------------------------------------------------------
// Variantes
// ---------------------------------------------------------------------------

const PNG_OPTIONS = { palette: true, quality: 92, effort: 8, compressionLevel: 9 } as const

async function logoVariant(image: RawImage): Promise<{ png: Buffer; raw: RawImage }> {
  const resized = await sharpOf(image)
    .resize(LOGO_MAX_SIZE.width, LOGO_MAX_SIZE.height, { fit: 'inside', withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const raw = { data: resized.data, width: resized.info.width, height: resized.info.height }
  return { png: await sharpOf(raw).png(PNG_OPTIONS).toBuffer(), raw }
}

/**
 * Proporção de pixels opacos dentro da caixa já aparada (a imagem inteira). Logos de
 * traço/escrita ficam abaixo de ~0,55; blocos sólidos ficam bem acima.
 */
export function opaqueCoverage(image: RawImage): number {
  const total = image.width * image.height
  let opaque = 0
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i]! >= 128) opaque++
  return total > 0 ? opaque / total : 0
}

/** Acima disto a silhueta branca viraria uma mancha sólida: a carteirinha usa o logo colorido sobre um fundo branco. */
export const SILHOUETTE_MAX_COVERAGE = 0.55

/** Versão monocromática branca (alpha preservado) — fundos escuros/coloridos. */
async function whiteVariant(logoRaw: RawImage): Promise<Buffer> {
  const white = Buffer.from(logoRaw.data)
  for (let i = 0; i < white.length; i += 4) {
    white[i] = 255
    white[i + 1] = 255
    white[i + 2] = 255
  }
  return sharpOf({ ...logoRaw, data: white }).png(PNG_OPTIONS).toBuffer()
}

/** Imagem contida no quadrado `size` (centralizada, sem distorcer) com respiro `padding` (fração). */
async function squareIcon(image: RawImage, size: number, padding: number, opaque: boolean): Promise<Buffer> {
  const inner = Math.max(1, Math.round(size * (1 - 2 * padding)))
  const content = await sharpOf(image).resize(inner, inner, { fit: 'inside' }).png().toBuffer()
  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: opaque ? { r: 255, g: 255, b: 255, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: content, gravity: 'centre' }])
  return opaque ? canvas.flatten({ background: '#ffffff' }).png({ compressionLevel: 9 }).toBuffer() : canvas.png(PNG_OPTIONS).toBuffer()
}

async function iconVariants(image: RawImage): Promise<IconVariants> {
  const icon = await squareIcon(image, 512, 0.1, false)
  const iconSmall = await squareIcon(image, 192, 0.1, false)
  const appleTouchIcon = await squareIcon(image, 180, 0.12, true)
  const favicon = await squareIcon(image, 48, 0.04, false)
  return { icon, iconSmall, appleTouchIcon, favicon }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

const UPSCALED_WARNING = 'A imagem é pequena; ela foi ampliada e pode ficar menos nítida.'
const UPSCALE_TARGET_SIDE = 512

async function prepare(bytes: Uint8Array, mime: string, minSide: number) {
  const { raw, originalWidth, originalHeight } = await decode(bytes, mime)
  let trimmed = trimUniformBorders(raw)
  let upscaled = false
  // Nunca recusa por ser pequena: amplia até um tamanho útil.
  if (Math.max(trimmed.width, trimmed.height) < minSide) {
    const { data, info } = await sharpOf(trimmed)
      .resize(UPSCALE_TARGET_SIDE, UPSCALE_TARGET_SIDE, { fit: 'inside', kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true })
    trimmed = { data, width: info.width, height: info.height }
    upscaled = true
  }
  return { trimmed, originalWidth, originalHeight, upscaled }
}

/**
 * Logo completo → `logo` (800×400), `logoLight` (se houver transparência) e os
 * 4 ícones automáticos (a partir do logo inteiro).
 */
export function processLogo(bytes: Uint8Array, mime: string): Promise<ProcessedLogo> {
  return limited(() => processLogoNow(bytes, mime))
}

async function processLogoNow(bytes: Uint8Array, mime: string): Promise<ProcessedLogo> {
  const { trimmed, originalWidth, originalHeight, upscaled } = await prepare(bytes, mime, MIN_LOGO_SIDE)
  const hasTransparency = detectTransparency(trimmed)
  const logo = await logoVariant(trimmed)
  // Silhueta branca só para logos "de traço"; blocos preenchidos viram mancha branca.
  const logoLight = hasTransparency && opaqueCoverage(trimmed) <= SILHOUETTE_MAX_COVERAGE ? await whiteVariant(logo.raw) : undefined
  const icons = await iconVariants(trimmed)
  const suggestedColors = await suggestColors(trimmed)
  const warnings: string[] = upscaled ? [UPSCALED_WARNING] : []
  if (Math.max(trimmed.width, trimmed.height) < WARN_LOGO_SIDE) {
    warnings.push('A imagem tem menos de 512 px; pode ficar borrada em telas grandes.')
  }
  return {
    variants: { logo: logo.png, ...(logoLight ? { logoLight } : {}), ...icons },
    meta: {
      width: originalWidth,
      height: originalHeight,
      trimmedWidth: trimmed.width,
      trimmedHeight: trimmed.height,
      hasTransparency,
      suggestedColors,
      warnings,
    },
  }
}

/** Símbolo do clube → os 4 ícones (512, 192, 180 opaco, 48). */
export function processIcon(bytes: Uint8Array, mime: string): Promise<ProcessedIcon> {
  return limited(() => processIconNow(bytes, mime))
}

async function processIconNow(bytes: Uint8Array, mime: string): Promise<ProcessedIcon> {
  const { trimmed, originalWidth, originalHeight, upscaled } = await prepare(bytes, mime, MIN_ICON_SIDE)
  const warnings: string[] = upscaled ? [UPSCALED_WARNING] : []
  const longest = Math.max(trimmed.width, trimmed.height)
  if (longest < WARN_ICON_SIDE) warnings.push('A imagem tem menos de 256 px; o ícone pode ficar borrado em telas grandes.')
  if (longest / Math.min(trimmed.width, trimmed.height) > NON_SQUARE_RATIO) {
    warnings.push('A imagem está longe de ser quadrada. Para o ícone, envie só o símbolo do logo, sem o nome.')
  }
  return {
    variants: await iconVariants(trimmed),
    meta: {
      width: originalWidth,
      height: originalHeight,
      trimmedWidth: trimmed.width,
      trimmedHeight: trimmed.height,
      hasTransparency: detectTransparency(trimmed),
      suggestedColors: [],
      warnings,
    },
  }
}

/** Gera os 4 ícones a partir de um logo já processado (PNG guardado) — "voltar ao automático". */
export function deriveIconsFromLogo(logoPng: Uint8Array): Promise<IconVariants> {
  return limited(async () => {
    const { trimmed } = await prepare(logoPng, 'image/png', 1)
    return iconVariants(trimmed)
  })
}
