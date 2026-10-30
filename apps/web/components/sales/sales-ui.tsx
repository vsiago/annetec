'use client'

import type { ReactNode } from 'react'
import { ArrowRight, BadgePercent } from 'lucide-react'
import {
  DISCOUNT_REQUEST_STATUS_LABELS,
  PROSPECT_STAGE_LABELS,
  SALES_COMMISSION_KIND_LABELS,
  SALES_COMMISSION_STATUS_LABELS,
  formatBRL,
  type DiscountRequestStatus,
  type OnboardingStatus,
  type PlatformPlanQuote,
  type ProspectStage,
  type SalesCommissionEntry,
  type SalesCommissionStatus,
  type SellerLinkStatus,
} from '@annetec/contracts'
import { StatusPill, type StatusPillTone } from '@/components/admin-platform/ui/status-pill'
import type { ConsoleTone } from '@/components/admin-platform/ui/tone'
import { cn } from '@/lib/utils'

/**
 * Vocabulário visual das vendas da plataforma (área do vendedor e Comercial
 * do console): etapas do funil, situação do link, do desconto e da comissão,
 * resumo do desconto e a comparação "de/para" do preço. A cor nunca é o único
 * sinal — toda pill tem o texto.
 */

// ---------------------------------------------------------------------------
// Etapas do funil
// ---------------------------------------------------------------------------

export const STAGE_ORDER: ProspectStage[] = [
  'novo',
  'em_contato',
  'proposta_enviada',
  'em_contratacao',
  'em_aprovacao',
  'ganho',
  'perdido',
]

export const STAGE_META: Record<ProspectStage, { label: string; tone: StatusPillTone; accent: ConsoleTone; bar: string; hint: string }> = {
  novo: { label: PROSPECT_STAGE_LABELS.novo, tone: 'neutral', accent: 'neutral', bar: '#98A2B3', hint: 'Operadoras e clubes que você ainda vai abordar.' },
  em_contato: { label: PROSPECT_STAGE_LABELS.em_contato, tone: 'info', accent: 'blue', bar: '#2E90FA', hint: 'Conversa começou.' },
  proposta_enviada: { label: PROSPECT_STAGE_LABELS.proposta_enviada, tone: 'info', accent: 'violet', bar: '#7A5AF8', hint: 'Você apresentou os planos.' },
  em_contratacao: {
    label: PROSPECT_STAGE_LABELS.em_contratacao,
    tone: 'warning',
    accent: 'amber',
    bar: '#F79009',
    hint: 'O cliente recebeu o link e está preenchendo.',
  },
  em_aprovacao: {
    label: PROSPECT_STAGE_LABELS.em_aprovacao,
    tone: 'warning',
    accent: 'coral',
    bar: '#E84364',
    hint: 'A ANNETEC está analisando o cadastro.',
  },
  ganho: { label: PROSPECT_STAGE_LABELS.ganho, tone: 'success', accent: 'green', bar: '#17B26A', hint: 'Clube no ar.' },
  perdido: { label: PROSPECT_STAGE_LABELS.perdido, tone: 'danger', accent: 'red', bar: '#F04438', hint: 'Negociação encerrada sem venda.' },
}

/** Etapas que o vendedor move à mão. As de proposta acompanham o status dela sozinhas. */
export const MANUAL_STAGES: ProspectStage[] = ['novo', 'em_contato', 'proposta_enviada', 'perdido']

export function StagePill({ stage }: { stage: ProspectStage }) {
  return <StatusPill tone={STAGE_META[stage].tone}>{STAGE_META[stage].label}</StatusPill>
}

// ---------------------------------------------------------------------------
// Proposta (como o vendedor lê o status)
// ---------------------------------------------------------------------------

