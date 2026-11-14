'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import QRCode from 'qrcode'
import { CircleAlert, CircleCheckBig, Clock, Copy, ExternalLink, FileUp, LoaderCircle, Upload } from 'lucide-react'
import { toast } from 'sonner'
import type { ClubReceivingAccount, ManagedAccountDocument } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { formatDateTimeBR } from '@/lib/adapters/faturamento'
import { cn } from '@/lib/utils'
import { MANAGED_DOCUMENT_ACCEPT, uploadManagedDocument } from './managed-document-upload'

export const TONE = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  warn: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  bad: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
  muted: 'border-border bg-muted text-muted-foreground',
} as const

const RESPONSIBLE_ROLE: Record<string, string> = {
  DIRECTOR: 'diretor(a)',
  PARTNER: 'sócio(a)',
  MEI: 'titular MEI',
  ASSOCIATION: 'associação',
  LIMITED_COMPANY: 'empresa',
  INDIVIDUAL_COMPANY: 'empresário(a) individual',
  ASAAS_ACCOUNT_OWNER: 'titular da conta',
  BANK_ACCOUNT_OWNER: 'titular da conta bancária',
}

function statusTone(doc: ManagedAccountDocument): string {
  if (doc.status === 'APPROVED') return TONE.ok
  if (doc.status === 'REJECTED') return TONE.bad
  if (doc.status === 'IGNORED') return TONE.muted
  return TONE.warn
}

function LinkPanel({
  doc,
  who,
  busy,
  onRefresh,
}: {
  doc: ManagedAccountDocument
  who: string
  busy: boolean
  onRefresh: () => void
}) {
  const url = doc.onboardingUrl
  const [qr, setQr] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!url) return
    let cancelled = false
    QRCode.toDataURL(url, { margin: 1, width: 192 })
      .then(data => {
        if (!cancelled) setQr(data)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  if (!url) return null
  const expiresAt = doc.onboardingUrlExpiresAt ? new Date(doc.onboardingUrlExpiresAt).getTime() : null
  const expired = expiresAt !== null && expiresAt <= now

  async function copy() {
    try {
      await navigator.clipboard.writeText(url!)
      toast.success('Link copiado')
    } catch {
      toast.error('Não foi possível copiar o link')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        O parceiro de pagamentos exige que {who} faça este envio pelo link seguro, com reconhecimento facial. Abra no
        celular dele(a).
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {!expired && qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qr}
            alt="QR code do link seguro de envio"
            width={144}
            height={144}
            className="h-36 w-36 shrink-0 rounded-lg border border-border bg-white p-1"
          />
        )}
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            {!expired && (
              <Button asChild size="sm" className="gap-1.5">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir link seguro
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
              </Button>
            )}
            {!expired && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void copy()}>
                <Copy className="h-3.5 w-3.5" />
                Copiar link
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onRefresh} disabled={busy}>
              {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
              Já enviei — atualizar situação
            </Button>
          </div>
          {doc.onboardingUrlExpiresAt && (
            <p className={cn('text-xs', expired ? 'text-destructive' : 'text-muted-foreground')}>
              {expired
                ? 'Este link expirou. Clique em "Atualizar situação" para gerar um novo.'
                : `Link válido até ${formatDateTimeBR(doc.onboardingUrlExpiresAt)}`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function UploadZone({
  tenantSlug,
  doc,
  onUpdate,
  onRefresh,
}: {
  tenantSlug: string
  doc: ManagedAccountDocument
  onUpdate: (account: ClubReceivingAccount) => void
  onRefresh: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  async function send(file: File | undefined) {
    if (!file || uploading) return
    setError(null)
    setUploading(true)
    setProgress(0)
    const result = await uploadManagedDocument({ tenantSlug, groupId: doc.id, file, onProgress: setProgress })
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
    if (result.ok) {
      onUpdate(result.data)
      toast.success('Documento enviado. Agora é com o parceiro de pagamentos.')
      return
    }
    setError(result.error.message)
    if (result.error.code === 'MANAGED_DOCUMENT_LINK_ONLY' || result.error.code === 'MANAGED_DOCUMENT_NOT_PENDING') {
      onRefresh()
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    void send(event.dataTransfer.files?.[0])
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={event => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border border-dashed px-3 py-5 text-center transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-muted/20',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={MANAGED_DOCUMENT_ACCEPT}
          className="sr-only"
          aria-label={`Escolher arquivo para ${doc.title}`}
          onChange={event => void send(event.target.files?.[0])}
          disabled={uploading}
        />
        <Button size="sm" className="gap-1.5" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? 'Enviando…' : 'Escolher arquivo'}
        </Button>
        <p className="text-xs text-muted-foreground">ou arraste o arquivo para cá</p>
        <p className="text-xs text-muted-foreground">PDF, JPG ou PNG até 10 MB. Frente e verso no mesmo arquivo.</p>
        {uploading && (
          <div className="w-full max-w-xs space-y-1" role="status" aria-live="polite">
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">{progress}%</p>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

export function ManagedDocumentCard({
  tenantSlug,
  doc,
  generalRejectReasons,
  refreshing,
  onUpdate,
  onRefresh,
}: {
  tenantSlug: string
  doc: ManagedAccountDocument
  generalRejectReasons: string | null
  refreshing: boolean
  onUpdate: (account: ClubReceivingAccount) => void
  onRefresh: () => void
}) {
  const role = doc.responsibleType ? RESPONSIBLE_ROLE[doc.responsibleType] : undefined
  const who = doc.responsibleName ?? 'o responsável'
  const ignored = doc.status === 'IGNORED'
  const rejected = doc.status === 'REJECTED'
  const reason = doc.rejectReason ?? generalRejectReasons

  return (
    <li className={cn('space-y-3 rounded-lg border border-border p-3 sm:p-4', ignored && 'opacity-60')}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          {doc.status === 'APPROVED' ? (
            <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : doc.status === 'PENDING' ? (
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          ) : (
            <FileUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{doc.title}</p>
            {doc.description && <p className="text-xs text-muted-foreground">{doc.description}</p>}
            {doc.responsibleName && (
              <p className="text-xs text-muted-foreground">
                Responsável: {doc.responsibleName}
                {role ? ` (${role})` : ''}
              </p>
            )}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex w-fit shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
            statusTone(doc),
          )}
        >
          {ignored ? 'Não exigido' : doc.statusLabel}
        </span>
      </div>

      {rejected && reason && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>Motivo da recusa:</strong> {reason}
          </span>
        </p>
      )}

      {doc.status === 'PENDING' && (
        <p className="text-sm text-muted-foreground">
          Em análise pelo parceiro de pagamentos — costuma levar até 48 h. Atualizamos automaticamente.
        </p>
      )}

      {doc.files.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {doc.files.map((file, index) => (
            <li key={file.id} className="flex flex-wrap items-center gap-2">
              <span>Arquivo {index + 1}:</span>
              <span className="font-medium text-foreground">{file.statusLabel}</span>
            </li>
          ))}
        </ul>
      )}

      {doc.uploadMethod === 'api' && doc.canUpload && (
        <UploadZone tenantSlug={tenantSlug} doc={doc} onUpdate={onUpdate} onRefresh={onRefresh} />
      )}
      {doc.uploadMethod === 'link' && <LinkPanel doc={doc} who={who} busy={refreshing} onRefresh={onRefresh} />}
    </li>
  )
}
