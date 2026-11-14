'use client'

import {
  CANDIDATURA_ACCEPTED_MIME_TYPES,
  CANDIDATURA_MAX_FILE_BYTES,
  type CandidaturaDocumentoKind,
  type CandidaturaPublica,
} from '@annetec/contracts'
import { formatFileSize } from '@/lib/adapters/contratacao'
import type { Escopo } from './escopo'
import { tenantParam } from './escopo'

/**
 * Upload de documento da candidatura com barra de progresso: XHR para o proxy
 * `/api/seja-parceiro/upload`, que repassa à API. Tipo e tamanho são
 * conferidos aqui antes de enviar (a API confere de novo pelos bytes).
 */

export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

function mimeOf(file: File): string {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_MIME[extension] ?? ''
}

/** `null` = pode enviar; senão, a frase do problema. */
export function checkFile(file: File): string | null {
  if (!(CANDIDATURA_ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeOf(file))) {
    return 'Envie o documento em PDF, JPEG ou PNG.'
  }
  if (file.size === 0) return 'O arquivo está vazio.'
  if (file.size > CANDIDATURA_MAX_FILE_BYTES) {
    return `O arquivo tem ${formatFileSize(file.size)}. O limite é ${formatFileSize(CANDIDATURA_MAX_FILE_BYTES)}.`
  }
  return null
}

type Envelope<T> = { success: true; data: T } | { success: false; error: { message: string; code?: string } }
export type UploadOutcome = { ok: true; data: CandidaturaPublica } | { ok: false; error: string }

export function uploadDocumento(input: {
  escopo: Escopo
  id: string
  chave: string
  file: File
  kind: CandidaturaDocumentoKind
  onProgress: (percent: number) => void
}): Promise<UploadOutcome> {
  const problem = checkFile(input.file)
  if (problem) return Promise.resolve({ ok: false, error: problem })

  const params = new URLSearchParams({ id: input.id, chave: input.chave })
  const tenant = tenantParam(input.escopo)
  if (tenant) params.set('tenant', tenant)

  const body = new FormData()
  body.append('file', input.file, input.file.name)
  body.append('kind', input.kind)

  return new Promise(resolve => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/seja-parceiro/upload?${params.toString()}`)
    xhr.responseType = 'text'
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) input.onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.onload = () => {
      let payload: Envelope<CandidaturaPublica> | null = null
      try {
        payload = JSON.parse(xhr.responseText) as Envelope<CandidaturaPublica>
      } catch {
        payload = null
      }
      if (payload?.success) {
        input.onProgress(100)
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

export function arquivoUrl(escopo: Escopo, id: string, chave: string, docId: string): string {
  const params = new URLSearchParams({ id, chave, docId })
  const tenant = tenantParam(escopo)
  if (tenant) params.set('tenant', tenant)
  return `/api/seja-parceiro/arquivo?${params.toString()}`
}
