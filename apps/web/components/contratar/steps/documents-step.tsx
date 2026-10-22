'use client'

import { useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import {
  CircleCheck,
  CircleX,
  Clock3,
  Eye,
  FilePlus2,
  FileText,
  FileUp,
  Loader2,
  MessageSquareWarning,
  RefreshCw,
  Trash2,
  Upload,
  WandSparkles,
} from 'lucide-react'
import {
  KYB_DOCUMENT_KIND_LABELS,
  KYB_DOCUMENT_STATUS_LABELS,
  KYB_MAX_FILE_BYTES,
  formatDateBR,
  kybDocumentKind as kybDocumentKindSchema,
  type KybChecklistRow,
  type KybDocument,
  type KybDocumentKind,
  type PendingRequestItem,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { removeOnboardingDocumentAction } from '@/lib/actions/contratacao-api'
import { formatCnpj, formatFileSize } from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { useContratarDemo } from '../demo/use-demo'
import { safeAction } from '../hooks'
import { StepFooter } from '../step-footer'
import { DOCUMENT_ACCEPT, checkUploadFile, documentFileUrl, uploadKybDocument } from '../upload'
import { ActionError, Notice, Pill, SelectField, StepHeading, SubPanel } from '../ui'
import type { StepContext } from './types'

interface UploadState {
  percent: number
  fileName: string
}

const STATE_UI = {
  missing: { icon: FileUp, tone: 'neutral' as const, label: 'Pendente de envio', iconClass: 'bg-muted text-muted-foreground' },
  uploaded: { icon: Clock3, tone: 'info' as const, label: KYB_DOCUMENT_STATUS_LABELS.uploaded, iconClass: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  approved: { icon: CircleCheck, tone: 'success' as const, label: KYB_DOCUMENT_STATUS_LABELS.approved, iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  rejected: { icon: CircleX, tone: 'danger' as const, label: KYB_DOCUMENT_STATUS_LABELS.rejected, iconClass: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
}

function DocumentRow({
  row,
  document,
  upload,
  error,
  pendingNote,
  removing,
  fileUrl,
  onFile,
  onRemove,
}: {
  row: KybChecklistRow
  document: KybDocument | null
  upload: UploadState | undefined
  error: string | undefined
  pendingNote: string | null
  removing: boolean
  fileUrl: string | null
  onFile: (file: File) => void
  onRemove: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const ui = STATE_UI[row.state]
  const Icon = ui.icon
  const canRemove = document && (document.status === 'uploaded' || document.status === 'rejected')
  const busy = Boolean(upload) || removing

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file && row.state !== 'approved') onFile(file)
  }

  return (
    <li>
      <div
        onDragOver={event => {
          if (row.state === 'approved') return
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-2xl border bg-card p-4 transition-colors',
          dragging && 'border-primary bg-primary/5',
          pendingNote && 'border-amber-300 ring-2 ring-amber-200/60 dark:ring-amber-500/20',
          row.state === 'rejected' && !pendingNote && 'border-rose-200 dark:border-rose-500/30',
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', ui.iconClass)} aria-hidden>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">{row.label}</p>
              <Pill tone={row.required ? 'brand' : 'neutral'}>{row.required ? 'Obrigatório' : 'Opcional'}</Pill>
              <Pill tone={ui.tone}>{ui.label}</Pill>
            </div>
            {row.note ? <p className="text-[13px] text-muted-foreground">{row.note}</p> : null}
            {document ? (
              <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-foreground/80">
                <FileText className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="max-w-[16rem] truncate">{document.fileName}</span>
                <span className="text-muted-foreground">
                  · {formatFileSize(document.sizeBytes)} · enviado em {formatDateBR(document.uploadedAt)}
                </span>
              </p>
            ) : null}
            {row.state === 'rejected' && document?.reviewNote ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-900 dark:bg-rose-500/10 dark:text-rose-100">
                <strong>Motivo da recusa:</strong> {document.reviewNote}
              </p>
            ) : null}
            {pendingNote ? (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                <MessageSquareWarning className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  <strong>Pedido do compliance:</strong> {pendingNote}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            {fileUrl ? (
              <Button asChild variant="ghost" size="sm" className="h-9 gap-1.5">
                <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                  <Eye className="size-3.5" aria-hidden />
                  Ver
                </a>
              </Button>
            ) : null}
            {canRemove ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onRemove}
                disabled={busy}
              >
                {removing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
                Remover
              </Button>
            ) : null}
            {row.state !== 'approved' ? (
              <>
                <input
                  ref={input}
                  type="file"
                  accept={DOCUMENT_ACCEPT}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={event => {
                    const file = event.target.files?.[0]
                    event.target.value = ''
                    if (file) onFile(file)
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant={row.state === 'missing' || row.state === 'rejected' ? 'default' : 'outline'}
                  className="h-9 gap-1.5 rounded-lg"
                  onClick={() => input.current?.click()}
                  disabled={busy}
                  aria-label={`${row.state === 'missing' ? 'Enviar' : 'Substituir'} ${row.label}`}
                >
                  {row.state === 'missing' ? (
                    <Upload className="size-3.5" aria-hidden />
                  ) : (
                    <RefreshCw className="size-3.5" aria-hidden />
                  )}
                  {row.state === 'missing' ? 'Enviar arquivo' : row.state === 'rejected' ? 'Reenviar' : 'Substituir'}
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {upload ? (
          <div className="mt-3 space-y-1" aria-live="polite">
            <div className="flex justify-between text-[12px] text-muted-foreground">
              <span className="truncate">Enviando {upload.fileName}</span>
              <span className="tabular-nums">{upload.percent}%</span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={upload.percent}
              aria-label={`Envio de ${row.label}`}
            >
              <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${upload.percent}%` }} />
            </div>
          </div>
        ) : null}
        {error ? (
          <p className="mt-2 text-[13px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  )
}

function pendingNoteFor(row: KybChecklistRow, items: PendingRequestItem[]): string | null {
  const match = items.find(
    item => item.documentKind === row.kind && (!item.personId || !row.personId || item.personId === row.personId),
  )
  return match?.note ?? null
}

export function DocumentsStep({ ctx }: { ctx: StepContext }) {
  const { view, proposalId, chave, onSaved, goBack, goTo } = ctx
  // Atalho só em ambiente de demonstração (API) E com CNPJ de cenário fictício.
  const loadedDemo = useContratarDemo(view)
  const demo = loadedDemo?.isDemoCnpj(view.cnpj) ? loadedDemo : null
  const [uploads, setUploads] = useState<Record<string, UploadState | undefined>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string | undefined>>({})
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [demoBusy, setDemoBusy] = useState(false)
  const [extraKind, setExtraKind] = useState<KybDocumentKind | ''>('')
  const [extraPerson, setExtraPerson] = useState('')
  const extraInput = useRef<HTMLInputElement>(null)

  const documents = new Map(view.documents.map(document => [document.id, document]))
  const pendingItems =
    view.status === 'pending_info' && view.pendingRequest && !view.pendingRequest.resolvedAt ? view.pendingRequest.items : []
  const required = view.requirements.filter(row => row.required)
  const optional = view.requirements.filter(row => !row.required)
  const requiredDone = required.filter(row => row.state === 'uploaded' || row.state === 'approved').length
  const linked = new Set(view.requirements.map(row => row.documentId).filter((value): value is string => Boolean(value)))
  const others = view.documents.filter(document => document.status !== 'replaced' && !linked.has(document.id))

  async function send(
    rowKey: string,
    label: string,
    file: File,
    kind: KybDocumentKind,
    personId: string | null,
    silent = false,
  ) {
    setRowErrors(current => ({ ...current, [rowKey]: undefined }))
    const problem = checkUploadFile(file, 'documento')
    if (problem) {
      setRowErrors(current => ({ ...current, [rowKey]: problem }))
      return false
    }
    setUploads(current => ({ ...current, [rowKey]: { percent: 0, fileName: file.name } }))
    const result = await uploadKybDocument({
      proposalId,
      chave,
      file,
      kind,
      personId,
      onProgress: percent => setUploads(current => ({ ...current, [rowKey]: { percent, fileName: file.name } })),
    })
    setUploads(current => ({ ...current, [rowKey]: undefined }))
    if (!result.ok) {
      setRowErrors(current => ({ ...current, [rowKey]: result.error }))
      return false
    }
    onSaved(result.data, silent ? undefined : { message: `${label}: arquivo enviado` })
    return true
  }

  async function remove(document: KybDocument) {
    setError(null)
    setRemoving(document.id)
    const result = await safeAction(() => removeOnboardingDocumentAction(proposalId, chave, document.id))
    setRemoving(null)
    if (!result.success) {
      setError(result.error)
      return
    }
    onSaved(result.data, { message: 'Documento removido' })
  }

  async function sendSamples() {
    if (!demo) return
    setDemoBusy(true)
    let sent = 0
    const legalName = view.company?.legalName ?? view.receita?.legalName ?? 'Instituicao de demonstracao'
    for (const row of view.requirements) {
      if (!row.required || (row.state !== 'missing' && row.state !== 'rejected')) continue
      const file = demo.buildSamplePdf(
        row.label,
        [legalName, `CNPJ ${formatCnpj(view.cnpj)}`, row.personName ? `Titular: ${row.personName}` : 'Documento da instituicao', `Emitido em ${new Date().toLocaleDateString('pt-BR')}`],
        `${row.kind}${row.personId ? `-${row.personId.slice(0, 8)}` : ''}.pdf`,
      )
      const ok = await send(row.key, row.label, file, row.kind, row.personId, true)
      if (!ok) break
      sent++
    }
    setDemoBusy(false)
    if (sent) toast.success(`${sent} documento(s) de exemplo enviado(s)`)
  }

  const peopleOptions = view.people.map(person => ({ value: person.id, label: person.name }))

  return (
    <div className="space-y-6">
      <StepHeading
        id="wizard-step-documents"
        eyebrow="Documentos"
        title="Documentos para a análise cadastral"
        description={`A lista segue a forma jurídica informada. PDF, JPEG ou PNG de até ${formatFileSize(KYB_MAX_FILE_BYTES)} cada — você pode arrastar o arquivo para a linha.`}
        action={
          demo ? (
            <Button type="button" variant="outline" className="h-10 gap-2 rounded-xl" onClick={() => void sendSamples()} disabled={demoBusy}>
              {demoBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <WandSparkles className="size-4" aria-hidden />}
              Enviar documentos de exemplo
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-muted/30 px-4 py-3 text-sm">
        <span className="font-semibold text-foreground">
          {requiredDone} de {required.length} obrigatórios enviados
        </span>
        <div className="h-1.5 min-w-32 flex-1 overflow-hidden rounded-full bg-border" aria-hidden>
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
            style={{ width: `${required.length ? (requiredDone / required.length) * 100 : 100}%` }}
          />
        </div>
        <span className="text-[13px] text-muted-foreground">Guardados com acesso restrito ao compliance</span>
      </div>

      {view.people.length === 0 ? (
        <Notice
          tone="info"
          title="Faltam os documentos pessoais"
          action={
            <Button type="button" size="sm" variant="outline" className="bg-background" onClick={() => goTo('people')}>
              Cadastrar pessoas
            </Button>
          }
        >
          A identidade de cada representante legal (e a procuração, se houver) aparece aqui depois que você cadastrar os
          representantes.
        </Notice>
      ) : null}

      {required.length ? (
        <section aria-label="Documentos obrigatórios" className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Obrigatórios</h3>
          <ul className="space-y-3">
            {required.map(row => {
              const document = row.documentId ? (documents.get(row.documentId) ?? null) : null
              return (
                <DocumentRow
                  key={row.key}
                  row={row}
                  document={document}
                  upload={uploads[row.key]}
                  error={rowErrors[row.key]}
                  pendingNote={pendingNoteFor(row, pendingItems)}
                  removing={Boolean(document && removing === document.id)}
                  fileUrl={document ? documentFileUrl(proposalId, chave, document.id) : null}
                  onFile={file => void send(row.key, row.label, file, row.kind, row.personId)}
                  onRemove={() => document && void remove(document)}
                />
              )
            })}
          </ul>
        </section>
      ) : null}

      {optional.length ? (
        <section aria-label="Documentos opcionais" className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Opcionais (agilizam a análise)</h3>
          <ul className="space-y-3">
            {optional.map(row => {
              const document = row.documentId ? (documents.get(row.documentId) ?? null) : null
              return (
                <DocumentRow
                  key={row.key}
                  row={row}
                  document={document}
                  upload={uploads[row.key]}
                  error={rowErrors[row.key]}
                  pendingNote={pendingNoteFor(row, pendingItems)}
                  removing={Boolean(document && removing === document.id)}
                  fileUrl={document ? documentFileUrl(proposalId, chave, document.id) : null}
                  onFile={file => void send(row.key, row.label, file, row.kind, row.personId)}
                  onRemove={() => document && void remove(document)}
                />
              )
            })}
          </ul>
        </section>
      ) : null}

      <SubPanel
        title="Outro documento"
        description="Para complementar a análise ou atender um pedido específico do compliance."
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <SelectField
            label="Tipo de documento"
            value={extraKind}
            onChange={value => setExtraKind(value as KybDocumentKind)}
            options={kybDocumentKindSchema.options.map(kind => ({ value: kind, label: KYB_DOCUMENT_KIND_LABELS[kind] }))}
          />
          <SelectField
            label="Pessoa"
            optional
            value={extraPerson}
            onChange={setExtraPerson}
            options={[{ value: 'none', label: 'Documento da instituição' }, ...peopleOptions]}
          />
          <div>
            <input
              ref={extraInput}
              type="file"
              accept={DOCUMENT_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={event => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file && extraKind) {
                  void send('extra', KYB_DOCUMENT_KIND_LABELS[extraKind], file, extraKind, extraPerson && extraPerson !== 'none' ? extraPerson : null)
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full gap-2 rounded-xl"
              disabled={!extraKind || Boolean(uploads.extra)}
              onClick={() => extraInput.current?.click()}
            >
              {uploads.extra ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FilePlus2 className="size-4" aria-hidden />}
              {uploads.extra ? `${uploads.extra.percent}%` : 'Escolher arquivo'}
            </Button>
          </div>
        </div>
        {rowErrors.extra ? (
          <p className="mt-2 text-[13px] text-destructive" role="alert">
            {rowErrors.extra}
          </p>
        ) : null}
        {others.length ? (
          <ul className="mt-4 space-y-2">
            {others.map(document => (
              <li key={document.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 text-[13px]">
                <FileText className="size-4 text-muted-foreground" aria-hidden />
                <span className="font-medium text-foreground">
                  {KYB_DOCUMENT_KIND_LABELS[document.kind]}
                  {document.personName ? ` — ${document.personName}` : ''}
                </span>
                <span className="max-w-[12rem] truncate text-muted-foreground">{document.fileName}</span>
                <Pill tone={document.status === 'approved' ? 'success' : document.status === 'rejected' ? 'danger' : 'info'}>
                  {KYB_DOCUMENT_STATUS_LABELS[document.status]}
                </Pill>
                <span className="ml-auto flex gap-1">
                  <Button asChild variant="ghost" size="sm" className="h-8 gap-1">
                    <a href={documentFileUrl(proposalId, chave, document.id)} target="_blank" rel="noopener noreferrer">
                      <Eye className="size-3.5" aria-hidden />
                      Ver
                    </a>
                  </Button>
                  {document.status === 'uploaded' || document.status === 'rejected' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => void remove(document)}
                      disabled={removing === document.id}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Remover
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </SubPanel>

      <ActionError message={error} />
      <StepFooter
        onBack={goBack}
        onPrimary={ctx.goNext}
        primaryLabel={requiredDone < required.length ? 'Continuar e enviar depois' : 'Continuar'}
      />
    </div>
  )
}
