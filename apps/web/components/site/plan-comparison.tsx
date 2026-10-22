'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, ChevronRight, Clock, Minus, ScrollText } from 'lucide-react'
import {
  CLUB_COVERAGE_CATEGORY_LABELS,
  clubCoverageCategory,
  describeCoverageValue,
  describeDependentsPolicy,
  describeWaitingPeriod,
  type ClubCoverageCategory,
  type ClubPaymentMethod,
  type ClubPlanCoverage,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { brl, normalize } from './format'
import { PlanDetailsDialog } from './plan-details-dialog'
import { PLAN_RULES, PlanLegalNotice, coverageIcon, hasDependentsInfo, planBadge, planCoverages, type PlanRuleDef } from './plan-ui'
import { Reveal, Section, SectionHeader } from './section'
import { usePublicPaymentMethods, type VitrinePlan } from './use-public-plans'
import { useVitrine } from './vitrine-context'

interface CoverageRow {
  key: string
  title: string
  /** Menor posição da cobertura entre os planos: a ordem que o admin definiu. */
  order: number
  /** Cobertura de cada plano, na ordem de `plans`; `null` = o plano não tem. */
  cells: (ClubPlanCoverage | null)[]
}

interface CoverageRowGroup {
  category: ClubCoverageCategory
  label: string
  rows: CoverageRow[]
}

/**
 * União das coberturas dos planos, casadas por categoria + título (sem
 * acento/caixa). Grupos na ordem das categorias; dentro do grupo, a ordem em
 * que os planos listam as coberturas e, no empate, o título.
 */
function coverageMatrix(plans: readonly VitrinePlan[]): CoverageRowGroup[] {
  const rows = new Map<string, CoverageRow & { category: ClubCoverageCategory }>()
  plans.forEach((plan, planIndex) => {
    planCoverages(plan).forEach((coverage, position) => {
      const key = `${coverage.category}|${normalize(coverage.title)}`
      let row = rows.get(key)
      if (!row) {
        row = { key, title: coverage.title, category: coverage.category, order: position, cells: plans.map(() => null) }
        rows.set(key, row)
      }
      row.order = Math.min(row.order, position)
      if (!row.cells[planIndex]) row.cells[planIndex] = coverage
    })
  })
  const all = [...rows.values()]
  return clubCoverageCategory.options
    .map(category => ({
      category,
      label: CLUB_COVERAGE_CATEGORY_LABELS[category],
      rows: all
        .filter(row => row.category === category)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'pt-BR')),
    }))
    .filter(group => group.rows.length > 0)
}

function NotIncluded({ className, label = 'Não incluso' }: { className?: string; label?: string }) {
  return (
    <>
      <Minus className={cn('size-5 text-muted-foreground/50', className)} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </>
  )
}

/** Comparativo da página `/planos`: tabela no desktop, abas por plano no celular. */
export function PlanComparison() {
  const { plans, tenant } = useVitrine()
  const enabledMethods = usePublicPaymentMethods(tenant.slug)
  const groups = useMemo(() => coverageMatrix(plans), [plans])
  // A seção só existe depois que os planos chegam (busca no cliente). Numa carga
  // completa de `/planos#comparativo` (o "Comparar" do checkout abre aba nova) o
  // navegador já desistiu da âncora quando ela aparece: rola até ela nessa hora.
  const ready = plans.length >= 2
  useEffect(() => {
    if (ready && window.location.hash === '#comparativo') {
      document.getElementById('comparativo')?.scrollIntoView({ block: 'start' })
    }
  }, [ready])

  if (plans.length < 2) return null
  if (groups.length === 0) return <LegacyPlanComparison />

  const rules = PLAN_RULES.filter(rule => plans.some(plan => rule.known(plan, enabledMethods)))

  return (
    <Section id="comparativo" tone="white" labelledBy="comparativo-titulo">
      <SectionHeader
        id="comparativo-titulo"
        eyebrow="Comparativo"
        title="Compare os planos lado a lado"
        description="Coberturas, carências e regras de cada plano, para você escolher sem letra miúda."
      />
      <Reveal>
        <ComparisonTable plans={plans} groups={groups} rules={rules} enabledMethods={enabledMethods} />
        <ComparisonTabs plans={plans} groups={groups} rules={rules} enabledMethods={enabledMethods} />
        <PlanLegalNotice className="mt-8 bg-white" />
      </Reveal>
    </Section>
  )
}

