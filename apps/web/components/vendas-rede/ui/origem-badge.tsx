import type { LucideIcon } from 'lucide-react'
import { CalendarDays, Globe, Handshake, Link2, MapPinned, Megaphone, Search, Store, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Origem } from './tipos'

const ORIGENS: Record<Origem, { rotulo: string; icone: LucideIcon }> = {
  site: { rotulo: 'Site', icone: Globe },
  indicacao: { rotulo: 'Indicação', icone: Handshake },
  balcao: { rotulo: 'Balcão', icone: Store },
  prospeccao: { rotulo: 'Prospecção', icone: Search },
  evento: { rotulo: 'Evento', icone: CalendarDays },
  redes_sociais: { rotulo: 'Redes sociais', icone: Megaphone },
  importacao: { rotulo: 'Importado', icone: Upload },
  link: { rotulo: 'Link', icone: Link2 },
  outro: { rotulo: 'Outro', icone: MapPinned },
}

export function rotuloDaOrigem(origem: Origem): string {
  return ORIGENS[origem].rotulo
}

/** Selo discreto de onde o lead veio. `detalhe` (ex.: nome do evento) entra após o rótulo. */
export function OrigemBadge({ origem, detalhe, className }: { origem: Origem; detalhe?: string | null; className?: string }) {
  const { rotulo, icone: Icone } = ORIGENS[origem]
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md bg-[#F2F4F7] px-2 py-0.5 text-xs font-medium text-[#344054]',
        className,
      )}
    >
      <Icone className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{detalhe ? `${rotulo} · ${detalhe}` : rotulo}</span>
    </span>
  )
}

/** Só o ícone da origem (cartões densos): o nome fica em `title` e em texto para leitor de tela. */
export function IconeOrigem({ origem, detalhe, className }: { origem: Origem; detalhe?: string | null; className?: string }) {
  const { rotulo, icone: Icone } = ORIGENS[origem]
  const nome = detalhe ? `${rotulo} · ${detalhe}` : rotulo
  return (
    <span title={`Origem: ${nome}`} className={cn('inline-flex shrink-0 items-center text-muted-foreground', className)}>
      <Icone className="size-3.5" aria-hidden="true" />
      <span className="sr-only">Origem: {nome}</span>
    </span>
  )
}
