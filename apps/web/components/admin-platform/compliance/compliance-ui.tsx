'use client'

import type { LucideIcon } from 'lucide-react'
import { CircleCheck, CircleDashed, CircleX, Clock, TriangleAlert } from 'lucide-react'
import {
  ONBOARDING_QUEUE_STATUSES,
  ONBOARDING_REVIEW_SLA_HOURS,
  blockingPrecheckFailures,
  complianceChecklistItem,
  type OnboardingProposalDetail,
  type OnboardingStatus,
  type PrecheckOutcome,
} from '@annetec/contracts'
import { Pill } from '@/components/admin-platform/billing/console-kit'
import { onboardingStatusMeta, slaInfo, toneClass } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/** Peças pequenas do compliance: selos de status, SLA e ícone de pré-checagem. */

export function ProposalStatusPill({ status, short = true }: { status: OnboardingStatus; short?: boolean }) {
  return <Pill meta={onboardingStatusMeta(status, short)} />
}

export function SlaBadge({
  slaDueAt,
  slaBreached,
  className,
}: {
  slaDueAt: string | null
  slaBreached: boolean
  className?: string
}) {
  const info = slaInfo({ slaDueAt, slaBreached })
  if (!info) return <span className={cn('text-xs text-muted-foreground', className)}>—</span>
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        toneClass(info.tone),
        className,
      )}
      title={`Prazo de análise: ${ONBOARDING_REVIEW_SLA_HOURS} h a partir do envio`}
    >
      <Clock className="h-3 w-3" />
      {info.label}
    </span>
  )
}

const OUTCOME_ICON: Record<PrecheckOutcome, LucideIcon> = {
  pass: CircleCheck,
  warn: TriangleAlert,
  fail: CircleX,
  skipped: CircleDashed,
}

const OUTCOME_COLOR: Record<PrecheckOutcome, string> = {
  pass: 'text-emerald-600',
  warn: 'text-amber-500',
  fail: 'text-red-600',
  skipped: 'text-muted-foreground',
}

export function PrecheckIcon({ outcome, className }: { outcome: PrecheckOutcome; className?: string }) {
  const Icon = OUTCOME_ICON[outcome] ?? CircleDashed
  return <Icon className={cn('h-5 w-5 shrink-0', OUTCOME_COLOR[outcome], className)} aria-hidden />
}

/** Prazo do SLA no detalhe (o detalhe não traz `slaDueAt`; calcula do envio). */
export function proposalSla(detail: Pick<OnboardingProposalDetail, 'status' | 'submittedAt'>): {
  slaDueAt: string | null
  slaBreached: boolean
} {
  if (!detail.submittedAt || !ONBOARDING_QUEUE_STATUSES.includes(detail.status)) {
    return { slaDueAt: null, slaBreached: false }
  }
  const due = new Date(new Date(detail.submittedAt).getTime() + ONBOARDING_REVIEW_SLA_HOURS * 3_600_000)
  return { slaDueAt: due.toISOString(), slaBreached: due.getTime() < Date.now() }
}

/** Status em que o compliance ainda decide (aprovar, reprovar, pedir pendência). */
export const DECIDABLE_STATUSES: readonly OnboardingStatus[] = ['submitted', 'in_review']
/** Status em que documentos e checklist ainda podem ser revisados. */
export const REVIEWABLE_STATUSES: readonly OnboardingStatus[] = ['submitted', 'in_review', 'pending_info']
/** Não-finais: podem ser canceladas pelo console. */
export const CANCELABLE_STATUSES: readonly OnboardingStatus[] = [
  'draft',
  'submitted',
  'in_review',
  'pending_info',
  'approved',
  'awaiting_payment',
]

/**
 * Prontidão para aprovar, com as MESMAS regras da API (§0.6): sem pré-checagem
 * bloqueante em falha, obrigatórios aprovados e checklist completo. Serve para
 * o painel e para o diálogo de aprovação dizerem o que falta antes do 422.
 */
export function approvalReadiness(detail: OnboardingProposalDetail) {
  const blocking = blockingPrecheckFailures(detail.prechecks ?? [])
  const required = (detail.requirements ?? []).filter(row => row.required)
  const requiredApproved = required.filter(row => row.state === 'approved').length
  const applicable = complianceChecklistItem.options.filter(item => item !== 'pep_due_diligence' || detail.hasPep)
  const checked = applicable.filter(item => detail.checklist?.[item]?.checked === true).length
  const checklistComplete = detail.checklistComplete ?? checked === applicable.length
  const prechecksRan = !!detail.precheckRanAt
  const ready = prechecksRan && blocking.length === 0 && requiredApproved === required.length && checklistComplete
  return {
    ready,
    prechecksRan,
    blocking,
    requiredTotal: required.length,
    requiredApproved,
    checklistTotal: applicable.length,
    checklistChecked: checked,
    checklistComplete,
  }
}

export type ApprovalReadiness = ReturnType<typeof approvalReadiness>
