import {
  COMPLIANCE_CHECKLIST_LABELS,
  EMAIL_TEMPLATE_LABELS,
  KYB_DOCUMENT_STATUS_LABELS,
  ONBOARDING_EVENT_LABELS,
  ONBOARDING_STATUS_LABELS,
  PLATFORM_ACCESS_LEVEL_LABELS,
  PLATFORM_BILLING_EVENT_LABELS,
  PLATFORM_CHARGE_KIND_LABELS,
  PLATFORM_SUBSCRIPTION_STATUS_LABELS,
  TENANT_HEALTH_BAND_LABELS,
  onlyDigits,
  type ComplianceChecklistItem,
  type EmailStatus,
  type EmailTemplate,
  type KybChecklistState,
  type KybDocumentStatus,
  type OnboardingEventType,
  type OnboardingStatus,
  type PageMeta,
  type PlatformAccessLevel,
  type PlatformBillingEventType,
  type PlatformBillingSettings,
  type PlatformBillingSummary,
  type PlatformCharge,
  type PlatformChargeKind,
  type PlatformEventSource,
  type PlatformPlanOffer,
  type PlatformSubscription,
  type PrecheckOutcome,
  type PrecheckSummary,
  type TenantHealthBand,
} from '@annetec/contracts'
import { toneClass, type StatusMeta, type Tone } from '@/lib/adapters/faturamento'
import { isDemoMode } from '@/lib/demo-mode'

/**
 * Console da plataforma ANNETEC — compliance (KYB), faturamento da plataforma
 * e caixa de saída. Tudo o que a tela precisa para EXIBIR os DTOs de
 * `platform-onboarding.ts`, `platform-billing.ts` e `holding.ts`: cor de cada
 * status, frases curtas, prazos e normalização de números. Sem I/O: roda no
 * browser e no servidor (as server actions normalizam na borda).
 *
 * Os rótulos longos são os do contracts; aqui só entram a cor e, quando o
 * rótulo do contracts é frase para o candidato, uma versão curta para selo.
 */

export {
  addDays,
  canSimulatePayments,
  chargeStatusMeta,
  formatBRL,
  formatBRLCompact,
  formatBoletoLine,
  formatCount,
  formatDateBR,
  formatDateTimeBR,
  formatMonthShort,
  formatPercent,
  formatRelative,
  gatewayLabel,
  isChargeOpen,
  paymentMethodLabel,
  periodRange,
  pixQrDataUrl,
  todaySP,
  toneClass,
  PERIOD_OPTIONS,
} from '@/lib/adapters/faturamento'
export type { PeriodPreset, StatusMeta, Tone } from '@/lib/adapters/faturamento'

/** Lista paginada devolvida pelas actions do console. */
export interface Paged<T> {
  items: T[]
  meta: PageMeta
}

/**
 * Mesmo formato do `ActionResult` de `lib/actions/_api-result.ts` — repetido
 * porque aquele arquivo é `server-only` e um `'use server'` não reexporta
 * tipo; os componentes de cliente tipam com este.
 */
export type ConsoleActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

function meta(label: string, tone: Tone): StatusMeta {
  return { label, className: toneClass(tone) }
}

// ---------------------------------------------------------------------------
// Documentos brasileiros
// ---------------------------------------------------------------------------

