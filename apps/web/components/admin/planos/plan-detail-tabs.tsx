'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Check, ChevronDown, Handshake, MapPin, Minus, MonitorSmartphone, Plus, Sparkles, TriangleAlert } from 'lucide-react'
import {
  CLUB_COVERAGE_CATEGORY_LABELS,
  CLUB_COVERAGE_CHANNEL_LABELS,
  CLUB_PAYMENT_METHOD_LABELS,
  DEPENDENT_RELATIONSHIP_LABELS,
  clubCoverageCategory,
  clubPaymentMethod,
  dependentRulesOf,
  describeCoverageValue,
  describeDependentsPolicy,
  describeEnrollmentFee,
  describeLoyalty,
  describeWaitingPeriod,
  effectivePaymentMethods,
  formatBRL,
  holderAgeRange,
  quoteClubPlan,
  type ClubCoverageChannel,
  type ClubPaymentMethod,
  type ClubPlan,
} from '@annetec/contracts'
import { EmptyState } from '@/components/dashboard/empty-state'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { MAX_DEPENDENTS_LIMIT } from '@/lib/adapters/planos'
import { cn } from '@/lib/utils'
import { Chip, CoverageIcon, LegalNotice, Panel, RuleRow } from './plan-ui'

const CHANNEL_ICONS: Record<ClubCoverageChannel, typeof MapPin> = {
  in_person: MapPin,
  online: MonitorSmartphone,
  both: MonitorSmartphone,
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  )
}

/** Formas que o checkout oferece: clube ∩ plano; `null` = não deu para ler as do clube. */
function paymentSummary(plan: ClubPlan, enabledMethods: readonly ClubPaymentMethod[] | null): string {
  if (!enabledMethods) {
    return plan.paymentMethods?.length
      ? plan.paymentMethods.map(method => CLUB_PAYMENT_METHOD_LABELS[method]).join(', ')
      : 'Todas as habilitadas no clube'
  }
  const effective = effectivePaymentMethods(plan, enabledMethods)
  return effective.length > 0
    ? effective.map(method => CLUB_PAYMENT_METHOD_LABELS[method]).join(', ')
    : 'Nenhuma forma disponível'
}

// ---------------------------------------------------------------------------
// Visão geral
// ---------------------------------------------------------------------------

