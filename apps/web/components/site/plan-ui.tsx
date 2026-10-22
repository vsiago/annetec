'use client'

import { Fragment, useState, type ReactNode } from 'react'
import {
  BadgePercent,
  Brain,
  CalendarCheck,
  ChevronDown,
  CircleX,
  CreditCard,
  FlaskConical,
  HeartHandshake,
  HeartPulse,
  Info,
  LifeBuoy,
  Pill,
  Receipt,
  ScrollText,
  Smile,
  Sparkles,
  Stethoscope,
  TrendingUp,
  UserRound,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react'
import {
  CLUB_COVERAGE_CATEGORY_LABELS,
  CLUB_PAYMENT_METHOD_LABELS,
  CLUB_PLAN_LEGAL_NOTICE,
  clubCoverageCategory,
  clubPaymentMethod,
  describeDependentRules,
  describeDependentsPolicy,
  describeEnrollmentFee,
  describeLoyalty,
  effectivePaymentMethods,
  formatBRL,
  holderAgeRange,
  type ClubCoverageCategory,
  type ClubPaymentMethod,
  type ClubPlan,
  type ClubPlanCoverage,
} from '@annetec/contracts'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

/**
 * Peças de apresentação do plano do clube, usadas pela vitrine (card,
 * detalhes, comparativo) e pelo portal do associado. Texto e regra vêm de
 * `club-plan-rules` (contracts); aqui fica só a forma.
 */

export const COVERAGE_CATEGORY_ICONS: Record<ClubCoverageCategory, LucideIcon> = {
  telemedicine: Video,
  consultations: Stethoscope,
  exams: FlaskConical,
  pharmacy: Pill,
  dental: Smile,
  mental_health: Brain,
  wellness: HeartPulse,
  assistance: LifeBuoy,
  discounts: BadgePercent,
  other: Sparkles,
}

export function coverageIcon(category: ClubCoverageCategory): LucideIcon {
  return COVERAGE_CATEGORY_ICONS[category] ?? Sparkles
}

/** Coberturas estruturadas do plano. Vazio = plano só com `features` (API antiga ou plano legado). */
export function planCoverages(plan: Pick<ClubPlan, 'coverages'> | null | undefined): ClubPlanCoverage[] {
  return plan && Array.isArray(plan.coverages) ? plan.coverages : []
}

export interface CoverageGroup {
  category: ClubCoverageCategory
  label: string
  icon: LucideIcon
  coverages: ClubPlanCoverage[]
}

/** Agrupa por categoria (na ordem do enum), mantendo a ordem do plano dentro de cada grupo. */
export function groupCoverages(coverages: readonly ClubPlanCoverage[]): CoverageGroup[] {
  return clubCoverageCategory.options
    .map(category => ({
      category,
      label: CLUB_COVERAGE_CATEGORY_LABELS[category],
      icon: coverageIcon(category),
      coverages: coverages.filter(coverage => coverage.category === category),
    }))
    .filter(group => group.coverages.length > 0)
}

/** Selo do card: o do plano; sem selo e em destaque, "Mais escolhido". */
export function planBadge(plan: Pick<ClubPlan, 'badge' | 'highlight'>, highlightLabel = 'Mais escolhido'): string | null {
  const badge = plan.badge?.trim()
  if (badge) return badge
  return plan.highlight ? highlightLabel : null
}

/**
 * A API informou a regra de dependentes? Os dois campos são opcionais no
 * contrato: sem nenhum deles, a tela não afirma nada sobre dependentes.
 */
export function hasDependentsInfo(plan: Pick<ClubPlan, 'maxDependents' | 'priceDependentMonthly'>): boolean {
  return plan.maxDependents !== undefined || plan.priceDependentMonthly !== undefined
}

/** "De 18 a 70 anos" / "A partir de 18 anos". */
export function holderAgeText(plan: Pick<ClubPlan, 'holderMinAge' | 'holderMaxAge'>): string {
  const { min, max } = holderAgeRange(plan)
  return max === null ? `A partir de ${min} anos` : `De ${min} a ${max} anos`
}

/**
 * Formas de pagamento do plano. Com os métodos do clube conhecidos, vale a
 * regra oficial (`effectivePaymentMethods`). Sem eles, a lista do próprio
 * plano; e, se o plano não restringe, "as do clube", sem inventar quais.
 */
export function paymentMethodsText(
  plan: Pick<ClubPlan, 'paymentMethods'>,
  enabledMethods: readonly ClubPaymentMethod[] | null,
): string {
  const planRestricts = !!plan.paymentMethods && plan.paymentMethods.length > 0
  if (!enabledMethods && !planRestricts) return 'As formas aceitas pelo clube'
  const methods = effectivePaymentMethods(plan, enabledMethods ?? clubPaymentMethod.options)
  if (methods.length === 0) return 'Consulte o atendimento'
  return methods.map(method => CLUB_PAYMENT_METHOD_LABELS[method]).join(' · ')
}

/**
 * Adesão com a isenção riscada ("Adesão isenta ~~R$ 29,90~~"). O leitor de
 * tela ouve o texto oficial de `describeEnrollmentFee`.
 */
export function EnrollmentFeeText({
  plan,
  className,
}: {
  plan: Pick<ClubPlan, 'enrollmentFee' | 'enrollmentFeeWaived'>
  className?: string
}) {
  const fee = Math.max(0, plan.enrollmentFee ?? 0)
  const text = describeEnrollmentFee(plan)
  if (fee > 0 && plan.enrollmentFeeWaived) {
    return (
      <span className={className}>
        <span className="sr-only">{text}</span>
        <span aria-hidden="true">
          Adesão isenta{' '}
          <s className="whitespace-nowrap font-normal text-muted-foreground decoration-1">{formatBRL(fee)}</s>
        </span>
      </span>
    )
  }
  return <span className={className}>{text}</span>
}

export type PlanRuleKey =
  | 'dependents'
  | 'relationships'
  | 'holderAge'
  | 'enrollment'
  | 'loyalty'
  | 'payment'
  | 'cancellation'
  | 'adjustment'

export interface PlanRuleDef {
  key: PlanRuleKey
  label: string
  icon: LucideIcon
  /** Texto corrido (cancelamento, reajuste): a tela pode recolher. */
  long?: boolean
  /** A API informou o dado? Sem ele, a tela não afirma nada (mostra "—"). */
  known: (plan: ClubPlan, enabledMethods: readonly ClubPaymentMethod[] | null) => boolean
  render: (plan: ClubPlan, enabledMethods: readonly ClubPaymentMethod[] | null) => ReactNode
}

/** Regras do plano na ordem em que a vitrine e o portal as mostram. */
export const PLAN_RULES: readonly PlanRuleDef[] = [
  {
    key: 'dependents',
    label: 'Dependentes',
    icon: Users,
    known: plan => hasDependentsInfo(plan),
    render: plan => describeDependentsPolicy(plan),
  },
  {
    key: 'relationships',
    label: 'Parentescos aceitos',
    icon: HeartHandshake,
    known: plan => plan.dependentRules !== undefined && plan.maxDependents !== 0,
    render: plan => describeDependentRules(plan),
  },
  {
    key: 'holderAge',
    label: 'Idade do titular',
    icon: UserRound,
    known: plan => plan.holderMinAge !== undefined || plan.holderMaxAge !== undefined,
    render: plan => holderAgeText(plan),
  },
  {
    key: 'enrollment',
    label: 'Adesão',
    icon: Receipt,
    known: plan => plan.enrollmentFee !== undefined || plan.enrollmentFeeWaived !== undefined,
    render: plan => <EnrollmentFeeText plan={plan} />,
  },
  {
    key: 'loyalty',
    label: 'Fidelidade',
    icon: CalendarCheck,
    known: plan => plan.loyaltyMonths !== undefined,
    render: plan => describeLoyalty(plan.loyaltyMonths),
  },
  {
    key: 'payment',
    label: 'Formas de pagamento',
    icon: CreditCard,
    known: (plan, enabledMethods) => plan.paymentMethods !== undefined || enabledMethods !== null,
    render: (plan, enabledMethods) => paymentMethodsText(plan, enabledMethods),
  },
  {
    key: 'cancellation',
    label: 'Cancelamento',
    icon: CircleX,
    long: true,
    known: plan => !!plan.cancellationPolicy?.trim(),
    render: plan => plan.cancellationPolicy,
  },
  {
    key: 'adjustment',
    label: 'Reajuste',
    icon: TrendingUp,
    long: true,
    known: plan => !!plan.adjustmentPolicy?.trim(),
    render: plan => plan.adjustmentPolicy,
  },
]

/** Regras que o plano informa, prontas para uma lista (`dl`). */
export function planRuleRows(
  plan: ClubPlan,
  enabledMethods: readonly ClubPaymentMethod[] | null,
  keys?: readonly PlanRuleKey[],
): { key: PlanRuleKey; label: string; icon: LucideIcon; long: boolean; value: ReactNode }[] {
  return PLAN_RULES.filter(rule => (!keys || keys.includes(rule.key)) && rule.known(plan, enabledMethods)).map(rule => ({
    key: rule.key,
    label: rule.label,
    icon: rule.icon,
    long: !!rule.long,
    value: rule.render(plan, enabledMethods),
  }))
}

/**
 * Lista de regras (rótulo + valor) usada no detalhe do plano e no portal.
 * `stacked` mantém rótulo sobre valor em qualquer largura (colunas estreitas).
 */
export function PlanRulesList({
  rows,
  stacked = false,
  className,
}: {
  rows: readonly { key: string; label: string; icon: LucideIcon; value: ReactNode }[]
  stacked?: boolean
  className?: string
}) {
  if (rows.length === 0) return null
  return (
    <dl className={cn('divide-y divide-border/70 rounded-2xl border border-border/80 bg-card', className)}>
      {rows.map(row => {
        const Icon = row.icon
        return (
          <div key={row.key} className={cn('grid gap-1 px-4 py-3', !stacked && 'sm:grid-cols-[11rem_1fr] sm:gap-4')}>
            <dt className="flex items-center gap-2 self-start text-sm font-medium text-foreground">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {row.label}
            </dt>
            <dd className="text-sm leading-relaxed text-muted-foreground">{row.value}</dd>
          </div>
        )
      })}
    </dl>
  )
}

const NOTICE_BREAK = CLUB_PLAN_LEGAL_NOTICE.indexOf('. ')
const NOTICE_LEAD = NOTICE_BREAK > 0 ? CLUB_PLAN_LEGAL_NOTICE.slice(0, NOTICE_BREAK + 1) : ''
const NOTICE_REST = NOTICE_BREAK > 0 ? CLUB_PLAN_LEGAL_NOTICE.slice(NOTICE_BREAK + 2) : CLUB_PLAN_LEGAL_NOTICE

/** Aviso legal obrigatório (`CLUB_PLAN_LEGAL_NOTICE`), com a 1ª frase em destaque. */
export function PlanLegalNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      aria-label="Aviso legal"
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3.5 text-left text-xs leading-relaxed text-muted-foreground sm:text-[13px]',
        className,
      )}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p>
        {NOTICE_LEAD && <strong className="font-semibold text-foreground">{NOTICE_LEAD} </strong>}
        {NOTICE_REST}
      </p>
    </div>
  )
}