export const SELLER_PROPOSAL_STATUS: Record<OnboardingStatus, { label: string; tone: StatusPillTone }> = {
  draft: { label: 'Cliente preenchendo', tone: 'neutral' },
  submitted: { label: 'Enviada para análise', tone: 'info' },
  in_review: { label: 'Em análise na ANNETEC', tone: 'info' },
  pending_info: { label: 'Pendência com o cliente', tone: 'warning' },
  approved: { label: 'Aprovada', tone: 'success' },
  awaiting_payment: { label: 'Aguardando pagamento', tone: 'warning' },
  provisioning: { label: 'Liberando o clube', tone: 'info' },
  active: { label: 'Clube no ar', tone: 'success' },
  rejected: { label: 'Reprovada', tone: 'danger' },
  canceled: { label: 'Cancelada', tone: 'neutral' },
}

/** Status em que ainda dá para pedir desconto (antes da aprovação, que emite a ativação). */
const DISCOUNT_ALLOWED: OnboardingStatus[] = ['draft', 'submitted', 'in_review', 'pending_info']

/**
 * O vendedor pode pedir desconto nesta proposta? Antes da aprovação, sem
 * desconto já aprovado e sem outro pedido aguardando o superadmin.
 */
export function canRequestDiscount(proposal: {
  status: OnboardingStatus
  discount: unknown
  lastDiscountRequest: { status: DiscountRequestStatus } | null
}): boolean {
  return DISCOUNT_ALLOWED.includes(proposal.status) && !proposal.discount && proposal.lastDiscountRequest?.status !== 'pending'
}

/** O link pode ser (re)enviado: proposta do vendedor, em andamento e sem pedido de desconto pendente. */
export function canSendLink(proposal: {
  source: string
  status: OnboardingStatus
  linkStatus: SellerLinkStatus
}): boolean {
  if (proposal.source !== 'console') return false
  if (proposal.status === 'active' || proposal.status === 'rejected' || proposal.status === 'canceled') return false
  return proposal.linkStatus !== 'awaiting_discount_approval'
}

export function SellerProposalStatusPill({ status }: { status: OnboardingStatus }) {
  const meta = SELLER_PROPOSAL_STATUS[status]
  return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
}

export const LINK_STATUS_META: Record<SellerLinkStatus, { label: string; tone: StatusPillTone; hint: string }> = {
  awaiting_discount_approval: {
    label: 'Aguardando o desconto',
    tone: 'warning',
    hint: 'O e-mail com o link sai assim que o superadmin decidir o desconto.',
  },
  not_sent: { label: 'Link não enviado', tone: 'danger', hint: 'O desconto foi recusado. Reenvie o link sem desconto ou peça outro.' },
  sent: { label: 'Link enviado', tone: 'success', hint: 'O cliente recebeu o link de contratação por e-mail.' },
  site: { label: 'Veio pelo site', tone: 'info', hint: 'O cliente começou pelo site com o seu código de indicação.' },
}

export function LinkStatusPill({ status }: { status: SellerLinkStatus }) {
  const meta = LINK_STATUS_META[status]
  return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>
}

const DISCOUNT_TONE: Record<DiscountRequestStatus, StatusPillTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  canceled: 'neutral',
}

export function DiscountStatusPill({ status }: { status: DiscountRequestStatus }) {
  return (
    <StatusPill tone={DISCOUNT_TONE[status]} icon={<BadgePercent />}>
      {status === 'pending' ? 'Desconto aguardando' : `Desconto ${DISCOUNT_REQUEST_STATUS_LABELS[status].toLowerCase()}`}
    </StatusPill>
  )
}

const COMMISSION_TONE: Record<SalesCommissionStatus, StatusPillTone> = {
  prevista: 'info',
  a_pagar: 'warning',
  paga: 'success',
  cancelada: 'neutral',
  a_descontar: 'danger',
}

export function CommissionStatusPill({ status }: { status: SalesCommissionStatus }) {
  return <StatusPill tone={COMMISSION_TONE[status]}>{SALES_COMMISSION_STATUS_LABELS[status]}</StatusPill>
}

