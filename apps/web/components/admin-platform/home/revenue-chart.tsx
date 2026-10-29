import { cn } from '@/lib/utils'
import type { RevenueBar } from './derive'
import { formatMil } from './format'

/** Altura, em px, da barra do mês mais alto. */
const BAR_AREA = 180

/**
 * Receita dos últimos 6 meses: barras simples. O mês atual fica em coral (a cor
 * da marca), os outros em azul-marinho claro, e cada barra traz o valor escrito
 * (em R$ mil) em azul-marinho: o coral nunca leva texto pequeno.
 */
export function RevenueChartCard({ bars }: { bars: RevenueBar[] }) {
  const max = Math.max(0, ...bars.map(bar => bar.value))
  const hasData = bars.length > 0 && max > 0
  const description = `Receita recebida pela ANNETEC, em reais: ${bars
    .map(bar => `${bar.longLabel} ${formatMil(bar.value)} mil`)
    .join('; ')}`

  return (
    <section
      aria-labelledby="home-receita"
      className="flex min-w-0 flex-[1.5_1_440px] flex-col gap-5 rounded-2xl border border-border bg-white p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="home-receita" className="m-0 text-base font-bold text-foreground">
          Receita dos últimos 6 meses
        </h2>
        <span className="text-[13px] text-muted-foreground">Recebido pela ANNETEC, em R$ mil</span>
      </div>

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
        <p className="m-0 py-10 text-center text-sm text-muted-foreground">
          Ainda não há receita recebida nos últimos 6 meses.
        </p>
      )}
    </section>
  )
}
