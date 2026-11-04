import { BRAND_LOGO_MAX_BYTES } from '@annetec/contracts'

/**
 * Pré-processamento de logo/ícone no navegador ("pré-render"): abre qualquer
 * imagem que o navegador saiba decodificar, sugere o recorte (bordas vazias
 * ou de cor uniforme), gera o PNG final no canvas e garante que ele caiba no
 * limite do servidor. Código só de navegador — nada daqui importa o servidor.
 *
 * O arquivo escolhido NUNCA é recusado por tamanho: imagens enormes são
 * reduzidas na decodificação (`createImageBitmap` com resize ou passos de
 * 1/2 no canvas) e o que sobe é sempre um PNG (ou WebP, se o PNG pesar
 * demais) produzido aqui — inclusive para SVG, que é rasterizado no navegador.
 */

export type BrandKind = 'logo' | 'icon'

export const LOGO_MAX_SIDE = 2048
export const LOGO_MIN_SIDE = 512
export const ICON_SIZE = 1024
/** Maior lado da imagem de trabalho (raster) guardada na memória. */
export const WORK_MAX_SIDE = 4000
/** Nenhum canvas (nem intermediário) passa disto: o Safari do celular falha acima de ~16 MP. */
const MAX_CANVAS_PIXELS = 16_000_000
/** Acima disto a silhueta branca da carteirinha vira uma mancha sólida (espelha o servidor). */
export const SILHOUETTE_MAX_COVERAGE = 0.55
/** Lado maior ao rasterizar SVG. */
export const SVG_RENDER_SIDE = 2048
/** Acima disto nem tentamos decodificar (a memória do navegador não aguenta). */
const MAX_DECODE_PIXELS = 500_000_000

export const DECODE_ERROR =
  'Não conseguimos abrir este formato no navegador. Exporte a logo como PNG, JPG ou SVG e envie de novo.'
export const TOO_BIG_ERROR =
  'Esta imagem é grande demais para abrir no navegador (mais de 500 megapixels). Reduza as dimensões e envie de novo.'
export const SMALL_IMAGE_WARNING = 'A imagem é pequena; ela foi ampliada e pode ficar menos nítida.'

export class ImagePrepError extends Error {}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface PreparedSource {
  /** Imagem de trabalho (≤ 4096 px; no ícone, já num quadrado com margem transparente). */
  work: HTMLCanvasElement
  /** Cópia menor (≤ 1600 px) para mostrar no editor. */
  display: HTMLCanvasElement
  width: number
  height: number
  hasAlpha: boolean
  /** Sem transparência e com borda quase branca e uniforme: dá para "tirar o fundo branco". */
  whiteBackground: boolean
  /** Caixa do conteúdo (sem bordas vazias) em pixels de `work`, ou `null` se não há o que aparar. */
  trimBox: Box | null
  close(): void
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new ImagePrepError(DECODE_ERROR)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

function release(canvas: HTMLCanvasElement | null) {
  if (canvas) {
    canvas.width = 0
    canvas.height = 0
  }
}

/** Copia uma região para um canvas `dw × dh`, reduzindo em passos de 1/2 (qualidade melhor que um salto só). */
function scaleRegion(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): HTMLCanvasElement {
  dw = Math.max(1, Math.round(dw))
  dh = Math.max(1, Math.round(dh))
  let current: CanvasImageSource = source
  let cx = sx
  let cy = sy
  let cw = sw
  let ch = sh
  let temp: HTMLCanvasElement | null = null
  while (cw / 2 >= dw && ch / 2 >= dh) {
    // Passo de 1/2; se o intermediário passaria de ~16 MP (fonte gigante), dá um salto maior de uma vez.
    const factor = Math.max(2, Math.sqrt((cw * ch) / MAX_CANVAS_PIXELS))
    const next = makeCanvas(Math.max(dw, Math.floor(cw / factor)), Math.max(dh, Math.floor(ch / factor)))
    context(next).drawImage(current, cx, cy, cw, ch, 0, 0, next.width, next.height)
    release(temp)
    temp = next
    current = next
    cx = 0
    cy = 0
    cw = next.width
    ch = next.height
  }
  const out = makeCanvas(dw, dh)
  context(out).drawImage(current, cx, cy, cw, ch, 0, 0, out.width, out.height)
  release(temp)
  return out
}

export function releaseCanvas(canvas: HTMLCanvasElement | null) {
  release(canvas)
}

// ---------------------------------------------------------------------------
// Decodificação
// ---------------------------------------------------------------------------

function isSvgFile(file: File): boolean {
  return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new ImagePrepError(DECODE_ERROR))
    img.src = url
  })
}

