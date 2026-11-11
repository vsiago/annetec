'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { TONES } from './tokens'

export type PontoLeadsGanhos = {
  /** Rótulo do eixo X já formatado ("05/11"). */
  dia: string
  leads: number
  /** Vendas fechadas no dia (o campo mantém o nome do contrato da API). */
  ganhos: number
}

const CONFIG: ChartConfig = {
  leads: { label: 'Leads', color: 'var(--vr-accent, #1E2A4A)' },
  // Âmbar, não verde: o clube pode ter o verde como cor da marca e as duas séries se confundiriam.
  ganhos: { label: 'Vendas', color: TONES.amber.stroke },
}

/**
 * Barras agrupadas por dia: leads (cor do clube) e vendas (âmbar). Barras, e não áreas, porque
 * a série é esparsa (muitos dias com zero) e a área vira picos triangulares que não dizem nada.
 * O eixo vertical só tem números inteiros. Com todos os pontos zerados mostra uma frase em vez de
 * um gráfico vazio. Há uma tabela invisível para leitores de tela.
 */
export function GraficoLeadsGanhos({ dados, className }: { dados: PontoLeadsGanhos[]; className?: string }) {
  const vazio = dados.length === 0 || dados.every(d => d.leads === 0 && d.ganhos === 0)
  if (vazio) {
    return (
      <p className={cn('m-0 flex h-56 items-center justify-center text-center text-sm text-muted-foreground', className)}>
        Ainda não há leads neste período. Quando chegarem, o gráfico aparece aqui.
      </p>
    )
  }
  return (
    <div className={className}>
      <ChartContainer config={CONFIG} className="aspect-auto h-64 w-full">
        <BarChart data={dados} margin={{ left: 0, right: 8, top: 8, bottom: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="dia" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} tickFormatter={v => Number(v).toLocaleString('pt-BR')} />
          <ChartTooltip cursor={{ fill: 'rgba(16,24,40,0.05)' }} content={<ChartTooltipContent indicator="dot" labelFormatter={v => `Dia ${v}`} />} />
          <ChartLegend verticalAlign="top" align="left" content={<ChartLegendContent className="justify-start pb-3 pt-0" />} />
          <Bar dataKey="leads" fill="var(--color-leads)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="ganhos" fill="var(--color-ganhos)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>Leads e vendas por dia</caption>
        <thead>
          <tr>
            <th>Dia</th>
            <th>Leads</th>
            <th>Vendas</th>
          </tr>
        </thead>
        <tbody>
          {dados.map(d => (
            <tr key={d.dia}>
              <td>{d.dia}</td>
              <td>{d.leads}</td>
              <td>{d.ganhos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
