'use client'

import { useMemo, useState } from 'react'
import {
  Banknote,
  CalendarDays,
  ChartPie,
  CircleAlert,
  CircleCheckBig,
  CircleDollarSign,
  CircleX,
  Clock,
  CreditCard,
  Download,
  FileText,
  Landmark,
  MinusCircle,
  MoreHorizontal,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { chartTooltipStyle } from '@/components/dashboard/chart-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { StatCard } from '@/components/dashboard/stat-card'
import { DataTable, StatusPill } from '@/components/dashboard/table-controls'
import { getAllClients, useTenantData } from '@/contexts/tenant-data-context'
import {
  formatCurrency,
  formatMonthLabel,
  formatMonthRange,
  lastMonths,
  monthKeyOf,
} from '@/lib/analytics'
import { cn } from '@/lib/utils'

/**
 * Despesas operacionais por categoria, em proporção da receita do mês. Não há
 * lançamento de despesa no sistema ainda — quando houver, esta tabela some e
 * a série vem do razão.
 */
const EXPENSE_RATIOS = [
  { category: 'Rede credenciada', ratio: 0.18 },
  { category: 'Marketing', ratio: 0.07 },
  { category: 'Tecnologia', ratio: 0.05 },
  { category: 'Pessoal', ratio: 0.12 },
  { category: 'Administrativo', ratio: 0.04 },
]

const REVENUE_SPLIT = [
  { name: 'Planos de Saúde', share: 0.58, color: '#e11d48' },
  { name: 'Plano Odontológico', share: 0.18, color: '#3b82f6' },
  { name: 'Benefícios e Assistências', share: 0.14, color: '#22c55e' },
  { name: 'Outros', share: 0.1, color: '#f59e0b' },
]

const RECEIVABLES = [
  { label: 'Em dia', share: 0.76, icon: CircleCheckBig, tone: 'text-emerald-500' },
  { label: 'Vencendo (1–7 dias)', share: 0.12, icon: Clock, tone: 'text-amber-500' },
  { label: 'Vencido (8–30 dias)', share: 0.08, icon: CircleAlert, tone: 'text-orange-500' },
  { label: 'Vencido (+30 dias)', share: 0.04, icon: CircleX, tone: 'text-red-500' },
]

export default function AdminFinanceiroPage() {
  const { users, sales, clientPlans, isLoading } = useTenantData()

  const months = useMemo(() => [...lastMonths(12)].reverse(), [])
  const [referenceMonth, setReferenceMonth] = useState(() => months[0]?.key ?? '')
  const [tab, setTab] = useState('visao')

  const clients = getAllClients(users)
  const planPrices = useMemo(
    () => new Map(clientPlans.map(plan => [plan.name, plan.priceMonthly])),
    [clientPlans],
  )

  /** Receita = mensalidade da carteira vigente no fim do mês. */
  const revenueAt = useMemo(
    () => (end: Date) =>
      clients
        .filter(c => c.planStatus !== 'cancelled' && new Date(c.contractDate) <= end)
        .reduce((sum, c) => sum + (planPrices.get(c.plan) ?? 0), 0),
    [clients, planPrices],
  )

  const reference = months.find(m => m.key === referenceMonth)?.date ?? new Date()
  const referenceEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59)

  const totalRevenue = revenueAt(referenceEnd)
  const totalExpenses = EXPENSE_RATIOS.reduce((sum, item) => sum + totalRevenue * item.ratio, 0)
  const defaulted = totalRevenue * 0.114
  const netRevenue = totalRevenue - defaulted

  const series = useMemo(
    () =>
      lastMonths(10).map(bucket => {
        const end = new Date(bucket.date.getFullYear(), bucket.date.getMonth() + 1, 0, 23, 59, 59)
        const receita = revenueAt(end)
        const despesas = EXPENSE_RATIOS.reduce((sum, item) => sum + receita * item.ratio, 0)
        return {
          month: bucket.label,
          receita: Math.round(receita),
          despesas: Math.round(despesas),
          resultado: Math.round(receita - despesas),
        }
      }),
    [revenueAt],
  )

  const revenueSplit = REVENUE_SPLIT.map(item => ({
    ...item,
    value: Math.round(totalRevenue * item.share),
  }))

  /** Saldo acumulado a partir do resultado de cada mês. */
  const cashFlow = useMemo(() => {
    let running = 0
    return series.map(item => {
      running += item.resultado
      return { ...item, saldo: running }
    })
  }, [series])

  const overdueClients = useMemo(
    () => clients.filter(client => client.planStatus === 'pending').slice(0, 12),
    [clients],
  )

  const dreLines = useMemo(() => {
    const deductions = defaulted
    const netOperating = totalRevenue - deductions
    return [
      { label: 'Receita bruta de mensalidades', value: totalRevenue, emphasis: false, indent: false },
      { label: '(-) Inadimplência do período', value: -deductions, emphasis: false, indent: true },
      { label: 'Receita líquida', value: netOperating, emphasis: true, indent: false },
      ...EXPENSE_RATIOS.map(item => ({
        label: '(-) ' + item.category,
        value: -totalRevenue * item.ratio,
        emphasis: false,
        indent: true,
      })),
      { label: 'Total de despesas operacionais', value: -totalExpenses, emphasis: false, indent: false },
      { label: 'Resultado do período', value: netOperating - totalExpenses, emphasis: true, indent: false },
    ]
  }, [totalRevenue, defaulted, totalExpenses])

  /** Lançamentos recentes: vendas reais do mês viram receita no razão. */
  const entries = useMemo(() => {
    const monthSales = sales
      .filter(sale => monthKeyOf(sale.date) === referenceMonth && sale.status !== 'cancelled')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 4)
      .map(sale => ({
        id: sale.id,
        date: new Date(sale.date),
        description: `Adesão — ${sale.clientName}`,
        kind: 'Receita' as const,
        category: `Plano ${sale.plan}`,
        value: sale.value,
        status: 'Pago',
      }))

    const expenses = EXPENSE_RATIOS.slice(0, 2).map((item, i) => ({
      id: `exp-${i}`,
      date: new Date(reference.getFullYear(), reference.getMonth(), 8 - i),
      description: `Despesa — ${item.category}`,
      kind: 'Despesa' as const,
      category: item.category,
      value: -Math.round(totalRevenue * item.ratio),
      status: 'Pago',
    }))

    return [...monthSales, ...expenses]
  }, [sales, referenceMonth, reference, totalRevenue])

  if (isLoading) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Financeiro"
        description="Acompanhe receitas, despesas, fluxo de caixa e resultado da operação."
        mock
      >
        <Select value={referenceMonth} onValueChange={setReferenceMonth}>
          <SelectTrigger className="w-full gap-2 bg-card data-[size=default]:h-11 sm:w-60">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map(month => (
              <SelectItem key={month.key} value={month.key}>
                {formatMonthRange(month.date)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="h-11 gap-2 px-5">
          <Download className="h-4 w-4" />
          Exportar relatório
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CircleDollarSign}
          accent="success"
          value={formatCurrency(Math.round(totalRevenue))}
          label="Receita total"
          delta={{ value: '18%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={CreditCard}
          accent="primary"
          value={formatCurrency(Math.round(defaulted))}
          label="Inadimplência"
          delta={{ value: '12%', direction: 'down' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Banknote}
          accent="info"
          value={formatCurrency(Math.round(netRevenue))}
          label="Receita líquida"
          delta={{ value: '15%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={ChartPie}
          accent="warning"
          value={formatCurrency(Math.round(totalExpenses))}
          label="Despesas operacionais"
          delta={{ value: '8%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <SectionTabsList>
          <SectionTab value="visao">Visão Geral</SectionTab>
          <SectionTab value="receitas">Receitas</SectionTab>
          <SectionTab value="despesas">Despesas</SectionTab>
          <SectionTab value="inadimplencia">Inadimplência</SectionTab>
          <SectionTab value="fluxo">Fluxo de Caixa</SectionTab>
          <SectionTab value="dre">DRE</SectionTab>
        </SectionTabsList>

        <div className="grid gap-5 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <TabsContent value="visao" className="m-0 space-y-5">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Receita x Despesas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
                        <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11 }}
                          tickFormatter={(value: number) => value.toLocaleString('pt-BR')}
                        />
                        <Tooltip
                          cursor={{ fill: 'transparent' }}
                          contentStyle={chartTooltipStyle}
                          formatter={(value: number) => formatCurrency(value)}
                        />
                        <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="receita" name="Receita" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={12} />
                        <Bar dataKey="despesas" name="Despesas" fill="#e11d48" radius={[3, 3, 0, 0]} maxBarSize={12} />
                        <Bar dataKey="resultado" name="Resultado" fill="#1e2a4a" radius={[3, 3, 0, 0]} maxBarSize={12} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Últimos lançamentos</CardTitle>
                  <CardAction className="self-center">
                    <span className="text-sm font-medium text-primary">Ver todos</span>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                          <th className="pb-3 pr-4 font-medium">Data</th>
                          <th className="pb-3 pr-4 font-medium">Descrição</th>
                          <th className="pb-3 pr-4 font-medium">Tipo</th>
                          <th className="pb-3 pr-4 font-medium">Categoria</th>
                          <th className="pb-3 pr-4 font-medium">Valor (R$)</th>
                          <th className="pb-3 pr-4 font-medium">Status</th>
                          <th className="pb-3 text-right font-medium">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-10 text-center text-muted-foreground">
                              Nenhum lançamento neste período.
                            </td>
                          </tr>
                        )}
                        {entries.map(entry => (
                          <tr key={entry.id} className="border-b border-border/60 last:border-0">
                            <td className="py-3 pr-4 text-muted-foreground">
                              {entry.date.toLocaleDateString('pt-BR')}
                            </td>
                            <td className="py-3 pr-4 font-medium text-foreground">{entry.description}</td>
                            <td className="py-3 pr-4">
                              <StatusPill
                                label={entry.kind}
                                className={
                                  entry.kind === 'Receita'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-rose-50 text-rose-700'
                                }
                              />
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground">{entry.category}</td>
                            <td
                              className={cn(
                                'py-3 pr-4 font-medium',
                                entry.value < 0 ? 'text-rose-600' : 'text-foreground',
                              )}
                            >
                              {entry.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 pr-4">
                              <StatusPill label={entry.status} className="bg-emerald-50 text-emerald-700" />
                            </td>
                            <td className="py-3 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                    <span className="sr-only">Ações do lançamento</span>
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
                                  <DropdownMenuItem>Editar lançamento</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="receitas" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Receitas por categoria</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Composição da mensalidade da carteira no mês de referência.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'name',
                        header: 'Categoria',
                        render: row => (
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: row.color }}
                            />
                            <span className="font-medium text-foreground">{row.name}</span>
                          </span>
                        ),
                      },
                      {
                        key: 'share',
                        header: 'Participação',
                        hideOnMobile: true,
                        render: row => `${Math.round(row.share * 100)}%`,
                      },
                      {
                        key: 'value',
                        header: 'Receita no mês',
                        align: 'right',
                        render: row => (
                          <span className="font-medium text-foreground">{formatCurrency(row.value)}</span>
                        ),
                      },
                    ]}
                    rows={revenueSplit}
                    rowKey={row => row.name}
                  />
                </CardContent>
                <div className="flex items-center justify-between border-t border-border p-4 text-sm">
                  <span className="font-medium text-foreground">Receita total</span>
                  <span className="font-bold text-foreground">
                    {formatCurrency(Math.round(totalRevenue))}
                  </span>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="despesas" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Despesas operacionais</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cada linha como proporção da receita do período.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'category',
                        header: 'Categoria',
                        render: row => <span className="font-medium text-foreground">{row.category}</span>,
                      },
                      {
                        key: 'share',
                        header: '% da receita',
                        hideOnMobile: true,
                        render: row => `${Math.round(row.ratio * 100)}%`,
                      },
                      {
                        key: 'bar',
                        header: 'Peso',
                        hideOnMobile: true,
                        render: row => (
                          <span className="block h-2 w-32 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full bg-rose-400"
                              style={{ width: `${row.ratio * 400}%` }}
                            />
                          </span>
                        ),
                      },
                      {
                        key: 'value',
                        header: 'Valor no mês',
                        align: 'right',
                        render: row => (
                          <span className="font-medium text-foreground">
                            {formatCurrency(Math.round(totalRevenue * row.ratio))}
                          </span>
                        ),
                      },
                    ]}
                    rows={EXPENSE_RATIOS}
                    rowKey={row => row.category}
                  />
                </CardContent>
                <div className="flex items-center justify-between border-t border-border p-4 text-sm">
                  <span className="font-medium text-foreground">Total de despesas</span>
                  <span className="font-bold text-rose-600">
                    {formatCurrency(Math.round(totalExpenses))}
                  </span>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="inadimplencia" className="m-0 space-y-5">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Carteira por faixa de atraso</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Quanto da receita está em dia e quanto já passou do vencimento.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'label',
                        header: 'Faixa',
                        render: row => (
                          <span className="flex items-center gap-2">
                            <row.icon className={cn('h-4 w-4 shrink-0', row.tone)} />
                            <span className="font-medium text-foreground">{row.label}</span>
                          </span>
                        ),
                      },
                      {
                        key: 'share',
                        header: '% da carteira',
                        hideOnMobile: true,
                        render: row => `${Math.round(row.share * 100)}%`,
                      },
                      {
                        key: 'clients',
                        header: 'Beneficiários',
                        hideOnMobile: true,
                        render: row => Math.round(clients.length * row.share).toLocaleString('pt-BR'),
                      },
                      {
                        key: 'value',
                        header: 'Valor',
                        align: 'right',
                        render: row => (
                          <span className="font-medium text-foreground">
                            {formatCurrency(Math.round(totalRevenue * row.share))}
                          </span>
                        ),
                      },
                    ]}
                    rows={RECEIVABLES}
                    rowKey={row => row.label}
                  />
                </CardContent>
              </Card>

              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Beneficiários com pendência</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cadastros com mensalidade não confirmada.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'name',
                        header: 'Beneficiário',
                        render: row => <span className="font-medium text-foreground">{row.name}</span>,
                      },
                      {
                        key: 'plan',
                        header: 'Plano',
                        hideOnMobile: true,
                        render: row => <span className="text-muted-foreground">{row.plan}</span>,
                      },
                      {
                        key: 'city',
                        header: 'Cidade',
                        hideOnMobile: true,
                        render: row => <span className="text-muted-foreground">{row.city ?? '—'}</span>,
                      },
                      {
                        key: 'value',
                        header: 'Mensalidade',
                        align: 'right',
                        render: row => formatCurrency(planPrices.get(row.plan) ?? 0),
                      },
                    ]}
                    rows={overdueClients}
                    rowKey={row => row.id}
                    empty="Nenhuma pendência na carteira."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="fluxo" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Fluxo de caixa</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Entradas, saídas e saldo acumulado mês a mês.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'month',
                        header: 'Mês',
                        render: row => <span className="font-medium text-foreground">{row.month}</span>,
                      },
                      {
                        key: 'in',
                        header: 'Entradas',
                        render: row => (
                          <span className="text-emerald-600">{formatCurrency(row.receita)}</span>
                        ),
                      },
                      {
                        key: 'out',
                        header: 'Saídas',
                        render: row => (
                          <span className="text-rose-600">-{formatCurrency(row.despesas)}</span>
                        ),
                      },
                      {
                        key: 'result',
                        header: 'Resultado',
                        hideOnMobile: true,
                        render: row => formatCurrency(row.resultado),
                      },
                      {
                        key: 'balance',
                        header: 'Saldo acumulado',
                        align: 'right',
                        render: row => (
                          <span className="font-medium text-foreground">
                            {formatCurrency(row.saldo)}
                          </span>
                        ),
                      },
                    ]}
                    rows={cashFlow}
                    rowKey={row => row.month}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dre" className="m-0">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Demonstrativo de resultado</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Competência de {formatMonthLabel(reference)}.
                  </p>
                </CardHeader>
                <CardContent className="space-y-0">
                  {dreLines.map(line => (
                    <div
                      key={line.label}
                      className={cn(
                        'flex items-center justify-between gap-3 border-b border-border/50 py-2.5 text-sm last:border-0',
                        line.emphasis && 'border-t border-border font-semibold',
                        line.indent && 'pl-4',
                      )}
                    >
                      <span
                        className={cn(
                          'min-w-0 truncate',
                          line.emphasis ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {line.label}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 tabular-nums',
                          line.value < 0 ? 'text-rose-600' : 'text-foreground',
                          line.emphasis && 'font-bold',
                        )}
                      >
                        {line.value < 0 ? '-' : ''}
                        {formatCurrency(Math.abs(Math.round(line.value)))}
                      </span>
                    </div>
                  ))}

                  <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
                    <span className="text-sm font-semibold text-emerald-900">Margem líquida</span>
                    <span className="text-lg font-bold text-emerald-700">
                      {totalRevenue === 0
                        ? '0%'
                        : `${Math.round(((netRevenue - totalExpenses) / totalRevenue) * 100)}%`}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          <div className="space-y-5 xl:col-span-4">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Distribuição da Receita</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="relative h-36 flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={revenueSplit}
                            cx="50%"
                            cy="50%"
                            innerRadius={44}
                            outerRadius={66}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                          >
                            {revenueSplit.map(item => (
                              <Cell key={item.name} fill={item.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={chartTooltipStyle}
                            labelStyle={{ display: 'none' }}
                            formatter={(value: number) => formatCurrency(value)}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-sm font-bold text-foreground">
                          {formatCurrency(Math.round(totalRevenue))}
                        </span>
                        <span className="text-[11px] text-muted-foreground">Total</span>
                      </div>
                    </div>
                    <ul className="w-36 shrink-0 space-y-2 text-xs">
                      {revenueSplit.map(item => (
                        <li key={item.name} className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="truncate text-muted-foreground">{item.name}</span>
                          <span className="ml-auto font-semibold text-foreground">
                            {Math.round(item.share * 100)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Contas a receber</CardTitle>
                  <CardAction className="self-center">
                    <span className="text-sm font-medium text-primary">Ver todos</span>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {RECEIVABLES.map(item => {
                    const Icon = item.icon
                    return (
                      <div key={item.label} className="flex items-center gap-3 text-sm">
                        <Icon className={cn('h-4 w-4 shrink-0', item.tone)} />
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label}</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(Math.round(totalRevenue * item.share))}
                        </span>
                        <span className="w-9 text-right text-xs text-muted-foreground">
                          {Math.round(item.share * 100)}%
                        </span>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Ações rápidas</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Gerar boletos', icon: FileText },
                    { label: 'Registrar despesa', icon: MinusCircle },
                    { label: 'Exportar DRE', icon: ChartPie },
                    { label: 'Conciliação bancária', icon: Landmark },
                  ].map(action => {
                    const Icon = action.icon
                    return (
                      <button
                        key={action.label}
                        type="button"
                        className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{action.label}</span>
                      </button>
                    )
                  })}
                </CardContent>
              </Card>
          </div>
        </div>
      </Tabs>
    </div>
  )
}
