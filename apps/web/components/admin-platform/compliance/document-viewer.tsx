'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  ExternalLink,
  FileQuestion,
  Loader2,
  RotateCcw,
} from 'lucide-react'
import {
  KYB_DOCUMENT_KIND_LABELS,
  type KybDocument,
  type OnboardingProposalDetail,
  type PendingRequestItem,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog, Field, Pill, runCommand } from '@/components/admin-platform/billing/console-kit'
import { reviewKybDocumentAction } from '@/lib/actions/platform-onboarding-api'
import {
  formatBytes,
  formatDateTimeBR,
  formatRelative,
  kybDocumentStatusMeta,
} from '@/lib/adapters/platform-console'

/**
 * Visualizador de documentos KYB: prévia (PDF no leitor do navegador, imagem
 * direto) servida pelo proxy do console — o token da equipe nunca vai para o
 * browser — e a decisão por documento: aprovar, recusar com motivo ou pedir
 * reenvio (recusa + item na pendência para o contratante).
 */

export function documentFileUrl(proposalId: string, documentId: string): string {
  return `/api/plataforma/propostas/${encodeURIComponent(proposalId)}/documentos/${encodeURIComponent(documentId)}`
}

function Preview({ proposalId, doc }: { proposalId: string; doc: KybDocument }) {
  const [loaded, setLoaded] = useState(false)
  const url = documentFileUrl(proposalId, doc.id)
  const isImage = doc.mimeType.startsWith('image/')
  const isPdf = doc.mimeType === 'application/pdf'

  useEffect(() => setLoaded(false), [doc.id])

  if (!isImage && !isPdf) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <FileQuestion className="h-10 w-10" />
        <p>Prévia indisponível para este tipo de arquivo ({doc.mimeType}).</p>
        <Button variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            Baixar arquivo
          </a>
        </Button>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando documento…
        </div>
      )}
      {isImage ? (
        // Imagem servida pelo proxy autenticado do console; next/image não se aplica.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={doc.id}
          src={url}
          alt={KYB_DOCUMENT_KIND_LABELS[doc.kind]}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className="mx-auto h-full max-h-full w-auto max-w-full object-contain"
        />
      ) : (
        <iframe
          key={doc.id}
          src={url}
          title={KYB_DOCUMENT_KIND_LABELS[doc.kind]}
          onLoad={() => setLoaded(true)}
          className="h-full w-full rounded-md border-0 bg-white"
        />
      )}
    </div>
  )
}

