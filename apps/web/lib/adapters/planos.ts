import {
  CLUB_COVERAGE_CATEGORY_LABELS,
  CLUB_PAYMENT_METHOD_LABELS,
  CLUB_PLAN_LEGAL_NOTICE,
  EMPTY_CLUB_PLAN_STATS,
  checkClubPlanConsistency,
  clubCoverageCategory,
  clubPaymentMethod,
  createClubPlanInput,
  dependentRelationship,
  describeCoverageValue,
  describeDependentRules,
  describeDependentsPolicy,
  describeEnrollmentFee,
  describeLoyalty,
  effectivePaymentMethods,
  parseBRL,
  sortClubPlansForDisplay,
  type ActiveStatus,
  type ClubCoverageCategory,
  type ClubCoverageChannel,
  type ClubCoverageKind,
  type ClubCoverageLimitPeriod,
  type ClubPaymentMethod,
  type ClubPlan,
  type ClubPlanCoverage,
  type ClubPlanDependentRule,
  type ClubPlanStats,
  type ClubPlanStatsCounters,
  type ClubPlanStatsReport,
  type ClubSubscriptionStatus,
  type CreateClubPlanInput,
  type DependentRelationship,
} from '@annetec/contracts'

/**
 * Produtos e Planos do painel do inquilino — tudo o que a tela precisa para
 * LISTAR, DETALHAR e CADASTRAR o plano do clube, sem I/O: roda no browser e
 * na server action (`lib/actions/planos-api.ts`).
 *
 * Regra de negócio NÃO mora aqui: preço é `quoteClubPlan`, elegibilidade e
 * consistência são `club-plan-rules` (os mesmos que a API roda). Este arquivo
 * só traduz o estado do formulário (texto digitado) para o `CreateClubPlanInput`
 * e de volta, e pendura cada erro no campo certo.
 */

/**
 * Mesmo formato do `ActionResult` de `lib/actions/_api-result.ts` — repetido
 * porque aquele é `server-only` e um arquivo `'use server'` não pode
 * reexportar tipo; o componente de cliente tipa com este.
 */
export type PlanosActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

// ---------------------------------------------------------------------------
// Normalização na borda (numeric do Postgres pode escapar como texto)
// ---------------------------------------------------------------------------

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function intOrNull(value: unknown): number | null {
  const n = numOrNull(value)
  return n === null ? null : Math.trunc(n)
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function normalizeCoverage(coverage: ClubPlanCoverage): ClubPlanCoverage {
  return {
    id: String(coverage.id ?? ''),
    category: coverage.category ?? 'other',
    title: coverage.title ?? '',
    description: textOrNull(coverage.description),
    kind: coverage.kind ?? 'included',
    value: numOrNull(coverage.value),
    limitQuantity: intOrNull(coverage.limitQuantity),
    limitPeriod: coverage.limitPeriod ?? null,
    waitingDays: Math.max(0, Math.trunc(num(coverage.waitingDays))),
    channel: coverage.channel ?? 'both',
    provider: textOrNull(coverage.provider),
  }
}

/**
 * Plano como a tela usa: números de verdade, listas sempre presentes e `null`
 * onde a API antiga ainda não manda o campo (a tela cai no comportamento de
 * antes — `features` no lugar das coberturas).
 */
export function normalizeClubPlan(dto: ClubPlan): ClubPlan {
  return {
    ...dto,
    priceMonthly: num(dto.priceMonthly),
    features: Array.isArray(dto.features) ? dto.features : [],
    audience: textOrNull(dto.audience),
    highlight: dto.highlight === true,
    upstreamPlanCodigo: dto.upstreamPlanCodigo ?? null,
    status: dto.status === 'inactive' ? 'inactive' : 'active',
    priceDependentMonthly: numOrNull(dto.priceDependentMonthly),
    maxDependents: intOrNull(dto.maxDependents),
    tagline: textOrNull(dto.tagline),
    badge: textOrNull(dto.badge),
    sortOrder: intOrNull(dto.sortOrder),
    includedDependents: intOrNull(dto.includedDependents),
    enrollmentFee: numOrNull(dto.enrollmentFee),
    enrollmentFeeWaived: dto.enrollmentFeeWaived === true,
    holderMinAge: intOrNull(dto.holderMinAge),
    holderMaxAge: intOrNull(dto.holderMaxAge),
    dependentRules: Array.isArray(dto.dependentRules)
      ? dto.dependentRules.map(rule => ({ relationship: rule.relationship, maxAge: intOrNull(rule.maxAge) }))
      : null,
    coverages: Array.isArray(dto.coverages) ? dto.coverages.map(normalizeCoverage) : [],
    paymentMethods: Array.isArray(dto.paymentMethods) ? dto.paymentMethods : null,
    loyaltyMonths: intOrNull(dto.loyaltyMonths),
    cancellationPolicy: textOrNull(dto.cancellationPolicy),
    adjustmentPolicy: textOrNull(dto.adjustmentPolicy),
    terms: textOrNull(dto.terms),
  }
}

function normalizeCounters(counters: Partial<ClubPlanStatsCounters> | null | undefined): ClubPlanStatsCounters {
  const source = counters ?? {}
  return {
    holders: num(source.holders),
    dependents: num(source.dependents),
    lives: num(source.lives),
    active: num(source.active),
    pastDue: num(source.pastDue),
    suspended: num(source.suspended),
    canceled: num(source.canceled),
    pendingPayment: num(source.pendingPayment),
    mrr: num(source.mrr),
    overdueAmount: num(source.overdueAmount),
  }
}

export function normalizeStatsReport(report: ClubPlanStatsReport): ClubPlanStatsReport {
  return {
    plans: (report.plans ?? []).map(row => ({
      ...normalizeCounters(row),
      planId: row.planId ?? null,
      planName: row.planName ?? 'Sem plano',
    })),
    totals: normalizeCounters(report.totals),
    generatedAt: report.generatedAt,
  }
}

/** Contadores do plano; `null` quando as estatísticas não carregaram (a tela mostra "—"). */
export function statsForPlan(report: ClubPlanStatsReport | null, planId: string): ClubPlanStatsCounters | null {
  if (!report) return null
  return report.plans.find(row => row.planId === planId) ?? EMPTY_CLUB_PLAN_STATS
}

/** Linha "Sem plano" (assinaturas cujo plano foi excluído), só quando existe. */
export function orphanStats(report: ClubPlanStatsReport | null): ClubPlanStats | null {
  return report?.plans.find(row => row.planId === null) ?? null
}

/** Todas as assinaturas do plano, em qualquer status (o que impede excluir). */
export function subscriptionsTotal(counters: ClubPlanStatsCounters | null | undefined): number {
  if (!counters) return 0
  return counters.active + counters.pastDue + counters.suspended + counters.canceled + counters.pendingPayment
}

/** Participação do plano nas vidas do clube, 0–1. */
export function livesShare(counters: ClubPlanStatsCounters | null, totals: ClubPlanStatsCounters | null): number {
  if (!counters || !totals || totals.lives <= 0) return 0
  return Math.min(1, counters.lives / totals.lives)
}

export function formatInt(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString('pt-BR')
}

export function formatShare(share: number): string {
  return `${(share * 100).toLocaleString('pt-BR', { maximumFractionDigits: share > 0 && share < 0.1 ? 1 : 0 })}%`
}

/** Selo exibido no card: o do plano ou, com destaque e sem selo, "Mais escolhido". */
export function planBadge(plan: Pick<ClubPlan, 'badge' | 'highlight'>): string | null {
  return plan.badge ?? (plan.highlight ? 'Mais escolhido' : null)
}

export const PLAN_STATUS_LABELS: Record<ActiveStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
}

