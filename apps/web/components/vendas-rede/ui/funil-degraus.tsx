import { cn } from '@/lib/utils'

export type DegrauFunil = { rotulo: string; valor: number }

export const DEGRAUS_PADRAO: ReadonlyArray<string> = ['Novos', 'Em contato', 'Proposta', 'Negociação', 'Ganhos']

/**
 * Funil em degraus: Novos → Em contato → Proposta → Negociação → Ganhos.
 * `horizontal` (padrão) desenha uma escada de colunas, com a taxa de passagem
 * de um degrau ao seguinte; `vertical` usa barras empilhadas, para colunas
 * estreitas (bloco "Seu funil" da tela Hoje). O último degrau ganha o marinho
 * cheio; o texto sempre repete o número (a barra é só apoio visual).
 */
export function FunilDegraus({
  degraus,
  orientacao = 'horizontal',
  className,
}: {
  degraus: DegrauFunil[]
  orientacao?: 'horizontal' | 'vertical'
  className?: string
}) {
  const topo = Math.max(1, ...degraus.map(d => d.valor))
  const taxa = (i: number): string | null => {
    const anterior = degraus[i - 1]?.valor ?? 0
    if (i === 0 || anterior <= 0) return null
    return `${Math.round(((degraus[i]?.valor ?? 0) / anterior) * 100)} %`
  }

  if (orientacao === 'vertical') {
    return (
      <ol className={cn('m-0 flex list-none flex-col gap-3 p-0', className)}>
        {degraus.map((d, i) => (
          <li key={d.rotulo} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">{d.rotulo}</span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">{d.valor.toLocaleString('pt-BR')}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#F2F4F7]" aria-hidden="true">
              <div
                className={cn('h-full rounded-full', i === degraus.length - 1 ? 'bg-[#067647]' : 'bg-[#1E2A4A]')}
                style={{ width: `${Math.max(d.valor > 0 ? 3 : 0, (d.valor / topo) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    )
  }

  return (
    <ol className={cn('m-0 grid list-none gap-2 p-0', className)} style={{ gridTemplateColumns: `repeat(${degraus.length}, minmax(0, 1fr))` }}>
      {degraus.map((d, i) => {
        const ultimo = i === degraus.length - 1
        const t = taxa(i)
        return (
          <li key={d.rotulo} className="flex min-w-0 flex-col justify-end gap-2">
            <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
              <span className="text-xl font-bold leading-tight tabular-nums text-foreground sm:text-2xl">
                {d.valor.toLocaleString('pt-BR')}
              </span>
              <span className="w-full truncate text-xs text-muted-foreground">{d.rotulo}</span>
              <span className="h-4 text-[11px] font-medium tabular-nums text-muted-foreground">
                {t ? `${t} do anterior` : ' '}
              </span>
            </div>
            <div className="flex h-20 items-end" aria-hidden="true">
              <div
                className={cn('w-full rounded-t-lg', ultimo ? 'bg-[#067647]' : 'bg-[#1E2A4A]')}
                style={{ height: `${Math.max(d.valor > 0 ? 8 : 2, (d.valor / topo) * 100)}%`, opacity: ultimo ? 1 : 0.35 + 0.65 * (d.valor / topo) }}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
