import type { ReactNode } from 'react'
import { initialsOf } from '@/components/admin-platform/ui/entity-avatar'
import { cn } from '@/lib/utils'
import { AcaoPrincipal } from './acao-principal'
import { EtapaBadge } from './etapa-badge'
import { FOCUS_RING } from './tokens'
import type { Etapa } from './tipos'

export type LinhaDaVezDados = {
  id: string
  nome: string
  etapa: Etapa
  /** Por que está na lista: "Novo no pool há 20 min", "Retorno marcado para 15h". */
  motivo: string
  /** Pinta o motivo de âmbar (atrasado ou urgente). */
  urgente?: boolean
}

/**
 * Item da lista "Sua vez agora": quem, por que agora e UMA ação
 * (Atender / Ligar / Registrar / Enviar proposta). Cabe em lista densa
 * dentro de um SectionCard; o nome (opcional `onAbrir`) abre o detalhe.
 */
export function LinhaDaVez({
  item,
  acao,
  onAbrir,
}: {
  item: LinhaDaVezDados
  acao: { rotulo: string; icone?: ReactNode; onClick?: () => void; href?: string; carregando?: boolean }
  onAbrir?: () => void
}) {
  const nome = (
    <span className="truncate text-sm font-semibold text-foreground">{item.nome}</span>
  )
  return (
    <div className="flex min-w-0 items-center gap-3 py-3">
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#E5EDF5] text-xs font-bold text-[#1E2A4A]"
      >
        {initialsOf(item.nome)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          {onAbrir ? (
            <button type="button" onClick={onAbrir} className={cn('min-w-0 rounded text-left hover:underline', FOCUS_RING)}>
              {nome}
            </button>
          ) : (
            nome
          )}
          <EtapaBadge etapa={item.etapa} className="hidden sm:inline-flex" />
        </div>
        <p className={cn('m-0 truncate text-xs', item.urgente ? 'font-medium text-[#B54708]' : 'text-muted-foreground')}>
          {item.motivo}
        </p>
      </div>
      <AcaoPrincipal
        {...(acao.href !== undefined ? { href: acao.href } : { onClick: acao.onClick })}
        icone={acao.icone}
        carregando={acao.carregando}
        className="shrink-0"
      >
        {acao.rotulo}
      </AcaoPrincipal>
    </div>
  )
}