function parseLength(value: string | null): number | null {
  if (!value) return null
  const match = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/i.exec(value)
  if (!match) return null
  const n = Number(match[1])
  return n > 0 ? n : null
}

/** Rasteriza o SVG em ~2048 px no maior lado. Em `<img>` o SVG não executa scripts nem carrega recursos externos. */
async function rasterizeSvg(file: File): Promise<HTMLCanvasElement> {
  const text = await file.text()
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new ImagePrepError(DECODE_ERROR)
  }
  let width = parseLength(root.getAttribute('width'))
  let height = parseLength(root.getAttribute('height'))
  let viewBox: number[] | null = null
  const vb = root.getAttribute('viewBox')
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2]! > 0 && parts[3]! > 0) viewBox = parts
  }
  if (!width || !height) {
    if (viewBox) {
      const ratio = viewBox[2]! / viewBox[3]!
      if (width) height = width / ratio
      else if (height) width = height * ratio
      else {
        width = viewBox[2]!
        height = viewBox[3]!
      }
    } else {
      width = width ?? height ?? 1024
      height = height ?? width
    }
  }
  const scale = SVG_RENDER_SIDE / Math.max(width!, height!)
  const outW = Math.max(1, Math.round(width! * scale))
  const outH = Math.max(1, Math.round(height! * scale))
  if (!viewBox) root.setAttribute('viewBox', `0 0 ${width} ${height}`)
  root.setAttribute('width', String(outW))
  root.setAttribute('height', String(outH))
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const blob = new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  try {
    const img = await loadImage(url)
    const canvas = makeCanvas(outW, outH)
    context(canvas).drawImage(img, 0, 0, outW, outH)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function rasterizeBitmap(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file)
  let img: HTMLImageElement | null = null
  try {
    try {
      img = await loadImage(url)
    } catch {
      img = null
    }
    let naturalW = img?.naturalWidth ?? 0
    let naturalH = img?.naturalHeight ?? 0
    if (!naturalW || !naturalH) {
      // O <img> não abriu; o createImageBitmap às vezes abre (ou então falha de vez).
      if (typeof createImageBitmap !== 'function') throw new ImagePrepError(DECODE_ERROR)
      let bitmap: ImageBitmap
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      } catch {
        throw new ImagePrepError(DECODE_ERROR)
      }
      try {
        if (bitmap.width * bitmap.height > MAX_DECODE_PIXELS) throw new ImagePrepError(TOO_BIG_ERROR)
        const scale = Math.min(1, WORK_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
        return scaleRegion(bitmap, 0, 0, bitmap.width, bitmap.height, bitmap.width * scale, bitmap.height * scale)
      } finally {
        bitmap.close()
      }
    }
    if (naturalW * naturalH > MAX_DECODE_PIXELS) throw new ImagePrepError(TOO_BIG_ERROR)
    const scale = Math.min(1, WORK_MAX_SIDE / Math.max(naturalW, naturalH))
    const targetW = Math.max(1, Math.round(naturalW * scale))
    const targetH = Math.max(1, Math.round(naturalH * scale))

    if (scale < 1 && typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, {
          imageOrientation: 'from-image',
          resizeWidth: targetW,
          resizeHeight: targetH,
          resizeQuality: 'high',
        })
        try {
          // Proporção diferente = o navegador aplicou resize e orientação em ordens distintas: usa o <img>.
          if (Math.abs(bitmap.width / bitmap.height - targetW / targetH) <= 0.02) {
            return scaleRegion(bitmap, 0, 0, bitmap.width, bitmap.height, bitmap.width, bitmap.height)
          }
        } finally {
          bitmap.close()
        }
      } catch {
        // cai no desenho em passos abaixo
      }
    }
    naturalW = img!.naturalWidth
    naturalH = img!.naturalHeight
    return scaleRegion(img!, 0, 0, naturalW, naturalH, targetW, targetH)
  } finally {
    URL.revokeObjectURL(url)
    // Libera o decodificador da imagem grande o quanto antes.
    if (img) img.src = ''
  }
}

