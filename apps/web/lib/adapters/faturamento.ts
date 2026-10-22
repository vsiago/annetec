import {
  CLUB_CHARGE_STATUS_LABELS,
  CLUB_PAYMENT_METHOD_LABELS,
  CLUB_SUBSCRIPTION_STATUS_LABELS,
  DEPENDENT_RELATIONSHIP_LABELS,
  PAYMENT_EVENT_LABELS,
  formatBRL,
  formatBoletoLine,
  formatCpf,
  formatDateBR,
  type BillingSummary,
  type ClubCharge,
  type ClubChargeStatus,
  type ClubPaymentMethod,
  type ClubSubscription,
  type ClubSubscriptionStatus,
  type DependentRelationship,
  type PageMeta,
  type PaymentEventSource,
  type PaymentEventType,
  type PaymentGatewayProvider,
} from '@annetec/contracts'
import { isDemoMode } from '@/lib/demo-mode'

/**
 * Faturamento e Cadastros do Clube de Benefícios — tudo o que a tela precisa
 * para EXIBIR os DTOs de `club-billing.ts`: rótulos, cores de status,
 * formatação e dados de gráfico. Sem I/O: roda no browser e no servidor.
 *
 * Os rótulos são os do contracts (a mesma frase que o portal e o checkout
 * mostram); aqui só se acrescenta a cor, para o mesmo status nunca aparecer
 * com dois tons diferentes entre Faturamento, Cadastros e Início.
 */

export { formatBRL, formatBoletoLine, formatCpf, formatDateBR }

export interface StatusMeta {
  label: string
  /** Classes do `StatusPill`. */
  className: string
}

const TONE = {
  success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  orange: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  info: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300',
} as const

export type Tone = keyof typeof TONE

export function toneClass(tone: Tone): string {
  return TONE[tone]
}

const SUBSCRIPTION_TONE: Record<ClubSubscriptionStatus, Tone> = {
  pending_payment: 'warning',
  active: 'success',
  past_due: 'orange',
  suspended: 'danger',
  canceled: 'neutral',
}

const CHARGE_TONE: Record<ClubChargeStatus, Tone> = {
  pending: 'info',
  paid: 'success',
  overdue: 'danger',
  failed: 'orange',
  canceled: 'neutral',
  refunded: 'violet',
}

export function subscriptionStatusMeta(status: ClubSubscriptionStatus): StatusMeta {
  return {
    label: CLUB_SUBSCRIPTION_STATUS_LABELS[status] ?? status,
    className: TONE[SUBSCRIPTION_TONE[status] ?? 'neutral'],
  }
}

export function chargeStatusMeta(status: ClubChargeStatus): StatusMeta {
  return {
    label: CLUB_CHARGE_STATUS_LABELS[status] ?? status,
    className: TONE[CHARGE_TONE[status] ?? 'neutral'],
  }
}

export const SUBSCRIPTION_STATUS_OPTIONS = (
  Object.keys(CLUB_SUBSCRIPTION_STATUS_LABELS) as ClubSubscriptionStatus[]
).map(value => ({ value, label: CLUB_SUBSCRIPTION_STATUS_LABELS[value] }))

export const CHARGE_STATUS_OPTIONS = (Object.keys(CLUB_CHARGE_STATUS_LABELS) as ClubChargeStatus[]).map(
  value => ({ value, label: CLUB_CHARGE_STATUS_LABELS[value] }),
)

export const PAYMENT_METHOD_OPTIONS = (Object.keys(CLUB_PAYMENT_METHOD_LABELS) as ClubPaymentMethod[]).map(
  value => ({ value, label: CLUB_PAYMENT_METHOD_LABELS[value] }),
)

export function paymentMethodLabel(method: ClubPaymentMethod): string {
  return CLUB_PAYMENT_METHOD_LABELS[method] ?? method
}

export function relationshipLabel(relationship: DependentRelationship | null | undefined): string {
  if (!relationship) return '—'
  return DEPENDENT_RELATIONSHIP_LABELS[relationship] ?? relationship
}