/** `12345678000190` → `12.345.678/0001-90` (devolve o original se não tiver 14 dígitos). */
export function formatCnpj(value: string | null | undefined): string {
  const digits = onlyDigits(value)
  if (digits.length !== 14) return value ?? ''
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

export function formatBytes(bytes: number | null | undefined): string {
  const value = Number(bytes ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB`
  return `${(value / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

/** Horas → "36 h", "2 d 4 h". */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) return '—'
  const total = Math.max(0, Math.round(hours))
  if (total < 48) return `${total} h`
  const days = Math.floor(total / 24)
  const rest = total % 24
  return rest > 0 ? `${days} d ${rest} h` : `${days} d`
}

// ---------------------------------------------------------------------------
// Proposta (onboarding)
// ---------------------------------------------------------------------------

const ONBOARDING_TONE: Record<OnboardingStatus, Tone> = {
  draft: 'neutral',
  submitted: 'info',
  in_review: 'violet',
  pending_info: 'warning',
  approved: 'success',
  awaiting_payment: 'orange',
  provisioning: 'info',
  active: 'success',
  rejected: 'danger',
  canceled: 'neutral',
}

/** Rótulo curto para selo (o do contracts é a frase completa). */
const ONBOARDING_SHORT_LABEL: Partial<Record<OnboardingStatus, string>> = {
  pending_info: 'Pendência',
  awaiting_payment: 'Aguardando pagamento',
  submitted: 'Na fila',
}

export function onboardingStatusMeta(status: OnboardingStatus, short = true): StatusMeta {
  const label = (short && ONBOARDING_SHORT_LABEL[status]) || ONBOARDING_STATUS_LABELS[status] || status
  return meta(label, ONBOARDING_TONE[status] ?? 'neutral')
}

export const ONBOARDING_STATUS_OPTIONS = (Object.keys(ONBOARDING_STATUS_LABELS) as OnboardingStatus[]).map(
  value => ({ value, label: ONBOARDING_STATUS_LABELS[value] }),
)

const PRECHECK_OUTCOME_LABELS: Record<PrecheckOutcome, string> = {
  pass: 'Passou',
  warn: 'Alerta',
  fail: 'Falhou',
  skipped: 'Não se aplica',
}

const PRECHECK_OUTCOME_TONE: Record<PrecheckOutcome, Tone> = {
  pass: 'success',
  warn: 'warning',
  fail: 'danger',
  skipped: 'neutral',
}

export function precheckOutcomeMeta(outcome: PrecheckOutcome): StatusMeta {
  return meta(PRECHECK_OUTCOME_LABELS[outcome] ?? outcome, PRECHECK_OUTCOME_TONE[outcome] ?? 'neutral')
}

const PRECHECK_SUMMARY_LABELS: Record<PrecheckSummary, string> = {
  pass: 'Tudo certo',
  warn: 'Com alertas',
  fail: 'Com falhas',
}

export function precheckSummaryMeta(summary: PrecheckSummary | null | undefined): StatusMeta {
  if (!summary) return meta('Não executadas', 'neutral')
  return meta(PRECHECK_SUMMARY_LABELS[summary], PRECHECK_OUTCOME_TONE[summary])
}

export const PRECHECK_SUMMARY_OPTIONS = (Object.keys(PRECHECK_SUMMARY_LABELS) as PrecheckSummary[]).map(value => ({
  value,
  label: PRECHECK_SUMMARY_LABELS[value],
}))

const DOCUMENT_SHORT_LABEL: Record<KybDocumentStatus, string> = {
  uploaded: 'A revisar',
  approved: 'Aprovado',
  rejected: 'Recusado',
  replaced: 'Substituído',
}

const DOCUMENT_TONE: Record<KybDocumentStatus, Tone> = {
  uploaded: 'info',
  approved: 'success',
  rejected: 'danger',
  replaced: 'neutral',
}

export function kybDocumentStatusMeta(status: KybDocumentStatus): StatusMeta & { title: string } {
  return {
    ...meta(DOCUMENT_SHORT_LABEL[status] ?? status, DOCUMENT_TONE[status] ?? 'neutral'),
    title: KYB_DOCUMENT_STATUS_LABELS[status] ?? status,
  }
}

export function kybChecklistStateMeta(state: KybChecklistState, required: boolean): StatusMeta {
  switch (state) {
    case 'approved':
      return meta('Aprovado', 'success')
    case 'uploaded':
      return meta('A revisar', 'info')
    case 'rejected':
      return meta('Recusado', 'danger')
    default:
      return meta(required ? 'Faltando' : 'Não enviado', required ? 'orange' : 'neutral')
  }
}

export function qsaMatchMeta(match: 'matched' | 'not_found' | 'not_applicable' | null): StatusMeta {
  switch (match) {
    case 'matched':
      return meta('Consta no QSA', 'success')
    case 'not_found':
      return meta('Não consta no QSA', 'warning')
    case 'not_applicable':
      return meta('QSA não se aplica', 'neutral')
    default:
      return meta('QSA não verificado', 'neutral')
  }
}

export function onboardingEventLabel(type: string): string {
  return ONBOARDING_EVENT_LABELS[type as OnboardingEventType] ?? type
}

export function onboardingEventTone(type: string): Tone {
  switch (type) {
    case 'APPROVED':
    case 'DOCUMENT_APPROVED':
    case 'PAYMENT_CONFIRMED':
    case 'PROVISIONED':
      return 'success'
    case 'REJECTED':
    case 'DOCUMENT_REJECTED':
    case 'PROVISIONING_FAILED':
      return 'danger'
    case 'INFO_REQUESTED':
    case 'EXPIRED':
      return 'warning'
    case 'CANCELED':
    case 'DOCUMENT_REMOVED':
      return 'neutral'
    case 'NOTE_ADDED':
      return 'violet'
    case 'ACTIVATION_CHARGE_CREATED':
    case 'PROVISIONING_STARTED':
      return 'orange'
    default:
      return 'info'
  }
}

export function checklistLabel(item: ComplianceChecklistItem): string {
  return COMPLIANCE_CHECKLIST_LABELS[item] ?? item
}

/**
 * Selo de SLA da fila (48 h a partir do envio). `null` fora da fila — prazo
 * só existe enquanto a proposta espera o compliance.
 */
export function slaInfo(
  item: { slaDueAt: string | null; slaBreached: boolean },
  now: Date = new Date(),
): { label: string; tone: Tone; hoursLeft: number } | null {
  if (!item.slaDueAt) return null
  const due = new Date(item.slaDueAt).getTime()
  if (Number.isNaN(due)) return null
  const hoursLeft = (due - now.getTime()) / 3_600_000
  if (item.slaBreached || hoursLeft <= 0) {
    return { label: `Estourado há ${formatHours(-hoursLeft)}`, tone: 'danger', hoursLeft }
  }
  if (hoursLeft <= 12) return { label: `Vence em ${formatHours(hoursLeft)}`, tone: 'warning', hoursLeft }
  return { label: `Vence em ${formatHours(hoursLeft)}`, tone: 'info', hoursLeft }
}

// ---------------------------------------------------------------------------
// Faturamento da plataforma
// ---------------------------------------------------------------------------

const SUBSCRIPTION_TONE: Record<PlatformSubscription['status'], Tone> = {
  active: 'success',
  past_due: 'warning',
  restricted: 'orange',
  suspended: 'danger',
  canceled: 'neutral',
}

export function platformSubscriptionStatusMeta(status: PlatformSubscription['status']): StatusMeta {
  return meta(PLATFORM_SUBSCRIPTION_STATUS_LABELS[status] ?? status, SUBSCRIPTION_TONE[status] ?? 'neutral')
}

export const PLATFORM_SUBSCRIPTION_STATUS_OPTIONS = (
  Object.keys(PLATFORM_SUBSCRIPTION_STATUS_LABELS) as PlatformSubscription['status'][]
).map(value => ({ value, label: PLATFORM_SUBSCRIPTION_STATUS_LABELS[value] }))

const ACCESS_TONE: Record<PlatformAccessLevel, Tone> = {
  full: 'success',
  read_only: 'orange',
  blocked: 'danger',
}

export function accessLevelMeta(level: PlatformAccessLevel): StatusMeta {
  return meta(PLATFORM_ACCESS_LEVEL_LABELS[level] ?? level, ACCESS_TONE[level] ?? 'neutral')
}

export const ACCESS_LEVEL_OPTIONS = (Object.keys(PLATFORM_ACCESS_LEVEL_LABELS) as PlatformAccessLevel[]).map(
  value => ({ value, label: PLATFORM_ACCESS_LEVEL_LABELS[value] }),
)

const CHARGE_KIND_TONE: Record<PlatformChargeKind, Tone> = {
  activation: 'violet',
  monthly: 'info',
  adjustment: 'neutral',
}

export function chargeKindMeta(kind: PlatformChargeKind): StatusMeta {
  return meta(PLATFORM_CHARGE_KIND_LABELS[kind] ?? kind, CHARGE_KIND_TONE[kind] ?? 'neutral')
}

export const CHARGE_KIND_OPTIONS = (Object.keys(PLATFORM_CHARGE_KIND_LABELS) as PlatformChargeKind[]).map(
  value => ({ value, label: PLATFORM_CHARGE_KIND_LABELS[value] }),
)

export function platformEventLabel(type: string): string {
  return PLATFORM_BILLING_EVENT_LABELS[type as PlatformBillingEventType] ?? type
}

export function platformEventTone(type: string): Tone {
  switch (type) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
    case 'CHARGE_MANUAL_PAYMENT':
    case 'SUBSCRIPTION_CREATED':
    case 'SUBSCRIPTION_REACTIVATED':
    case 'PLAN_UPGRADED':
      return 'success'
    case 'PAYMENT_OVERDUE':
    case 'SUBSCRIPTION_SUSPENDED':
    case 'SUBSCRIPTION_CANCELED':
      return 'danger'
    case 'SUBSCRIPTION_RESTRICTED':
    case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
      return 'orange'
    case 'SUBSCRIPTION_PAST_DUE':
    case 'REMINDER_SENT':
    case 'ACCESS_OVERRIDE_SET':
      return 'warning'
    case 'PAYMENT_REFUNDED':
    case 'DEMO_TIME_TRAVEL':
    case 'ACTIVATION_CHARGE_CREATED':
      return 'violet'
    case 'PAYMENT_DELETED':
    case 'CHARGE_CANCELED':
    case 'ACCESS_OVERRIDE_CLEARED':
      return 'neutral'
    default:
      return 'info'
  }
}

export const PLATFORM_EVENT_SOURCE_LABELS: Record<PlatformEventSource, string> = {
  webhook: 'Webhook do gateway',
  automation: 'Automação',
  onboarding: 'Contratação',
  manual: 'Manual',
  simulation: 'Simulação',
  tenant: 'Inquilino',
}

const EVENT_SOURCE_TONE: Record<PlatformEventSource, Tone> = {
  webhook: 'violet',
  automation: 'info',
  onboarding: 'success',
  manual: 'warning',
  simulation: 'neutral',
  tenant: 'orange',
}

export function platformEventSourceMeta(source: PlatformEventSource): StatusMeta {
  return meta(PLATFORM_EVENT_SOURCE_LABELS[source] ?? source, EVENT_SOURCE_TONE[source] ?? 'neutral')
}

export const PLATFORM_EVENT_SOURCE_OPTIONS = (Object.keys(PLATFORM_EVENT_SOURCE_LABELS) as PlatformEventSource[]).map(
  value => ({ value, label: PLATFORM_EVENT_SOURCE_LABELS[value] }),
)

/**
 * "Avançar dias" da plataforma: ferramentas ligadas no servidor E gateway
 * simulado (a API recusa em qualquer outro). A decisão de "é demonstração"
 * delega para `isDemoMode`; o gateway simulado é exigência extra da ação.
 */
export function demoToolsAvailable(settings: Pick<PlatformBillingSettings, 'demoToolsEnabled' | 'gateway'> | null): boolean {
  if (!settings || !settings.demoToolsEnabled || settings.gateway !== 'simulated') return false
  return isDemoMode({ gateway: settings.gateway, demoToolsEnabled: settings.demoToolsEnabled })
}

/**
 * Degraus da régua em dias relativos ao vencimento — o desenho "D−10 gera ·
 * D−3 lembra · D0 vence · D+10 restringe · D+30 suspende · D+90 cancela".
 */
export function dunningSteps(
  settings: Pick<
    PlatformBillingSettings,
    'generateDaysBefore' | 'reminderDaysBefore' | 'restrictAfterDays' | 'suspendAfterDays' | 'cancelAfterDays'
  >,
): { key: string; day: number; label: string; detail: string; tone: Tone }[] {
  return [
    {
      key: 'generate',
      day: -settings.generateDaysBefore,
      label: 'Fatura gerada',
      detail: 'Vidas apuradas e e-mail com o link de pagamento',
      tone: 'info',
    },
    {
      key: 'reminder',
      day: -settings.reminderDaysBefore,
      label: 'Lembrete',
      detail: 'E-mail de lembrete para o financeiro',
      tone: 'warning',
    },
    { key: 'due', day: 0, label: 'Vencimento', detail: 'Sem pagamento → em atraso (painel completo)', tone: 'orange' },
    {
      key: 'restrict',
      day: settings.restrictAfterDays,
      label: 'Somente leitura',
      detail: 'Painel da equipe só consulta; associados não são afetados',
      tone: 'orange',
    },
    {
      key: 'suspend',
      day: settings.suspendAfterDays,
      label: 'Painel bloqueado',
      detail: 'Só "Minha assinatura ANNETEC" fica acessível',
      tone: 'danger',
    },
    {
      key: 'cancel',
      day: settings.cancelAfterDays,
      label: 'Assinatura cancelada',
      detail: 'O inquilino nunca é cancelado automaticamente',
      tone: 'neutral',
    },
  ]
}

export function formatRelativeDay(day: number): string {
  if (day === 0) return 'D0'
  return day > 0 ? `D+${day}` : `D−${Math.abs(day)}`
}

// ---------------------------------------------------------------------------
// Caixa de saída
// ---------------------------------------------------------------------------

const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  simulated: 'Simulado',
  queued: 'Na fila',
  sent: 'Enviado',
  failed: 'Falhou',
}

const EMAIL_STATUS_TONE: Record<EmailStatus, Tone> = {
  simulated: 'violet',
  queued: 'info',
  sent: 'success',
  failed: 'danger',
}

export function emailStatusMeta(status: EmailStatus): StatusMeta {
  return meta(EMAIL_STATUS_LABELS[status] ?? status, EMAIL_STATUS_TONE[status] ?? 'neutral')
}

export const EMAIL_STATUS_OPTIONS = (Object.keys(EMAIL_STATUS_LABELS) as EmailStatus[]).map(value => ({
  value,
  label: EMAIL_STATUS_LABELS[value],
}))

export function emailTemplateLabel(template: string): string {
  return EMAIL_TEMPLATE_LABELS[template as EmailTemplate] ?? template
}

export const EMAIL_TEMPLATE_OPTIONS = (Object.keys(EMAIL_TEMPLATE_LABELS) as EmailTemplate[]).map(value => ({
  value,
  label: EMAIL_TEMPLATE_LABELS[value],
}))

// ---------------------------------------------------------------------------
// Saúde (holding)
// ---------------------------------------------------------------------------

const HEALTH_TONE: Record<TenantHealthBand, Tone> = {
  healthy: 'success',
  attention: 'warning',
  risk: 'danger',
}

export function healthBandMeta(band: TenantHealthBand): StatusMeta {
  return meta(TENANT_HEALTH_BAND_LABELS[band] ?? band, HEALTH_TONE[band] ?? 'neutral')
}

// ---------------------------------------------------------------------------
// Normalização (numeric do Postgres pode escapar como texto)
// ---------------------------------------------------------------------------

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  return num(value)
}

