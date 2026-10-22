import {
  BRAND_LOGO_MAX_BYTES,
  BRAND_LOGO_MIME_TYPES,
  KYB_ACCEPTED_MIME_TYPES,
  KYB_MAX_FILE_BYTES,
} from '@annetec/contracts'

/**
 * Tipo do arquivo pelos PRIMEIROS BYTES (magic bytes), nunca pela extensão
 * nem pelo `Content-Type` que o navegador mandou — um executável renomeado
 * para `.pdf` é recusado. Puro (testado).
 */

export type SniffedType = { mime: 'application/pdf' | 'image/jpeg' | 'image/png'; ext: 'pdf' | 'jpg' | 'png' }

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d] // %PDF-
const JPEG = [0xff, 0xd8, 0xff]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  if (startsWith(bytes, PDF)) return { mime: 'application/pdf', ext: 'pdf' }
  if (startsWith(bytes, PNG)) return { mime: 'image/png', ext: 'png' }
  if (startsWith(bytes, JPEG)) return { mime: 'image/jpeg', ext: 'jpg' }
  return null
}

export type UploadKind = 'kyb_document' | 'brand_logo'

export const UPLOAD_RULES: Record<UploadKind, { maxBytes: number; mimeTypes: readonly string[]; label: string }> = {
  kyb_document: { maxBytes: KYB_MAX_FILE_BYTES, mimeTypes: KYB_ACCEPTED_MIME_TYPES, label: 'PDF, JPEG ou PNG' },
  brand_logo: { maxBytes: BRAND_LOGO_MAX_BYTES, mimeTypes: BRAND_LOGO_MIME_TYPES, label: 'PNG ou JPEG' },
}

export type UploadCheck =
  | { ok: true; type: SniffedType }
  | { ok: false; reason: 'empty' | 'too_large' | 'unsupported_type'; message: string }

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1).replace('.', ',')} MB`
}

/** Tamanho (→ 413) e tipo real (→ 422) de um upload. */
export function checkUpload(kind: UploadKind, bytes: Uint8Array): UploadCheck {
  const rule = UPLOAD_RULES[kind]
  if (bytes.length === 0) return { ok: false, reason: 'empty', message: 'O arquivo está vazio.' }
  if (bytes.length > rule.maxBytes) {
    return { ok: false, reason: 'too_large', message: `O arquivo passa do limite de ${formatMb(rule.maxBytes)}.` }
  }
  const type = sniffFileType(bytes)
  if (!type || !rule.mimeTypes.includes(type.mime)) {
    return { ok: false, reason: 'unsupported_type', message: `Formato não aceito: envie ${rule.label}.` }
  }
  return { ok: true, type }
}

/**
 * Nome exibido/baixado: sem caminho, sem caracteres de controle, até 120
 * caracteres e com a extensão do tipo REAL.
 */
export function sanitizeFileName(original: string | null | undefined, ext: string, fallback = 'documento'): string {
  const base = String(original ?? '')
    .split(/[\\/]/)
    .pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const withoutExt = base.replace(/\.[A-Za-z0-9]{1,5}$/, '').slice(0, 110).trim()
  return `${withoutExt || fallback}.${ext}`
}

/** `Content-Disposition` com nome ASCII de reserva + UTF-8 (RFC 6266). */
export function contentDisposition(type: 'inline' | 'attachment', fileName: string): string {
  const ascii = fileName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_')
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