/** "Cobrança aberta" do motor: ainda pode ser paga, cancelada ou reemitida. */
export function isChargeOpen(status: ClubChargeStatus): boolean {
  return status === 'pending' || status === 'overdue' || status === 'failed'
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export function gatewayLabel(provider: PaymentGatewayProvider, sandbox = false): string {
  if (provider === 'simulated') return 'Simulado'
  return sandbox ? 'Asaas · sandbox' : 'Asaas'
}

/**
 * Simulado sempre; Asaas só em sandbox (regra de `canSimulatePayment`).
 * Delega para `isDemoMode` — a regra única de "modo demonstração" da web.
 */
export function canSimulatePayments(provider: PaymentGatewayProvider | undefined, sandbox = false): boolean {
  if (!provider) return false
  return isDemoMode({ gateway: provider, sandbox })
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

export const PAYMENT_EVENT_SOURCE_LABELS: Record<PaymentEventSource, string> = {
  webhook: 'Webhook do gateway',
  automation: 'Automação',
  checkout: 'Checkout',
  manual: 'Manual',
  simulation: 'Simulação',
}

const SOURCE_TONE: Record<PaymentEventSource, Tone> = {
  webhook: 'violet',
  automation: 'info',
  checkout: 'success',
  manual: 'warning',
  simulation: 'neutral',
}

export function eventSourceMeta(source: PaymentEventSource): StatusMeta {
  return {
    label: PAYMENT_EVENT_SOURCE_LABELS[source] ?? source,
    className: TONE[SOURCE_TONE[source] ?? 'neutral'],
  }
}

export function eventLabel(type: string): string {
  return PAYMENT_EVENT_LABELS[type as PaymentEventType] ?? type
}

/** Cor do marcador da timeline: verde entrou dinheiro, vermelho perdeu, etc. */
export function eventTone(type: string): Tone {
  switch (type) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
    case 'CHARGE_MANUAL_PAYMENT':
    case 'SUBSCRIPTION_ACTIVATED':
    case 'SUBSCRIPTION_REACTIVATED':
      return 'success'
    case 'PAYMENT_OVERDUE':
    case 'SUBSCRIPTION_SUSPENDED':
    case 'SUBSCRIPTION_CANCELED':
      return 'danger'
    case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
    case 'SUBSCRIPTION_PAST_DUE':
      return 'orange'
    case 'REMINDER_SENT':
      return 'warning'
    case 'PAYMENT_REFUNDED':
      return 'violet'
    case 'PAYMENT_DELETED':
    case 'CHARGE_CANCELED':
      return 'neutral'
    default:
      return 'info'
  }
}

// ---------------------------------------------------------------------------
// Datas (fuso America/Sao_Paulo)
// ---------------------------------------------------------------------------

const TZ = 'America/Sao_Paulo'

/** Instante ISO → "27/09/2026 14:32" no horário de Brasília. */
export function formatDateTimeBR(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

/** "há 3 minutos", "ontem" — para a timeline e a última execução da automação. */
export function formatRelative(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'agora há pouco'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86_400 * 30) return relative.format(Math.round(seconds / 86_400), 'day')
  return formatDateBR(value)
}

/** Hoje em São Paulo, `yyyy-MM-dd`. */
export function todaySP(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Soma dias a uma data-só sem passar por fuso (aritmética em UTC). */
export function addDays(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number)
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** `2026-09` ou `2026-09-01` → "set/26". */
export function formatMonthShort(value: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(value)
  if (!match) return value
  return `${MONTHS_SHORT[Number(match[2]) - 1] ?? match[2]}/${match[1]!.slice(2)}`
}

type ChargeLabelSource = Pick<ClubCharge, 'periodStart'> & Partial<Pick<ClubCharge, 'kind' | 'description'>>

/** Cobrança avulsa (gerada pelo admin, fora do ciclo). */
export function isOneOffCharge(charge: Partial<Pick<ClubCharge, 'kind'>>): boolean {
  return charge.kind === 'one_off'
}

/** Competência da cobrança: o mês em que o período começa ("set/26"); avulsa = "Avulsa". */
export function chargeCompetence(charge: ChargeLabelSource): string {
  return isOneOffCharge(charge) ? 'Avulsa' : formatMonthShort(charge.periodStart)
}

/** Para frases: "competência set/26" ou, na avulsa, "avulsa “Taxa de 2ª via”". */
export function chargeReference(charge: ChargeLabelSource): string {
  return isOneOffCharge(charge)
    ? `avulsa “${charge.description ?? ''}”`
    : `competência ${formatMonthShort(charge.periodStart)}`
}

/** Título da cobrança: "Competência set/26" ou a descrição da avulsa. */
export function chargeTitle(charge: ChargeLabelSource): string {
  return isOneOffCharge(charge) ? charge.description || 'Cobrança avulsa' : `Competência ${formatMonthShort(charge.periodStart)}`
}

export type PeriodPreset = 'all' | 'this_month' | 'next_30' | 'last_30' | 'last_90'

export const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'this_month', label: 'Vencimento neste mês' },
  { value: 'next_30', label: 'Próximos 30 dias' },
  { value: 'last_30', label: 'Últimos 30 dias' },
  { value: 'last_90', label: 'Últimos 90 dias' },
]

