'use client'

import { HOLDING_THRESHOLDS, TENANT_HEALTH_BAND_LABELS, type HoldingOverview, type HoldingTenantRow, type TenantHealthBand } from '@annetec/contracts'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatInt, formatPct, healthBreakdown } from '@/lib/adapters/holding'
import { BAND_META, BandBadge, EmptyNote, FormulaHint } from './holding-ui'

export const HEALTH_FORMULA = (
  <>
    Nota 0–100: começa em 100 e desconta — plataforma em atraso −15, restrita −30, suspensa −50, cancelada −70;
    inadimplência dos associados −1 por p.p. (até −25); GMV de 30 dias caiu ≥ {HOLDING_THRESHOLDS.salesDropPct}% −15 (≥ 50%
    −25); nenhum associado novo em 30 dias −10; uso &lt; {HOLDING_THRESHOLDS.lowAdoptionPct}% do limite após{' '}
    {HOLDING_THRESHOLDS.lowAdoptionMinAgeDays} dias −10. Faixas: ≥ {HOLDING_THRESHOLDS.healthyMin} saudável ·{' '}
    {HOLDING_THRESHOLDS.attentionMin}–{HOLDING_THRESHOLDS.healthyMin - 1} atenção · &lt; {HOLDING_THRESHOLDS.attentionMin}{' '}
    risco.
  </>
)

const BANDS: TenantHealthBand[] = ['healthy', 'attention', 'risk']

/**
 * Distribuição da carteira por faixa de saúde. Clicar numa faixa filtra o
 * ranking abaixo (clicar de novo limpa).
 */
export function HealthDistribution({
  distribution,
  selected,
  onSelect,
  loading,
  unavailable,
}: {
  distribution: HoldingOverview['healthDistribution'] | null
  selected: TenantHealthBand | 'all'
  onSelect: (band: TenantHealthBand | 'all') => void
  loading?: boolean
  /** A visão geral falhou (o aviso com "tentar novamente" fica no topo da tela). */
  unavailable?: boolean
}) {
  const total = distribution ? distribution.healthy + distribution.attention + distribution.risk : 0
  return (
    <Card className="gap-4 border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Saúde da carteira</CardTitle>
          <FormulaHint>{HEALTH_FORMULA}</FormulaHint>
        </div>
        <CardDescription className="text-xs">Clique numa faixa para filtrar o ranking</CardDescription>
        {!loading && distribution && (
          <CardAction className="text-right">
            <p className="text-2xl font-semibold leading-none">{formatInt(total)}</p>
            <p className="text-xs text-muted-foreground">inquilinos</p>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && !distribution ? (
          <div className="space-y-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !distribution && unavailable ? (
          <EmptyNote>Distribuição indisponível agora — veja o aviso no topo da tela.</EmptyNote>
        ) : !distribution || total === 0 ? (
          <EmptyNote>Nenhum inquilino avaliado ainda.</EmptyNote>
        ) : (
          <>
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
              {BANDS.filter(band => distribution[band] > 0).map(band => (
                <div
                  key={band}
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', BAND_META[band].bar)}
                  style={{ width: `${(distribution[band] / total) * 100}%` }}
                />
              ))}
            </div>
            <div className="space-y-1">
              {BANDS.map(band => {
                const count = distribution[band]
                const Icon = BAND_META[band].icon
                const active = selected === band
                return (
                  <button
                    key={band}
                    type="button"
                    onClick={() => onSelect(active ? 'all' : band)}
                    aria-pressed={active}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted',
                      active && 'bg-muted ring-1 ring-border',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        band === 'healthy' && 'text-emerald-600',
                        band === 'attention' && 'text-amber-600',
                        band === 'risk' && 'text-red-600',
                      )}
                    />
                    <span className="flex-1 text-foreground">{TENANT_HEALTH_BAND_LABELS[band]}</span>
                    <span className="font-semibold tabular-nums">{formatInt(count)}</span>
                    <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                      {formatPct((count / total) * 100)}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * "O motivo de cada componente": os 5 componentes da nota com o desconto que
 * a API aplicou e a explicação — inclusive os que não descontaram nada.
 */
export function HealthBreakdown({ row, className }: { row: HoldingTenantRow; className?: string }) {
  const components = healthBreakdown(row)
  const totalImpact = components.reduce((acc, c) => acc + c.impact, 0)
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Cálculo:</span>
        <span className="font-mono tabular-nums">
          100 {totalImpact < 0 ? `− ${Math.abs(totalImpact)}` : '− 0'} = {row.healthScore}
        </span>
        <BandBadge band={row.healthBand} />
      </div>
      <ul className="divide-y rounded-lg border bg-card">
        {components.map(component => {
          const penalized = component.impact < 0
          const share = component.maxPenalty > 0 ? Math.min(1, Math.abs(component.impact) / component.maxPenalty) : 0
          return (
            <li key={component.key} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[14rem_4.5rem_1fr] sm:items-center">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{component.label}</p>
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div
                    className={cn('h-full rounded-full', share >= 0.5 ? 'bg-red-500' : 'bg-amber-500')}
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
              </div>
              <span
                className={cn(
                  'text-sm font-semibold tabular-nums sm:text-right',
                  penalized ? 'text-red-700' : 'text-muted-foreground',
                )}
                title={`Desconto máximo deste componente: ${component.maxPenalty} pontos`}
              >
                {penalized ? `−${Math.abs(component.impact)}` : '0'}
                <span className="ml-1 text-xs font-normal text-muted-foreground">pts</span>
              </span>
              <p className="text-sm text-muted-foreground">{component.reason}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
