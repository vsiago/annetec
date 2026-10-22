'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Ban,
  Barcode,
  BellRing,
  Bot,
  CalendarClock,
  CircleAlert,
  CircleCheckBig,
  CirclePause,
  CircleX,
  CreditCard,
  FlaskConical,
  Hand,
  HandCoins,
  Hourglass,
  QrCode,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
  Undo2,
  UserRoundCheck,
  Wallet,
  Webhook,
  Zap,
} from 'lucide-react'
import type {
  BillingSummary,
  ClubCardInfo,
  ClubPaymentMethod,
  PaymentEvent,
  PaymentEventSource,
  PaymentGatewayProvider,
} from '@annetec/contracts'
import { CARD_BRAND_LABELS } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/dashboard/stat-card'
import {
  delinquencyPercent,
  eventLabel,
  eventSourceMeta,
  eventTone,
  formatBRL,
  formatCount,
  formatDateTimeBR,
  formatPercent,
  formatRelative,
  gatewayLabel,
  paymentMethodLabel,
  toneClass,
} from '@/lib/adapters/faturamento'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Gateway e método
// ---------------------------------------------------------------------------

/** Selo do processador ativo: âmbar no simulado (demonstração), verde no real. */
export function GatewayBadge({
  provider,
  sandbox = false,
  className,
}: {
  provider: PaymentGatewayProvider | undefined
  sandbox?: boolean
  className?: string
}) {
  if (!provider) return null
  const simulated = provider === 'simulated'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
        simulated
          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
          : sandbox
            ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
        className,
      )}
    >
      {simulated ? <FlaskConical className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
      Gateway: {gatewayLabel(provider, sandbox)}
    </span>
  )
}

const METHOD_ICON: Record<ClubPaymentMethod, LucideIcon> = {
  pix: QrCode,
  boleto: Barcode,
  credit_card: CreditCard,
}

export function MethodLabel({
  method,
  card,
  className,
}: {
  method: ClubPaymentMethod
  card?: ClubCardInfo | null
  className?: string
}) {
  const Icon = METHOD_ICON[method] ?? Wallet
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground', className)}>
      <Icon className="h-4 w-4 shrink-0" />
      <span>
        {method === 'credit_card' && card
          ? `${CARD_BRAND_LABELS[card.brand] ?? 'Cartão'} •••• ${card.last4}`
          : paymentMethodLabel(method)}
      </span>
    </span>
  )
}

export function methodIcon(method: ClubPaymentMethod): LucideIcon {
  return METHOD_ICON[method] ?? Wallet
}

// ---------------------------------------------------------------------------
// Estados de carregamento e erro
// ---------------------------------------------------------------------------

export function LoadError({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center',
        className,
      )}
      role="alert"
    >
      <CircleAlert className="h-5 w-5 shrink-0 text-destructive" />
      <p className="flex-1 text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      )}
    </div>
  )
}

export function TableSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3 p-4', className)} aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="hidden h-4 w-20 md:block" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Indicadores do clube
// ---------------------------------------------------------------------------

/**
 * Indicadores do `/faturamento/resumo`. `compact` = os quatro do Início;
 * completo = os cinco do Faturamento (com as próximas cobranças).
 */
