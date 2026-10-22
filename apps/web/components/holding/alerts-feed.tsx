'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, BellOff } from 'lucide-react'
import { HOLDING_ALERT_LABELS, type HoldingAlert, type HoldingAlertSeverity } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  ALERT_ACTION_LABELS,
  ALERT_SEVERITY_LABELS,
  ALERT_SEVERITY_RANK,
  formatInt,
  formatPct,
  timeAgo,
} from '@/lib/adapters/holding'
import { EmptyNote, FormulaHint, SectionError, SEVERITY_META } from './holding-ui'

const SEVERITIES: HoldingAlertSeverity[] = ['critical', 'warning', 'info']

/** Métrica só onde o contrato diz o que ela é (% do limite de vidas). */
function metricText(alert: HoldingAlert): string | null {
  if (alert.metric === null) return null
  if (alert.kind === 'near_member_limit' || alert.kind === 'over_member_limit' || alert.kind === 'low_adoption') {
    return `${formatPct(alert.metric)} do limite`
  }
  return null
}

function alertHref(alert: HoldingAlert): string | null {
  if (alert.actionHref) return alert.actionHref
  if (alert.organizationId) return `/admin/holding/${alert.organizationId}`
  if (alert.proposalId) return `/admin/compliance/${alert.proposalId}`
  return null
}

export function AlertItem({ alert, showTenant = true }: { alert: HoldingAlert; showTenant?: boolean }) {
  const meta = SEVERITY_META[alert.severity]
  const Icon = meta.icon
  const href = alertHref(alert)
  const metric = metricText(alert)
  return (
    <li className="flex gap-3 py-3">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.iconClass)} aria-label={ALERT_SEVERITY_LABELS[alert.severity]} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug text-foreground">{alert.title}</p>
            <p className="text-xs text-muted-foreground">
              {ALERT_SEVERITY_LABELS[alert.severity]} · {HOLDING_ALERT_LABELS[alert.kind]}
            </p>
          </div>
          {href && (
            <Button asChild size="sm" variant="outline" className="h-7 shrink-0 px-2.5 text-xs">
              <Link href={href}>
                {ALERT_ACTION_LABELS[alert.kind]}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{alert.message}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {showTenant && alert.tenantName && (
            <>
              {alert.organizationId ? (
                <Link href={`/admin/holding/${alert.organizationId}`} className="font-medium text-foreground hover:underline">
                  {alert.tenantName}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{alert.tenantName}</span>
              )}
              <span aria-hidden>·</span>
            </>
          )}
          {metric && (
            <>
              <span>{metric}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span title={new Date(alert.detectedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}>
            detectado {timeAgo(alert.detectedAt)}
          </span>
        </p>
      </div>
    </li>
  )
}

/**
 * Feed de alertas estratégicos acionáveis: upsell por limite de vidas,
 * inadimplência (com a ANNETEC e dos associados), queda de vendas, baixa
 * adesão e contratações travadas. Cada item leva à tela onde se age.
 */
export function AlertsFeed({
  alerts,
  loading,
  error,
  onRetry,
  className,
}: {
  alerts: HoldingAlert[] | null
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  className?: string
}) {
  const [severity, setSeverity] = useState<HoldingAlertSeverity | 'all'>('all')
  const sorted = useMemo(
    () =>
      [...(alerts ?? [])].sort(
        (a, b) => ALERT_SEVERITY_RANK[a.severity] - ALERT_SEVERITY_RANK[b.severity] || (b.metric ?? 0) - (a.metric ?? 0),
      ),
    [alerts],
  )
  const counts = useMemo(() => {
    const result: Record<HoldingAlertSeverity, number> = { critical: 0, warning: 0, info: 0 }
    for (const alert of sorted) result[alert.severity] += 1
    return result
  }, [sorted])
  const visible = severity === 'all' ? sorted : sorted.filter(alert => alert.severity === severity)

  return (
    <Card className={cn('gap-3 border-0 shadow-sm', className)}>
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Alertas estratégicos</CardTitle>
          <FormulaHint>
            Gerados na leitura: uso ≥ 80% do limite de vidas (upsell) ou acima dele; assinatura da plataforma fora de
            “em dia”; inadimplência dos associados ≥ 15% ou subindo ≥ 5 p.p. em 30 dias; GMV de 30 dias caindo ≥ 30%;
            baixa adesão; análise cadastral com SLA estourado; ativação aprovada sem pagamento; falha no
            provisionamento.
          </FormulaHint>
        </div>
        <CardDescription className="text-xs">Do mais grave ao informativo — cada um leva à tela onde se age</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && !alerts ? (
          <SectionError message={error} onRetry={onRetry} />
        ) : loading && !alerts ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyNote icon={BellOff}>Nenhum alerta agora — carteira sem pendências estratégicas.</EmptyNote>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por severidade">
              <FilterChip active={severity === 'all'} onClick={() => setSeverity('all')}>
                Todos <span className="tabular-nums">{formatInt(sorted.length)}</span>
              </FilterChip>
              {SEVERITIES.map(item => {
                const Icon = SEVERITY_META[item].icon
                return (
                  <FilterChip
                    key={item}
                    active={severity === item}
                    disabled={counts[item] === 0}
                    onClick={() => setSeverity(item)}
                  >
                    <Icon className={cn('h-3.5 w-3.5', SEVERITY_META[item].iconClass)} />
                    {ALERT_SEVERITY_LABELS[item]} <span className="tabular-nums">{formatInt(counts[item])}</span>
                  </FilterChip>
                )
              })}
            </div>
            <ul className={cn('max-h-110 divide-y overflow-y-auto pr-1', loading && 'opacity-60 transition-opacity')}>
              {visible.map(alert => (
                <AlertItem key={alert.id} alert={alert} />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function FilterChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'border-foreground/20 bg-foreground text-background' : 'bg-background text-foreground hover:bg-muted',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {children}
    </button>
  )
}