// ---------------------------------------------------------------------------
// Lista: filtros e ordenação
// ---------------------------------------------------------------------------

export type PlanStatusFilter = 'all' | ActiveStatus
export type PlanSortKey = 'display' | 'lives' | 'mrr'

export interface PlanListFilters {
  q: string
  status: PlanStatusFilter
  /** `'all'` ou um valor de `audience`. */
  audience: string
  sort: PlanSortKey
}

export const PLAN_STATUS_FILTER_OPTIONS: { value: ActiveStatus; label: string }[] = [
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
]

/** `display` é o "todos" do select de ordenação. */
export const PLAN_SORT_OPTIONS: { value: Exclude<PlanSortKey, 'display'>; label: string }[] = [
  { value: 'lives', label: 'Mais vidas' },
  { value: 'mrr', label: 'Maior MRR' },
]

/** Minúsculas e sem acento: "fam" e "familia" acham "Família". */
export function normalizeSearch(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function planAudiences(plans: readonly ClubPlan[]): string[] {
  const seen = new Set<string>()
  for (const plan of plans) if (plan.audience) seen.add(plan.audience)
  return [...seen].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export function filterAndSortPlans(
  plans: readonly ClubPlan[],
  report: ClubPlanStatsReport | null,
  filters: PlanListFilters,
): ClubPlan[] {
  const q = normalizeSearch(filters.q)
  const visible = plans.filter(plan => {
    if (filters.status !== 'all' && plan.status !== filters.status) return false
    if (filters.audience !== 'all' && plan.audience !== filters.audience) return false
    if (!q) return true
    // Público tem filtro próprio e a descrição é texto longo: entrar na busca
    // faria "fam" trazer o Plus ("Casal ou família pequena") junto do Família.
    return [plan.name, plan.tagline, plan.badge].some(text => normalizeSearch(text).includes(q))
  })

  // Exibição = a ordem da vitrine, com os inativos (que não aparecem lá) no fim.
  const display = [
    ...sortClubPlansForDisplay(visible.filter(plan => plan.status === 'active')),
    ...sortClubPlansForDisplay(visible.filter(plan => plan.status !== 'active')),
  ]
  if (filters.sort === 'display' || !report) return display

  const metric = (plan: ClubPlan) => {
    const stats = statsForPlan(report, plan.id)
    return filters.sort === 'lives' ? (stats?.lives ?? 0) : (stats?.mrr ?? 0)
  }
  // `sort` é estável: empate mantém a ordem de exibição.
  return display.sort((a, b) => metric(b) - metric(a))
}

// ---------------------------------------------------------------------------
// Pessoas do plano
// ---------------------------------------------------------------------------

export type PeopleStatusFilter = 'all' | ClubSubscriptionStatus

export const PEOPLE_STATUS_FILTERS: {
  value: PeopleStatusFilter
  label: string
  count: (counters: ClubPlanStatsCounters) => number
}[] = [
  { value: 'all', label: 'Todos', count: counters => subscriptionsTotal(counters) },
  { value: 'active', label: 'Ativos', count: counters => counters.active },
  { value: 'past_due', label: 'Em atraso', count: counters => counters.pastDue },
  { value: 'suspended', label: 'Suspensos', count: counters => counters.suspended },
  { value: 'pending_payment', label: 'Pendentes', count: counters => counters.pendingPayment },
  { value: 'canceled', label: 'Cancelados', count: counters => counters.canceled },
]

// ---------------------------------------------------------------------------
// Coberturas: modelos do "Adicionar cobertura"
// ---------------------------------------------------------------------------

export interface CoverageTemplate {
  /** Vira o `id` da cobertura (com sufixo se repetir). */
  key: string
  coverage: Omit<ClubPlanCoverage, 'id'>
}

function template(
  key: string,
  category: ClubCoverageCategory,
  title: string,
  kind: ClubCoverageKind,
  options: {
    value?: number
    limit?: [number, ClubCoverageLimitPeriod]
    waitingDays: number
    channel: ClubCoverageChannel
    provider?: string
    description: string
  },
): CoverageTemplate {
  return {
    key,
    coverage: {
      category,
      title,
      description: options.description,
      kind,
      value: options.value ?? null,
      limitQuantity: options.limit ? options.limit[0] : null,
      limitPeriod: options.limit ? options.limit[1] : null,
      waitingDays: options.waitingDays,
      channel: options.channel,
      provider: options.provider ?? null,
    },
  }
}

/** Os 13 benefícios que os planos de referência usam — o admin ajusta valor e carência depois. */
export const COVERAGE_TEMPLATES: CoverageTemplate[] = [
  template('tele', 'telemedicine', 'Telemedicina 24h', 'included', {
    waitingDays: 0,
    channel: 'online',
    provider: 'Parceiro de telemedicina',
    description: 'Clínico geral por vídeo, 24 horas, com receita e atestado digitais.',
  }),
  template('espe', 'telemedicine', 'Especialistas online', 'copay', {
    value: 39.9,
    waitingDays: 15,
    channel: 'online',
    provider: 'Parceiro de telemedicina',
    description: 'Dermatologia, pediatria, ginecologia, cardiologia e outras especialidades por vídeo.',
  }),
  template('cons', 'consultations', 'Consultas presenciais', 'copay', {
    value: 39.9,
    waitingDays: 15,
    channel: 'in_person',
    description: 'Clínico geral e especialidades básicas na rede credenciada, com agendamento pela central.',
  }),
  template('exam', 'exams', 'Exames laboratoriais e de imagem', 'discount_percent', {
    value: 40,
    waitingDays: 15,
    channel: 'in_person',
    description: 'Desconto sobre a tabela dos laboratórios e clínicas parceiros.',
  }),
  template('chk', 'exams', 'Check-up anual', 'usage_limit', {
    limit: [1, 'year'],
    waitingDays: 90,
    channel: 'in_person',
    provider: 'Laboratório parceiro',
    description: 'Hemograma, glicemia, colesterol e urina tipo 1, uma vez por ano para cada pessoa inscrita.',
  }),
  template('farm', 'pharmacy', 'Desconto em farmácias', 'discount_percent', {
    value: 35,
    waitingDays: 0,
    channel: 'in_person',
    provider: 'Rede de farmácias parceiras',
    description: 'Medicamentos de marca e genéricos na rede de farmácias parceiras, com a carteirinha digital.',
  }),
  template('odpr', 'dental', 'Odontologia preventiva', 'usage_limit', {
    limit: [2, 'year'],
    waitingDays: 60,
    channel: 'in_person',
    provider: 'Rede odontológica parceira',
    description: 'Limpeza, aplicação de flúor e avaliação com dentista parceiro.',
  }),
  template('odtr', 'dental', 'Tratamentos odontológicos', 'discount_percent', {
    value: 30,
    waitingDays: 60,
    channel: 'in_person',
    provider: 'Rede odontológica parceira',
    description: 'Desconto em tratamentos na rede odontológica parceira.',
  }),
  template('psic', 'mental_health', 'Psicologia online', 'copay', {
    value: 49.9,
    limit: [4, 'month'],
    waitingDays: 30,
    channel: 'online',
    provider: 'Parceiro de saúde mental',
    description: 'Sessões por vídeo com psicólogos parceiros.',
  }),
  template('nutr', 'wellness', 'Nutricionista online', 'usage_limit', {
    limit: [2, 'year'],
    waitingDays: 30,
    channel: 'online',
    provider: 'Parceiro de telemedicina',
    description: 'Consulta por vídeo com nutricionista e plano alimentar.',
  }),
  template('resi', 'assistance', 'Assistência residencial 24h', 'usage_limit', {
    limit: [2, 'year'],
    waitingDays: 30,
    channel: 'in_person',
    provider: 'Parceiro de assistência 24h',
    description:
      'Chaveiro, encanador e eletricista em emergências na residência do titular (mão de obra; material por conta do associado).',
  }),
  template('fune', 'assistance', 'Assistência funeral familiar', 'included', {
    waitingDays: 90,
    channel: 'in_person',
    provider: 'Parceiro de assistência funeral',
    description:
      'Organização do funeral e traslado para titular e dependentes inscritos, prestados por parceiro conforme o regulamento. Morte acidental sem carência.',
  }),
  template('vant', 'discounts', 'Clube de vantagens', 'included', {
    waitingDays: 0,
    channel: 'both',
    description: 'Descontos em lojas, cursos, lazer e restaurantes parceiros.',
  }),
]

export const CUSTOM_COVERAGE_TEMPLATE: CoverageTemplate = {
  key: 'cov',
  coverage: {
    category: 'other',
    title: '',
    description: null,
    kind: 'included',
    value: null,
    limitQuantity: null,
    limitPeriod: null,
    waitingDays: 0,
    channel: 'both',
    provider: null,
  },
}

/** Modelos agrupados por categoria, na ordem canônica do enum. */
export function coverageTemplatesByCategory(): { category: ClubCoverageCategory; label: string; templates: CoverageTemplate[] }[] {
  return clubCoverageCategory.options
    .map(category => ({
      category,
      label: CLUB_COVERAGE_CATEGORY_LABELS[category],
      templates: COVERAGE_TEMPLATES.filter(item => item.coverage.category === category),
    }))
    .filter(group => group.templates.length > 0)
}

/** `tele`, `tele_2`, `tele_3`… — chave estável e única dentro do plano (máx. 40). */
export function uniqueCoverageId(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing)
  const root =
    normalizeSearch(base)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 34) || 'cov'
  if (!taken.has(root)) return root
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}_${n}`
    if (!taken.has(candidate)) return candidate
  }
  return `${root}_${Date.now().toString(36)}`.slice(0, 40)
}

// ---------------------------------------------------------------------------
// Formulário: estado ↔ CreateClubPlanInput
// ---------------------------------------------------------------------------

export interface CoverageFormState {
  /** Chave local da lista (React); não vai para a API. */
  key: string
  id: string
  category: ClubCoverageCategory
  title: string
  description: string
  kind: ClubCoverageKind
  /** % (desconto) ou R$ (coparticipação), como digitado. */
  value: string
  limitQuantity: string
  /** `''` = sem limite. */
  limitPeriod: ClubCoverageLimitPeriod | ''
  waitingDays: string
  channel: ClubCoverageChannel
  provider: string
}

export interface DependentRuleFormState {
  enabled: boolean
  /** `''` = sem limite de idade. */
  maxAge: string
}

export interface PlanFormState {
  // Identidade
  name: string
  tagline: string
  description: string
  audience: string
  badge: string
  // Preço e dependentes
  priceMonthly: string
  priceDependentMonthly: string
  includedDependents: string
  /** `''` = sem limite; `0` = individual. */
  maxDependents: string
  enrollmentFee: string
  enrollmentFeeWaived: boolean
  // Elegibilidade
  holderMinAge: string
  holderMaxAge: string
  /** Desligado = qualquer parentesco, sem limite de idade (`dependentRules: null`). */
  restrictRelationships: boolean
  dependentRules: Record<DependentRelationship, DependentRuleFormState>
  // Coberturas
  coverages: CoverageFormState[]
  // Pagamento
  /** Desligado = todas as formas habilitadas no clube (`paymentMethods: null`). */
  restrictPaymentMethods: boolean
  paymentMethods: Record<ClubPaymentMethod, boolean>
  // Contrato
  loyaltyMonths: string
  cancellationPolicy: string
  adjustmentPolicy: string
  terms: string
  // Vitrine
  highlight: boolean
  sortOrder: string
  status: ActiveStatus
  features: string
  /** Amarração com o ERP — preservada, não editada aqui. */
  upstreamPlanCodigo: string | null
}

let keySequence = 0
export function nextCoverageKey(): string {
  keySequence += 1
  return `k${Date.now().toString(36)}${keySequence}`
}

function decimalText(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function intText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

function emptyDependentRules(): Record<DependentRelationship, DependentRuleFormState> {
  const rules = {} as Record<DependentRelationship, DependentRuleFormState>
  for (const relationship of dependentRelationship.options) rules[relationship] = { enabled: false, maxAge: '' }
  return rules
}

export function coverageToFormState(coverage: ClubPlanCoverage): CoverageFormState {
  return {
    key: nextCoverageKey(),
    id: coverage.id,
    category: coverage.category,
    title: coverage.title,
    description: coverage.description ?? '',
    kind: coverage.kind,
    value:
      coverage.value === null
        ? ''
        : coverage.kind === 'copay'
          ? decimalText(coverage.value)
          : String(coverage.value).replace('.', ','),
    limitQuantity: intText(coverage.limitQuantity),
    limitPeriod: coverage.limitPeriod ?? '',
    waitingDays: String(coverage.waitingDays ?? 0),
    channel: coverage.channel,
    provider: coverage.provider ?? '',
  }
}

export function coverageFromTemplate(item: CoverageTemplate, existingIds: Iterable<string>): CoverageFormState {
  return coverageToFormState({ ...item.coverage, id: uniqueCoverageId(item.key, existingIds) })
}

export function emptyPlanForm(): PlanFormState {
  return {
    name: '',
    tagline: '',
    description: '',
    audience: '',
    badge: '',
    priceMonthly: '',
    priceDependentMonthly: '',
    includedDependents: '',
    maxDependents: '',
    enrollmentFee: '',
    enrollmentFeeWaived: false,
    holderMinAge: '',
    holderMaxAge: '',
    restrictRelationships: false,
    dependentRules: emptyDependentRules(),
    coverages: [],
    restrictPaymentMethods: false,
    paymentMethods: { pix: true, boleto: true, credit_card: true },
    loyaltyMonths: '',
    cancellationPolicy: '',
    adjustmentPolicy: '',
    terms: '',
    highlight: false,
    sortOrder: '',
    status: 'active',
    features: '',
    upstreamPlanCodigo: null,
  }
}

export function planToFormState(plan: ClubPlan): PlanFormState {
  const rules = emptyDependentRules()
  const hasRules = (plan.dependentRules ?? []).length > 0
  for (const rule of plan.dependentRules ?? []) rules[rule.relationship] = { enabled: true, maxAge: intText(rule.maxAge) }

  const methods = plan.paymentMethods && plan.paymentMethods.length > 0 ? plan.paymentMethods : null
  return {
    name: plan.name,
    tagline: plan.tagline ?? '',
    description: plan.description ?? '',
    audience: plan.audience ?? '',
    badge: plan.badge ?? '',
    priceMonthly: decimalText(plan.priceMonthly),
    priceDependentMonthly: decimalText(plan.priceDependentMonthly),
    includedDependents: intText(plan.includedDependents),
    maxDependents: intText(plan.maxDependents),
    enrollmentFee: decimalText(plan.enrollmentFee),
    enrollmentFeeWaived: plan.enrollmentFeeWaived === true,
    holderMinAge: intText(plan.holderMinAge),
    holderMaxAge: intText(plan.holderMaxAge),
    restrictRelationships: hasRules,
    dependentRules: rules,
    coverages: (plan.coverages ?? []).map(coverageToFormState),
    restrictPaymentMethods: methods !== null,
    paymentMethods: {
      pix: methods === null || methods.includes('pix'),
      boleto: methods === null || methods.includes('boleto'),
      credit_card: methods === null || methods.includes('credit_card'),
    },
    loyaltyMonths: intText(plan.loyaltyMonths),
    cancellationPolicy: plan.cancellationPolicy ?? '',
    adjustmentPolicy: plan.adjustmentPolicy ?? '',
    terms: plan.terms ?? '',
    highlight: plan.highlight,
    sortOrder: intText(plan.sortOrder),
    status: plan.status,
    features: (plan.features ?? []).join('\n'),
    upstreamPlanCodigo: plan.upstreamPlanCodigo ?? null,
  }
}

/** Cobertura como está no formulário, sem validar — para prévia e "Gerar destaques". */
export function coverageFromForm(state: CoverageFormState): ClubPlanCoverage {
  const quantity = /^\d+$/.test(state.limitQuantity.trim()) ? Number(state.limitQuantity.trim()) : null
  const value =
    state.kind === 'copay'
      ? parseBRL(state.value)
      : state.kind === 'discount_percent'
        ? parseBRL(state.value)
        : null
  return {
    id: state.id,
    category: state.category,
    title: state.title.trim(),
    description: state.description.trim() || null,
    kind: state.kind,
    value,
    limitQuantity: state.limitPeriod ? quantity : null,
    limitPeriod: state.limitPeriod && quantity ? state.limitPeriod : null,
    waitingDays: /^\d+$/.test(state.waitingDays.trim()) ? Number(state.waitingDays.trim()) : 0,
    channel: state.channel,
    provider: state.provider.trim() || null,
  }
}

/** Preço como está no formulário, sem validar — para a prévia ao vivo do `quoteClubPlan`. */
export function pricingFromForm(state: PlanFormState): Pick<
  ClubPlan,
  'priceMonthly' | 'priceDependentMonthly' | 'maxDependents' | 'includedDependents' | 'enrollmentFee' | 'enrollmentFeeWaived'
> {
  const int = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null)
  return {
    priceMonthly: parseBRL(state.priceMonthly) ?? 0,
    priceDependentMonthly: parseBRL(state.priceDependentMonthly),
    maxDependents: int(state.maxDependents),
    includedDependents: int(state.includedDependents),
    enrollmentFee: parseBRL(state.enrollmentFee),
    enrollmentFeeWaived: state.enrollmentFeeWaived,
  }
}

/**
 * Plano como está no formulário, SEM validar — para as prévias ao vivo (regras
 * de dependentes, formas efetivas, rascunho do regulamento). Campo inválido
 * vira `null`; quem grava é `planFormToInput`.
 */
export function lenientPlanFromForm(state: PlanFormState): CreateClubPlanInput {
  const int = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null)
  const pricing = pricingFromForm(state)
  const rules =
    state.restrictRelationships && pricing.maxDependents !== 0
      ? enabledRelationships(state).map(relationship => ({
          relationship,
          maxAge: int(state.dependentRules[relationship].maxAge),
        }))
      : []
  const methods = state.restrictPaymentMethods
    ? clubPaymentMethod.options.filter(method => state.paymentMethods[method])
    : []
  return {
    name: state.name.trim(),
    description: state.description.trim(),
    priceMonthly: pricing.priceMonthly,
    features: [],
    audience: state.audience.trim() || null,
    highlight: state.highlight,
    upstreamPlanCodigo: state.upstreamPlanCodigo,
    status: state.status,
    priceDependentMonthly: pricing.priceDependentMonthly,
    maxDependents: pricing.maxDependents,
    includedDependents: pricing.includedDependents,
    enrollmentFee: pricing.enrollmentFee,
    enrollmentFeeWaived: pricing.enrollmentFeeWaived,
    holderMinAge: int(state.holderMinAge),
    holderMaxAge: int(state.holderMaxAge),
    dependentRules: rules.length > 0 ? rules : null,
    coverages: state.coverages.map(coverageFromForm),
    paymentMethods: methods.length > 0 && methods.length < clubPaymentMethod.options.length ? methods : null,
    loyaltyMonths: int(state.loyaltyMonths),
    cancellationPolicy: state.cancellationPolicy.trim() || null,
    adjustmentPolicy: state.adjustmentPolicy.trim() || null,
    terms: null,
  }
}

/** "Destaques do card" a partir das coberturas: título + valor quando não é só "Incluso". */
export function featuresFromCoverages(coverages: readonly ClubPlanCoverage[]): string[] {
  return coverages
    .filter(coverage => coverage.title.trim() !== '')
    .map(coverage => {
      const value = describeCoverageValue(coverage)
      return value === 'Incluso' ? coverage.title.trim() : `${coverage.title.trim()} · ${value}`
    })
}

/** Teto do checkout (`checkoutInput.dependents.max(20)`). */
export const MAX_DEPENDENTS_LIMIT = 20

export interface PlanFormContext {
  /** Formas habilitadas no clube (`billing_settings`); `null` = não carregou, não confere. */
  enabledMethods?: readonly ClubPaymentMethod[] | null
  /** Nomes dos OUTROS planos do inquilino (checagem de nome repetido antes da API). */
  otherPlanNames?: readonly string[]
}

export interface PlanFormResult {
  input: CreateClubPlanInput | null
  /** Caminho no formato da API (`coverages.0.value`) → mensagem. */
  errors: Record<string, string>
}

type Parsed<T> = { value: T; error?: undefined } | { value: null; error: string }

function parseMoneyField(text: string, options: { required?: boolean; requiredMessage?: string } = {}): Parsed<number | null> {
  const trimmed = text.trim()
  if (!trimmed) {
    return options.required ? { value: null, error: options.requiredMessage ?? 'Informe o valor' } : { value: null }
  }
  const value = parseBRL(trimmed)
  if (value === null || value < 0) return { value: null, error: 'Informe um valor válido, ex.: 49,90' }
  if (value > 1_000_000) return { value: null, error: 'Valor alto demais' }
  return { value }
}

function parseIntField(
  text: string,
  options: { min: number; max: number; rangeMessage?: string; required?: boolean; requiredMessage?: string },
): Parsed<number | null> {
  const trimmed = text.trim()
  if (!trimmed) {
    return options.required ? { value: null, error: options.requiredMessage ?? 'Campo obrigatório' } : { value: null }
  }
  if (!/^\d+$/.test(trimmed)) return { value: null, error: 'Use um número inteiro' }
  const value = Number(trimmed)
  if (value < options.min || value > options.max) {
    return { value: null, error: options.rangeMessage ?? `Use um número de ${options.min} a ${options.max}` }
  }
  return { value }
}

function maxLength(text: string, max: number): string | undefined {
  return text.trim().length > max ? `Use até ${max.toLocaleString('pt-BR')} caracteres` : undefined
}

/** Ordem em que as regras de parentesco são enviadas (a mesma do enum). */
function enabledRelationships(state: PlanFormState): DependentRelationship[] {
  return dependentRelationship.options.filter(relationship => state.dependentRules[relationship].enabled)
}

/** Mensagem do zod que escapou em inglês (default) → frase pt-BR genérica. */
function ptMessage(issue: { code: string; message: string }): string {
  if (!/^(String|Number|Expected|Invalid|Required|Array)\b/.test(issue.message)) return issue.message
  switch (issue.code) {
    case 'too_small':
      return 'Valor abaixo do permitido'
    case 'too_big':
      return 'Valor acima do permitido'
    default:
      return 'Valor inválido'
  }
}

/**
 * Valida o formulário com o MESMO schema e as MESMAS regras da API
 * (`createClubPlanInput` + `checkClubPlanConsistency`) e devolve o input
 * pronto ou os erros por campo. Texto digitado é convertido aqui, com
 * mensagem pt-BR para cada formato inválido.
 */
export function planFormToInput(state: PlanFormState, context: PlanFormContext = {}): PlanFormResult {
  const errors: Record<string, string> = {}
  const set = (path: string, message: string | undefined) => {
    if (message && !errors[path]) errors[path] = message
  }

  // Identidade
  const name = state.name.trim()
  if (!name) set('name', 'Informe o nome do plano')
  else if (name.length > 80) set('name', 'Use até 80 caracteres')
  else if (context.otherPlanNames?.some(other => normalizeSearch(other) === normalizeSearch(name))) {
    set('name', 'Já existe um plano com este nome')
  }
  set('tagline', maxLength(state.tagline, 120))
  set('badge', maxLength(state.badge, 30))
  set('description', maxLength(state.description, 2000))
  set('audience', maxLength(state.audience, 60))

  // Preço e dependentes
  const price = parseMoneyField(state.priceMonthly, { required: true, requiredMessage: 'Informe a mensalidade, ex.: 49,90' })
  set('priceMonthly', price.error)
  const dependentPrice = parseMoneyField(state.priceDependentMonthly)
  set('priceDependentMonthly', dependentPrice.error)
  const maxDependents = parseIntField(state.maxDependents, {
    min: 0,
    max: MAX_DEPENDENTS_LIMIT,
    rangeMessage: `Use de 0 a ${MAX_DEPENDENTS_LIMIT} (o checkout aceita até ${MAX_DEPENDENTS_LIMIT})`,
  })
  set('maxDependents', maxDependents.error)
  const included = parseIntField(state.includedDependents, { min: 0, max: MAX_DEPENDENTS_LIMIT })
  set('includedDependents', included.error)
  const fee = parseMoneyField(state.enrollmentFee)
  set('enrollmentFee', fee.error)

  // Elegibilidade
  const minAge = parseIntField(state.holderMinAge, {
    min: 18,
    max: 120,
    rangeMessage: 'O titular precisa ter de 18 a 120 anos',
  })
  set('holderMinAge', minAge.error)
  const maxAge = parseIntField(state.holderMaxAge, {
    min: 18,
    max: 120,
    rangeMessage: 'Use uma idade de 18 a 120 anos',
  })
  set('holderMaxAge', maxAge.error)

  const individual = maxDependents.value === 0
  let dependentRules: ClubPlanDependentRule[] | null = null
  if (state.restrictRelationships && !individual) {
    const relationships = enabledRelationships(state)
    if (relationships.length === 0) {
      set('dependentRules', 'Marque ao menos um parentesco — ou use máximo de dependentes 0 para um plano individual')
    }
    dependentRules = relationships.map(relationship => {
      const parsed = parseIntField(state.dependentRules[relationship].maxAge, {
        min: 0,
        max: 120,
        rangeMessage: 'Use uma idade de 0 a 120 anos',
      })
      set(`dependentRules.${relationship}.maxAge`, parsed.error)
      return { relationship, maxAge: parsed.value }
    })
  }

  // Coberturas
  if (state.coverages.length > 40) set('coverages', 'Use até 40 coberturas')
  const coverages: ClubPlanCoverage[] = state.coverages.map((item, index) => {
    const at = (field: string) => `coverages.${index}.${field}`
    const title = item.title.trim()
    if (title.length < 2) set(at('title'), 'Informe o título da cobertura')
    set(at('title'), maxLength(item.title, 80))
    set(at('description'), maxLength(item.description, 400))
    set(at('provider'), maxLength(item.provider, 80))

    let value: number | null = null
    if (item.kind === 'discount_percent') {
      const parsed = parseBRL(item.value)
      if (parsed === null || parsed <= 0 || parsed > 100) set(at('value'), 'Informe o percentual de desconto (de 1 a 100)')
      else value = parsed
    } else if (item.kind === 'copay') {
      const parsed = parseBRL(item.value)
      if (parsed === null || parsed <= 0) set(at('value'), 'Informe o valor da coparticipação por uso')
      else value = parsed
    }

    const quantity = parseIntField(item.limitQuantity, { min: 1, max: 999, rangeMessage: 'Use de 1 a 999 usos' })
    set(at('limitQuantity'), quantity.error)
    const period = item.limitPeriod || null
    if (item.kind === 'usage_limit' && (quantity.value === null || period === null)) {
      set(at('limitQuantity'), 'Informe quantos usos e em qual período')
    } else if ((quantity.value === null) !== (period === null) && !quantity.error) {
      set(period ? at('limitQuantity') : at('limitPeriod'), 'Informe a quantidade e o período do limite juntos')
    }

    const waiting = parseIntField(item.waitingDays || '0', { min: 0, max: 730, rangeMessage: 'Carência de 0 a 730 dias' })
    set(at('waitingDays'), waiting.error)

    return {
      id: item.id.trim() || `cov_${index + 1}`,
      category: item.category,
      title,
      description: item.description.trim() || null,
      kind: item.kind,
      value,
      limitQuantity: period ? quantity.value : null,
      limitPeriod: quantity.value !== null ? period : null,
      waitingDays: waiting.value ?? 0,
      channel: item.channel,
      provider: item.provider.trim() || null,
    }
  })

  // Pagamento
  let paymentMethods: ClubPaymentMethod[] | null = null
  if (state.restrictPaymentMethods) {
    paymentMethods = clubPaymentMethod.options.filter(method => state.paymentMethods[method])
    if (paymentMethods.length === 0) set('paymentMethods', 'Marque ao menos uma forma de pagamento')
    // Todas marcadas = o mesmo que não restringir.
    if (paymentMethods.length === clubPaymentMethod.options.length) paymentMethods = null
  }

  // Contrato
  const loyalty = parseIntField(state.loyaltyMonths, { min: 0, max: 60, rangeMessage: 'Use de 0 a 60 meses' })
  set('loyaltyMonths', loyalty.error)
  set('cancellationPolicy', maxLength(state.cancellationPolicy, 4000))
  set('adjustmentPolicy', maxLength(state.adjustmentPolicy, 2000))
  set('terms', maxLength(state.terms, 20000))

  // Vitrine
  const sortOrder = parseIntField(state.sortOrder, { min: 0, max: 999, rangeMessage: 'Use de 0 a 999' })
  set('sortOrder', sortOrder.error)
  const features = state.features
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  if (features.some(line => line.length > 120)) set('features', 'Cada destaque com até 120 caracteres')

  const candidate: CreateClubPlanInput = {
    name,
    description: state.description.trim(),
    priceMonthly: price.value ?? 0,
    features,
    audience: state.audience.trim() || null,
    highlight: state.highlight,
    upstreamPlanCodigo: state.upstreamPlanCodigo,
    status: state.status,
    priceDependentMonthly: dependentPrice.value,
    maxDependents: maxDependents.value,
    tagline: state.tagline.trim() || null,
    badge: state.badge.trim() || null,
    sortOrder: sortOrder.value,
    includedDependents: included.value,
    enrollmentFee: fee.value,
    enrollmentFeeWaived: state.enrollmentFeeWaived,
    holderMinAge: minAge.value,
    holderMaxAge: maxAge.value,
    dependentRules,
    coverages,
    paymentMethods,
    loyaltyMonths: loyalty.value,
    cancellationPolicy: state.cancellationPolicy.trim() || null,
    adjustmentPolicy: state.adjustmentPolicy.trim() || null,
    terms: state.terms.trim() || null,
  }

  // Mesmo schema da API — pega o que a conversão acima não cobriu.
  const parsed = createClubPlanInput.safeParse(candidate)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      set(remapPath(issue.path.join('.'), candidate), ptMessage(issue))
    }
  }

  // Regras entre campos — as mesmas do POST/PATCH.
  for (const issue of checkClubPlanConsistency(candidate)) set(remapPath(issue.path, candidate), issue.message)

  // Plano ativo sem nenhuma forma de pagamento utilizável no checkout.
  if (
    candidate.status === 'active' &&
    context.enabledMethods &&
    context.enabledMethods.length > 0 &&
    effectivePaymentMethods(candidate, context.enabledMethods).length === 0
  ) {
    set('paymentMethods', 'Nenhuma forma de pagamento do plano está habilitada no clube')
  }

  return Object.keys(errors).length > 0 ? { input: null, errors } : { input: parsed.success ? parsed.data : candidate, errors }
}

/**
 * `dependentRules.<i>.<campo>` (índice do array enviado) → `dependentRules.<parentesco>.<campo>`,
 * que é como o formulário identifica a linha. O resto passa igual.
 */
function remapPath(path: string, input: Pick<CreateClubPlanInput, 'dependentRules'>): string {
  const match = /^dependentRules\.(\d+)(\..+)?$/.exec(path)
  if (!match) return path
  const rule = input.dependentRules?.[Number(match[1])]
  if (!rule) return 'dependentRules'
  return `dependentRules.${rule.relationship}${match[2] ?? '.maxAge'}`
}

/** `fieldErrors` da API → chaves do formulário (mesma regra do `remapPath`). */
export function remapApiFieldErrors(
  fieldErrors: Record<string, string> | undefined,
  input: Pick<CreateClubPlanInput, 'dependentRules'>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [path, message] of Object.entries(fieldErrors ?? {})) {
    const key = remapPath(path, input)
    if (!errors[key]) errors[key] = message
  }
  return errors
}

// ---------------------------------------------------------------------------
// Seções do formulário (navegação e contagem de erros)
// ---------------------------------------------------------------------------

export type PlanFormSection =
  | 'identidade'
  | 'preco'
  | 'elegibilidade'
  | 'coberturas'
  | 'pagamento'
  | 'contrato'
  | 'vitrine'

export const PLAN_FORM_SECTIONS: { id: PlanFormSection; label: string }[] = [
  { id: 'identidade', label: 'Identidade' },
  { id: 'preco', label: 'Preço e dependentes' },
  { id: 'elegibilidade', label: 'Elegibilidade' },
  { id: 'coberturas', label: 'Coberturas' },
  { id: 'pagamento', label: 'Pagamento' },
  { id: 'contrato', label: 'Contrato e regulamento' },
  { id: 'vitrine', label: 'Vitrine' },
]

const SECTION_BY_FIELD: Record<string, PlanFormSection> = {
  name: 'identidade',
  tagline: 'identidade',
  description: 'identidade',
  audience: 'identidade',
  badge: 'identidade',
  priceMonthly: 'preco',
  priceDependentMonthly: 'preco',
  includedDependents: 'preco',
  maxDependents: 'preco',
  enrollmentFee: 'preco',
  enrollmentFeeWaived: 'preco',
  holderMinAge: 'elegibilidade',
  holderMaxAge: 'elegibilidade',
  dependentRules: 'elegibilidade',
  coverages: 'coberturas',
  paymentMethods: 'pagamento',
  loyaltyMonths: 'contrato',
  cancellationPolicy: 'contrato',
  adjustmentPolicy: 'contrato',
  terms: 'contrato',
  highlight: 'vitrine',
  sortOrder: 'vitrine',
  status: 'vitrine',
  features: 'vitrine',
  upstreamPlanCodigo: 'vitrine',
}

export function sectionOfField(path: string): PlanFormSection {
  return SECTION_BY_FIELD[path.split('.')[0]] ?? 'identidade'
}

export function errorsBySection(errors: Record<string, string>): Record<PlanFormSection, number> {
  const counts = { identidade: 0, preco: 0, elegibilidade: 0, coberturas: 0, pagamento: 0, contrato: 0, vitrine: 0 }
  for (const path of Object.keys(errors)) counts[sectionOfField(path)] += 1
  return counts
}

/** Primeira seção com erro, na ordem da tela. */
export function firstErrorSection(errors: Record<string, string>): PlanFormSection | null {
  const counts = errorsBySection(errors)
  return PLAN_FORM_SECTIONS.find(section => counts[section.id] > 0)?.id ?? null
}

// ---------------------------------------------------------------------------
// Rascunho de regulamento (mesmo roteiro do seed `montarRegulamento`)
// ---------------------------------------------------------------------------

export interface TermsContext {
  orgName: string
  enabledMethods?: readonly ClubPaymentMethod[] | null
  suspendAfterDays?: number | null
  cancelAfterDays?: number | null
}

/**
 * Regulamento em texto a partir dos dados do plano — ponto de partida que o
 * admin revisa; o jurídico do clube é quem fecha o texto.
 */
export function draftPlanTerms(plan: CreateClubPlanInput, context: TermsContext): string {
  const methods = context.enabledMethods?.length
    ? effectivePaymentMethods(plan, context.enabledMethods)
    : (plan.paymentMethods ?? [])
  const methodsText = methods.length > 0 ? methods.map(method => CLUB_PAYMENT_METHOD_LABELS[method]).join(', ') : 'as habilitadas pelo clube'
  const waiting = (plan.coverages ?? []).filter(coverage => coverage.waitingDays > 0)
  const delinquency =
    context.suspendAfterDays && context.cancelAfterDays
      ? `Em atraso, os benefícios seguem por ${context.suspendAfterDays} dias; depois a assinatura é suspensa e, após ${context.cancelAfterDays} dias, cancelada.`
      : 'Em atraso, a assinatura pode ser suspensa e, depois, cancelada, nos prazos definidos pelo clube.'
  const dependents =
    plan.maxDependents === 0
      ? 'Plano individual: não aceita dependentes.'
      : `${describeDependentsPolicy(plan)}. Parentescos aceitos: ${describeDependentRules(plan)}. A idade é verificada na adesão.`

  const sentence = (text: string | null | undefined) => {
    const value = (text ?? '').trim()
    return value ? (/[.!?]$/.test(value) ? value : `${value}.`) : ''
  }

  const lines = [
    `REGULAMENTO DO PLANO ${plan.name.toUpperCase()} — ${context.orgName}`,
    '',
    `1. O que é. Clube de benefícios por assinatura mensal que dá acesso a telemedicina, descontos, coparticipações e assistências prestados por parceiros. ${CLUB_PLAN_LEGAL_NOTICE}`,
    '',
    `2. Adesão e vigência. A assinatura começa na confirmação do 1º pagamento, quando são emitidas as carteirinhas digitais, e renova todo mês. ${sentence(describeEnrollmentFee(plan))}`,
    '',
    waiting.length > 0
      ? `3. Carências, contadas da ativação:\n${waiting.map(coverage => `- ${coverage.title}: ${coverage.waitingDays} ${coverage.waitingDays === 1 ? 'dia' : 'dias'}`).join('\n')}\nAs demais coberturas podem ser usadas logo após a ativação.`
      : '3. Carências. Todas as coberturas podem ser usadas logo após a ativação.',
    '',
    `4. Dependentes. ${dependents}`,
    '',
    `5. Pagamento. Formas aceitas: ${methodsText}. A mensalidade vence todo mês no dia da contratação (até o dia 28). ${delinquency}`,
    '',
    '6. Uso. Agendamento pela central ou pelos canais indicados, com a carteirinha digital. Coparticipações e valores com desconto são pagos direto ao parceiro. A rede parceira pode mudar, mantendo benefícios equivalentes.',
    '',
    `7. Cancelamento e fidelidade. ${sentence(describeLoyalty(plan.loyaltyMonths))} ${sentence(plan.cancellationPolicy)}`.trim(),
    '',
    `8. Reajuste. ${sentence(plan.adjustmentPolicy) || 'Conforme comunicado pelo clube com antecedência mínima de 30 dias.'}`,
    '',
    '9. Dados pessoais. Tratados conforme a LGPD, só para prestar os benefícios e cobrar a assinatura.',
  ]
  return lines.join('\n')
}
