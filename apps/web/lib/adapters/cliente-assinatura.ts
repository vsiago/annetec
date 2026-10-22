import {
  CARD_BRAND_LABELS,
  CLUB_CHARGE_STATUS_LABELS,
  CLUB_PAYMENT_METHOD_LABELS,
  CLUB_SUBSCRIPTION_STATUS_LABELS,
  DEPENDENT_RELATIONSHIP_LABELS,
  coverageAvailableOn,
  describeDependentsPolicy,
  formatBRL,
  formatDateBR,
  isCoverageAvailable,
  quoteClubPlan,
  roundCents,
  type ClubCardInfo,
  type ClubCardStatus,
  type ClubCharge,
  type ClubChargeStatus,
  type ClubMembershipCard,
  type ClubPaymentMethod,
  type ClubPlan,
  type ClubPlanCoverage,
  type ClubSubscription,
  type ClubSubscriptionStatus,
  type DependentRelationship,
  type MyClubMembership,
} from '@annetec/contracts'

/**
 * Portal do associado — tradução da assinatura do Clube para a tela: tom e
 * texto de cada status (assinatura, carteirinha, cobrança), competência,
 * prazos e ordenação das faturas.
 *
 * Tudo puro (sem React, sem I/O). Datas-só (`yyyy-MM-dd`) são tratadas como
 * TEXTO no fuso de São Paulo — `new Date('2026-09-27')` em UTC-3 é o dia 26.
 */

// ---------------------------------------------------------------------------
// Tons
// ---------------------------------------------------------------------------

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral'

/** Selo pequeno (Badge). */
export const TONE_BADGE_CLASS: Record<StatusTone, string> = {
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
  warning:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
  danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300',
  neutral: 'border-border bg-muted text-muted-foreground',
}

/** Painel de aviso (fundo suave + borda). */
export const TONE_PANEL_CLASS: Record<StatusTone, string> = {
  success:
    'border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
  warning:
    'border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
  danger: 'border-red-200 bg-red-50/80 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100',
  neutral: 'border-border bg-muted/60 text-foreground',
}

/** Ícone dentro do painel. */
export const TONE_ICON_CLASS: Record<StatusTone, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300',
  neutral: 'bg-background text-muted-foreground',
}

/** Bolinha de status sobre fundo escuro/colorido (card do painel). */
export const TONE_DOT_CLASS: Record<StatusTone, string> = {
  success: 'bg-emerald-400',
  warning: 'bg-amber-300',
  danger: 'bg-red-400',
  neutral: 'bg-white/60',
}

// ---------------------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------------------

export interface SubscriptionStatusView {
  label: string
  tone: StatusTone
  title: string
  description: string
  /** Para onde o botão principal do aviso leva. */
  cta: 'faturas' | 'planos' | null
  ctaLabel: string | null
}

const SUBSCRIPTION_TONE: Record<ClubSubscriptionStatus, StatusTone> = {
  active: 'success',
  pending_payment: 'warning',
  past_due: 'danger',
  suspended: 'danger',
  canceled: 'neutral',
}

/** Motivos gravados pelo motor de cobrança (§0.5); texto livre do painel NÃO é exibido ao associado. */
const CANCEL_REASON_TEXT: Record<string, string> = {
  checkout_nao_pago: 'o pagamento da adesão não foi concluído',
  inadimplencia: 'mensalidades em aberto por muito tempo',
  substituida_por_novo_checkout: 'ela foi substituída por uma nova contratação',
}

export function cancelReasonText(reason: string | null | undefined): string | null {
  if (!reason) return null
  return CANCEL_REASON_TEXT[reason] ?? null
}

