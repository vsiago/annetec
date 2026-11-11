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
 * "Sua semana": cada métrica é um número grande e, logo abaixo, UM selo de
 * variação numa linha só ("▲ 29 % vs. semana anterior"). Seta + percentual +
 * texto (nunca só a cor): verde sobe, vermelho cai, cinza neutro. Sem base de
 * comparação (semana anterior = 0) o selo diz "Nova semana" ou "Igual".
 * Responde à largura do contêiner: 2 colunas com espaço (>= 28rem), 1 quando
 * falta. Sem gamificação: só os números e a tendência.
 */
export function NumerosDaSemana({ itens, className }: { itens: NumeroDaSemana[]; className?: string }) {
  return (
    <div className={cn('@container min-w-0', className)}>
      <dl className="m-0 grid grid-cols-1 gap-3 @md:grid-cols-2">
        {itens.slice(0, 4).map(item => {
          const variacao = variacaoPercentual(item.atual, item.anterior)
          const subiu = item.atual > item.anterior
          const caiu = item.atual < item.anterior
          const Icone = subiu ? ArrowUp : caiu ? ArrowDown : Minus
          const cor = subiu
            ? 'bg-[#ECFDF3] text-[#067647] ring-[#ABEFC6]'
            : caiu
              ? 'bg-[#FEF3F2] text-[#B42318] ring-[#FECDCA]'
              : 'bg-[#F2F4F7] text-[#344054] ring-[#E4E7EC]'
          const pct = variacao !== null ? `${variacao > 0 ? '+' : ''}${variacao}\u00A0%` : null
          const textoCompleto = pct ? `${pct} em relação à semana passada` : item.atual > 0 ? 'Sem dados na semana passada' : 'Igual à semana passada'
          const textoCurto = pct ? `${pct} vs. passada` : item.atual > 0 ? 'Sem base' : 'Igual'
          return (
            <div key={item.rotulo} className="@container flex min-w-0 flex-col gap-1.5 rounded-xl bg-[#F8F9FB] px-4 py-3.5" title={`${item.rotulo}: ${textoCompleto}`}>
              <dt className="truncate text-[13px] font-medium text-muted-foreground">{item.rotulo}</dt>
              <dd className="m-0 flex min-w-0 flex-col items-start gap-2">
                <span className="max-w-full truncate text-[28px] font-bold leading-none tracking-tight tabular-nums text-foreground">
                  {(item.formatar ?? ((n: number) => n.toLocaleString('pt-BR')))(item.atual)}
                </span>
                <span
                  className={cn(
                    'inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset',
                    cor,
                  )}
                >
                  <Icone className="size-3 shrink-0" aria-hidden="true" />
                  <span className="@max-[13.5rem]:hidden">{textoCompleto}</span>
                  <span className="hidden @max-[13.5rem]:inline">{textoCurto}</span>
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
