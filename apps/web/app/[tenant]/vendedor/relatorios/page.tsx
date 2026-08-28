'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'
import { useTenantData, getSalesBySellerId, getLeadsBySellerId } from '@/contexts/tenant-data-context'
import type { Seller } from '@/lib/types'
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
import { useChartColors } from '@/lib/use-chart-colors'
import {
  activityByWeekday,
  filterByPeriod,
  formatCurrency,
  leadsBySource,
  weeklySeries,
  type PeriodKey,
} from '@/lib/analytics'

export default function RelatoriosVendedorPage() {
  const { user } = useAuth()
  const seller = user as Seller
  const [period, setPeriod] = useState<PeriodKey>('3m')
  const colors = useChartColors()

  const { sales: allSales, leads: allLeads } = useTenantData()

  const sales = useMemo(
    () => filterByPeriod(getSalesBySellerId(allSales, seller?.id ?? ''), s => s.date, period),
    [allSales, seller?.id, period]
  )
  const leads = useMemo(
    () => filterByPeriod(getLeadsBySellerId(allLeads, seller?.id ?? ''), l => l.createdAt, period),
    [allLeads, seller?.id, period]
  )

  const confirmedSales = sales.filter(s => s.status === 'confirmed')
  const totalSalesValue = confirmedSales.reduce((acc, s) => acc + s.value, 0)
  const totalCommission = confirmedSales.reduce((acc, s) => acc + s.commission, 0)
  const conversionRate =
    leads.length > 0
      ? ((leads.filter(l => l.status === 'closed').length / leads.length) * 100).toFixed(1)
      : '0'
  const averageTicket = confirmedSales.length > 0 ? Math.round(totalSalesValue / confirmedSales.length) : 0

  const weekly = useMemo(() => weeklySeries(sales, leads), [sales, leads])
  const sources = useMemo(
    () => leadsBySource(leads).map((s, i) => ({ ...s, color: colors.palette[i % colors.palette.length] })),
    [leads, colors.palette]
  )
  const activity = useMemo(() => activityByWeekday(leads), [leads])

  const hasWeekly = weekly.some(w => w.vendas > 0 || w.leads > 0)
  const hasActivity = activity.some(a => a.ligacoes > 0 || a.emails > 0 || a.reunioes > 0)

  const handleExport = () => {
    const rows = [
      ['Cliente', 'Plano', 'Valor', 'Comissão', 'Status', 'Data'],
      ...sales.map(s => [
        s.clientName,
        s.plan,
        String(s.value),
        String(s.commission),
        s.status,
        new Date(s.date).toLocaleDateString('pt-BR'),
      ]),
    ]
    const csv = rows.map(r => r.join(';')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `minhas-vendas-${period}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Meus Relatórios" description="Análise do seu desempenho de vendas">
        <Select value={period} onValueChange={value => setPeriod(value as PeriodKey)}>
          <SelectTrigger className="w-[170px]">
            <Calendar className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1m">Último mês</SelectItem>
            <SelectItem value="3m">Últimos 3 meses</SelectItem>
            <SelectItem value="6m">Últimos 6 meses</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={handleExport} disabled={sales.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total em Vendas" value={formatCurrency(totalSalesValue)} hint="Vendas confirmadas" />
        <StatCard label="Total de Comissões" value={formatCurrency(totalCommission)} hint="No período" />
        <StatCard label="Taxa de Conversão" value={`${conversionRate}%`} hint="Leads fechados" />
        <StatCard label="Ticket Médio" value={formatCurrency(averageTicket)} hint="Por venda" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Performance Semanal"
          description="Vendas e leads nas últimas 4 semanas"
          hasData={hasWeekly}
          emptyMessage="Nenhuma venda ou lead nas últimas semanas."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekly}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="week" className="text-xs" />
              <YAxis yAxisId="left" className="text-xs" />
              <YAxis yAxisId="right" orientation="right" className="text-xs" allowDecimals={false} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar yAxisId="left" dataKey="vendas" fill={colors.secondary} radius={[4, 4, 0, 0]} name="Vendas (R$)" />
              <Bar yAxisId="right" dataKey="leads" fill={colors.primary} radius={[4, 4, 0, 0]} name="Leads" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Origem dos Leads</CardTitle>
            <CardDescription>De onde vêm seus leads</CardDescription>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Nenhum lead atribuído a você neste período.
              </p>
            ) : (
              <div className="flex h-[300px] items-center">
                <ResponsiveContainer width="60%" height="100%">
                  <PieChart>
                    <Pie
                      data={sources}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="leads"
                      nameKey="source"
                    >
                      {sources.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  {sources.map((item, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm">{item.source}</span>
                      <span className="ml-auto text-sm font-medium">{item.leads}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ChartCard
        title="Atividades da Semana"
        description="Ligações, emails e reuniões registradas nos seus leads"
        hasData={hasActivity}
        emptyMessage="Registre interações nos seus leads para acompanhar sua rotina aqui."
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={activity}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="day" className="text-xs" />
            <YAxis className="text-xs" allowDecimals={false} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Line type="monotone" dataKey="ligacoes" stroke={colors.secondary} strokeWidth={2} name="Ligações" />
            <Line type="monotone" dataKey="emails" stroke={colors.primary} strokeWidth={2} name="Emails" />
            <Line type="monotone" dataKey="reunioes" stroke={colors.success} strokeWidth={2} name="Reuniões" />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
