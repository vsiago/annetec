'use client'

import Link from 'next/link'
import { ArrowRight, BellRing, CircleAlert, HeartPulse, Info, TriangleAlert } from 'lucide-react'
import { HOLDING_ALERT_LABELS, type HoldingAlertSeverity } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Field, LoadError, Pill, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { AccessPill, UsageBar } from '@/components/admin-platform/billing/billing-bits'
import { getTenantHealthAction } from '@/lib/actions/platform-billing-api'
import {
  formatBRL,
  formatCount,
  formatMonthShort,
  formatPercent,
  healthBandMeta,
} from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Aba "Saúde" do inquilino: a nota 0–100 da holding (`computeTenantHealth`),
 * os fatores que descontaram pontos, os alertas ativos e os números que
 * alimentam a nota. A análise completa (séries, coortes, ciclo de vida) fica
 * na holding.
 */

const SEVERITY_ICON: Record<HoldingAlertSeverity, typeof Info> = {
  info: Info,
  warning: TriangleAlert,
  critical: CircleAlert,
}

const SEVERITY_CLASS: Record<HoldingAlertSeverity, string> = {
  info: 'text-sky-600',
  warning: 'text-amber-500',
  critical: 'text-red-600',
}

const BAND_RING: Record<string, string> = {
  healthy: 'border-emerald-500 text-emerald-700 dark:text-emerald-300',
  attention: 'border-amber-500 text-amber-700 dark:text-amber-300',
  risk: 'border-red-500 text-red-700 dark:text-red-300',
}

function trendText(value: number | null): string {
  if (value === null) return 'sem base de comparação'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatPercent(value)} vs. 30 dias anteriores`
}

export function TenantHealthPanel({ tenantId }: { tenantId: string }) {
  const { data, error, loading, reload } = useConsoleData(() => getTenantHealthAction(tenantId), [tenantId])

  if (loading && !data) {
    return (
      <div className="grid gap-4 lg:grid-cols-3" aria-busy="true">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl lg:col-span-2" />
      </div>
    )
  }
  if (error && !data) return <LoadError message={error} onRetry={() => reload()} />
  if (!data) return null

  const t = data.tenant
  const band = healthBandMeta(t.healthBand)
  const months = [...data.monthly].slice(-6)

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="gap-4 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="h-4 w-4 text-muted-foreground" />
              Nota de saúde
            </CardTitle>
            <CardDescription>Começa em 100 e desconta pelos fatores abaixo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  'flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-[6px]',
                  BAND_RING[t.healthBand] ?? 'border-border',
                )}
                role="img"
                aria-label={`Nota ${t.healthScore} de 100, ${band.label}`}
              >
                <span className="text-3xl font-bold leading-none text-foreground">{t.healthScore}</span>
                <span className="text-[11px] text-muted-foreground">de 100</span>
              </div>
              <div className="space-y-1.5">
                <Pill meta={band} />
                <div className="flex flex-wrap gap-1.5">
                  {t.managed ? (
                    <AccessPill access={{ level: t.access, source: data.subscription?.access.source ?? 'billing' }} />
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 dark:bg-slate-500/20 dark:text-slate-300">
                      Não gerenciado
                    </span>
                  )}
                </div>
              </div>
            </div>
            {t.healthFactors.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum fator descontou pontos.</p>
            ) : (
              <ul className="space-y-2">
                {t.healthFactors.map(factor => (
                  <li key={factor.factor} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{factor.detail}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-red-600">{factor.impact}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4 shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">O que alimenta a nota</CardTitle>
            <CardDescription>Últimos 30 dias, calculado na hora pela holding.</CardDescription>
            <CardAction>
              <Button variant="outline" size="sm" className="gap-1.5" asChild>
                <Link href={`/admin/holding/${tenantId}`}>
                  Ver na holding
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Vidas">
              {t.memberLimit ? (
                <UsageBar lives={t.lives} limit={t.memberLimit} pct={t.usagePct ?? 0} />
              ) : (
                `${formatCount(t.lives)} vidas`
              )}
            </Field>
            <Field label="Receita do clube (30 dias)">
              <span className="font-semibold">{formatBRL(t.gmvLast30)}</span>
              <span
                className={cn(
                  'block text-xs',
                  t.salesTrendPct === null ? 'text-muted-foreground' : t.salesTrendPct < 0 ? 'text-red-600' : 'text-emerald-700',
                )}
              >
                {trendText(t.salesTrendPct)}
              </span>
            </Field>
            <Field label="MRR do clube">{formatBRL(t.clubMrr)}</Field>
            <Field label="Novos associados (30 dias)">{formatCount(t.newMembersLast30)}</Field>
            <Field label="Inadimplência dos associados">
              {formatPercent(t.memberDelinquencyRate)}
              <span className="block text-xs text-muted-foreground">há 30 dias: {formatPercent(t.memberDelinquencyRatePrev)}</span>
            </Field>
            <Field label="Com a ANNETEC">
              {t.managed ? (
                <>
                  {formatBRL(t.platformMrr)}/mês
                  <span className={cn('block text-xs', t.platformDaysLate > 0 ? 'text-red-600' : 'text-muted-foreground')}>
                    {t.platformOpenAmount > 0
                      ? `${formatBRL(t.platformOpenAmount)} em aberto${t.platformDaysLate > 0 ? ` · ${t.platformDaysLate} dia(s) de atraso` : ''}`
                      : 'em dia'}
                  </span>
                </>
              ) : (
                'Fora da cobrança automática'
              )}
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="gap-4 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="h-4 w-4 text-muted-foreground" />
              Alertas
            </CardTitle>
            <CardDescription>{data.alerts.length} alerta(s) ativo(s), do mais grave ao mais leve.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.alerts.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum alerta para este inquilino.</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {data.alerts.map(alert => {
                  const Icon = SEVERITY_ICON[alert.severity] ?? Info
                  return (
                    <li key={alert.id} className="flex items-start gap-3 px-6 py-3">
                      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', SEVERITY_CLASS[alert.severity])} aria-label={alert.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{alert.title || HOLDING_ALERT_LABELS[alert.kind]}</p>
                        <p className="text-xs text-muted-foreground">{alert.message}</p>
                      </div>
                      {alert.actionHref && (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={alert.actionHref}>Agir</Link>
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Últimos meses</CardTitle>
            <CardDescription>Receita do clube, movimento de associados e faturamento da ANNETEC.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {months.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Sem histórico ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border bg-muted/40 text-left text-xs text-muted-foreground">
                      <th className="px-6 py-2 font-medium">Mês</th>
                      <th className="px-3 py-2 text-right font-medium">Receita do clube</th>
                      <th className="px-3 py-2 text-right font-medium">Novos</th>
                      <th className="px-3 py-2 text-right font-medium">Cancelados</th>
                      <th className="px-6 py-2 text-right font-medium">ANNETEC recebido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map(point => (
                      <tr key={point.month} className="border-b border-border/60 last:border-0">
                        <td className="px-6 py-2 text-foreground">{formatMonthShort(point.month)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatBRL(point.gmv)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatCount(point.newMembers)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatCount(point.churnedMembers)}</td>
                        <td className="px-6 py-2 text-right tabular-nums text-foreground">{formatBRL(point.platformReceived)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
