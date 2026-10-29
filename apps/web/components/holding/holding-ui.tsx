'use client'

import type { ComponentType, ReactNode } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Info,
  Lock,
  Minus,
  RefreshCw,
  ShieldCheck,
  XCircle,
  Eye,
} from 'lucide-react'
import {
  PLATFORM_ACCESS_LEVEL_LABELS,
  TENANT_HEALTH_BAND_LABELS,
  type HoldingAlertSeverity,
  type PlatformAccessLevel,
  type TenantHealthBand,
} from '@annetec/contracts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/admin-platform/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  ALERT_SEVERITY_LABELS,
  HOLDING_PERIOD_OPTIONS,
  SEM_BASE,
  describeError,
  formatPct,
  formatTimeBR,
  timeAgo,
  usageTone,
} from '@/lib/adapters/holding'

/**
 * Peças visuais da holding. Cores de STATUS (verde/âmbar/vermelho) só onde a
 * cor significa bom/ruim — nota de saúde, acesso, severidade, direção de
 * tendência — e sempre com ícone e texto, nunca cor sozinha.
 */

export type Tone = 'positive' | 'warning' | 'danger' | 'info' | 'neutral'

const TONE_CLASSES: Record<Tone, string> = {
  positive: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  warning: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  danger: 'bg-red-50 text-[#B42318] ring-[#B42318]/20',
  info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  neutral: 'bg-muted text-muted-foreground ring-border',
}

