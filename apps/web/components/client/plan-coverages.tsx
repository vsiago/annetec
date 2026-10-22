'use client'

import Link from 'next/link'
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  CircleX,
  Clock,
  CreditCard,
  HeartHandshake,
  Lock,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'
import {
  CLUB_COVERAGE_CHANNEL_LABELS,
  describeCoverageValue,
  describeDependentRules,
  describeLoyalty,
  describeWaitingPeriod,
  formatDateBR,
  type ClubPlan,
  type ClubPlanCoverage,
  type MyClubMembership,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PlanLegalNotice, PlanRulesList, PlanTerms, coverageIcon, planCoverages } from '@/components/site/plan-ui'
import { usePublicPlans } from '@/components/site/use-public-plans'
import {
  coverageAccess,
  coverageAccessSummary,
  paymentMethodLabel,
  pluralize,
  subscriptionDependentsPolicy,
  type CoverageAccess,
  type CoverageAccessState,
  type CoverageAccessSummary,
} from '@/lib/adapters/cliente-assinatura'
import { cn } from '@/lib/utils'
import { StatusNotice, ToneBadge } from './status-ui'

/**
 * Plano do associado com o modelo completo: o que a API manda junto da
 * assinatura (`membership.plan`) ou, enquanto ela não manda, o da vitrine
 * pública com o mesmo id. Sem plano com coberturas estruturadas, quem usa
 * mantém a tela de antes.
 */
export function useMembershipPlan(
  membership: MyClubMembership | null,
  tenantSlug: string,
): { plan: ClubPlan | null; isLoading: boolean } {
  const direct = membership?.plan ?? null
  const planId = membership?.subscription.planId ?? null
  const needsFallback = !!membership && !direct && !!planId
  const { plans, isLoading } = usePublicPlans(needsFallback ? tenantSlug : undefined)

  if (direct) return { plan: direct, isLoading: false }
  if (!needsFallback) return { plan: null, isLoading: false }
  const found = plans.find(plan => plan.id === planId) ?? null
  return { plan: found, isLoading: !found && isLoading }
}

/** O plano tem coberturas estruturadas para o portal mostrar? */
export function hasPlanCoverages(plan: ClubPlan | null): plan is ClubPlan {
  return planCoverages(plan).length > 0
}

const ACCESS_ICON: Record<CoverageAccessState, LucideIcon> = {
  available: CheckCircle2,
  waiting: Clock,
  awaiting_payment: Clock,
  blocked: Lock,
  ended: CircleX,
}

const ACCESS_DOT: Record<CoverageAccessState, string> = {
  available: 'bg-emerald-500',
  waiting: 'bg-amber-500',
  awaiting_payment: 'bg-slate-400',
  blocked: 'bg-red-500',
  ended: 'bg-slate-400',
}

/** Uma linha que resume a situação das coberturas. */
function summaryText(state: CoverageAccessState | null, summary: CoverageAccessSummary): string {
  if (state === 'awaiting_payment') return 'As coberturas liberam com a confirmação do 1º pagamento.'
  if (state === 'blocked') return 'Coberturas bloqueadas até a regularização da assinatura.'
  if (state === 'ended') return 'A assinatura foi cancelada; as coberturas deixaram de valer.'
  if (summary.waiting === 0) {
    return summary.total === 1 ? 'Sua cobertura está liberada.' : `Todas as ${summary.total} coberturas estão liberadas.`
  }
  const next = summary.next ? ` Próxima: ${summary.next.coverage.title}, em ${formatDateBR(summary.next.availableOn)}.` : ''
  return `${summary.available} de ${summary.total} liberadas.${next}`
}

