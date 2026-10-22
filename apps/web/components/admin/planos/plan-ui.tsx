'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  BadgePercent,
  Brain,
  CircleAlert,
  FlaskConical,
  HeartPulse,
  LifeBuoy,
  Pill,
  RefreshCw,
  ShieldAlert,
  Smile,
  Sparkles,
  Stethoscope,
  Video,
} from 'lucide-react'
import {
  CLUB_PLAN_LEGAL_NOTICE,
  formatBRL,
  type ActiveStatus,
  type ClubCoverageCategory,
  type ClubPlanStatsCounters,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { PLAN_STATUS_LABELS, formatInt } from '@/lib/adapters/planos'
import { cn } from '@/lib/utils'

/** Um ícone por categoria de cobertura — o mesmo na lista, no detalhe e no formulário. */
export const COVERAGE_ICONS: Record<ClubCoverageCategory, LucideIcon> = {
  telemedicine: Video,
  consultations: Stethoscope,
  exams: FlaskConical,
  pharmacy: Pill,
  dental: Smile,
  mental_health: Brain,
  wellness: HeartPulse,
  assistance: LifeBuoy,
  discounts: BadgePercent,
  other: Sparkles,
}

export function CoverageIcon({ category, className }: { category: ClubCoverageCategory; className?: string }) {
  const Icon = COVERAGE_ICONS[category] ?? Sparkles
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground/70',
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  )
}

export function PlanStatusBadge({ status, className }: { status: ActiveStatus; className?: string }) {
  const active = status === 'active'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        active
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-muted-foreground/60')}
      />
      {PLAN_STATUS_LABELS[status]}
    </span>
  )
}

/** Selo comercial do plano ("Mais escolhido") — o único ponto com a cor do inquilino. */
export function PlanBadgeChip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary',
        className,
      )}
    >
      {label}
    </span>
  )
}

export function MetricTile({
  label,
  value,
  hint,
  loading = false,
  alert = false,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  loading?: boolean
  /** Destaca o valor (ex.: há assinatura em atraso). */
  alert?: boolean
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-border/60 bg-card px-5 py-4">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <p
          className={cn(
            'mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums',
            alert ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
          )}
        >
          {value}
        </p>
      )}
      {hint && !loading && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

/**
 * Os cinco indicadores de pessoas e receita (do clube ou de um plano).
 * `counters = null` = estatísticas indisponíveis: mostra "—", nunca zero falso.
 */
export function PlanKpis({ counters, loading }: { counters: ClubPlanStatsCounters | null; loading: boolean }) {
  const dash = '—'
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
      <MetricTile
        label="Vidas"
        loading={loading}
        value={counters ? formatInt(counters.lives) : dash}
        hint="titulares + dependentes"
      />
      <MetricTile
        label="Titulares"
        loading={loading}
        value={counters ? formatInt(counters.holders) : dash}
        hint="assinaturas vigentes"
      />
      <MetricTile
        label="Dependentes"
        loading={loading}
        value={counters ? formatInt(counters.dependents) : dash}
        hint="nas assinaturas vigentes"
      />
      <MetricTile
        label="Em atraso"
        loading={loading}
        alert={Boolean(counters && counters.pastDue > 0)}
        value={counters ? formatInt(counters.pastDue) : dash}
        hint={
          counters
            ? counters.overdueAmount > 0
              ? `${formatBRL(counters.overdueAmount)} vencidos`
              : 'nada vencido'
            : undefined
        }
      />
      <MetricTile
        label="MRR"
        loading={loading}
        value={counters ? formatBRL(counters.mrr) : dash}
        hint="recorrente por mês"
      />
    </div>
  )
}

/** Aviso legal obrigatório onde o plano é descrito (`CLUB_PLAN_LEGAL_NOTICE`). */
export function LegalNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl bg-muted/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground',
        className,
      )}
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{CLUB_PLAN_LEGAL_NOTICE}</p>
    </div>
  )
}

export function LoadErrorBox({
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
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center',
        className,
      )}
    >
      <CircleAlert className="size-5 shrink-0 text-destructive" aria-hidden="true" />
      <p className="flex-1 text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RefreshCw className="size-4" aria-hidden="true" />
          Tentar novamente
        </Button>
      )}
    </div>
  )
}

/** Bloco de conteúdo das abas: título discreto, muito respiro, sem sombra. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-2xl border border-border/60 bg-card', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('px-5 pb-5 pt-4 sm:px-6 sm:pb-6', !title && !action && 'pt-5 sm:pt-6', bodyClassName)}>
        {children}
      </div>
    </section>
  )
}

/** Linha rótulo → valor das regras: rótulo à esquerda no desktop, em cima no mobile. */
export function RuleRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 py-4 first:pt-0 last:pb-0 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-6">
      <div>
        <dt className="text-sm font-medium text-foreground">{label}</dt>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <dd className="min-w-0 text-sm text-muted-foreground">{children}</dd>
    </div>
  )
}

export function Chip({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        muted ? 'border-dashed border-border text-muted-foreground line-through' : 'border-border/70 text-foreground',
      )}
    >
      {children}
    </span>
  )
}
