'use client'

import type { ReactNode } from 'react'
import { MapPin, MoreHorizontal, Tag, Timer } from 'lucide-react'
import { initialsOf } from '@/components/admin-platform/ui/entity-avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { AcaoPrincipal } from './acao-principal'
import { EtapaBadge } from './etapa-badge'
import { JornadaTrilha } from './jornada-trilha'
import { OrigemBadge } from './origem-badge'
import { ProximoPassoBadge } from './proximo-passo-badge'
import { CARD_SHADOW, CARD_SHADOW_HOVER, FOCUS_RING } from './tokens'
import type { Etapa, Origem, PassoJornada, ProximoPasso } from './tipos'

export type LeadCardDados = {
  id: string
  nome: string
  origem: Origem
  origemDetalhe?: string | null
  cidade?: string | null
  uf?: string | null
  planoInteresse?: string | null
  etapa: Etapa
  jornada: PassoJornada[]
  proximoPasso?: ProximoPasso | null
  /** Dias parado na etapa atual. */
  diasNaEtapa?: number
  /** Nome de quem cuida do lead (visível para quem enxerga a equipe). */
  agenteNome?: string | null
}

export type LeadCardAcao = {
  rotulo: string
  icone?: ReactNode
  onClick?: () => void
  href?: string
  carregando?: boolean
}

export type LeadCardMenuItem = {
  rotulo: string
  onSelecionar: () => void
  perigo?: boolean
  /** Linha separadora antes do item. */
  separador?: boolean
}

/**
 * Cartão do lead da área operacional (no lugar de linha de tabela).
 * Leitura de cima para baixo: quem é · de onde veio · onde está na jornada ·
 * o que fazer a seguir. Tem UMA ação principal (`acao`) e o resto no menu ⋯.
 *
 * - `onAbrir`: o nome vira botão que abre o detalhe (Sheet/folha).
 * - `acao`: o passo que faz o lead andar (Atender, Registrar contato, Enviar proposta, Fechar).
 * - `menu`: ações secundárias (reatribuir, devolver ao pool, marcar perdido…).
 * - `destaque`: borda âmbar, para lead com passo atrasado.
 */
export function LeadCard({
  lead,
  acao,
  menu,
  onAbrir,
  destaque,
  className,
}: {
  lead: LeadCardDados
  acao: LeadCardAcao
  menu?: LeadCardMenuItem[]
  onAbrir?: () => void
  destaque?: boolean
  className?: string
}) {
  const local = [lead.cidade, lead.uf].filter(Boolean).join('/')
  const atrasado = destaque ?? lead.proximoPasso?.atrasado
  return (
    <article
      aria-label={`Lead ${lead.nome}`}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 transition-shadow duration-200',
        atrasado ? 'border-[#FEDF89]' : 'border-border',
        CARD_SHADOW,
        CARD_SHADOW_HOVER,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#E5EDF5] text-[13px] font-bold text-[#1E2A4A]"
        >
          {initialsOf(lead.nome)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {onAbrir ? (
              <button
                type="button"
                onClick={onAbrir}
                className={cn('min-w-0 truncate rounded text-left text-base font-semibold leading-snug text-foreground hover:underline', FOCUS_RING)}
              >
                {lead.nome}
              </button>
            ) : (
              <h3 className="m-0 min-w-0 truncate text-base font-semibold leading-snug text-foreground">{lead.nome}</h3>
            )}
            <EtapaBadge etapa={lead.etapa} />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <OrigemBadge origem={lead.origem} detalhe={lead.origemDetalhe} />
            {local ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden="true" />
                {local}
              </span>
            ) : null}
            {lead.planoInteresse ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Tag className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{lead.planoInteresse}</span>
              </span>
            ) : null}
          </div>
        </div>
        {menu && menu.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Mais ações para ${lead.nome}`}
                className={cn(
                  'inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-[#F2F4F7] hover:text-foreground -mr-2 -mt-1',
                  FOCUS_RING,
                )}
              >
                <MoreHorizontal className="size-5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              {menu.map(item => (
                <div key={item.rotulo}>
                  {item.separador ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    onSelect={item.onSelecionar}
                    className={cn('min-h-10 cursor-pointer', item.perigo && 'text-[#B42318] focus:text-[#B42318]')}
                  >
                    {item.rotulo}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <JornadaTrilha passos={lead.jornada} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <ProximoPassoBadge passo={lead.proximoPasso} />
          <p className="m-0 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            {typeof lead.diasNaEtapa === 'number' ? (
              <span className="inline-flex items-center gap-1">
                <Timer className="size-3" aria-hidden="true" />
                {lead.diasNaEtapa === 0 ? 'Chegou hoje' : `${lead.diasNaEtapa} ${lead.diasNaEtapa === 1 ? 'dia' : 'dias'} nesta etapa`}
              </span>
            ) : null}
            {lead.agenteNome ? <span>Com {lead.agenteNome}</span> : null}
          </p>
        </div>
        <AcaoPrincipal
          {...(acao.href !== undefined ? { href: acao.href } : { onClick: acao.onClick })}
          icone={acao.icone}
          carregando={acao.carregando}
          className="sm:w-auto sm:min-w-40"
          bloco
        >
          {acao.rotulo}
        </AcaoPrincipal>
      </div>
    </article>
  )
}
