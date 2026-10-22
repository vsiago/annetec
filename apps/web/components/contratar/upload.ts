'use client'

import {
  BRAND_LOGO_MAX_BYTES,
  BRAND_LOGO_MIME_TYPES,
  KYB_ACCEPTED_MIME_TYPES,
  KYB_MAX_FILE_BYTES,
  type KybDocumentKind,
  type OnboardingApplicantView,
  type UploadedFile,
} from '@annetec/contracts'
import { formatFileSize, type UploadTarget } from '@/lib/adapters/contratacao'

/**
 * Upload da contratação com barra de progresso: XHR para o proxy
 * `/api/contratar/<id>/upload?tipo=…&chave=…`, que repassa à API. Tipo e
 * tamanho são conferidos AQUI antes de enviar (a API confere de novo, pelos
 * bytes do arquivo).
 */

const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/** Alguns navegadores deixam `file.type` vazio — cai na extensão. */
function mimeOf(file: File): string {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_MIME[extension] ?? ''
}

/** `null` = pode enviar; senão, a frase do problema. */
export function checkUploadFile(file: File, target: UploadTarget): string | null {
  const mime = mimeOf(file)
  if (target === 'logo') {
    if (!(BRAND_LOGO_MIME_TYPES as readonly string[]).includes(mime)) {
      return 'O logo precisa ser PNG ou JPEG (SVG não é aceito por segurança).'
    }
    if (file.size > BRAND_LOGO_MAX_BYTES) {
      return `O logo tem ${formatFileSize(file.size)}. O limite é ${formatFileSize(BRAND_LOGO_MAX_BYTES)} — exporte em tamanho menor.`
    }
    return null
  }
  if (!(KYB_ACCEPTED_MIME_TYPES as readonly string[]).includes(mime)) {
    return 'Envie o documento em PDF, JPEG ou PNG.'
  }
  if (file.size === 0) return 'O arquivo está vazio.'
  if (file.size > KYB_MAX_FILE_BYTES) {
    return `O arquivo tem ${formatFileSize(file.size)}. O limite é ${formatFileSize(KYB_MAX_FILE_BYTES)} — reduza a resolução da digitalização ou divida o PDF.`
  }
  return null
}

export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'
export const LOGO_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg'

type Envelope<T> = { success: true; data: T } | { success: false; error: { message: string; code?: string } }

export type UploadOutcome<T> = { ok: true; data: T } | { ok: false; error: string }

function send<T>(url: string, body: FormData, onProgress: (percent: number) => void): Promise<UploadOutcome<T>> {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.responseType = 'text'
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.onload = () => {
      let payload: Envelope<T> | null = null
      try {
        payload = JSON.parse(xhr.responseText) as Envelope<T>
      } catch {
        payload = null
      }
      if (payload && payload.success) {
        onProgress(100)
        resolve({ ok: true, data: payload.data })
        return
      }
      if (payload && !payload.success) {
        resolve({ ok: false, error: payload.error.message })
        return
      }
      resolve({
        ok: false,
        error:
          xhr.status === 413
            ? 'O arquivo passou do limite de tamanho aceito.'
            : `O envio falhou (código ${xhr.status || 'sem resposta'}). Tente novamente.`,
      })
    }
    xhr.onerror = () => resolve({ ok: false, error: 'A conexão caiu durante o envio. Verifique a internet e tente de novo.' })
    xhr.ontimeout = () => resolve({ ok: false, error: 'O envio demorou demais. Tente novamente.' })
    xhr.timeout = 120_000
    xhr.send(body)
  })
}

function uploadUrl(proposalId: string, chave: string, tipo: UploadTarget): string {
  const params = new URLSearchParams({ tipo, chave })
  return `/api/contratar/${encodeURIComponent(proposalId)}/upload?${params.toString()}`
}

export function uploadKybDocument(input: {
  proposalId: string
  chave: string
  file: File
  kind: KybDocumentKind
  personId?: string | null
  onProgress: (percent: number) => void
}): Promise<UploadOutcome<OnboardingApplicantView>> {
  const problem = checkUploadFile(input.file, 'documento')
  if (problem) return Promise.resolve({ ok: false, error: problem })
  const body = new FormData()
  body.append('file', input.file, input.file.name)
  body.append('kind', input.kind)
  if (input.personId) body.append('personId', input.personId)
  return send<OnboardingApplicantView>(uploadUrl(input.proposalId, input.chave, 'documento'), body, input.onProgress)
}

export function uploadBrandLogo(input: {
  proposalId: string
  chave: string
  file: File
  onProgress: (percent: number) => void
}): Promise<UploadOutcome<UploadedFile>> {
  const problem = checkUploadFile(input.file, 'logo')
  if (problem) return Promise.resolve({ ok: false, error: problem })
  const body = new FormData()
  body.append('file', input.file, input.file.name)
  return send<UploadedFile>(uploadUrl(input.proposalId, input.chave, 'logo'), body, input.onProgress)
}

export function documentFileUrl(proposalId: string, chave: string, documentId: string): string {
  return `/api/contratar/${encodeURIComponent(proposalId)}/arquivo/${encodeURIComponent(documentId)}?chave=${encodeURIComponent(chave)}`
}
