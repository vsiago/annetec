'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  CANDIDATURA_DOCUMENTOS_OBRIGATORIOS,
  CANDIDATURA_DOCUMENTO_KINDS,
  CANDIDATURA_DOCUMENTO_KIND_LABELS,
  CANDIDATURA_MAX_DOCUMENTOS,
  CANDIDATURA_MAX_FILE_BYTES,
  type CandidaturaDocumento,
  type CandidaturaDocumentoKind,
} from '@annetec/contracts'
import { ActionError, Pill, StepHeading } from '@/components/contratar/ui'
import { StepFooter } from '@/components/contratar/step-footer'
import { Button } from '@/components/ui/button'
import { removerDocumentoCandidaturaAction } from '@/lib/actions/vendas-candidaturas-api'
import { formatFileSize } from '@/lib/adapters/contratacao'
import { FALHA_SERVIDOR, type StepContext } from './steps'
import { DOCUMENT_ACCEPT, arquivoUrl, uploadDocumento } from './upload'

export function DocumentosStep({ ctx }: { ctx: StepContext }) {
  const { escopo, view, chave, onViewChange, goBack, goNext } = ctx
  const obrigatorios = CANDIDATURA_DOCUMENTOS_OBRIGATORIOS[view.tipoPessoa]
  const kinds = CANDIDATURA_DOCUMENTO_KINDS.filter(kind => kind !== 'contrato_social' || view.tipoPessoa === 'pj')
  const [progress, setProgress] = useState<Partial<Record<CandidaturaDocumentoKind, number>>>({})
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputs = useRef<Partial<Record<CandidaturaDocumentoKind, HTMLInputElement | null>>>({})

  const cheio = view.documentos.length >= CANDIDATURA_MAX_DOCUMENTOS
  const faltando = obrigatorios.filter(kind => !view.documentos.some(doc => doc.kind === kind))

  async function onFile(kind: CandidaturaDocumentoKind, file: File | undefined) {
    if (!file) return
    setError(null)
    setProgress(current => ({ ...current, [kind]: 0 }))
    const outcome = await uploadDocumento({
      escopo,
      id: view.id,
      chave,
      file,
      kind,
      onProgress: percent => setProgress(current => ({ ...current, [kind]: percent })),
    })
    setProgress(current => {
      const { [kind]: _done, ...rest } = current
      return rest
    })
    if (inputs.current[kind]) inputs.current[kind]!.value = ''
    if (outcome.ok) {
      onViewChange(outcome.data)
      toast.success(`${CANDIDATURA_DOCUMENTO_KIND_LABELS[kind]} enviado.`)
    } else {
      setError(outcome.error)
    }
  }

  async function remove(doc: CandidaturaDocumento) {
    setRemoving(doc.id)
    setError(null)
    try {
      const result = await removerDocumentoCandidaturaAction(escopo, view.id, chave, doc.id)
      if (result.success) onViewChange(result.data)
      else setError(result.error)
    } catch {
      setError(FALHA_SERVIDOR)
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-6">
      <StepHeading
        title="Documentos"
        description={`Envie PDF, JPG ou PNG de até ${formatFileSize(CANDIDATURA_MAX_FILE_BYTES)} cada. Os documentos ficam com acesso restrito à equipe que analisa a candidatura.`}
      />
      <ActionError message={error} />

      <ul className="space-y-3">
        {kinds.map(kind => {
          const docs = view.documentos.filter(doc => doc.kind === kind)
          const uploading = progress[kind] !== undefined
          const obrigatorio = obrigatorios.includes(kind)
          const multiplos = kind === 'outro'
          const podeEnviar = !uploading && (!cheio || (!multiplos && docs.length > 0))
          const inputId = `doc-${kind}`
          return (
            <li key={kind} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                    {CANDIDATURA_DOCUMENTO_KIND_LABELS[kind]}
                    {obrigatorio ? <Pill tone={docs.length ? 'success' : 'warning'}>{docs.length ? 'Enviado' : 'Obrigatório'}</Pill> : <Pill>Opcional</Pill>}
                  </p>
                </div>
                <div>
                  <input
                    ref={element => {
                      inputs.current[kind] = element
                    }}
                    id={inputId}
                    type="file"
                    accept={DOCUMENT_ACCEPT}
                    className="sr-only"
                    onChange={event => void onFile(kind, event.target.files?.[0])}
                    disabled={!podeEnviar}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 gap-2 rounded-xl"
                    disabled={!podeEnviar}
                    onClick={() => inputs.current[kind]?.click()}
                    aria-describedby={`${inputId}-status`}
                  >
                    {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
                    {uploading ? 'Enviando…' : docs.length && !multiplos ? 'Trocar arquivo' : 'Escolher arquivo'}
                  </Button>
                </div>
              </div>

              <div id={`${inputId}-status`} role="status" aria-live="polite">
                {uploading ? (
                  <div className="mt-3">
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-border"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress[kind] ?? 0}
                      aria-label={`Enviando ${CANDIDATURA_DOCUMENTO_KIND_LABELS[kind]}`}
                    >
                      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress[kind] ?? 0}%` }} />
                    </div>
                  </div>
                ) : null}
              </div>

              {docs.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {docs.map(doc => (
                    <li key={doc.id} className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2 text-sm">
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate" title={doc.fileName}>
                        {doc.fileName}
                        <span className="ml-2 text-xs text-muted-foreground">{formatFileSize(doc.sizeBytes)}</span>
                      </span>
                      <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
                      <a
                        href={arquivoUrl(escopo, view.id, chave, doc.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Abrir ${doc.fileName}`}
                      >
                        <ExternalLink className="size-4" aria-hidden />
                      </a>
                      <button
                        type="button"
                        onClick={() => void remove(doc)}
                        disabled={removing === doc.id}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        aria-label={`Remover ${doc.fileName}`}
                      >
                        {removing === doc.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>

      {cheio ? (
        <p className="text-sm text-muted-foreground">Você atingiu o limite de {CANDIDATURA_MAX_DOCUMENTOS} documentos. Remova algum para enviar outro.</p>
      ) : null}
      {faltando.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Falta enviar: {faltando.map(kind => CANDIDATURA_DOCUMENTO_KIND_LABELS[kind]).join(', ')}.
        </p>
      ) : null}

      <StepFooter onBack={goBack} onPrimary={goNext} primaryLabel="Continuar" />
    </div>
  )
}
