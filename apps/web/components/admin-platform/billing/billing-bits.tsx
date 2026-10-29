'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  Ban,
  Barcode,
  BellRing,
  Bot,
  CalendarClock,
  CircleCheckBig,
  CirclePause,
  CircleX,
  CreditCard,
  Eye,
  FlaskConical,
  Hand,
  HandCoins,
  Hourglass,
  Lock,
  QrCode,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Rocket,
  ShieldOff,
  Sparkles,
  TimerReset,
  TrendingDown,
  TrendingUp,
  Undo2,
  UserRound,
  Wallet,
  Webhook,
  Zap,
} from 'lucide-react'
import {
  CARD_BRAND_LABELS,
  type ClubCardInfo,
  type ClubPaymentMethod,
  type PaymentGatewayProvider,
  type PlatformAccessLevel,
  type PlatformBillingEvent,
  type PlatformChargeKind,
  type PlatformEventSource,
  type PlatformSubscription,
  type PlatformSubscriptionAccess,
} from '@annetec/contracts'
import { Pill } from '@/components/admin-platform/billing/console-kit'
import {
  accessLevelMeta,
  chargeKindMeta,
  formatDateTimeBR,
  formatRelative,
  gatewayLabel,
  paymentMethodLabel,
  platformEventLabel,
  platformEventSourceMeta,
  platformEventTone,
  platformSubscriptionStatusMeta,
  toneClass,
} from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/** Peças visuais do faturamento da plataforma, compartilhadas pelas abas e pelo detalhe. */

/**
 * Selo do gateway: implementação ÚNICA em `admin/faturamento/billing-ui`
 * (clube e plataforma usam o mesmo). Re-exportado aqui por compatibilidade.
 */
export { GatewayBadge } from '@/components/admin/faturamento/billing-ui'

/**
 * Selo de "como a ANNETEC recebe" (o gateway, na língua do dono). Só aparece em
 * Regras de cobrança; âmbar na demonstração, azul no ambiente de testes, verde no real.
 */
export function ReceivingBadge({
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
      Forma de recebimento: {gatewayLabel(provider, sandbox)}
    </span>
  )
}

