'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CircleCheck, CircleX, Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import {
  KYB_DOCUMENT_KIND_LABELS,
  ONBOARDING_SECTION_LABELS,
  PRECHECK_LABELS,
  kybDocumentKind,
  onboardingSection,
  type KybDocumentKind,
  type OnboardingProposalDetail,
  type OnboardingSection,
  type PendingRequestItem,
} from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { runCommand } from '@/components/admin-platform/billing/console-kit'
import {
  approveOnboardingAction,
  provisionOnboardingAction,
  requestOnboardingInfoAction,
} from '@/lib/actions/platform-onboarding-api'
import { cn } from '@/lib/utils'
import { proposalName, type ApprovalReadiness } from './compliance-ui'

/**
 * Diálogos de decisão das Aprovações: aprovar o clube (com ressalva quando
 * falta algo), pedir correção (itens por seção/documento/pessoa) e liberar o
 * clube (superadmin). Recusar e cancelar usam o `ConfirmDialog` do kit na página.
 */

function ReadinessLine({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-[#B42318]" />
      )}
      <span className={ok ? 'text-foreground' : 'text-[#B42318] dark:text-red-300'}>{children}</span>
    </li>
  )
}

export function ReadinessList({ readiness }: { readiness: ApprovalReadiness }) {
  return (
    <ul className="space-y-1.5">
      <ReadinessLine ok={readiness.prechecksRan && readiness.blocking.length === 0}>
        {!readiness.prechecksRan
          ? 'A verificação automática ainda não foi feita'
          : readiness.blocking.length === 0
            ? 'Verificação automática sem impedimentos'
            : `Impedem a aprovação: ${readiness.blocking.map(item => PRECHECK_LABELS[item.code]).join(', ')}`}
      </ReadinessLine>
      <ReadinessLine ok={readiness.requiredApproved === readiness.requiredTotal}>
        Documentos obrigatórios aprovados: {readiness.requiredApproved} de {readiness.requiredTotal}
      </ReadinessLine>
      <ReadinessLine ok={readiness.checklistComplete}>
        Itens conferidos: {readiness.checklistChecked} de {readiness.checklistTotal}
      </ReadinessLine>
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Aprovar
// ---------------------------------------------------------------------------

export function ApproveDialog({
  proposal,
  readiness,
  open,
  onOpenChange,
  onUpdated,
}: {
  proposal: OnboardingProposalDetail
  readiness: ApprovalReadiness
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (detail: OnboardingProposalDetail) => void
}) {
  const [note, setNote] = useState('')
  const [override, setOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setNote('')
      setOverride(false)
      setOverrideReason('')
      setBusy(false)
    }
  }, [open])

  const needsOverride = !readiness.ready
  const reasonOk = overrideReason.trim().length >= 10
  const canSubmit = !busy && (!needsOverride || (override && reasonOk))
  const total = proposal.plan.quote?.activationTotal

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    const detail = await runCommand(
      approveOnboardingAction(proposal.id, {
        note: note.trim() || undefined,
        override: needsOverride && override,
        overrideReason: needsOverride && override ? overrideReason.trim() : undefined,
      }),
      updated =>
        updated.status === 'awaiting_payment'
          ? 'Clube aprovado. A cobrança de ativação foi enviada por e-mail'
          : 'Clube aprovado',
    )
    setBusy(false)
    if (detail) {
      onUpdated(detail)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => !busy && onOpenChange(value)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Aprovar {proposalName(proposal)}?</DialogTitle>
          <DialogDescription>
            Ao aprovar, o clube recebe a cobrança de ativação
            {typeof total === 'number' ? ` (${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` : ''} por
            e-mail. O acesso é liberado assim que ela for paga.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3">
            <ReadinessList readiness={readiness} />
          </div>

          {needsOverride && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={override} onCheckedChange={value => setOverride(value === true)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-amber-900 dark:text-amber-200">Aprovar com ressalva</span>
                  <span className="block text-xs text-amber-800/80 dark:text-amber-300/80">
                    A justificativa fica gravada no cadastro do clube e no histórico.
                  </span>
                </span>
              </label>
              {override && (
                <div className="space-y-1.5">
                  <Label htmlFor="override-reason">Justificativa</Label>
                  <Textarea
                    id="override-reason"
                    value={overrideReason}
                    onChange={event => setOverrideReason(event.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Ex.: atividade compatível confirmada no estatuto; diretoria conferida por telefone."
                  />
                  <p className={cn('text-xs', reasonOk ? 'text-muted-foreground' : 'text-amber-800 dark:text-amber-300')}>
                    Mínimo de 10 caracteres ({overrideReason.trim().length}/10).
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="approve-note">Observação para o histórico (opcional)</Label>
            <Textarea
              id="approve-note"
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Ex.: conferi os dados do sócio com o presidente por telefone."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Voltar
          </Button>
          <Button
            onClick={submit}
            disabled={!canSubmit}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleCheck className="h-4 w-4" />}
            {needsOverride ? 'Aprovar com ressalva' : 'Aprovar clube'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Pedir correção
// ---------------------------------------------------------------------------

interface DraftItem {
  key: string
  section: OnboardingSection
  documentKind: KybDocumentKind | ''
  personId: string
  note: string
}

let seq = 0
const newKey = () => `item-${++seq}`

function toDraft(item: PendingRequestItem): DraftItem {
  return {
    key: newKey(),
    section: item.section,
    documentKind: item.documentKind ?? '',
    personId: item.personId ?? '',
    note: item.note,
  }
}

function sameItem(a: Pick<DraftItem, 'section' | 'documentKind' | 'personId'>, b: PendingRequestItem): boolean {
  return a.section === b.section && (a.documentKind || undefined) === b.documentKind && (a.personId || undefined) === b.personId
}

/** Sugestões: documentos recusados, obrigatórios faltando e pessoas que a Receita não lista como sócias. */
export function pendingSuggestions(proposal: OnboardingProposalDetail): PendingRequestItem[] {
  const suggestions: PendingRequestItem[] = []
  for (const doc of proposal.documents ?? []) {
    if (doc.status !== 'rejected') continue
    const superseded = (proposal.documents ?? []).some(
      other => other.id !== doc.id && other.kind === doc.kind && other.personId === doc.personId && other.uploadedAt > doc.uploadedAt && other.status !== 'rejected',
    )
    if (superseded) continue
    suggestions.push({
      section: 'documents',
      documentKind: doc.kind,
      ...(doc.personId ? { personId: doc.personId } : {}),
      note: `Reenviar ${KYB_DOCUMENT_KIND_LABELS[doc.kind].toLowerCase()}${doc.personName ? ` de ${doc.personName}` : ''}${doc.reviewNote ? `: ${doc.reviewNote}` : ''}`.slice(0, 500),
    })
  }
  for (const row of proposal.requirements ?? []) {
    if (!row.required || row.state !== 'missing') continue
    suggestions.push({
      section: 'documents',
      documentKind: row.kind,
      ...(row.personId ? { personId: row.personId } : {}),
      note: `Enviar ${row.label.toLowerCase()} (documento obrigatório)`.slice(0, 500),
    })
  }
  for (const person of proposal.people ?? []) {
    if (person.qsaMatch !== 'not_found') continue
    suggestions.push({
      section: 'people',
      personId: person.id,
      note: `${person.name} não consta no quadro societário da Receita: envie o documento que comprova os poderes de representação.`.slice(0, 500),
    })
  }
  return suggestions
}

export function PendingInfoDialog({
  proposal,
  open,
  onOpenChange,
  onUpdated,
  initialItems,
}: {
  proposal: OnboardingProposalDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (detail: OnboardingProposalDetail) => void
  /** Itens já montados (ex.: "pedir reenvio" no visualizador). */
  initialItems?: PendingRequestItem[]
}) {
  const [message, setMessage] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])
  const [busy, setBusy] = useState(false)
  const suggestions = useMemo(() => pendingSuggestions(proposal), [proposal])

  useEffect(() => {
    if (!open) return
    setBusy(false)
    setMessage(
      'Precisamos de alguns ajustes para concluir a análise do seu cadastro. Corrija os itens abaixo e reenvie pela página de acompanhamento.',
    )
    const base = initialItems && initialItems.length > 0 ? initialItems : suggestions.filter(s => s.section === 'documents' && s.note.startsWith('Reenviar'))
    setItems(base.length > 0 ? base.map(toDraft) : [{ key: newKey(), section: 'documents', documentKind: '', personId: '', note: '' }])
    // Monta de novo a cada abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const remaining = suggestions.filter(s => !items.some(item => sameItem(item, s)))
  const update = (key: string, patch: Partial<DraftItem>) =>
    setItems(current => current.map(item => (item.key === key ? { ...item, ...patch } : item)))

  const messageOk = message.trim().length >= 10
  const itemsOk = items.length > 0 && items.every(item => item.note.trim().length >= 3)
  const canSubmit = !busy && messageOk && itemsOk

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    const detail = await runCommand(
      requestOnboardingInfoAction(proposal.id, {
        message: message.trim(),
        items: items.map(item => ({
          section: item.section,
          ...(item.documentKind ? { documentKind: item.documentKind } : {}),
          ...(item.personId ? { personId: item.personId } : {}),
          note: item.note.trim().slice(0, 500),
        })),
      }),
      'Pedido de correção enviado ao clube',
    )
    setBusy(false)
    if (detail) {
      onUpdated(detail)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => !busy && onOpenChange(value)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pedir correção ao clube</DialogTitle>
          <DialogDescription>
            O clube recebe um e-mail com a mensagem e os itens, e pode corrigir o cadastro. Quando ele reenviar, o cadastro volta
            para a sua fila.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pending-message">Mensagem para o clube</Label>
            <Textarea
              id="pending-message"
              value={message}
              onChange={event => setMessage(event.target.value)}
              rows={3}
              maxLength={2000}
            />
            {!messageOk && <p className="text-xs text-[#B42318]">Explique o que falta (mínimo de 10 caracteres).</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>O que corrigir ({items.length})</Label>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  setItems(current => [...current, { key: newKey(), section: 'documents', documentKind: '', personId: '', note: '' }])
                }
                disabled={items.length >= 30}
              >
                <Plus className="h-4 w-4" />
                Adicionar item
              </Button>
            </div>

            <ul className="space-y-3">
              {items.map(item => (
                <li key={item.key} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Select value={item.section} onValueChange={value => update(item.key, { section: value as OnboardingSection })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {onboardingSection.options.map(section => (
                          <SelectItem key={section} value={section}>
                            {ONBOARDING_SECTION_LABELS[section]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={item.documentKind || 'none'}
                      onValueChange={value => update(item.key, { documentKind: value === 'none' ? '' : (value as KybDocumentKind) })}
                      disabled={item.section !== 'documents'}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Documento" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem documento específico</SelectItem>
                        {kybDocumentKind.options.map(kind => (
                          <SelectItem key={kind} value={kind}>
                            {KYB_DOCUMENT_KIND_LABELS[kind]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={item.personId || 'none'}
                      onValueChange={value => update(item.key, { personId: value === 'none' ? '' : value })}
                      disabled={(proposal.people ?? []).length === 0}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pessoa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem pessoa específica</SelectItem>
                        {(proposal.people ?? []).map(person => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-start gap-2">
                    <Input
                      value={item.note}
                      onChange={event => update(item.key, { note: event.target.value })}
                      placeholder="O que o clube precisa corrigir"
                      maxLength={500}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setItems(current => current.filter(other => other.key !== item.key))}
                      disabled={items.length <= 1}
                      aria-label="Remover item"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {!itemsOk && <p className="text-xs text-[#B42318]">Diga ao clube o que corrigir em cada item (mínimo de 3 caracteres).</p>}
          </div>

          {remaining.length > 0 && (
            <div className="space-y-2 rounded-lg bg-muted/50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5" />
                Sugestões da análise
              </p>
              <ul className="space-y-1.5">
                {remaining.map((suggestion, index) => (
                  <li key={`${suggestion.section}-${suggestion.documentKind ?? ''}-${suggestion.personId ?? ''}-${index}`}>
                    <button
                      type="button"
                      onClick={() => setItems(current => [...current.filter(item => item.note.trim().length > 0), toDraft(suggestion)])}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-background"
                    >
                      <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="text-foreground">{suggestion.note}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Voltar
          </Button>
          <Button onClick={submit} disabled={!canSubmit} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar pedido de correção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Liberar o clube (superadmin)
// ---------------------------------------------------------------------------

export function ProvisionDialog({
  proposal,
  open,
  onOpenChange,
  onDone,
}: {
  proposal: OnboardingProposalDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const waive = proposal.status === 'approved' || proposal.status === 'awaiting_payment'
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setReason('')
      setBusy(false)
    }
  }, [open])

  const reasonOk = !waive || reason.trim().length >= 10

  const submit = async () => {
    if (!reasonOk || busy) return
    setBusy(true)
    const result = await runCommand(
      provisionOnboardingAction(proposal.id, { waiveActivation: waive, reason: reason.trim() || undefined }),
      data => `Clube liberado em /${data.slug}. O acesso foi enviado para ${data.adminEmail}`,
    )
    setBusy(false)
    if (result) {
      onOpenChange(false)
      onDone()
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => !busy && onOpenChange(value)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{waive ? 'Liberar o clube sem cobrar a ativação?' : 'Tentar liberar o clube de novo?'}</DialogTitle>
          <DialogDescription>
            {waive
              ? 'O clube é criado agora, sem esperar o pagamento da ativação. O administrador recebe o acesso por e-mail (com senha provisória), e os planos, a régua de cobrança e a assinatura da plataforma já ficam configurados. A cobrança de ativação em aberto é cancelada.'
              : 'Retoma os passos que faltaram. Nada do que já foi criado é duplicado.'}
          </DialogDescription>
        </DialogHeader>
        {proposal.provisioning.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-[#B42318] dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            Última tentativa falhou ({proposal.provisioning.attempts} {proposal.provisioning.attempts === 1 ? 'tentativa' : 'tentativas'}):{' '}
            {proposal.provisioning.error}
          </p>
        )}
        {waive && (
          <div className="space-y-1.5">
            <Label htmlFor="waive-reason">Motivo para liberar sem cobrança</Label>
            <Textarea
              id="waive-reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex.: contrato comercial assinado com ativação cortesia"
            />
            <p className={cn('text-xs', reasonOk ? 'text-muted-foreground' : 'text-[#B42318]')}>
              Mínimo de 10 caracteres ({reason.trim().length}/10).
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Voltar
          </Button>
          <Button onClick={submit} disabled={!reasonOk || busy} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {waive ? 'Liberar o clube' : 'Tentar de novo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
