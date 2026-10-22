import { z } from 'zod'
import { ageOn, formatBRL } from '../common/br'
import { uuid } from '../common/primitives'
import type { ClubPlan, ClubPlanCoverage, ClubPlanDependentRule } from './catalog'
import { CLUB_PAYMENT_METHOD_LABELS, DEPENDENT_RELATIONSHIP_LABELS } from './club-billing'
import {
  clubPaymentMethod,
  dependentRelationship,
  type ClubCoverageCategory,
  type ClubCoverageChannel,
  type ClubCoverageKind,
  type ClubCoverageLimitPeriod,
  type ClubPaymentMethod,
  type DependentRelationship,
} from './enums'

/**
 * Regras PURAS do plano do clube — as mesmas na API (checkout, CRUD) e na web
 * (checkout, formulário do admin, vitrine, portal). Nada aqui lê banco ou
 * relógio além do `today` recebido. Mensagens em pt-BR, prontas para a tela.
 *
 * Os `path` das issues seguem o formato de `AppError.validation` / `fieldErrors`
 * (`holder.birthDate`, `dependents.1.relationship`, `payment.method`,
 * `coverages.0.value`): a API repassa direto e a tela pendura no campo.
 */

// ---------------------------------------------------------------------------
// Rótulos e avisos
// ---------------------------------------------------------------------------

export const CLUB_COVERAGE_CATEGORY_LABELS: Record<ClubCoverageCategory, string> = {
  telemedicine: 'Telemedicina',
  consultations: 'Consultas',
  exams: 'Exames',
  pharmacy: 'Farmácia',
  dental: 'Odontologia',
  mental_health: 'Saúde mental',
  wellness: 'Bem-estar',
  assistance: 'Assistências',
  discounts: 'Descontos',
  other: 'Outros',
}

export const CLUB_COVERAGE_KIND_LABELS: Record<ClubCoverageKind, string> = {
  included: 'Incluso',
  discount_percent: 'Desconto',
  copay: 'Coparticipação',
  usage_limit: 'Limite de uso',
}

export const CLUB_COVERAGE_CHANNEL_LABELS: Record<ClubCoverageChannel, string> = {
  in_person: 'Presencial',
  online: 'Online',
  both: 'Presencial e online',
}

export const CLUB_COVERAGE_LIMIT_PERIOD_LABELS: Record<ClubCoverageLimitPeriod, string> = {
  month: 'por mês',
  year: 'por ano',
  contract: 'no contrato',
}

/**
 * Aviso legal obrigatório onde o plano é vendido ou descrito (vitrine,
 * comparativo, checkout, portal, detalhe no admin).
 */
export const CLUB_PLAN_LEGAL_NOTICE =
  'Não é plano de saúde. Este clube de benefícios não é regulado pela ANS e não garante nem custeia ' +
  'consultas, exames, internações, cirurgias, urgências ou emergências: dá acesso a descontos, serviços ' +
  'e assistências prestados por parceiros, conforme a rede disponível na sua região.'

/** Idade mínima do titular quando o plano não define (regra geral do checkout). */
export const DEFAULT_HOLDER_MIN_AGE = 18

// ---------------------------------------------------------------------------
// Textos derivados (card, comparativo, resumo)
// ---------------------------------------------------------------------------

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

/** "Incluso", "30% de desconto", "R$ 25,00 por uso", "2 usos por ano" (+ limite quando houver). */
export function describeCoverageValue(
  coverage: Pick<ClubPlanCoverage, 'kind' | 'value' | 'limitQuantity' | 'limitPeriod'>,
): string {
  const limit =
    coverage.limitQuantity && coverage.limitPeriod
      ? `${plural(coverage.limitQuantity, 'uso', 'usos')} ${CLUB_COVERAGE_LIMIT_PERIOD_LABELS[coverage.limitPeriod]}`
      : null
  switch (coverage.kind) {
    case 'included':
      return limit ? `Incluso · até ${limit}` : 'Incluso'
    case 'discount_percent':
      return `${coverage.value ?? 0}% de desconto${limit ? ` · até ${limit}` : ''}`
    case 'copay':
      return `${formatBRL(coverage.value ?? 0)} por uso${limit ? ` · até ${limit}` : ''}`
    case 'usage_limit':
      return limit ? `Incluso · ${limit}` : 'Incluso'
  }
}

