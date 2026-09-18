'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Download,
  Receipt,
  ShieldCheck,
  TriangleAlert,
  UserRoundPlus,
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
import { MockBadge } from '@/components/dashboard/mock-badge'
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
  planDistribution,
  summaryMetrics,
} from '@/lib/analytics'
import { useChartColors } from '@/lib/use-chart-colors'
import { cn } from '@/lib/utils'

/**
 * Alertas operacionais do painel aprovado. Pendência de cadastro, carência,
 * boleto e autorização vivem no ERP da administradora — nenhum deles tem
 * tabela aqui ainda, então o card inteiro é maquete sinalizada com MockBadge.
 */
const mockAlerts = [
  { count: 12, label: 'Pendências em cadastros', icon: CircleAlert, tone: 'bg-red-50 text-red-500' },
  { count: 8, label: 'Contratos em carência', icon: CalendarClock, tone: 'bg-sky-50 text-sky-500' },
  { count: 5, label: 'Boletos em atraso', icon: Receipt, tone: 'bg-amber-50 text-amber-500' },
  {
    count: 3,
    label: 'Autorizações negadas (últimos 7 dias)',
    icon: TriangleAlert,
    tone: 'bg-red-50 text-red-500',
  },
]

export default function AdminDashboard() {
  const { tenant } = useTenant()
  const { users, sales, leads, clientPlans, isLoading } = useTenantData()
  const colors = useChartColors()
  const [evolutionMonths, setEvolutionMonths] = useState('10')

  const months = useMemo(() => [...lastMonths(12)].reverse(), [])
  const [referenceMonth, setReferenceMonth] = useState(() => months[0]?.key ?? '')

  const clients = getAllClients(users)
  const activeClients = clients.filter(c => c.planStatus === 'active')
  const metrics = summaryMetrics(sales, leads, clients, '1m')

  const monthAdmissions = clients.filter(c => monthKeyOf(c.contractDate) === referenceMonth).length

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
  const monthRevenue = billedAt(referenceEnd)
  const previousRevenue = billedAt(previousEnd)
  const revenueChange =
    previousRevenue === 0 ? null : Math.round(((monthRevenue - previousRevenue) / previousRevenue) * 100)

  const evolution = beneficiariesEvolution(clients, Number(evolutionMonths))
  const hasEvolution = evolution.some(point => point.beneficiarios > 0)

  const planShare = planDistribution(activeClients, colors.palette)
  const planTotal = planShare.reduce((sum, item) => sum + item.value, 0)

  const recentSales = [...sales]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6)

  const base = tenant ? `/${tenant.slug}/admin` : ''

  if (isLoading) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
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
          <Button className="h-11 gap-2 px-5">
            <Download className="h-4 w-4" />
            Exportar relatório
          </Button>
        </div>
      </div>

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
          delta={formatDelta(metrics.clientsChange)}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={CreditCard}
          accent="info"
          value={formatCurrency(monthRevenue)}
          label="Faturamento do mês"
          delta={formatDelta(revenueChange)}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={ShieldCheck}
          accent="warning"
          value="4,8%"
          label="Inadimplência"
          delta={{ value: '1,2%', direction: 'down' }}
          comparison="vs. mês anterior"
          mock
        />
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
            <CardAction className="flex items-center gap-2 self-center">
              <span className="text-sm font-medium text-primary">Ver todos</span>
              <MockBadge />
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-2">
            {mockAlerts.map(alert => {
              const Icon = alert.icon
              return (
                <div
                  key={alert.label}
                  className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5"
                >
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', alert.tone)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-base font-bold text-foreground">{alert.count}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {alert.label}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
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
              <Link href={`${base}/vendas`} className="text-sm font-medium text-primary hover:underline">
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
