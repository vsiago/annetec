'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts'
import { Download, Calendar } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import { ChartCard, chartTooltipStyle } from '@/components/dashboard/chart-card'
import { useTenantData, getAllClients } from '@/contexts/tenant-data-context'
import { useChartColors } from '@/lib/use-chart-colors'
import {
  PERIOD_MONTHS,
  conversionSeries,
  formatChange,
  formatCurrency,
  leadsBySource,
  monthlySeries,
  planDistribution,
  summaryMetrics,
  type PeriodKey,
} from '@/lib/analytics'

export default function RelatoriosPage() {
  const [period, setPeriod] = useState<PeriodKey>('6m')
  const { users, sales, leads } = useTenantData()
  const colors = useChartColors()

  const clients = useMemo(() => getAllClients(users), [users])
  const months = PERIOD_MONTHS[period]

  const monthly = useMemo(() => monthlySeries(sales, clients, months), [sales, clients, months])
  const plans = useMemo(() => planDistribution(clients, colors.palette), [clients, colors.palette])
  const sources = useMemo(() => leadsBySource(leads), [leads])
  const conversion = useMemo(() => conversionSeries(leads, months), [leads, months])
  const metrics = useMemo(() => summaryMetrics(sales, leads, clients, period), [sales, leads, clients, period])

  const revenueChange = formatChange(metrics.revenueChange)
  const clientsChange = formatChange(metrics.clientsChange)

  const hasRevenue = monthly.some(m => m.vendas > 0)
  const hasClientMovement = monthly.some(m => m.novosClientes > 0 || m.cancelamentos > 0)

  const handleExport = () => {
    const rows = [
      ['Mês', 'Receita', 'Novos clientes', 'Cancelamentos'],
      ...monthly.map(m => [m.month, String(m.vendas), String(m.novosClientes), String(m.cancelamentos)]),
    ]
    const csv = rows.map(r => r.join(';')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `relatorio-${period}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Relatórios" description="Análise completa de vendas e desempenho">
        <Select value={period} onValueChange={value => setPeriod(value as PeriodKey)}>
          <SelectTrigger className="w-[170px]">
            <Calendar className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1m">Último mês</SelectItem>
            <SelectItem value="3m">Últimos 3 meses</SelectItem>
            <SelectItem value="6m">Últimos 6 meses</SelectItem>
            <SelectItem value="1y">Último ano</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleExport} disabled={!hasRevenue && !hasClientMovement}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Receita Total"
          value={formatCurrency(metrics.revenue)}
          hint={revenueChange.text}
          tone={revenueChange.tone}
        />
        <StatCard
          label="Novos Clientes"
          value={metrics.newClients}
          hint={clientsChange.text}
          tone={clientsChange.tone}
        />
        <StatCard
          label="Taxa de Conversão"
          value={`${metrics.conversionRate}%`}
          hint="Leads fechados no período"
        />
        <StatCard
          label="Ticket Médio"
          value={formatCurrency(metrics.averageTicket)}
          hint="Por venda confirmada"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Evolução de Vendas"
          description="Receita mensal em R$"
          hasData={hasRevenue}
          emptyMessage="Nenhuma venda registrada neste período."
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), 'Vendas']}
                contentStyle={chartTooltipStyle}
              />
              <Area
                type="monotone"
                dataKey="vendas"
                stroke={colors.secondary}
                fill={colors.secondary}
                fillOpacity={0.12}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Novos Clientes vs Cancelamentos"
          description="Comparativo mensal"
          hasData={hasClientMovement}
          emptyMessage="Nenhuma entrada ou saída de clientes neste período."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="novosClientes" fill={colors.success} radius={[4, 4, 0, 0]} name="Novos" />
              <Bar dataKey="cancelamentos" fill="#ef4444" radius={[4, 4, 0, 0]} name="Cancelamentos" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Distribuição por Plano</CardTitle>
            <CardDescription>Clientes por tipo de plano</CardDescription>
          </CardHeader>
          <CardContent>
            {plans.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Nenhum cliente cadastrado ainda.
              </p>
            ) : (
              <>
                <div className="flex h-[250px] items-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={plans}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {plans.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [`${value} cliente(s)`, '']}
                        contentStyle={chartTooltipStyle}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  {plans.map((item, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span>{item.name}</span>
                      </div>
                      <span className="font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <ChartCard
          title="Origem dos Leads"
          description="Canais de aquisição"
          hasData={sources.length > 0}
          emptyMessage="Nenhum lead cadastrado ainda."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sources} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis type="number" className="text-xs" allowDecimals={false} />
              <YAxis dataKey="source" type="category" className="text-xs" width={80} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="leads" fill={colors.primary} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Taxa de Conversão"
          description="Leads convertidos em clientes (%)"
          hasData={leads.length > 0}
          emptyMessage="Nenhum lead cadastrado ainda."
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={conversion}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" domain={[0, 100]} />
              <Tooltip
                formatter={(value: number) => [`${value}%`, 'Conversão']}
                contentStyle={chartTooltipStyle}
              />
              <Line
                type="monotone"
                dataKey="taxa"
                stroke={colors.success}
                strokeWidth={2}
                dot={{ fill: colors.success }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
