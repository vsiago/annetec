'use client'

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
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
  ganhos: number
}

const CONFIG: ChartConfig = {
  leads: { label: 'Leads', color: TONES.blue.stroke },
  ganhos: { label: 'Ganhos', color: TONES.green.stroke },
}

/**
 * Duas áreas sobrepostas, leads (azul) e ganhos (verde),
 * por dia. Usa o `ChartContainer` do projeto (tooltip e legenda padrão). Com
 * todos os pontos zerados mostra uma frase em vez de um gráfico vazio. Há uma
 * tabela invisível para leitores de tela.
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
        <AreaChart data={dados} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="vr-fill-leads" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-leads)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-leads)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="vr-fill-ganhos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-ganhos)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-ganhos)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="dia" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Area dataKey="leads" type="monotone" stroke="var(--color-leads)" strokeWidth={2} fill="url(#vr-fill-leads)" />
          <Area dataKey="ganhos" type="monotone" stroke="var(--color-ganhos)" strokeWidth={2} fill="url(#vr-fill-ganhos)" />
        </AreaChart>
      </ChartContainer>
      <table className="sr-only">
        <caption>Leads e ganhos por dia</caption>
        <thead>
          <tr>
            <th>Dia</th>
            <th>Leads</th>
            <th>Ganhos</th>
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