// ---------------------------------------------------------------------------
// Análise: transparência, fundo, recorte automático
// ---------------------------------------------------------------------------

interface Analysis {
  hasAlpha: boolean
  whiteBackground: boolean
  trim: Box | null
}

const ANALYSIS_SIDE = 768
const COLOR_TOLERANCE = 32
const ALPHA_THRESHOLD = 24

function analyze(work: HTMLCanvasElement): Analysis {
  const W = work.width
  const H = work.height
  const scale = Math.min(1, ANALYSIS_SIDE / Math.max(W, H))
  const small = scaleRegion(work, 0, 0, W, H, W * scale, H * scale)
  const w = small.width
  const h = small.height
  const data = context(small).getImageData(0, 0, w, h).data
  release(small)

  let translucent = 0
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 250) translucent++
  const hasAlpha = translucent / (w * h) > 0.0005

  let isForeground: (index: number) => boolean
  let whiteBackground = false
  if (hasAlpha) {
    isForeground = i => data[i + 3]! > ALPHA_THRESHOLD
  } else {
    // Cor dominante da borda (balde de 8 níveis por canal).
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
    let total = 0
    const sample = (x: number, y: number) => {
      const i = (y * w + x) * 4
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
      bucket.n++
      bucket.r += r
      bucket.g += g
      bucket.b += b
      buckets.set(key, bucket)
      total++
    }
    for (let x = 0; x < w; x++) {
      sample(x, 0)
      sample(x, h - 1)
    }
    for (let y = 1; y < h - 1; y++) {
      sample(0, y)
      sample(w - 1, y)
    }
    let best: { n: number; r: number; g: number; b: number } | null = null
    for (const bucket of buckets.values()) if (!best || bucket.n > best.n) best = bucket
    if (!best || best.n / total < 0.9) return { hasAlpha, whiteBackground: false, trim: null }
    const br = best.r / best.n
    const bg = best.g / best.n
    const bb = best.b / best.n
    whiteBackground = br >= 235 && bg >= 235 && bb >= 235
    isForeground = i =>
      Math.max(Math.abs(data[i]! - br), Math.abs(data[i + 1]! - bg), Math.abs(data[i + 2]! - bb)) > COLOR_TOLERANCE
  }

  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isForeground((y * w + x) * 4)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { hasAlpha, whiteBackground, trim: null }
  const sx = W / w
  const sy = H / h
  let x0 = minX * sx
  let y0 = minY * sy
  let x1 = (maxX + 1) * sx
  let y1 = (maxY + 1) * sy
  // Folga pequena (2% do maior lado do conteúdo) para não encostar no desenho.
  const pad = Math.max(2, Math.max(x1 - x0, y1 - y0) * 0.02)
  x0 = Math.max(0, x0 - pad)
  y0 = Math.max(0, y0 - pad)
  x1 = Math.min(W, x1 + pad)
  y1 = Math.min(H, y1 + pad)
  const box = { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - x0), h: Math.ceil(y1 - y0) }
  if ((box.w * box.h) / (W * H) >= 0.98) return { hasAlpha, whiteBackground, trim: null }
  return { hasAlpha, whiteBackground, trim: box }
}

/**
 * Abre o arquivo. No ícone a imagem vai para um quadrado com margem
 * transparente, para o recorte 1:1 nunca cortar o símbolo.
 */
export async function loadSource(file: File, kind: BrandKind): Promise<PreparedSource> {
  let work: HTMLCanvasElement
  try {
    work = isSvgFile(file) ? await rasterizeSvg(file) : await rasterizeBitmap(file)
  } catch (error) {
    if (error instanceof ImagePrepError) throw error
    throw new ImagePrepError(DECODE_ERROR)
  }
  let display: HTMLCanvasElement
  let analysis: Analysis
  let trimBox: Box | null
  try {
    analysis = analyze(work)
    trimBox = analysis.trim
    if (kind === 'icon' && work.width !== work.height) {
      const side = Math.max(work.width, work.height)
      const offX = Math.round((side - work.width) / 2)
      const offY = Math.round((side - work.height) / 2)
      const square = makeCanvas(side, side)
      context(square).drawImage(work, offX, offY)
      release(work)
      work = square
      if (trimBox) trimBox = { ...trimBox, x: trimBox.x + offX, y: trimBox.y + offY }
    }
    const dScale = Math.min(1, 1600 / Math.max(work.width, work.height))
    display = scaleRegion(work, 0, 0, work.width, work.height, work.width * dScale, work.height * dScale)
  } catch {
    release(work) // não vaza o canvas grande se algo falhar no meio
    throw new ImagePrepError(DECODE_ERROR)
  }
  const shown = display
  const kept = work
  return {
    work: kept,
    display: shown,
    width: work.width,
    height: work.height,
    hasAlpha: analysis.hasAlpha,
    whiteBackground: analysis.whiteBackground,
    trimBox,
    close() {
      release(kept)
      release(shown)
    },
  }
}

