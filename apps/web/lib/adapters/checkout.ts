import {
  ASAAS_SANDBOX_APPROVED_CARD,
  ASAAS_SANDBOX_DECLINED_CARD,
  DEFAULT_HOLDER_MIN_AGE,
  SIMULATED_CARD_EXAMPLES,
  checkCheckoutEligibility,
  checkDependentEligibility,
  checkDependentsEligibility,
  checkHolderEligibility,
  checkPaymentMethod,
  checkoutCardSchema,
  checkoutDependentInput,
  checkoutHolderInput,
  checkoutInputSchema,
  checkoutPaymentSchema,
  describeDependentsPolicy,
  effectivePaymentMethods,
  formatBRL,
  holderAgeRange,
  maskCardNumber,
  onlyDigits,
  quoteClubPlan,
  roundCents,
  sortClubPlansForDisplay,
  type CardInputOptions,
  type CheckoutContext,
  type CheckoutInput,
  type CheckoutResult,
  type CheckoutStatus,
  type ClubPaymentMethod,
  type ClubPlan,
  type ClubPlanQuote,
  type DependentRelationship,
  type RetryPaymentInput,
} from '@annetec/contracts'
import { isDemoMode } from '@/lib/demo-mode'

/**
 * Adaptador do checkout público (`/{slug}/assinar`): estado dos formulários da
 * tela ↔ `CheckoutInput` do contrato, validação por passo com os MESMOS
 * schemas e as MESMAS regras de plano (`club-plan-rules`) que a API aplica,
 * preço via `quoteClubPlan` e, só em ambiente de testes (`isDemoMode`), os
 * números dos cartões de teste do gateway.
 *
 * Ordem das checagens = ordem da API: primeiro o schema do contrato, depois a
 * elegibilidade do plano (`checkCheckoutEligibility`). Assim a mensagem que a
 * tela mostra num campo é a mesma que a API devolveria para ele.
 *
 * Puro (sem I/O, sem React): roda no browser. Dados de cartão passam por aqui
 * só em memória — nada é gravado, logado ou posto na URL.
 */

// ---------------------------------------------------------------------------
// Passos
// ---------------------------------------------------------------------------

export type CheckoutStepId = 'plano' | 'titular' | 'pagamento'

/**
 * Passos possíveis, na ordem. Com `?plano=` válido na URL o wizard mostra só
 * "Seus dados" e "Pagamento" (dependentes são um bloco opcional dentro de
 * "Seus dados" e o aceite dos termos fica no "Pagamento"); sem plano, a
 * escolha do plano vem antes. O resultado (QR Pix, boleto, cartão) é a tela
 * de resultado, não um passo.
 */
export const CHECKOUT_STEPS: ReadonlyArray<{ id: CheckoutStepId; label: string; title: string }> = [
  { id: 'plano', label: 'Plano', title: 'Escolha o seu plano' },
  { id: 'titular', label: 'Seus dados', title: 'Seus dados' },
  { id: 'pagamento', label: 'Pagamento', title: 'Pagamento' },
]

export type CheckoutStep = (typeof CHECKOUT_STEPS)[number]

/** Passos visíveis: sem a escolha do plano quando ele veio na URL. */
export function checkoutStepsFor(withPlanStep: boolean): CheckoutStep[] {
  return CHECKOUT_STEPS.filter(step => withPlanStep || step.id !== 'plano')
}

// ---------------------------------------------------------------------------
// Estado dos formulários
// ---------------------------------------------------------------------------

export type FieldErrors = Record<string, string>

export interface HolderForm {
  name: string
  cpf: string
  email: string
  phone: string
  /** `dd/mm/aaaa`, como digitado. */
  birthDate: string
}

export interface DependentForm {
  /** Chave local para a lista do React; não vai para a API. */
  key: string
  name: string
  relationship: DependentRelationship | ''
  /** `dd/mm/aaaa`, como digitado. */
  birthDate: string
  cpf: string
}

export interface CardForm {
  number: string
  holderName: string
  /** `MM/AA`. */
  expiry: string
  ccv: string
  /** Só quando o cartão é de outra pessoa; vazio = CPF do titular. */
  holderCpf: string
  holderPostalCode: string
  holderAddressNumber: string
}