export function normalizePlatformCharge<T extends PlatformCharge>(charge: T): T {
  return {
    ...charge,
    amount: num(charge.amount),
    paidAmount: numOrNull(charge.paidAmount),
    attempts: num(charge.attempts),
    livesCount: charge.livesCount === null || charge.livesCount === undefined ? null : num(charge.livesCount),
    items: (charge.items ?? []).map(item => ({
      ...item,
      quantity: num(item.quantity),
      unitPrice: num(item.unitPrice),
      amount: num(item.amount),
    })),
  }
}

/** A lista não precisa do QR do Pix (PNG base64 de alguns KB por linha) — o detalhe traz. */
export function lightPlatformCharge<T extends PlatformCharge>(charge: T): T {
  const normalized = normalizePlatformCharge(charge)
  return normalized.pix ? { ...normalized, pix: { ...normalized.pix, qrCodeBase64: null } } : normalized
}

export function normalizePlatformSubscription<T extends PlatformSubscription>(sub: T): T {
  return {
    ...sub,
    planPriceMonthly: num(sub.planPriceMonthly),
    memberLimit: num(sub.memberLimit),
    pricePerExtraLife: num(sub.pricePerExtraLife),
    setupFee: num(sub.setupFee),
    revenueSharePercent: num(sub.revenueSharePercent),
    lives: num(sub.lives),
    usagePct: num(sub.usagePct),
    estimatedMonthly: num(sub.estimatedMonthly),
    openAmount: num(sub.openAmount),
    overdueCount: num(sub.overdueCount),
    daysLate: num(sub.daysLate),
  }
}

