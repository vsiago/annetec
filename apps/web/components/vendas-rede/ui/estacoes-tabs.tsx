'use client'

import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { FOCUS_RING } from './tokens'

export type Estacao = {
  id: string
  rotulo: string
  contador?: number
  /** Marca a estação que pede atenção (ex.: Disponíveis com leads esperando). */
  destaque?: boolean
}

/**
 * Abas do Funil (Disponíveis · Novos · Em andamento · Encerrados), com contadores.
 * No desktop são abas sublinhadas; no celular, pílulas roláveis presas logo
 * abaixo do topo (`top-14`, a altura do cabeçalho da casca).
 * Teclado: setas esquerda/direita, Home e End trocam de estação.
 *
 * Controlado: `valor` + `aoMudar`. Associe o painel com `id="painel-{id}"`.
 */
export function EstacoesTabs({
  estacoes,
  valor,
  aoMudar,
  rotulo = 'Abas do funil',
  className,
}: {
  estacoes: Estacao[]
  valor: string
  aoMudar: (id: string) => void
  rotulo?: string
  className?: string
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const ultimo = estacoes.length - 1
    let destino = -1
    if (e.key === 'ArrowRight') destino = indice === ultimo ? 0 : indice + 1
    else if (e.key === 'ArrowLeft') destino = indice === 0 ? ultimo : indice - 1
    else if (e.key === 'Home') destino = 0
    else if (e.key === 'End') destino = ultimo
    if (destino < 0) return
    e.preventDefault()
    const alvo = estacoes[destino]
    if (alvo) {
      aoMudar(alvo.id)
      refs.current[destino]?.focus()
    }
  }

  return (
    <div
      className={cn(
        'sticky top-14 z-20 -mx-4 bg-[#F8F9FB]/95 px-4 py-2 backdrop-blur md:static md:mx-0 md:border-b md:border-border md:bg-transparent md:p-0 md:backdrop-blur-none',
        className,
      )}
    >
      <div role="tablist" aria-label={rotulo} className="flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden gap-2 relative overflow-x-auto md:gap-1">
        {estacoes.map((e, i) => {
          const ativa = e.id === valor
          return (
            <button
              key={e.id}
              ref={el => {
                refs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`aba-${e.id}`}
              aria-selected={ativa}
              aria-controls={`painel-${e.id}`}
              tabIndex={ativa ? 0 : -1}
              onClick={() => aoMudar(e.id)}
              onKeyDown={ev => aoTeclar(ev, i)}
              className={cn(
                'relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap text-sm transition-colors',
                // celular: pílula
                'rounded-full border px-4 font-medium',
                ativa
                  ? 'border-[#1E2A4A] bg-[#1E2A4A] text-white'
                  : 'border-border bg-white text-[#344054] hover:bg-[#F2F4F7]',
                // desktop: aba sublinhada
                'md:rounded-none md:rounded-t-xl md:border-0 md:bg-transparent md:px-4 md:hover:bg-accent/60',
                ativa && 'md:bg-accent/50 md:font-semibold md:text-[#1E2A4A]',
                !ativa && 'md:text-muted-foreground',
                "md:after:absolute md:after:inset-x-2.5 md:after:-bottom-px md:after:h-0.75 md:after:rounded-full md:after:content-['']",
                ativa ? 'md:after:bg-[#1E2A4A]' : 'md:after:bg-transparent',
                FOCUS_RING,
              )}
            >
              {e.rotulo}
              {typeof e.contador === 'number' ? (
                <span
                  className={cn(
                    'inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                    e.destaque && !ativa
                      ? 'bg-[#FEF3DC] text-[#B54708]'
                      : ativa
                        ? 'bg-white/20 text-white md:bg-[#E5EDF5] md:text-[#1E2A4A]'
                        : 'bg-[#F2F4F7] text-[#344054]',
                  )}
                >
                  {e.contador}
                  <span className="sr-only"> {e.contador === 1 ? 'lead' : 'leads'}</span>
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
