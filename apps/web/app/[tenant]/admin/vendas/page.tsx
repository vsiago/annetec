'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Download,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  ShoppingCart,
  Trash2,
  UsersRound,
  XCircle,
} from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { chartTooltipStyle } from '@/components/dashboard/chart-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import {
  FilterSelect,
  SearchInput,
  StatusPill,
  TableFooter,
} from '@/components/dashboard/table-controls'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import {
  ConfirmDialog,
  FormDialog,
  FormField,
  FormRow,
  FormSelect,
} from '@/components/dashboard/form-dialog'
import { getAllClients, getAllSellers, useTenantData } from '@/contexts/tenant-data-context'
import {
  formatCurrency,
  formatDelta,
  formatMonthRange,
  lastMonths,
  monthKeyOf,
  percentChange,
} from '@/lib/analytics'
import { saleSchema } from '@/lib/form-schemas'
import { saleStatusMeta } from '@/lib/sale-status'
import { useZodForm } from '@/lib/use-zod-form'
import type { Lead, Sale } from '@/lib/types'
import { useChartColors } from '@/lib/use-chart-colors'
import { cn } from '@/lib/utils'

/** Ordem das etapas do funil — quem chegou em `negotiation` passou por todas antes. */
const STAGE_RANK: Record<Lead['status'], number> = {
  lost: -1,
  new: 0,
  contacted: 1,
  qualified: 2,
  proposal: 3,
  negotiation: 4,
  closed: 5,
}

const FUNNEL_STAGES = [
  { label: 'Leads', minRank: 0, className: 'bg-primary text-primary-foreground' },
  { label: 'Em contato', minRank: 1, className: 'bg-primary/35 text-foreground' },
  { label: 'Em negociação', minRank: 4, className: 'bg-sky-200 text-sky-900' },
  { label: 'Vendas', minRank: 5, className: 'bg-emerald-200 text-emerald-900' },
]

/** Número curto da venda a partir do id, como o "#1023" da tela. */
function saleNumber(id: string): string {
  return `#${(id.split('-').pop() ?? id).slice(-6).toUpperCase()}`
}

const EMPTY_SALE = {
  clientName: '',
  sellerId: '',
  plan: '',
  value: '',
  source: 'Site',
  status: 'pending',
}