function withBold(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.length > 4 && part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

/**
 * Regulamento em texto puro: uma linha por parágrafo (`pre-line`), itens
 * "   - " como lista com recuo e, se vier, o `**negrito**` do modelo.
 */
export function TermsText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split(/\r?\n/).map((line, index) => {
        const content = line.trim()
        if (!content) return <span key={index} aria-hidden="true" className="block h-1" />
        const item = /^[-•–]\s+/.exec(content)
        if (item) {
          return (
            <p key={index} className="flex gap-2 whitespace-pre-line pl-3">
              <span aria-hidden="true">•</span>
              <span className="min-w-0">{withBold(content.slice(item[0].length))}</span>
            </p>
          )
        }
        // Título do regulamento (1ª linha) e cláusulas "3. Carências." ganham destaque.
        if (index === 0) {
          return (
            <p key={index} className="whitespace-pre-line font-semibold text-foreground">
              {withBold(content)}
            </p>
          )
        }
        const clause = /^(\d+\.\s+[^.:]{1,60}[.:])\s*(.*)$/.exec(content)
        return (
          <p key={index} className="whitespace-pre-line">
            {clause ? (
              <>
                <strong className="font-semibold text-foreground">{clause[1]}</strong> {withBold(clause[2] ?? '')}
              </>
            ) : (
              withBold(content)
            )}
          </p>
        )
      })}
    </div>
  )
}

/** Regulamento recolhível. Plano sem regulamento não mostra nada. */
export function PlanTerms({
  terms,
  planName,
  defaultOpen = false,
  className,
}: {
  terms: string | null | undefined
  planName: string
  defaultOpen?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (!terms?.trim()) return null
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('rounded-2xl border border-border/80 bg-card', className)}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="inline-flex items-center gap-2">
          <ScrollText className="size-4 text-primary" aria-hidden="true" />
          {open ? 'Ocultar o regulamento' : 'Ler o regulamento completo'}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          role="region"
          aria-label={`Regulamento do plano ${planName}`}
          tabIndex={0}
          className="max-h-80 overflow-y-auto border-t border-border/80 px-4 py-3 text-xs leading-relaxed text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <TermsText text={terms} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
