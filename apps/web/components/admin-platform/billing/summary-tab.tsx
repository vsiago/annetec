'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Building2, CircleAlert, CircleCheckBig, Receipt, RotateCcw, Table2, TrendingUp, Wallet } from 'lucide-react'
import { daysBetweenDates, type PlatformBillingSummary, type PlatformCharge, type PlatformSubscription } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EntityAvatar } from '@/components/admin-platform/ui/entity-avatar'
import { useClubColors } from '@/components/admin-platform/ui/use-club-colors'
import { KpiCard, type KpiDelta } from '@/components/admin-platform/ui/kpi-card'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { KpiSkeleton, LoadError, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { LivesTerm, openableRowProps, pluralize } from '@/components/admin-platform/billing/billing-bits'
import { ChargeActionsMenu, chargeCapabilities, useChargeActions } from '@/components/admin-platform/billing/charge-actions'
import { ChargeDetailSheet } from '@/components/admin-platform/billing/charge-detail-sheet'
import { listPlatformChargesAction, listPlatformSubscriptionsAction } from '@/lib/actions/platform-billing-api'
import type { ConsoleActionResult } from '@/lib/adapters/platform-console'
import {
  formatBRL,
  formatBRLCompact,
  formatCount,
  formatDateBR,
  formatMonthShort,
  formatPercent,
  periodRange,
  todaySP,
} from '@/lib/adapters/platform-console'
import { cn } from '@/lib/utils'

/**
 * Resumo do Financeiro: quatro números com contexto (do `/platform/billing/resumo`,
 * fórmulas no blueprint §0.4), o previsto × recebido de 6 meses, os clubes por
 * situação de pagamento e as faturas em atraso com as ações do dia a dia.
 * Nenhum número é inventado: a variação contra o mês anterior sai da própria
 * série `monthly`, e a contagem de faturas a receber vem da lista de faturas.
 */

/**
 * Cores do gráfico (ordem fixa): previsto em azul-marinho claro, em atraso no
 * vermelho escuro das situações do console e recebido em azul-marinho (a cor
 * principal da marca). O mês atual ganha a marca em coral sob o nome do mês.
 */
const SERIES = [
  { key: 'faturado', label: 'Previsto', color: '#7F92BD' },
  { key: 'vencido', label: 'Em atraso', color: '#B42318' },
  { key: 'recebido', label: 'Recebido', color: '#1E2A4A' },
] as const

const CURRENT_MONTH_COLOR = '#E84364'

/** Nome do mês no eixo; o do mês atual em negrito, com um traço coral embaixo. */
function MonthTick({
  x,
  y,
  payload,
  current,
}: {
  x?: number
  y?: number
  payload?: { value?: string }
  current?: string
}) {
  const isCurrent = payload?.value === current
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fontSize={12}
        fontWeight={isCurrent ? 700 : 400}
        fill={isCurrent ? '#1E2A4A' : '#475467'}
      >
        {payload?.value}
      </text>
      {isCurrent ? <rect x={-9} y={22} width={18} height={3} rx={1.5} fill={CURRENT_MONTH_COLOR} /> : null}
    </g>
  )
}

type Point = { month: string; label: string; faturado: number; vencido: number; recebido: number }

