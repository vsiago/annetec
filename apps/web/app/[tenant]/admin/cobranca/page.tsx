'use client'

import { useMemo, useState } from 'react'
import {
  CalendarDays,
  CircleDollarSign,
  Clock,
  Download,
  FileText,
  Handshake,
  ListFilter,
  MoreHorizontal,
  Plus,
  Receipt,
  Send,
  Users,
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
import { Checkbox } from '@/components/ui/checkbox'
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
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { chartTooltipStyle } from '@/components/dashboard/chart-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { StatCard } from '@/components/dashboard/stat-card'
import { SearchInput, StatusPill, TableFooter } from '@/components/dashboard/table-controls'
import { getAllClients, useTenantData } from '@/contexts/tenant-data-context'
import { formatCurrency, formatMonthLabel, lastMonths } from '@/lib/analytics'
import type { Client } from '@/lib/types'
import { cn } from '@/lib/utils'

type BoletoStatus = 'pago' | 'aberto' | 'atrasado'

interface Boleto {
  id: string
  number: string
  clientName: string
  plan: string
  dueDate: Date
  value: number
  status: BoletoStatus
}

const statusMeta: Record<BoletoStatus, { label: string; className: string; color: string }> = {
  pago: { label: 'Pago', className: 'bg-emerald-50 text-emerald-700', color: '#22c55e' },
  aberto: { label: 'Em aberto', className: 'bg-amber-50 text-amber-700', color: '#f59e0b' },
  atrasado: { label: 'Atrasado', className: 'bg-red-50 text-red-600', color: '#ef4444' },
}

/**
 * Um boleto por beneficiário ativo no mês de referência: a mensalidade do
 * plano dele com vencimento no dia da adesão. Não existe tabela de cobrança
 * ainda — quando existir, esta função sai e a lista vem da API.
 */
function buildBoletos(clients: Client[], planPrices: Map<string, number>, reference: Date): Boleto[] {
  return clients
    .filter(client => client.planStatus !== 'cancelled')
    .filter(client => new Date(client.contractDate) <= reference)
    .map((client, index) => {
      const day = new Date(client.contractDate).getDate()
      const status: BoletoStatus = index % 9 === 0 ? 'atrasado' : index % 4 === 0 ? 'aberto' : 'pago'
      return {
        id: `boleto-${client.id}`,
        number: `34191.75010.${String(12345 + index)}`,
        clientName: client.name,
        plan: client.plan,
        dueDate: new Date(reference.getFullYear(), reference.getMonth(), Math.min(day, 28)),
        value: planPrices.get(client.plan) ?? 0,
        status,
      }
    })
}

export default function AdminCobrancaPage() {
  const { users, clientPlans, isLoading } = useTenantData()

  const months = useMemo(() => [...lastMonths(12)].reverse(), [])
  const [referenceMonth, setReferenceMonth] = useState(() => months[0]?.key ?? '')
  const [tab, setTab] = useState('boletos')
  const [search, setSearch] = useState('')
  const [perPage, setPerPage] = useState('10')
  const [page, setPage] = useState(1)

  const clients = getAllClients(users)
  const planPrices = useMemo(
    () => new Map(clientPlans.map(plan => [plan.name, plan.priceMonthly])),
    [clientPlans],
  )

  const reference = months.find(m => m.key === referenceMonth)?.date ?? new Date()
  const referenceEnd = useMemo(
    () => new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59),
    [reference],
  )

  const boletos = useMemo(
    () => buildBoletos(clients, planPrices, referenceEnd),
    [clients, planPrices, referenceEnd],
  )

  const countBy = (status: BoletoStatus) => boletos.filter(b => b.status === status).length
  const received = boletos.filter(b => b.status === 'pago').reduce((sum, b) => sum + b.value, 0)
  const defaultRate = boletos.length === 0 ? 0 : (countBy('atrasado') / boletos.length) * 100

  const tabFiltered = useMemo(() => {
    if (tab === 'pagamentos') return boletos.filter(b => b.status === 'pago')
    if (tab === 'inadimplentes') return boletos.filter(b => b.status === 'atrasado')
    if (tab === 'renegociacao') return boletos.filter(b => b.status === 'atrasado').slice(0, 12)
    if (tab === 'recorrencia') return boletos.filter(b => b.status !== 'atrasado')
    return boletos
  }, [boletos, tab])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return tabFiltered
    return tabFiltered.filter(boleto =>
      [boleto.clientName, boleto.plan, boleto.number].some(field => field.toLowerCase().includes(term)),
    )
  }, [tabFiltered, search])

  const size = Number(perPage)
  const totalPages = Math.max(1, Math.ceil(filtered.length / size))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * size, currentPage * size)

  const donut = (['pago', 'aberto', 'atrasado'] as BoletoStatus[]).map(status => ({
    name: statusMeta[status].label,
    value: countBy(status),
    color: statusMeta[status].color,
  }))

  /** Receita recebida por mês, contra o previsto (todos os boletos emitidos). */
  const revenueSeries = useMemo(
    () =>
      lastMonths(6).map(bucket => {
        const monthEnd = new Date(bucket.date.getFullYear(), bucket.date.getMonth() + 1, 0, 23, 59, 59)
        const monthBoletos = buildBoletos(clients, planPrices, monthEnd)
        const expected = monthBoletos.reduce((sum, b) => sum + b.value, 0)
        return {
          month: bucket.label,
          recebida: monthBoletos.filter(b => b.status === 'pago').reduce((sum, b) => sum + b.value, 0),
          prevista: expected,
        }
      }),
    [clients, planPrices],
  )

  function withPageReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setPage(1)
    }
  }

  if (isLoading) return null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cobrança"
        description="Acompanhe boletos, pagamentos, inadimplência e gestão da receita."
        mock
      >
        <Button variant="outline" className="h-11 gap-2">
          <FileText className="h-4 w-4" />
          Gerar boletos em lote
        </Button>
        <Button className="h-11 gap-2 px-5">
          <Plus className="h-4 w-4" />
          Nova cobrança
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Receipt}
          accent="primary"
          value={boletos.length.toLocaleString('pt-BR')}
          label="Boletos emitidos"
          delta={{ value: '12%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={CircleDollarSign}
          accent="info"
          value={formatCurrency(received)}
          label="Receita recebida"
          delta={{ value: '18%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Users}
          accent="success"
          value={`${defaultRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
          label="Inadimplência"
          delta={{ value: '1,8 p.p.', direction: 'down' }}
          comparison="vs. mês anterior"
        />
        <StatCard
          icon={Clock}
          accent="warning"
          value={countBy('aberto').toLocaleString('pt-BR')}
          label="Boletos em aberto"
          delta={{ value: '5%', direction: 'up' }}
          comparison="vs. mês anterior"
        />
      </div>

      <Tabs value={tab} onValueChange={withPageReset(setTab)} className="gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SectionTabsList className="lg:w-auto lg:border-b-0">
            <SectionTab value="boletos">Boletos</SectionTab>
            <SectionTab value="pagamentos">Pagamentos</SectionTab>
            <SectionTab value="inadimplentes">Inadimplentes</SectionTab>
            <SectionTab value="renegociacao">Renegociação</SectionTab>
            <SectionTab value="recorrencia">Recorrência</SectionTab>
          </SectionTabsList>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={referenceMonth} onValueChange={withPageReset(setReferenceMonth)}>
              <SelectTrigger className="w-full gap-2 bg-card data-[size=default]:h-11 sm:w-44">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map(month => (
                  <SelectItem key={month.key} value={month.key}>
                    {formatMonthLabel(month.date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-11 gap-2">
              <ListFilter className="h-4 w-4 text-muted-foreground" />
              Mais filtros
            </Button>
            <Button variant="outline" className="h-11 gap-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              Exportar
            </Button>
          </div>
        </div>

        <TabsContent value={tab} className="m-0">
          <div className="grid gap-5 xl:grid-cols-12">
            <Card className="gap-0 py-0 shadow-sm xl:col-span-8">
              <div className="p-4">
                <SearchInput
                  value={search}
                  onChange={withPageReset(setSearch)}
                  placeholder="Buscar por nome, CPF, nº do boleto ou plano..."
                />
              </div>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                        <th className="w-10 py-3 pl-4">
                          <Checkbox aria-label="Selecionar todos" />
                        </th>
                        <th className="px-4 py-3 font-medium">Nº do Boleto</th>
                        <th className="px-4 py-3 font-medium">Nome do Beneficiário</th>
                        <th className="px-4 py-3 font-medium">Plano</th>
                        <th className="px-4 py-3 font-medium">Vencimento</th>
                        <th className="px-4 py-3 font-medium">Valor</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 text-right font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-muted-foreground">
                            Nenhum boleto encontrado neste período.
                          </td>
                        </tr>
                      )}
                      {visible.map(boleto => (
                        <tr key={boleto.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                          <td className="py-3 pl-4">
                            <Checkbox aria-label={`Selecionar boleto ${boleto.number}`} />
                          </td>
                          <td className="px-4 py-3 font-medium text-muted-foreground">{boleto.number}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{boleto.clientName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{boleto.plan}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {boleto.dueDate.toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">
                            {formatCurrency(boleto.value)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill {...statusMeta[boleto.status]} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <BoletoActions />
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
                noun="boletos"
                onPageChange={setPage}
                onPerPageChange={withPageReset(setPerPage)}
              />
            </Card>

            <div className="space-y-5 xl:col-span-4">
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Resumo da Cobrança</CardTitle>
                  <CardAction className="self-center">
                    <span className="text-xs text-muted-foreground">{formatMonthLabel(reference)}</span>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="relative h-36 flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={donut}
                            cx="50%"
                            cy="50%"
                            innerRadius={44}
                            outerRadius={66}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                          >
                            {donut.map(item => (
                              <Cell key={item.name} fill={item.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ display: 'none' }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-lg font-bold text-foreground">
                          {boletos.length.toLocaleString('pt-BR')}
                        </span>
                        <span className="text-[11px] text-muted-foreground">boletos</span>
                      </div>
                    </div>
                    <ul className="w-32 shrink-0 space-y-2 text-xs">
                      {donut.map(item => (
                        <li key={item.name} className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="truncate text-muted-foreground">{item.name}</span>
                          <span className="ml-auto font-semibold text-foreground">{item.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Receita (R$)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={revenueSeries} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                        <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11 }}
                          tickFormatter={(value: number) => `${Math.round(value / 1000)} mil`}
                        />
                        <Tooltip
                          cursor={{ fill: 'transparent' }}
                          contentStyle={chartTooltipStyle}
                          formatter={(value: number) => formatCurrency(value)}
                        />
                        <Legend verticalAlign="top" height={24} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="recebida" name="Recebida" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={14} />
                        <Bar dataKey="prevista" name="Prevista" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={14} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Ações rápidas</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Enviar lembretes', icon: Send },
                    { label: 'Renegociar', icon: Handshake },
                    { label: 'Baixar boletos', icon: Download },
                    { label: 'Relatório de inadimplência', icon: Receipt },
                  ].map(action => {
                    const Icon = action.icon
                    return (
                      <button
                        key={action.label}
                        type="button"
                        className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2.5 text-left text-xs text-foreground transition-colors hover:bg-muted"
                      >
                        <Icon className={cn('h-4 w-4 shrink-0 text-primary')} />
                        <span className="truncate">{action.label}</span>
                      </button>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BoletoActions() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Ações do boleto</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem>
          <Download className="mr-2 h-4 w-4" />
          Baixar boleto
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Send className="mr-2 h-4 w-4" />
          Reenviar por e-mail
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Handshake className="mr-2 h-4 w-4" />
          Renegociar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive">Cancelar boleto</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
