'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, CircleAlert, ClipboardList, MessageSquareWarning } from 'lucide-react'
import {
  KYB_DOCUMENT_KIND_LABELS,
  ONBOARDING_SECTION_LABELS,
  ONBOARDING_STATUS_APPLICANT_HINTS,
  ONBOARDING_STATUS_LABELS,
  type OnboardingApplicantView,
  type OnboardingSection,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import {
  WIZARD_STEPS,
  firstIncompleteStep,
  formatCnpj,
  formatDateTime,
  isSectionComplete,
  parseWizardStep,
  pendingItemTarget,
  trackingPath,
  type WizardStep,
} from '@/lib/adapters/contratacao'
import { cn } from '@/lib/utils'
import { QuoteLines, QuoteSummaryCard } from './quote-summary'
import { Stepper } from './stepper'
import { BrandStep } from './steps/brand-step'
import { CompanyStep } from './steps/company-step'
import { ContractStep } from './steps/contract-step'
import { DocumentsStep } from './steps/documents-step'
import { PaymentStep } from './steps/payment-step'
import { PeopleStep } from './steps/people-step'
import { PlanStep } from './steps/plan-step'
import { ReviewStep } from './steps/review-step'
import type { StepContext } from './steps/types'
import { Panel, Pill } from './ui'

interface WizardProps {
  view: OnboardingApplicantView
  proposalId: string
  chave: string
  onViewChange: (view: OnboardingApplicantView) => void
  onReload: () => Promise<void> | void
}

function readStepFromUrl(): WizardStep | null {
  if (typeof window === 'undefined') return null
  return parseWizardStep(new URLSearchParams(window.location.search).get('etapa'))
}

/** Seções com item de pendência ainda aberto (compliance pediu ajuste). */
function sectionsWithPending(view: OnboardingApplicantView): Set<WizardStep> {
  const out = new Set<WizardStep>()
  if (view.status !== 'pending_info' || !view.pendingRequest || view.pendingRequest.resolvedAt) return out
  for (const item of view.pendingRequest.items) out.add(pendingItemTarget(item))
  return out
}

export function Wizard({ view, proposalId, chave, onViewChange }: WizardProps) {
  const [step, setStep] = useState<WizardStep>(() => readStepFromUrl() ?? firstIncompleteStep(view))
  const cpfCache = useRef(new Map<string, string>())
  const mounted = useRef(false)
  const index = WIZARD_STEPS.findIndex(item => item.id === step)
  const attention = useMemo(() => sectionsWithPending(view), [view])

  // Etapa na URL (`?etapa=`): recarregar volta para o mesmo lugar.
  useEffect(() => {
    const url = trackingPath(proposalId, chave, step)
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, '', url)
    if (!mounted.current) {
      mounted.current = true
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.setTimeout(() => document.getElementById(`wizard-step-${step}`)?.focus({ preventScroll: true }), 150)
  }, [step, proposalId, chave])

  const goTo = useCallback((next: WizardStep) => setStep(next), [])
  const goNext = useCallback(() => {
    const next = WIZARD_STEPS[Math.min(WIZARD_STEPS.length - 1, index + 1)]
    if (next) setStep(next.id)
  }, [index])
  const goBack = index > 0 ? () => setStep((WIZARD_STEPS[index - 1] ?? WIZARD_STEPS[0]!).id) : null

  const onSaved = useCallback<StepContext['onSaved']>(
    (next, options) => {
      onViewChange(next)
      if (options?.message) toast.success(options.message)
      if (options?.advance) {
        const nextStep = WIZARD_STEPS[Math.min(WIZARD_STEPS.length - 1, index + 1)]
        if (nextStep) setStep(nextStep.id)
      }
    },
    [index, onViewChange],
  )

  const ctx: StepContext = { view, proposalId, chave, onSaved, goTo, goNext, goBack, cpfCache: cpfCache.current }

  const steps = WIZARD_STEPS.map(item => ({
    id: item.id,
    label: item.label,
    complete: item.id === 'review' ? false : isSectionComplete(view, item.id as OnboardingSection),
    attention: attention.has(item.id),
  }))

  const companyName = view.company?.tradeName || view.company?.legalName || view.receita?.tradeName || view.receita?.legalName
  const facts = [
    { label: 'Protocolo', value: <span className="font-mono text-[13px]">{view.code}</span> },
    { label: 'CNPJ', value: formatCnpj(view.cnpj) },
    ...(companyName ? [{ label: 'Instituição', value: <span className="line-clamp-2">{companyName}</span> }] : []),
  ]
  const pending = view.status === 'pending_info' && view.pendingRequest && !view.pendingRequest.resolvedAt ? view.pendingRequest : null

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={view.status === 'pending_info' ? 'warning' : 'brand'}>{ONBOARDING_STATUS_LABELS[view.status]}</Pill>
            <span className="font-mono text-xs text-muted-foreground">{view.code}</span>
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            {companyName ? `Contratação · ${companyName}` : 'Sua contratação da plataforma'}
          </h1>
          <p className="text-sm text-muted-foreground">{ONBOARDING_STATUS_APPLICANT_HINTS[view.status]}</p>
        </div>
        <p className="text-xs text-muted-foreground">Atualizada em {formatDateTime(view.updatedAt)}</p>
      </div>

      {pending ? (
        <section
          aria-labelledby="pending-title"
          className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 shadow-sm sm:p-5 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50"
        >
          <div className="flex items-start gap-3">
            <MessageSquareWarning className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h2 id="pending-title" className="font-semibold">
                  O compliance pediu ajustes em {formatDateTime(pending.requestedAt)}
                </h2>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{pending.message}</p>
              </div>
              <ul className="space-y-2">
                {pending.items.map((item, itemIndex) => {
                  const target = pendingItemTarget(item)
                  const person = item.personId ? view.people.find(p => p.id === item.personId)?.name : null
                  return (
                    <li
                      key={`${item.section}-${item.documentKind ?? ''}-${itemIndex}`}
                      className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-white/70 p-3 text-sm sm:flex-row sm:items-center dark:border-amber-500/20 dark:bg-black/10"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {ONBOARDING_SECTION_LABELS[item.section]}
                          {item.documentKind ? ` · ${KYB_DOCUMENT_KIND_LABELS[item.documentKind]}` : ''}
                          {person ? ` · ${person}` : ''}
                        </p>
                        <p className="text-[13px] opacity-90">{item.note}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 shrink-0 rounded-lg bg-background text-foreground"
                        onClick={() => setStep(target)}
                      >
                        Resolver
                      </Button>
                    </li>
                  )
                })}
              </ul>
              <p className="text-[13px]">
                Depois de corrigir, vá em <strong>Revisão e envio</strong> e reenvie a proposta para análise.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <Stepper
          label="Etapas da contratação"
          steps={steps}
          current={Math.max(0, index)}
          onSelect={target => {
            const item = WIZARD_STEPS[target]
            if (item) setStep(item.id)
          }}
        />
        <div className="mt-3 md:hidden">
          <label htmlFor="wizard-step-select" className="sr-only">
            Ir para a etapa
          </label>
          <select
            id="wizard-step-select"
            value={step}
            onChange={event => setStep(event.target.value as WizardStep)}
            className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
          >
            {steps.map((item, stepIndex) => (
              <option key={item.id} value={item.id}>
                {stepIndex + 1}. {item.label}
                {item.complete ? ' ✓' : ''}
                {item.attention ? ' (pendência)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <details className="group mt-4 rounded-2xl border bg-card shadow-sm lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="min-w-0">
            <span className="block font-semibold text-foreground">
              {view.plan.offer ? `Plano ${view.plan.offer.name}` : 'Resumo da contratação'}
            </span>
            {view.plan.quote ? (
              <span className="text-muted-foreground">
                {view.plan.quote.monthlyTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês · ativação após aprovação
              </span>
            ) : null}
          </span>
          <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-t px-4 py-4">
          <QuoteLines offer={view.plan.offer} quote={view.plan.quote} method={view.paymentMethod} facts={facts} />
        </div>
      </details>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="min-w-0">
          <Panel>
            {step === 'plan' ? <PlanStep ctx={ctx} /> : null}
            {step === 'company' ? <CompanyStep ctx={ctx} /> : null}
            {step === 'people' ? <PeopleStep ctx={ctx} /> : null}
            {step === 'documents' ? <DocumentsStep ctx={ctx} /> : null}
            {step === 'brand' ? <BrandStep ctx={ctx} /> : null}
            {step === 'contract' ? <ContractStep ctx={ctx} /> : null}
            {step === 'payment' ? <PaymentStep ctx={ctx} /> : null}
            {step === 'review' ? <ReviewStep ctx={ctx} /> : null}
          </Panel>
        </div>
        <div className="hidden lg:block">
          <QuoteSummaryCard
            offer={view.plan.offer}
            quote={view.plan.quote}
            method={view.paymentMethod}
            facts={facts}
            footer={<CompletenessList view={view} current={step} onSelect={setStep} />}
          />
        </div>
      </div>
    </main>
  )
}

function CompletenessList({
  view,
  current,
  onSelect,
}: {
  view: OnboardingApplicantView
  current: WizardStep
  onSelect: (step: WizardStep) => void
}) {
  const done = view.completeness.filter(item => item.complete).length
  const total = view.completeness.length || 1
  return (
    <div className="space-y-3">
      <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <ClipboardList className="size-3.5" aria-hidden />
          Progresso
        </span>
        <span>
          {done} de {view.completeness.length}
        </span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <ul className="space-y-1">
        {view.completeness.map(item => (
          <li key={item.section}>
            <button
              type="button"
              onClick={() => onSelect(item.section)}
              className={cn(
                'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                current === item.section && 'bg-muted/60',
              )}
            >
              {item.complete ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" strokeWidth={3} aria-hidden />
              ) : (
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
              )}
              <span className="min-w-0">
                <span className={cn('block font-medium', item.complete ? 'text-foreground/80' : 'text-foreground')}>
                  {ONBOARDING_SECTION_LABELS[item.section]}
                </span>
                {!item.complete && item.missing[0] ? (
                  <span className="block text-muted-foreground">{item.missing[0]}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
