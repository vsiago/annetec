'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight, LoaderCircle, Pencil, Power, PowerOff } from 'lucide-react'
import {
  describeDependentsPolicy,
  describeEnrollmentFee,
  formatBRL,
  type ClubPlan,
  type ClubPlanStats,
  type ClubPlanStatsCounters,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatInt, formatShare, livesShare, planBadge } from '@/lib/adapters/planos'
import { cn } from '@/lib/utils'
import { PlanBadgeChip, PlanStatusBadge } from './plan-ui'

/** Corpo da linha: preço e regras | números (lado a lado a partir do xl). */
const ROW_BODY = 'grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:items-end xl:gap-10'

function RowMetric({
  label,
  value,
  hint,
  title,
  alert = false,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  title?: string
  alert?: boolean
}) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 truncate text-base font-semibold tabular-nums',
          alert ? 'text-amber-600 dark:text-amber-400' : 'text-foreground',
        )}
      >
        {value}
      </dd>
      {hint && <dd className="truncate text-[11px] text-muted-foreground">{hint}</dd>}
    </div>
  )
}

/** Vidas · titulares · dependentes · em atraso · MRR + barra fina da participação nas vidas. */
function RowMetrics({
  counters,
  totals,
}: {
  counters: ClubPlanStatsCounters | null
  totals: ClubPlanStatsCounters | null
}) {
  const dash = '—'
  const share = livesShare(counters, totals)
  return (
    <div className="min-w-0">
      <dl className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.5fr)]">
        <RowMetric label="Vidas" value={counters ? formatInt(counters.lives) : dash} />
        <RowMetric label="Titulares" value={counters ? formatInt(counters.holders) : dash} />
        <RowMetric label="Dependentes" value={counters ? formatInt(counters.dependents) : dash} />
        <RowMetric
          label="Em atraso"
          alert={Boolean(counters && counters.pastDue > 0)}
          value={counters ? formatInt(counters.pastDue) : dash}
          hint={counters && counters.overdueAmount > 0 ? `${formatBRL(counters.overdueAmount)} venc.` : undefined}
          title={
            counters && counters.overdueAmount > 0
              ? `${formatBRL(counters.overdueAmount)} em cobranças vencidas`
              : undefined
          }
        />
        <RowMetric label="MRR" value={counters ? formatBRL(counters.mrr) : dash} />
      </dl>
      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Participação nas vidas do clube"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share * 100)}
        >
          <div className="h-full rounded-full bg-primary/70 transition-[width]" style={{ width: `${share * 100}%` }} />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {counters && totals ? `${formatShare(share)} das vidas` : '—'}
        </span>
      </div>
    </div>
  )
}

export function PlanRow({
  plan,
  counters,
  totals,
  href,
  working,
  onToggleStatus,
}: {
  plan: ClubPlan
  counters: ClubPlanStatsCounters | null
  totals: ClubPlanStatsCounters | null
  href: string
  working: boolean
  onToggleStatus: () => void
}) {
  const badge = planBadge(plan)
  const active = plan.status === 'active'
  const rowActions = (className: string) => (
    <div className={cn('items-center gap-1', className)}>
      <Button asChild variant="outline" size="sm" className="gap-1.5">
        <Link href={href} aria-label={`Ver ${plan.name}`}>
          <ArrowUpRight className="size-4" aria-hidden="true" />
          Ver
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="gap-1.5">
        <Link href={`${href}/editar`} aria-label={`Editar ${plan.name}`}>
          <Pencil className="size-4" aria-hidden="true" />
          Editar
        </Link>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={onToggleStatus}
        disabled={working}
        aria-label={`${active ? 'Inativar' : 'Ativar'} ${plan.name}`}
      >
        {working ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : active ? (
          <PowerOff className="size-4" aria-hidden="true" />
        ) : (
          <Power className="size-4" aria-hidden="true" />
        )}
        {active ? 'Inativar' : 'Ativar'}
      </Button>
    </div>
  )

  return (
    <article
      aria-labelledby={`plano-${plan.id}`}
      className="rounded-2xl border border-border/60 bg-card p-5 transition-colors hover:border-border sm:p-6"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`plano-${plan.id}`} className="text-base font-semibold text-foreground">
              <Link
                href={href}
                className="rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {plan.name}
              </Link>
            </h3>
            {badge && <PlanBadgeChip label={badge} />}
            <PlanStatusBadge status={plan.status} />
          </div>
          {(plan.tagline || plan.audience) && (
            <p className="line-clamp-2 max-w-2xl text-sm text-muted-foreground">{plan.tagline ?? plan.audience}</p>
          )}
        </div>
        {rowActions('hidden shrink-0 sm:flex')}
      </header>

      <div className={cn(ROW_BODY, 'mt-5')}>
        <div className="min-w-0">
          <p className="text-lg font-semibold tabular-nums text-foreground">
            {formatBRL(plan.priceMonthly)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">/mês</span>
          </p>
          <p className="text-xs text-muted-foreground">{describeDependentsPolicy(plan)}</p>
          <p className="text-xs text-muted-foreground">{describeEnrollmentFee(plan)}</p>
        </div>
        <RowMetrics counters={counters} totals={totals} />
      </div>

      {rowActions('-ml-2 mt-4 flex flex-wrap border-t border-border/60 pt-3 sm:hidden')}
    </article>
  )
}

/** Assinaturas cujo plano foi excluído: sem ações, só os números. */
export function OrphanPlanRow({ counters, totals }: { counters: ClubPlanStats; totals: ClubPlanStatsCounters | null }) {
  return (
    <article className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 sm:p-6">
      <div className={ROW_BODY}>
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold text-foreground">{counters.planName || 'Sem plano'}</h3>
          <p className="text-sm text-muted-foreground">
            Assinaturas de planos excluídos. Seguem cobradas pelo valor da contratação.
          </p>
        </div>
        <RowMetrics counters={counters} totals={totals} />
      </div>
    </article>
  )
}

export function PlanRowSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="hidden h-8 w-56 sm:block" />
      </div>
      <div className={cn(ROW_BODY, 'mt-5')}>
        <div className="space-y-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="space-y-1.5">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-5 w-10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