export function subscriptionStatusView(subscription: ClubSubscription): SubscriptionStatusView {
  const label = CLUB_SUBSCRIPTION_STATUS_LABELS[subscription.status]
  const tone = SUBSCRIPTION_TONE[subscription.status]
  const hasDependents = subscription.dependents.length > 0

  switch (subscription.status) {
    case 'active':
      return {
        label,
        tone,
        title: 'Tudo certo com a sua assinatura',
        description: hasDependents
          ? 'Sua assinatura está em dia e as carteirinhas da família estão liberadas.'
          : 'Sua assinatura está em dia e a sua carteirinha está liberada.',
        cta: null,
        ctaLabel: null,
      }
    case 'pending_payment':
      return {
        label,
        tone,
        title: 'Aguardando a confirmação do pagamento',
        description:
          'Assim que o pagamento da adesão for confirmado, as carteirinhas são liberadas automaticamente. No Pix, isso costuma levar só alguns instantes.',
        cta: 'faturas',
        ctaLabel: 'Ver minha fatura',
      }
    case 'past_due': {
      const count = Math.max(subscription.overdueCount, 1)
      const total = subscription.openAmount > 0 ? ` (${formatBRL(subscription.openAmount)})` : ''
      return {
        label,
        tone,
        title: 'Pagamento em atraso',
        description: `Você tem ${pluralize(count, 'fatura vencida', 'faturas vencidas')}${total}. A carteirinha continua valendo por enquanto — regularize para ela não ser suspensa.`,
        cta: 'faturas',
        ctaLabel: 'Regularizar agora',
      }
    }
    case 'suspended':
      return {
        label,
        tone,
        title: 'Carteirinha bloqueada',
        description:
          'Sua assinatura foi suspensa por falta de pagamento e as carteirinhas estão bloqueadas. Assim que o pagamento for confirmado, tudo volta a funcionar.',
        cta: 'faturas',
        ctaLabel: 'Regularizar agora',
      }
    case 'canceled': {
      const when = subscription.canceledAt ? ` em ${formatDateBR(subscription.canceledAt)}` : ''
      const reason = cancelReasonText(subscription.cancelReason)
      return {
        label,
        tone,
        title: 'Assinatura cancelada',
        description: `Sua assinatura foi encerrada${when}${reason ? ` porque ${reason}` : ''}. Para voltar a aproveitar os benefícios, é só contratar um plano.`,
        cta: 'planos',
        ctaLabel: 'Conhecer os planos',
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Carteirinha
// ---------------------------------------------------------------------------

const CARD_STATUS_VIEW: Record<ClubCardStatus, { label: string; tone: StatusTone }> = {
  active: { label: 'Ativa', tone: 'success' },
  pending: { label: 'Aguardando pagamento', tone: 'warning' },
  blocked: { label: 'Bloqueada', tone: 'danger' },
  canceled: { label: 'Cancelada', tone: 'neutral' },
}

export function cardStatusView(status: ClubCardStatus) {
  return CARD_STATUS_VIEW[status]
}

/** Número exibido enquanto a carteirinha não foi emitida (assinatura aguardando pagamento). */
export const CARD_NUMBER_PLACEHOLDER = 'Em emissão'

export function relationshipLabel(relationship: DependentRelationship | null | undefined): string {
  return relationship ? DEPENDENT_RELATIONSHIP_LABELS[relationship] : 'Dependente'
}

/** Chave estável de cada carteirinha no seletor (`titular` ou id do dependente). */
export function membershipCardKey(card: { dependentId: string | null }): string {
  return card.dependentId ?? 'titular'
}

/** Mesma regra do contrato (`clubCardStatus`): `past_due` ainda vale (carência), `suspended` bloqueia. */
export function cardStatusFromSubscription(status: ClubSubscriptionStatus): ClubCardStatus {
  switch (status) {
    case 'active':
    case 'past_due':
      return 'active'
    case 'pending_payment':
      return 'pending'
    case 'suspended':
      return 'blocked'
    case 'canceled':
      return 'canceled'
  }
}

/**
 * Carteirinhas da assinatura (titular primeiro). A API já manda `cards`
 * prontos; se um dia vier vazio, o titular é montado da própria assinatura
 * para a tela nunca cair no cartão de demonstração de quem assina o clube.
 */
export function membershipCards(membership: MyClubMembership): ClubMembershipCard[] {
  if (membership.cards.length > 0) return membership.cards
  const { subscription } = membership
  return [
    {
      kind: 'titular',
      dependentId: null,
      name: subscription.holder.name,
      cpf: subscription.holder.cpf,
      birthDate: subscription.holder.birthDate,
      relationship: null,
      cardNumber: subscription.cardNumber,
      planName: subscription.planName,
      status: cardStatusFromSubscription(subscription.status),
      validSince: subscription.startedAt,
    },
  ]
}

// ---------------------------------------------------------------------------
// Cobranças
// ---------------------------------------------------------------------------

const CHARGE_TONE: Record<ClubChargeStatus, StatusTone> = {
  pending: 'warning',
  paid: 'success',
  overdue: 'danger',
  failed: 'danger',
  canceled: 'neutral',
  refunded: 'neutral',
}

export function chargeStatusView(status: ClubChargeStatus) {
  return { label: CLUB_CHARGE_STATUS_LABELS[status], tone: CHARGE_TONE[status] }
}

export function paymentMethodLabel(method: ClubPaymentMethod): string {
  return CLUB_PAYMENT_METHOD_LABELS[method]
}

export const OPEN_CHARGE_STATUSES: readonly ClubChargeStatus[] = ['pending', 'overdue', 'failed']

/** "Cobrança aberta" do motor (§0.5): `pending|overdue|failed`. */
export function isChargeOpen(charge: Pick<ClubCharge, 'status'>): boolean {
  return OPEN_CHARGE_STATUSES.includes(charge.status)
}

export function isChargeLate(charge: Pick<ClubCharge, 'status'>): boolean {
  return charge.status === 'overdue' || charge.status === 'failed'
}

export function openChargesTotal(charges: ClubCharge[]): number {
  return roundCents(charges.filter(isChargeOpen).reduce((sum, charge) => sum + charge.amount, 0))
}

/**
 * Em aberto primeiro (vencimento mais antigo no topo — é o que pesa na
 * carteirinha), depois o histórico do mais recente para o mais antigo.
 */
export function splitCharges(charges: ClubCharge[]): { open: ClubCharge[]; history: ClubCharge[] } {
  const open = charges.filter(isChargeOpen).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const history = charges
    .filter(charge => !isChargeOpen(charge))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || b.createdAt.localeCompare(a.createdAt))
  return { open, history }
}

/** Competência `mm/aaaa`, pelo início do período coberto. */
export function competencia(charge: Pick<ClubCharge, 'periodStart'>): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(charge.periodStart)
  return match ? `${match[2]}/${match[1]}` : formatDateBR(charge.periodStart)
}

/** "Mensalidade 10/2026" ou, na cobrança avulsa, a descrição dela. */
export function chargeTitle(charge: Pick<ClubCharge, 'periodStart'> & Partial<Pick<ClubCharge, 'kind' | 'description'>>): string {
  return charge.kind === 'one_off' ? charge.description || 'Cobrança avulsa' : `Mensalidade ${competencia(charge)}`
}

/** `"27/09 a 27/10/2026"`. */
export function formatPeriod(charge: Pick<ClubCharge, 'periodStart' | 'periodEnd'>): string {
  const start = formatDateBR(charge.periodStart)
  const end = formatDateBR(charge.periodEnd)
  if (!start || !end) return start || end
  return start.slice(6) === end.slice(6) ? `${start.slice(0, 5)} a ${end}` : `${start} a ${end}`
}

/** "Hoje" em São Paulo, `yyyy-MM-dd`. */
export function todaySP(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Dias de `from` até `to` (datas-só); negativo quando `to` é anterior. */
export function daysBetween(from: string, to: string): number {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN
  }
  const diff = (parse(to) - parse(from)) / 86_400_000
  return Number.isFinite(diff) ? Math.round(diff) : 0
}

/** Frase curta de prazo: "Vence hoje", "Vence em 3 dias", "Venceu há 12 dias", "Paga em 27/09/2026". */
export function chargeDueText(charge: ClubCharge, today: string = todaySP()): string {
  if (charge.status === 'paid') {
    return charge.paidAt ? `Paga em ${formatDateBR(charge.paidAt)}` : 'Paga'
  }
  if (charge.status === 'canceled') return 'Cancelada'
  if (charge.status === 'refunded') return 'Estornada'

  const days = daysBetween(today, charge.dueDate)
  if (days === 0) return 'Vence hoje'
  if (days === 1) return 'Vence amanhã'
  if (days > 1) return `Vence em ${days} dias`
  if (days === -1) return 'Venceu ontem'
  return `Venceu há ${-days} dias`
}

/** `"27/09/2026 às 14:30"` (fuso de São Paulo). */
export function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const time = date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  return `${day} às ${time}`
}

export function isPixExpired(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!expiresAt) return false
  const time = new Date(expiresAt).getTime()
  return Number.isFinite(time) && time <= now
}

