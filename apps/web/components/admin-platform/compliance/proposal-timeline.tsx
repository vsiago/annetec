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
  History,
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
import { Textarea } from '@/components/ui/textarea'
import { Pill, runCommand } from '@/components/admin-platform/billing/console-kit'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
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
    <SectionCard
      title="Histórico"
      icon={History}
      description={
        <>
          {events.length} {events.length === 1 ? 'registro' : 'registros'} · “Interno”: só a equipe ANNETEC vê. “Público”: o clube
          também vê no acompanhamento.
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {canNote && (
          <div className="flex flex-col gap-3">
            <Textarea
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder="Nota interna (ex.: o tesoureiro confirmou a diretoria por telefone)"
              aria-label="Nota interna"
              rows={2}
              maxLength={4000}
            />
            <div className="flex justify-end">
              <Button className="h-10 gap-2" onClick={addNote} disabled={saving || text.trim().length < 2}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                )}
                Adicionar nota
              </Button>
            </div>
          </div>
        )}

        {events.length === 0 ? (
          <EmptyState icon={History} size="sm" title="Nenhum registro ainda." />
        ) : (
          <ol className="relative m-0 flex list-none flex-col gap-5 p-0">
            {events.map((event, index) => {
              const Icon = EVENT_ICON[event.type] ?? Activity
              const originalTitle = onboardingEventLabel(event.type)
              const title = EVENT_TITLE[event.type] ?? originalTitle
              const isNote = event.type === 'NOTE_ADDED'
              return (
                <li key={event.id} className="relative flex gap-3">
                  {index < events.length - 1 && (
                    <span className="absolute -bottom-5 left-4 top-9 w-px bg-border" aria-hidden="true" />
                  )}
                  <span
                    className={cn(
                      'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      toneClass(onboardingEventTone(event.type)),
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-foreground">{title}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                          event.visibility === 'internal' ? 'bg-[#F2F4F7] text-[#344054]' : 'bg-[#EFF8FF] text-[#175CD3]',
                        )}
                      >
                        {event.visibility === 'internal' ? 'Interno' : 'Público'}
                      </span>
                    </div>
                    {event.message && event.message !== title && event.message !== originalTitle && (
                      <p
                        className={cn(
                          'm-0 mt-0.5 text-sm',
                          isNote ? 'rounded-lg bg-accent/60 px-3 py-2 text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {event.message}
                      </p>
                    )}
                    <p className="m-0 mt-0.5 text-xs text-muted-foreground" title={formatDateTimeBR(event.createdAt)}>
                      {formatRelative(event.createdAt)} · {formatDateTimeBR(event.createdAt)}
                      {event.actorName ? ` · ${event.actorName}` : ''}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </SectionCard>
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
    <SectionCard
      padded={false}
      title="E-mails enviados ao clube"
      icon={Mail}
      description={`${emails.length} ${emails.length === 1 ? 'mensagem ligada' : 'mensagens ligadas'} a este clube.`}
    >
      {emails.length === 0 ? (
        <EmptyState icon={Mail} size="sm" title="Nenhum e-mail enviado ainda." />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {emails.map(email => (
            <li key={email.id} className="border-b border-[#EEF0F3] last:border-b-0">
              <button
                type="button"
                onClick={() => onOpenEmail(email.id)}
                className="flex min-h-14 w-full items-start gap-3 px-6 py-4 text-left transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-secondary"
              >
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-medium text-foreground">{email.subject}</p>
                  <p className="m-0 truncate text-xs text-muted-foreground">
                    {emailTemplateLabel(email.template)} · {email.toEmail} · {formatRelative(email.createdAt)}
                  </p>
                </div>
                <Pill meta={emailStatusMeta(email.status)} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