export function PlanOverviewTab({
  plan,
  enabledMethods,
  editHref,
}: {
  plan: ClubPlan
  enabledMethods: readonly ClubPaymentMethod[] | null
  editHref: string
}) {
  const coverages = plan.coverages ?? []
  const longestWaiting = coverages.reduce((max, coverage) => Math.max(max, coverage.waitingDays), 0)
  const features = plan.features ?? []

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start">
      <div className="space-y-5">
        <Panel title="Resumo comercial">
          {plan.tagline && <p className="text-base font-medium leading-snug text-foreground">{plan.tagline}</p>}
          {plan.description ? (
            <p className={cn('whitespace-pre-line text-sm leading-relaxed text-muted-foreground', plan.tagline && 'mt-2')}>
              {plan.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sem descrição.{' '}
              <Link href={editHref} className="font-medium text-primary hover:underline">
                Escrever agora
              </Link>
            </p>
          )}
          <dl className="mt-6 grid gap-x-8 gap-y-5 border-t border-border/60 pt-6 sm:grid-cols-2">
            <Fact label="Público">{plan.audience ?? 'Não definido'}</Fact>
            <Fact label="Dependentes">{describeDependentsPolicy(plan)}</Fact>
            <Fact label="Adesão">{describeEnrollmentFee(plan)}</Fact>
            <Fact label="Fidelidade">{describeLoyalty(plan.loyaltyMonths)}</Fact>
            <Fact label="Pagamento">{paymentSummary(plan, enabledMethods)}</Fact>
            <Fact label="Coberturas">
              {coverages.length === 0
                ? 'Só destaques em texto'
                : `${coverages.length} ${coverages.length === 1 ? 'cobertura' : 'coberturas'} · ${
                    longestWaiting === 0 ? 'sem carência' : `carência de até ${longestWaiting} dias`
                  }`}
            </Fact>
          </dl>
        </Panel>

        <Panel title="Destaques do card" description="Os textos curtos que a vitrine mostra quando não há coberturas.">
          {features.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum destaque cadastrado.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {features.map(feature => (
                <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <PriceSimulator plan={plan} />
    </div>
  )
}

/** Simulador com `quoteClubPlan`: mensalidade, adesão e 1ª cobrança para 0..máx dependentes. */
function PriceSimulator({ plan }: { plan: ClubPlan }) {
  const cap = plan.maxDependents ?? null
  const max = cap === null ? MAX_DEPENDENTS_LIMIT : Math.min(cap, MAX_DEPENDENTS_LIMIT)
  const [count, setCount] = useState(() => Math.min(plan.includedDependents ?? 0, max))
  const quote = quoteClubPlan(plan, count)
  const includedUsed = Math.min(count, quote.includedDependents)

  return (
    <Panel title="Simulador de preço" description="O mesmo cálculo que o checkout cobra.">
      {cap === 0 ? (
        <p className="text-sm text-muted-foreground">Plano individual: só o titular.</p>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Dependentes</p>
            <p className="text-xs text-muted-foreground">{cap === null ? 'Sem limite no plano' : `Até ${cap} no plano`}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setCount(value => Math.max(0, value - 1))}
              disabled={count === 0}
              aria-label="Menos um dependente"
            >
              <Minus className="size-4" />
            </Button>
            <output className="w-8 text-center text-lg font-semibold tabular-nums" aria-live="polite">
              {count}
            </output>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setCount(value => Math.min(max, value + 1))}
              disabled={count >= max}
              aria-label="Mais um dependente"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <dl className="mt-5 space-y-2.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Mensalidade do titular</dt>
          <dd className="tabular-nums text-foreground">{formatBRL(quote.basePrice)}</dd>
        </div>
        {count > 0 && (
          <div className="flex items-start justify-between gap-3">
            <dt className="text-muted-foreground">
              Dependentes
              <span className="block text-xs">
                {[
                  includedUsed > 0 ? `${includedUsed} ${includedUsed === 1 ? 'incluso' : 'inclusos'}` : null,
                  quote.chargedDependents > 0
                    ? `${quote.chargedDependents} × ${formatBRL(quote.dependentUnitPrice)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' + ')}
              </span>
            </dt>
            <dd className="tabular-nums text-foreground">{formatBRL(quote.dependentsTotal)}</dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2.5">
          <dt className="font-medium text-foreground">Mensalidade</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatBRL(quote.total)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">Adesão (só na 1ª cobrança)</dt>
          <dd className="tabular-nums text-foreground">
            {quote.enrollmentFeeListPrice === 0 ? (
              'Sem adesão'
            ) : quote.enrollmentFeeWaived ? (
              <span>
                <s className="mr-1.5 text-muted-foreground">{formatBRL(quote.enrollmentFeeListPrice)}</s>
                Isenta
              </span>
            ) : (
              formatBRL(quote.enrollmentFee)
            )}
          </dd>
        </div>
      </dl>
      <div className="mt-5 flex items-end justify-between gap-3 rounded-xl border border-border/60 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">1ª cobrança</p>
          <p className="text-xs text-muted-foreground">Depois, {formatBRL(quote.total)}/mês</p>
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
          {formatBRL(quote.firstChargeTotal)}
        </p>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Coberturas
// ---------------------------------------------------------------------------

export function PlanCoveragesTab({ plan, editHref }: { plan: ClubPlan; editHref: string }) {
  const coverages = plan.coverages ?? []

  if (coverages.length === 0) {
    const features = plan.features ?? []
    return (
      <div className="space-y-5">
        <Panel>
          <EmptyState
            icon={Sparkles}
            title="Nenhuma cobertura estruturada"
            description="Cadastre as coberturas para a vitrine, o checkout e o portal mostrarem valor, limite, carência e canal de cada benefício."
            action={
              <Button asChild>
                <Link href={`${editHref}#secao-coberturas`}>Cadastrar coberturas</Link>
              </Button>
            }
          />
          {features.length > 0 && (
            <div className="border-t border-border/60 pt-5">
              <p className="text-xs font-medium text-muted-foreground">Hoje a vitrine mostra os destaques em texto:</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {features.map(feature => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
        <LegalNotice />
      </div>
    )
  }

  const groups = clubCoverageCategory.options
    .map(category => ({ category, items: coverages.filter(coverage => coverage.category === category) }))
    .filter(group => group.items.length > 0)
  const immediate = coverages.filter(coverage => coverage.waitingDays === 0).length

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {coverages.length} {coverages.length === 1 ? 'cobertura' : 'coberturas'} em {groups.length}{' '}
        {groups.length === 1 ? 'categoria' : 'categorias'} · {immediate}{' '}
        {immediate === 1 ? 'liberada' : 'liberadas'} logo na ativação
      </p>
      <Panel bodyClassName="py-2 sm:py-2">
        <div className="divide-y divide-border/60">
          {groups.map(group => (
            <section key={group.category} aria-label={CLUB_COVERAGE_CATEGORY_LABELS[group.category]} className="py-4">
              <div className="flex items-center gap-3">
                <CoverageIcon category={group.category} className="size-8 rounded-lg" />
                <h3 className="text-sm font-semibold text-foreground">{CLUB_COVERAGE_CATEGORY_LABELS[group.category]}</h3>
                <span className="text-xs text-muted-foreground">{group.items.length}</span>
              </div>
              <ul className="mt-2 sm:pl-11">
                {group.items.map(coverage => {
                  const ChannelIcon = CHANNEL_ICONS[coverage.channel] ?? MapPin
                  return (
                    <li
                      key={coverage.id}
                      className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-8"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{coverage.title}</p>
                        {coverage.description && (
                          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{coverage.description}</p>
                        )}
                        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <ChannelIcon className="size-3.5" aria-hidden="true" />
                            {CLUB_COVERAGE_CHANNEL_LABELS[coverage.channel]}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Handshake className="size-3.5" aria-hidden="true" />
                            {coverage.provider ?? 'Rede do clube'}
                          </span>
                        </p>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-sm font-semibold text-foreground">{describeCoverageValue(coverage)}</p>
                        <p
                          className={cn(
                            'text-xs',
                            coverage.waitingDays === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
                          )}
                        >
                          {describeWaitingPeriod(coverage.waitingDays)}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </Panel>
      <LegalNotice />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

export function PlanRulesTab({
  plan,
  enabledMethods,
  editHref,
}: {
  plan: ClubPlan
  enabledMethods: readonly ClubPaymentMethod[] | null
  editHref: string
}) {
  const age = holderAgeRange(plan)
  const rules = dependentRulesOf(plan)
  const restricted = (plan.dependentRules ?? []).length > 0
  const planMethods = plan.paymentMethods && plan.paymentMethods.length > 0 ? plan.paymentMethods : null
  const effective = enabledMethods ? effectivePaymentMethods(plan, enabledMethods) : null
  const disabledInClub = enabledMethods
    ? (planMethods ?? []).filter(method => !enabledMethods.includes(method))
    : []

  return (
    <div className="space-y-5">
      <Panel title="Regras do plano" description="O checkout confere cada uma na adesão; a API recusa o que não bate.">
        <dl className="divide-y divide-border/60">
          <RuleRow label="Titular">
            {age.max === null ? `A partir de ${age.min} anos` : `De ${age.min} a ${age.max} anos na adesão`}
          </RuleRow>
          <RuleRow label="Dependentes" hint="Inclusos e extras">
            <span className="text-foreground">{describeDependentsPolicy(plan)}</span>
            {plan.maxDependents !== 0 && (
              <span className="mt-1 block text-xs">
                {plan.includedDependents ?? 0} {(plan.includedDependents ?? 0) === 1 ? 'incluso' : 'inclusos'} na mensalidade ·{' '}
                {plan.maxDependents == null ? 'sem limite' : `máximo de ${plan.maxDependents}`}
              </span>
            )}
          </RuleRow>
          <RuleRow label="Parentescos aceitos" hint="Idade máxima na adesão">
            {plan.maxDependents === 0 ? (
              'Sem dependentes'
            ) : !restricted ? (
              'Qualquer parentesco, sem limite de idade'
            ) : (
              <ul className="flex flex-wrap gap-2">
                {rules.map(rule => (
                  <li key={rule.relationship}>
                    <Chip>
                      {DEPENDENT_RELATIONSHIP_LABELS[rule.relationship]}
                      <span className="font-normal text-muted-foreground">
                        {rule.maxAge === null ? 'sem limite' : `até ${rule.maxAge} anos`}
                      </span>
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </RuleRow>
          <RuleRow label="Adesão">{describeEnrollmentFee(plan)}</RuleRow>
          <RuleRow label="Formas de pagamento" hint="Plano ∩ habilitadas no clube">
            {effective === null ? (
              <span>
                {planMethods ? planMethods.map(method => CLUB_PAYMENT_METHOD_LABELS[method]).join(', ') : 'Todas as habilitadas no clube'}
                <span className="block text-xs">Não foi possível conferir as formas habilitadas no clube agora.</span>
              </span>
            ) : (
              <div className="space-y-2">
                <ul className="flex flex-wrap gap-2">
                  {clubPaymentMethod.options
                    .filter(method => planMethods === null || planMethods.includes(method))
                    .map(method => (
                      <li key={method}>
                        <Chip muted={!effective.includes(method)}>{CLUB_PAYMENT_METHOD_LABELS[method]}</Chip>
                      </li>
                    ))}
                </ul>
                <p className="text-xs">
                  {planMethods === null ? 'Segue as formas habilitadas no clube.' : 'Restrito pelo plano.'}
                </p>
                {disabledInClub.length > 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    {disabledInClub.map(method => CLUB_PAYMENT_METHOD_LABELS[method]).join(', ')}{' '}
                    {disabledInClub.length === 1 ? 'está marcado' : 'estão marcados'} no plano, mas{' '}
                    {disabledInClub.length === 1 ? 'desabilitado' : 'desabilitados'} no clube (Faturamento → Configurações).
                  </p>
                )}
                {effective.length === 0 && (
                  <p className="flex items-start gap-1.5 text-xs font-medium text-destructive">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    Nenhuma forma disponível: o checkout não consegue vender este plano.
                  </p>
                )}
              </div>
            )}
          </RuleRow>
          <RuleRow label="Fidelidade">{describeLoyalty(plan.loyaltyMonths)}</RuleRow>
          <RuleRow label="Cancelamento">
            <TextOrMissing text={plan.cancellationPolicy} editHref={editHref} />
          </RuleRow>
          <RuleRow label="Reajuste">
            <TextOrMissing text={plan.adjustmentPolicy} editHref={editHref} />
          </RuleRow>
        </dl>
      </Panel>

      <Panel title="Regulamento" description="O associado lê e aceita antes de pagar.">
        {plan.terms ? <TermsViewer terms={plan.terms} /> : <TextOrMissing text={null} editHref={editHref} />}
      </Panel>

      <LegalNotice />
    </div>
  )
}

function TextOrMissing({ text, editHref }: { text: string | null | undefined; editHref: string }) {
  if (text) return <p className="whitespace-pre-line leading-relaxed">{text}</p>
  return (
    <p>
      Não informado.{' '}
      <Link href={`${editHref}#secao-contrato`} className="font-medium text-primary hover:underline">
        Preencher
      </Link>
    </p>
  )
}

function TermsViewer({ terms }: { terms: string }) {
  const [open, setOpen] = useState(false)
  const lines = terms.split('\n')
  const preview = lines.slice(0, 4).join('\n')
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {!open && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground line-clamp-4">{preview}</p>
      )}
      <CollapsibleContent>
        <div className="max-h-[28rem] overflow-y-auto rounded-xl bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-line text-foreground">
          {terms}
        </div>
      </CollapsibleContent>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="mt-3 gap-1.5 px-2">
          {open ? 'Recolher regulamento' : 'Ler regulamento completo'}
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
    </Collapsible>
  )
}