export function describeWaitingPeriod(waitingDays: number | null | undefined): string {
  const days = Math.max(0, Math.trunc(waitingDays ?? 0))
  return days === 0 ? 'Sem carência' : `Carência de ${plural(days, 'dia', 'dias')}`
}

export function describeLoyalty(loyaltyMonths: number | null | undefined): string {
  const months = Math.max(0, Math.trunc(loyaltyMonths ?? 0))
  return months === 0 ? 'Sem fidelidade' : `Fidelidade de ${plural(months, 'mês', 'meses')}`
}

export function describeEnrollmentFee(
  plan: Pick<ClubPlan, 'enrollmentFee' | 'enrollmentFeeWaived'>,
): string {
  const fee = Math.max(0, plan.enrollmentFee ?? 0)
  if (fee === 0) return 'Sem taxa de adesão'
  if (plan.enrollmentFeeWaived) return `Adesão isenta (de ${formatBRL(fee)})`
  return `Adesão de ${formatBRL(fee)}, só na 1ª cobrança`
}

/** "Individual", "Até 5 dependentes inclusos", "1 dependente incluso · extra R$ 19,90/mês · até 3". */
export function describeDependentsPolicy(
  plan: Pick<ClubPlan, 'maxDependents' | 'includedDependents' | 'priceDependentMonthly'>,
): string {
  const max = plan.maxDependents ?? null
  if (max === 0) return 'Individual (sem dependentes)'
  const unit = Math.max(0, plan.priceDependentMonthly ?? 0)
  const included = Math.max(0, plan.includedDependents ?? 0)
  const cap = max === null ? '' : ` · até ${plural(max, 'dependente', 'dependentes')}`
  if (unit === 0) {
    return max === null ? 'Dependentes inclusos, sem limite' : `Até ${plural(max, 'dependente incluso', 'dependentes inclusos')}`
  }
  if (included > 0) {
    return `${plural(included, 'dependente incluso', 'dependentes inclusos')} · extra ${formatBRL(unit)}/mês${cap}`
  }
  return `Dependente ${formatBRL(unit)}/mês${cap}`
}

/**
 * Ordem de exibição (vitrine, checkout, admin): `sortOrder` crescente (sem
 * ordem vai para o fim), depois destaque, preço e nome — a ordem de antes
 * quando nenhum plano define `sortOrder`.
 */