/** "Adesão" ou "Mensalidade nº 2". */
export function commissionPartLabel(entry: Pick<SalesCommissionEntry, 'kind' | 'installment'>): string {
  if (entry.kind === 'setup_fee') return SALES_COMMISSION_KIND_LABELS.setup_fee
  return entry.installment ? `${SALES_COMMISSION_KIND_LABELS.monthly} nº ${entry.installment}` : SALES_COMMISSION_KIND_LABELS.monthly
}

export const COMMISSION_STATUS_OPTIONS = (Object.keys(SALES_COMMISSION_STATUS_LABELS) as SalesCommissionStatus[])
  .filter(status => status !== 'prevista')
  .map(value => ({ value, label: SALES_COMMISSION_STATUS_LABELS[value] }))

// ---------------------------------------------------------------------------
// Números, datas e meses
// ---------------------------------------------------------------------------

const PERCENT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/** `12.5` → `"12,5%"`. */
export function formatPct(value: number | null | undefined): string {
  return `${PERCENT.format(typeof value === 'number' && Number.isFinite(value) ? value : 0)}%`
}

export function formatMoney(value: number | null | undefined): string {
  return formatBRL(typeof value === 'number' && Number.isFinite(value) ? value : 0)
}

export function formatInt(value: number | null | undefined): string {
  return (typeof value === 'number' && Number.isFinite(value) ? value : 0).toLocaleString('pt-BR')
}