// ---------------------------------------------------------------------------
// Fundo branco
// ---------------------------------------------------------------------------

/** Torna transparente o branco ligado às bordas (flood-fill); o branco dentro do desenho fica. */
export function removeWhiteBackground(canvas: HTMLCanvasElement, tolerance = 36): void {
  const w = canvas.width
  const h = canvas.height
  const ctx = context(canvas)
  const image = ctx.getImageData(0, 0, w, h)
  const d = image.data
  const isBackground = (p: number) => {
    const i = p * 4
    return d[i + 3]! === 0 || (255 - d[i]! <= tolerance && 255 - d[i + 1]! <= tolerance && 255 - d[i + 2]! <= tolerance)
  }
  const removed = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  let top = 0
  const push = (p: number) => {
    if (removed[p] || !isBackground(p)) return
    removed[p] = 1
    stack[top++] = p
  }
  for (let x = 0; x < w; x++) {
    push(x)
    push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    push(y * w)
    push(y * w + w - 1)
  }
  while (top > 0) {
    const p = stack[--top]!
    const x = p % w
    if (x > 0) push(p - 1)
    if (x < w - 1) push(p + 1)
    if (p >= w) push(p - w)
    if (p < w * (h - 1)) push(p + w)
  }
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    if (removed[p]) {
      d[i + 3] = 0
      continue
    }
    // Borda suavizada: pixel claro vizinho do fundo vira meio transparente (sem halo branco).
    const x = p % w
    const next =
      (x > 0 && removed[p - 1]) ||
      (x < w - 1 && removed[p + 1]) ||
      (p >= w && removed[p - w]) ||
      (p < w * (h - 1) && removed[p + w])
    if (!next) continue
    const m = Math.min(d[i]!, d[i + 1]!, d[i + 2]!)
    if (m < 170) continue
    const t = Math.min(1, (m - 170) / 85)
    if (1 - t > 0.08) {
      for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c]! - 255 * t) / (1 - t))))
    }
    d[i + 3] = Math.round(d[i + 3]! * (1 - t))
  }
  ctx.putImageData(image, 0, 0)
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

export interface RenderOptions {
  box: Box
  kind: BrandKind
  removeWhite: boolean
  /** Para prévias: teto do maior lado (a saída final não usa). */
  maxSide?: number
}

/** Lado maior da saída para uma caixa de recorte: reduz acima de 2048 e amplia abaixo de 512. */
export function outputSize(box: Box, kind: BrandKind, maxSide?: number): { width: number; height: number } {
  if (kind === 'icon') {
    const side = maxSide ? Math.min(ICON_SIZE, maxSide) : ICON_SIZE
    return { width: side, height: side }
  }
  const longest = Math.max(box.w, box.h)
  let scale = longest < LOGO_MIN_SIDE ? LOGO_MIN_SIDE / longest : Math.min(1, LOGO_MAX_SIDE / longest)
  if (maxSide) scale = Math.min(scale, maxSide / longest)
  return { width: Math.max(1, Math.round(box.w * scale)), height: Math.max(1, Math.round(box.h * scale)) }
}

export function isTooSmall(box: Box): boolean {
  return Math.max(box.w, box.h) < LOGO_MIN_SIDE
}

