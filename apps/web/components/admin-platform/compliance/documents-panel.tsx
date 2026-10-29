'use client'

import { Eye, FileText, FileImage, ScanSearch } from 'lucide-react'
import {
  KYB_DOCUMENT_KIND_LABELS,
  type KybDocument,
  type OnboardingProposalDetail,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Pill } from '@/components/admin-platform/billing/console-kit'
import {
  formatBytes,
  formatRelative,
  kybChecklistStateMeta,
  kybDocumentStatusMeta,
} from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Documentos da empresa: a lista do que se exige da forma jurídica (uma
 * linha por item, os pessoais por pessoa) e, embaixo, os envios que não
 * respondem a nenhuma exigência — extras e versões substituídas.
 */

/** Ordem de navegação do visualizador: exigências primeiro, depois extras e substituídos. */
export function orderedDocuments(proposal: OnboardingProposalDetail): KybDocument[] {
  const docs = proposal.documents ?? []
  const byId = new Map(docs.map(doc => [doc.id, doc]))
  const ordered: KybDocument[] = []
  for (const row of proposal.requirements ?? []) {
    const doc = row.documentId ? byId.get(row.documentId) : undefined
    if (doc && !ordered.includes(doc)) ordered.push(doc)
  }
  const rest = docs
    .filter(doc => !ordered.includes(doc))
    .sort((a, b) => Number(a.status === 'replaced') - Number(b.status === 'replaced') || b.uploadedAt.localeCompare(a.uploadedAt))
  return [...ordered, ...rest]
}

function DocIcon({ mimeType }: { mimeType: string }) {
  const Icon = mimeType.startsWith('image/') ? FileImage : FileText
  return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
}

export function DocumentsPanel({
  proposal,
  onOpenDocument,
}: {
  proposal: OnboardingProposalDetail
  onOpenDocument: (documentId: string) => void
}) {
  const docs = proposal.documents ?? []
  const byId = new Map(docs.map(doc => [doc.id, doc]))
  const requirements = proposal.requirements ?? []
  const required = requirements.filter(row => row.required)
  const approved = required.filter(row => row.state === 'approved').length
  const toReview = docs.filter(doc => doc.status === 'uploaded')
  const linked = new Set(requirements.map(row => row.documentId).filter(Boolean))
  const extras = docs.filter(doc => !linked.has(doc.id))

  return (
    <div className="space-y-4">
      <Card className="gap-4 shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Documentos da empresa</CardTitle>
          <CardDescription>
            {approved} de {required.length} obrigatórios aprovados
            {toReview.length > 0 ? ` · ${toReview.length} esperando sua revisão` : ''}
          </CardDescription>
          {toReview.length > 0 && (
            <CardAction>
              <Button size="sm" className="gap-2" onClick={() => onOpenDocument(toReview[0]!.id)}>
                <ScanSearch className="h-4 w-4" />
                Revisar documentos ({toReview.length})
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {requirements.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum documento exigido para este tipo de organização.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {requirements.map(row => {
                const doc = row.documentId ? byId.get(row.documentId) : undefined
                const stateMeta = kybChecklistStateMeta(row.state, row.required)
                return (
                  <li
                    key={row.key}
                    className={cn(
                      'flex flex-wrap items-center gap-3 px-6 py-3',
                      doc && 'cursor-pointer hover:bg-muted/40',
                      row.state === 'uploaded' && 'bg-sky-50/40 dark:bg-sky-500/5',
                    )}
                    onClick={doc ? () => onOpenDocument(doc.id) : undefined}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{row.label}</p>
                        {row.required ? (
                          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Obrigatório</span>
                        ) : (
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Opcional</span>
                        )}
                      </div>
                      {doc ? (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <DocIcon mimeType={doc.mimeType} />
                          <span className="truncate">{doc.fileName}</span>
                          <span aria-hidden>·</span>
                          <span>{formatBytes(doc.sizeBytes)}</span>
                          <span aria-hidden>·</span>
                          <span>{formatRelative(doc.uploadedAt)}</span>
                        </p>
                      ) : (
                        row.note && <p className="mt-0.5 text-xs text-muted-foreground">{row.note}</p>
                      )}
                      {doc?.reviewNote && row.state === 'rejected' && (
                        <p className="mt-1 text-xs text-[#B42318] dark:text-red-300">Recusado: {doc.reviewNote}</p>
                      )}
                    </div>
                    <Pill meta={stateMeta} />
                    {doc && (
                      <Button variant="ghost" size="icon-sm" aria-label="Abrir documento" onClick={() => onOpenDocument(doc.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {extras.length > 0 && (
        <Card className="gap-4 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Outros envios</CardTitle>
            <CardDescription>Documentos extras e versões anteriores substituídas pelo clube.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border border-t border-border">
              {extras.map(doc => {
                const statusMeta = kybDocumentStatusMeta(doc.status)
                return (
                  <li
                    key={doc.id}
                    className={cn('flex cursor-pointer flex-wrap items-center gap-3 px-6 py-3 hover:bg-muted/40', doc.status === 'replaced' && 'opacity-70')}
                    onClick={() => onOpenDocument(doc.id)}
                  >
                    <DocIcon mimeType={doc.mimeType} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {KYB_DOCUMENT_KIND_LABELS[doc.kind]}
                        {doc.personName ? <span className="font-normal text-muted-foreground"> — {doc.personName}</span> : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {doc.fileName} · {formatBytes(doc.sizeBytes)} · {formatRelative(doc.uploadedAt)}
                      </p>
                    </div>
                    <Pill meta={statusMeta} title={statusMeta.title} />
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