export const emptyHolder = (): HolderForm => ({ name: '', cpf: '', email: '', phone: '', birthDate: '' })

let dependentSeq = 0
export const emptyDependent = (): DependentForm => ({
  key: `dep-${Date.now().toString(36)}-${(dependentSeq++).toString(36)}`,
  name: '',
  relationship: '',
  birthDate: '',
  cpf: '',
})

export const emptyCard = (): CardForm => ({
  number: '',
  holderName: '',
  expiry: '',
  ccv: '',
  holderCpf: '',
  holderPostalCode: '',
  holderAddressNumber: '',
})

/** Acentos soltos depois do `normalize('NFD')` (U+0300–U+036F). */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Nome impresso no cartão a partir do nome do titular: MAIÚSCULAS e sem
 * acento, como vem gravado no plástico. Só sugestão — a pessoa pode editar.
 */
export function cardNameFromHolder(name: string): string {
  return name
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** Texto do botão final: "Gerar Pix de R$ 59,90" / "Gerar boleto de R$ 59,90" / "Pagar R$ 59,90". */
export function payButtonLabel(method: ClubPaymentMethod, amount: number): string {
  const value = formatBRL(amount)
  if (method === 'pix') return `Gerar Pix de ${value}`
  if (method === 'boleto') return `Gerar boleto de ${value}`
  return `Pagar ${value}`
}

/** Texto do botão final enquanto o pedido é enviado. */
export function payButtonBusyLabel(method: ClubPaymentMethod): string {
  if (method === 'pix') return 'Gerando Pix…'
  if (method === 'boleto') return 'Gerando boleto…'
  return 'Processando pagamento…'
}

/** Métodos na ordem de exibição (Pix primeiro: é o padrão do checkout), filtrados pelo que o inquilino habilitou. */
export const METHOD_ORDER: readonly ClubPaymentMethod[] = ['pix', 'credit_card', 'boleto']

export function orderedMethods(enabled: readonly ClubPaymentMethod[]): ClubPaymentMethod[] {
  return METHOD_ORDER.filter(method => enabled.includes(method))
}

/**
 * Formas de pagamento EFETIVAS do plano, na ordem das abas: habilitadas no
 * clube ∩ aceitas pelo plano (`effectivePaymentMethods`, a regra da API).
 * Sem plano, valem as do clube.
 */
export function methodsFor(plan: ClubPlan | null | undefined, enabled: readonly ClubPaymentMethod[]): ClubPaymentMethod[] {
  return orderedMethods(plan ? effectivePaymentMethods(plan, enabled) : enabled)
}

const METHOD_SHORT_LABELS: Record<ClubPaymentMethod, string> = {
  credit_card: 'cartão de crédito',
  pix: 'Pix',
  boleto: 'boleto',
}

/** "Cartão de crédito, Pix ou boleto" / "Cartão de crédito ou Pix". */
export function describeMethods(methods: readonly ClubPaymentMethod[]): string {
  const labels = orderedMethods(methods).map(method => METHOD_SHORT_LABELS[method])
  if (labels.length === 0) return 'Nenhuma forma de pagamento disponível'
  const text = labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(', ')} ou ${labels[labels.length - 1]}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// ---------------------------------------------------------------------------
// Datas (dd/mm/aaaa ↔ yyyy-MM-dd) — o contrato não tem máscara de data
// ---------------------------------------------------------------------------

/** Progressiva: `"150319"` → `"15/03/19"`. */
export function maskDateBR(value: string): string {
  const d = onlyDigits(value).slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/** `"15/03/1988"` → `"1988-03-15"`; incompleta ou inexistente (31/02) → `null`. */
export function parseDateBR(value: string): string | null {
  const d = onlyDigits(value)
  if (d.length !== 8) return null
  const day = Number(d.slice(0, 2))
  const month = Number(d.slice(2, 4))
  const year = Number(d.slice(4, 8))
  if (year < 1900 || month < 1 || month > 12 || day < 1) return null
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null
  }
  return `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`
}

/** Hoje em America/Sao_Paulo, `yyyy-MM-dd`. */
export function todaySP(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

/**
 * Próxima cobrança estimada: ciclo mensal pré-pago, `dueDay` = dia da
 * contratação limitado a 28 (blueprint §0.1-14).
 */
export function estimateNextChargeDate(now: Date = new Date()): string {
  const [y, m, d] = todaySP(now).split('-').map(Number)
  const dueDay = Math.min(d, 28)
  const next = new Date(Date.UTC(y, m, dueDay)) // m (1-based) como índice 0-based = mês seguinte
  return next.toISOString().slice(0, 10)
}

/** Vencimento do 1º boleto: hoje + `boletoDueDays`. */
export function estimateBoletoDueDate(boletoDueDays: number, now: Date = new Date()): string {
  return addDaysISO(todaySP(now), boletoDueDays)
}

// ---------------------------------------------------------------------------
// Validação por passo (mesmos schemas da API)
// ---------------------------------------------------------------------------

type IssueLike = { path: ReadonlyArray<string | number>; message: string }

function issuesToErrors(issues: readonly IssueLike[], rename: Record<string, string> = {}): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of issues) {
    const raw = issue.path.join('.')
    const key = rename[raw] ?? raw
    if (key && !errors[key]) errors[key] = issue.message
  }
  return errors
}

