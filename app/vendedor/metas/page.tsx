'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'
import { getSalesBySellerId } from '@/lib/mock-data'
import type { Seller } from '@/lib/types'
import {
  Target,
  TrendingUp,
  DollarSign,
  Award,
  Calendar,
  CheckCircle2,
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
} from 'recharts'

const monthlyGoals = [
  { month: 'Jan', meta: 40000, realizado: 35000 },
  { month: 'Fev', meta: 45000, realizado: 42000 },
  { month: 'Mar', meta: 50000, realizado: 35000 },
]

const commissionHistory = [
  { month: 'Jan', comissao: 5250 },
  { month: 'Fev', comissao: 6300 },
  { month: 'Mar', comissao: 5250 },
]

export default function MetasPage() {
  const { user } = useAuth()
  const seller = user as Seller
  const sales = getSalesBySellerId(seller?.id || '')

  const confirmedSales = sales.filter(s => s.status === 'confirmed')
  const totalCommission = confirmedSales.reduce((acc, s) => acc + s.commission, 0)
  const progressPercent = seller ? Math.min((seller.totalSales / seller.salesGoal) * 100, 100) : 0

  const remaining = seller ? seller.salesGoal - seller.totalSales : 0
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const currentDay = new Date().getDate()
  const daysRemaining = daysInMonth - currentDay
  const dailyTarget = remaining > 0 ? remaining / daysRemaining : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Metas & Comissões</h1>
        <p className="text-muted-foreground">Acompanhe suas metas e comissões</p>
      </div>

      {/* Current Month Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Meta do Mês</p>
                <p className="text-2xl font-bold mt-1">R$ {(seller?.salesGoal || 0).toLocaleString('pt-BR')}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#1c3670]/10">
                <Target className="h-5 w-5 text-[#1c3670]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Realizado</p>
                <p className="text-2xl font-bold mt-1">R$ {(seller?.totalSales || 0).toLocaleString('pt-BR')}</p>
                <p className="text-sm text-green-500 mt-1">{progressPercent.toFixed(0)}% da meta</p>
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
                <p className="text-sm text-muted-foreground">Comissão Acumulada</p>
                <p className="text-2xl font-bold mt-1">R$ {totalCommission.toLocaleString('pt-BR')}</p>
                <p className="text-sm text-muted-foreground mt-1">{((seller?.commissionRate || 0) * 100).toFixed(0)}% das vendas</p>
              </div>
              <div className="p-3 rounded-lg bg-[#e5375b]/10">
                <DollarSign className="h-5 w-5 text-[#e5375b]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Falta para Meta</p>
                <p className="text-2xl font-bold mt-1">R$ {Math.max(remaining, 0).toLocaleString('pt-BR')}</p>
                <p className="text-sm text-muted-foreground mt-1">{daysRemaining} dias restantes</p>
              </div>
              <div className="p-3 rounded-lg bg-yellow-100">
                <Calendar className="h-5 w-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress Card */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Progresso da Meta</CardTitle>
          <CardDescription>Acompanhamento em tempo real</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Progress Bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  R$ {(seller?.totalSales || 0).toLocaleString('pt-BR')} de R$ {(seller?.salesGoal || 0).toLocaleString('pt-BR')}
                </span>
                <span className={`text-sm font-bold ${progressPercent >= 100 ? 'text-green-500' : 'text-[#1c3670]'}`}>
                  {progressPercent.toFixed(1)}%
                </span>
              </div>
              <div className="h-6 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                  style={{
                    width: `${progressPercent}%`,
                    backgroundColor: progressPercent >= 100 ? '#22c55e' : '#1c3670',
                  }}
                >
                  {progressPercent >= 15 && (
                    <span className="text-xs text-white font-medium">
                      {progressPercent.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Daily Target */}
            {remaining > 0 && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[#1c3670]/10">
                    <Target className="h-5 w-5 text-[#1c3670]" />
                  </div>
                  <div>
                    <p className="font-medium">Meta Diária Sugerida</p>
                    <p className="text-sm text-muted-foreground">
                      Para atingir a meta, venda <strong>R$ {dailyTarget.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</strong> por dia nos próximos {daysRemaining} dias.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {progressPercent >= 100 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100">
                    <Award className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-green-700">Parabéns! Meta atingida!</p>
                    <p className="text-sm text-green-600">
                      Você superou sua meta mensal. Continue assim!
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Goals Chart */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Histórico de Metas</CardTitle>
            <CardDescription>Meta vs Realizado nos últimos meses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyGoals}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, '']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="meta" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Meta" />
                  <Bar dataKey="realizado" fill="#1c3670" radius={[4, 4, 0, 0]} name="Realizado" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Commission Chart */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Histórico de Comissões</CardTitle>
            <CardDescription>Comissões recebidas por mês</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={commissionHistory}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Comissão']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="comissao"
                    stroke="#e5375b"
                    strokeWidth={2}
                    dot={{ fill: '#e5375b' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Vendas do Mês</CardTitle>
          <CardDescription>Detalhamento das vendas e comissões</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Plano</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Data</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Valor</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Comissão</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(sale => (
                  <tr key={sale.id} className="border-b border-border last:border-0">
                    <td className="py-3 px-4 text-sm font-medium">{sale.clientName}</td>
                    <td className="py-3 px-4 text-sm">{sale.plan}</td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {new Date(sale.date).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 text-sm">R$ {sale.value.toLocaleString('pt-BR')}</td>
                    <td className="py-3 px-4 text-sm font-medium text-green-600">
                      R$ {sale.commission.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          sale.status === 'confirmed'
                            ? 'bg-green-100 text-green-700'
                            : sale.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {sale.status === 'confirmed' && <CheckCircle2 className="h-3 w-3" />}
                        {sale.status === 'confirmed' ? 'Confirmada' : sale.status === 'pending' ? 'Pendente' : 'Cancelada'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50">
                  <td colSpan={3} className="py-3 px-4 text-sm font-medium">Total</td>
                  <td className="py-3 px-4 text-sm font-bold">
                    R$ {confirmedSales.reduce((acc, s) => acc + s.value, 0).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3 px-4 text-sm font-bold text-green-600">
                    R$ {totalCommission.toLocaleString('pt-BR')}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