/** `"2026-10-30"` → `"30/10/2026"`. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : value
}

/** ISO → `"30/10/2026 às 14:05"`. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** "agora", "há 5 min", "há 3 h", "há 2 dias", "12/09/2026". */
export function formatRelativeShort(value: string | null | undefined): string {
  if (!value) return '—'
  const at = Date.parse(value)
  if (!Number.isFinite(at)) return '—'
  const minutes = Math.floor(Math.max(0, Date.now() - at) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return days === 1 ? 'ontem' : `há ${days} dias`
  return new Date(at).toLocaleDateString('pt-BR')
}

/** Hoje em São Paulo, `aaaa-mm-dd`. */
export function todaySP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

/** Mês atual em São Paulo, `aaaa-mm`. */
export function currentMonthSP(): string {
  return todaySP().slice(0, 7)
}

/** Próxima ação atrasada (data antes de hoje) ou hoje. */
export function actionDue(date: string | null | undefined): 'late' | 'today' | 'future' | null {
  if (!date) return null
  const today = todaySP()
  if (date < today) return 'late'
  if (date === today) return 'today'
  return 'future'
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** `"2026-10"` → `"outubro de 2026"`. */
export function monthLabel(value: string): string {
  const [y, m] = value.split('-')
  const name = MONTHS[Number(m) - 1]
  return name && y ? `${name} de ${y}` : value
}

/** `"2026-10"` → `"out/2026"` (tabelas). */
export function monthShort(value: string): string {
  const [y, m] = value.split('-')
  const name = MONTHS[Number(m) - 1]
  return name && y ? `${name.slice(0, 3)}/${y}` : value
}

/** Os últimos `count` meses (o atual primeiro), para filtros. */
export function recentMonths(count = 12): { value: string; label: string }[] {
  const [year, month] = currentMonthSP().split('-').map(Number) as [number, number]
  const out: { value: string; label: string }[] = []
  for (let i = 0; i < count; i++) {
    const total = year * 12 + (month - 1) - i
    const y = Math.floor(total / 12)
    const m = (total % 12) + 1
    const value = `${y}-${String(m).padStart(2, '0')}`
    out.push({ value, label: monthLabel(value).replace(/^./, c => c.toUpperCase()) })
  }
  return out
}

// ---------------------------------------------------------------------------
// Desconto
// ---------------------------------------------------------------------------

export interface DiscountShape {
  setupFeePercent?: number | null
  monthlyPercent?: number | null
  monthlyMonths?: number | null
}

/** "Isenção da adesão · 20% na mensalidade por 3 meses". */
export function discountSummary(discount: DiscountShape | null | undefined): string {
  if (!discount) return 'Sem desconto'
  const parts: string[] = []
  const setup = discount.setupFeePercent ?? 0
  const monthly = discount.monthlyPercent ?? 0
  if (setup >= 100) parts.push('Isenção da adesão')
  else if (setup > 0) parts.push(`${formatPct(setup)} na adesão`)
  if (monthly > 0) {
    const months = discount.monthlyMonths
    parts.push(
      `${formatPct(monthly)} na mensalidade ${
        months === null || months === undefined ? 'permanente' : months === 1 ? 'só na 1ª' : `por ${months} meses`
      }`,
    )
  }
  return parts.length ? parts.join(' · ') : 'Sem desconto'
}

/**
 * Comparação "de/para": preço cheio riscado ao lado do preço com a condição
 * especial. Linhas sem diferença aparecem uma vez só.
 */
export function QuoteComparison({
  before,
  after,
  title = 'Prévia do valor',
  className,
}: {
  before: PlatformPlanQuote | null | undefined
  after: PlatformPlanQuote | null | undefined
  title?: ReactNode
  className?: string
}) {
  if (!before || !after) return null
  const rows: { label: string; from: number; to: number; note?: string }[] = [
    {
      label: 'Mensalidade do plano',
      from: before.planFee,
      to: roundCents(after.planFee - after.planFeeDiscount),
      note: after.planFeeDiscountPercent > 0 ? `−${formatPct(after.planFeeDiscountPercent)}` : undefined,
    },
    {
      label: 'Adesão (única)',
      from: before.setupFee,
      to: roundCents(after.setupFee - after.setupFeeDiscount),
      note: after.setupFeeDiscountPercent >= 100 ? 'isenção' : after.setupFeeDiscountPercent > 0 ? `−${formatPct(after.setupFeeDiscountPercent)}` : undefined,
    },
    { label: 'Ativação (adesão + 1ª mensalidade)', from: before.activationTotal, to: after.activationTotal },
    { label: 'Mensal estimado', from: before.monthlyTotal, to: after.monthlyTotal },
  ]
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border bg-white', className)}>
      <p className="m-0 border-b border-[#EEF0F3] bg-[#FCFCFD] px-4 py-2.5 text-sm font-semibold text-foreground">{title}</p>
      <dl className="m-0 divide-y divide-[#EEF0F3]">
        {rows.map(row => {
          const changed = Math.abs(row.from - row.to) > 0.004
          return (
            <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="m-0 flex flex-wrap items-baseline gap-2 tabular-nums">
                {changed ? (
                  <>
                    <span className="text-muted-foreground line-through" aria-label={`de ${formatMoney(row.from)}`}>
                      {formatMoney(row.from)}
                    </span>
                    <ArrowRight className="size-3.5 self-center text-muted-foreground" aria-hidden="true" />
                    <span className="font-semibold text-[#067647]" aria-label={`para ${formatMoney(row.to)}`}>
                      {formatMoney(row.to)}
                    </span>
                    {row.note ? (
                      <span className="rounded-full bg-[#ECFDF3] px-2 py-0.5 text-[11px] font-semibold text-[#067647]">{row.note}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="font-medium text-foreground">{formatMoney(row.to)}</span>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

// ---------------------------------------------------------------------------
// Pequenas peças
// ---------------------------------------------------------------------------

/** Linha "rótulo: valor" de fichas de detalhe. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="m-0 break-words text-sm font-medium text-foreground">{children ?? '—'}</dd>
    </div>
  )
}

/** Mensagem de erro em linha, no padrão do console. */
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="m-0 rounded-xl border border-[#B42318]/20 bg-[#FEF3F2] px-4 py-3 text-sm text-[#B42318]">
      {children}
    </p>
  )
}