export function ClubKpiCards({
  summary,
  loading,
  compact = false,
}: {
  summary: BillingSummary | null
  loading: boolean
  compact?: boolean
}) {
  const count = compact ? 4 : 5
  const gridClass = compact
    ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
    : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5'

  if (!summary) {
    return (
      <div className={gridClass}>
        {Array.from({ length: count }, (_, index) => (
          <Skeleton key={index} className={cn('h-28 rounded-xl', !loading && 'animate-none opacity-60')} />
        ))}
      </div>
    )
  }

  const rate = delinquencyPercent(summary.delinquencyRate)

  return (
    <div className={gridClass}>
      <StatCard
        icon={TrendingUp}
        accent="primary"
        value={formatBRL(summary.mrr)}
        label="Receita recorrente (MRR)"
        hint={`Previsão do próximo mês: ${formatBRL(summary.forecastNextMonth)}`}
      />
      <StatCard
        icon={UserRoundCheck}
        accent="success"
        value={formatCount(summary.activeSubscriptions)}
        label="Assinaturas ativas"
        hint={
          summary.newThisMonth > 0
            ? `+${formatCount(summary.newThisMonth)} no mês · ${formatCount(summary.totalDependents)} dependentes`
            : `${formatCount(summary.totalDependents)} dependentes · ${formatCount(summary.pendingSubscriptions)} aguardando`
        }
        tone={summary.newThisMonth > 0 ? 'up' : 'neutral'}
      />
      <StatCard
        icon={CircleAlert}
        accent="warning"
        value={formatBRL(summary.overdueAmount)}
        label={`Inadimplência · ${formatPercent(rate)}`}
        hint={`${formatCount(summary.overdueCharges)} cobranças vencidas · ${formatCount(summary.pastDueSubscriptions + summary.suspendedSubscriptions)} assinaturas afetadas`}
        tone={summary.overdueCharges > 0 ? 'down' : 'neutral'}
      />
      <StatCard
        icon={HandCoins}
        accent="info"
        value={formatBRL(summary.receivedThisMonth)}
        label="Recebido no mês"
        hint="Confirmado automaticamente pelo gateway"
      />
      {!compact && (
        <StatCard
          icon={CalendarClock}
          accent="primary"
          value={formatBRL(summary.pendingThisMonth)}
          label="Próximas cobranças"
          hint="Em aberto, a vencer neste mês"
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Timeline de eventos de pagamento
// ---------------------------------------------------------------------------

const EVENT_ICON: Record<string, LucideIcon> = {
  PAYMENT_CREATED: ReceiptText,
  PAYMENT_UPDATED: RefreshCw,
  PAYMENT_CONFIRMED: CircleCheckBig,
  PAYMENT_RECEIVED: CircleCheckBig,
  PAYMENT_OVERDUE: CalendarClock,
  PAYMENT_DELETED: CircleX,
  PAYMENT_REFUNDED: Undo2,
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: CreditCard,
  CHECKOUT_STARTED: ShoppingCart,
  CHARGE_GENERATED: ReceiptText,
  CHARGE_REISSUED: RotateCcw,
  CHARGE_CANCELED: CircleX,
  CHARGE_MANUAL_PAYMENT: HandCoins,
  REMINDER_SENT: BellRing,
  SUBSCRIPTION_ACTIVATED: UserRoundCheck,
  SUBSCRIPTION_PAST_DUE: Hourglass,
  SUBSCRIPTION_SUSPENDED: CirclePause,
  SUBSCRIPTION_REACTIVATED: Zap,
  SUBSCRIPTION_CANCELED: Ban,
}

const SOURCE_ICON: Record<PaymentEventSource, LucideIcon> = {
  webhook: Webhook,
  automation: Bot,
  checkout: ShoppingCart,
  manual: Hand,
  simulation: FlaskConical,
}

export function SourceBadge({ source }: { source: PaymentEventSource }) {
  const meta = eventSourceMeta(source)
  const Icon = SOURCE_ICON[source] ?? Activity
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        meta.className,
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  )
}

export function EventsTimeline({
  events,
  emptyText = 'Nenhum evento registrado ainda.',
  className,
}: {
  events: PaymentEvent[]
  emptyText?: string
  className?: string
}) {
  if (events.length === 0) {
    return <p className={cn('py-8 text-center text-sm text-muted-foreground', className)}>{emptyText}</p>
  }

  return (
    <ol className={cn('relative space-y-4', className)}>
      {events.map((event, index) => {
        const Icon = EVENT_ICON[event.type] ?? Activity
        const title = eventLabel(event.type)
        return (
          <li key={event.id} className="relative flex gap-3">
            {index < events.length - 1 && (
              <span className="absolute left-4 top-9 -bottom-4 w-px bg-border" aria-hidden />
            )}
            <span
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                toneClass(eventTone(event.type)),
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold text-foreground">{title}</span>
                <SourceBadge source={event.source} />
              </div>
              {event.message && event.message !== title && (
                <p className="mt-0.5 text-sm text-muted-foreground">{event.message}</p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground" title={formatDateTimeBR(event.createdAt)}>
                {formatRelative(event.createdAt)} · {formatDateTimeBR(event.createdAt)}
                {event.gatewayProvider ? ` · ${gatewayLabel(event.gatewayProvider)}` : ''}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// Número essencial (Recebimento e cabeçalho do Faturamento)
// ---------------------------------------------------------------------------

/**
 * Bloco enxuto de indicador: rótulo, valor e uma linha de apoio. Sem ícone
 * nem cor de fundo — nas telas do Financeiro o número é a informação.
 */
export function MetricTile({
  label,
  value,
  hint,
  tone = 'default',
  loading = false,
  className,
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'primary' | 'warning'
  loading?: boolean
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card px-4 py-3.5 shadow-sm', className)}>
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <p
          className={cn(
            'mt-1 truncate text-xl font-bold leading-tight sm:text-2xl',
            tone === 'primary' && 'text-primary',
            tone === 'warning' && 'text-amber-600 dark:text-amber-400',
            tone === 'default' && 'text-foreground',
          )}
        >
          {value}
        </p>
      )}
      {hint && !loading && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
