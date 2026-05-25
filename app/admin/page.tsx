'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/auth-context'
import { mockUsers, mockSales, mockLeads, getAllSellers, getAllClients } from '@/lib/mock-data'
import {
  Users,
  UserCog,
  UsersRound,
  TrendingUp,
  DollarSign,
  Target,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
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

const statsCards = [
  {
    title: 'Total de Vendedores',
    value: getAllSellers().length,
    icon: UserCog,
    change: '+2',
    changeType: 'positive' as const,
    description: 'este mês',
  },
  {
    title: 'Total de Clientes',
    value: getAllClients().length,
    icon: UsersRound,
    change: '+12',
    changeType: 'positive' as const,
    description: 'este mês',
  },
  {
    title: 'Vendas do Mês',
    value: 'R$ 16.800',
    icon: DollarSign,
    change: '+18%',
    changeType: 'positive' as const,
    description: 'vs. mês anterior',
  },
  {
    title: 'Leads Ativos',
    value: mockLeads.filter(l => !['closed', 'lost'].includes(l.status)).length,
    icon: Target,
    change: '+5',
    changeType: 'positive' as const,
    description: 'esta semana',
  },
]

const salesByMonth = [
  { month: 'Jan', vendas: 12500 },
  { month: 'Fev', vendas: 15800 },
  { month: 'Mar', vendas: 16800 },
  { month: 'Abr', vendas: 14200 },
  { month: 'Mai', vendas: 18500 },
  { month: 'Jun', vendas: 21000 },
]

const leadsByStatus = [
  { name: 'Novos', value: 2, color: '#3b82f6' },
  { name: 'Qualificados', value: 1, color: '#22c55e' },
  { name: 'Proposta', value: 2, color: '#eab308' },
  { name: 'Negociação', value: 1, color: '#f97316' },
  { name: 'Fechados', value: 1, color: '#14b8a6' },
  { name: 'Perdidos', value: 1, color: '#ef4444' },
]

const topSellers = getAllSellers()
  .map(seller => ({
    name: seller.name,
    vendas: seller.totalSales,
    meta: seller.salesGoal,
    percentual: Math.round((seller.totalSales / seller.salesGoal) * 100),
  }))
  .sort((a, b) => b.vendas - a.vendas)

export default function AdminDashboard() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Olá, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-muted-foreground">
          Aqui está o resumo do seu painel administrativo
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, index) => {
          const Icon = stat.icon
          return (
            <Card key={index} className="border-0 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    <div className="flex items-center gap-1 mt-2">
                      {stat.changeType === 'positive' ? (
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                      )}
                      <span
                        className={
                          stat.changeType === 'positive'
                            ? 'text-sm text-green-500'
                            : 'text-sm text-red-500'
                        }
                      >
                        {stat.change}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {stat.description}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-[#26365f]/10">
                    <Icon className="h-5 w-5 text-[#26365f]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sales Chart */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Vendas por Mês</CardTitle>
            <CardDescription>Evolução das vendas nos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByMonth}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Vendas']}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: '0 10px 15px -3px rgba(38,54,95,0.1)',
                      padding: '12px',
                    }}
                    itemStyle={{ color: '#26365f', fontWeight: 'bold', fontSize: '14px' }}
                    labelStyle={{ color: '#64748b', fontWeight: '600', fontSize: '13px', marginBottom: '4px' }}
                    cursor={{ fill: 'rgba(38, 54, 95, 0.05)' }}
                  />
                  <Bar dataKey="vendas" fill="#26365f" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Leads Pie Chart */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Leads por Status</CardTitle>
            <CardDescription>Distribuição atual dos leads no funil</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leadsByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {leadsByStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [value, name]}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: '0 10px 15px -3px rgba(38,54,95,0.1)',
                      padding: '12px',
                    }}
                    itemStyle={{ fontWeight: 'bold', fontSize: '14px' }}
                    labelStyle={{ display: 'none' }}
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
      </div>

      {/* Top Sellers */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Ranking de Vendedores</CardTitle>
          <CardDescription>Performance dos vendedores em relação às metas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topSellers.map((seller, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#26365f] text-white text-sm font-bold">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium truncate">{seller.name}</p>
                    <span className="text-sm text-muted-foreground">
                      R$ {seller.vendas.toLocaleString('pt-BR')} / R$ {seller.meta.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(seller.percentual, 100)}%`,
                        backgroundColor: seller.percentual >= 100 ? '#22c55e' : '#26365f',
                      }}
                    />
                  </div>
                </div>
                <span
                  className={`text-sm font-medium ${
                    seller.percentual >= 100 ? 'text-green-500' : 'text-[#26365f]'
                  }`}
                >
                  {seller.percentual}%
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Sales */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Vendas Recentes</CardTitle>
          <CardDescription>Últimas vendas realizadas na plataforma</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Vendedor</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Plano</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Valor</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {mockSales.slice(0, 5).map(sale => (
                  <tr key={sale.id} className="border-b border-border last:border-0">
                    <td className="py-3 px-4 text-sm">{sale.clientName}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{sale.sellerName}</td>
                    <td className="py-3 px-4 text-sm">{sale.plan}</td>
                    <td className="py-3 px-4 text-sm font-medium">
                      R$ {sale.value.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          sale.status === 'confirmed'
                            ? 'bg-green-100 text-green-700'
                            : sale.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {sale.status === 'confirmed' ? 'Confirmada' : sale.status === 'pending' ? 'Pendente' : 'Cancelada'}
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
