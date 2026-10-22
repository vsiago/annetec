'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Building2, HeartPulse, Landmark, ScrollText, Store } from 'lucide-react'
import type { HoldingAlert, HoldingCohortLevel, HoldingCohorts, HoldingOverview, HoldingTenantRow, TenantHealthBand } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertsFeed } from '@/components/holding/alerts-feed'
import { CohortHeatmap } from '@/components/holding/cohort-heatmap'
import { ChurnChart, FlowChart, GmvChart, PlatformRevenueChart } from '@/components/holding/holding-charts'
import { HealthDistribution } from '@/components/holding/health'
import { FormulaHint, HoldingToolbar, KpiTile, MiniStat, SectionError, TrendDelta } from '@/components/holding/holding-ui'
import { TenantsTable } from '@/components/holding/tenants-table'
import { useResource } from '@/components/holding/use-resource'
import {
  getHoldingCohortsAction,
  getHoldingOverviewAction,
  listHoldingAlertsAction,
  listHoldingTenantsAction,
} from '@/lib/actions/holding-api'
import {
  DEFAULT_TENANT_FILTERS,
  HOLDING_DEFAULT_MONTHS,
  formatBRL,
  formatInt,
  formatPct,
  type HoldingTenantFilters,
} from '@/lib/adapters/holding'
import { cn } from '@/lib/utils'

/**
 * HOLDING ANNETEC (§Q5) — console de inteligência estratégica e controle da
 * carteira de suboperadoras. Poucos números grandes no topo, o detalhe
 * abaixo: KPIs consolidados → churn/inadimplência nos dois níveis e funil →
 * séries mensais → saúde e alertas → ranking → coortes. Tudo vem calculado
 * pela API (§0.5, cache de 60 s); "Atualizar agora" força `?fresh=1`.
 */

const signedInt = (value: number) => `${value > 0 ? '+' : ''}${formatInt(value)}`

