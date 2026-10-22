'use client'

import Link from 'next/link'
import { ArrowRight, CalendarCheck, Check, ChevronRight, MessageCircle, Receipt, Sparkles, Users } from 'lucide-react'
import {
  CLUB_COVERAGE_CATEGORY_LABELS,
  describeCoverageValue,
  describeDependentsPolicy,
  describeLoyalty,
  type ClubPlanCoverage,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { brl, perDayCeiling, priceParts } from './format'
import { PlanDetailsDialog } from './plan-details-dialog'
import { EnrollmentFeeText, PlanLegalNotice, coverageIcon, hasDependentsInfo, planBadge, planCoverages } from './plan-ui'
import { Reveal, Section, SectionHeader } from './section'
import type { VitrinePlan } from './use-public-plans'
import { useVitrine } from './vitrine-context'

// O comparativo mora em `plan-comparison.tsx`; reexportado aqui para quem já importava daqui.
export { PlanComparison } from './plan-comparison'

/** Coberturas em destaque no card (na ordem do plano); as demais ficam em "Ver todas". */
const CARD_COVERAGES = 4

/** "a", "a e b", "a, b e c". */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

/** Categorias das coberturas que não couberam no card e ainda não apareceram nele. */
function otherCategories(shown: readonly ClubPlanCoverage[], rest: readonly ClubPlanCoverage[]): string[] {
  const seen = new Set(shown.map(coverage => coverage.category))
  const labels: string[] = []
  for (const coverage of rest) {
    if (seen.has(coverage.category)) continue
    seen.add(coverage.category)
    labels.push(CLUB_COVERAGE_CATEGORY_LABELS[coverage.category])
  }
  return labels
}

export function PlanCard({ plan }: { plan: VitrinePlan }) {
  const { content, paths } = useVitrine()
  const { integer, cents } = priceParts(plan.priceMonthly)
  const perDay = perDayCeiling(plan.priceMonthly)
  const featured = plan.highlight
  const badge = planBadge(plan, content.plans.highlightLabel)
  const coverages = planCoverages(plan)
  const structured = coverages.length > 0
  const keyCoverages = coverages.slice(0, CARD_COVERAGES)
  const hiddenCount = coverages.length - keyCoverages.length
  const moreCategories = otherCategories(keyCoverages, coverages.slice(CARD_COVERAGES))
  const headline = plan.tagline?.trim() || plan.description
  const showEnrollment = plan.enrollmentFee !== undefined || plan.enrollmentFeeWaived !== undefined
  const showLoyalty = plan.loyaltyMonths !== undefined

  return (
    <article
      aria-labelledby={`plano-${plan.id}`}
      className={cn(
        'relative flex h-full flex-col rounded-3xl bg-white p-6 transition-shadow sm:p-7',
        featured
          ? 'shadow-2xl shadow-primary/15 ring-2 ring-primary lg:-translate-y-2'
          : 'shadow-sm ring-1 ring-border/70 hover:shadow-lg',
      )}
    >
      {badge && (
        <span
          className={cn(
            'absolute -top-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide shadow-lg',
            featured ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
          )}
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          {badge}
        </span>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`plano-${plan.id}`} className="text-xl font-bold text-foreground">
          {plan.name}
        </h3>
        {plan.audience && (
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">{plan.audience}</span>
        )}
      </div>
      {headline && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{headline}</p>}

      <div className="mt-6">
        <p className="flex items-start text-foreground">
          <span className="sr-only">{brl(plan.priceMonthly)} por mês</span>
          <span className="mr-1 mt-2 text-base font-semibold" aria-hidden="true">
            R$
          </span>
          <span className="text-5xl font-bold tracking-tight" aria-hidden="true">
            {integer}
          </span>
          <span className="mt-2 flex flex-col text-base font-semibold leading-none" aria-hidden="true">
            ,{cents}
            <span className="mt-1 text-xs font-medium text-muted-foreground">/mês</span>
          </span>
        </p>
        {perDay && <p className="mt-2 text-sm text-muted-foreground">menos de {brl(perDay)} por dia</p>}
      </div>

      {hasDependentsInfo(plan) && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-accent/70 px-4 py-3 text-sm font-medium text-foreground">
          <Users className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {describeDependentsPolicy(plan)}
        </p>
      )}

      {structured ? (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Destaques do plano</p>
          <ul className="mt-3 space-y-3.5">
            {keyCoverages.map(coverage => {
              const Icon = coverageIcon(coverage.category)
              return (
                <li key={coverage.id} className="flex items-start gap-3">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 text-sm leading-snug">
                    <span className="block font-medium text-foreground">{coverage.title}</span>
                    <span className="block font-semibold text-primary">{describeCoverageValue(coverage)}</span>
                  </span>
                </li>
              )
            })}
          </ul>

          {hiddenCount > 0 && moreCategories.length > 0 && (
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">
                + {hiddenCount} {hiddenCount === 1 ? 'cobertura' : 'coberturas'}
              </span>{' '}
              em {joinList(moreCategories)}
            </p>
          )}

          <PlanDetailsDialog
            plan={plan}
            trigger={
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-1 rounded-md text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {coverages.length > keyCoverages.length ? `Ver todas as ${coverages.length} coberturas` : 'Ver coberturas e regras'}
                <ChevronRight className="size-4" aria-hidden="true" />
                <span className="sr-only">do plano {plan.name}</span>
              </button>
            }
          />
        </div>
      ) : (
        plan.features.length > 0 && (
          <ul className="mt-6 space-y-3 text-sm">
            {plan.features.map(feature => (
              <li key={feature} className="flex items-start gap-3 text-foreground">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        )
      )}

      {(showEnrollment || showLoyalty) && (
        <ul className="mt-6 space-y-2 border-t border-border/70 pt-5 text-sm text-foreground">
          {showEnrollment && (
            <li className="flex items-start gap-2.5">
              <Receipt className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <EnrollmentFeeText plan={plan} className="font-medium" />
            </li>
          )}
          {showLoyalty && (
            <li className="flex items-start gap-2.5">
              <CalendarCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="font-medium">{describeLoyalty(plan.loyaltyMonths)}</span>
            </li>
          )}
        </ul>
      )}

      <div className="mt-auto pt-8">
        <Button
          size="lg"
          variant={featured ? 'default' : 'outline'}
          className={cn('h-12 w-full rounded-full text-base font-semibold', !featured && 'border-2 border-primary/30 text-primary hover:bg-primary hover:text-primary-foreground')}
          asChild
        >
          <Link href={paths.checkout(plan.id)} aria-label={`${content.plans.cta}: plano ${plan.name}`}>
            {content.plans.cta}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </article>
  )
}

export function PlansGrid() {
  const { plans, plansLoading, plansError, content, paths, whatsapp } = useVitrine()

  if (plansLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-4 rounded-3xl bg-white p-7 ring-1 ring-border/60">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-12 w-full rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (plans.length === 0) {
    return (
      <Reveal>
        <div className="mx-auto max-w-2xl rounded-3xl border border-dashed border-primary/40 bg-white p-8 text-center sm:p-10">
          <h3 className="text-xl font-bold text-foreground">
            {plansError ? 'Não foi possível carregar os planos agora' : content.plans.emptyTitle}
          </h3>
          <p className="mt-2 text-muted-foreground">{content.plans.emptyText}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" className="h-12 rounded-full px-7 font-semibold" asChild>
              <Link href={paths.signup}>{content.plans.emptyCta}</Link>
            </Button>
            {whatsapp && (
              <Button size="lg" variant="outline" className="h-12 rounded-full px-7 font-semibold" asChild>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4" aria-hidden="true" />
                  WhatsApp
                </a>
              </Button>
            )}
          </div>
        </div>
      </Reveal>
    )
  }

  const columns =
    plans.length === 1
      ? 'mx-auto max-w-md'
      : plans.length === 2
        ? 'mx-auto max-w-4xl md:grid-cols-2'
        : plans.length === 3
          ? 'md:grid-cols-2 lg:grid-cols-3'
          : 'md:grid-cols-2 xl:grid-cols-4'

  return (
    <>
      <div className={cn('grid items-stretch gap-6 pt-4', columns)}>
        {plans.map((plan, index) => (
          <Reveal key={plan.id} delay={index * 0.06} className={cn('h-full', plan.highlight && 'order-first md:order-none')}>
            <PlanCard plan={plan} />
          </Reveal>
        ))}
      </div>
      <PlanLegalNotice className="mx-auto mt-8 max-w-3xl bg-white" />
    </>
  )
}

/** Seção de planos da landing — é o alvo de todo "Ver planos e preços". */
export function PlansSection({
  showCompareLink = true,
  tone = 'soft',
}: {
  showCompareLink?: boolean
  tone?: 'white' | 'soft'
}) {
  const { content, paths, plans } = useVitrine()
  return (
    <Section id="planos" tone={tone} labelledBy="planos-titulo">
      <SectionHeader id="planos-titulo" eyebrow={content.plans.eyebrow} title={content.plans.title} description={content.plans.description} />
      <PlansGrid />
      {showCompareLink && plans.length > 1 && (
        <p className="mt-8 text-center">
          <Link
            href={`${paths.plans}#comparativo`}
            className="inline-flex items-center gap-1.5 rounded font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {content.plans.compareCta}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </p>
      )}
    </Section>
  )
}
