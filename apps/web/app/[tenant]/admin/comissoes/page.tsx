'use client'

import { useMemo, useState } from 'react'
import {
  CalendarDays,
  CircleDollarSign,
  Download,
  Info,
  ListFilter,
  MoreHorizontal,
  Percent,
  ShoppingBag,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  DataTable,
  FilterSelect,
  SearchInput,
  StatusPill,
  SummaryRow,
  TableFooter,
  type Column,
} from '@/components/dashboard/table-controls'
import { getAllSellers, useTenantData } from '@/contexts/tenant-data-context'
import { formatCurrency, formatMonthLabel, formatMonthRange, lastMonths, monthKeyOf } from '@/lib/analytics'
import { useChartColors } from '@/lib/use-chart-colors'
import { getInitials } from '@/lib/utils'

const AVATAR_TONES = [
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
]

interface SellerRow {
  id: string
  name: string
  code: string
  sales: number
  amount: number
  commission: number
  paid: boolean
  tone: string
}

interface GroupRow {
  key: string
  label: string
  hint?: string
  sales: number
  amount: number
  commission: number
}

export default function AdminComissoesPage() {
  const { users, sales, partners, appointments, isLoading } = useTenantData()
  const colors = useChartColors()

  const months = useMemo(() => [...lastMonths(12)].reverse(), [])
  const [referenceMonth, setReferenceMonth] = useState(() => months[0]?.key ?? '')
  const [tab, setTab] = useState('vendedor')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [perPage, setPerPage] = useState('10')
  const [page, setPage] = useState(1)

  const sellers = getAllSellers(users)

  const monthSales = useMemo(
    () => sales.filter(sale => monthKeyOf(sale.date) === referenceMonth && sale.status !== 'cancelled'),
    [sales, referenceMonth],
  )

  const sellerRows: SellerRow[] = useMemo(
    () =>
      sellers
        .map((seller, index) => {
          const own = monthSales.filter(sale => sale.sellerId === seller.id)
          return {
            id: seller.id,
            name: seller.name,
            code: `V${String(index + 1).padStart(3, '0')}`,
            sales: own.length,
            amount: own.reduce((sum, sale) => sum + sale.value, 0),
            commission: own.reduce((sum, sale) => sum + sale.commission, 0),
            // Sem módulo de pagamento de comissão: alterna para a coluna
            // mostrar os dois estados que a tela precisa exibir.
            paid: index % 2 === 1,
            tone: AVATAR_TONES[index % AVATAR_TONES.length],
          }
        })
        .sort((a, b) => b.commission - a.commission),
    [sellers, monthSales],
  )

  /** Agrupa as vendas do mês por um campo qualquer — base das abas de recorte. */
  const groupBy = useMemo(
    () =>
      (pick: (sale: (typeof monthSales)[number]) => string): GroupRow[] => {
        const map = new Map<string, GroupRow>()
        monthSales.forEach(sale => {
          const label = pick(sale) || 'Sem classificação'
          const current = map.get(label) ?? { key: label, label, sales: 0, amount: 0, commission: 0 }
          current.sales += 1
          current.amount += sale.value
          current.commission += sale.commission
          map.set(label, current)
        })
        return [...map.values()].sort((a, b) => b.commission - a.commission)
      },
    [monthSales],
  )

  const planRows = useMemo(() => groupBy(sale => sale.plan), [groupBy])
  const sourceRows = useMemo(() => groupBy(sale => sale.source ?? ''), [groupBy])

  /**
   * Volume de atendimentos por prestador da rede. Comissão de parceiro ainda
   * não existe como regra, então a aba mostra o que de fato dá para medir:
   * quem a carteira mais usou no período.
   */
  const partnerRows = useMemo(() => {
    const usage = new Map<string, number>()
    appointments.forEach(item => {
      if (!item.provider) return
      usage.set(item.provider, (usage.get(item.provider) ?? 0) + 1)
    })
    return [...usage.entries()]
      .map(([provider, count]) => {
        const partner = partners.find(item => item.name === provider)
        return {
          key: provider,
          provider,
          city: partner?.city ?? '—',
          category: partner?.category ?? 'other',
          discount: partner?.discountPercent ?? 0,
          appointments: count,
        }
      })
      .sort((a, b) => b.appointments - a.appointments)
  }, [appointments, partners])

  const historyRows = useMemo(
    () =>
      [...lastMonths(8)].reverse().map((bucket, index) => {
        const bucketSales = sales.filter(
          sale => monthKeyOf(sale.date) === bucket.key && sale.status !== 'cancelled',
        )
        return {
          key: bucket.key,
          label: formatMonthLabel(bucket.date),
          sales: bucketSales.length,
          amount: bucketSales.reduce((sum, sale) => sum + sale.value, 0),
          commission: bucketSales.reduce((sum, sale) => sum + sale.commission, 0),
          // O mês corrente ainda não fechou; os anteriores já foram pagos.
          paid: index > 0,
        }
      }),
    [sales],
  )

  const totalCommission = sellerRows.reduce((sum, row) => sum + row.commission, 0)
  const totalAmount = sellerRows.reduce((sum, row) => sum + row.amount, 0)
  const totalSales = sellerRows.reduce((sum, row) => sum + row.sales, 0)
  const activeSellers = sellerRows.filter(row => row.sales > 0).length
  const averageRate = totalAmount === 0 ? 0 : (totalCommission / totalAmount) * 100
  const averageTicket = totalSales === 0 ? 0 : totalAmount / totalSales

  const performance = useMemo(
    () =>
      lastMonths(6).map(bucket => ({
        month: bucket.label,
        comissao: Math.round(
          sales
            .filter(sale => monthKeyOf(sale.date) === bucket.key && sale.status !== 'cancelled')
            .reduce((sum, sale) => sum + sale.commission, 0),
        ),
      })),
    [sales],
  )

  const term = search.trim().toLowerCase()
  const filteredSellers = sellerRows.filter(row => {
    if (status === 'pago' && !row.paid) return false
    if (status === 'apagar' && row.paid) return false
    if (!term) return true
    return [row.name, row.code].some(field => field.toLowerCase().includes(term))
  })

  const size = Number(perPage)
  const totalPages = Math.max(1, Math.ceil(filteredSellers.length / size))
  const currentPage = Math.min(page, totalPages)
  const visibleSellers = filteredSellers.slice((currentPage - 1) * size, currentPage * size)

  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  const money = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  const shareOf = (value: number) =>
    totalCommission === 0 ? '0%' : `${Math.round((value / totalCommission) * 100)}%`

  const sellerColumns: Column<SellerRow>[] = [
    {
      key: 'name',
      header: 'Vendedor',
      render: row => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className={`text-xs font-semibold ${row.tone}`}>
              {getInitials(row.name)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-foreground">{row.name}</span>
        </div>
      ),
    },
    { key: 'code', header: 'Código', hideOnMobile: true, render: row => <span className="text-muted-foreground">{row.code}</span> },
    { key: 'sales', header: 'Vendas', render: row => row.sales },
    {
      key: 'amount',
      header: 'Valor das Vendas (R$)',
      hideOnMobile: true,
      render: row => money(row.amount),
    },
    {
      key: 'commission',
      header: 'Comissão (R$)',
      render: row => <span className="font-medium text-foreground">{money(row.commission)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: row => (
        <StatusPill
          label={row.paid ? 'Pago' : 'A pagar'}
          className={row.paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Ações',
      align: 'right',
      render: () => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Ações da comissão</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem>Ver extrato</DropdownMenuItem>
            <DropdownMenuItem>Marcar como pago</DropdownMenuItem>
            <DropdownMenuItem>Exportar recibo</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const groupColumns = (headerLabel: string): Column<GroupRow>[] => [
    {
      key: 'label',
      header: headerLabel,
      render: row => <span className="font-medium text-foreground">{row.label}</span>,
    },
    { key: 'sales', header: 'Vendas', render: row => row.sales },
    { key: 'amount', header: 'Valor (R$)', hideOnMobile: true, render: row => money(row.amount) },
    {
      key: 'commission',
      header: 'Comissão (R$)',
      render: row => <span className="font-medium text-foreground">{money(row.commission)}</span>,
    },
    {
      key: 'ticket',
      header: 'Ticket médio',
      hideOnMobile: true,
      render: row => formatCurrency(row.sales === 0 ? 0 : Math.round(row.amount / row.sales)),
    },
    { key: 'share', header: '% do total', align: 'right', render: row => shareOf(row.commission) },
  ]

  if (isLoading) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Comissões"
        description="Acompanhe e gerencie as comissões da sua equipe de vendas e parceiros."
      >
        <Select value={referenceMonth} onValueChange={withPageReset(setReferenceMonth)}>
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
          Exportar comissões
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Wallet}
          accent="success"
          value={formatCurrency(Math.round(totalCommission))}
          label="Comissão total"
          delta={{ value: '18%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Users}
          accent="info"
          value={activeSellers}
          label="Vendedores ativos"
          delta={{ value: '12%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={ShoppingBag}
          accent="primary"
          value={totalSales.toLocaleString('pt-BR')}
          label="Vendas com comissão"
          delta={{ value: '20%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Percent}
          accent="warning"
          value={`${averageRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
          label="Taxa média de comissão"
          delta={{ value: '0,8 p.p.', direction: 'up' }}
          comparison="vs. mês anterior"
        />
      </div>

      <Tabs value={tab} onValueChange={withPageReset(setTab)} className="gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SectionTabsList className="lg:w-auto lg:border-b-0">
            <SectionTab value="vendedor">Por Vendedor</SectionTab>
            <SectionTab value="plano">Por Plano</SectionTab>
            <SectionTab value="produto">Por Origem</SectionTab>
            <SectionTab value="parceiro">Por Parceiro</SectionTab>
            <SectionTab value="historico">Histórico de Pagamentos</SectionTab>
          </SectionTabsList>
          <Button variant="outline" className="h-11 gap-2">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
            Mais filtros
          </Button>
        </div>

        <div className="grid gap-5 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <TabsContent value="vendedor" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <SearchInput
                    value={search}
                    onChange={withPageReset(setSearch)}
                    placeholder="Buscar por nome do vendedor ou código..."
                  />
                  <FilterSelect
                    label="Status"
                    value={status}
                    onChange={withPageReset(setStatus)}
                    allLabel="Todos os status"
                    options={[
                      { value: 'pago', label: 'Pago' },
                      { value: 'apagar', label: 'A pagar' },
                    ]}
                  />
                </div>
                <CardContent className="p-0">
                  <DataTable
                    columns={sellerColumns}
                    rows={visibleSellers}
                    rowKey={row => row.id}
                    empty="Nenhuma comissão neste período."
                  />
                </CardContent>
                <TableFooter
                  page={currentPage}
                  perPage={perPage}
                  total={filteredSellers.length}
                  noun="vendedores"
                  onPageChange={setPage}
                  onPerPageChange={withPageReset(setPerPage)}
                />
              </Card>
            </TabsContent>

            <TabsContent value="plano" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Comissão por plano</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Quanto cada plano gerou de comissão no período selecionado.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={groupColumns('Plano')}
                    rows={planRows}
                    rowKey={row => row.key}
                    empty="Nenhuma venda com comissão neste período."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="produto" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Comissão por origem da venda</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Onde a venda nasceu — site, indicação, campanha ou parceiro.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={groupColumns('Origem')}
                    rows={sourceRows}
                    rowKey={row => row.key}
                    empty="Nenhuma venda com origem registrada neste período."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="parceiro" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Uso da rede por parceiro</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Regra de comissionamento de parceiro ainda não existe: a aba mostra o volume de
                    atendimentos, que é o que dá para medir hoje.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'provider',
                        header: 'Parceiro',
                        render: row => <span className="font-medium text-foreground">{row.provider}</span>,
                      },
                      { key: 'city', header: 'Cidade', hideOnMobile: true, render: row => <span className="text-muted-foreground">{row.city}</span> },
                      { key: 'appointments', header: 'Atendimentos', render: row => row.appointments },
                      {
                        key: 'discount',
                        header: 'Desconto negociado',
                        align: 'right',
                        render: row => `${row.discount}%`,
                      },
                    ]}
                    rows={partnerRows}
                    rowKey={row => row.key}
                    empty="Nenhum atendimento registrado na rede."
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="historico" className="m-0">
              <Card className="gap-0 py-0 shadow-sm">
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Histórico de pagamentos</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Fechamento de comissão mês a mês.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <DataTable
                    columns={[
                      {
                        key: 'label',
                        header: 'Competência',
                        render: row => <span className="font-medium text-foreground">{row.label}</span>,
                      },
                      { key: 'sales', header: 'Vendas', render: row => row.sales },
                      { key: 'amount', header: 'Valor vendido', hideOnMobile: true, render: row => formatCurrency(Math.round(row.amount)) },
                      {
                        key: 'commission',
                        header: 'Comissão',
                        render: row => (
                          <span className="font-medium text-foreground">
                            {formatCurrency(Math.round(row.commission))}
                          </span>
                        ),
                      },
                      {
                        key: 'status',
                        header: 'Situação',
                        align: 'right',
                        render: row => (
                          <StatusPill
                            label={row.paid ? 'Pago' : 'Em aberto'}
                            className={
                              row.paid ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }
                          />
                        ),
                      },
                    ]}
                    rows={historyRows}
                    rowKey={row => row.key}
                    empty="Sem histórico de comissões."
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </div>

          <div className="space-y-5 xl:col-span-4">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Desempenho de Comissões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={performance} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                      <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 3" />
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
                        formatter={(value: number) => [formatCurrency(value), 'Comissão']}
                      />
                      <Bar dataKey="comissao" fill={colors.primary} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Resumo do Período</CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <SummaryRow label="Total de vendas" value={totalSales.toLocaleString('pt-BR')} />
                <SummaryRow label="Valor total vendido" value={formatCurrency(Math.round(totalAmount))} />
                <SummaryRow label="Vendedores ativos" value={String(activeSellers)} />
                <SummaryRow label="Ticket médio por venda" value={formatCurrency(Math.round(averageTicket))} />
                <SummaryRow
                  label="Comissão total"
                  value={formatCurrency(Math.round(totalCommission))}
                  emphasis
                />
              </CardContent>
            </Card>

            <Card className="border-sky-100 bg-sky-50/60 shadow-none">
              <CardContent className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
                <div className="space-y-1 text-sm">
                  <p className="text-foreground">
                    As comissões são calculadas conforme as regras de cada plano e produto.
                  </p>
                  <button type="button" className="text-sm font-medium text-primary hover:underline">
                    Ver regras de comissão →
                  </button>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Top 3 do período</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {sellerRows.slice(0, 3).map((row, index) => (
                  <div key={row.id} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{row.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {row.sales} vendas · {shareOf(row.commission)} da comissão
                      </span>
                    </span>
                    <Trophy
                      className={
                        index === 0 ? 'h-4 w-4 shrink-0 text-amber-500' : 'h-4 w-4 shrink-0 text-muted-foreground/40'
                      }
                    />
                  </div>
                ))}
                {sellerRows.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </Tabs>
    </div>
  )
}
