'use client'

import { Check, Clock3, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCENT_BG, FOCUS_RING } from './tokens'

export type ResultadoEscolhido = 'assinou' | 'vai_pensar' | 'recusou'

/**
 * As três saídas do atendimento no balcão, em botões grandes (64 px+):
 *  - Assinar agora (a principal, na cor de ação);
 *  - Vai pensar (cria o retorno em 2 dias);
 *  - Não quis (pede um motivo curto).
 * Uma única ação principal; as outras duas em contorno. `carregando` indica
 * qual está em andamento e trava as demais.
 */
export function ResultadoAtendimento({
  aoEscolher,
  carregando,
  desabilitado,
  className,
}: {
  aoEscolher: (resultado: ResultadoEscolhido) => void
  carregando?: ResultadoEscolhido | null
  desabilitado?: boolean
  className?: string
}) {
  const travado = desabilitado || Boolean(carregando)
  const base = cn(
    'flex min-h-16 w-full items-center gap-4 rounded-2xl px-5 text-left text-lg font-semibold transition-[filter,background-color]',
    'disabled:pointer-events-none disabled:opacity-50',
    FOCUS_RING,
  )
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <button
        type="button"
        disabled={travado}
        aria-busy={carregando === 'assinou' || undefined}
        onClick={() => aoEscolher('assinou')}
        className={cn(base, ACCENT_BG, 'hover:brightness-110')}
      >
        <Check className="size-6 shrink-0" aria-hidden="true" />
        <span className="flex flex-col">
          Assinar agora
          <span className="text-sm font-normal opacity-85">Gera o pagamento e mostra o QR na tela</span>
        </span>
      </button>
      <button
        type="button"
        disabled={travado}
        aria-busy={carregando === 'vai_pensar' || undefined}
        onClick={() => aoEscolher('vai_pensar')}
        className={cn(base, 'border border-border bg-white text-foreground hover:bg-[#F2F4F7]')}
      >
        <Clock3 className="size-6 shrink-0 text-[#B54708]" aria-hidden="true" />
        <span className="flex flex-col">
          Vai pensar
          <span className="text-sm font-normal text-muted-foreground">Anota o retorno para daqui a 2 dias</span>
        </span>
      </button>
      <button
        type="button"
        disabled={travado}
        aria-busy={carregando === 'recusou' || undefined}
        onClick={() => aoEscolher('recusou')}
        className={cn(base, 'border border-border bg-white text-foreground hover:bg-[#F2F4F7]')}
      >
        <X className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex flex-col">
          Não quis
          <span className="text-sm font-normal text-muted-foreground">Registra o motivo em uma frase</span>
        </span>
      </button>
    </div>
  )
}
