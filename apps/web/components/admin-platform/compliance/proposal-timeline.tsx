'use client'

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BadgeCheck,
  Ban,
  CircleCheckBig,
  CircleX,
  ClipboardCheck,
  FilePlus2,
  FileX2,
  Hand,
  Loader2,
  Mail,
  MessageSquareText,
  PenLine,
  Rocket,
  Send,
  ShieldQuestion,
  Sparkles,
  TimerOff,
  Wallet,
} from 'lucide-react'
import type { OnboardingProposalDetail } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Pill, runCommand } from '@/components/admin-platform/billing/console-kit'
import { addOnboardingNoteAction } from '@/lib/actions/platform-onboarding-api'
import {
  emailStatusMeta,
  emailTemplateLabel,
  formatDateTimeBR,
  formatRelative,
  onboardingEventLabel,
  onboardingEventTone,
  toneClass,
} from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Histórico do clube (registros públicos e internos, mais recente primeiro)
 * com o campo de nota interna, e os e-mails enviados ao clube — a história
 * inteira da análise num lugar só.
 */

/** Títulos do histórico na linguagem do console (o contracts guarda a versão que o clube lê). */
const EVENT_TITLE: Record<string, string> = {
  PROPOSAL_CREATED: 'Cadastro iniciado',
  SUBMITTED: 'Enviado para análise',
  RESUBMITTED: 'Reenviado após correção',
  PRECHECKS_RAN: 'Verificação automática feita',
  CHECKLIST_UPDATED: 'Itens conferidos atualizados',
  INFO_REQUESTED: 'Correção pedida ao clube',
  APPROVED: 'Clube aprovado',
  REJECTED: 'Clube recusado',
  PROVISIONING_STARTED: 'Liberação do clube iniciada',
  PROVISIONED: 'Clube liberado',
  PROVISIONING_FAILED: 'Falha ao liberar o clube',
  CANCELED: 'Cadastro cancelado',
  EXPIRED: 'Cadastro expirado',
}

const EVENT_ICON: Record<string, LucideIcon> = {
  PROPOSAL_CREATED: Sparkles,
  SECTION_SAVED: PenLine,
  DOCUMENT_UPLOADED: FilePlus2,
  DOCUMENT_REMOVED: FileX2,
  DOCUMENT_APPROVED: BadgeCheck,
  DOCUMENT_REJECTED: FileX2,
  CONTRACT_ACCEPTED: PenLine,
  SUBMITTED: Send,
  RESUBMITTED: Send,
  PRECHECKS_RAN: ClipboardCheck,
  CLAIMED: Hand,
  CHECKLIST_UPDATED: ClipboardCheck,
  INFO_REQUESTED: ShieldQuestion,
  APPROVED: CircleCheckBig,
  REJECTED: CircleX,
  ACTIVATION_CHARGE_CREATED: Wallet,
  PAYMENT_CONFIRMED: Wallet,
  PROVISIONING_STARTED: Rocket,
  PROVISIONED: Rocket,
  PROVISIONING_FAILED: CircleX,
  CANCELED: Ban,
  EXPIRED: TimerOff,
  NOTE_ADDED: MessageSquareText,
  EMAIL_SENT: Mail,
}

export function ProposalTimeline({
  proposal,
  onUpdated,
  canNote,
}: {
  proposal: OnboardingProposalDetail
  onUpdated: (detail: OnboardingProposalDetail) => void
  canNote: boolean
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const events = [...(proposal.events ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const addNote = async () => {
    const value = text.trim()
    if (value.length < 2 || saving) return
    setSaving(true)
    const detail = await runCommand(addOnboardingNoteAction(proposal.id, { text: value }), 'Nota registrada no histórico')
    setSaving(false)
    if (detail) {
      setText('')
      onUpdated(detail)
    }
  }

  return (
    <Card className="gap-4 shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Histórico</CardTitle>
        <CardDescription>
          {events.length} {events.length === 1 ? 'registro' : 'registros'} · “Interno”: só a equipe ANNETEC vê. “Público”: o clube
          também vê no acompanhamento.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {canNote && (
          <div className="space-y-2">
            <Textarea
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder="Nota interna (ex.: o tesoureiro confirmou a diretoria por telefone)"
              rows={2}
              maxLength={4000}
            />
            <div className="flex justify-end">
              <Button size="sm" className="gap-2" onClick={addNote} disabled={saving || text.trim().length < 2}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
                Adicionar nota
              </Button>
            </div>
          </div>
        )}

        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum registro ainda.</p>
        ) : (
          <ol className="relative space-y-4">
            {events.map((event, index) => {
              const Icon = EVENT_ICON[event.type] ?? Activity
              const originalTitle = onboardingEventLabel(event.type)
              const title = EVENT_TITLE[event.type] ?? originalTitle
              const isNote = event.type === 'NOTE_ADDED'
              return (
                <li key={event.id} className="relative flex gap-3">
                  {index < events.length - 1 && (
                    <span className="absolute left-4 top-9 -bottom-4 w-px bg-border" aria-hidden />
                  )}
                  <span
                    className={cn(
                      'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      toneClass(onboardingEventTone(event.type)),
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-foreground">{title}</span>
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                          event.visibility === 'internal'
                            ? 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300'
                            : 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
                        )}
                      >
                        {event.visibility === 'internal' ? 'Interno' : 'Público'}
                      </span>
                    </div>
                    {event.message && event.message !== title && event.message !== originalTitle && (
                      <p
                        className={cn(
                          'mt-0.5 text-sm',
                          isNote ? 'rounded-md bg-violet-50/60 px-2 py-1 text-foreground dark:bg-violet-500/10' : 'text-muted-foreground',
                        )}
                      >
                        {event.message}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground" title={formatDateTimeBR(event.createdAt)}>
                      {formatRelative(event.createdAt)} · {formatDateTimeBR(event.createdAt)}
                      {event.actorName ? ` · ${event.actorName}` : ''}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

export function ProposalEmails({
  proposal,
  onOpenEmail,
}: {
  proposal: OnboardingProposalDetail
  onOpenEmail: (id: string) => void
}) {
  const emails = [...(proposal.emails ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <Card className="gap-4 shadow-none">
      <CardHeader>
        <CardTitle className="text-base">E-mails enviados ao clube</CardTitle>
        <CardDescription>
          {emails.length} {emails.length === 1 ? 'mensagem ligada' : 'mensagens ligadas'} a este clube.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {emails.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum e-mail enviado ainda.</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {emails.map(email => (
              <li key={email.id}>
                <button
                  type="button"
                  onClick={() => onOpenEmail(email.id)}
                  className="flex w-full items-start gap-3 px-6 py-3 text-left hover:bg-muted/40"
                >
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{email.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {emailTemplateLabel(email.template)} · {email.toEmail} · {formatRelative(email.createdAt)}
                    </p>
                  </div>
                  <Pill meta={emailStatusMeta(email.status)} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
