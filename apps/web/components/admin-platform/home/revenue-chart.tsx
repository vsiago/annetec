'use client'

import Link from 'next/link'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, CircleDollarSign, TrendingUp } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import type { RevenueBar } from './derive'
import { brlWhole, formatMil } from './format'

/**
 * Cores das colunas: meses anteriores em azul-marinho claro, o mês atual em
 * coral (a cor da marca). O texto nunca vai em coral: os valores ficam em
 * azul-marinho/cinza, e o mês atual também se distingue pelo nome em negrito.
 */
const PAST_COLOR = '#7F92BD'
const CURRENT_COLOR = '#E84364'

/** Nome do mês no eixo; o do mês atual em negrito, com um traço coral embaixo. */
function MonthTick({ x, y, payload, current }: { x?: number; y?: number; payload?: { value?: string }; current?: string }) {
  const isCurrent = payload?.value === current
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fontSize={12}
        fontWeight={isCurrent ? 700 : 400}
        fill={isCurrent ? '#1E2A4A' : '#475467'}
      >
        {payload?.value}
      </text>
      {isCurrent ? <rect x={-9} y={22} width={18} height={3} rx={1.5} fill={CURRENT_COLOR} /> : null}
    </g>
  )
}

function RevenueTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload?: RevenueBar }[]
}) {
  const bar = payload?.[0]?.payload
  if (!active || !bar) return null
  return (
    <div className="min-w-40 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-[0_8px_24px_-6px_rgba(16,24,40,0.18)]">
      <p className="m-0 mb-1 font-medium capitalize text-muted-foreground">
        {bar.longLabel}
        {bar.current ? ' (até hoje)' : ''}
      </p>
      <p className="m-0 flex items-center gap-2 text-sm font-semibold tabular-nums text-foreground">
        <span
          className="size-2.5 rounded-[3px]"
          style={{ backgroundColor: bar.current ? CURRENT_COLOR : PAST_COLOR }}
          aria-hidden="true"
        />
        {brlWhole(bar.value)}
      </p>
    </div>
  )
}

/** Rótulo só da coluna do mês atual (os demais valores aparecem no tooltip). */
function CurrentLabel({
  x,
  y,
  width,
  value,
  index,
  lastIndex,
}: {
  x?: number | string
  y?: number | string
  width?: number | string
  value?: number | string
  index?: number
  lastIndex: number
}) {
  if (index !== lastIndex) return null
  const cx = Number(x ?? 0) + Number(width ?? 0) / 2
  return (
    <text x={cx} y={Number(y ?? 0) - 8} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1E2A4A">
      {formatMil(Number(value ?? 0))} mil
    </text>
  )
}

/**
 * Receita dos últimos 6 meses: colunas com cantos arredondados, grade leve e
 * tooltip com o valor exato. O mês atual fica em coral (a cor da marca), com o
 * valor escrito em cima e o nome em negrito.
 * Sem receita ainda, mostra um estado vazio explicado (e leva ao cadastro do
 * primeiro clube quando nenhum existe).
 */
export function RevenueChartCard({ bars, hasClubs = true }: { bars: RevenueBar[]; hasClubs?: boolean }) {
  const max = Math.max(0, ...bars.map(bar => bar.value))
  const hasData = bars.length > 0 && max > 0
  const description = `Receita recebida pela ANNETEC, em reais: ${bars
    .map(bar => `${bar.longLabel} ${formatMil(bar.value)} mil`)
    .join('; ')}`
  const current = bars.find(bar => bar.current)

  return (
    <SectionCard
      id="home-receita"
      icon={BarChart3}
      iconTone="green"
      title="Receita dos últimos 6 meses"
      description="Recebido pela ANNETEC, em R$ mil"
      className="flex-[1.5_1_440px]"
    >
      {hasData ? (
        <div role="img" aria-label={description} className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ top: 24, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke="#EAEEF4" strokeDasharray="4 4" />
              <XAxis
                dataKey="shortLabel"
                tickLine={false}
                axisLine={{ stroke: '#D0D5DD' }}
                height={34}
                interval={0}
                tick={<MonthTick current={current?.shortLabel} />}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={40}
                tickCount={4}
                domain={[0, 'auto']}
                tick={{ fontSize: 12, fill: '#667085' }}
                tickFormatter={value => formatMil(Number(value))}
              />
              <Tooltip cursor={{ fill: 'rgba(30,42,74,0.05)', radius: 8 }} content={<RevenueTooltip />} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56} isAnimationActive={false}>
                {bars.map(bar => (
                  <Cell key={bar.month} fill={bar.current ? CURRENT_COLOR : PAST_COLOR} />
                ))}
                <LabelList dataKey="value" content={props => <CurrentLabel {...props} lastIndex={bars.length - 1} />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState
          size="sm"
          icon={BarChart3}
          satellites={[CircleDollarSign, TrendingUp]}
          title="Sem receita ainda"
          description="Ainda não há receita recebida nos últimos 6 meses."
          action={
            hasClubs ? undefined : (
              <Button asChild className="h-11 rounded-[10px] px-4 font-semibold">
                <Link href="/admin/inquilinos/novo">Cadastrar clube</Link>
              </Button>
            )
          }
        />
      )}
    </SectionCard>
  )
}
