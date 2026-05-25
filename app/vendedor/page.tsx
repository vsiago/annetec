'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/auth-context'
import { getLeadsBySellerId, getSalesBySellerId, getClientsBySellerId } from '@/lib/mock-data'
import type { Seller } from '@/lib/types'
import {
  Users,
  Target,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  Phone,
  Mail,
  Calendar,
  Clock,
} from 'lucide-react'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function SellerDashboard() {
  const { user } = useAuth()
  const seller = user as Seller

  const leads = getLeadsBySellerId(seller?.id || '')
  const sales = getSalesBySellerId(seller?.id || '')
  const clients = getClientsBySellerId(seller?.id || '')

  const activeLeads = leads.filter(l => !['closed', 'lost'].includes(l.status))
  const closedLeads = leads.filter(l => l.status === 'closed')
  const totalSalesValue = sales.filter(s => s.status === 'confirmed').reduce((acc, s) => acc + s.value, 0)
  const totalCommission = sales.filter(s => s.status === 'confirmed').reduce((acc, s) => acc + s.commission, 0)

  const progressPercent = seller ? Math.min((seller.totalSales / seller.salesGoal) * 100, 100) : 0

  const leadsByStatus = [
    { name: 'Novos', value: leads.filter(l => l.status === 'new').length, color: '#3b82f6' },
    { name: 'Contatados', value: leads.filter(l => l.status === 'contacted').length, color: '#8b5cf6' },
    { name: 'Qualificados', value: leads.filter(l => l.status === 'qualified').length, color: '#22c55e' },
    { name: 'Proposta', value: leads.filter(l => l.status === 'proposal').length, color: '#eab308' },
    { name: 'Negociação', value: leads.filter(l => l.status === 'negotiation').length, color: '#f97316' },
    { name: 'Fechados', value: leads.filter(l => l.status === 'closed').length, color: '#14b8a6' },
  ].filter(item => item.value > 0)

  const recentActivities = leads
    .flatMap(lead => lead.interactions.map(i => ({ ...i, leadName: lead.name })))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call':
        return <Phone className="h-4 w-4" />
      case 'email':
        return <Mail className="h-4 w-4" />
      case 'meeting':
        return <Calendar className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Olá, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground">
            Acompanhe seu desempenho e gerencie seus leads
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/vendedor/pipeline">Ver Pipeline</Link>
          </Button>
          <Button className="bg-[#e84364] hover:bg-[#d42d50] text-white" asChild>
            <Link href="/vendedor/leads">Novo Lead</Link>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Leads Ativos</p>
                <p className="text-2xl font-bold mt-1">{activeLeads.length}</p>
                <p className="text-sm text-green-500 mt-1">+3 esta semana</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-100">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vendas Fechadas</p>
                <p className="text-2xl font-bold mt-1">{closedLeads.length}</p>
                <p className="text-sm text-green-500 mt-1">+1 este mês</p>
              </div>
              <div className="p-3 rounded-lg bg-green-100">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Comissão do Mês</p>
                <p className="text-2xl font-bold mt-1">R$ {totalCommission.toLocaleString('pt-BR')}</p>
                <p className="text-sm text-muted-foreground mt-1">{(seller?.commissionRate || 0) * 100}% sobre vendas</p>
              </div>
              <div className="p-3 rounded-lg bg-[#e84364]/10">
                <DollarSign className="h-5 w-5 text-[#e84364]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Meta Mensal</p>
                <p className="text-2xl font-bold mt-1">{progressPercent.toFixed(0)}%</p>
                <p className="text-sm text-muted-foreground mt-1">
                  R$ {(seller?.totalSales || 0).toLocaleString('pt-BR')} / R$ {(seller?.salesGoal || 0).toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-[#26365f]/10">
                <Target className="h-5 w-5 text-[#26365f]" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Progresso da Meta Mensal</h3>
            <span className={`text-sm font-medium ${progressPercent >= 100 ? 'text-green-500' : 'text-[#26365f]'}`}>
              {progressPercent.toFixed(0)}%
            </span>
          </div>
          <div className="h-4 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: progressPercent >= 100 ? '#22c55e' : '#26365f',
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-2 text-sm text-muted-foreground">
            <span>R$ 0</span>
            <span>R$ {(seller?.salesGoal || 0).toLocaleString('pt-BR')}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leads by Status */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Leads por Status</CardTitle>
            <CardDescription>Distribuição atual no funil de vendas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leadsByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {leadsByStatus.map((entry, index) => (
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
              <div className="space-y-2 min-w-[120px]">
                {leadsByStatus.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground">{item.name}</span>
                    <span className="font-medium ml-auto">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Atividades Recentes</CardTitle>
            <CardDescription>Últimas interações com leads</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivities.map((activity, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{activity.leadName}</p>
                    <p className="text-sm text-muted-foreground truncate">{activity.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(activity.date).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))}
              {recentActivities.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhuma atividade recente
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* My Clients */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Meus Clientes</CardTitle>
            <CardDescription>Clientes que você converteu</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/vendedor/clientes">Ver Todos</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Plano</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Data</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {clients.slice(0, 3).map(client => (
                  <tr key={client.id} className="border-b border-border last:border-0">
                    <td className="py-3 px-4">
                      <p className="font-medium text-sm">{client.name}</p>
                      <p className="text-xs text-muted-foreground">{client.email}</p>
                    </td>
                    <td className="py-3 px-4 text-sm">{client.plan}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {new Date(client.contractDate).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Ativo
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
