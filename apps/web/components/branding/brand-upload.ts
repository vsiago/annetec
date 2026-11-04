import { BRAND_LOGO_MAX_BYTES, BRAND_LOGO_MIME_TYPES, type LogoUploadResult } from '@annetec/contracts'
import { formatFileSize } from '@/lib/adapters/contratacao'

/**
 * Envio de logo/ícone do clube, lado do navegador. As telas (admin do clube,
 * console da plataforma, cadastro de clube) usam as mesmas funções; só muda a
 * URL do proxy (`/api/clube/<slug>/marca/<tipo>` ou
 * `/api/plataforma/clubes/<id>/marca/<tipo>`). Os proxies existem porque
 * server action tem teto de corpo de 1 MB e não dá progresso de envio.
 */

export type BrandKind = 'logo' | 'icon'

/** Segmento `tipo` das rotas (a API usa `logo` e `icone`). */
export const BRAND_KIND_SEGMENT: Record<BrandKind, string> = { logo: 'logo', icon: 'icone' }

/** Aceita qualquer imagem: o navegador a abre, recorta e converte para PNG antes de enviar. */
export const BRAND_ACCEPT = 'image/*,.png,.jpg,.jpeg,.webp,.svg,.gif,.avif,.bmp'

export const BRAND_FORMATS_LABEL = 'PNG, JPG, WebP ou SVG'

/** Textos de orientação (envio de logo e de ícone), iguais em todas as telas. */
export const LOGO_GUIDANCE = {
  lead: 'Envie um arquivo só: você ajusta o recorte e a gente adapta os tamanhos para o site, a carteirinha, os e-mails e os aplicativos.',
  detail: `${BRAND_FORMATS_LABEL}, de qualquer tamanho — a gente reduz e adapta. Melhor com fundo transparente.`,
} as const

export const ICON_GUIDANCE = {
  lead: 'Opcional. Só o símbolo da marca, de preferência quadrado. Aparece no ícone do app no celular, na aba do navegador e no menu recolhido. Sem ícone, usamos a logo. Você recorta em quadrado antes de enviar.',
  detail: `${BRAND_FORMATS_LABEL}, de qualquer tamanho — a gente reduz e adapta.`,
} as const

export type UploadOutcome<T> = { ok: true; data: T } | { ok: false; error: string }

const EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

/** Alguns navegadores deixam `file.type` vazio — cai na extensão. */
export function brandMimeOf(file: File): string {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_MIME[extension] ?? ''
}

/**
 * Arquivo ESCOLHIDO pelo usuário: aceita qualquer imagem, de qualquer tamanho
 * (o navegador reduz antes de enviar). Só barra o que claramente não é imagem.
 */
export function checkPickedImage(file: File): string | null {
  if (file.size === 0) return 'O arquivo está vazio.'
  const mime = brandMimeOf(file)
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const known = ['gif', 'avif', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'heif', 'jfif']
  if (!mime.startsWith('image/') && !known.includes(extension)) {
    return `Envie uma imagem: ${BRAND_FORMATS_LABEL}.`
  }
  return null
}

/** Confere o arquivo que VAI para a API (já processado no navegador): tipo e teto de 5 MB. */
export function checkBrandImage(file: File, kind: BrandKind = 'logo'): string | null {
  const noun = kind === 'logo' ? 'A logo' : 'O ícone'
  if (!(BRAND_LOGO_MIME_TYPES as readonly string[]).includes(brandMimeOf(file))) {
    return `${noun} precisa ser ${BRAND_FORMATS_LABEL}.`
  }
  if (file.size === 0) return 'O arquivo está vazio.'
  if (file.size > BRAND_LOGO_MAX_BYTES) {
    return `${noun} tem ${formatFileSize(file.size)}. O limite é ${formatFileSize(BRAND_LOGO_MAX_BYTES)} — exporte em tamanho menor.`
  }
  return null
}

export function clubBrandUrl(tenantSlug: string, kind: BrandKind): string {
  return `/api/clube/${encodeURIComponent(tenantSlug)}/marca/${BRAND_KIND_SEGMENT[kind]}`
}

export function platformBrandUrl(tenantId: string, kind: BrandKind): string {
  return `/api/plataforma/clubes/${encodeURIComponent(tenantId)}/marca/${BRAND_KIND_SEGMENT[kind]}`
}

type Envelope<T> = { success: true; data: T } | { success: false; error: { message: string } }

function parseEnvelope<T>(text: string): Envelope<T> | null {
  try {
    return JSON.parse(text) as Envelope<T>
  } catch {
    return null
  }
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'Sua sessão expirou. Entre de novo para continuar.'
  if (status === 403) return 'Você não tem permissão para alterar a marca deste clube.'
  if (status === 413) return 'O arquivo passou do limite de tamanho aceito.'
  return `O envio falhou (código ${status || 'sem resposta'}). Tente novamente.`
}

/** POST multipart (campo `file`) com progresso. Devolve o resultado da API ou a frase do erro. */
export function uploadBrandFile(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<UploadOutcome<LogoUploadResult>> {
  const problem = checkBrandImage(file)
  if (problem) return Promise.resolve({ ok: false, error: problem })
  const body = new FormData()
  body.append('file', file, file.name)

  return new Promise(resolve => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.responseType = 'text'
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.onload = () => {
      const payload = parseEnvelope<LogoUploadResult>(xhr.responseText)
      if (payload?.success) {
        onProgress(100)
        resolve({ ok: true, data: payload.data })
        return
      }
      resolve({ ok: false, error: payload && !payload.success ? payload.error.message : fallbackMessage(xhr.status) })
    }
    xhr.onerror = () => resolve({ ok: false, error: 'A conexão caiu durante o envio. Verifique a internet e tente de novo.' })
    xhr.ontimeout = () => resolve({ ok: false, error: 'O envio demorou demais. Tente novamente.' })
    xhr.timeout = 120_000
    xhr.send(body)
  })
}

/** DELETE do logo/ícone; a API devolve `{ branding }`. */
export async function deleteBrandFile(url: string): Promise<UploadOutcome<{ branding: LogoUploadResult['branding'] }>> {
  try {
    const response = await fetch(url, { method: 'DELETE', headers: { accept: 'application/json' } })
    const payload = parseEnvelope<{ branding: LogoUploadResult['branding'] }>(await response.text())
    if (payload?.success) return { ok: true, data: payload.data }
    return { ok: false, error: payload && !payload.success ? payload.error.message : fallbackMessage(response.status) }
  } catch {
    return { ok: false, error: 'A conexão caiu. Verifique a internet e tente de novo.' }
  }
}