export default function AdminVendasPage() {
  const { sales, leads, users, createSale, updateSale, isLoading } = useTenantData()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Sale | null>(null)
  const [cancelling, setCancelling] = useState<Sale | null>(null)
  const form = useZodForm(saleSchema, EMPTY_SALE)
  const colors = useChartColors()

  const months = useMemo(() => [...lastMonths(12)].reverse(), [])
  const [referenceMonth, setReferenceMonth] = useState(() => months[0]?.key ?? '')
  const [funnelDays, setFunnelDays] = useState('30')
  const [evolutionMonths, setEvolutionMonths] = useState('6')

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [plan, setPlan] = useState('all')
  const [seller, setSeller] = useState('all')
  const [source, setSource] = useState('all')
  const [perPage, setPerPage] = useState('10')
  const [page, setPage] = useState(1)

  const sellers = getAllSellers(users)
  const clients = getAllClients(users)

  const plans = useMemo(() => [...new Set(sales.map(s => s.plan).filter(Boolean))].sort(), [sales])
  const sources = useMemo(
    () => [...new Set(sales.map(s => s.source).filter((v): v is string => Boolean(v)))].sort(),
    [sales],
  )

  // ---- Indicadores do mês de referência -----------------------------------
  const previousKey = useMemo(() => {
    const reference = months.find(m => m.key === referenceMonth) ?? months[0]
    if (!reference) return ''
    return monthKeyOf(new Date(reference.date.getFullYear(), reference.date.getMonth() - 1, 1))
  }, [months, referenceMonth])

  const salesIn = (key: string) =>
    sales.filter(s => monthKeyOf(s.date) === key && s.status !== 'cancelled')
  const monthSales = salesIn(referenceMonth)
  const previousSales = salesIn(previousKey)

  const revenue = monthSales.reduce((sum, s) => sum + s.value, 0)
  const previousRevenue = previousSales.reduce((sum, s) => sum + s.value, 0)

  const admissionsIn = (key: string) =>
    clients.filter(c => monthKeyOf(c.contractDate) === key).length

  const conversionIn = (key: string) => {
    const monthLeads = leads.filter(l => monthKeyOf(l.createdAt) === key)
    if (monthLeads.length === 0) return 0
    return Math.round((monthLeads.filter(l => l.status === 'closed').length / monthLeads.length) * 100)
  }
  const conversion = conversionIn(referenceMonth)
  const conversionDiff = conversion - conversionIn(previousKey)

  // ---- Funil do período escolhido no card ---------------------------------
  const funnel = useMemo(() => {
    const cutoff = new Date(Date.now() - Number(funnelDays) * 86_400_000)
    const periodLeads = leads.filter(l => new Date(l.createdAt) >= cutoff)
    const total = periodLeads.length
    return FUNNEL_STAGES.map(stage => {
      const value = periodLeads.filter(l => STAGE_RANK[l.status] >= stage.minRank).length
      return {
        ...stage,
        value,
        percent: total === 0 ? 0 : Math.round((value / total) * 100),
      }
    })
  }, [leads, funnelDays])

  // ---- Série de evolução ---------------------------------------------------
  const evolution = useMemo(
    () =>
      lastMonths(Number(evolutionMonths)).map(bucket => {
        const bucketSales = sales.filter(
          s => monthKeyOf(s.date) === bucket.key && s.status !== 'cancelled',
        )
        return {
          month: bucket.label,
          vendas: bucketSales.length,
          receita: Number((bucketSales.reduce((sum, s) => sum + s.value, 0) / 1000).toFixed(1)),
        }
      }),
    [sales, evolutionMonths],
  )

  // ---- Tabela --------------------------------------------------------------
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return sales
      .filter(sale => {
        if (status !== 'all' && sale.status !== status) return false
        if (plan !== 'all' && sale.plan !== plan) return false
        if (seller !== 'all' && sale.sellerId !== seller) return false
        if (source !== 'all' && sale.source !== source) return false
        if (!term) return true
        return [sale.clientName, sale.plan, sale.sellerName, saleNumber(sale.id)].some(field =>
          field?.toLowerCase().includes(term),
        )
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [sales, search, status, plan, seller, source])

  const size = Number(perPage)
  const totalPages = Math.max(1, Math.ceil(filtered.length / size))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * size, currentPage * size)

  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  function openCreate() {
    form.reset({
      ...EMPTY_SALE,
      sellerId: sellers[0]?.id ?? '',
      plan: plans[0] ?? '',
    })
    setCreating(true)
  }

  function openEdit(sale: Sale) {
    form.reset({
      clientName: sale.clientName,
      sellerId: sale.sellerId,
      plan: sale.plan,
      value: String(sale.value).replace('.', ','),
      source: sale.source ?? 'Site',
      status: sale.status,
    })
    setEditing(sale)
  }

  async function submitSale(existing: Sale | null): Promise<string | void> {
    const data = form.validate()
    if (!data) return 'Confira os campos destacados abaixo.'

    const seller = sellers.find(item => item.id === data.sellerId)
    if (!seller) return 'Selecione um vendedor válido.'

    const payload = {
      clientName: data.clientName,
      sellerId: seller.id,
      sellerName: seller.name,
      plan: data.plan,
      source: data.source || undefined,
      value: data.value,
      // A comissão acompanha a taxa do vendedor: digitar à mão é onde o
      // fechamento do mês costuma divergir do que foi pago.
      commission: Number((data.value * (seller.commissionRate ?? 0.1)).toFixed(2)),
      status: data.status as Sale['status'],
    }

    if (existing) {
      await updateSale(existing.id, payload)
      toast.success('Venda atualizada', { description: data.clientName })
    } else {
      await createSale({ ...payload, clientId: '', date: new Date() })
      toast.success('Venda registrada', {
        description: data.clientName + ' — ' + formatCurrency(data.value),
      })
    }
  }

  if (isLoading) return null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendas"
        description="Gerencie todo o funil de vendas, da oportunidade ao pós-venda."
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
          <Button className="h-11 gap-2 px-5" onClick={openCreate}>
            <Plus className="h-4 w-4" />
          Nova Venda
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ShoppingCart}
          accent="primary"
          value={monthSales.length.toLocaleString('pt-BR')}
          label="Vendas realizadas"
          delta={formatDelta(percentChange(monthSales.length, previousSales.length))}
          comparison="vs. período anterior"
        />
        <StatCard
          icon={CircleDollarSign}
          accent="info"
          value={formatCurrency(revenue)}
          label="Valor total das vendas"
          delta={formatDelta(percentChange(revenue, previousRevenue))}
          comparison="vs. período anterior"
        />
        <StatCard
          icon={UsersRound}
          accent="success"
          value={admissionsIn(referenceMonth).toLocaleString('pt-BR')}
          label="Novos beneficiários"
          delta={formatDelta(percentChange(admissionsIn(referenceMonth), admissionsIn(previousKey)))}
          comparison="vs. período anterior"
        />
        <StatCard
          icon={BarChart3}
          accent="warning"
          value={`${conversion}%`}
          label="Taxa de conversão"
          delta={{
            value: `${Math.abs(conversionDiff)} p.p.`,
            direction: conversionDiff === 0 ? 'neutral' : conversionDiff > 0 ? 'up' : 'down',
          }}
          comparison="vs. período anterior"
        />
      </div>

      <Card className="gap-0 py-0 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <SearchInput
            value={search}
            onChange={withPageReset(setSearch)}
            placeholder="Buscar por cliente, plano, vendedor ou nº da venda..."
          />
          <FilterSelect
            label="Status"
            value={status}
            onChange={withPageReset(setStatus)}
            allLabel="Todos"
            options={Object.entries(saleStatusMeta).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
          />
          <FilterSelect
            label="Plano"
            value={plan}
            onChange={withPageReset(setPlan)}
            allLabel="Todos"
            options={plans.map(item => ({ value: item, label: item }))}
          />
          <FilterSelect
            label="Vendedor"
            value={seller}
            onChange={withPageReset(setSeller)}
            allLabel="Todos"
            options={sellers.map(item => ({ value: item.id, label: item.name }))}
          />
          <FilterSelect
            label="Origem"
            value={source}
            onChange={withPageReset(setSource)}
            allLabel="Todas"
            options={sources.map(item => ({ value: item, label: item }))}
          />
          <Button variant="outline" className="h-14 gap-2 rounded-xl">
            <ListFilter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Mais filtros</span>
          </Button>
          <Button variant="outline" className="h-14 gap-2 rounded-xl">
            <Download className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Exportar</span>
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-12">
        <Card className="gap-0 py-0 shadow-sm xl:col-span-8">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-3 font-medium"># Venda</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Plano</th>
                    <th className="px-4 py-3 font-medium">Valor</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Vendedor</th>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-muted-foreground">
                        Nenhuma venda encontrada com os filtros atuais.
                      </td>
                    </tr>
                  )}
                  {visible.map(sale => (
                    <tr
                      key={sale.id}
                      className="border-b border-border/60 last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-3 font-medium text-muted-foreground">
                        {saleNumber(sale.id)}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{sale.clientName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{sale.plan}</td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {formatCurrency(sale.value)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill {...saleStatusMeta[sale.status]} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{sale.sellerName}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(sale.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <SaleActions
                          onEdit={() => openEdit(sale)}
                          onCancel={() => setCancelling(sale)}
                          canCancel={sale.status !== 'cancelled'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>

          <TableFooter
            page={currentPage}
            perPage={perPage}
            total={filtered.length}
            noun="vendas"
            onPageChange={setPage}
            onPerPageChange={withPageReset(setPerPage)}
          />
        </Card>

        <div className="space-y-6 xl:col-span-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Funil de Vendas</CardTitle>
              <CardAction className="self-center">
                <Select value={funnelDays} onValueChange={setFunnelDays}>
                  <SelectTrigger className="h-9 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="60">Últimos 60 dias</SelectItem>
                    <SelectItem value="90">Últimos 90 dias</SelectItem>
                  </SelectContent>
                </Select>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {funnel.map((stage, index) => (
                <div key={stage.label} className="flex items-center gap-3">
                  <div className="flex flex-1 justify-center">
                    <div
                      className={cn(
                        'flex flex-col items-center justify-center py-2 text-center',
                        stage.className,
                      )}
                      style={{
                        width: `${100 - index * 14}%`,
                        // Cada bloco afunila alguns por cento na base, e é a
                        // pilha desses cortes que desenha o funil.
                        clipPath: 'polygon(0 0, 100% 0, 93% 100%, 7% 100%)',
                      }}
                    >
                      <span className="text-sm font-bold leading-none">
                        {stage.value.toLocaleString('pt-BR')}
                      </span>
                      <span className="text-[11px] leading-tight opacity-90">{stage.label}</span>
                    </div>
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs font-semibold text-muted-foreground">
                    {stage.percent}%
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Evolução das Vendas</CardTitle>
              <CardAction className="self-center">
                <Select value={evolutionMonths} onValueChange={setEvolutionMonths}>
                  <SelectTrigger className="h-9 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="6">Últimos 6 meses</SelectItem>
                    <SelectItem value="12">Últimos 12 meses</SelectItem>
                  </SelectContent>
                </Select>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={evolution} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid vertical={false} stroke={colors.grid} strokeDasharray="3 3" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      cursor={{ fill: 'transparent' }}
                      contentStyle={chartTooltipStyle}
                      formatter={(value: number, name: string) =>
                        name === 'Receita (R$ mil)' ? [`R$ ${value} mil`, name] : [value, name]
                      }
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={28}
                      iconType="circle"
                      wrapperStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="vendas" name="Vendas" fill={colors.primary} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Line
                      type="monotone"
                      dataKey="receita"
                      name="Receita (R$ mil)"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <FormDialog
        open={creating || editing !== null}
        onOpenChange={open => {
          if (open) return
          setCreating(false)
          setEditing(null)
        }}
        title={editing ? 'Editar venda' : 'Nova venda'}
        description={
          editing
            ? 'Atualize os dados da venda e a situação dela no funil.'
            : 'Registre uma venda fechada. A comissão é calculada pela taxa do vendedor.'
        }
        submitLabel={editing ? 'Salvar alterações' : 'Registrar venda'}
        size="lg"
        onSubmit={() => submitSale(editing)}
      >
        <FormField label="Cliente" htmlFor="sale-client" error={form.errors.clientName} required>
          <Input
            id="sale-client"
            value={form.values.clientName}
            onChange={event => form.setField('clientName', event.target.value)}
            aria-invalid={!!form.errors.clientName}
          />
        </FormField>

        <FormRow>
          <FormField label="Plano" error={form.errors.plan} required>
            <FormSelect
              value={form.values.plan}
              onChange={value => form.setField('plan', value)}
              placeholder="Selecione o plano"
              options={plans.map(item => ({ value: item, label: item }))}
              invalid={!!form.errors.plan}
            />
          </FormField>
          <FormField
            label="Valor"
            htmlFor="sale-value"
            error={form.errors.value}
            required
            hint="Mensalidade em reais"
          >
            <Input
              id="sale-value"
              inputMode="decimal"
              placeholder="49,90"
              value={form.values.value}
              onChange={event => form.setField('value', event.target.value)}
              aria-invalid={!!form.errors.value}
            />
          </FormField>
        </FormRow>

        <FormRow>
          <FormField label="Vendedor" error={form.errors.sellerId} required>
            <FormSelect
              value={form.values.sellerId}
              onChange={value => form.setField('sellerId', value)}
              placeholder="Selecione o vendedor"
              options={sellers.map(item => ({ value: item.id, label: item.name }))}
              invalid={!!form.errors.sellerId}
            />
          </FormField>
          <FormField label="Situação" error={form.errors.status} required>
            <FormSelect
              value={form.values.status}
              onChange={value => form.setField('status', value)}
              placeholder="Selecione a situação"
              options={Object.entries(saleStatusMeta).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
              invalid={!!form.errors.status}
            />
          </FormField>
        </FormRow>

        <FormField label="Origem" error={form.errors.source}>
          <FormSelect
            value={form.values.source}
            onChange={value => form.setField('source', value)}
            placeholder="Selecione a origem"
            options={['Site', 'Indicação', 'Campanha', 'Evento', 'Redes Sociais', 'Parceiro'].map(
              item => ({ value: item, label: item }),
            )}
          />
        </FormField>
      </FormDialog>

      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={open => !open && setCancelling(null)}
        title="Cancelar venda"
        description={
          cancelling
            ? `A venda de ${cancelling.clientName} passa para "Cancelada" e sai do faturamento e da comissão do período. O registro é mantido no histórico.`
            : ''
        }
        confirmLabel="Cancelar venda"
        onConfirm={async () => {
          if (!cancelling) return
          await updateSale(cancelling.id, { status: 'cancelled' })
          toast.success('Venda cancelada', { description: cancelling.clientName })
        }}
      />
    </div>
  )
}

function SaleActions({
  onEdit,
  onCancel,
  canCancel,
}: {
  onEdit: () => void
  onCancel: () => void
  canCancel: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Ações da venda</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" />
          Editar venda
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Receipt className="mr-2 h-4 w-4" />
          Ver contrato
        </DropdownMenuItem>
        {canCancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onCancel}>
              <XCircle className="mr-2 h-4 w-4" />
              Cancelar venda
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
