'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleCheckBig,
  CreditCard,
  Headset,
  Download,
  Receipt,
  ShieldCheck,
  UserRoundPlus,
  UserSearch,
  UsersRound,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChartCard, chartTooltipStyle } from '@/components/dashboard/chart-card'
import { StatCard } from '@/components/dashboard/stat-card'
import { StatusPill } from '@/components/dashboard/table-controls'
import { saleStatusMeta } from '@/lib/sale-status'
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData, getAllClients } from '@/contexts/tenant-data-context'
import {
  beneficiariesEvolution,
  formatCurrency,
  formatDelta,
  formatMonthLabel,
  lastMonths,
  monthKeyOf,
  percentChange,
  planDistribution,
  summaryMetrics,
} from '@/lib/analytics'
import { useChartColors } from '@/lib/use-chart-colors'
import { cn } from '@/lib/utils'
import { ClubHomeBlock } from '@/components/admin/faturamento/club-home-block'
import { GettingStarted } from '@/components/admin/getting-started'
import { downloadCsv } from '@/lib/download-csv'
import { useActionData } from '@/components/admin/faturamento/use-action-data'
import { getBillingSummaryAction } from '@/lib/actions/faturamento-api'
import { delinquencyPercent, formatBRL, formatPercent } from '@/lib/adapters/faturamento'

interface OperationAlert {
  key: string
  count: number
  label: string
  icon: typeof Receipt
  tone: string
  href: string
}

/** Atendimento que ainda espera a primeira resposta do clube. */
const AWAITING_SUPPORT = new Set(['aguardando'])

