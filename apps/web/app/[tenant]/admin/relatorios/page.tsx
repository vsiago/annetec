'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  ChartPie,
  ChevronRight,
  CircleDollarSign,
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
import { useTenant } from '@/contexts/tenant-context'
import { useActionData } from '@/components/admin/faturamento/use-action-data'
import { getBillingSummaryAction } from '@/lib/actions/faturamento-api'
import { cn } from '@/lib/utils'
import { downloadCsv } from '@/lib/download-csv'

/** Atalhos para os recortes desta página (cada um abre a aba correspondente). */
const AVAILABLE_REPORTS = [
  { tab: 'vendas', name: 'Vendas por vendedor', hint: 'Desempenho da equipe no período', icon: BarChart3, tone: 'bg-rose-50 text-rose-500' },
  { tab: 'beneficiarios', name: 'Beneficiários por cidade', hint: 'Onde a carteira está concentrada', icon: UsersRound, tone: 'bg-sky-50 text-sky-500' },
  { tab: 'financeiro', name: 'Resumo financeiro', hint: 'Receita recorrente, adesões e comissão', icon: Wallet, tone: 'bg-emerald-50 text-emerald-500' },
  { tab: 'comissoes', name: 'Comissões mês a mês', hint: 'Fechamento dos últimos meses', icon: Percent, tone: 'bg-violet-50 text-violet-500' },
  { tab: 'parceiros', name: 'Rede de parceiros', hint: 'Cobertura por categoria', icon: Handshake, tone: 'bg-indigo-50 text-indigo-500' },
  { tab: 'atendimentos', name: 'Atendimentos por assunto', hint: 'O que os associados procuram', icon: Stethoscope, tone: 'bg-amber-50 text-amber-500' },
]

/** Cores fixas por situação de assinatura — mesma leitura de semáforo do Faturamento. */
const SUBSCRIPTION_SPLIT = [
  { key: 'activeSubscriptions', name: 'Em dia', color: '#22c55e' },
  { key: 'pendingSubscriptions', name: 'Aguardando 1º pagamento', color: '#3b82f6' },
  { key: 'pastDueSubscriptions', name: 'Em atraso', color: '#f59e0b' },
  { key: 'suspendedSubscriptions', name: 'Suspensas', color: '#e11d48' },
] as const