/** `2026-10` → "outubro". */
function monthName(month: string | undefined): string {
  const match = month ? /^(\d{4})-(\d{2})/.exec(month) : null
  if (!match) return ''
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' })
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// ---------------------------------------------------------------------------
// Quatro números
// ---------------------------------------------------------------------------

/** Variação contra o mês anterior, no formato do `KpiCard` (a seta e a cor vêm do próprio cartão). */
function changeDelta(change: number): KpiDelta {
  const rounded = Math.round(Math.abs(change))
  if (rounded === 0) return { text: 'estável', tone: 'neutral' }
  return change > 0
    ? { text: `+${formatPercent(rounded, 0)}`, tone: 'up' }
    : { text: `-${formatPercent(rounded, 0)}`, tone: 'down' }
}

/** Segunda linha, menor, dentro da dica de um KpiCard. */
function HintNote({ children }: { children: ReactNode }) {
  return <span className="mt-1 block text-xs">{children}</span>
}

function KpiRow({ summary, version, overdueClubs }: { summary: PlatformBillingSummary; version: number; overdueClubs: number | null }) {
  const today = todaySP()
  const { to: monthEnd } = periodRange('this_month')
  const pending = useConsoleData(
    () => listPlatformChargesAction({ status: 'pending', from: today, to: monthEnd, page: 1, perPage: 1 }),
    [version, today, monthEnd],
  )

  const months = summary.monthly
  const current = months[months.length - 1]
  const previous = months.length >= 2 ? months[months.length - 2] : undefined
  const currentName = monthName(current?.month) || monthName(today)
  const previousName = monthName(previous?.month)
  const previousReceived = previous?.received ?? 0
  const change = previousReceived > 0 ? ((summary.receivedThisMonth - previousReceived) / previousReceived) * 100 : null

  const pendingCount = pending.data?.meta.total ?? null
  const billableClubs = summary.activeSubscriptions + summary.pastDueSubscriptions + summary.restrictedSubscriptions
  const overdueLine =
    summary.overdueCharges === 0
      ? 'nenhuma fatura em atraso'
      : `${pluralize(summary.overdueCharges, 'fatura', 'faturas')}${overdueClubs ? ` de ${pluralize(overdueClubs, 'clube', 'clubes')}` : ''}`

  const receivedContext =
    change !== null
      ? `contra ${previousName} (${formatBRL(previousReceived)})`
      : previousName
        ? `nada recebido em ${previousName} para comparar`
        : null
  const hasReceivedHint = receivedContext !== null || summary.activationRevenueThisMonth > 0

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon={<Wallet />}
        accent="green"
        trend={months.map(month => month.received)}
        label={`Recebido em ${currentName}`}
        value={formatBRL(summary.receivedThisMonth)}
        delta={change !== null ? changeDelta(change) : undefined}
        hint={
          hasReceivedHint ? (
            <>
              {receivedContext}
              {summary.activationRevenueThisMonth > 0 && (
                <HintNote>
                  Inclui {formatBRL(summary.activationRevenueThisMonth)} de clubes novos (adesão e primeira mensalidade)
                </HintNote>
              )}
            </>
          ) : undefined
        }
      />

      <KpiCard
        icon={<Receipt />}
        accent="blue"
        label={`A receber até ${formatDateBR(monthEnd).slice(0, 5)}`}
        value={formatBRL(summary.pendingThisMonth)}
        hint={
          pendingCount === null
            ? 'faturas que vencem até o fim do mês'
            : pendingCount === 0
              ? 'nenhuma fatura no prazo'
              : `${pluralize(pendingCount, 'fatura', 'faturas')} no prazo`
        }
      />

      <KpiCard
        icon={<CircleAlert />}
        accent="red"
        trend={months.map(month => month.overdue)}
        label="Em atraso"
        value={formatBRL(summary.overdueAmount)}
        tone={summary.overdueAmount > 0 ? 'danger' : 'default'}
        hint={
          <>
            {overdueLine}
            {summary.delinquencyRate > 0 && (
              <HintNote>{formatPercent(summary.delinquencyRate)} do faturado nos últimos 90 dias</HintNote>
            )}
          </>
        }
      />

      <KpiCard
        icon={<TrendingUp />}
        accent="navy"
        label="Receita mensal"
        value={formatBRL(summary.mrr)}
        hint={`soma das mensalidades ${billableClubs === 1 ? 'do clube ativo' : `dos ${formatCount(billableClubs)} clubes ativos`}`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Gráfico de 6 meses
// ---------------------------------------------------------------------------

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { dataKey?: string | number; value?: number }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="min-w-44 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-md">
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
    <SectionCard
      title="Previsto e recebido nos últimos 6 meses"
      description="Previsto e em atraso contam pelo mês de vencimento; recebido, pelo mês do pagamento. O último mês é o atual, até hoje."
      icon={BarChart3}
      iconTone="green"
      actions={
        hasData ? (
          <Button
            variant="ghost"
            className="min-h-10 gap-1.5 rounded-[10px] px-3.5 font-semibold"
            onClick={() => setShowTable(value => !value)}
          >
            <Table2 className="h-4 w-4" aria-hidden="true" />
            {showTable ? 'Ver gráfico' : 'Ver tabela'}
          </Button>
        ) : undefined
      }
    >
      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          satellites={[Receipt, Wallet]}
          size="sm"
          title="Ainda sem faturas"
          description="O gráfico aparece com a primeira fatura de um clube (adesão ou mensalidade)."
        />
      ) : showTable ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <DataTable caption="Previsto, em atraso e recebido por mês, em reais" minWidth="min-w-[480px]" framed={false}>
            <thead>
              <tr>
                <Th>Mês</Th>
                {SERIES.map(series => (
                  <Th key={series.key} align="right">
                    {series.label}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map(point => (
                <Tr key={point.month}>
                  <Td className="text-foreground">{point.label}</Td>
                  {SERIES.map(series => (
                    <Td key={series.key} align="right" className="tabular-nums text-foreground">
                      {formatBRL(point[series.key])}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </DataTable>
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
          <div className="h-64" role="img" aria-label="Gráfico de colunas: previsto, em atraso e recebido por mês, em reais">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={2} barCategoryGap="24%">
                <CartesianGrid vertical={false} stroke="#EAEEF4" strokeDasharray="4 4" strokeWidth={1} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: '#D0D5DD' }}
                  height={34}
                  tick={<MonthTick current={data[data.length - 1]?.label} />}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickCount={4}
                  tick={{ fontSize: 12, fill: '#475467' }}
                  tickFormatter={value => formatBRLCompact(Number(value))}
                />
                <Tooltip cursor={{ fill: 'rgba(30,42,74,0.05)', radius: 8 }} content={<ChartTooltip />} />
                {SERIES.map(series => (
                  <Bar
                    key={series.key}
                    dataKey={series.key}
                    name={series.label}
                    fill={series.color}
                    radius={[5, 5, 0, 0]}
                    maxBarSize={26}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Clubes por situação de pagamento
// ---------------------------------------------------------------------------

const STATUS_BAR: { key: keyof PlatformBillingSummary; label: string; className: string }[] = [
  { key: 'activeSubscriptions', label: 'Em dia', className: 'bg-emerald-500' },
  { key: 'pastDueSubscriptions', label: 'Em atraso', className: 'bg-amber-400' },
  { key: 'restrictedSubscriptions', label: 'Somente leitura', className: 'bg-orange-500' },
  { key: 'suspendedSubscriptions', label: 'Bloqueados', className: 'bg-[#B42318]' },
  { key: 'canceledSubscriptions', label: 'Cancelados', className: 'bg-slate-400' },
]

function PortfolioCard({ summary }: { summary: PlatformBillingSummary }) {
  const counts = STATUS_BAR.map(item => ({ ...item, value: Number(summary[item.key] ?? 0) }))
  const total = counts.reduce((acc, item) => acc + item.value, 0)
  return (
    <SectionCard
      title="Clubes por situação de pagamento"
      description={
        <>
          {pluralize(total, 'clube', 'clubes')} · {pluralize(summary.newThisMonth, 'novo', 'novos')} no mês ·{' '}
          {pluralize(summary.canceledThisMonth, 'cancelamento', 'cancelamentos')} no mês
        </>
      }
      icon={Building2}
    >
      <div className="flex flex-col gap-4">
        {total > 0 ? (
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Distribuição dos clubes por situação de pagamento">
            {counts
              .filter(item => item.value > 0)
              .map(item => (
                <div
                  key={item.key}
                  className={cn('h-full first:rounded-l-full last:rounded-r-full', item.className)}
                  style={{ width: `${(item.value / total) * 100}%` }}
                  title={`${item.label}: ${pluralize(item.value, 'clube', 'clubes')}`}
                />
              ))}
          </div>
        ) : (
          <div className="h-3 w-full rounded-full bg-muted" />
        )}
        <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-2 p-0 text-sm sm:grid-cols-3">
          {counts.map(item => (
            <li key={item.key} className="flex items-center gap-2">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', item.className)} aria-hidden="true" />
              <span className="text-muted-foreground">{item.label}</span>
              <span className="ml-auto font-semibold tabular-nums text-foreground">{item.value}</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
          <div>
            <p className="m-0 text-xs text-muted-foreground">
              Total de <LivesTerm />
            </p>
            <p className="m-0 text-lg font-semibold text-foreground">{formatCount(summary.totalLives)}</p>
          </div>
          <div>
            <p className="m-0 text-xs text-muted-foreground">
              <LivesTerm className="capitalize">vidas</LivesTerm> acima do limite do plano
            </p>
            <p className={cn('m-0 text-lg font-semibold', summary.extraLives > 0 ? 'text-[#B54708]' : 'text-foreground')}>
              {formatCount(summary.extraLives)}
            </p>
            {summary.extraLives > 0 && <p className="m-0 text-[11px] text-muted-foreground">clubes que podem mudar de plano</p>}
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Precisam de atenção
// ---------------------------------------------------------------------------

const ATTENTION_ROWS = 8

interface AttentionData {
  charges: PlatformCharge[]
  /** Assinatura de cada clube (pela organização), para mostrar o acesso do painel. */
  subscriptions: Map<string, PlatformSubscription>
}

function referenceLabel(charge: PlatformCharge, thisYear: string): string {
  if (charge.kind === 'activation') return 'Ativação'
  if (charge.kind === 'adjustment') return 'Avulsa'
  const month = capitalize(monthName(charge.periodStart ?? charge.dueDate))
  const year = (charge.periodStart ?? charge.dueDate).slice(0, 4)
  return year === thisYear ? month : `${month}/${year.slice(2)}`
}

function accessText(subscription: PlatformSubscription | undefined): string {
  if (!subscription) return 'Sem assinatura ativa'
  switch (subscription.access.level) {
    case 'blocked':
      return 'Painel bloqueado'
    case 'read_only':
      return 'Painel em somente leitura'
    default:
      return 'Painel completo'
  }
}

function AttentionSection({
  version,
  canSimulate,
  defaultDueDays,
  onChanged,
  onSeeAll,
  onOverdueClubs,
}: {
  version: number
  canSimulate: boolean
  defaultDueDays?: number
  onChanged?: () => void
  onSeeAll: () => void
  onOverdueClubs: (clubs: number | null, listed: number) => void
}) {
  const [localVersion, setLocalVersion] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const colorOf = useClubColors()
  const today = todaySP()

  const attention = useConsoleData<AttentionData>(async (): Promise<ConsoleActionResult<AttentionData>> => {
    const [overdue, failed, subs] = await Promise.all([
      listPlatformChargesAction({ status: 'overdue', page: 1, perPage: 200 }),
      listPlatformChargesAction({ status: 'failed', page: 1, perPage: 200 }),
      listPlatformSubscriptionsAction({ page: 1, perPage: 200 }),
    ])
    if (!overdue.success) return overdue
    if (!failed.success) return failed
    const charges = [...overdue.data.items, ...failed.data.items]
      .filter(charge => charge.dueDate < today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    const subscriptions = new Map<string, PlatformSubscription>()
    if (subs.success) for (const sub of subs.data.items) subscriptions.set(sub.organizationId, sub)
    const clubs = new Set(charges.map(charge => charge.organizationId ?? charge.id)).size
    onOverdueClubs(clubs, charges.length)
    return { success: true, data: { charges, subscriptions } }
  }, [version, localVersion, today])

  const actions = useChargeActions({
    defaultDueDays,
    onChanged: () => {
      setLocalVersion(value => value + 1)
      onChanged?.()
    },
  })

  const rows = useMemo(() => (attention.data?.charges ?? []).slice(0, ATTENTION_ROWS), [attention.data])
  const hidden = (attention.data?.charges.length ?? 0) - rows.length
  const thisYear = today.slice(0, 4)

  return (
    <div className="min-w-0">
      <SectionCard
        id="atencao"
        title="Precisam de atenção"
        description="Faturas em atraso, da mais antiga para a mais recente."
        icon={CircleAlert}
        iconTone="red"
        padded={false}
        className="overflow-hidden"
        actions={
          <Button variant="link" className="h-10 px-0 font-semibold" onClick={onSeeAll}>
            Ver todas as faturas
          </Button>
        }
      >
        {attention.error && !attention.data ? (
          <LoadError message={attention.error} onRetry={() => attention.reload()} framed={false} />
        ) : attention.loading && !attention.data ? (
          <TableSkeleton rows={3} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CircleCheckBig}
            tone="success"
            title="Nenhuma fatura em atraso"
            description="Todos os clubes estão com as faturas em dia por enquanto."
          />
        ) : (
          <div className={attention.loading ? 'opacity-60 transition-opacity' : undefined}>
            <DataTable
              caption="Faturas em atraso, da mais antiga para a mais recente"
              minWidth="min-w-[560px] md:min-w-[880px]"
              framed={false}
            >
              <thead>
                <tr>
                  <Th>Clube</Th>
                  <Th className="hidden md:table-cell">Referente a</Th>
                  <Th className="hidden md:table-cell">Venceu em</Th>
                  <Th align="right">Valor</Th>
                  <Th>Situação</Th>
                  <Th align="right">Ações</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(charge => {
                  const can = chargeCapabilities(charge, canSimulate)
                  const days = daysBetweenDates(charge.dueDate, today)
                  return (
                    <Tr key={charge.id} {...openableRowProps(() => setDetailId(charge.id))}>
                      <Td>
                        <div className="flex min-w-0 items-center gap-3">
                          <EntityAvatar
                            name={charge.tenantName ?? 'Nova contratação'}
                            color={colorOf(charge.organizationId)}
                            size="sm"
                          />
                          <div className="min-w-0 max-w-60">
                            <p className="m-0 truncate font-semibold text-foreground">{charge.tenantName ?? 'Nova contratação'}</p>
                            <p className="m-0 truncate text-xs text-muted-foreground">
                              {accessText(charge.organizationId ? attention.data?.subscriptions.get(charge.organizationId) : undefined)}
                            </p>
                          </div>
                        </div>
                      </Td>
                      <Td className="hidden md:table-cell">
                        <span className="whitespace-nowrap text-foreground">{referenceLabel(charge, thisYear)}</span>
                      </Td>
                      <Td className="hidden md:table-cell">
                        <span className="whitespace-nowrap tabular-nums text-foreground">{formatDateBR(charge.dueDate)}</span>
                      </Td>
                      <Td align="right">
                        <span className="whitespace-nowrap font-medium tabular-nums text-foreground">{formatBRL(charge.amount)}</span>
                      </Td>
                      <Td>
                        <div className="flex flex-col items-start gap-1">
                          <span className="inline-flex whitespace-nowrap rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-[#B42318] dark:bg-red-500/15 dark:text-red-300">
                            Atrasada há {pluralize(days, 'dia', 'dias')}
                          </span>
                          {charge.status === 'failed' && <span className="text-xs text-muted-foreground">Cartão recusado</span>}
                        </div>
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-2">
                          {can.reissue ? (
                            <Button
                              variant="outline"
                              className="h-10 gap-1.5 rounded-[10px] px-3.5 font-semibold"
                              onClick={event => {
                                event.stopPropagation()
                                actions.open('reissue', charge)
                              }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                              Emitir segunda via
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              className="h-10 rounded-[10px] px-3.5 font-semibold"
                              onClick={event => {
                                event.stopPropagation()
                                setDetailId(charge.id)
                              }}
                            >
                              Ver histórico da fatura
                            </Button>
                          )}
                          <ChargeActionsMenu
                            charge={charge}
                            canSimulate={canSimulate}
                            onAction={actions.open}
                            onDetail={item => setDetailId(item.id)}
                          />
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </DataTable>
            {hidden > 0 && (
              <p className="m-0 border-t border-border px-6 py-3 text-sm text-muted-foreground">
                Mostrando as {ATTENTION_ROWS} mais antigas.{' '}
                <button
                  type="button"
                  className="rounded-sm font-medium text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary"
                  onClick={onSeeAll}
                >
                  Ver as outras {hidden} em Faturas
                </button>
              </p>
            )}
          </div>
        )}
      </SectionCard>

      <ChargeDetailSheet
        chargeId={detailId}
        version={localVersion + version}
        canSimulate={canSimulate}
        onClose={() => setDetailId(null)}
        onAction={actions.open}
      />
      {actions.dialogs}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Aba
// ---------------------------------------------------------------------------

export function SummaryTab({
  summary,
  error,
  onRetry,
  version,
  canSimulate = false,
  defaultDueDays,
  onChanged,
  onSeeAllCharges,
}: {
  summary: PlatformBillingSummary | null
  error: string | null
  onRetry: () => void
  version: number
  /** Só `true` quando o servidor diz que é demonstração: libera "Simular pagamento". */
  canSimulate?: boolean
  defaultDueDays?: number
  /** Uma fatura mudou: o pai recarrega os números do resumo. */
  onChanged?: () => void
  /** "Ver todas as faturas": leva para a aba Faturas. */
  onSeeAllCharges: () => void
}) {
  const [overdueClubs, setOverdueClubs] = useState<{ clubs: number | null; listed: number }>({ clubs: null, listed: 0 })

  if (error && !summary) return <LoadError message={error} onRetry={onRetry} />
  if (!summary) {
    return (
      <div className="flex flex-col gap-6">
        <KpiSkeleton />
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <SectionCard>
            <SectionSkeleton rows={6} label="Carregando o resumo do financeiro…" />
          </SectionCard>
          <SectionCard>
            <SectionSkeleton rows={6} label="Carregando os clubes por situação…" />
          </SectionCard>
        </div>
      </div>
    )
  }

  // Só mostra "de N clubes" quando a lista cobre todas as faturas em atraso do resumo.
  const clubsForKpi = overdueClubs.listed === summary.overdueCharges ? overdueClubs.clubs : null

  return (
    <div className="flex flex-col gap-6">
      <KpiRow summary={summary} version={version} overdueClubs={clubsForKpi} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <MonthlyChart summary={summary} />
        <PortfolioCard summary={summary} />
      </div>

      <AttentionSection
        version={version}
        canSimulate={canSimulate}
        defaultDueDays={defaultDueDays}
        onChanged={onChanged}
        onSeeAll={onSeeAllCharges}
        onOverdueClubs={(clubs, listed) =>
          setOverdueClubs(current => (current.clubs === clubs && current.listed === listed ? current : { clubs, listed }))
        }
      />

      <p className="m-0 text-xs text-muted-foreground">
        Estes números só incluem clubes que pagam a ANNETEC pela plataforma. Contratos fora da cobrança automática (como o MepCard)
        nunca são restringidos.
      </p>
    </div>
  )
}
