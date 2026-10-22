'use client'

import { AlertTriangle, ArrowUpRight, Award, Check, CheckCircle2 } from 'lucide-react'
import { describeCoverageValue, formatBRL, type ClubPaymentMethod, type ClubPlan } from '@annetec/contracts'
import { dependentsPolicy, planBadge } from '@/lib/adapters/checkout'
import { cn } from '@/lib/utils'
import { COVERAGE_ICONS, LegalNotice, PlanRulesList } from './plan-facts'

interface PlanStepProps {
  plans: ClubPlan[]
  selectedId: string | null
  /** Métodos habilitados no clube (as formas do card = clube ∩ plano). */
  enabledMethods: readonly ClubPaymentMethod[]
  /** Por plano: por que o pedido já preenchido não cabe nele (idade, parentesco, limite). */
  fitIssues: Record<string, string | null>
  onSelect: (planId: string) => void
  /** Comparativo completo da vitrine (abre em outra aba para não perder o pedido). */
  compareHref?: string
}

/** Coberturas-chave no card; o resto fica no comparativo e no regulamento. */
const MAX_COVERAGES = 3
/** Planos sem coberturas estruturadas (API antiga) mostram os destaques em texto. */
const MAX_FEATURES = 5

export function PlanStep({ plans, selectedId, enabledMethods, fitIssues, onSelect, compareHref }: PlanStepProps) {
  return (
    <fieldset className="space-y-6">
      <legend className="sr-only">Planos disponíveis</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map(plan => {
          const selected = plan.id === selectedId
          const badge = planBadge(plan)
          const issue = fitIssues[plan.id] ?? null
          const [whole, cents] = formatBRL(plan.priceMonthly).replace(/^R\$\s?/, '').split(',')
          const coverages = plan.coverages ?? []
          const extraCoverages = coverages.length - MAX_COVERAGES
          const extraFeatures = plan.features.length - MAX_FEATURES
          const pitch = plan.tagline?.trim() || plan.description

          return (
            <label
              key={plan.id}
              className={cn(
                'relative flex cursor-pointer flex-col rounded-2xl border-2 bg-card p-5 text-left shadow-sm transition-all',
                'hover:-translate-y-0.5 hover:shadow-md has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2',
                selected ? 'border-primary shadow-md' : 'border-transparent ring-1 ring-border',
              )}
            >
              <input
                type="radio"
                name="plano"
                value={plan.id}
                checked={selected}
                onChange={() => onSelect(plan.id)}
                className="sr-only"
              />

              {badge ? (
                <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground shadow-sm">
                  <Award className="size-3" aria-hidden />
                  {badge}
                </span>
              ) : null}

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-bold leading-tight text-foreground">{plan.name}</h3>
                  {plan.audience ? <p className="mt-0.5 text-xs font-medium text-muted-foreground">{plan.audience}</p> : null}
                </div>
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                    selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background',
                  )}
                  aria-hidden
                >
                  {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>
              </div>

              <p className="mt-3 flex items-baseline gap-0.5 text-foreground">
                <span className="text-sm font-semibold">R$</span>
                <span className="font-display text-4xl font-extrabold tracking-tight">{whole}</span>
                <span className="text-lg font-bold">,{cents}</span>
                <span className="ml-1 text-sm text-muted-foreground">/mês</span>
              </p>

              {pitch ? <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pitch}</p> : null}

              {coverages.length > 0 ? (
                <ul className="mt-4 space-y-2.5">
                  {coverages.slice(0, MAX_COVERAGES).map(coverage => {
                    const Icon = COVERAGE_ICONS[coverage.category]
                    return (
                      <li key={coverage.id} className="flex items-start gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 text-sm leading-tight">
                          <span className="block font-medium text-foreground">{coverage.title}</span>
                          <span className="block text-xs text-muted-foreground">{describeCoverageValue(coverage)}</span>
                        </span>
                      </li>
                    )
                  })}
                  {extraCoverages > 0 ? (
                    <li className="pl-9.5 text-xs font-medium text-muted-foreground">
                      + {extraCoverages} cobertura{extraCoverages === 1 ? '' : 's'}
                    </li>
                  ) : null}
                </ul>
              ) : plan.features.length > 0 ? (
                <ul className="mt-4 space-y-2 text-sm">
                  {plan.features.slice(0, MAX_FEATURES).map(feature => (
                    <li key={feature} className="flex items-start gap-2 text-foreground/90">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {extraFeatures > 0 ? (
                    <li className="pl-6 text-xs font-medium text-muted-foreground">+ {extraFeatures} benefícios</li>
                  ) : null}
                </ul>
              ) : null}

              <div className="mt-auto space-y-3 pt-5">
                <PlanRulesList
                  plan={plan}
                  enabledMethods={enabledMethods}
                  dependentsLabel={dependentsPolicy(plan).label}
                  className="border-t pt-4"
                />
                {issue ? (
                  <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>{issue}</span>
                  </p>
                ) : null}
              </div>
            </label>
          )
        })}
      </div>

      <div className="space-y-3">
        {compareHref ? (
          <a
            href={compareHref}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Comparar todas as coberturas e regras
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        ) : null}
        <LegalNotice />
      </div>
    </fieldset>
  )
}
