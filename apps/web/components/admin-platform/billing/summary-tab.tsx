'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, CalendarClock, CircleAlert, HandCoins, Table2, TrendingUp, Users } from 'lucide-react'
import type { PlatformBillingSummary, PlatformSubscription } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/dashboard/stat-card'
import { EmptyState } from '@/components/dashboard/empty-state'
import { KpiSkeleton, LoadError, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { AccessPill, SubscriptionStatusPill } from '@/components/admin-platform/billing/billing-bits'
import { listPlatformSubscriptionsAction } from '@/lib/actions/platform-billing-api'
import {
  formatBRL,
  formatBRLCompact,
  formatCount,
  formatMonthShort,
  formatPercent,
} from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Resumo da receita da plataforma: indicadores do `/platform/billing/resumo`
 * (fórmulas no blueprint §0.4), a série de 6 meses faturado × vencido ×
 * recebido, a distribuição das assinaturas pela régua e quem precisa de
 * atenção agora.
 */

/** Categóricas 1–3 da paleta validada (ordem fixa): faturado, vencido, recebido. */
const SERIES = [
  { key: 'faturado', label: 'Faturado', color: '#2a78d6' },
  { key: 'vencido', label: 'Vencido', color: '#eb6834' },
  { key: 'recebido', label: 'Recebido', color: '#1baf7a' },
] as const

type Point = { month: string; label: string; faturado: number; vencido: number; recebido: number }

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey?: string | number; value?: number }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="min-w-44 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-muted-foreground">{label}</p>
      <ul className="space-y-1">
        {SERIES.map(series => {
          const item = payload.find(entry => entry.dataKey === series.key)
          return (
            <li key={series.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: series.color }} />
                {series.label}
              </span>
              <span className="font-semibold tabular-nums text-foreground">{formatBRL(Number(item?.value ?? 0))}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function MonthlyChart({ summary }: { summary: PlatformBillingSummary }) {
  const [showTable, setShowTable] = useState(false)
  const data: Point[] = summary.monthly.map(point => ({
    month: point.month,
    label: formatMonthShort(point.month),
    faturado: point.billed,
    vencido: point.overdue,
    recebido: point.received,
  }))
  const hasData = data.some(point => point.faturado > 0 || point.recebido > 0 || point.vencido > 0)

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Receita da plataforma — últimos 6 meses</CardTitle>
        <CardDescription>Faturado e vencido pelo mês de vencimento; recebido pelo mês do pagamento.</CardDescription>
        {hasData && (
          <CardAction>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setShowTable(value => !value)}>
              <Table2 className="h-4 w-4" />
              {showTable ? 'Ver gráfico' : 'Ver tabela'}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState
            title="Ainda sem faturamento"
            description="A série aparece com a primeira fatura da plataforma (ativação ou mensalidade)."
            className="py-10"
          />
        ) : showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Mês</th>
                  {SERIES.map(series => (
                    <th key={series.key} className="py-2 pr-4 text-right font-medium">
                      {series.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map(point => (
                  <tr key={point.month} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-4 text-foreground">{point.label}</td>
                    {SERIES.map(series => (
                      <td key={series.key} className="py-2 pr-4 text-right tabular-nums text-foreground">
                        {formatBRL(point[series.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground" aria-hidden>
              {SERIES.map(series => (
                <span key={series.key} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: series.color }} />
                  {series.label}
                </span>
              ))}
            </div>
            <div className="h-64" role="img" aria-label="Gráfico de colunas: faturado, vencido e recebido por mês">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={2} barCategoryGap="24%">
                  <CartesianGrid vertical={false} stroke="#e1e0d9" strokeWidth={1} />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#c3c2b7' }} tick={{ fontSize: 12, fill: '#898781' }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={72}
                    tick={{ fontSize: 12, fill: '#898781' }}
                    tickFormatter={value => formatBRLCompact(Number(value))}
                  />
                  <Tooltip cursor={{ fill: 'rgba(11,11,11,0.04)' }} content={<ChartTooltip />} />
                  {SERIES.map(series => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      name={series.label}
                      fill={series.color}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const STATUS_BAR: { key: keyof PlatformBillingSummary; label: string; className: string }[] = [
  { key: 'activeSubscriptions', label: 'Em dia', className: 'bg-emerald-500' },
  { key: 'pastDueSubscriptions', label: 'Em atraso', className: 'bg-amber-400' },
  { key: 'restrictedSubscriptions', label: 'Somente leitura', className: 'bg-orange-500' },
  { key: 'suspendedSubscriptions', label: 'Bloqueadas', className: 'bg-red-600' },
  { key: 'canceledSubscriptions', label: 'Canceladas', className: 'bg-slate-400' },
]

function PortfolioCard({ summary }: { summary: PlatformBillingSummary }) {
  const counts = STATUS_BAR.map(item => ({ ...item, value: Number(summary[item.key] ?? 0) }))
  const total = counts.reduce((acc, item) => acc + item.value, 0)
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Carteira pela régua</CardTitle>
        <CardDescription>
          {formatCount(total)} assinatura(s) · +{formatCount(summary.newThisMonth)} no mês · {formatCount(summary.canceledThisMonth)} cancelada(s) no mês
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {total > 0 ? (
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Distribuição das assinaturas por situação">
            {counts
              .filter(item => item.value > 0)
              .map(item => (
                <div
                  key={item.key}
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', item.className)}
                  style={{ width: `${(item.value / total) * 100}%` }}
                  title={`${item.label}: ${item.value}`}
                />
              ))}
          </div>
        ) : (
          <div className="h-3 w-full rounded-full bg-muted" />
        )}
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          {counts.map(item => (
            <li key={item.key} className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', item.className)} />
              <span className="text-muted-foreground">{item.label}</span>
              <span className="ml-auto font-semibold tabular-nums text-foreground">{item.value}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Vidas faturáveis</p>
            <p className="text-lg font-semibold text-foreground">{formatCount(summary.totalLives)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Acima do limite (upgrade)</p>
            <p className={cn('text-lg font-semibold', summary.extraLives > 0 ? 'text-amber-600' : 'text-foreground')}>
              {formatCount(summary.extraLives)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AttentionCard({ version }: { version: number }) {
  const list = useConsoleData(() => listPlatformSubscriptionsAction({ page: 1, perPage: 100 }), [version])
  const rows = useMemo(
    () =>
      (list.data?.items ?? [])
        .filter((sub: PlatformSubscription) => sub.status !== 'active' && sub.status !== 'canceled')
        .sort((a, b) => b.daysLate - a.daysLate)
        .slice(0, 6),
    [list.data],
  )

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Precisam de atenção</CardTitle>
        <CardDescription>Assinaturas fora do “em dia”, do maior atraso para o menor.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {list.error && !list.data ? (
          <div className="px-6 pb-6">
            <LoadError message={list.error} onRetry={() => list.reload()} />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            {list.loading ? 'Carregando…' : 'Nenhuma assinatura em atraso. A régua não tem nada para fazer agora.'}
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {rows.map(sub => (
              <li key={sub.id}>
                <Link href={`/admin/financeiro/assinaturas/${sub.id}`} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{sub.tenantName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBRL(sub.openAmount)} em aberto · {sub.daysLate} dia(s) de atraso
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <SubscriptionStatusPill status={sub.status} />
                    {sub.access.level !== 'full' && <AccessPill access={sub.access} />}
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

export function SummaryTab({
  summary,
  error,
  onRetry,
  version,
}: {
  summary: PlatformBillingSummary | null
  error: string | null
  onRetry: () => void
  version: number
}) {
  if (error && !summary) return <LoadError message={error} onRetry={onRetry} />
  if (!summary) return <KpiSkeleton />

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          accent="primary"
          value={formatBRL(summary.mrr)}
          label="Receita recorrente (MRR)"
          hint={`${formatCount(summary.activeSubscriptions + summary.pastDueSubscriptions + summary.restrictedSubscriptions)} assinatura(s) faturáveis · previsão ${formatBRL(summary.forecastNextMonth)}`}
        />
        <StatCard
          icon={HandCoins}
          accent="success"
          value={formatBRL(summary.receivedThisMonth)}
          label="Recebido no mês"
          hint={
            summary.activationRevenueThisMonth > 0
              ? `Inclui ${formatBRL(summary.activationRevenueThisMonth)} de ativações`
              : 'Confirmado pelo gateway ou por baixa manual'
          }
          tone={summary.receivedThisMonth > 0 ? 'up' : 'neutral'}
        />
        <StatCard
          icon={CalendarClock}
          accent="info"
          value={formatBRL(summary.pendingThisMonth)}
          label="A receber no mês"
          hint="Em aberto, vencendo até o fim do mês"
        />
        <StatCard
          icon={CircleAlert}
          accent="warning"
          value={formatBRL(summary.overdueAmount)}
          label={`Inadimplência · ${formatPercent(summary.delinquencyRate)}`}
          hint={`${formatCount(summary.overdueCharges)} fatura(s) vencida(s) · base: 90 dias`}
          tone={summary.overdueCharges > 0 ? 'down' : 'neutral'}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <MonthlyChart summary={summary} />
        <PortfolioCard summary={summary} />
      </div>

      <AttentionCard version={version} />

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        Só inquilinos com assinatura de plataforma entram nestes números. Contratos fora da cobrança automática (ex.: MepCard) nunca
        são restringidos.
      </p>
    </div>
  )
}
