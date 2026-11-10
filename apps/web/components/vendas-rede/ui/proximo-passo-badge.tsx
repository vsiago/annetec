import { AlarmClock, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProximoPasso } from './tipos'

/**
 * Próximo passo do lead em uma linha. Atrasado = âmbar com ícone de alarme
 * e a palavra "atrasado" (a cor não é o único sinal). Em dia = cinza neutro.
 * Sem passo definido, convida a definir um: não deixa o espaço em branco.
 */
export function ProximoPassoBadge({ passo, className }: { passo?: ProximoPasso | null; className?: string }) {
  if (!passo) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
        <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
        Sem próximo passo definido
      </span>
    )
  }
  const Icone = passo.atrasado ? AlarmClock : CalendarClock
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium',
        passo.atrasado ? 'bg-[#FEF3DC] text-[#B54708]' : 'bg-[#F2F4F7] text-[#344054]',
        className,
      )}
    >
      <Icone className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {passo.atrasado ? <span className="font-semibold">Atrasado: </span> : null}
        {passo.texto}
        {passo.quando ? ` · ${passo.quando}` : ''}
      </span>
    </span>
  )
}
