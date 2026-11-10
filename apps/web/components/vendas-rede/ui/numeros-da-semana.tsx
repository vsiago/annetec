import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { variacaoPercentual } from './mascaras'

export type NumeroDaSemana = {
  rotulo: string
  atual: number
  anterior: number
  /** Formata o valor (padrão: inteiro pt-BR). Ex.: `formatarMoeda`. */
  formatar?: (n: number) => string
}

/**
 * "Sua semana": 4 números lado a lado (2×2 no celular) comparados com a
 * semana anterior. Seta + percentual + texto "vs. semana passada" (nunca só a
 * cor). Sem base de comparação (semana anterior = 0) mostra "Nova semana" neutro.
 * Sem gamificação: só os números e a tendência.
 */
export function NumerosDaSemana({ itens, className }: { itens: NumeroDaSemana[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-5', className)}>
      {itens.slice(0, 4).map(item => {
        const variacao = variacaoPercentual(item.atual, item.anterior)
        const subiu = item.atual > item.anterior
        const caiu = item.atual < item.anterior
        const Icone = subiu ? ArrowUp : caiu ? ArrowDown : Minus
        const tom = subiu ? 'text-[#067647]' : caiu ? 'text-[#B42318]' : 'text-muted-foreground'
        const texto =
          variacao !== null
            ? `${variacao > 0 ? '+' : ''}${variacao} %`
            : item.atual > 0
              ? 'Nova semana'
              : 'Igual'
        return (
          <div key={item.rotulo} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[13px] leading-snug text-muted-foreground">{item.rotulo}</dt>
            <dd className="m-0 flex flex-col gap-0.5">
              <span className="text-[28px] font-bold leading-tight tracking-tight tabular-nums text-foreground">
                {(item.formatar ?? ((n: number) => n.toLocaleString('pt-BR')))(item.atual)}
              </span>
              <span className={cn('inline-flex items-center gap-1 text-xs font-medium tabular-nums', tom)}>
                <Icone className="size-3" aria-hidden="true" />
                {texto}
                <span className="font-normal text-muted-foreground"> vs. semana passada</span>
              </span>
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
