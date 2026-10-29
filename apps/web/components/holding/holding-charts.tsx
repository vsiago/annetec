'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { BarChart3, LineChart as LineChartIcon, Table2 } from 'lucide-react'
import { formatBRL } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SEM_BASE, formatCompactBRL, formatInt, formatPct, monthLong, monthShort } from '@/lib/adapters/holding'
import { EmptyNote, FormulaHint } from './holding-ui'

/**
 * Séries mensais da holding (Recharts 2.15 via `components/ui/chart`).
 *
 * Cor: ordem categórica FIXA e a cor segue a entidade — série 1 azul
 * (`--chart-3`), série 2 rosa da marca (`--chart-1`); o par passou no
 * validador de daltonismo (ΔE 22,6). Verde/âmbar/vermelho ficam reservados
 * para status. Um eixo por gráfico (nunca dois), barras ≤ 24 px com ponta
 * arredondada, linhas de 2 px, grade em traço contínuo e fino. Cada gráfico
 * tem a "versão tabela" no botão do canto, com os mesmos números.
 */

const SERIE_1 = 'var(--chart-3)'
const SERIE_2 = 'var(--chart-1)'

const pctTickFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const pctTick = (value: number) => `${pctTickFormatter.format(value)}%`
const intTick = (value: number) => formatInt(value)

const AXIS_PROPS = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const