/** `"Visa final 1111"`. */
export function cardInfoLabel(card: ClubCardInfo | null | undefined): string {
  if (!card) return 'Cartão de crédito'
  return `${CARD_BRAND_LABELS[card.brand] ?? 'Cartão'} final ${card.last4}`
}

/** `src` do QR do Pix: a API manda PNG base64 sem o prefixo `data:`. */
export function pixQrSrc(qrCodeBase64: string | null | undefined): string | null {
  if (!qrCodeBase64) return null
  return qrCodeBase64.startsWith('data:') ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`
}

/**
 * O que a tela de pagamento mostra para a forma escolhida:
 *  - `pix-ready`/`boleto-ready`: já há QR/linha digitável válidos nesta cobrança;
 *  - `generate`: é preciso gerar — `pay` (troca de método / nova tentativa) ou
 *    `reissue` (segunda via, com vencimento novo).
 */
export type PaymentPanel =
  | { kind: 'pix-ready' }
  | { kind: 'boleto-ready' }
  | { kind: 'generate'; action: 'pay' | 'reissue'; label: string; hint: string }

export function paymentPanelFor(
  charge: ClubCharge,
  method: 'pix' | 'boleto',
  now: number = Date.now(),
): PaymentPanel {
  const sameMethod = charge.method === method
  const methodName = method === 'pix' ? 'Pix' : 'boleto'

  if (charge.status === 'pending' && sameMethod) {
    if (method === 'pix' && charge.pix?.payload && !isPixExpired(charge.pix.expiresAt, now)) return { kind: 'pix-ready' }
    if (method === 'boleto' && charge.boleto?.identificationField) return { kind: 'boleto-ready' }
    if (method === 'pix' && charge.pix?.payload) {
      return {
        kind: 'generate',
        action: 'reissue',
        label: 'Gerar novo Pix',
        hint: 'O código Pix desta fatura expirou. Gere um novo para pagar agora.',
      }
    }
    return {
      kind: 'generate',
      action: 'pay',
      label: method === 'pix' ? 'Gerar Pix' : 'Gerar boleto',
      hint: `Gere o ${methodName} desta fatura para pagar.`,
    }
  }

  if (charge.status === 'overdue' && charge.method !== 'credit_card') {
    return {
      kind: 'generate',
      action: 'reissue',
      label: method === 'pix' ? 'Gerar segunda via por Pix' : 'Gerar segunda via do boleto',
      hint: 'Esta fatura venceu. A segunda via sai com um vencimento novo e já pode ser paga.',
    }
  }

  return {
    kind: 'generate',
    action: 'pay',
    label: method === 'pix' ? 'Pagar com Pix' : 'Pagar com boleto',
    hint:
      method === 'pix'
        ? 'Geramos um QR Code Pix para esta fatura. A confirmação costuma sair em instantes.'
        : 'Geramos um boleto para esta fatura. A compensação leva até 3 dias úteis.',
  }
}

/** Segunda via só existe para Pix/boleto em aberto ou vencido (§E). */
export function canReissue(charge: ClubCharge): boolean {
  return (charge.method === 'pix' || charge.method === 'boleto') && (charge.status === 'pending' || charge.status === 'overdue')
}

/** Cobrança vencida mais antiga (a que decide suspensão), senão a próxima em aberto. */
export function chargeToRegularize(membership: MyClubMembership | null): ClubCharge | null {
  if (!membership) return null
  const open = [...membership.openCharges].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  return open.find(isChargeLate) ?? open[0] ?? membership.nextCharge ?? null
}

// ---------------------------------------------------------------------------
// Dependentes
// ---------------------------------------------------------------------------

/**
 * Mensalidade atual e com mais um dependente, pela função oficial de preço
 * (`quoteClubPlan`) sobre o retrato do plano gravado na assinatura — inclusive
 * os dependentes inclusos na mensalidade (`includedDependents`, ausente = 0).
 */
export function extraDependentQuote(subscription: ClubSubscription) {
  const includedDependents = Math.max(0, subscription.includedDependents ?? 0)
  const snapshot = {
    priceMonthly: subscription.planPriceMonthly,
    priceDependentMonthly: subscription.dependentPriceMonthly,
    includedDependents,
    maxDependents: null,
  }
  const count = subscription.dependents.length
  const unitPrice = roundCents(subscription.dependentPriceMonthly)
  const allIncluded = unitPrice <= 0
  return {
    unitPrice,
    current: subscription.amount,
    next: quoteClubPlan(snapshot, count + 1).total,
    /** Dependentes que a mensalidade do titular já cobre (retrato da contratação). */
    includedDependents,
    /** Todo dependente entra sem custo (o plano não cobra por dependente). */
    allIncluded,
    /** O PRÓXIMO dependente entra sem custo: plano sem preço por dependente ou ainda há vaga inclusa. */
    included: allIncluded || count < includedDependents,
    /** Regra de preço por dependente em uma linha ("Incluso no plano", "1 incluso · extra R$ 19,90/mês"). */
    policy: allIncluded
      ? 'Incluso no plano'
      : includedDependents > 0
        ? `${pluralize(includedDependents, 'incluso', 'inclusos')} · extra ${formatBRL(unitPrice)}/mês`
        : `${formatBRL(unitPrice)}/mês`,
  }
}

// ---------------------------------------------------------------------------
// Coberturas do plano e carência
// ---------------------------------------------------------------------------

export type CoverageAccessState = 'available' | 'waiting' | 'awaiting_payment' | 'blocked' | 'ended'

export interface CoverageAccess {
  state: CoverageAccessState
  label: string
  tone: StatusTone
  /** Dia (`yyyy-MM-dd`) em que a cobertura libera ou liberou; `null` antes da ativação. */
  availableOn: string | null
}

/**
 * Situação de UMA cobertura para o associado. A carência conta da ativação
 * (`subscription.startedAt`) pela regra oficial (`coverageAvailableOn`) e o
 * status da assinatura vem por cima: sem o 1º pagamento nada libera; suspensa
 * bloqueia; cancelada encerra. `past_due` ainda vale (carência de atraso).
 */
export function coverageAccess(
  subscription: Pick<ClubSubscription, 'status' | 'startedAt'>,
  waitingDays: number,
  today: Date = new Date(),
): CoverageAccess {
  if (subscription.status === 'pending_payment' || !subscription.startedAt) {
    return { state: 'awaiting_payment', label: 'Aguardando 1º pagamento', tone: 'neutral', availableOn: null }
  }
  const availableOn = coverageAvailableOn(subscription.startedAt, waitingDays)
  if (subscription.status === 'canceled') {
    return { state: 'ended', label: 'Assinatura cancelada', tone: 'neutral', availableOn }
  }
  if (subscription.status === 'suspended') {
    return { state: 'blocked', label: 'Bloqueado até regularizar', tone: 'danger', availableOn }
  }
  if (isCoverageAvailable(subscription.startedAt, waitingDays, today)) {
    return { state: 'available', label: 'Liberado', tone: 'success', availableOn }
  }
  return { state: 'waiting', label: `Libera em ${formatDateBR(availableOn)}`, tone: 'warning', availableOn }
}

export interface CoverageAccessSummary {
  total: number
  available: number
  waiting: number
  /** Próxima cobertura a sair da carência (a de data mais próxima). */
  next: { coverage: ClubPlanCoverage; availableOn: string } | null
}

export function coverageAccessSummary(
  subscription: Pick<ClubSubscription, 'status' | 'startedAt'>,
  coverages: readonly ClubPlanCoverage[],
  today: Date = new Date(),
): CoverageAccessSummary {
  let available = 0
  let waiting = 0
  let next: CoverageAccessSummary['next'] = null
  for (const coverage of coverages) {
    const access = coverageAccess(subscription, coverage.waitingDays, today)
    if (access.state === 'available') available += 1
    if (access.state === 'waiting' && access.availableOn) {
      waiting += 1
      if (!next || access.availableOn < next.availableOn) next = { coverage, availableOn: access.availableOn }
    }
  }
  return { total: coverages.length, available, waiting, next }
}

/**
 * Regra de dependentes que vale para ESTA assinatura: preço e inclusos são o
 * retrato da contratação; o teto de dependentes é o do plano atual.
 */
export function subscriptionDependentsPolicy(
  subscription: Pick<ClubSubscription, 'dependentPriceMonthly' | 'includedDependents'>,
  plan: Pick<ClubPlan, 'maxDependents'>,
): string {
  return describeDependentsPolicy({
    maxDependents: plan.maxDependents ?? null,
    includedDependents: subscription.includedDependents ?? 0,
    priceDependentMonthly: subscription.dependentPriceMonthly,
  })
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}
