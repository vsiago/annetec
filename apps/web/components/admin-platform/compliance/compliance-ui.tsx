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
  type PrecheckResult,
  type PrecheckSummary,
} from '@annetec/contracts'
import { Pill } from '@/components/admin-platform/billing/console-kit'
import { onboardingStatusMeta, precheckSummaryMeta, slaInfo, toneClass, type StatusMeta } from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/** Peças pequenas das Aprovações: selos de situação, tempo de espera e ícone da verificação automática. */

/** Mensagem única para falha de carregamento nas telas de Aprovações. */
export const LOAD_ERROR_MESSAGE = 'Não foi possível carregar esta página. Verifique sua internet e tente de novo.'

/**
 * O que acontece ao aprovar — vem do fluxo real: `approveProposal` emite a
 * cobrança de ativação e avisa o clube por e-mail; `onActivationPaid` cria o
 * clube (provisionamento) quando o pagamento é confirmado.
 */
export const APPROVAL_CONSEQUENCE =
  'Ao aprovar, o clube recebe a cobrança de ativação por e-mail. O acesso é liberado assim que ela for paga.'

/** Nome do clube para títulos e frases (mesma ordem de preferência da lista). */
export function proposalName(detail: Pick<OnboardingProposalDetail, 'brand' | 'company' | 'receita'>): string {
  return (
    detail.brand?.clubName ||
    detail.company?.tradeName ||
    detail.receita?.tradeName ||
    detail.company?.legalName ||
    detail.receita?.legalName ||
    'Clube sem nome'
  )
}

// ---------------------------------------------------------------------------
// Situação do cadastro
// ---------------------------------------------------------------------------

/** Rótulos do console (a equipe lê). O contracts guarda a versão que o próprio clube lê. */
const STATUS_LABEL: Record<OnboardingStatus, { short: string; long: string }> = {
  draft: { short: 'Preenchendo o cadastro', long: 'O clube está preenchendo o cadastro' },
  submitted: { short: 'Para analisar', long: 'Enviado, esperando análise' },
  in_review: { short: 'Em análise', long: 'Em análise' },
  pending_info: { short: 'Esperando o clube', long: 'Esperando o clube corrigir' },
  approved: { short: 'Aprovado', long: 'Aprovado, cobrança de ativação a emitir' },
  awaiting_payment: { short: 'Aguardando pagamento', long: 'Aguardando o pagamento da ativação' },
  provisioning: { short: 'Liberando o clube', long: 'Pagamento confirmado, liberando o clube' },
  active: { short: 'Liberado', long: 'Clube liberado' },
  rejected: { short: 'Recusado', long: 'Cadastro recusado' },
  canceled: { short: 'Cancelado', long: 'Cadastro cancelado' },
}

export function proposalStatusLabel(status: OnboardingStatus, short = true): string {
  const entry = STATUS_LABEL[status]
  return entry ? (short ? entry.short : entry.long) : status
}

/** Opções do filtro "Situação" (mesmos nomes dos selos). */
export const PROPOSAL_STATUS_OPTIONS: { value: OnboardingStatus; label: string }[] = (
  Object.keys(STATUS_LABEL) as OnboardingStatus[]
).map(value => ({ value, label: STATUS_LABEL[value].short }))

export function ProposalStatusPill({ status, short = true }: { status: OnboardingStatus; short?: boolean }) {
  const meta: StatusMeta = { ...onboardingStatusMeta(status, short), label: proposalStatusLabel(status, short) }
  return <Pill meta={meta} />
}

// ---------------------------------------------------------------------------
// Tempo de espera (o antigo SLA de 48 h)
// ---------------------------------------------------------------------------

/** Horas → "menos de 1 hora", "5 horas", "1 dia", "3 dias". */
export function waitingTime(hours: number): string {
  const value = Math.max(0, hours)
  if (value < 1) return 'menos de 1 hora'
  if (value < 24) {
    const whole = Math.floor(value)
    return whole === 1 ? '1 hora' : `${whole} horas`
  }
  const days = Math.floor(value / 24)
  return days === 1 ? '1 dia' : `${days} dias`
}