function toHolderInput(holder: HolderForm) {
  return {
    name: holder.name,
    cpf: holder.cpf,
    email: holder.email,
    phone: holder.phone,
    birthDate: parseDateBR(holder.birthDate) ?? '',
  }
}

/**
 * Titular: schema do contrato e, com o plano, a idade mínima/máxima dele
 * (`checkHolderEligibility`) — nessa ordem, como a API.
 */
export function validateHolder(holder: HolderForm, plan?: ClubPlan | null): FieldErrors {
  const parsed = checkoutHolderInput.safeParse(toHolderInput(holder))
  const errors = parsed.success ? {} : issuesToErrors(parsed.error.issues)

  if (holder.birthDate.trim() && !parseDateBR(holder.birthDate)) {
    errors.birthDate = 'Data inválida. Use o formato DD/MM/AAAA'
  }
  const required: Array<[keyof HolderForm, string]> = [
    ['name', 'Informe seu nome completo'],
    ['cpf', 'Informe seu CPF'],
    ['email', 'Informe seu e-mail'],
    ['phone', 'Informe seu celular com DDD'],
    ['birthDate', 'Informe sua data de nascimento'],
  ]
  for (const [field, message] of required) {
    if (!holder[field].trim()) errors[field] = message
  }

  const birthDate = parseDateBR(holder.birthDate)
  if (plan && birthDate && !errors.birthDate) {
    const [issue] = checkHolderEligibility(plan, { birthDate })
    if (issue) errors.birthDate = issue.message
  }
  return errors
}

/** Dica do campo nascimento: "Titular de 18 a 70 anos" / "Titular a partir de 18 anos". */
export function holderAgeHint(plan: ClubPlan | null | undefined): string {
  const { min, max } = holderAgeRange(plan ?? {})
  return max === null ? `Titular a partir de ${min} anos` : `Titular de ${min} a ${max} anos`
}

/** O plano restringe a idade além da regra geral (18+)? */
export function hasHolderAgeRule(plan: ClubPlan): boolean {
  const { min, max } = holderAgeRange(plan)
  return max !== null || min > DEFAULT_HOLDER_MIN_AGE
}

function toDependentInput(dependent: DependentForm) {
  return {
    name: dependent.name,
    cpf: dependent.cpf,
    birthDate: parseDateBR(dependent.birthDate) ?? '',
    relationship: dependent.relationship || undefined,
  }
}

export function validateDependent(dependent: DependentForm): FieldErrors {
  const parsed = checkoutDependentInput.safeParse(toDependentInput(dependent))
  const errors = parsed.success ? {} : issuesToErrors(parsed.error.issues)

  if (dependent.birthDate.trim() && !parseDateBR(dependent.birthDate)) {
    errors.birthDate = 'Data inválida. Use o formato DD/MM/AAAA'
  }
  if (!dependent.name.trim()) errors.name = 'Informe o nome do dependente'
  if (!dependent.relationship) errors.relationship = 'Escolha o parentesco'
  if (!dependent.birthDate.trim()) errors.birthDate = 'Informe a data de nascimento'
  return errors
}