export function sortClubPlansForDisplay<T extends Pick<ClubPlan, 'sortOrder' | 'highlight' | 'priceMonthly' | 'name'>>(
  plans: readonly T[],
): T[] {
  return [...plans].sort((a, b) => {
    const oa = a.sortOrder ?? Number.MAX_SAFE_INTEGER
    const ob = b.sortOrder ?? Number.MAX_SAFE_INTEGER
    if (oa !== ob) return oa - ob
    if (a.highlight !== b.highlight) return a.highlight ? -1 : 1
    if (a.priceMonthly !== b.priceMonthly) return a.priceMonthly - b.priceMonthly
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}

// ---------------------------------------------------------------------------
// Carência
// ---------------------------------------------------------------------------

const SP_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Dia (`yyyy-MM-dd`, fuso de São Paulo) em que a cobertura libera: ativação +
 * `waitingDays`. `activatedAt` é o `startedAt` da assinatura (ISO) ou uma data-só;
 * `null` enquanto a assinatura não ativou.
 */
export function coverageAvailableOn(activatedAt: string | null | undefined, waitingDays: number): string | null {
  if (!activatedAt) return null
  const base = /^\d{4}-\d{2}-\d{2}$/.test(activatedAt) ? new Date(`${activatedAt}T12:00:00-03:00`) : new Date(activatedAt)
  if (Number.isNaN(base.getTime())) return null
  const released = new Date(base.getTime() + Math.max(0, Math.trunc(waitingDays)) * 86_400_000)
  return SP_DATE.format(released)
}

export function isCoverageAvailable(
  activatedAt: string | null | undefined,
  waitingDays: number,
  today: Date = new Date(),
): boolean {
  const on = coverageAvailableOn(activatedAt, waitingDays)
  return on !== null && on <= SP_DATE.format(today)
}

// ---------------------------------------------------------------------------
// Elegibilidade
// ---------------------------------------------------------------------------

export type PlanRuleIssueCode =
  | 'holder_birth_date'
  | 'holder_min_age'
  | 'holder_max_age'
  | 'dependents_not_allowed'
  | 'dependents_max'
  | 'dependent_birth_date'
  | 'relationship_not_allowed'
  | 'dependent_max_age'
  | 'payment_method_unavailable'
  | 'no_payment_method'
  | 'plan_inconsistent'

export interface PlanRuleIssue {
  /** Formato de `AppError.validation` / `fieldErrors`: `holder.birthDate`, `dependents.1.relationship`… */
  path: string
  message: string
  code: PlanRuleIssueCode
}

export type EligibilityPlan = Pick<
  ClubPlan,
  'holderMinAge' | 'holderMaxAge' | 'maxDependents' | 'dependentRules' | 'paymentMethods'
>

export interface EligibilityOptions {
  /** Data de referência das idades (padrão: agora). */
  today?: Date
}

export function holderAgeRange(plan: Pick<ClubPlan, 'holderMinAge' | 'holderMaxAge'>): {
  min: number
  max: number | null
} {
  return {
    min: Math.max(DEFAULT_HOLDER_MIN_AGE, plan.holderMinAge ?? DEFAULT_HOLDER_MIN_AGE),
    max: plan.holderMaxAge ?? null,
  }
}

export function checkHolderEligibility(
  plan: Pick<ClubPlan, 'holderMinAge' | 'holderMaxAge'>,
  holder: { birthDate?: string | null },
  options: EligibilityOptions = {},
): PlanRuleIssue[] {
  const path = 'holder.birthDate'
  const age = holder.birthDate ? ageOn(holder.birthDate, options.today) : null
  if (age === null) {
    return [{ path, code: 'holder_birth_date', message: 'Informe a data de nascimento do titular' }]
  }
  const { min, max } = holderAgeRange(plan)
  if (age < min) {
    return [{ path, code: 'holder_min_age', message: `Este plano é para titulares a partir de ${min} anos` }]
  }
  if (max !== null && age > max) {
    return [{ path, code: 'holder_max_age', message: `Este plano aceita titulares de até ${max} anos` }]
  }
  return []
}

/** Regras efetivas: sem regras no plano = todo parentesco, sem limite de idade. */
export function dependentRulesOf(plan: Pick<ClubPlan, 'dependentRules' | 'maxDependents'>): ClubPlanDependentRule[] {
  if (plan.maxDependents === 0) return []
  const rules = plan.dependentRules ?? []
  if (rules.length === 0) return dependentRelationship.options.map(relationship => ({ relationship, maxAge: null }))
  const unique: ClubPlanDependentRule[] = []
  for (const rule of rules) {
    if (!unique.some(u => u.relationship === rule.relationship)) unique.push(rule)
  }
  return unique
}

export function allowedRelationships(plan: Pick<ClubPlan, 'dependentRules' | 'maxDependents'>): DependentRelationship[] {
  return dependentRulesOf(plan).map(rule => rule.relationship)
}

/** "Cônjuge/Companheiro(a) · Filho(a) até 24 anos · Pai/Mãe até 80 anos". */
export function describeDependentRules(plan: Pick<ClubPlan, 'dependentRules' | 'maxDependents'>): string {
  if (plan.maxDependents === 0) return 'Sem dependentes'
  if (!plan.dependentRules || plan.dependentRules.length === 0) return 'Qualquer parentesco'
  return dependentRulesOf(plan)
    .map(rule =>
      rule.maxAge === null
        ? DEPENDENT_RELATIONSHIP_LABELS[rule.relationship]
        : `${DEPENDENT_RELATIONSHIP_LABELS[rule.relationship]} até ${rule.maxAge} anos`,
    )
    .join(' · ')
}

export function checkDependentEligibility(
  plan: Pick<ClubPlan, 'dependentRules' | 'maxDependents'>,
  dependent: { relationship: DependentRelationship; birthDate?: string | null },
  index: number,
  options: EligibilityOptions = {},
): PlanRuleIssue[] {
  const rules = dependentRulesOf(plan)
  const rule = rules.find(r => r.relationship === dependent.relationship)
  const label = DEPENDENT_RELATIONSHIP_LABELS[dependent.relationship]
  if (!rule) {
    const accepted = rules.map(r => DEPENDENT_RELATIONSHIP_LABELS[r.relationship]).join(', ')
    return [
      {
        path: `dependents.${index}.relationship`,
        code: 'relationship_not_allowed',
        message: accepted
          ? `${label} não é aceito como dependente neste plano. Aceitos: ${accepted}`
          : 'Este plano não aceita dependentes',
      },
    ]
  }
  if (rule.maxAge === null) return []
  const age = dependent.birthDate ? ageOn(dependent.birthDate, options.today) : null
  if (age === null) {
    return [{ path: `dependents.${index}.birthDate`, code: 'dependent_birth_date', message: 'Informe a data de nascimento' }]
  }
  if (age > rule.maxAge) {
    return [
      {
        path: `dependents.${index}.birthDate`,
        code: 'dependent_max_age',
        message: `${label}: aceito só até ${rule.maxAge} anos neste plano`,
      },
    ]
  }
  return []
}

export function checkDependentsEligibility(
  plan: Pick<ClubPlan, 'dependentRules' | 'maxDependents'>,
  dependents: ReadonlyArray<{ relationship: DependentRelationship; birthDate?: string | null }>,
  options: EligibilityOptions = {},
): PlanRuleIssue[] {
  if (dependents.length === 0) return []
  const max = plan.maxDependents ?? null
  if (max === 0) {
    return [{ path: 'dependents', code: 'dependents_not_allowed', message: 'Este plano não aceita dependentes' }]
  }
  const issues: PlanRuleIssue[] = []
  if (max !== null && dependents.length > max) {
    issues.push({
      path: 'dependents',
      code: 'dependents_max',
      message: `Este plano aceita até ${plural(max, 'dependente', 'dependentes')}`,
    })
  }
  dependents.forEach((dependent, index) => issues.push(...checkDependentEligibility(plan, dependent, index, options)))
  return issues
}

/**
 * Métodos que o associado pode usar neste plano: os habilitados no clube ∩ os
 * aceitos pelo plano (sem lista no plano = todos os do clube), na ordem canônica.
 */
export function effectivePaymentMethods(
  plan: Pick<ClubPlan, 'paymentMethods'>,
  enabledMethods: readonly ClubPaymentMethod[],
): ClubPaymentMethod[] {
  const planMethods = plan.paymentMethods && plan.paymentMethods.length > 0 ? plan.paymentMethods : null
  return clubPaymentMethod.options.filter(
    method => enabledMethods.includes(method) && (planMethods === null || planMethods.includes(method)),
  )
}

export function checkPaymentMethod(
  plan: Pick<ClubPlan, 'paymentMethods'>,
  method: ClubPaymentMethod,
  enabledMethods: readonly ClubPaymentMethod[],
): PlanRuleIssue[] {
  const path = 'payment.method'
  const available = effectivePaymentMethods(plan, enabledMethods)
  if (available.length === 0) {
    return [{ path, code: 'no_payment_method', message: 'Nenhuma forma de pagamento disponível para este plano' }]
  }
  if (!available.includes(method)) {
    const labels = available.map(m => CLUB_PAYMENT_METHOD_LABELS[m]).join(', ')
    return [
      {
        path,
        code: 'payment_method_unavailable',
        message: `${CLUB_PAYMENT_METHOD_LABELS[method]} não está disponível para este plano. Use: ${labels}`,
      },
    ]
  }
  return []
}

/**
 * Tudo que o checkout precisa conferir contra o plano (a API chama antes de
 * gravar; a tela chama a cada passo). Vazio = elegível.
 */
export function checkCheckoutEligibility(
  plan: EligibilityPlan,
  input: {
    holder: { birthDate?: string | null }
    dependents: ReadonlyArray<{ relationship: DependentRelationship; birthDate?: string | null }>
    payment?: { method: ClubPaymentMethod } | null
  },
  options: EligibilityOptions & { enabledMethods: readonly ClubPaymentMethod[] },
): PlanRuleIssue[] {
  return [
    ...checkHolderEligibility(plan, input.holder, options),
    ...checkDependentsEligibility(plan, input.dependents, options),
    ...(input.payment ? checkPaymentMethod(plan, input.payment.method, options.enabledMethods) : []),
  ]
}

// ---------------------------------------------------------------------------
// Consistência do cadastro do plano (formulário do admin e POST/PATCH da API)
// ---------------------------------------------------------------------------

/**
 * Regras entre campos que o schema sozinho não expressa. No PATCH, rode sobre
 * o plano JÁ MESCLADO (atual + alterações). Vazio = consistente.
 */
export function checkClubPlanConsistency(plan: Partial<ClubPlan>): PlanRuleIssue[] {
  const issues: PlanRuleIssue[] = []
  const add = (path: string, message: string) => issues.push({ path, message, code: 'plan_inconsistent' })

  const max = plan.maxDependents ?? null
  const included = plan.includedDependents ?? 0
  if (max !== null && included > max) {
    add('includedDependents', 'O número de dependentes inclusos não pode passar do máximo de dependentes')
  }
  if (plan.holderMinAge != null && plan.holderMaxAge != null && plan.holderMaxAge < plan.holderMinAge) {
    add('holderMaxAge', 'A idade máxima do titular precisa ser maior ou igual à mínima')
  }

  const relationships = new Set<string>()
  ;(plan.dependentRules ?? []).forEach((rule, index) => {
    if (relationships.has(rule.relationship)) add(`dependentRules.${index}.relationship`, 'Parentesco repetido')
    relationships.add(rule.relationship)
  })

  if (plan.paymentMethods && new Set(plan.paymentMethods).size !== plan.paymentMethods.length) {
    add('paymentMethods', 'Forma de pagamento repetida')
  }

  const ids = new Set<string>()
  ;(plan.coverages ?? []).forEach((coverage, index) => {
    const at = (field: string) => `coverages.${index}.${field}`
    if (ids.has(coverage.id)) add(at('id'), 'Identificador de cobertura repetido')
    ids.add(coverage.id)
    if (coverage.kind === 'discount_percent' && (coverage.value === null || coverage.value <= 0 || coverage.value > 100)) {
      add(at('value'), 'Informe o percentual de desconto (de 1 a 100)')
    }
    if (coverage.kind === 'copay' && (coverage.value === null || coverage.value <= 0)) {
      add(at('value'), 'Informe o valor da coparticipação por uso')
    }
    if (coverage.kind === 'usage_limit' && (coverage.limitQuantity === null || coverage.limitPeriod === null)) {
      add(at('limitQuantity'), 'Informe quantos usos e em qual período')
    }
    if ((coverage.limitQuantity === null) !== (coverage.limitPeriod === null)) {
      add(at('limitPeriod'), 'Informe a quantidade e o período do limite juntos')
    }
  })
  return issues
}

// ---------------------------------------------------------------------------
// Estatísticas por plano — `GET /t/:slug/faturamento/planos/estatisticas`
// ---------------------------------------------------------------------------

const count = z.number().int().nonnegative()

export const clubPlanStatsCounters = z.object({
  /** Titulares com carteirinha válida: assinaturas `active` + `past_due`. */
  holders: count,
  /** Dependentes dessas assinaturas vigentes. */
  dependents: count,
  /** Vidas = `holders` + `dependents`. */
  lives: count,
  active: count,
  /** Em atraso (`past_due`). */
  pastDue: count,
  suspended: count,
  canceled: count,
  pendingPayment: count,
  /** Receita recorrente mensal: Σ `amount` das assinaturas `active` + `past_due`. */
  mrr: z.number().nonnegative(),
  /** Σ das cobranças abertas (`pending|overdue|failed`) com vencimento já passado. */
  overdueAmount: z.number().nonnegative(),
})
export type ClubPlanStatsCounters = z.infer<typeof clubPlanStatsCounters>

export const clubPlanStats = clubPlanStatsCounters.extend({
  /** `null` = assinaturas cujo plano foi excluído (linha "Sem plano"). */
  planId: uuid.nullable(),
  planName: z.string(),
})
export type ClubPlanStats = z.infer<typeof clubPlanStats>

/** Uma linha por plano do inquilino (inclusive os sem assinatura, zerados) + totais. */
export const clubPlanStatsReport = z.object({
  plans: z.array(clubPlanStats),
  totals: clubPlanStatsCounters,
  generatedAt: z.string().datetime(),
})
export type ClubPlanStatsReport = z.infer<typeof clubPlanStatsReport>

export const EMPTY_CLUB_PLAN_STATS: ClubPlanStatsCounters = {
  holders: 0,
  dependents: 0,
  lives: 0,
  active: 0,
  pastDue: 0,
  suspended: 0,
  canceled: 0,
  pendingPayment: 0,
  mrr: 0,
  overdueAmount: 0,
}