/** Intervalo de vencimento (`from`/`to`, inclusive) de cada atalho de período. */
export function periodRange(preset: PeriodPreset, now: Date = new Date()): { from?: string; to?: string } {
  const today = todaySP(now)
  switch (preset) {
    case 'this_month': {
      const first = `${today.slice(0, 8)}01`
      const last = addDays(`${addDays(first, 32).slice(0, 8)}01`, -1)
      return { from: first, to: last }
    }
    case 'next_30':
      return { from: today, to: addDays(today, 30) }
    case 'last_30':
      return { from: addDays(today, -30), to: today }
    case 'last_90':
      return { from: addDays(today, -90), to: today }
    default:
      return {}
  }
}

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------

/**
 * `delinquencyRate` em pontos percentuais. O contrato não fixa a escala; a
 * API (`summary.service.ts`) devolve `round(vencido ÷ faturado90 × 100, 2)`,
 * ou seja, 4.83 = 4,83%. Não dá para "adivinhar" fração pelo tamanho: 0,5%
 * chegaria como 0.5 e viraria 50%.
 */
export function delinquencyPercent(rate: number | null | undefined): number {
  const value = Number(rate)
  return Number.isFinite(value) && value > 0 ? value : 0
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`
}

export function formatCount(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString('pt-BR')
}

/** Número que pode chegar como texto (`numeric` do Postgres) → number. */
function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  return num(value)
}

/**
 * Seguro contra `numeric` que escapa como string da API: `formatBRL("79.70")`
 * mostraria R$ 0,00 sem erro nenhum. Aplicado na borda (server action).
 */
export function normalizeCharge<T extends ClubCharge>(charge: T): T {
  return {
    ...charge,
    amount: num(charge.amount),
    paidAmount: numOrNull(charge.paidAmount),
    attempts: num(charge.attempts),
  }
}

export function normalizeSubscription<T extends ClubSubscription>(subscription: T): T {
  return {
    ...subscription,
    planPriceMonthly: num(subscription.planPriceMonthly),
    dependentPriceMonthly: num(subscription.dependentPriceMonthly),
    amount: num(subscription.amount),
    openAmount: num(subscription.openAmount),
    overdueCount: num(subscription.overdueCount),
    dependents: subscription.dependents ?? [],
  }
}

export function normalizeSummary(summary: BillingSummary): BillingSummary {
  return {
    ...summary,
    mrr: num(summary.mrr),
    overdueAmount: num(summary.overdueAmount),
    delinquencyRate: num(summary.delinquencyRate),
    receivedThisMonth: num(summary.receivedThisMonth),
    pendingThisMonth: num(summary.pendingThisMonth),
    forecastNextMonth: num(summary.forecastNextMonth),
    monthly: (summary.monthly ?? []).map(point => ({
      month: point.month,
      billed: num(point.billed),
      received: num(point.received),
      overdue: num(point.overdue),
    })),
    byMethod: (summary.byMethod ?? []).map(item => ({
      method: item.method,
      count: num(item.count),
      amount: num(item.amount),
    })),
  }
}

// ---------------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------------

export interface MonthlyPoint {
  month: string
  label: string
  faturado: number
  recebido: number
  vencido: number
}

export function monthlyChartData(summary: BillingSummary | null): MonthlyPoint[] {
  return (summary?.monthly ?? []).map(point => ({
    month: point.month,
    label: formatMonthShort(point.month),
    faturado: point.billed,
    recebido: point.received,
    vencido: point.overdue,
  }))
}

/** Eixo Y compacto: "R$ 1,2 mil". */
export function formatBRLCompact(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  }
  return `R$ ${Math.round(value).toLocaleString('pt-BR')}`
}

// ---------------------------------------------------------------------------
// Pix e boleto
// ---------------------------------------------------------------------------

/** O QR vem como PNG base64 SEM prefixo (formato do `encodedImage` do Asaas). */
export function pixQrDataUrl(base64: string | null | undefined): string | null {
  if (!base64) return null
  return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
}

/** Lista paginada devolvida pelas actions de faturamento. */
export interface Paged<T> {
  items: T[]
  meta: PageMeta
}

/**
 * Mesmo formato do `ActionResult` de `lib/actions/_api-result.ts` — repetido
 * aqui porque aquele arquivo é `server-only` e um `'use server'` não pode
 * reexportar tipo; o componente de cliente tipa com este.
 */
export type FaturamentoActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

/** Resumo da última cobrança de cada assinatura (coluna de Cadastros). */
export interface LatestChargeInfo {
  chargeId: string
  status: ClubChargeStatus
  dueDate: string
  paidAt: string | null
  amount: number
  method: ClubPaymentMethod
}
