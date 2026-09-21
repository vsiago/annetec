'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  ChartPie,
  ChevronRight,
  CircleDollarSign,
  CircleAlert,
  CalendarClock,
  FileText,
  Handshake,
  Percent,
  Stethoscope,
  Users,
  UsersRound,
  Wallet,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { DataTable, SummaryRow } from '@/components/dashboard/table-controls'
import { getAllClients, getAllSellers, useTenantData } from '@/contexts/tenant-data-context'
import {
  formatCurrency,
  formatMonthLabel,
  formatMonthRange,
  lastMonths,
  monthKeyOf,
  planDistribution,
} from '@/lib/analytics'
import { useChartColors } from '@/lib/use-chart-colors'
import { cn } from '@/lib/utils'

const AVAILABLE_REPORTS = [
  { name: 'Relatório de Vendas', hint: 'Por período, plano e vendedor', icon: BarChart3, tone: 'bg-rose-50 text-rose-500' },
  { name: 'Relatório de Beneficiários', hint: 'Ativos, novos, cancelados e inadimplentes', icon: UsersRound, tone: 'bg-sky-50 text-sky-500' },
  { name: 'Relatório Financeiro', hint: 'Receitas, despesas e fluxo de caixa', icon: Wallet, tone: 'bg-emerald-50 text-emerald-500' },
  { name: 'Relatório de Comissões', hint: 'Por vendedor, período e status', icon: Percent, tone: 'bg-violet-50 text-violet-500' },
  { name: 'Relatório de Clínicas', hint: 'Atendimentos, especialidades e ocupação', icon: Stethoscope, tone: 'bg-amber-50 text-amber-500' },
  { name: 'Relatório de Inadimplência', hint: 'Por plano, faixa de atraso e região', icon: CircleAlert, tone: 'bg-red-50 text-red-500' },
  { name: 'Relatório de Rede de Parceiros', hint: 'Desempenho por parceiro', icon: Handshake, tone: 'bg-indigo-50 text-indigo-500' },
  { name: 'Relatório Personalizado', hint: 'Monte seu relatório sob medida', icon: FileText, tone: 'bg-slate-100 text-slate-500' },
]

const REVENUE_SPLIT = [
  { name: 'Planos de Saúde', share: 0.58, color: '#e11d48' },
  { name: 'Odontológico', share: 0.18, color: '#3b82f6' },
  { name: 'Assistências', share: 0.14, color: '#22c55e' },
  { name: 'Outros', share: 0.1, color: '#f59e0b' },
]

const PAYMENT_STATUS = [
  { name: 'Pagos', share: 0.785, color: '#22c55e' },
  { name: 'Em aberto', share: 0.11, color: '#f59e0b' },
  { name: 'Atrasados', share: 0.105, color: '#e11d48' },
]