/** Prazo de análise em dias ("2"), para os textos de apoio. */
export const REVIEW_DEADLINE_DAYS = ONBOARDING_REVIEW_SLA_HOURS / 24

/**
 * Há quanto tempo o clube espera uma resposta da equipe. Vermelho depois do
 * prazo de análise; só existe enquanto o cadastro está na fila.
 */
export function SlaBadge({
  slaDueAt,
  slaBreached,
  className,
  withPrefix = false,
}: {
  slaDueAt: string | null
  slaBreached: boolean
  className?: string
  /** "Esperando há 3 dias" em vez de só "3 dias" (usado fora de coluna "Esperando há"). */
  withPrefix?: boolean
}) {
  const info = slaInfo({ slaDueAt, slaBreached })
  if (!info) return <span className={cn('text-xs text-muted-foreground', className)}>—</span>
  const waitedHours = ONBOARDING_REVIEW_SLA_HOURS - info.hoursLeft
  const late = info.tone === 'danger'
  const text = waitingTime(waitedHours)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        toneClass(late ? 'danger' : 'neutral'),
        className,
      )}
      title={`Prazo para responder: ${REVIEW_DEADLINE_DAYS} dias a partir do envio`}
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      {withPrefix ? `Esperando há ${text}` : text}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Verificação automática
// ---------------------------------------------------------------------------

const OUTCOME_ICON: Record<PrecheckOutcome, LucideIcon> = {
  pass: CircleCheck,
  warn: TriangleAlert,
  fail: CircleX,
  skipped: CircleDashed,
}

const OUTCOME_COLOR: Record<PrecheckOutcome, string> = {
  pass: 'text-[#067647]',
  warn: 'text-[#B54708]',
  fail: 'text-[#B42318]',
  skipped: 'text-muted-foreground',
}

export function PrecheckIcon({ outcome, className }: { outcome: PrecheckOutcome; className?: string }) {
  const Icon = OUTCOME_ICON[outcome] ?? CircleDashed
  return <Icon className={cn('h-5 w-5 shrink-0', OUTCOME_COLOR[outcome], className)} aria-hidden />
}

/** Quantos itens da verificação pedem conferência (alerta ou falha). */
export function precheckPoints(results: Pick<PrecheckResult, 'outcome'>[] | null | undefined): number {
  return (results ?? []).filter(result => result.outcome === 'warn' || result.outcome === 'fail').length
}

/**
 * Resultado da verificação automática em frase: "Tudo certo" ou "N pontos
 * para conferir". Na lista a contagem não vem (`points` omitido) e o texto fica genérico.
 */
export function verificationMeta(summary: PrecheckSummary | null | undefined, points?: number): StatusMeta {
  const base = precheckSummaryMeta(summary)
  if (!summary) return { ...base, label: 'Ainda não verificado' }
  if (summary === 'pass') return { ...base, label: 'Tudo certo' }
  if (points && points > 0) {
    return { ...base, label: `${points} ${points === 1 ? 'ponto' : 'pontos'} para conferir` }
  }
  return { ...base, label: summary === 'fail' ? 'Precisa de atenção' : 'Pontos para conferir' }
}

/** Opções do filtro "Verificação automática". */
export const VERIFICATION_OPTIONS: { value: PrecheckSummary; label: string }[] = [
  { value: 'pass', label: 'Tudo certo' },
  { value: 'warn', label: 'Pontos para conferir' },
  { value: 'fail', label: 'Precisa de atenção' },
]

/** Prazo de análise no detalhe (o detalhe não traz `slaDueAt`; calcula do envio). */
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

/** Status em que a equipe ainda decide (aprovar, recusar, pedir correção). */
export const DECIDABLE_STATUSES: readonly OnboardingStatus[] = ['submitted', 'in_review']
/** Status em que documentos e conferência ainda podem ser revisados. */
export const REVIEWABLE_STATUSES: readonly OnboardingStatus[] = ['submitted', 'in_review', 'pending_info']
/** Não-finais: podem ser cancelados pelo console. */
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
 * bloqueante em falha, obrigatórios aprovados e itens conferidos por completo. Serve para
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