export interface DependentsValidation {
  /** Erros por dependente (mesma ordem da lista): schema, depois as regras do plano. */
  items: FieldErrors[]
  /** Erro da lista inteira (`path: 'dependents'` da API): plano individual ou acima do limite. */
  list: string | null
}

/** Só o limite do plano (`dependents_max` / `dependents_not_allowed`), para N dependentes. */
function dependentsCountIssue(plan: ClubPlan, count: number): string | null {
  // O parentesco não pesa nesta checagem; `outro` só preenche a forma exigida.
  const probe = Array.from({ length: count }, () => ({ relationship: 'outro' as const, birthDate: null }))
  return checkDependentsEligibility(plan, probe).find(issue => issue.path === 'dependents')?.message ?? null
}

/**
 * Dependentes: schema de cada um e, com o plano, parentescos aceitos, idade
 * máxima por parentesco e limite (`checkDependentsEligibility`) — a mesma
 * regra e a mesma mensagem da API.
 */
export function validateDependents(
  dependents: readonly DependentForm[],
  plan: ClubPlan | null | undefined,
): DependentsValidation {
  const items = dependents.map(validateDependent)
  if (!plan) return { items, list: null }

  dependents.forEach((dependent, index) => {
    if (!dependent.relationship) return
    const errors = items[index]!
    const issues = checkDependentEligibility(
      plan,
      { relationship: dependent.relationship, birthDate: parseDateBR(dependent.birthDate) },
      index,
    )
    for (const issue of issues) {
      const field = issue.path.split('.')[2]
      if (field && !errors[field]) errors[field] = issue.message
    }
  })
  return { items, list: dependentsCountIssue(plan, dependents.length) }
}

/**
 * Por que o pedido atual não cabe neste plano (1ª regra violada) — ignora o
 * que ainda não foi preenchido. Alimenta o aviso no card do passo Plano.
 */
export function planFitIssue(plan: ClubPlan, holder: HolderForm, dependents: readonly DependentForm[]): string | null {
  const birthDate = parseDateBR(holder.birthDate)
  if (birthDate) {
    const [issue] = checkHolderEligibility(plan, { birthDate })
    if (issue) return issue.message
  }
  const countIssue = dependentsCountIssue(plan, dependents.length)
  if (countIssue) {
    return `${countIssue} — você incluiu ${dependents.length} dependente${dependents.length === 1 ? '' : 's'}`
  }
  for (const [index, dependent] of dependents.entries()) {
    if (!dependent.relationship) continue
    const issue = checkDependentEligibility(
      plan,
      { relationship: dependent.relationship, birthDate: parseDateBR(dependent.birthDate) },
      index,
    ).find(item => item.code !== 'dependent_birth_date')
    if (issue) return issue.message
  }
  return null
}

function toCardInput(card: CardForm) {
  const expiry = onlyDigits(card.expiry)
  return {
    holderName: card.holderName,
    number: card.number,
    expiryMonth: expiry.slice(0, 2),
    expiryYear: expiry.slice(2, 4),
    ccv: onlyDigits(card.ccv),
    holderCpf: card.holderCpf,
    holderPostalCode: card.holderPostalCode,
    holderAddressNumber: card.holderAddressNumber,
  }
}

const CARD_RENAME = { expiryMonth: 'expiry', expiryYear: 'expiry' }

/**
 * `options.allowSandboxCard`: aceitar o cartão de aprovação da sandbox
 * (`4444…`) — `isDemoMode(context)`; a API confere a mesma regra.
 */
