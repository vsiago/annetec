'use client'

import { ArrowRight } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { BillingSummary } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartCard, chartTooltipStyle } from '@/components/dashboard/chart-card'
import { StatusPill } from '@/components/dashboard/table-controls'
import {
  formatBRL,
  formatBRLCompact,
  formatCount,
  monthlyChartData,
  paymentMethodLabel,
  subscriptionStatusMeta,
} from '@/lib/adapters/faturamento'
import { useChartColors } from '@/lib/use-chart-colors'
import { EventsFeed } from './events-feed'
import { LoadError, methodIcon } from './billing-ui'

/**
 * Cores fixas (e não as da marca do inquilino) porque cada série tem um
 * significado: verde entrou, vermelho venceu. A ordem recebido · faturado ·
 * vencido mantém verde e vermelho separados — lado a lado eles se confundem
 * para quem tem daltonismo (paleta validada: CVD ΔE ≥ 27 nos pares vizinhos).
 */
const SERIES = [
  { key: 'recebido', name: 'Recebido', color: '#16a34a' },
  { key: 'faturado', name: 'Faturado', color: '#3b82f6' },
  { key: 'vencido', name: 'Vencido', color: '#dc2626' },
] as const

export function OverviewTab({
  tenantSlug,
  summary,
  summaryError,
  onRetry,
  version,
  onGoTo,
}: {
  tenantSlug: string
  summary: BillingSummary | null
  summaryError: string | null
  onRetry: () => void
  version: number
  onGoTo: (tab: 'cobrancas' | 'assinaturas' | 'automacao', status?: 'overdue') => void
}) {
  const colors = useChartColors()
  const monthly = monthlyChartData(summary)
  const hasMonthly = monthly.some(point => point.faturado > 0 || point.recebido > 0 || point.vencido > 0)
  const methodTotal = (summary?.byMethod ?? []).reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="space-y-5">
      {summaryError && !summary && <LoadError message={summaryError} onRetry={onRetry} />}

      <div className="grid gap-5 xl:grid-cols-12">
        <ChartCard
          title="Faturado, recebido e vencido"
          description="Últimos 6 meses — faturado por vencimento, recebido pela data do pagamento."
          hasData={hasMonthly}
          height={280}
          className="xl:col-span-8"
          emptyMessage="O gráfico aparece com as primeiras cobranças do clube."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: 4 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 3" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
                width={72}
                tickFormatter={(value: number) => formatBRLCompact(value)}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
                contentStyle={chartTooltipStyle}
                formatter={(value: number, name: string) => [formatBRL(value), name]}
              />
              <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              {SERIES.map(series => (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  name={series.name}
                  fill={series.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="shadow-sm xl:col-span-4">
          <CardHeader>
            <CardTitle className="text-lg">Carteira do clube</CardTitle>
            <CardDescription>Assinaturas por situação e forma de pagamento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!summary ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-7 w-full" />
                ))}
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {(
                    [
                      ['active', summary.activeSubscriptions],
                      ['pending_payment', summary.pendingSubscriptions],
                      ['past_due', summary.pastDueSubscriptions],
                      ['suspended', summary.suspendedSubscriptions],
                    ] as const
                  ).map(([status, count]) => (
                    <li key={status} className="flex items-center justify-between gap-2 text-sm">
                      <StatusPill {...subscriptionStatusMeta(status)} />
                      <span className="font-semibold text-foreground">{formatCount(count)}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Canceladas neste mês</span>
                    <span className="font-semibold text-foreground">{formatCount(summary.canceledThisMonth)}</span>
                  </li>
                </ul>

                <div className="space-y-3 border-t border-border pt-4">
                  {summary.byMethod.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhuma assinatura ativa ainda.</p>
                  )}
                  {summary.byMethod.map(item => {
                    const Icon = methodIcon(item.method)
                    const share = methodTotal === 0 ? 0 : Math.round((item.count / methodTotal) * 100)
                    return (
                      <div key={item.method} className="space-y-1.5">
                        <div className="flex items-center gap-2 text-sm">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 text-foreground">{paymentMethodLabel(item.method)}</span>
                          <span className="text-muted-foreground">
                            {formatCount(item.count)} · {formatBRL(item.amount)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <Button variant="outline" className="w-full gap-2" onClick={() => onGoTo('cobrancas', 'overdue')}>
                  Ver cobranças vencidas
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Últimos acontecimentos</CardTitle>
          <CardDescription>Pagamentos confirmados, cobranças geradas e lembretes — tudo sem intervenção.</CardDescription>
          <CardAction className="self-center">
            <Button variant="link" className="h-auto gap-1 px-0" onClick={() => onGoTo('automacao')}>
              Linha do tempo completa
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <EventsFeed tenantSlug={tenantSlug} version={version} perPage={6} showFilter={false} allowMore={false} />
        </CardContent>
      </Card>
    </div>
  )
}
