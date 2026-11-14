'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import QRCode from 'qrcode'
import { Check, CircleAlert, Copy, ExternalLink, FileText, QrCode, Upload } from 'lucide-react'
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

function statusBadge(doc: ManagedAccountDocument): { text: string; tone: string } {
  if (doc.status === 'APPROVED') return { text: 'Aprovado', tone: TONE.ok }
  if (doc.status === 'REJECTED') return { text: 'Recusado', tone: TONE.bad }
  if (doc.status === 'IGNORED') return { text: 'Não exigido', tone: TONE.muted }
  if (doc.status === 'PENDING') return { text: 'Em análise', tone: TONE.warn }
  return { text: doc.statusLabel, tone: TONE.muted }
}

/** QR e validade do link seguro (a validade é reavaliada a cada 30 s). */
function useSecureLink(doc: ManagedAccountDocument) {
  const url = doc.uploadMethod === 'link' ? doc.onboardingUrl : null
  const [qr, setQr] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!url) return
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [url])

  useEffect(() => {
    if (!url) return
    let cancelled = false
    QRCode.toDataURL(url, { margin: 1, width: 320 })
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

  const expiresAt = doc.onboardingUrlExpiresAt ? new Date(doc.onboardingUrlExpiresAt).getTime() : null
  const expired = expiresAt !== null && expiresAt <= now
  return { url, qr, expired }
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
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const link = useSecureLink(doc)

  const ignored = doc.status === 'IGNORED'
  const rejected = doc.status === 'REJECTED'
  const approved = doc.status === 'APPROVED'
  const pending = doc.status === 'PENDING'
  const isLink = doc.uploadMethod === 'link' && !!link.url && !ignored && !approved && !pending
  const canSend = doc.uploadMethod === 'api' && doc.canUpload
  const badge = statusBadge(doc)
  const reason = doc.rejectReason ?? generalRejectReasons ?? 'Reenvie um arquivo nítido e completo.'
  const role = doc.responsibleType ? RESPONSIBLE_ROLE[doc.responsibleType] : undefined
  const who = doc.responsibleName ?? role ?? null

  const metaParts: string[] = []
  if (approved) {
    metaParts.push('Aprovado')
  } else if (pending) {
    metaParts.push('Enviado', 'análise em até 48 h')
  } else {
    if (who) metaParts.push(`Quem envia: ${who}`)
    if (isLink) metaParts.push('pelo link seguro, com reconhecimento facial')
    else if (canSend) metaParts.push('PDF, JPG ou PNG', 'até 10 MB')
  }

  async function send(file: File | undefined) {
    if (!file || uploading) return
    setError(null)
    setUploading(true)
    setProgress(0)
    setFileName(file.name)
    const result = await uploadManagedDocument({ tenantSlug, groupId: doc.id, file, onProgress: setProgress })
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
    if (result.ok) {
      onUpdate(result.data)
      toast.success('Documento enviado')
      return
    }
    setError(result.error.message)
    if (result.error.code === 'MANAGED_DOCUMENT_LINK_ONLY' || result.error.code === 'MANAGED_DOCUMENT_NOT_PENDING') {
      onRefresh()
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url!)
      toast.success('Link copiado')
    } catch {
      toast.error('Não foi possível copiar o link')
    }
  }

  const dropHandlers = canSend
    ? {
        onDragOver: (event: DragEvent<HTMLLIElement>) => {
          event.preventDefault()
          if (!uploading) setDragging(true)
        },
        onDragLeave: (event: DragEvent<HTMLLIElement>) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        },
        onDrop: (event: DragEvent<HTMLLIElement>) => {
          event.preventDefault()
          setDragging(false)
          void send(event.dataTransfer.files?.[0])
        },
      }
    : {}

  return (
    <li
      role="group"
      aria-label={doc.title}
      {...dropHandlers}
      className={cn(
        'relative rounded-lg border p-3 transition-colors sm:px-4',
        dragging ? 'border-dashed border-primary bg-primary/5' : 'border-border',
        ignored && 'opacity-60',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-semibold text-foreground">{doc.title}</p>
            {doc.type === 'CUSTOM' && doc.description && (
              <p className="text-xs text-muted-foreground">{doc.description}</p>
            )}
            {metaParts.length > 0 && <p className="text-xs text-muted-foreground">{metaParts.join(' · ')}</p>}
            {rejected && (
              <p role="alert" className="text-xs text-destructive">
                Motivo: {reason}
              </p>
            )}
            {error && (
              <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
            {isLink && link.expired && (
              <p className="text-xs text-destructive">Link expirado — clique em Atualizar situação</p>
            )}
            {isLink && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
              >
                Já enviei, atualizar
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
          {!uploading && (
            <span
              className={cn(
                'inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                badge.tone,
              )}
            >
              {approved && <Check className="h-3 w-3" aria-hidden />}
              {badge.text}
            </span>
          )}

          {canSend && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={MANAGED_DOCUMENT_ACCEPT}
                className="sr-only"
                aria-label={`Escolher arquivo para ${doc.title}`}
                onChange={event => void send(event.target.files?.[0])}
                disabled={uploading}
              />
              {uploading ? (
                <div className="w-full min-w-0 space-y-1 sm:w-48" role="status" aria-live="polite">
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`Envio de ${doc.title}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                  >
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    Enviando… {progress}% · {fileName}
                  </p>
                </div>
              ) : (
                <>
                  <span className="hidden text-xs text-muted-foreground/70 lg:inline">ou arraste para cá</span>
                  <Button
                    size="sm"
                    className={cn('gap-1.5', !rejected && 'max-sm:flex-1')}
                    onClick={() => inputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {rejected ? 'Reenviar' : 'Enviar arquivo'}
                  </Button>
                </>
              )}
            </>
          )}

          {isLink && !link.expired && (
            <div className="flex items-center gap-2">
              <Button asChild size="sm" className="gap-1.5">
                <a href={link.url!} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir link seguro
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                aria-expanded={qrOpen}
                onClick={() => setQrOpen(open => !open)}
              >
                <QrCode className="h-3.5 w-3.5" />
                QR code
              </Button>
            </div>
          )}
        </div>
      </div>

      {isLink && !link.expired && qrOpen && (
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3">
          {link.qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={link.qr}
              alt="QR code do link seguro de envio"
              width={160}
              height={160}
              className="h-40 w-40 shrink-0 rounded-lg border border-border bg-white p-1"
            />
          )}
          <div className="space-y-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void copy()}>
              <Copy className="h-3.5 w-3.5" />
              Copiar link
            </Button>
            {doc.onboardingUrlExpiresAt && (
              <p className="text-xs text-muted-foreground">Válido até {formatDateTimeBR(doc.onboardingUrlExpiresAt)}</p>
            )}
          </div>
        </div>
      )}

      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-background/80 text-sm font-medium text-primary"
        >
          Solte para enviar
        </div>
      )}
    </li>
  )
}