export function normalizePlatformSummary(summary: PlatformBillingSummary): PlatformBillingSummary {
  return {
    ...summary,
    mrr: num(summary.mrr),
    overdueAmount: num(summary.overdueAmount),
    delinquencyRate: num(summary.delinquencyRate),
    receivedThisMonth: num(summary.receivedThisMonth),
    pendingThisMonth: num(summary.pendingThisMonth),
    forecastNextMonth: num(summary.forecastNextMonth),
    activationRevenueThisMonth: num(summary.activationRevenueThisMonth),
    monthly: (summary.monthly ?? []).map(point => ({
      month: point.month,
      billed: num(point.billed),
      received: num(point.received),
      overdue: num(point.overdue),
    })),
  }
}

export function normalizePlanOffer(offer: PlatformPlanOffer): PlatformPlanOffer {
  return {
    ...offer,
    priceMonthly: num(offer.priceMonthly),
    memberLimit: num(offer.memberLimit),
    features: offer.features ?? [],
    pricing: {
      ...offer.pricing,
      setupFee: num(offer.pricing?.setupFee),
      pricePerExtraLife: num(offer.pricing?.pricePerExtraLife),
      revenueSharePercent: num(offer.pricing?.revenueSharePercent),
    },
  }
}

/** Meta de paginação de fallback quando a API não manda `meta`. */
export function pagedOf<T>(items: T[], pageMeta: PageMeta | undefined, page = 1, perPage = items.length || 1): Paged<T> {
  return {
    items,
    meta: pageMeta ?? { page, perPage, total: items.length, totalPages: items.length === 0 ? 0 : 1 },
  }
}