export function validateCard(card: CardForm, options: CardInputOptions, now: Date = new Date()): FieldErrors {
  const parsed = checkoutCardSchema(options).safeParse(toCardInput(card))
  const errors = parsed.success ? {} : issuesToErrors(parsed.error.issues, CARD_RENAME)

  const expiry = onlyDigits(card.expiry)
  if (expiry.length === 4) {
    const month = Number(expiry.slice(0, 2))
    const year = 2000 + Number(expiry.slice(2, 4))
    if (month < 1 || month > 12) errors.expiry = 'Mês inválido'
    else if (year * 12 + month < now.getFullYear() * 12 + now.getMonth() + 1) errors.expiry = 'Cartão vencido'
    else delete errors.expiry
  } else if (expiry.length > 0) {
    errors.expiry = 'Use o formato MM/AA'
  }

  const required: Array<[keyof CardForm, string]> = [
    ['number', 'Informe o número do cartão'],
    ['holderName', 'Informe o nome impresso no cartão'],
    ['expiry', 'Informe a validade'],
    ['ccv', 'Informe o código de segurança'],
    ['holderPostalCode', 'Informe o CEP'],
    ['holderAddressNumber', 'Informe o número'],
  ]
  for (const [field, message] of required) {
    if (!card[field].trim()) errors[field] = message
  }
  return errors
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0
}

/** `payment.method` fora das formas efetivas do plano → mensagem de `checkPaymentMethod`. */
export function validateMethod(
  plan: ClubPlan | null | undefined,
  method: ClubPaymentMethod,
  enabled: readonly ClubPaymentMethod[],
): string | null {
  if (!plan) return enabled.includes(method) ? null : 'Escolha uma forma de pagamento'
  return checkPaymentMethod(plan, method, enabled)[0]?.message ?? null
}

/**
 * Regras do plano sobre o pedido já validado pelo schema — a MESMA função
 * (`checkCheckoutEligibility`) que a API roda antes de gravar. Chaves no
 * formato da API: `holder.birthDate`, `dependents`, `dependents.1.birthDate`,
 * `payment.method`.
 */
export function checkDraftEligibility(
  plan: ClubPlan,
  data: CheckoutInput,
  enabledMethods: readonly ClubPaymentMethod[],
): FieldErrors {
  const issues = checkCheckoutEligibility(
    plan,
    { holder: data.holder, dependents: data.dependents, payment: { method: data.payment.method } },
    { enabledMethods },
  )
  const errors: FieldErrors = {}
  for (const issue of issues) {
    if (!errors[issue.path]) errors[issue.path] = issue.message
  }
  return errors
}

/** Pagamento validado no formato do contrato (nova tentativa e checkout). */
export function parsePayment(
  method: ClubPaymentMethod,
  card: CardForm,
  options: CardInputOptions,
): { ok: true; data: RetryPaymentInput } | { ok: false; errors: FieldErrors } {
  const parsed = checkoutPaymentSchema(options).safeParse({
    method,
    card: method === 'credit_card' ? toCardInput(card) : undefined,
  })
  if (parsed.success) return { ok: true, data: parsed.data }
  return { ok: false, errors: issuesToErrors(parsed.error.issues, { 'card.expiryMonth': 'card.expiry', 'card.expiryYear': 'card.expiry' }) }
}

export interface CheckoutDraft {
  planId: string
  holder: HolderForm
  dependents: DependentForm[]
  method: ClubPaymentMethod
  card: CardForm
  acceptTerms: boolean
}

/**
 * Estado da tela → `CheckoutInput` validado pelo schema do contrato. As
 * chaves de erro seguem o caminho da API (`holder.cpf`, `dependents.0.name`,
 * `payment.card.number`), o mesmo de `fieldErrors` das server actions.
 */
export function parseCheckout(
  draft: CheckoutDraft,
  options: CardInputOptions,
): { ok: true; data: CheckoutInput } | { ok: false; errors: FieldErrors } {
  const parsed = checkoutInputSchema(options).safeParse({
    planId: draft.planId,
    holder: toHolderInput(draft.holder),
    dependents: draft.dependents.map(toDependentInput),
    payment: {
      method: draft.method,
      card: draft.method === 'credit_card' ? toCardInput(draft.card) : undefined,
    },
    acceptTerms: draft.acceptTerms,
  })
  if (parsed.success) return { ok: true, data: parsed.data }
  return {
    ok: false,
    errors: issuesToErrors(parsed.error.issues, {
      'payment.card.expiryMonth': 'payment.card.expiry',
      'payment.card.expiryYear': 'payment.card.expiry',
    }),
  }
}