export default function AdminRelatoriosPage() {
  const { users, sales, clientPlans, partners, appointments, isLoading } = useTenantData()
  const colors = useChartColors()

  const months = useMemo(() => [...lastMonths(12)].reverse(), [])
  const [referenceMonth, setReferenceMonth] = useState(() => months[0]?.key ?? '')
  const [tab, setTab] = useState('visao')

  const clients = getAllClients(users)
  const activeClients = clients.filter(c => c.planStatus === 'active')
  const planPrices = useMemo(
    () => new Map(clientPlans.map(plan => [plan.name, plan.priceMonthly])),
    [clientPlans],
  )

  const reference = months.find(m => m.key === referenceMonth)?.date ?? new Date()
  const referenceEnd = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59)

  const revenue = clients
    .filter(c => c.planStatus !== 'cancelled' && new Date(c.contractDate) <= referenceEnd)
    .reduce((sum, c) => sum + (planPrices.get(c.plan) ?? 0), 0)

  const periodSales = sales.filter(
    sale => monthKeyOf(sale.date) === referenceMonth && sale.status !== 'cancelled',
  )

  const renewalRate = clients.length === 0 ? 0 : Math.round((activeClients.length / clients.length) * 100)

  const salesSeries = useMemo(
    () =>
      lastMonths(10).map(bucket => ({
        month: bucket.label,
        vendas: sales.filter(
          sale => monthKeyOf(sale.date) === bucket.key && sale.status !== 'cancelled',
        ).length,
      })),
    [sales],
  )

  const planShare = planDistribution(activeClients, colors.palette)
  const revenueSplit = REVENUE_SPLIT.map(item => ({ ...item, value: Math.round(revenue * item.share) }))
  const totalBoletos = activeClients.length
  const paymentSplit = PAYMENT_STATUS.map(item => ({
    ...item,
    value: Math.round(totalBoletos * item.share),
  }))

  const sellers = getAllSellers(users)

  /** Agrupa uma lista por chave e soma valor/contagem — base das abas de recorte. */
  function group<T>(items: T[], key: (item: T) => string, amount: (item: T) => number) {
    const map = new Map<string, { label: string; count: number; value: number }>()
    items.forEach(item => {
      const label = key(item) || 'Sem classificação'
      const current = map.get(label) ?? { label, count: 0, value: 0 }
      current.count += 1
      current.value += amount(item)
      map.set(label, current)
    })
    return [...map.values()].sort((a, b) => b.count - a.count)
  }

  const salesBySeller = useMemo(
    () => group(periodSales, sale => sale.sellerName, sale => sale.value),
    [periodSales],
  )

  const clientsByCity = useMemo(
    () => group(activeClients, client => client.city ?? '', client => planPrices.get(client.plan) ?? 0),
    [activeClients, planPrices],
  )

  const partnersByCategory = useMemo(() => {
    const labels: Record<string, string> = {
      health: 'Clínicas e laboratórios',
      dental: 'Odontologia',
      pharmacy: 'Farmácia',
      wellness: 'Bem-estar',
      food: 'Alimentação',
      education: 'Educação',
      other: 'Outros',
    }
    const map = new Map<string, { label: string; count: number; cities: number; discount: number }>()
    const cityIndex = new Map<string, Set<string>>()
    partners.forEach(partner => {
      const label = labels[partner.category] ?? partner.category
      const current = map.get(label) ?? { label, count: 0, cities: 0, discount: 0 }
      current.count += 1
      current.discount += partner.discountPercent
      map.set(label, current)
      const cities = cityIndex.get(label) ?? new Set<string>()
      if (partner.city) cities.add(partner.city)
      cityIndex.set(label, cities)
    })
    return [...map.values()]
      .map(item => ({
        ...item,
        cities: cityIndex.get(item.label)?.size ?? 0,
        discount: Math.round(item.discount / Math.max(item.count, 1)),
      }))
      .sort((a, b) => b.count - a.count)
  }, [partners])

  /**
   * Chamados de suporte por assunto. Antes era "por prestador", agrupando por
   * `appointment.provider` — campo que só existia no mock. Atendimento é
   * chamado do clube, não visita a prestador; o que ele de fato responde é
   * sobre o que o associado procurou a gente.
   */
  const appointmentsByProvider = useMemo(
    () => group(appointments, item => item.subject || 'Sem assunto', () => 0).slice(0, 12),
    [appointments],
  )

  const commissionByMonth = useMemo(
    () =>
      [...lastMonths(8)].reverse().map(bucket => {
        const bucketSales = sales.filter(
          sale => monthKeyOf(sale.date) === bucket.key && sale.status !== 'cancelled',
        )
        return {
          label: formatMonthLabel(bucket.date),
          count: bucketSales.length,
          value: bucketSales.reduce((sum, sale) => sum + sale.value, 0),
          commission: bucketSales.reduce((sum, sale) => sum + sale.commission, 0),
        }
      }),
    [sales],
  )

  if (isLoading) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Relatórios"
        description="Visualize indicadores, acompanhe resultados e tome decisões com mais segurança."
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
          <FileText className="h-4 w-4" />
          Gerar relatório
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={UsersRound}
          accent="success"
          value={activeClients.length.toLocaleString('pt-BR')}
          label="Beneficiários ativos"
          delta={{ value: '12%', direction: 'up' }}
          comparison="vs. período anterior"
        />
        <StatCard
          icon={BarChart3}
          accent="primary"
          value={periodSales.length.toLocaleString('pt-BR')}
          label="Vendas no período"
          delta={{ value: '18%', direction: 'up' }}
          comparison="vs. período anterior"
        />
        <StatCard
          icon={CircleDollarSign}
          accent="info"
          value={formatCurrency(Math.round(revenue))}
          label="Receita no período"
          delta={{ value: '15%', direction: 'up' }}
          comparison="vs. período anterior"
        />
        <StatCard
          icon={ChartPie}
          accent="warning"
          value={`${renewalRate}%`}
          label="Taxa de renovação"
          delta={{ value: '4 p.p.', direction: 'up' }}
          comparison="vs. período anterior"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <Tabs value={tab} onValueChange={setTab} className="gap-5">
            <SectionTabsList>
              <SectionTab value="visao">Visão Geral</SectionTab>
              <SectionTab value="vendas">Vendas</SectionTab>
              <SectionTab value="beneficiarios">Beneficiários</SectionTab>
              <SectionTab value="financeiro">Financeiro</SectionTab>
              <SectionTab value="parceiros">Rede de Parceiros</SectionTab>
              <SectionTab value="clinicas">Clínicas</SectionTab>
              <SectionTab value="comissoes">Comissões</SectionTab>
            </SectionTabsList>

            <TabsContent value="visao" className="m-0 space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Evolução de Vendas</CardTitle>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      ↑ 18%
                    </span>
                  </CardHeader>
                  <CardContent>
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={salesSeries} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                          <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 3" />
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                          <Tooltip
                            cursor={{ fill: 'transparent' }}
                            contentStyle={chartTooltipStyle}
                            formatter={(value: number) => [value, 'Vendas']}
                          />
                          <Bar dataKey="vendas" fill={colors.primary} radius={[4, 4, 0, 0]} maxBarSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <DonutCard
                  title="Receita por Categoria"
                  centerValue={formatCurrency(Math.round(revenue))}
                  centerLabel="Total"
                  data={revenueSplit}
                  formatItem={item => `${Math.round(item.share * 100)}%`}
                />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Beneficiários por Plano</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {planShare.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Nenhum beneficiário ativo ainda.
                      </p>
                    )}
                    {planShare.map(item => {
                      const max = Math.max(...planShare.map(p => p.value), 1)
                      return (
                        <div key={item.name} className="flex items-center gap-3 text-sm">
                          <span className="w-28 shrink-0 truncate text-muted-foreground">{item.name}</span>
                          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${(item.value / max) * 100}%`,
                                backgroundColor: item.color,
                              }}
                            />
                          </span>
                          <span className="w-12 text-right font-semibold text-foreground">
                            {item.value.toLocaleString('pt-BR')}
                          </span>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>

                <DonutCard
                  title="Status de Pagamentos"
                  centerValue={totalBoletos.toLocaleString('pt-BR')}
                  centerLabel="boletos"
                  data={paymentSplit}
                  formatItem={item => `${(item.share * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                />
              </div>
            </TabsContent>

            <TabsContent value="vendas" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Vendas por vendedor</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Desempenho da equipe no período selecionado.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'name',
                        header: 'Vendedor',
                        render: row => <span className="font-medium text-foreground">{row.label}</span>,
                      },
                      { key: 'count', header: 'Vendas', render: row => row.count },
                      {
                        key: 'value',
                        header: 'Valor vendido',
                        hideOnMobile: true,
                        render: row => formatCurrency(Math.round(row.value)),
                      },
                      {
                        key: 'share',
                        header: 'Participação',
                        align: 'right',
                        render: row => <ShareBar value={row.count} total={periodSales.length} />,
                      },
                    ]}
                    rows={salesBySeller}
                    rowKey={row => row.label}
                    empty="Nenhuma venda no período."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="beneficiarios" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Beneficiários por cidade</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Onde a carteira está concentrada.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'city',
                        header: 'Cidade',
                        render: row => <span className="font-medium text-foreground">{row.label}</span>,
                      },
                      { key: 'count', header: 'Ativos', render: row => row.count },
                      {
                        key: 'value',
                        header: 'Mensalidade somada',
                        hideOnMobile: true,
                        render: row => formatCurrency(Math.round(row.value)),
                      },
                      {
                        key: 'share',
                        header: 'Participação',
                        align: 'right',
                        render: row => <ShareBar value={row.count} total={activeClients.length} />,
                      },
                    ]}
                    rows={clientsByCity}
                    rowKey={row => row.label}
                    empty="Nenhum beneficiário ativo."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="financeiro" className="m-0">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Resumo financeiro do período</CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <SummaryRow label="Receita recorrente da carteira" value={formatCurrency(Math.round(revenue))} />
                  <SummaryRow
                    label="Ticket médio por beneficiário"
                    value={formatCurrency(
                      activeClients.length === 0 ? 0 : Math.round(revenue / activeClients.length),
                    )}
                  />
                  <SummaryRow label="Vendas fechadas no período" value={periodSales.length.toLocaleString('pt-BR')} />
                  <SummaryRow
                    label="Valor das adesões novas"
                    value={formatCurrency(Math.round(periodSales.reduce((sum, sale) => sum + sale.value, 0)))}
                  />
                  <SummaryRow
                    label="Comissão gerada"
                    value={formatCurrency(Math.round(periodSales.reduce((sum, sale) => sum + sale.commission, 0)))}
                  />
                  <SummaryRow
                    label="Receita projetada em 12 meses"
                    value={formatCurrency(Math.round(revenue * 12))}
                    emphasis
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="parceiros" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Rede credenciada por categoria</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Cobertura da rede que o beneficiário encontra.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'label',
                        header: 'Categoria',
                        render: row => <span className="font-medium text-foreground">{row.label}</span>,
                      },
                      { key: 'count', header: 'Parceiros', render: row => row.count },
                      {
                        key: 'cities',
                        header: 'Cidades atendidas',
                        hideOnMobile: true,
                        render: row => row.cities,
                      },
                      {
                        key: 'discount',
                        header: 'Desconto médio',
                        align: 'right',
                        render: row => `${row.discount}%`,
                      },
                    ]}
                    rows={partnersByCategory}
                    rowKey={row => row.label}
                    empty="Nenhum parceiro credenciado."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="clinicas" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Atendimentos por prestador</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Volume de uso da rede pelos beneficiários.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'label',
                        header: 'Prestador',
                        render: row => <span className="font-medium text-foreground">{row.label}</span>,
                      },
                      { key: 'count', header: 'Atendimentos', render: row => row.count },
                      {
                        key: 'share',
                        header: 'Participação',
                        align: 'right',
                        render: row => <ShareBar value={row.count} total={appointments.length} />,
                      },
                    ]}
                    rows={appointmentsByProvider}
                    rowKey={row => row.label}
                    empty="Nenhum atendimento registrado."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="comissoes" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Comissão mês a mês</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Fechamento de comissão dos últimos meses.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'month',
                        header: 'Competência',
                        render: row => <span className="font-medium text-foreground">{row.label}</span>,
                      },
                      { key: 'count', header: 'Vendas', render: row => row.count },
                      {
                        key: 'value',
                        header: 'Valor vendido',
                        hideOnMobile: true,
                        render: row => formatCurrency(Math.round(row.value)),
                      },
                      {
                        key: 'commission',
                        header: 'Comissão',
                        align: 'right',
                        render: row => (
                          <span className="font-medium text-foreground">
                            {formatCurrency(Math.round(row.commission))}
                          </span>
                        ),
                      },
                    ]}
                    rows={commissionByMonth}
                    rowKey={row => row.label}
                    empty="Sem histórico de comissões."
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="border-sky-100 bg-sky-50/60 shadow-none">
            <CardContent className="flex flex-wrap items-center gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-500 shadow-sm">
                <BarChart3 className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">Precisa de um relatório específico?</p>
                <p className="text-sm text-muted-foreground">
                  Fale com nossa equipe e configure relatórios personalizados para a sua operação.
                </p>
              </div>
              <Button variant="outline" className="bg-card">
                Solicitar relatório personalizado →
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Relatórios Disponíveis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {AVAILABLE_REPORTS.map(report => {
                const Icon = report.icon
                return (
                  <button
                    key={report.name}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted"
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        report.tone,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {report.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{report.hint}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Button variant="outline" className="h-12 w-full gap-2 border-primary/30 text-primary">
            <CalendarClock className="h-4 w-4" />
            Agendar envio de relatórios
          </Button>
        </div>
      </div>
    </div>
  )
}

function ShareBar({ value, total }: { value: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100)
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="hidden h-2 w-20 overflow-hidden rounded-full bg-muted sm:block">
        <span className="block h-full rounded-full bg-primary" style={{ width: percent + '%' }} />
      </span>
      <span className="w-9 text-right font-medium text-foreground">{percent}%</span>
    </span>
  )
}

function DonutCard({
  title,
  centerValue,
  centerLabel,
  data,
  formatItem,
}: {
  title: string
  centerValue: string
  centerLabel: string
  data: { name: string; value: number; color: string; share: number }[]
  formatItem: (item: { share: number }) => string
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className="relative h-40 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={46}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map(item => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ display: 'none' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-bold text-foreground">{centerValue}</span>
              <span className="text-[11px] text-muted-foreground">{centerLabel}</span>
            </div>
          </div>
          <ul className="w-36 shrink-0 space-y-2 text-xs">
            {data.map(item => (
              <li key={item.name} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="truncate text-muted-foreground">{item.name}</span>
                <span className="ml-auto font-semibold text-foreground">{formatItem(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
