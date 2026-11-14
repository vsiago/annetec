import {
  MANAGED_DOCUMENT_ACCEPTED_EXTENSIONS,
  MANAGED_DOCUMENT_ACCEPTED_MIME_TYPES,
  MANAGED_DOCUMENT_MAX_FILE_BYTES,
  MANAGED_DOCUMENT_UPLOAD_FIELD,
  type ClubReceivingAccount,
} from '@annetec/contracts'

/**
 * Envio de documento da conta gerenciada, lado do navegador: XHR com progresso
 * para o proxy `/api/clube/<slug>/recebimento/documentos/<groupId>`. Tipo e
 * tamanho são conferidos aqui antes de enviar (a API confere de novo).
 */

export const MANAGED_DOCUMENT_ACCEPT = [
  ...MANAGED_DOCUMENT_ACCEPTED_EXTENSIONS,
  ...MANAGED_DOCUMENT_ACCEPTED_MIME_TYPES,
].join(',')

export type ManagedUploadOutcome =
  | { ok: true; data: ClubReceivingAccount }
  | { ok: false; error: { code: string | null; message: string } }

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
export function checkManagedDocumentFile(file: File): string | null {
  const extension = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
  const typeOk = (MANAGED_DOCUMENT_ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeOf(file))
  const extOk = (MANAGED_DOCUMENT_ACCEPTED_EXTENSIONS as readonly string[]).includes(extension)
  if (!typeOk || !extOk) return 'Envie PDF, JPG ou PNG.'
  if (file.size === 0) return 'O arquivo está vazio.'
  if (file.size > MANAGED_DOCUMENT_MAX_FILE_BYTES) return 'O arquivo passa de 10 MB.'
  return null
}

type Envelope =
  | { success: true; data: ClubReceivingAccount }
  | { success: false; error: { message: string; code?: string } }

function fallbackMessage(status: number): string {
  if (status === 401) return 'Sua sessão expirou. Entre de novo para continuar.'
  if (status === 403) return 'Você não tem permissão para enviar documentos deste clube.'
  if (status === 413) return 'O arquivo passa de 10 MB.'
  return `O envio falhou (código ${status || 'sem resposta'}). Tente novamente.`
}

export function uploadManagedDocument(input: {
  tenantSlug: string
  groupId: string
  file: File
  onProgress: (percent: number) => void
}): Promise<ManagedUploadOutcome> {
  const problem = checkManagedDocumentFile(input.file)
  if (problem) return Promise.resolve({ ok: false, error: { code: null, message: problem } })
  const body = new FormData()
  body.append(MANAGED_DOCUMENT_UPLOAD_FIELD, input.file, input.file.name)
  const url = `/api/clube/${encodeURIComponent(input.tenantSlug)}/recebimento/documentos/${encodeURIComponent(input.groupId)}`

  return new Promise(resolve => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.responseType = 'text'
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) input.onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.onload = () => {
      let payload: Envelope | null = null
      try {
        payload = JSON.parse(xhr.responseText) as Envelope
      } catch {
        payload = null
      }
      if (payload?.success) {
        input.onProgress(100)
        resolve({ ok: true, data: payload.data })
        return
      }
      if (payload && !payload.success) {
        resolve({ ok: false, error: { code: payload.error.code ?? null, message: payload.error.message } })
        return
      }
      resolve({ ok: false, error: { code: null, message: fallbackMessage(xhr.status) } })
    }
    xhr.onerror = () =>
      resolve({ ok: false, error: { code: null, message: 'A conexão caiu durante o envio. Verifique a internet e tente de novo.' } })
    xhr.ontimeout = () => resolve({ ok: false, error: { code: null, message: 'O envio demorou demais. Tente novamente.' } })
    xhr.timeout = 120_000
    xhr.send(body)
  })
}