export interface RoutedFieldErrors {
  /** 1º passo (na ordem do wizard) com erro; `null` = nenhum caminho conhecido. */
  step: CheckoutStepId | null
  holder: FieldErrors
  dependents: Record<number, FieldErrors>
  /** `dependents` (sem índice): plano individual ou acima do limite. */
  dependentsList: string | null
  card: FieldErrors
  /** `payment.method` (forma fora do plano) ou `payment.card` sem campo. */
  payment: string | null
  /** Mensagem do 1º passo com erro — para o toast e o alerta do pagamento. */
  firstMessage: string | null
}

/**
 * Distribui erros no formato da API (`holder.birthDate`, `dependents`,
 * `dependents.1.relationship`, `payment.method`, `payment.card.number`) de
 * volta aos campos da tela e diz a qual passo ir.
 */
export function routeFieldErrors(fieldErrors: FieldErrors): RoutedFieldErrors {
  const holder: FieldErrors = {}
  const dependents: Record<number, FieldErrors> = {}
  const card: FieldErrors = {}
  let dependentsList: string | null = null
  let payment: string | null = null
  const messages = new Map<CheckoutStepId, string>()
  const mark = (step: CheckoutStepId, message: string) => {
    if (!messages.has(step)) messages.set(step, message)
  }

  for (const [path, message] of Object.entries(fieldErrors)) {
    const parts = path.split('.')
    if (parts[0] === 'planId') mark('plano', message)
    else if (parts[0] === 'holder') {
      if (parts[1]) holder[parts[1]] = message
      mark('titular', message)
    } else if (parts[0] === 'dependents') {
      const index = Number(parts[1])
      if (parts[1] !== undefined && Number.isInteger(index) && parts[2]) {
        dependents[index] = { ...dependents[index], [parts[2]]: message }
      } else {
        dependentsList ??= message
      }
      mark('titular', message)
    } else if (parts[0] === 'payment') {
      const field = parts[2] === 'expiryMonth' || parts[2] === 'expiryYear' ? 'expiry' : parts[2]
      if (parts[1] === 'card' && field) card[field] = message
      else payment ??= message
      mark('pagamento', message)
    } else if (parts[0] === 'acceptTerms') mark('pagamento', message)
  }

  const step = CHECKOUT_STEPS.find(s => messages.has(s.id))?.id ?? null
  return {
    step,
    holder,
    dependents,
    dependentsList,
    card,
    payment,
    firstMessage: step ? (messages.get(step) ?? null) : null,
  }
}

// ---------------------------------------------------------------------------
// Planos e preço
// ---------------------------------------------------------------------------

/**
 * Plano inicial: o do `?plano=` se existir e estiver ativo (e então o wizard
 * pula direto para "Seus dados"); senão o destaque; senão o primeiro.
 */
export function pickInitialPlan(
  plans: readonly ClubPlan[],
  planParam: string | null,
): { plan: ClubPlan | null; fromParam: boolean } {
  const active = plans.filter(plan => plan.status === 'active')
  const fromParam = planParam ? active.find(plan => plan.id === planParam) : undefined
  if (fromParam) return { plan: fromParam, fromParam: true }
  return { plan: active.find(plan => plan.highlight) ?? active[0] ?? null, fromParam: false }
}

/** Planos ativos na ordem de exibição — a mesma da vitrine (`sortClubPlansForDisplay`). */
export function checkoutPlans(plans: readonly ClubPlan[]): ClubPlan[] {
  return sortClubPlansForDisplay(plans.filter(plan => plan.status === 'active'))
}

/** Selo do card: `badge` do plano ou, no destaque sem selo, "Mais escolhido". */
export function planBadge(plan: Pick<ClubPlan, 'badge' | 'highlight'>): string | null {
  return plan.badge?.trim() || (plan.highlight ? 'Mais escolhido' : null)
}

/**
 * Preço com N dependentes — o plano INTEIRO vai para `quoteClubPlan` (inclusos,
 * adesão, isenção): é a mesma conta que a API faz ao gravar a 1ª cobrança.
 */