/** "1 dia", "3 dias" — o número sempre acompanha a unidade. */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${count.toLocaleString('pt-BR')} ${count === 1 ? singular : plural}`
}

/**
 * "Vidas" é o termo do ramo e fica; a dica ao passar o mouse explica a conta
 * (titulares + dependentes) para quem ainda não a conhece.
 */
export function LivesTerm({ children = 'vidas', className }: { children?: ReactNode; className?: string }) {
  return (
    <abbr
      title="Vidas são os titulares mais os dependentes"
      className={cn('cursor-help underline-offset-2', className)}
    >
      {children}
    </abbr>
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

export function SubscriptionStatusPill({ status }: { status: PlatformSubscription['status'] }) {
  return <Pill meta={platformSubscriptionStatusMeta(status)} />
}

const ACCESS_ICON: Record<PlatformAccessLevel, LucideIcon> = {
  full: Zap,
  read_only: Eye,
  blocked: Lock,
}

export function AccessPill({
  access,
  className,
}: {
  access: Pick<PlatformSubscriptionAccess, 'level' | 'source'> & Partial<Pick<PlatformSubscriptionAccess, 'overrideReason' | 'overrideUntil'>>
  className?: string
}) {
  const meta = accessLevelMeta(access.level)
  const Icon = ACCESS_ICON[access.level] ?? Zap
  const title =
    access.source === 'override'
      ? `Definido manualmente pela equipe da ANNETEC${access.overrideReason ? `: ${access.overrideReason}` : ''}${
          access.overrideUntil ? ` (até ${formatDateTimeBR(access.overrideUntil)})` : ''
        }`
      : 'Definido pelas regras de cobrança'
  return (
    <span
      title={title}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', meta.className, className)}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
      {access.source === 'override' && <span className="font-semibold">· manual</span>}
    </span>
  )
}

export function ChargeKindPill({ kind }: { kind: PlatformChargeKind }) {
  return <Pill meta={chargeKindMeta(kind)} className="px-2 text-[11px]" />
}

/** Vidas × limite, com a barra de uso (âmbar a partir de 80%, vermelha acima de 100%). */
export function UsageBar({ lives, limit, pct, className }: { lives: number; limit: number; pct: number; className?: string }) {
  const color = pct >= 100 ? 'bg-[#B42318]' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className={cn('min-w-28 space-y-1', className)}>
      <p className="text-xs text-foreground">
        <span className="font-medium">{lives.toLocaleString('pt-BR')}</span>
        <span className="text-muted-foreground">
          {' '}
          / {limit.toLocaleString('pt-BR')} <LivesTerm />
        </span>
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Uso do limite de vidas do plano">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Linha do tempo de eventos de cobrança da plataforma
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
  ACTIVATION_CHARGE_CREATED: Rocket,
  CHARGE_GENERATED: ReceiptText,
  CHARGE_REISSUED: RotateCcw,
  CHARGE_CANCELED: CircleX,
  CHARGE_MANUAL_PAYMENT: HandCoins,
  REMINDER_SENT: BellRing,
  SUBSCRIPTION_CREATED: Sparkles,
  SUBSCRIPTION_PAST_DUE: Hourglass,
  SUBSCRIPTION_RESTRICTED: Eye,
  SUBSCRIPTION_SUSPENDED: CirclePause,
  SUBSCRIPTION_REACTIVATED: Zap,
  SUBSCRIPTION_CANCELED: Ban,
  PLAN_UPGRADED: TrendingUp,
  PLAN_DOWNGRADE_SCHEDULED: TrendingDown,
  PLAN_CHANGED: RefreshCw,
  ACCESS_OVERRIDE_SET: ShieldOff,
  ACCESS_OVERRIDE_CLEARED: ShieldOff,
  DEMO_TIME_TRAVEL: TimerReset,
}

const SOURCE_ICON: Record<PlatformEventSource, LucideIcon> = {
  webhook: Webhook,
  automation: Bot,
  onboarding: Rocket,
  manual: Hand,
  simulation: FlaskConical,
  tenant: UserRound,
}

/** Rótulos na língua do dono; a cor continua a do adaptador. */
const SOURCE_LABEL: Record<PlatformEventSource, string> = {
  webhook: 'Aviso de pagamento',
  automation: 'Automação',
  onboarding: 'Contratação',
  manual: 'Manual',
  simulation: 'Simulação',
  tenant: 'Clube',
}

export function EventSourceBadge({ source }: { source: PlatformEventSource }) {
  const meta = platformEventSourceMeta(source)
  const Icon = SOURCE_ICON[source] ?? Activity
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', meta.className)}>
      <Icon className="h-3 w-3" />
      {SOURCE_LABEL[source] ?? meta.label}
    </span>
  )
}

/** Títulos que o contrato escreve em termo técnico (gateway, baixa manual) trocados pelos do glossário. */
const EVENT_TITLE: Record<string, string> = {
  PAYMENT_CREATED: 'Cobrança registrada',
  PAYMENT_UPDATED: 'Cobrança atualizada',
  PAYMENT_DELETED: 'Cobrança removida',
  PAYMENT_RESTORED: 'Cobrança restaurada',
  PAYMENT_CHARGEBACK_REQUESTED: 'Contestação do cartão aberta',
  PAYMENT_CHARGEBACK_DISPUTE: 'Contestação do cartão em disputa',
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: 'Contestação ganha — aguardando devolução do valor',
  CHARGE_MANUAL_PAYMENT: 'Marcada como paga',
  SUBSCRIPTION_CREATED: 'Clube passou a pagar a ANNETEC',
  SUBSCRIPTION_RESTRICTED: 'Painel do clube em somente leitura',
  SUBSCRIPTION_SUSPENDED: 'Painel do clube bloqueado',
  SUBSCRIPTION_GATEWAY_MIGRATED: 'Forma de recebimento trocada',
  DEMO_TIME_TRAVEL: 'Datas avançadas (demonstração)',
}

function eventTitle(type: string): string {
  return EVENT_TITLE[type] ?? platformEventLabel(type)
}

export function PlatformEventsTimeline({
  events,
  emptyText = 'Nenhum evento registrado ainda.',
  showTenant = false,
  tenantNames,
  className,
}: {
  events: PlatformBillingEvent[]
  emptyText?: string
  /** Na linha do tempo global, mostra de qual clube é cada evento. */
  showTenant?: boolean
  tenantNames?: Map<string, string>
  className?: string
}) {
  if (events.length === 0) {
    return <p className={cn('py-8 text-center text-sm text-muted-foreground', className)}>{emptyText}</p>
  }

  return (
    <ol className={cn('relative space-y-4', className)}>
      {events.map((event, index) => {
        const Icon = EVENT_ICON[event.type] ?? Activity
        const title = eventTitle(event.type)
        const tenant = showTenant && event.organizationId ? tenantNames?.get(event.organizationId) : undefined
        return (
          <li key={event.id} className="relative flex gap-3">
            {index < events.length - 1 && <span className="absolute left-4 top-9 -bottom-4 w-px bg-border" aria-hidden />}
            <span
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                toneClass(platformEventTone(event.type)),
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold text-foreground">{title}</span>
                <EventSourceBadge source={event.source} />
                {tenant && <span className="text-xs font-medium text-muted-foreground">· {tenant}</span>}
                {showTenant && !event.organizationId && event.proposalId && (
                  <span className="text-xs text-muted-foreground">· contratação</span>
                )}
              </div>
              {event.message && event.message !== title && <p className="mt-0.5 text-sm text-muted-foreground">{event.message}</p>}
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