export function renderOutput(source: PreparedSource, options: RenderOptions): HTMLCanvasElement {
  const { box, kind, removeWhite, maxSide } = options
  const { width, height } = outputSize(box, kind, maxSide)
  const sx = Math.max(0, Math.min(source.width - 1, Math.round(box.x)))
  const sy = Math.max(0, Math.min(source.height - 1, Math.round(box.y)))
  const sw = Math.max(1, Math.min(source.width - sx, Math.round(box.w)))
  const sh = Math.max(1, Math.min(source.height - sy, Math.round(box.h)))
  const canvas = scaleRegion(source.work, sx, sy, sw, sh, width, height)
  if (removeWhite) removeWhiteBackground(canvas)
  return canvas
}

export interface EncodedImage {
  blob: Blob
  width: number
  height: number
  /** `image/png` ou `image/webp` (quando o PNG passa do limite). */
  type: string
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

/**
 * PNG; se passar de `BRAND_LOGO_MAX_BYTES`, WebP 0,92; se ainda passar, reduz
 * (1600, 1280, 1024, 768 px) e repete. Só falha se nem assim couber.
 */
export async function encodeOutput(canvas: HTMLCanvasElement, kind: BrandKind): Promise<EncodedImage> {
  const attempts: Array<number | null> = [null, 1600, 1280, 1024, 768, 512]
  for (const side of attempts) {
    let current = canvas
    let owned = false
    if (side !== null) {
      const longest = Math.max(canvas.width, canvas.height)
      if (side >= longest) continue
      const factor = side / longest
      current = scaleRegion(canvas, 0, 0, canvas.width, canvas.height, canvas.width * factor, canvas.height * factor)
      owned = true
    }
    try {
      const png = await toBlob(current, 'image/png')
      if (png && png.size <= BRAND_LOGO_MAX_BYTES) {
        return { blob: png, width: current.width, height: current.height, type: 'image/png' }
      }
      const webp = await toBlob(current, 'image/webp', 0.92)
      if (webp && webp.type === 'image/webp' && webp.size <= BRAND_LOGO_MAX_BYTES) {
        return { blob: webp, width: current.width, height: current.height, type: 'image/webp' }
      }
    } finally {
      if (owned) release(current)
    }
  }
  void kind
  throw new ImagePrepError('Não conseguimos reduzir esta imagem o bastante. Tente recortar uma área menor.')
}

export function encodedToFile(encoded: EncodedImage, kind: BrandKind): File {
  const base = kind === 'logo' ? 'logo' : 'icone'
  const extension = encoded.type === 'image/webp' ? 'webp' : 'png'
  return new File([encoded.blob], `${base}.${extension}`, { type: encoded.type })
}

/** Arquivo original ainda serve como último recurso (o servidor às vezes lê o que o navegador não abre). */
export function canSendOriginal(file: File): boolean {
  return file.size > 0 && file.size <= BRAND_LOGO_MAX_BYTES && ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
}

export interface SilhouetteInfo {
  /** Há transparência "de verdade" (≥ 0,5% dos pixels com alpha < 250) — mesmo critério do servidor. */
  transparent: boolean
  /** Fração de pixels opacos dentro da caixa do conteúdo (alpha ≥ 16). */
  coverage: number
  /** Silhueta branca só para logos de traço/escrita: transparente e cobertura ≤ 55%. */
  useSilhouette: boolean
}

/**
 * Mesma regra do servidor para `logoLight`: decide se a carteirinha mostra a
 * silhueta branca ou a logo colorida sobre uma plaquinha branca.
 */
export function silhouetteInfo(canvas: HTMLCanvasElement): SilhouetteInfo {
  const w = canvas.width
  const h = canvas.height
  const data = context(canvas).getImageData(0, 0, w, h).data
  let translucent = 0
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3]!
      if (a < 250) translucent++
      if (a >= 16) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const transparent = translucent / (w * h) >= 0.005
  if (maxX < 0) return { transparent, coverage: 0, useSilhouette: false }
  let opaque = 0
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) if (data[(y * w + x) * 4 + 3]! >= 128) opaque++
  }
  const coverage = opaque / ((maxX - minX + 1) * (maxY - minY + 1))
  return { transparent, coverage, useSilhouette: transparent && coverage <= SILHOUETTE_MAX_COVERAGE }
}

/** Versão branca da imagem (mantém só o formato/alpha) — carteirinha sobre a cor do clube. */
export function whiteSilhouette(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = makeCanvas(canvas.width, canvas.height)
  const ctx = context(out)
  ctx.drawImage(canvas, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  return out
}