export function quoteFor(plan: ClubPlan | null | undefined, dependentsCount: number): ClubPlanQuote | null {
  if (!plan) return null
  return quoteClubPlan(plan, dependentsCount)
}

export interface DependentsPolicy {
  /** Mensalidade de cada dependente além dos inclusos (0 = todos inclusos). */
  unitPrice: number
  /** Dependentes cobertos pela mensalidade do titular. */
  included: number
  max: number | null
  individual: boolean
  /** Linha curta para card de plano e resumo (`describeDependentsPolicy`). */
  label: string
}

export function dependentsPolicy(plan: ClubPlan): DependentsPolicy {
  const max = plan.maxDependents ?? null
  return {
    unitPrice: Math.max(0, plan.priceDependentMonthly ?? 0),
    included: Math.max(0, Math.trunc(plan.includedDependents ?? 0)),
    max,
    individual: max === 0,
    label: describeDependentsPolicy(plan),
  }
}

/** O dependente na posição `index` (0-based) entra na mensalidade ou paga à parte? */
export function dependentCharge(quote: ClubPlanQuote, index: number): { included: boolean; price: number } {
  const included = quote.dependentUnitPrice === 0 || index < quote.includedDependents
  return { included, price: included ? 0 : quote.dependentUnitPrice }
}

function ordinal(n: number): string {
  return `${n}º`
}

/**
 * Quem é incluso e quem é cobrado, em uma linha:
 * "1 incluso no plano · 2º dependente +R$ 19,90", "3 dependentes inclusos no plano",
 * "2 dependentes × R$ 14,90". `null` sem dependentes.
 */
export function describeDependentsSplit(quote: ClubPlanQuote): string | null {
  const count = quote.dependentsCount
  if (count === 0) return null
  const unit = quote.dependentUnitPrice
  if (unit === 0) return count === 1 ? '1 dependente incluso no plano' : `${count} dependentes inclusos no plano`
  if (quote.includedDependents === 0) return `${count} dependente${count === 1 ? '' : 's'} × ${formatBRL(unit)}`

  const included = Math.min(count, quote.includedDependents)
  const parts = [`${included} incluso${included === 1 ? '' : 's'} no plano`]
  const charged = count - included
  const price = `+${formatBRL(unit)}`
  if (charged === 1) parts.push(`${ordinal(included + 1)} dependente ${price}`)
  else if (charged === 2) parts.push(`${ordinal(included + 1)} e ${ordinal(count)} dependentes ${price} cada`)
  else if (charged > 2) parts.push(`do ${ordinal(included + 1)} ao ${ordinal(count)} dependente ${price} cada`)
  return parts.join(' · ')
}

export type EnrollmentFeeView =
  | { kind: 'none' }
  | { kind: 'waived'; listPrice: number }
  | { kind: 'charged'; amount: number }

/** Adesão para exibir, lida do quote (a mesma conta da API). */
export function enrollmentFeeView(quote: ClubPlanQuote): EnrollmentFeeView {
  if (quote.enrollmentFeeListPrice <= 0) return { kind: 'none' }
  if (quote.enrollmentFeeWaived) return { kind: 'waived', listPrice: quote.enrollmentFeeListPrice }
  return { kind: 'charged', amount: quote.enrollmentFee }
}

/**
 * 1ª cobrança real da tela de resultado: a API grava `amount` (mensalidade)
 * na assinatura e `firstChargeTotal` (mensalidade + adesão) na 1ª cobrança;
 * a diferença é a adesão. Sem adesão (ou API antiga), as duas coincidem.
 */
export function firstChargeBreakdown(status: Pick<CheckoutStatus, 'amount' | 'charge'>): {
  total: number
  monthly: number
  enrollmentFee: number
} {
  const total = status.charge.amount
  const monthly = status.amount
  const fee = roundCents(total - monthly)
  return { total, monthly, enrollmentFee: fee > 0 ? fee : 0 }
}

/** Plano de uma assinatura do resultado (o status traz o nome; nome é único por clube). */
export function planByName(plans: readonly ClubPlan[] | null | undefined, name: string): ClubPlan | null {
  return plans?.find(plan => plan.name === name) ?? null
}

