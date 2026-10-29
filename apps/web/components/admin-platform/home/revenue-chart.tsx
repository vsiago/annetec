import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { cn } from '@/lib/utils'
import type { RevenueBar } from './derive'
import { formatMil } from './format'

/** Altura, em px, da barra do mês mais alto. */
const BAR_AREA = 180

/**
 * Receita dos últimos 6 meses: barras simples. O mês atual fica em coral (a cor
 * da marca), os outros em azul-marinho claro, e cada barra traz o valor escrito
 * (em R$ mil) em azul-marinho: o coral nunca leva texto pequeno.
 * Sem receita ainda, mostra um estado vazio explicado (e leva ao cadastro do
 * primeiro clube quando nenhum existe).
 */
export function RevenueChartCard({ bars, hasClubs = true }: { bars: RevenueBar[]; hasClubs?: boolean }) {
  const max = Math.max(0, ...bars.map(bar => bar.value))
  const hasData = bars.length > 0 && max > 0
  const description = `Receita recebida pela ANNETEC, em reais: ${bars
    .map(bar => `${bar.longLabel} ${formatMil(bar.value)} mil`)
    .join('; ')}`

  return (
    <SectionCard
      id="home-receita"
      icon={BarChart3}
      title="Receita dos últimos 6 meses"
      description="Recebido pela ANNETEC, em R$ mil"
      className="flex-[1.5_1_440px]"
    >
      {hasData ? (
        <div role="img" aria-label={description}>
          <div className="grid h-[240px] grid-cols-6 items-end gap-2 border-b border-border pt-2 sm:gap-4">
            {bars.map(bar => (
              <div key={bar.month} className="flex flex-col items-center gap-2">
                <span className={cn('text-xs tabular-nums', bar.current ? 'font-bold text-secondary' : 'text-muted-foreground')}>
                  {formatMil(bar.value)}
                </span>
                <div
                  className={cn('w-full max-w-14 rounded-t-lg', bar.current ? 'bg-primary' : 'bg-secondary/20')}
                  style={{ height: bar.value > 0 ? Math.max(4, Math.round((bar.value / max) * BAR_AREA)) : 0 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-6 gap-2 sm:gap-4">
            {bars.map(bar => (
              <span
                key={bar.month}
                className={cn('text-center text-xs', bar.current ? 'font-bold text-secondary' : 'text-muted-foreground')}
              >
                {bar.shortLabel}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          size="sm"
          icon={BarChart3}
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
