'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight, Landmark, RefreshCw } from 'lucide-react'
import type { HoldingOverview } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getHoldingOverviewAction } from '@/lib/actions/holding-api'
import { HOLDING_DEFAULT_MONTHS, describeError, formatBRL, formatInt, formatPct } from '@/lib/adapters/holding'
import { cn } from '@/lib/utils'
import { FormulaHint, TrendDelta } from './holding-ui'
import { useResource } from './use-resource'

function growthPct(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

/**
 * Card "Receita recorrente da plataforma" do dashboard `/admin` (§Q5): o MRR
 * REAL das assinaturas de plataforma (o mesmo `mrr` de
 * `/platform/billing/resumo`), o recebido no mês e a inadimplência com a
 * ANNETEC, com atalho para a holding. Usa a visão geral da holding com o
 * mesmo período da tela da holding para aproveitar o cache da API.
 */
export function PlatformRecurringRevenueCard({ className }: { className?: string }) {
  const [overview, load] = useResource<HoldingOverview>()

  useEffect(() => {
    load(() => getHoldingOverviewAction({ meses: HOLDING_DEFAULT_MONTHS }))
  }, [load])

  const k = overview.data?.kpis

  return (
    <Card className={cn('gap-0 border-0 py-0 shadow-sm', className)}>
      <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="rounded-lg bg-accent p-3">
            <Landmark className="h-5 w-5 text-secondary" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm text-muted-foreground">Receita recorrente da plataforma</p>
              <FormulaHint>
                MRR = Σ mensalidade estimada (plano + vidas excedentes) das assinaturas de plataforma em dia, em atraso ou
                restritas — o que a ANNETEC fatura por mês na cobrança automática. Contratos sem assinatura de plataforma
                aparecem à parte, pelo preço de tabela.
              </FormulaHint>
            </div>
            {k ? (
              <>
                <p className="text-3xl font-semibold tracking-tight text-foreground">
                  {formatBRL(k.platformMrr)}
                  <span className="ml-1 text-base font-normal text-muted-foreground">/mês</span>
                </p>
                {k.legacyMrrEstimate > 0 && (
                  <p className="text-xs text-muted-foreground">
                    + {formatBRL(k.legacyMrrEstimate)}/mês em contratos fora da cobrança automática (tabela)
                  </p>
                )}
              </>
            ) : overview.error ? (
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span title={describeError(overview.error).technical ?? undefined}>
                  Não foi possível carregar: {describeError(overview.error).message}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => load(() => getHoldingOverviewAction({ meses: HOLDING_DEFAULT_MONTHS }))}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Tentar de novo
                </Button>
              </div>
            ) : (
              <Skeleton className="h-9 w-48" />
            )}
          </div>
        </div>

        {k && (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Recebido no mês</dt>
              <dd className="font-medium text-foreground">{formatBRL(k.platformReceivedThisMonth)}</dd>
              <dd>
                <TrendDelta
                  value={growthPct(k.platformReceivedThisMonth, k.platformReceivedLastMonth)}
                  suffix="vs mês anterior"
                />
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Inadimplência com a ANNETEC</dt>
              <dd className="font-medium text-foreground">{formatPct(k.platformDelinquencyRate)}</dd>
              <dd className="text-xs text-muted-foreground">{formatBRL(k.platformOverdueAmount)} vencido</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Na cobrança automática</dt>
              <dd className="font-medium text-foreground">
                {formatInt(k.tenantsManaged)} de {formatInt(k.tenantsTotal)} clubes
              </dd>
              <dd className="text-xs text-muted-foreground">
                {formatInt(k.tenantsByAccess.read_only + k.tenantsByAccess.blocked)} com painel restrito
              </dd>
            </div>
          </dl>
        )}

        <Button asChild variant="outline" size="sm" className="self-start lg:self-center">
          <Link href="/admin/inquilinos">
            Ver os clubes
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
