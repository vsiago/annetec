import { cn } from '@/lib/utils'
import { TONES, type ConsoleTone } from './tokens'
import type { Etapa } from './tipos'

const ETAPAS: Record<Etapa, { rotulo: string; tom: ConsoleTone }> = {
  novo: { rotulo: 'Novo', tom: 'blue' },
  em_contato: { rotulo: 'Em contato', tom: 'navy' },
  proposta: { rotulo: 'Proposta', tom: 'violet' },
  negociacao: { rotulo: 'Negociação', tom: 'amber' },
  ganho: { rotulo: 'Venda fechada', tom: 'green' },
  perdido: { rotulo: 'Perdido', tom: 'neutral' },
}

export function rotuloDaEtapa(etapa: Etapa): string {
  return ETAPAS[etapa].rotulo
}

/** Pílula da etapa do funil. A cor acompanha sempre o texto. */
export function EtapaBadge({ etapa, className }: { etapa: Etapa; className?: string }) {
  const { rotulo, tom } = ETAPAS[etapa]
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONES[tom].chip,
        className,
      )}
    >
      {rotulo}
    </span>
  )
}