export default function AdminRelatoriosPage() {
  const { tenant } = useTenant()
  const { users, sales, clientPlans, partners, appointments, isLoading } = useTenantData()
  const colors = useChartColors()
  const slug = tenant?.slug ?? ''
  const billing = useActionData(slug ? () => getBillingSummaryAction(slug) : null, [slug])

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
  /** Mensalidade somada por plano, da carteira ativa. */
  const revenueByPlan = planShare.map(item => ({
    name: item.name,
    color: item.color,
    value: item.value * (planPrices.get(item.name) ?? 0),
  }))
  const revenueByPlanTotal = revenueByPlan.reduce((sum, item) => sum + item.value, 0)
  const revenueSplit = revenueByPlan
    .filter(item => item.value > 0)
    .map(item => ({ ...item, share: revenueByPlanTotal === 0 ? 0 : item.value / revenueByPlanTotal }))

  /** Situação das assinaturas do Clube de Benefícios, do resumo de Faturamento. */
  const summary = billing.data
  const subscriptionTotal = summary
    ? SUBSCRIPTION_SPLIT.reduce((sum, item) => sum + summary[item.key], 0)
    : 0
  const subscriptionSplit = summary
    ? SUBSCRIPTION_SPLIT.map(item => ({
        name: item.name,
        color: item.color,
        value: summary[item.key],
        share: subscriptionTotal === 0 ? 0 : summary[item.key] / subscriptionTotal,
      })).filter(item => item.value > 0)
    : []

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

  /** Exporta em CSV os dados da aba aberta, os mesmos que a tela mostra. */
  const exportTab = () => {
    const rows: Array<Array<string | number>> = (() => {
      switch (tab) {
        case 'vendas':
          return [['Vendedor', 'Vendas', 'Valor'], ...salesBySeller.map(r => [r.label, r.count, r.value])]
        case 'beneficiarios':
          return [['Cidade', 'Beneficiários', 'Mensalidade somada'], ...clientsByCity.map(r => [r.label, r.count, r.value])]
        case 'financeiro':
          return [
            ['Plano', 'Mensalidade somada', 'Participação'],
            ...revenueSplit.map(r => [r.name, r.value, `${Math.round(r.share * 100)}%`]),
            [],
            ['Situação das assinaturas', 'Quantidade'],
            ...subscriptionSplit.map(r => [r.name, r.value]),
          ]
        case 'parceiros':
          return [
            ['Categoria', 'Parceiros', 'Cidades', 'Desconto médio (%)'],
            ...partnersByCategory.map(r => [r.label, r.count, r.cities, r.discount]),
          ]
        case 'atendimentos':
          return [['Assunto', 'Atendimentos'], ...appointmentsByProvider.map(r => [r.label, r.count])]
        case 'comissoes':
          return [
            ['Mês', 'Vendas', 'Valor vendido', 'Comissão'],
            ...commissionByMonth.map(r => [r.label, r.count, r.value, r.commission]),
          ]
        default:
          return [
            ['Indicador', 'Valor'],
            ['Beneficiários ativos', activeClients.length],
            ['Vendas no período', periodSales.length],
            ['Receita no período', Math.round(revenue)],
            ['Taxa de renovação (%)', renewalRate],
            [],
            ['Mês', 'Vendas'],
            ...salesSeries.map(r => [r.month, r.vendas]),
          ]
      }
    })()
    downloadCsv(`relatorio-${tab}-${referenceMonth}.csv`, rows)
  }

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
        <Button className="h-11 gap-2 px-5" onClick={exportTab}>
          <FileText className="h-4 w-4" />
          Exportar CSV
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={UsersRound}
          accent="success"
          value={activeClients.length.toLocaleString('pt-BR')}
          label="Beneficiários ativos"
        />
        <StatCard
          icon={BarChart3}
          accent="primary"
          value={periodSales.length.toLocaleString('pt-BR')}
          label="Vendas no período"
        />
        <StatCard
          icon={CircleDollarSign}
          accent="info"
          value={formatCurrency(Math.round(revenue))}
          label="Receita no período"
        />
        <StatCard
          icon={ChartPie}
          accent="warning"
          value={`${renewalRate}%`}
          label="Taxa de renovação"
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
              <SectionTab value="atendimentos">Atendimentos</SectionTab>
              <SectionTab value="comissoes">Comissões</SectionTab>
            </SectionTabsList>

            <TabsContent value="visao" className="m-0 space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <Card className="shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Evolução de Vendas</CardTitle>
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
                  title="Receita por Plano"
                  centerValue={formatCurrency(Math.round(revenueByPlanTotal))}
                  centerLabel="Total"
                  data={revenueSplit}
                  formatItem={item => `${Math.round(item.share * 100)}%`}
                  empty="A divisão aparece quando houver beneficiários ativos em planos com preço."
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
                  title="Situação das Assinaturas"
                  centerValue={subscriptionTotal.toLocaleString('pt-BR')}
                  centerLabel="assinaturas"
                  data={subscriptionSplit}
                  formatItem={item => `${(item.share * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                  empty={
                    billing.loading
                      ? 'Carregando…'
                      : billing.error
                        ? billing.error
                        : 'Nenhuma assinatura no Clube de Benefícios ainda.'
                  }
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

            <TabsContent value="atendimentos" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Atendimentos por assunto</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Chamados abertos na mesa de atendimento, agrupados pelo assunto.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'label',
                        header: 'Assunto',
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
                    onClick={() => setTab(report.tab)}
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
  empty,
}: {
  title: string
  centerValue: string
  centerLabel: string
  data: { name: string; value: number; color: string; share: number }[]
  formatItem: (item: { share: number }) => string
  /** Mensagem no lugar do gráfico quando não há fatia nenhuma. */
  empty: string
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="flex h-40 items-center justify-center px-4 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
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
        )}
      </CardContent>
    </Card>
  )
}