export function SoftBadge({
  tone,
  icon: Icon,
  children,
  className,
  title,
}: {
  tone: Tone
  icon?: ComponentType<{ className?: string }>
  children: ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Saúde, acesso e severidade
// ---------------------------------------------------------------------------

export const BAND_META: Record<TenantHealthBand, { tone: Tone; icon: ComponentType<{ className?: string }>; bar: string }> = {
  healthy: { tone: 'positive', icon: CheckCircle2, bar: 'bg-emerald-500' },
  attention: { tone: 'warning', icon: AlertTriangle, bar: 'bg-amber-500' },
  risk: { tone: 'danger', icon: XCircle, bar: 'bg-[#B42318]' },
}

export function BandBadge({ band, className }: { band: TenantHealthBand; className?: string }) {
  const meta = BAND_META[band]
  return (
    <SoftBadge tone={meta.tone} icon={meta.icon} className={className}>
      {TENANT_HEALTH_BAND_LABELS[band]}
    </SoftBadge>
  )
}

/** Nota 0–100 com a faixa ao lado. `lg` é o número de destaque do detalhe. */
export function HealthScore({
  score,
  band,
  size = 'sm',
}: {
  score: number
  band: TenantHealthBand
  size?: 'sm' | 'lg'
}) {
  if (size === 'lg') {
    return (
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full ring-4 ring-inset',
            band === 'healthy' && 'ring-emerald-500/70',
            band === 'attention' && 'ring-amber-500/70',
            band === 'risk' && 'ring-red-500/70',
          )}
        >
          <span className="text-2xl font-semibold text-foreground">{score}</span>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Nota de saúde</p>
          <BandBadge band={band} />
        </div>
      </div>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-7 text-right text-sm font-semibold tabular-nums text-foreground">{score}</span>
      <BandBadge band={band} />
    </span>
  )
}

const ACCESS_META: Record<PlatformAccessLevel, { tone: Tone; icon: ComponentType<{ className?: string }> }> = {
  full: { tone: 'positive', icon: ShieldCheck },
  read_only: { tone: 'warning', icon: Eye },
  blocked: { tone: 'danger', icon: Lock },
}

export function AccessBadge({ level, override }: { level: PlatformAccessLevel; override?: boolean }) {
  const meta = ACCESS_META[level]
  return (
    <SoftBadge tone={meta.tone} icon={meta.icon} title={override ? 'Decisão manual da equipe' : undefined}>
      {PLATFORM_ACCESS_LEVEL_LABELS[level]}
      {override ? ' · manual' : ''}
    </SoftBadge>
  )
}

export const SEVERITY_META: Record<
  HoldingAlertSeverity,
  { tone: Tone; icon: ComponentType<{ className?: string }>; iconClass: string }
> = {
  critical: { tone: 'danger', icon: XCircle, iconClass: 'text-[#B42318]' },
  warning: { tone: 'warning', icon: AlertTriangle, iconClass: 'text-amber-600' },
  info: { tone: 'info', icon: Info, iconClass: 'text-blue-600' },
}

export function SeverityBadge({ severity, children }: { severity: HoldingAlertSeverity; children?: ReactNode }) {
  const meta = SEVERITY_META[severity]
  return (
    <SoftBadge tone={meta.tone} icon={meta.icon}>
      {children ?? ALERT_SEVERITY_LABELS[severity]}
    </SoftBadge>
  )
}

export function ManagedBadge({ managed }: { managed: boolean }) {
  return managed ? (
    <SoftBadge tone="info">Cobrança automática</SoftBadge>
  ) : (
    <SoftBadge tone="neutral" title="Sem assinatura de plataforma: a equipe só acompanha, nunca restringe">
      Fora da cobrança automática
    </SoftBadge>
  )
}

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------

/** Ícone (i) com a fórmula do indicador. */
export function FormulaHint({ children, label = 'Como é calculado' }: { children: ReactNode; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Variação com seta. A cor diz se é BOM ou RUIM (não se subiu ou desceu):
 * churn subindo é vermelho, receita subindo é verde.
 */
export function TrendDelta({
  value,
  goodWhen = 'up',
  format = v => formatPct(v, { signed: true }),
  suffix,
  className,
}: {
  value: number | null | undefined
  goodWhen?: 'up' | 'down'
  format?: (value: number) => string
  suffix?: string
  className?: string
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
        <Minus className="h-3.5 w-3.5" />
        sem base{suffix ? ` ${suffix}` : ''}
      </span>
    )
  }
  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  const good = direction === 'flat' ? null : direction === goodWhen
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-medium',
        good === true && 'text-emerald-700',
        good === false && 'text-[#B42318]',
        good === null && 'text-muted-foreground',
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {format(value)}
      {suffix && <span className="font-normal text-muted-foreground">&nbsp;{suffix}</span>}
    </span>
  )
}

/** Cartão de indicador de destaque (poucos, no topo). */
export function KpiTile({
  label,
  value,
  formula,
  delta,
  children,
  icon: Icon,
  loading,
  className,
}: {
  label: string
  value: ReactNode
  formula?: ReactNode
  delta?: ReactNode
  children?: ReactNode
  icon?: ComponentType<{ className?: string }>
  loading?: boolean
  className?: string
}) {
  return (
    <Card className={cn('gap-0 border-0 py-0 shadow-sm', className)}>
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm text-muted-foreground">{label}</p>
            {formula && <FormulaHint>{formula}</FormulaHint>}
          </div>
          {Icon && (
            <span className="rounded-md bg-muted p-1.5 text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
          )}
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-3xl font-semibold tracking-tight text-foreground">{value}</p>
              {delta}
            </div>
            {children && <div className="mt-auto space-y-1 text-xs text-muted-foreground">{children}</div>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Número secundário (linha de detalhe abaixo dos destaques). */
export function MiniStat({
  label,
  value,
  sub,
  formula,
  loading,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  formula?: ReactNode
  loading?: boolean
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1.5">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        {formula && <FormulaHint>{formula}</FormulaHint>}
      </div>
      {loading ? (
        <Skeleton className="h-6 w-20" />
      ) : (
        <>
          <p className="text-xl font-semibold text-foreground">{value}</p>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </>
      )}
    </div>
  )
}

/** Medidor de vidas × limite: âmbar a partir de 80% (upsell), vermelho acima do limite. */
export function UsageMeter({ usagePct, className }: { usagePct: number | null; className?: string }) {
  const tone = usageTone(usagePct)
  const width = usagePct === null ? 0 : Math.min(100, Math.max(usagePct > 0 ? 3 : 0, usagePct))
  return (
    <div
      className={cn(
        'h-1.5 w-full overflow-hidden rounded-full',
        tone === 'over' && 'bg-red-100',
        tone === 'near' && 'bg-amber-100',
        (tone === 'ok' || tone === 'none') && 'bg-blue-100',
        className,
      )}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={usagePct ?? undefined}
      aria-label={usagePct === null ? 'Sem limite de vidas' : `${formatPct(usagePct)} do limite de vidas`}
    >
      <div
        className={cn(
          'h-full rounded-full',
          tone === 'over' && 'bg-[#B42318]',
          tone === 'near' && 'bg-amber-500',
          tone === 'ok' && 'bg-blue-500',
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Estados e barra de controle
// ---------------------------------------------------------------------------

export function SectionError({
  title = 'Não foi possível carregar',
  message,
  onRetry,
  className,
}: {
  title?: string
  message: string
  onRetry?: () => void
  className?: string
}) {
  const { message: friendly, technical } = describeError(message)
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{friendly}</span>
          {onRetry && (
            <Button type="button" size="sm" variant="outline" onClick={onRetry} className="text-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
              Tentar novamente
            </Button>
          )}
        </div>
        {technical && (
          <details className="text-xs">
            <summary className="cursor-pointer select-none opacity-80 hover:opacity-100">Detalhes técnicos</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-background/60 p-2 font-mono text-[11px] text-foreground">
              {technical.slice(0, 1500)}
            </pre>
          </details>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function EmptyNote({ icon: Icon = Info, children }: { icon?: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <Icon className="h-5 w-5" />
      <div className="max-w-sm">{children}</div>
    </div>
  )
}

/** Seletor de período + "Atualizar agora" (`?fresh=1`) + quando foi calculado. */
export function HoldingToolbar({
  meses,
  onMesesChange,
  onRefresh,
  refreshing,
  generatedAt,
  cached,
}: {
  meses: number
  onMesesChange?: (value: number) => void
  onRefresh: () => void
  refreshing: boolean
  generatedAt?: string | null
  cached?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {generatedAt && (
        <span
          className="text-xs text-muted-foreground"
          title={cached ? 'Resultado guardado pela API por até 60 s' : 'Recalculado nesta consulta'}
        >
          Calculado às {formatTimeBR(generatedAt)} ({cached ? `cache, ${timeAgo(generatedAt)}` : 'agora'})
        </span>
      )}
      {onMesesChange && (
        <Select value={String(meses)} onValueChange={value => onMesesChange(Number(value))}>
          <SelectTrigger size="sm" className="w-37.5" aria-label="Período dos gráficos">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOLDING_PERIOD_OPTIONS.map(option => (
              <SelectItem key={option} value={String(option)}>
                Últimos {option} meses
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
        <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        Atualizar agora
      </Button>
    </div>
  )
}

export { SEM_BASE }