// ---------------------------------------------------------------------------
// Ambiente de testes (gateway simulado / Asaas sandbox)
// ---------------------------------------------------------------------------

/** Opções do schema do cartão para este checkout: `4444…` só em ambiente de testes. */
export function cardOptionsFor(context: Parameters<typeof isDemoMode>[0]): CardInputOptions {
  return { allowSandboxCard: isDemoMode(context) }
}

/**
 * Cartões de teste do gateway em uso — só em ambiente de testes
 * (`isDemoMode`); fora dele, `null` e a tela não mostra atalho nenhum.
 */
export function testCards(context: Pick<CheckoutContext, 'gateway' | 'sandbox' | 'canSimulatePayment' | 'simulation'>): {
  approved: string
  declined: string
  declinedHint: string
} | null {
  if (!isDemoMode(context)) return null
  if (context.gateway === 'simulated') {
    const suffix = context.simulation?.declinedCardSuffix ?? '0002'
    return {
      approved: SIMULATED_CARD_EXAMPLES.approved,
      declined: SIMULATED_CARD_EXAMPLES.declined,
      declinedHint: `final ${suffix} = recusado`,
    }
  }
  if (context.gateway === 'asaas' && (context.sandbox || context.canSimulatePayment)) {
    return {
      approved: ASAAS_SANDBOX_APPROVED_CARD,
      declined: ASAAS_SANDBOX_DECLINED_CARD,
      declinedHint: `${maskCardNumber(ASAAS_SANDBOX_DECLINED_CARD)} = recusado`,
    }
  }
  return null
}

/**
 * Atalho do ambiente de testes: devolve SÓ o número do cartão de teste
 * (mascarado). Nome, validade, CVV e endereço continuam com quem testa.
 */
export function sampleCard(number: string): string {
  return maskCardNumber(number)
}

/** Recusa do cartão (real ou de teste) — sem citar números de teste. */
export const CARD_DECLINED_MESSAGE = 'Cartão recusado pela operadora. Verifique os dados ou use outro cartão.'

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

/**
 * O que a server action devolve ao browser: o `CheckoutResult` SEM o token de
 * sessão (fica no cookie httpOnly) e com `signedIn` dizendo se a sessão do
 * novo associado foi aberta neste navegador.
 */
export type CheckoutSubmitResult = Omit<CheckoutResult, 'session'> & { session: null; signedIn: boolean }

export type CheckoutPhase =
  | 'awaiting_pix'
  | 'awaiting_boleto'
  | 'awaiting_card'
  | 'confirming'
  | 'declined'
  | 'active'
  | 'canceled'
  | 'other'

export function phaseOf(status: CheckoutStatus): CheckoutPhase {
  if (status.status === 'active') return 'active'
  if (status.status === 'canceled') return 'canceled'
  if (status.status !== 'pending_payment') return 'other'
  const charge = status.charge
  if (charge.status === 'failed') return 'declined'
  if (charge.status === 'paid') return 'confirming'
  if (charge.status === 'canceled' || charge.status === 'refunded') return 'other'
  if (charge.method === 'pix') return 'awaiting_pix'
  if (charge.method === 'boleto') return 'awaiting_boleto'
  return 'awaiting_card'
}

/** Fases em que a tela consulta o status sozinha (polling de 3 s). */
export function shouldPoll(phase: CheckoutPhase): boolean {
  return phase === 'awaiting_pix' || phase === 'awaiting_boleto' || phase === 'awaiting_card' || phase === 'confirming'
}

/** Caminho local do boleto imprimível (mesma origem da tela, sem depender de `WEB_BASE_URL`). */
export function boletoPagePath(slug: string, subscriptionId: string, chargeId: string, chave: string): string {
  const query = new URLSearchParams({ assinatura: subscriptionId, cobranca: chargeId, chave })
  return `/${slug}/assinar/boleto?${query.toString()}`
}

export function statusPagePath(slug: string, subscriptionId: string, chave: string): string {
  const query = new URLSearchParams({ assinatura: subscriptionId, chave })
  return `/${slug}/assinar?${query.toString()}`
}
