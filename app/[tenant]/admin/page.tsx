'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/auth-context'
import { useTenantData, getAllSellers, getAllClients } from '@/contexts/tenant-data-context'
import {
  UserCog,
  UsersRound,
  DollarSign,
  Target,
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
import { ChartCard, chartTooltipStyle } from '@/components/dashboard/chart-card'
import { StatCard } from '@/components/dashboard/stat-card'
import { currentMonthTotal, monthlySeries } from '@/lib/analytics'
import { useChartColors } from '@/lib/use-chart-colors'

const leadStatusMeta: Record<string, { label: string; color: string }> = {
  new: { label: 'Novos', color: '#3b82f6' },
  contacted: { label: 'Contatados', color: '#8b5cf6' },
  qualified: { label: 'Qualificados', color: '#22c55e' },
  proposal: { label: 'Proposta', color: '#eab308' },
  negotiation: { label: 'Negociação', color: '#f97316' },
  closed: { label: 'Fechados', color: '#14b8a6' },
  lost: { label: 'Perdidos', color: '#ef4444' },
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const { users, sales, leads, isLoading } = useTenantData()
  const colors = useChartColors()

  const sellers = getAllSellers(users)
  const clients = getAllClients(users)
  const salesByMonth = monthlySeries(sales, clients, 6)
  const hasSalesHistory = salesByMonth.some(m => m.vendas > 0)

  const activeSales = sales.filter(s => s.status === 'confirmed')
  const monthRevenue = activeSales.reduce((sum, s) => sum + s.value, 0)
  const activeLeads = leads.filter(l => !['closed', 'lost'].includes(l.status))

  const statsCards = [
    {
      title: 'Total de Vendedores',
      value: sellers.length,
      icon: UserCog,
      description: 'cadastrados',
    },
    {
      title: 'Total de Clientes',
      value: clients.length,
      icon: UsersRound,
      description: 'associados ativos',
    },
    {
      title: 'Vendas Confirmadas',
      value: `R$ ${monthRevenue.toLocaleString('pt-BR')}`,
      icon: DollarSign,
      description: 'no período',
    },
    {
      title: 'Leads Ativos',
      value: activeLeads.length,
      icon: Target,
      description: 'no funil',
    },
  ]

  const leadsByStatus = Object.entries(
    leads.reduce<Record<string, number>>((acc, lead) => {
      acc[lead.status] = (acc[lead.status] ?? 0) + 1
      return acc
    }, {})
  ).map(([status, value]) => ({
    name: leadStatusMeta[status]?.label ?? status,
    value,
    color: leadStatusMeta[status]?.color ?? '#94a3b8',
  }))

  // Ranked by this month's confirmed sales, not the static seed field, so
  // the leaderboard reflects sales as they're actually recorded.
  const topSellers = sellers
    .map(seller => {
      const vendas = currentMonthTotal(sales.filter(s => s.sellerId === seller.id))
      const meta = seller.salesGoal
      return { name: seller.name, vendas, meta, percentual: meta > 0 ? Math.round((vendas / meta) * 100) : 0 }
    })
    .sort((a, b) => b.vendas - a.vendas)

  if (isLoading) return null

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
        {statsCards.map((stat, index) => (
          <StatCard key={index} label={stat.title} value={stat.value} hint={stat.description} icon={stat.icon} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Vendas por Mês"
          description="Evolução das vendas nos últimos 6 meses"
          hasData={hasSalesHistory}
          emptyMessage="Nenhuma venda confirmada ainda."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={salesByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="month" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Vendas']}
                contentStyle={chartTooltipStyle}
              />
              <Bar dataKey="vendas" fill={colors.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Leads por Status</CardTitle>
            <CardDescription>Distribuição atual dos leads no funil</CardDescription>
          </CardHeader>
          <CardContent>
            {leadsByStatus.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Nenhum lead cadastrado ainda.</p>
            ) : (
              <div className="flex h-[300px] items-center">
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
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ display: 'none' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="min-w-[120px] space-y-2">
                  {leadsByStatus.map((item, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-muted-foreground">{item.name}</span>
                      <span className="ml-auto font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white text-sm font-bold">
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
                        backgroundColor: seller.percentual >= 100 ? colors.success : colors.primary,
                      }}
                    />
                  </div>
                </div>
                <span
                  className={`text-sm font-medium ${
                    seller.percentual >= 100 ? 'text-green-500' : 'text-primary'
                  }`}
                >
                  {seller.percentual}%
                </span>
              </div>
            ))}
            {topSellers.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum vendedor cadastrado ainda.</p>
            )}
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
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhuma venda registrada ainda.
                    </td>
                  </tr>
                )}
                {sales.slice(0, 5).map(sale => (
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