function CoverageTile({ coverage, access }: { coverage: ClubPlanCoverage; access: CoverageAccess }) {
  const Icon = coverageIcon(coverage.category)
  const StatusIcon = ACCESS_ICON[access.state]
  const meta = [CLUB_COVERAGE_CHANNEL_LABELS[coverage.channel], coverage.provider].filter(Boolean).join(' · ')
  return (
    <li className="flex gap-3 rounded-xl border border-border/70 bg-card p-3.5">
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug text-foreground">{coverage.title}</p>
        <p className="text-sm font-semibold text-primary">{describeCoverageValue(coverage)}</p>
        {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
        {coverage.description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{coverage.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <ToneBadge tone={access.tone} className="gap-1">
            <StatusIcon className="size-3.5" aria-hidden="true" />
            {access.label}
          </ToneBadge>
          {access.state === 'waiting' && (
            <span className="text-xs text-muted-foreground">{describeWaitingPeriod(coverage.waitingDays)}</span>
          )}
        </div>
      </div>
    </li>
  )
}

/** Regras do plano como valem para ESTA assinatura (preço e inclusos são o retrato da contratação). */
function membershipRuleRows(membership: MyClubMembership, plan: ClubPlan) {
  const { subscription } = membership
  const rows: { key: string; label: string; icon: LucideIcon; value: React.ReactNode }[] = [
    {
      key: 'dependents',
      label: 'Dependentes',
      icon: Users,
      value: (
        <>
          {subscriptionDependentsPolicy(subscription, plan)}
          <span className="block text-xs">Na sua assinatura: {pluralize(subscription.dependents.length, 'dependente', 'dependentes')}</span>
        </>
      ),
    },
  ]
  if (plan.maxDependents !== 0 && plan.dependentRules !== undefined) {
    rows.push({ key: 'relationships', label: 'Parentescos aceitos', icon: HeartHandshake, value: describeDependentRules(plan) })
  }
  if (plan.loyaltyMonths !== undefined) {
    rows.push({ key: 'loyalty', label: 'Fidelidade', icon: CalendarCheck, value: describeLoyalty(plan.loyaltyMonths) })
  }
  rows.push({ key: 'payment', label: 'Forma de pagamento', icon: CreditCard, value: paymentMethodLabel(subscription.paymentMethod) })
  if (plan.cancellationPolicy?.trim()) {
    rows.push({ key: 'cancellation', label: 'Cancelamento', icon: CircleX, value: plan.cancellationPolicy })
  }
  if (plan.adjustmentPolicy?.trim()) {
    rows.push({ key: 'adjustment', label: 'Reajuste', icon: TrendingUp, value: plan.adjustmentPolicy })
  }
  return rows
}

/**
 * Coberturas do plano do associado, cada uma com a situação calculada da
 * ativação ("Liberado" / "Libera em dd/mm/aaaa"), mais as regras, o
 * regulamento e o aviso legal. Topo da página Benefícios.
 */
export function PlanCoverages({
  membership,
  plan,
  tenantSlug,
}: {
  membership: MyClubMembership
  plan: ClubPlan
  tenantSlug: string
}) {
  const { subscription } = membership
  const coverages = planCoverages(plan)
  const today = new Date()
  const accesses = coverages.map(coverage => coverageAccess(subscription, coverage.waitingDays, today))
  const summary = coverageAccessSummary(subscription, coverages, today)
  const blockingState = accesses.find(access => access.state === 'awaiting_payment' || access.state === 'blocked' || access.state === 'ended')?.state ?? null
  const faturas = `/${tenantSlug}/cliente/faturas`

  return (
    <section aria-labelledby="coberturas-titulo" className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle id="coberturas-titulo" className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                  Coberturas do seu plano
                </CardTitle>
                <CardDescription className="mt-1">
                  {subscription.planName} · {summaryText(blockingState, summary)}
                </CardDescription>
              </div>
              {!blockingState && (
                <ToneBadge tone={summary.waiting === 0 ? 'success' : 'warning'}>
                  {summary.available} de {summary.total} liberadas
                </ToneBadge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {blockingState === 'awaiting_payment' && (
              <StatusNotice
                tone="neutral"
                icon={Clock}
                title="Suas coberturas liberam com o 1º pagamento"
                description="Assim que o pagamento for confirmado, a assinatura é ativada e a carência de cada cobertura começa a contar."
                actionHref={faturas}
                actionLabel="Ver fatura"
              />
            )}
            {blockingState === 'blocked' && (
              <StatusNotice
                tone="danger"
                icon={AlertTriangle}
                title="Coberturas bloqueadas"
                description="Sua assinatura está suspensa por falta de pagamento. Regularize a fatura para voltar a usar os benefícios."
                actionHref={faturas}
                actionLabel="Regularizar"
              />
            )}
            <ul className="grid gap-3 md:grid-cols-2">
              {coverages.map((coverage, index) => (
                <CoverageTile key={coverage.id} coverage={coverage} access={accesses[index] ?? coverageAccess(subscription, coverage.waitingDays, today)} />
              ))}
            </ul>
            {summary.waiting > 0 && subscription.startedAt && (
              <p className="text-xs text-muted-foreground">
                A carência conta a partir da ativação da sua assinatura, em {formatDateBR(subscription.startedAt)}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card id="regras" className="scroll-mt-20 border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Regras do seu plano</CardTitle>
            <CardDescription>Dependentes, fidelidade, cancelamento e regulamento</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PlanRulesList rows={membershipRuleRows(membership, plan)} stacked />
            <PlanTerms terms={plan.terms} planName={plan.name} />
          </CardContent>
        </Card>
      </div>
      <PlanLegalNotice />
    </section>
  )
}

export function PlanCoveragesSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="Carregando as coberturas do seu plano">
      <Skeleton className="h-80 w-full rounded-xl lg:col-span-2" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  )
}

/** Resumo das coberturas e regras no painel do associado, com atalho para Benefícios. */
export function PlanCoveragesSummary({
  membership,
  plan,
  tenantSlug,
}: {
  membership: MyClubMembership
  plan: ClubPlan
  tenantSlug: string
}) {
  const { subscription } = membership
  const coverages = planCoverages(plan)
  const today = new Date()
  const accesses = coverages.map(coverage => coverageAccess(subscription, coverage.waitingDays, today))
  const summary = coverageAccessSummary(subscription, coverages, today)
  const blockingState = accesses.find(access => access.state !== 'available' && access.state !== 'waiting')?.state ?? null
  const shown = coverages.slice(0, 6)
  const base = `/${tenantSlug}/cliente/beneficios`
  const progress = summary.total > 0 ? Math.round((summary.available / summary.total) * 100) : 0

  return (
    <Card className="gap-0 border-0 py-0 shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              Coberturas do plano
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{summaryText(blockingState, summary)}</p>
            {!blockingState && (
              <div
                className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label="Coberturas liberadas"
                aria-valuemin={0}
                aria-valuemax={summary.total}
                aria-valuenow={summary.available}
                aria-valuetext={`${summary.available} de ${summary.total} liberadas`}
              >
                <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            )}
            <ul className="mt-4 flex flex-wrap gap-2">
              {shown.map((coverage, index) => {
                const Icon = coverageIcon(coverage.category)
                const access = accesses[index]
                return (
                  <li
                    key={coverage.id}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate">{coverage.title}</span>
                    {access && (
                      <>
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', ACCESS_DOT[access.state])} aria-hidden="true" />
                        <span className="sr-only">({access.label})</span>
                      </>
                    )}
                  </li>
                )
              })}
              {coverages.length > shown.length && (
                <li className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  +{coverages.length - shown.length}
                </li>
              )}
            </ul>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:w-80 lg:grid-cols-1">
            <div>
              <dt className="text-xs text-muted-foreground">Dependentes</dt>
              <dd className="font-medium">{subscriptionDependentsPolicy(subscription, plan)}</dd>
            </div>
            {plan.loyaltyMonths !== undefined && (
              <div>
                <dt className="text-xs text-muted-foreground">Fidelidade</dt>
                <dd className="font-medium">{describeLoyalty(plan.loyaltyMonths)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="sm:w-auto">
            <Link href={base}>
              Ver coberturas e carências
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="ghost" className="sm:w-auto">
            <Link href={`${base}#regras`}>Cancelamento e regulamento</Link>
          </Button>
        </div>

        <PlanLegalNotice className="mt-5 border-0 bg-muted/40" />
      </CardContent>
    </Card>
  )
}
