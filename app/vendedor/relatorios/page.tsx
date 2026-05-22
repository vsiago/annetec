'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'
import { getSalesBySellerId, getLeadsBySellerId } from '@/lib/mock-data'
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
import { useState } from 'react'

export default function RelatoriosVendedorPage() {
  const { user } = useAuth()
  const seller = user as Seller
  const [period, setPeriod] = useState('3m')

  const sales = getSalesBySellerId(seller?.id || '')
  const leads = getLeadsBySellerId(seller?.id || '')

  const confirmedSales = sales.filter(s => s.status === 'confirmed')
  const totalSalesValue = confirmedSales.reduce((acc, s) => acc + s.value, 0)
  const totalCommission = confirmedSales.reduce((acc, s) => acc + s.commission, 0)

  const conversionRate = leads.length > 0 
    ? ((leads.filter(l => l.status === 'closed').length / leads.length) * 100).toFixed(1)
    : 0

  const weeklyData = [
    { week: 'Sem 1', vendas: 8500, leads: 4 },
    { week: 'Sem 2', vendas: 12000, leads: 6 },
    { week: 'Sem 3', vendas: 7500, leads: 3 },
    { week: 'Sem 4', vendas: 7000, leads: 5 },
  ]

  const sourceData = [
    { source: 'Website', value: 3, color: '#1c3670' },
    { source: 'Indicação', value: 2, color: '#e5375b' },
    { source: 'Instagram', value: 1, color: '#22c55e' },
    { source: 'LinkedIn', value: 1, color: '#eab308' },
  ]

  const activityData = [
    { day: 'Seg', ligacoes: 8, emails: 5, reunioes: 1 },
    { day: 'Ter', ligacoes: 12, emails: 8, reunioes: 2 },
    { day: 'Qua', ligacoes: 6, emails: 4, reunioes: 0 },
    { day: 'Qui', ligacoes: 10, emails: 6, reunioes: 1 },
    { day: 'Sex', ligacoes: 9, emails: 7, reunioes: 2 },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meus Relatórios</h1>
          <p className="text-muted-foreground">Análise do seu desempenho de vendas</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[150px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">Último mês</SelectItem>
              <SelectItem value="3m">Últimos 3 meses</SelectItem>
              <SelectItem value="6m">Últimos 6 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total em Vendas</p>
            <p className="text-2xl font-bold mt-1">R$ {totalSalesValue.toLocaleString('pt-BR')}</p>
            <p className="text-sm text-green-500 mt-1">+15% vs. período anterior</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total de Comissões</p>
            <p className="text-2xl font-bold mt-1">R$ {totalCommission.toLocaleString('pt-BR')}</p>
            <p className="text-sm text-green-500 mt-1">+12% vs. período anterior</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
            <p className="text-2xl font-bold mt-1">{conversionRate}%</p>
            <p className="text-sm text-green-500 mt-1">+5% vs. período anterior</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Ticket Médio</p>
            <p className="text-2xl font-bold mt-1">
              R$ {confirmedSales.length > 0 ? (totalSalesValue / confirmedSales.length).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : 0}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Por venda</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Weekly Performance */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Performance Semanal</CardTitle>
            <CardDescription>Vendas e leads por semana</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="week" className="text-xs" />
                  <YAxis yAxisId="left" className="text-xs" />
                  <YAxis yAxisId="right" orientation="right" className="text-xs" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar yAxisId="left" dataKey="vendas" fill="#1c3670" radius={[4, 4, 0, 0]} name="Vendas (R$)" />
                  <Bar yAxisId="right" dataKey="leads" fill="#e5375b" radius={[4, 4, 0, 0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Lead Sources */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Origem dos Leads</CardTitle>
            <CardDescription>De onde vêm seus leads</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center">
              <ResponsiveContainer width="60%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {sourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                {sourceData.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm">{item.source}</span>
                    <span className="text-sm font-medium ml-auto">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Chart */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Atividades da Semana</CardTitle>
          <CardDescription>Ligações, emails e reuniões realizadas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="day" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Line type="monotone" dataKey="ligacoes" stroke="#1c3670" strokeWidth={2} name="Ligações" />
                <Line type="monotone" dataKey="emails" stroke="#e5375b" strokeWidth={2} name="Emails" />
                <Line type="monotone" dataKey="reunioes" stroke="#22c55e" strokeWidth={2} name="Reuniões" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
