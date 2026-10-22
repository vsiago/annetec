'use client'

import { useMemo } from 'react'
import { Grid3x3 } from 'lucide-react'
import type { HoldingCohortLevel, HoldingCohorts } from '@annetec/contracts'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { formatInt, formatPct, monthLong, monthShort } from '@/lib/adapters/holding'
import { EmptyNote, FormulaHint, SectionError } from './holding-ui'

/**
 * Rampa SEQUENCIAL de um só matiz (azul, claro → escuro). O domínio começa na
 * menor retenção da tabela (arredondada para baixo na dezena) e vai a 100%:
 * retenção costuma ficar entre 80% e 100%, e uma escala 0–100 deixaria tudo
 * com a mesma cor. A legenda mostra o domínio.
 */
const RAMP_FROM = [239, 246, 255] // blue-50
const RAMP_TO = [29, 78, 216] // blue-700

function rampColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t))
  const rgb = RAMP_FROM.map((from, i) => Math.round(from + ((RAMP_TO[i] ?? from) - from) * clamped))
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

const LEVEL_LABELS: Record<HoldingCohortLevel, { title: string; unit: string }> = {
  associado: { title: 'Associados', unit: 'assinaturas de associados' },
  inquilino: { title: 'Inquilinos', unit: 'assinaturas de plataforma' },
}

export function CohortHeatmap({
  data,
  level,
  onLevelChange,
  loading,
  error,
  onRetry,
}: {
  data: HoldingCohorts | null
  level: HoldingCohortLevel
  onLevelChange: (level: HoldingCohortLevel) => void
  loading?: boolean
  error?: string | null
  onRetry?: () => void
}) {
  const rows = useMemo(() => (data?.rows ?? []).filter(row => row.size > 0), [data])
  const columns = useMemo(() => Math.max(0, ...rows.map(row => row.retention.length)), [rows])
  const domainMin = useMemo(() => {
    const values = rows.flatMap(row => row.retention.filter((v): v is number => v !== null))
    if (values.length === 0) return 0
    return Math.min(90, Math.floor(Math.min(...values) / 10) * 10)
  }, [rows])
  const scale = (value: number) => (100 - domainMin === 0 ? 1 : (value - domainMin) / (100 - domainMin))
  const stale = loading && data !== null && data.level !== level

  return (
    <Card className="gap-4 border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">Coortes de retenção</CardTitle>
          <FormulaHint>
            Cada linha é o mês de ativação. M+k = % da coorte ainda não cancelada ao fim do k-ésimo mês depois da
            ativação (M+0 = fim do próprio mês). Célula vazia = mês que ainda não terminou.
          </FormulaHint>
        </div>
        <CardDescription className="text-xs">
          {LEVEL_LABELS[level].title}: % de {LEVEL_LABELS[level].unit} que continuam ativas mês a mês
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={level}
            onValueChange={value => value && onLevelChange(value as HoldingCohortLevel)}
            aria-label="Nível da coorte"
          >
            <ToggleGroupItem value="associado" className="px-2.5 text-xs">
              Associados
            </ToggleGroupItem>
            <ToggleGroupItem value="inquilino" className="px-2.5 text-xs">
              Inquilinos
            </ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && !data ? (
          <SectionError message={error} onRetry={onRetry} />
        ) : loading && !data ? (
          <div className="space-y-1.5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyNote icon={Grid3x3}>Nenhuma coorte com ativações no período.</EmptyNote>
        ) : (
          <>
            <div className={cn('overflow-x-auto', stale && 'opacity-60 transition-opacity')}>
              <table className="w-full border-separate text-xs" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left font-medium text-muted-foreground">
                      Coorte
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Ativações</th>
                    {Array.from({ length: columns }, (_, k) => (
                      <th key={k} className="min-w-11 px-1 py-1.5 text-center font-medium text-muted-foreground">
                        M+{k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.cohort}>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-1 text-left font-medium text-foreground"
                      >
                        {monthShort(row.cohort)}
                      </th>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{formatInt(row.size)}</td>
                      {Array.from({ length: columns }, (_, k) => {
                        const value = row.retention[k]
                        if (value === null || value === undefined) {
                          return <td key={k} className="rounded-[3px] bg-muted/40" aria-label="mês futuro" />
                        }
                        const t = scale(value)
                        return (
                          <td
                            key={k}
                            className={cn(
                              'rounded-[3px] px-1 py-1 text-center font-medium tabular-nums',
                              t > 0.55 ? 'text-white' : 'text-slate-900',
                            )}
                            style={{ backgroundColor: rampColor(t) }}
                            title={`${monthLong(row.cohort)} · M+${k}: ${formatPct(value)} de ${formatInt(row.size)}`}
                          >
                            {Math.round(value)}%
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Retenção</span>
              <span className="tabular-nums">{domainMin}%</span>
              <span
                className="h-2 w-32 rounded-full"
                style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(1)})` }}
                aria-hidden
              />
              <span className="tabular-nums">100%</span>
              <span className="ml-2 inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-[3px] bg-muted/40 ring-1 ring-inset ring-border" aria-hidden />
                mês ainda aberto
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