interface ComparisonProps {
  plans: VitrinePlan[]
  groups: CoverageRowGroup[]
  rules: readonly PlanRuleDef[]
  enabledMethods: readonly ClubPaymentMethod[] | null
}

function CoverageValue({ coverage, align = 'center' }: { coverage: ClubPlanCoverage; align?: 'center' | 'right' }) {
  return (
    <span className={cn('block', align === 'center' ? 'text-center' : 'text-right')}>
      <span className="block font-semibold text-foreground">{describeCoverageValue(coverage)}</span>
      <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
        {coverage.waitingDays > 0 ? (
          <Clock className="size-3 shrink-0" aria-hidden="true" />
        ) : (
          <Check className="size-3 shrink-0" aria-hidden="true" />
        )}
        {describeWaitingPeriod(coverage.waitingDays)}
      </span>
    </span>
  )
}

function ComparisonTable({ plans, groups, rules, enabledMethods }: ComparisonProps) {
  const { content, paths } = useVitrine()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const columns = plans.length + 1
  const tint = (plan: VitrinePlan) => (plan.highlight ? 'bg-primary/[0.04]' : '')

  const toggle = (key: string) =>
    setExpanded(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="hidden overflow-clip rounded-3xl bg-white ring-1 ring-border/70 lg:block">
      <table className="w-full border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">Coberturas, carências e regras de cada plano</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky top-[72px] z-10 w-[28%] border-b border-border/70 bg-white px-5 py-4 align-bottom text-sm font-semibold text-muted-foreground"
            >
              Cobertura
            </th>
            {plans.map(plan => {
              const badge = planBadge(plan, content.plans.highlightLabel)
              return (
                <th
                  key={plan.id}
                  scope="col"
                  className={cn(
                    'sticky top-[72px] z-10 border-b border-border/70 px-4 py-4 text-center align-bottom',
                    // Cabeçalho fixo precisa de fundo opaco: o tom do destaque misturado ao branco.
                    plan.highlight ? 'bg-[color-mix(in_oklab,var(--primary)_4%,white)]' : 'bg-white',
                  )}
                >
                  {badge && <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-primary">{badge}</span>}
                  <span className="block text-base font-bold text-foreground">{plan.name}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{brl(plan.priceMonthly)}</span>/mês
                  </span>
                  <Button
                    size="sm"
                    variant={plan.highlight ? 'default' : 'outline'}
                    className="mt-3 h-9 rounded-full px-5 font-semibold"
                    asChild
                  >
                    <Link href={paths.checkout(plan.id)} aria-label={`${content.plans.cta}: plano ${plan.name}`}>
                      Assinar
                    </Link>
                  </Button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map(group => {
            const Icon = coverageIcon(group.category)
            return (
              <Fragment key={group.category}>
                <tr>
                  <th
                    colSpan={columns}
                    scope="colgroup"
                    className="border-b border-border/60 bg-accent/50 px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon className="size-4 text-primary" aria-hidden="true" />
                      {group.label}
                    </span>
                  </th>
                </tr>
                {group.rows.map(row => (
                  <tr key={row.key}>
                    <th scope="row" className="border-b border-border/60 px-5 py-3.5 font-medium text-foreground">
                      {row.title}
                    </th>
                    {plans.map((plan, index) => {
                      const coverage = row.cells[index] ?? null
                      return (
                        <td key={plan.id} className={cn('border-b border-border/60 px-4 py-3.5 text-center', tint(plan))}>
                          {coverage ? <CoverageValue coverage={coverage} /> : <NotIncluded className="mx-auto" />}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            )
          })}

          {rules.length > 0 && (
            <tr>
              <th
                colSpan={columns}
                scope="colgroup"
                className="border-b border-border/60 bg-accent/50 px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                <span className="inline-flex items-center gap-2">
                  <ScrollText className="size-4 text-primary" aria-hidden="true" />
                  Regras
                </span>
              </th>
            </tr>
          )}
          {rules.map(rule => {
            const isOpen = expanded.has(rule.key)
            return (
              <tr key={rule.key}>
                <th scope="row" className="border-b border-border/60 px-5 py-3.5 align-top font-medium text-foreground">
                  {rule.label}
                  {rule.long && (
                    <button
                      type="button"
                      onClick={() => toggle(rule.key)}
                      aria-expanded={isOpen}
                      className="mt-1 block rounded text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {isOpen ? 'Mostrar menos' : 'Ler o texto completo'}
                    </button>
                  )}
                </th>
                {plans.map(plan => (
                  <td
                    key={plan.id}
                    className={cn(
                      'border-b border-border/60 px-4 py-3.5 align-top',
                      rule.long ? 'text-left text-xs leading-relaxed text-muted-foreground' : 'text-center text-foreground',
                      tint(plan),
                    )}
                  >
                    {rule.known(plan, enabledMethods) ? (
                      <span className={cn('block', rule.long && !isOpen && 'line-clamp-4')}>{rule.render(plan, enabledMethods)}</span>
                    ) : (
                      <NotIncluded className="mx-auto" label="Não informado" />
                    )}
                  </td>
                ))}
              </tr>
            )
          })}

          <tr>
            <td className="px-5 py-4" />
            {plans.map(plan => (
              <td key={plan.id} className={cn('px-4 py-4 text-center', tint(plan))}>
                <PlanDetailsDialog
                  plan={plan}
                  trigger={
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Detalhes e regulamento
                      <span className="sr-only">do plano {plan.name}</span>
                      <ChevronRight className="size-4" aria-hidden="true" />
                    </button>
                  }
                />
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ComparisonTabs({ plans, groups, rules, enabledMethods }: ComparisonProps) {
  const { content, paths } = useVitrine()
  const initial = (plans.find(plan => plan.highlight) ?? plans[0])?.id

  return (
    <div className="lg:hidden">
      <Tabs defaultValue={initial} className="gap-4">
        <TabsList
          aria-label="Escolha um plano para ver os detalhes"
          className="h-auto w-full gap-1 overflow-x-auto rounded-2xl bg-accent/70 p-1"
          style={
            plans.length <= 4
              ? { display: 'grid', gridTemplateColumns: `repeat(${plans.length}, minmax(0, 1fr))` }
              : { display: 'flex', justifyContent: 'flex-start' }
          }
        >
          {plans.map(plan => (
            <TabsTrigger
              key={plan.id}
              value={plan.id}
              className="h-11 min-w-0 rounded-xl px-2 text-sm font-semibold data-[state=active]:text-primary"
            >
              <span className="truncate">{plan.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {plans.map((plan, planIndex) => {
          const badge = planBadge(plan, content.plans.highlightLabel)
          const known = rules.filter(rule => rule.known(plan, enabledMethods))
          return (
            <TabsContent key={plan.id} value={plan.id}>
              <article aria-label={`Plano ${plan.name}`} className="rounded-3xl bg-white p-5 ring-1 ring-border/70 sm:p-6">
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {badge && <p className="text-[11px] font-bold uppercase tracking-wide text-primary">{badge}</p>}
                    <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      <span className="text-lg font-bold text-foreground">{brl(plan.priceMonthly)}</span>/mês
                    </p>
                  </div>
                  <Button size="sm" variant={plan.highlight ? 'default' : 'outline'} className="h-10 shrink-0 rounded-full px-5 font-semibold" asChild>
                    <Link href={paths.checkout(plan.id)} aria-label={`${content.plans.cta}: plano ${plan.name}`}>
                      Assinar
                    </Link>
                  </Button>
                </header>

                {groups.map(group => {
                  const Icon = coverageIcon(group.category)
                  return (
                    <section key={group.category} aria-label={group.label} className="mt-5">
                      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        <Icon className="size-4 text-primary" aria-hidden="true" />
                        {group.label}
                      </p>
                      <ul className="mt-1 divide-y divide-border/60">
                        {group.rows.map(row => {
                          const coverage = row.cells[planIndex] ?? null
                          return (
                            <li key={row.key} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                              <span className={cn('min-w-0', coverage ? 'text-foreground' : 'text-muted-foreground')}>{row.title}</span>
                              {coverage ? (
                                <span className="max-w-[55%] shrink-0">
                                  <CoverageValue coverage={coverage} align="right" />
                                </span>
                              ) : (
                                <span className="shrink-0 text-muted-foreground">Não incluso</span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )
                })}

                {known.length > 0 && (
                  <section aria-label="Regras" className="mt-6">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      <ScrollText className="size-4 text-primary" aria-hidden="true" />
                      Regras
                    </p>
                    <dl className="mt-1 divide-y divide-border/60">
                      {known.map(rule => (
                        <div key={rule.key} className="py-2.5 text-sm">
                          <dt className="font-medium text-foreground">{rule.label}</dt>
                          <dd className={cn('mt-0.5 text-muted-foreground', rule.long && 'text-xs leading-relaxed')}>
                            {rule.render(plan, enabledMethods)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                )}

                <PlanDetailsDialog
                  plan={plan}
                  trigger={
                    <Button variant="outline" className="mt-5 h-11 w-full rounded-full font-semibold">
                      Detalhes e regulamento
                    </Button>
                  }
                />
              </article>
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

/** API sem coberturas estruturadas: a tabela recurso × plano de antes (`features`). */
function LegacyPlanComparison() {
  const { plans, paths, content } = useVitrine()

  const features: string[] = []
  for (const plan of plans) {
    for (const feature of plan.features) if (!features.includes(feature)) features.push(feature)
  }
  const anyDeps = plans.some(hasDependentsInfo)
  const anyAudience = plans.some(p => p.audience)

  return (
    <Section id="comparativo" tone="white" labelledBy="comparativo-titulo">
      <SectionHeader id="comparativo-titulo" eyebrow="Comparativo" title="Compare os planos lado a lado" />
      <Reveal>
        <div className="overflow-x-auto rounded-3xl ring-1 ring-border/70">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <caption className="sr-only">Recursos incluídos em cada plano</caption>
            <thead>
              <tr className="bg-accent/60">
                <th scope="col" className="w-[34%] px-5 py-4 font-semibold text-muted-foreground">
                  Recurso
                </th>
                {plans.map(plan => (
                  <th key={plan.id} scope="col" className="px-5 py-4 text-center align-bottom">
                    {plan.highlight && (
                      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-primary">
                        {content.plans.highlightLabel}
                      </span>
                    )}
                    <span className="block text-base font-bold text-foreground">{plan.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              <tr>
                <th scope="row" className="px-5 py-4 font-medium text-foreground">
                  Mensalidade
                </th>
                {plans.map(plan => (
                  <td key={plan.id} className="px-5 py-4 text-center font-bold text-foreground">
                    {brl(plan.priceMonthly)}
                  </td>
                ))}
              </tr>
              {anyAudience && (
                <tr>
                  <th scope="row" className="px-5 py-4 font-medium text-foreground">
                    Indicado para
                  </th>
                  {plans.map(plan => (
                    <td key={plan.id} className="px-5 py-4 text-center text-muted-foreground">
                      {plan.audience ?? '—'}
                    </td>
                  ))}
                </tr>
              )}
              {anyDeps && (
                <tr>
                  <th scope="row" className="px-5 py-4 font-medium text-foreground">
                    Dependentes
                  </th>
                  {plans.map(plan => (
                    <td key={plan.id} className="px-5 py-4 text-center text-muted-foreground">
                      {hasDependentsInfo(plan) ? describeDependentsPolicy(plan) : '—'}
                    </td>
                  ))}
                </tr>
              )}
              {features.map(feature => (
                <tr key={feature}>
                  <th scope="row" className="px-5 py-4 font-normal text-foreground">
                    {feature}
                  </th>
                  {plans.map(plan => (
                    <td key={plan.id} className="px-5 py-4 text-center">
                      {plan.features.includes(feature) ? (
                        <Check className="mx-auto size-5 text-primary" role="img" aria-label="Incluído" />
                      ) : (
                        <Minus className="mx-auto size-5 text-muted-foreground/50" role="img" aria-label="Não incluído" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-accent/30">
                <td className="px-5 py-5" />
                {plans.map(plan => (
                  <td key={plan.id} className="px-4 py-5 text-center">
                    <Button size="sm" variant={plan.highlight ? 'default' : 'outline'} className="h-10 rounded-full px-5 font-semibold" asChild>
                      <Link href={paths.checkout(plan.id)} aria-label={`${content.plans.cta}: plano ${plan.name}`}>
                        {content.plans.cta}
                      </Link>
                    </Button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <PlanLegalNotice className="mt-8 bg-white" />
      </Reveal>
    </Section>
  )
}