function growthPct(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export default function HoldingPage() {
  const [meses, setMeses] = useState<number>(HOLDING_DEFAULT_MONTHS)
  const [cohortLevel, setCohortLevel] = useState<HoldingCohortLevel>('associado')
  const [filters, setFilters] = useState<HoldingTenantFilters>(DEFAULT_TENANT_FILTERS)
  const [refreshing, setRefreshing] = useState(false)

  const [overview, loadOverview] = useResource<HoldingOverview>()
  const [tenants, loadTenants] = useResource<HoldingTenantRow[]>()
  const [alerts, loadAlerts] = useResource<HoldingAlert[]>()
  const [cohorts, loadCohorts] = useResource<HoldingCohorts>()

  const fetchOverview = useCallback(
    (fresh?: boolean) => loadOverview(() => getHoldingOverviewAction({ meses, fresh })),
    [loadOverview, meses],
  )
  const fetchTenants = useCallback((fresh?: boolean) => loadTenants(() => listHoldingTenantsAction({ fresh })), [loadTenants])
  const fetchAlerts = useCallback((fresh?: boolean) => loadAlerts(() => listHoldingAlertsAction({ fresh })), [loadAlerts])
  const fetchCohorts = useCallback(
    (fresh?: boolean) => loadCohorts(() => getHoldingCohortsAction(cohortLevel, { meses, fresh })),
    [loadCohorts, cohortLevel, meses],
  )

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  useEffect(() => {
    fetchTenants()
    fetchAlerts()
  }, [fetchTenants, fetchAlerts])

  useEffect(() => {
    fetchCohorts()
  }, [fetchCohorts])

  const refreshAll = async () => {
    setRefreshing(true)
    await Promise.all([fetchOverview(true), fetchTenants(true), fetchAlerts(true), fetchCohorts(true)])
    setRefreshing(false)
  }

  const selectBand = (band: TenantHealthBand | 'all') => {
    setFilters(current => ({ ...current, band }))
    if (band !== 'all') document.getElementById('ranking')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const data = overview.data
  const k = data?.kpis
  const kpiLoading = !k && overview.loading
  const dimmed = overview.loading && data !== null

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Holding ANNETEC</p>
          <h1 className="text-2xl font-bold text-foreground">Inteligência da carteira</h1>
          <p className="text-sm text-muted-foreground">
            Receita, crescimento, saúde e controle de todas as suboperadoras em um só lugar
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HoldingToolbar
            meses={meses}
            onMesesChange={setMeses}
            onRefresh={refreshAll}
            refreshing={refreshing}
            generatedAt={data?.generatedAt}
            cached={data?.cached}
          />
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/holding/auditoria">
              <ScrollText className="h-4 w-4" />
              Auditoria
            </Link>
          </Button>
        </div>
      </div>

      {overview.error && (
        <SectionError
          title={data ? 'Não foi possível atualizar os indicadores' : 'Não foi possível carregar os indicadores'}
          message={overview.error}
          onRetry={() => fetchOverview()}
        />
      )}

      {(k || kpiLoading) && (
        <div className={cn('space-y-6', dimmed && 'opacity-60 transition-opacity')}>
          {/* Destaques */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              label="Receita recorrente da plataforma"
              icon={Landmark}
              loading={kpiLoading}
              value={k ? formatBRL(k.platformMrr) : null}
              formula="MRR = Σ mensalidade estimada (plano + vidas excedentes, pela cotação do plano) das assinaturas de plataforma em dia, em atraso ou restritas. Contratos sem assinatura de plataforma ficam à parte, pelo preço de tabela."
            >
              {k && (
                <>
                  <p className="flex flex-wrap items-center gap-x-1.5">
                    Recebido no mês: <span className="font-medium text-foreground">{formatBRL(k.platformReceivedThisMonth)}</span>
                    <TrendDelta value={growthPct(k.platformReceivedThisMonth, k.platformReceivedLastMonth)} suffix="vs mês anterior" />
                  </p>
                  {k.legacyMrrEstimate > 0 && (
                    <p>
                      + {formatBRL(k.legacyMrrEstimate)}/mês em contratos fora da cobrança automática (tabela)
                    </p>
                  )}
                </>
              )}
            </KpiTile>

            <KpiTile
              label="Receita dos clubes (GMV) no mês"
              icon={Store}
              loading={kpiLoading}
              value={k ? formatBRL(k.gmvThisMonth) : null}
              delta={k ? <TrendDelta value={k.gmvGrowthPct} suffix="vs mês anterior" /> : undefined}
              formula="GMV = Σ valor pago das cobranças dos associados de todos os clubes no mês corrente (até hoje, fuso de São Paulo). Crescimento = (mês − mês anterior) ÷ mês anterior × 100. Recorrência = Σ mensalidade das assinaturas de associados ativas ou em atraso."
            >
              {k && (
                <>
                  <p>
                    Mês anterior: <span className="font-medium text-foreground">{formatBRL(k.gmvLastMonth)}</span>
                  </p>
                  <p>
                    Recorrência contratada dos clubes: <span className="font-medium text-foreground">{formatBRL(k.clubMrr)}</span>/mês
                  </p>
                </>
              )}
            </KpiTile>

            <KpiTile
              label="Vidas totais"
              icon={HeartPulse}
              loading={kpiLoading}
              value={k ? formatInt(k.totalLives) : null}
              delta={k ? <TrendDelta value={k.livesAddedThisMonth} format={signedInt} suffix="no mês" /> : undefined}
              formula="Vida = titular ou dependente de assinatura de clube ativa ou em atraso (espelhos da Digital Saúde não contam). Crescimento líquido = (assinaturas novas − canceladas no mês) ÷ assinaturas vivas no início do mês × 100."
            >
              {k && (
                <p className="flex flex-wrap items-center gap-x-1.5">
                  Crescimento líquido da base: <TrendDelta value={k.memberNetGrowthPct} />
                </p>
              )}
            </KpiTile>

            <KpiTile
              label="Inquilinos"
              icon={Building2}
              loading={kpiLoading}
              value={k ? formatInt(k.tenantsTotal) : null}
              delta={k ? <TrendDelta value={k.tenantsNewThisMonth} format={signedInt} suffix="no mês" /> : undefined}
              formula="Inquilinos operadores não cancelados. Na cobrança automática = com assinatura de plataforma não cancelada. Acesso efetivo pela régua de cobrança ou por decisão manual da holding (fora da cobrança automática = completo)."
            >
              {k && (
                <>
                  <p>
                    <span className="font-medium text-foreground">{formatInt(k.tenantsManaged)}</span> na cobrança automática
                  </p>
                  <p>
                    Painel: {formatInt(k.tenantsByAccess.full)} completo · {formatInt(k.tenantsByAccess.read_only)} somente
                    leitura · {formatInt(k.tenantsByAccess.blocked)} bloqueado
                  </p>
                </>
              )}
            </KpiTile>
          </div>

          {/* Detalhe: churn, inadimplência (2 níveis) e funil */}
          <div className="grid gap-4 lg:grid-cols-3">
            <DetailCard
              title="Churn do mês"
              formula="Canceladas no mês ÷ assinaturas vivas no início do mês × 100. Inquilinos: assinaturas de plataforma; associados: assinaturas dos clubes. “—” = sem base no início do mês."
            >
              <MiniStat label="Inquilinos" loading={kpiLoading} value={formatPct(k?.tenantChurnRate)} sub="assinaturas de plataforma" />
              <MiniStat label="Associados" loading={kpiLoading} value={formatPct(k?.memberChurnRate)} sub="assinaturas dos clubes" />
            </DetailCard>

            <DetailCard
              title="Inadimplência (90 dias)"
              formula="Σ vencido em aberto (vencidas ou com falha, vencimento passado) ÷ Σ faturado com vencimento nos últimos 90 dias (exceto canceladas) × 100. Plataforma: faturas da ANNETEC aos inquilinos. Associados: cobranças dos clubes."
            >
              <MiniStat
                label="Com a ANNETEC"
                loading={kpiLoading}
                value={formatPct(k?.platformDelinquencyRate)}
                sub={k ? `${formatBRL(k.platformOverdueAmount)} vencido` : undefined}
              />
              <MiniStat
                label="Dos associados"
                loading={kpiLoading}
                value={formatPct(k?.memberDelinquencyRate)}
                sub={k ? `${formatBRL(k.memberOverdueAmount)} vencido` : undefined}
              />
            </DetailCard>

            <DetailCard
              title="Funil de contratação"
              formula="Em análise = propostas enviadas ou em análise; SLA estourado = enviadas há mais de 48 h. Aguardando pagamento = aprovadas com ativação em aberto. Conversão = propostas ativadas ÷ enviadas nos últimos 90 dias × 100."
              action={
                <Button asChild variant="link" size="sm" className="h-auto px-0 text-xs">
                  <Link href="/admin/compliance">
                    Compliance <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              }
            >
              <MiniStat
                label="Em análise"
                loading={kpiLoading}
                value={formatInt(k?.onboarding.queue)}
                sub={
                  k ? (
                    <span className={cn(k.onboarding.slaBreached > 0 && 'font-medium text-red-700')}>
                      {formatInt(k.onboarding.slaBreached)} com SLA de 48 h estourado
                    </span>
                  ) : undefined
                }
              />
              <MiniStat label="Aguardando pagamento" loading={kpiLoading} value={formatInt(k?.onboarding.awaitingPayment)} />
              <MiniStat label="Ativados no mês" loading={kpiLoading} value={formatInt(k?.onboarding.activatedThisMonth)} />
              <MiniStat label="Conversão 90 dias" loading={kpiLoading} value={formatPct(k?.onboarding.conversionRate90d)} />
            </DetailCard>
          </div>

          {/* Séries mensais */}
          {data ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <PlatformRevenueChart data={data.monthly} />
              <GmvChart data={data.monthly} />
              <FlowChart data={data.monthly} allowTenantLevel />
              <ChurnChart data={data.monthly} />
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Card key={i} className="gap-4 border-0 shadow-sm">
                  <CardHeader>
                    <Skeleton className="h-5 w-40" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-60 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Saúde e alertas */}
      <div className="grid gap-4 lg:grid-cols-3">
        <HealthDistribution
          distribution={data?.healthDistribution ?? null}
          selected={filters.band}
          onSelect={selectBand}
          loading={overview.loading}
          unavailable={!!overview.error}
        />
        <AlertsFeed
          className="lg:col-span-2"
          alerts={alerts.data ?? (alerts.error ? (data?.topAlerts ?? null) : null)}
          loading={alerts.loading}
          error={alerts.error && !data ? alerts.error : null}
          onRetry={() => fetchAlerts()}
        />
      </div>

      <TenantsTable
        rows={tenants.data}
        loading={tenants.loading}
        error={tenants.error}
        onRetry={() => fetchTenants()}
        filters={filters}
        onFiltersChange={setFilters}
      />

      <CohortHeatmap
        data={cohorts.data}
        level={cohortLevel}
        onLevelChange={setCohortLevel}
        loading={cohorts.loading}
        error={cohorts.error}
        onRetry={() => fetchCohorts()}
      />
    </div>
  )
}

function DetailCard({
  title,
  formula,
  action,
  children,
}: {
  title: string
  formula: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="gap-4 border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <FormulaHint>{formula}</FormulaHint>
        </div>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-4">{children}</CardContent>
    </Card>
  )
}