export function DocumentViewer({
  proposal,
  documents,
  documentId,
  onDocumentChange,
  open,
  onOpenChange,
  onUpdated,
  editable,
  onRequestResend,
}: {
  proposal: OnboardingProposalDetail
  /** Ordem de navegação (anterior/próximo). */
  documents: KybDocument[]
  documentId: string | null
  onDocumentChange: (id: string) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (detail: OnboardingProposalDetail) => void
  editable: boolean
  /** Depois de recusar pedindo reenvio: abre a pendência com o item pronto. */
  onRequestResend: (item: PendingRequestItem) => void
}) {
  const [busy, setBusy] = useState<'approve' | null>(null)
  const [confirm, setConfirm] = useState<'reject' | 'resend' | null>(null)

  const index = documents.findIndex(doc => doc.id === documentId)
  const doc = index >= 0 ? documents[index]! : null
  const meta = doc ? kybDocumentStatusMeta(doc.status) : null
  const pendingReview = useMemo(() => documents.filter(item => item.status === 'uploaded'), [documents])

  const goTo = (offset: number) => {
    const next = documents[index + offset]
    if (next) onDocumentChange(next.id)
  }

  /** Depois de decidir, pula para o próximo documento ainda sem revisão. */
  const advance = (updated: OnboardingProposalDetail, currentId: string) => {
    const next = updated.documents.find(item => item.status === 'uploaded' && item.id !== currentId)
    if (next) onDocumentChange(next.id)
  }

  const approve = async () => {
    if (!doc) return
    setBusy('approve')
    const detail = await runCommand(
      reviewKybDocumentAction(proposal.id, doc.id, { status: 'approved' }),
      `${KYB_DOCUMENT_KIND_LABELS[doc.kind]} aprovado`,
    )
    setBusy(null)
    if (detail) {
      onUpdated(detail)
      advance(detail, doc.id)
    }
  }

  const reject = async (note: string, resend: boolean): Promise<boolean> => {
    if (!doc) return false
    const detail = await runCommand(
      reviewKybDocumentAction(proposal.id, doc.id, { status: 'rejected', note }),
      resend ? 'Documento recusado — inclua na pendência para o reenvio' : 'Documento recusado',
    )
    if (!detail) return false
    onUpdated(detail)
    if (resend) {
      onOpenChange(false)
      onRequestResend({
        section: 'documents',
        documentKind: doc.kind,
        ...(doc.personId ? { personId: doc.personId } : {}),
        note: `Reenviar ${KYB_DOCUMENT_KIND_LABELS[doc.kind].toLowerCase()}${doc.personName ? ` de ${doc.personName}` : ''}: ${note}`,
      })
    } else {
      advance(detail, doc.id)
    }
    return true
  }

  const canReview = editable && !!doc && doc.status !== 'replaced'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[92vh] max-h-[92vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="border-b border-border px-5 py-3 text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2 pr-8 text-base">
              {doc ? KYB_DOCUMENT_KIND_LABELS[doc.kind] : 'Documento'}
              {doc?.personName && <span className="font-normal text-muted-foreground">— {doc.personName}</span>}
              {meta && <Pill meta={meta} title={meta.title} />}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {doc
                ? `${doc.fileName} · ${formatBytes(doc.sizeBytes)} · enviado ${formatRelative(doc.uploadedAt)}`
                : 'Selecione um documento.'}
              {pendingReview.length > 0 ? ` · ${pendingReview.length} a revisar nesta proposta` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="min-h-[50vh] flex-1 bg-muted/40 p-3 lg:min-h-0">
              {doc ? <Preview proposalId={proposal.id} doc={doc} /> : null}
            </div>

            <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-border p-5 lg:w-80 lg:border-l lg:border-t-0">
              {doc && (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                    <Field label="Tipo">{KYB_DOCUMENT_KIND_LABELS[doc.kind]}</Field>
                    <Field label="Pessoa">{doc.personName ?? 'Documento da instituição'}</Field>
                    <Field label="Enviado em">{formatDateTimeBR(doc.uploadedAt)}</Field>
                    <Field label="Situação">{meta?.title}</Field>
                  </div>

                  {doc.reviewNote && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                      <p className="text-xs font-medium uppercase tracking-wide">Motivo da recusa</p>
                      <p className="mt-1">{doc.reviewNote}</p>
                      {doc.reviewedAt && <p className="mt-1 text-xs opacity-80">{formatDateTimeBR(doc.reviewedAt)}</p>}
                    </div>
                  )}

                  {canReview ? (
                    <div className="space-y-2">
                      <Button
                        className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={approve}
                        disabled={busy !== null || doc.status === 'approved'}
                      >
                        {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheck className="h-4 w-4" />}
                        {doc.status === 'approved' ? 'Aprovado' : 'Aprovar documento'}
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30"
                          onClick={() => setConfirm('reject')}
                          disabled={busy !== null || doc.status === 'rejected'}
                        >
                          <CircleX className="h-4 w-4" />
                          Recusar
                        </Button>
                        <Button
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setConfirm('resend')}
                          disabled={busy !== null}
                        >
                          <RotateCcw className="h-4 w-4" />
                          Pedir reenvio
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        “Pedir reenvio” recusa o arquivo e já abre a pendência com este item para o contratante.
                      </p>
                    </div>
                  ) : (
                    <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                      {doc.status === 'replaced'
                        ? 'Versão substituída por um envio mais recente.'
                        : 'A revisão de documentos fica disponível enquanto a proposta está em análise.'}
                    </p>
                  )}

                  <Button variant="ghost" size="sm" className="justify-start gap-2 px-0 text-primary" asChild>
                    <a href={documentFileUrl(proposal.id, doc.id)} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Abrir em nova aba
                    </a>
                  </Button>
                </>
              )}

              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                <Button variant="outline" size="sm" onClick={() => goTo(-1)} disabled={index <= 0} className="gap-1">
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  {index >= 0 ? `${index + 1} de ${documents.length}` : ''}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goTo(1)}
                  disabled={index < 0 || index >= documents.length - 1}
                  className="gap-1"
                >
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </aside>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm === 'reject'}
        onOpenChange={value => !value && setConfirm(null)}
        title="Recusar documento?"
        description="O contratante verá o motivo na página de acompanhamento. Para ele reenviar, inclua o item numa pendência."
        confirmLabel="Recusar documento"
        destructive
        reason={{ label: 'Motivo da recusa', placeholder: 'Ex.: documento ilegível / fora da validade', minLength: 3 }}
        onConfirm={note => reject(note, false)}
      />
      <ConfirmDialog
        open={confirm === 'resend'}
        onOpenChange={value => !value && setConfirm(null)}
        title="Pedir reenvio do documento?"
        description="O arquivo atual é recusado e a pendência abre com este item. A proposta só volta para o contratante quando você enviar a pendência."
        confirmLabel="Recusar e montar pendência"
        destructive
        reason={{ label: 'O que precisa ser corrigido', placeholder: 'Ex.: envie a ata registrada em cartório', minLength: 3 }}
        onConfirm={note => reject(note, true)}
      />
    </>
  )
}
