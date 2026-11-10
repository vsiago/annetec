'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { rotuloDaOrigem } from './origem-badge'
import { TONES } from './tokens'
import type { Origem } from './tipos'

export type PontoOrigem = { origem: Origem; total: number; ganhos?: number }

const CONFIG: ChartConfig = {
  total: { label: 'Leads', color: TONES.navy.stroke },
  ganhos: { label: 'Ganhos', color: TONES.green.stroke },
}

/**
 * Barras horizontais: de onde vêm os leads (ordenadas do maior para o menor).
 * Com `ganhos` em cada ponto, desenha a segunda barra (verde) para comparar
 * origem que traz volume com origem que fecha.
 */
export function GraficoOrigens({ dados, className }: { dados: PontoOrigem[]; className?: string }) {
  const linhas = [...dados]
    .filter(d => d.total > 0)
    .sort((a, b) => b.total - a.total)
    .map(d => ({ nome: rotuloDaOrigem(d.origem), total: d.total, ganhos: d.ganhos }))
  if (linhas.length === 0) {
    return (
      <p className={cn('m-0 flex h-40 items-center justify-center text-center text-sm text-muted-foreground', className)}>
        Sem leads no período para mostrar as origens.
      </p>
    )
  }
  const comGanhos = linhas.some(l => typeof l.ganhos === 'number')
  return (
    <ChartContainer config={CONFIG} className={cn('aspect-auto w-full', className)} style={{ height: Math.max(160, linhas.length * (comGanhos ? 52 : 36) + 24) }}>
      <BarChart data={linhas} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="nome" tickLine={false} axisLine={false} width={96} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={[0, 6, 6, 0]} barSize={14} />
        {comGanhos ? <Bar dataKey="ganhos" fill="var(--color-ganhos)" radius={[0, 6, 6, 0]} barSize={14} /> : null}
      </BarChart>
    </ChartContainer>
  )
}