export default function AdminDashboard() {
  const { tenant } = useTenant()
  const { users, sales, leads, clientPlans, appointments, isLoading } = useTenantData()
  const colors = useChartColors()
  const [evolutionMonths, setEvolutionMonths] = useState('10')

  const months = useMemo(() => [...lastMonths(12)].reverse(), [])
  const [referenceMonth, setReferenceMonth] = useState(() => months[0]?.key ?? '')

  // Resumo do Clube de Benefícios (cobrança própria): alimenta o bloco do
  // clube, a inadimplência e os alertas de cobrança.
  const slug = tenant?.slug ?? ''
  const clubSummary = useActionData(slug ? () => getBillingSummaryAction(slug) : null, [slug])
  const club = clubSummary.data

  const clients = getAllClients(users)
  const activeClients = clients.filter(c => c.planStatus === 'active')
  const metrics = summaryMetrics(sales, leads, clients, '1m')

  const monthAdmissions = clients.filter(c => monthKeyOf(c.contractDate) === referenceMonth).length
  const referenceIndex = months.findIndex(m => m.key === referenceMonth)
  const previousMonthKey = referenceIndex >= 0 ? months[referenceIndex + 1]?.key : undefined
  const previousAdmissions = previousMonthKey
    ? clients.filter(c => monthKeyOf(c.contractDate) === previousMonthKey).length
    : 0
  const admissionsChange = previousMonthKey ? percentChange(monthAdmissions, previousAdmissions) : null

  // Faturamento de um clube de benefícios é a mensalidade recorrente da
  // carteira vigente, não a soma das adesões novas — por isso soma o preço do
  // plano de quem já estava ativo no fim do mês, e não o valor das vendas.
  const planPrices = new Map(clientPlans.map(plan => [plan.name, plan.priceMonthly]))
  const billedAt = (end: Date) =>
    clients
      .filter(c => c.planStatus !== 'cancelled' && new Date(c.contractDate) <= end)
      .reduce((sum, c) => sum + (planPrices.get(c.plan) ?? 0), 0)

  const reference = months.find(m => m.key === referenceMonth) ?? months[0]
  const referenceEnd = reference
    ? new Date(reference.date.getFullYear(), reference.date.getMonth() + 1, 0, 23, 59, 59)
    : new Date()
  const previousEnd = new Date(referenceEnd.getFullYear(), referenceEnd.getMonth(), 0, 23, 59, 59)
  const estimatedRevenue = billedAt(referenceEnd)
  const estimatedPrevious = billedAt(previousEnd)

  // Valor real: o que o clube recebeu no mês, do resumo de Faturamento (que
  // guarda os últimos 6 meses, "yyyy-MM"). Fora dessa janela, ou sem o resumo,
  // cai na estimativa por preço do plano × contratos — e o rótulo avisa.
  const billingMonthKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  const receivedIn = (date: Date | undefined) =>
    date ? club?.monthly.find(point => point.month === billingMonthKey(date)) : undefined
  const receivedNow = receivedIn(reference?.date)
  const receivedBefore = receivedIn(reference ? new Date(reference.date.getFullYear(), reference.date.getMonth() - 1, 1) : undefined)
  const revenueIsReal = receivedNow !== undefined
  const monthRevenue = receivedNow ? receivedNow.received : estimatedRevenue
  const revenueChange = receivedNow
    ? receivedBefore
      ? percentChange(receivedNow.received, receivedBefore.received)
      : null
    : percentChange(estimatedRevenue, estimatedPrevious)

  const evolution = beneficiariesEvolution(clients, Number(evolutionMonths))
  const hasEvolution = evolution.some(point => point.beneficiarios > 0)

  const planShare = planDistribution(activeClients, colors.palette)
  const planTotal = planShare.reduce((sum, item) => sum + item.value, 0)

  const recentSales = [...sales]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6)

  const base = tenant ? `/${tenant.slug}/admin` : ''

  /**
   * Só o que tem fonte real e destino para resolver: cobranças e assinaturas
   * vêm do resumo de Faturamento; leads e atendimentos, do CRM e da mesa de
   * atendimento. Alerta zerado sai da lista em vez de ocupar espaço.
   */
  const newLeads = leads.filter(lead => lead.status === 'new').length
  const awaitingSupport = appointments.filter(item => AWAITING_SUPPORT.has(item.status)).length
  const alerts: OperationAlert[] = [
    ...(club
      ? [
          {
            key: 'overdue-charges',
            count: club.overdueCharges,
            label: 'Cobranças em atraso',
            icon: Receipt,
            tone: 'bg-red-50 text-red-500',
            href: `${base}/faturamento?tab=cobrancas&status=overdue`,
          },
          {
            key: 'past-due',
            count: club.pastDueSubscriptions,
            label: 'Assinaturas em atraso',
            icon: CalendarClock,
            tone: 'bg-amber-50 text-amber-500',
            href: `${base}/faturamento?tab=assinaturas`,
          },
          {
            key: 'pending-payment',
            count: club.pendingSubscriptions,
            label: 'Adesões aguardando 1º pagamento',
            icon: CreditCard,
            tone: 'bg-sky-50 text-sky-500',
            href: `${base}/cadastros`,
          },
        ]
      : []),
    {
      key: 'support',
      count: awaitingSupport,
      label: 'Atendimentos aguardando resposta',
      icon: Headset,
      tone: 'bg-violet-50 text-violet-500',
      href: `${base}/atendimento`,
    },
    {
      key: 'leads',
      count: newLeads,
      label: 'Leads novos sem contato',
      icon: UserSearch,
      tone: 'bg-emerald-50 text-emerald-600',
      href: `${base}/comercial/funil`,
    },
  ].filter(alert => alert.count > 0)

  const exportReport = () => {
    const monthLabel = reference ? formatMonthLabel(reference.date) : referenceMonth
    downloadCsv(`dashboard-${referenceMonth}.csv`, [
      ['Indicador', 'Valor'],
      ['Mês de referência', monthLabel],
      ['Beneficiários ativos', activeClients.length],
      ['Novas adesões', monthAdmissions],
      [revenueIsReal ? 'Recebido no mês' : 'Faturamento estimado do mês', formatCurrency(monthRevenue)],
      ...(club
        ? [
            ['Inadimplência', formatPercent(delinquencyPercent(club.delinquencyRate))],
            ['Valor em atraso', formatBRL(club.overdueAmount)],
          ]
        : []),
      ...alerts.map(alert => [alert.label, alert.count]),
      [],
      ['Plano', 'Beneficiários ativos'],
      ...planShare.map(item => [item.name, item.value]),
      [],
      ['Mês', 'Beneficiários'],
      ...evolution.map(point => [point.month, point.beneficiarios]),
    ])
  }

  if (isLoading) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Início</h1>
          <p className="text-muted-foreground">Visão geral da operação e principais indicadores.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={referenceMonth} onValueChange={setReferenceMonth}>
            <SelectTrigger className="h-11 w-45 gap-2 bg-card">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(month => (
                <SelectItem key={month.key} value={month.key}>
                  {formatMonthLabel(month.date)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="h-11 gap-2 px-5" onClick={exportReport}>
            <Download className="h-4 w-4" />
            Exportar relatório
          </Button>
        </div>
      </div>

      <GettingStarted slug={slug} base={base} />

      <ClubHomeBlock
        tenantSlug={slug}
        base={base}
        summary={club}
        summaryLoading={clubSummary.loading}
        summaryError={clubSummary.error}
        onRetrySummary={() => void clubSummary.reload()}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={UsersRound}
          accent="primary"
          value={activeClients.length.toLocaleString('pt-BR')}
          label="Beneficiários ativos"
          delta={formatDelta(metrics.clientsChange)}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={UserRoundPlus}
          accent="success"
          value={monthAdmissions.toLocaleString('pt-BR')}
          label="Novas adesões"
          delta={formatDelta(admissionsChange)}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={CreditCard}
          accent="info"
          value={formatCurrency(monthRevenue)}
          label={revenueIsReal ? 'Recebido no mês' : 'Faturamento estimado'}
          delta={formatDelta(revenueChange)}
          comparison={revenueIsReal ? 'vs. mês anterior' : 'estimativa · vs. mês anterior'}
        />
        {club ? (
          <StatCard
            icon={ShieldCheck}
            accent="warning"
            value={formatPercent(delinquencyPercent(club.delinquencyRate))}
            label="Inadimplência"
            hint={`${formatBRL(club.overdueAmount)} em atraso no clube`}
            tone={club.overdueCharges > 0 ? 'down' : 'neutral'}
          />
        ) : (
          <StatCard
            icon={ShieldCheck}
            accent="warning"
            value="—"
            label="Inadimplência"
            hint={clubSummary.loading ? 'Carregando…' : 'Resumo de faturamento indisponível'}
          />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <ChartCard
          title="Evolução de Beneficiários"
          hasData={hasEvolution}
          height={280}
          className="xl:col-span-5"
          emptyMessage="A curva aparece assim que houver beneficiários com contrato registrado."
          action={
            <Select value={evolutionMonths} onValueChange={setEvolutionMonths}>
              <SelectTrigger className="h-9 w-42 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">Últimos 6 meses</SelectItem>
                <SelectItem value="10">Últimos 10 meses</SelectItem>
                <SelectItem value="12">Últimos 12 meses</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={evolution} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 3" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
                tickFormatter={(value: number) => value.toLocaleString('pt-BR')}
              />
              <Tooltip
                cursor={{ fill: 'transparent' }}
                formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Beneficiários']}
                contentStyle={chartTooltipStyle}
              />
              <Bar dataKey="beneficiarios" fill={colors.primary} radius={[6, 6, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Distribuição por Plano"
          hasData={planShare.length > 0}
          height={280}
          className="xl:col-span-3"
          emptyMessage="A divisão por plano aparece quando houver beneficiários ativos."
        >
          <div className="flex h-full items-center gap-4">
            <div className="relative h-full flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={planShare}
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={86}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {planShare.map(item => (
                      <Cell key={item.name} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [value, name]}
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ display: 'none' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-foreground">
                  {planTotal.toLocaleString('pt-BR')}
                </span>
                <span className="text-xs text-muted-foreground">Beneficiários</span>
              </div>
            </div>
            <ul className="w-28 shrink-0 space-y-2.5">
              {planShare.slice(0, 5).map(item => (
                <li key={item.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate text-muted-foreground">{item.name}</span>
                  <span className="ml-auto font-semibold text-foreground">
                    {planTotal === 0 ? '0%' : `${Math.round((item.value / planTotal) * 100)}%`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>

        <Card className="shadow-sm xl:col-span-4">
          <CardHeader>
            <CardTitle className="text-lg">Alertas da operação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <CircleCheckBig className="h-8 w-8 text-emerald-500" />
                <p className="text-sm text-muted-foreground">
                  {clubSummary.loading ? 'Carregando alertas…' : 'Nenhuma pendência no momento.'}
                </p>
              </div>
            )}
            {alerts.map(alert => {
              const Icon = alert.icon
              const content = (
                <>
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', alert.tone)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-base font-bold text-foreground">{alert.count}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {alert.label}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </>
              )
              return (
                <Link
                  key={alert.key}
                  href={alert.href}
                  className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 transition-colors hover:bg-muted/50"
                >
                  {content}
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <Card className="shadow-sm xl:col-span-7">
          <CardHeader>
            <CardTitle className="text-lg">Últimas vendas</CardTitle>
            <CardAction className="self-center">
              <Link href={`${base}/comercial/funil`} className="text-sm font-medium text-primary hover:underline">
                Ver todas
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">#</th>
                    <th className="pb-3 pr-4 font-medium">Cliente</th>
                    <th className="pb-3 pr-4 font-medium">Plano</th>
                    <th className="pb-3 pr-4 font-medium">Valor</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSales.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-muted-foreground">
                        Nenhuma venda registrada ainda.
                      </td>
                    </tr>
                  )}
                  {recentSales.map(sale => {
                    const status = saleStatusMeta[sale.status]
                    return (
                      <tr key={sale.id} className="border-b border-border/60 last:border-0">
                        <td className="py-3 pr-4 font-medium text-muted-foreground">
                          #{sale.id.slice(-4).toUpperCase()}
                        </td>
                        <td className="py-3 pr-4 font-medium text-foreground">{sale.clientName}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{sale.plan}</td>
                        <td className="py-3 pr-4 font-medium text-foreground">
                          {formatCurrency(sale.value)}
                        </td>
                        <td className="py-3 pr-4">
                          <StatusPill {...status} />
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {new Date(sale.date).toLocaleDateString('pt-BR')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-primary/15 bg-primary/10 py-0 shadow-sm xl:col-span-5">
          <CardContent className="flex h-full flex-col justify-center gap-4 p-8">
            <h2 className="max-w-[18ch] text-2xl font-bold leading-tight text-foreground">
              Mais saúde e benefícios para mais pessoas.
            </h2>
            <p className="max-w-[42ch] text-sm text-foreground/70">
              Com a {tenant?.name}, sua entidade oferece acesso a saúde, bem-estar e qualidade de vida.
            </p>
            <Button asChild className="mt-2 w-fit gap-2">
              <Link href={`${base}/planos`}>
                Explorar oportunidades
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