function tooltipContent(config: ChartConfig, format: (value: number) => string) {
  return (
    <ChartTooltipContent
      className="min-w-[12rem]"
      labelFormatter={label => monthLong(String(label ?? ''))}
      formatter={(value, name, item) => (
        <div className="flex w-full items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
          <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
          <span className="ml-auto pl-4 font-mono font-medium tabular-nums text-foreground">
            {typeof value === 'number' && Number.isFinite(value) ? format(value) : SEM_BASE}
          </span>
        </div>
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// Moldura: título, fórmula, alternância gráfico ↔ tabela, vazio
// ---------------------------------------------------------------------------

export interface ChartTable {
  headers: string[]
  rows: string[][]
}

export function ChartCard({
  title,
  formula,
  description,
  actions,
  table,
  isEmpty,
  emptyText = 'Sem dados no período.',
  children,
  className,
}: {
  title: string
  formula?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  table: ChartTable
  isEmpty?: boolean
  emptyText?: ReactNode
  children: ReactNode
  className?: string
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <Card className={['gap-4 border-0 shadow-sm', className].filter(Boolean).join(' ')}>
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">{title}</CardTitle>
          {formula && <FormulaHint>{formula}</FormulaHint>}
        </div>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
        <CardAction className="flex items-center gap-1">
          {actions}
          {!isEmpty && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setView(current => (current === 'chart' ? 'table' : 'chart'))}
              aria-label={view === 'chart' ? 'Ver como tabela' : 'Ver como gráfico'}
              title={view === 'chart' ? 'Ver como tabela' : 'Ver como gráfico'}
            >
              {view === 'chart' ? <Table2 className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <EmptyNote icon={LineChartIcon}>{emptyText}</EmptyNote>
        ) : view === 'chart' ? (
          children
        ) : (
          <div className="max-h-65 overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  {table.headers.map((header, index) => (
                    <th
                      key={header}
                      className={`px-3 py-2 font-medium text-muted-foreground ${index === 0 ? 'text-left' : 'text-right'}`}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map(row => (
                  <tr key={row[0]} className="border-t">
                    {row.map((cell, index) => (
                      <td
                        key={index}
                        className={`px-3 py-1.5 tabular-nums ${index === 0 ? 'text-left' : 'text-right'}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const CHART_CLASS = 'aspect-auto h-60 w-full'

// ---------------------------------------------------------------------------
// Receita da plataforma: faturado × recebido
// ---------------------------------------------------------------------------

export interface PlatformRevenuePoint {
  month: string
  platformBilled: number
  platformReceived: number
}

const platformRevenueConfig = {
  platformBilled: { label: 'Faturado', color: SERIE_1 },
  platformReceived: { label: 'Recebido', color: SERIE_2 },
} satisfies ChartConfig

export function PlatformRevenueChart({
  data,
  title = 'Receita da plataforma',
  emptyText = 'Nenhuma fatura da plataforma no período.',
}: {
  data: PlatformRevenuePoint[]
  title?: string
  emptyText?: ReactNode
}) {
  const isEmpty = data.length === 0 || data.every(p => p.platformBilled === 0 && p.platformReceived === 0)
  return (
    <ChartCard
      title={title}
      description="Faturado × recebido por mês"
      formula="Faturado = Σ valor das faturas da ANNETEC com vencimento no mês (exceto canceladas). Recebido = Σ valor pago com pagamento no mês."
      isEmpty={isEmpty}
      emptyText={emptyText}
      table={{
        headers: ['Mês', 'Faturado', 'Recebido'],
        rows: data.map(p => [monthShort(p.month), formatBRL(p.platformBilled), formatBRL(p.platformReceived)]),
      }}
    >
      <ChartContainer config={platformRevenueConfig} className={CHART_CLASS}>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthShort} minTickGap={8} {...AXIS_PROPS} />
          <YAxis tickFormatter={formatCompactBRL} width={72} {...AXIS_PROPS} />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={tooltipContent(platformRevenueConfig, formatBRL)} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="platformBilled" fill="var(--color-platformBilled)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar dataKey="platformReceived" fill="var(--color-platformReceived)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------
// GMV (receita somada dos clubes)
// ---------------------------------------------------------------------------

export interface GmvPoint {
  month: string
  gmv: number
}

const gmvConfig = {
  gmv: { label: 'GMV (pago no mês)', color: SERIE_1 },
} satisfies ChartConfig

export function GmvChart({
  data,
  title = 'Receita dos clubes (GMV)',
  emptyText = 'Nenhuma cobrança de associado paga no período.',
}: {
  data: GmvPoint[]
  title?: string
  emptyText?: ReactNode
}) {
  const isEmpty = data.length === 0 || data.every(p => p.gmv === 0)
  return (
    <ChartCard
      title={title}
      description="Pagamentos dos associados recebidos por mês"
      formula="Σ valor pago das cobranças dos associados (status pago) com pagamento no mês, fuso de São Paulo."
      isEmpty={isEmpty}
      emptyText={emptyText}
      table={{ headers: ['Mês', 'GMV'], rows: data.map(p => [monthShort(p.month), formatBRL(p.gmv)]) }}
    >
      <ChartContainer config={gmvConfig} className={CHART_CLASS}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthShort} minTickGap={8} {...AXIS_PROPS} />
          <YAxis tickFormatter={formatCompactBRL} width={72} {...AXIS_PROPS} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={tooltipContent(gmvConfig, formatBRL)} />
          <Area
            dataKey="gmv"
            type="linear"
            stroke="var(--color-gmv)"
            strokeWidth={2}
            fill="var(--color-gmv)"
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)' }}
          />
        </AreaChart>
      </ChartContainer>
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------
// Entradas × saídas (associados ou inquilinos)
// ---------------------------------------------------------------------------

export interface FlowPoint {
  month: string
  newMembers: number
  churnedMembers: number
  newTenants?: number
  churnedTenants?: number
}

type FlowLevel = 'associado' | 'inquilino'

const flowConfig = {
  novos: { label: 'Novos', color: SERIE_1 },
  cancelados: { label: 'Cancelados', color: SERIE_2 },
} satisfies ChartConfig

export function FlowChart({ data, allowTenantLevel = false }: { data: FlowPoint[]; allowTenantLevel?: boolean }) {
  const [level, setLevel] = useState<FlowLevel>('associado')
  const series = useMemo(
    () =>
      data.map(p => ({
        month: p.month,
        novos: level === 'associado' ? p.newMembers : (p.newTenants ?? 0),
        cancelados: level === 'associado' ? p.churnedMembers : (p.churnedTenants ?? 0),
      })),
    [data, level],
  )
  const isEmpty = series.length === 0 || series.every(p => p.novos === 0 && p.cancelados === 0)
  const noun = level === 'associado' ? 'assinaturas de associados' : 'assinaturas de plataforma (clubes)'
  return (
    <ChartCard
      title="Novos × cancelados"
      description={level === 'associado' ? 'Assinaturas de associados por mês' : 'Clubes na cobrança automática por mês'}
      formula={`Novos = ${noun} iniciadas no mês. Cancelados = ${noun} canceladas no mês.`}
      isEmpty={isEmpty}
      emptyText="Nenhuma entrada ou saída no período."
      actions={
        allowTenantLevel ? (
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={level}
            onValueChange={value => value && setLevel(value as FlowLevel)}
            aria-label="Nível"
          >
            <ToggleGroupItem value="associado" className="px-2.5 text-xs">
              Associados
            </ToggleGroupItem>
            <ToggleGroupItem value="inquilino" className="px-2.5 text-xs">
              Clubes
            </ToggleGroupItem>
          </ToggleGroup>
        ) : undefined
      }
      table={{
        headers: ['Mês', 'Novos', 'Cancelados'],
        rows: series.map(p => [monthShort(p.month), formatInt(p.novos), formatInt(p.cancelados)]),
      }}
    >
      <ChartContainer config={flowConfig} className={CHART_CLASS}>
        <BarChart data={series} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthShort} minTickGap={8} {...AXIS_PROPS} />
          <YAxis tickFormatter={intTick} allowDecimals={false} width={48} {...AXIS_PROPS} />
          <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={tooltipContent(flowConfig, formatInt)} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="novos" fill="var(--color-novos)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar dataKey="cancelados" fill="var(--color-cancelados)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  )
}

// ---------------------------------------------------------------------------
// Churn mensal nos dois níveis
// ---------------------------------------------------------------------------

export interface ChurnPoint {
  month: string
  tenantChurnRate: number | null
  memberChurnRate: number | null
}

const churnConfig = {
  tenantChurnRate: { label: 'Clubes', color: SERIE_1 },
  memberChurnRate: { label: 'Associados', color: SERIE_2 },
} satisfies ChartConfig

export function ChurnChart({ data }: { data: ChurnPoint[] }) {
  const isEmpty = data.length === 0 || data.every(p => p.tenantChurnRate === null && p.memberChurnRate === null)
  return (
    <ChartCard
      title="Churn mensal"
      description="Clubes × associados, em % da base"
      formula="Churn = canceladas no mês ÷ assinaturas vivas no início do mês × 100. Clubes: assinaturas de plataforma; associados: assinaturas dos clubes. Sem base no início do mês = sem ponto."
      isEmpty={isEmpty}
      emptyText="Ainda não há base para calcular churn no período."
      table={{
        headers: ['Mês', 'Clubes', 'Associados'],
        rows: data.map(p => [monthShort(p.month), formatPct(p.tenantChurnRate), formatPct(p.memberChurnRate)]),
      }}
    >
      <ChartContainer config={churnConfig} className={CHART_CLASS}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthShort} minTickGap={8} {...AXIS_PROPS} />
          <YAxis tickFormatter={pctTick} width={48} {...AXIS_PROPS} />
          <ChartTooltip cursor={{ stroke: 'var(--border)' }} content={tooltipContent(churnConfig, v => formatPct(v))} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line
            dataKey="tenantChurnRate"
            type="linear"
            stroke="var(--color-tenantChurnRate)"
            strokeWidth={2}
            dot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--background)', fill: 'var(--color-tenantChurnRate)' }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--background)' }}
            connectNulls={false}
          />
          <Line
            dataKey="memberChurnRate"
            type="linear"
            stroke="var(--color-memberChurnRate)"
            strokeWidth={2}
            dot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--background)', fill: 'var(--color-memberChurnRate)' }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--background)' }}
            connectNulls={false}
          />
        </LineChart>
      </ChartContainer>
    </ChartCard>
  )
}
