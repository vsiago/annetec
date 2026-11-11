'use client'

import type { ReactNode } from 'react'
import { AlarmClock, CalendarCheck2, CalendarClock, CalendarPlus, MessageCircle, MoreHorizontal, Phone, PhoneCall, Timer } from 'lucide-react'
import type { VendasLead } from '@annetec/contracts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { linhaDoProximoPasso, iniciais, linkTelefone, textoDiasNaEtapa } from '@/lib/vendas-rede/funil'
import { TemperaturaChip } from '../funil/temperatura-chip'
import { IconeOrigem } from './origem-badge'
import { formatarMoedaCompacta } from './mascaras'
import { CARD_SHADOW, CARD_SHADOW_HOVER, FOCUS_RING } from './tokens'
import { montarWaLink } from './wa-link'
import type { Etapa, Origem, PassoJornada, ProximoPasso } from './tipos'

/** Formato antigo do cartão (mantido só para o adaptador `leadParaCard`; o Funil usa `VendasLead` direto). */
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
  diasNaEtapa?: number
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
  /** Explicação curta sob o rótulo (ex.: "Volta para Disponíveis para outra pessoa atender."). */
  descricao?: string
  /** Linha separadora antes do item. */
  separador?: boolean
}

/**
 * Cartão do lead do Funil (quadro, lista e celular). De cima para baixo: quem é · temperatura ·
 * plano/valor · próximo passo com estado · de onde veio, há quanto tempo está na etapa e quem cuida.
 *
 *  - O nome é um botão que abre a folha do lead.
 *  - Ações rápidas (Ligar, WhatsApp, Registrar contato) aparecem ao passar o mouse e ao focar o cartão
 *    por teclado; no toque ficam sempre visíveis (`rapidas="sempre"`).
 *  - `slotArrasto`: a alça de arrastar (o quadro injeta a do dnd-kit).
 *  - Próximo passo: "Hoje, 14:00"; "Atrasado há 2 dias" em vermelho com ícone; "Sem próximo passo" em
 *    cinza com o convite "Marcar".
 */
export function LeadCard({
  lead,
  mostrarAgente,
  agora,
  rapidas = 'hover',
  slotArrasto,
  menu,
  onAbrir,
  onRegistrarContato,
  onMarcarPasso,
  onLigouOuChamou,
  arrastando,
  className,
}: {
  lead: VendasLead
  mostrarAgente?: boolean
  agora?: Date
  rapidas?: 'hover' | 'sempre'
  slotArrasto?: ReactNode
  menu?: LeadCardMenuItem[]
  onAbrir?: () => void
  onRegistrarContato?: () => void
  onMarcarPasso?: () => void
  /** Depois de tocar em Ligar/WhatsApp: oportunidade de perguntar "como foi?". */
  onLigouOuChamou?: (canal: 'ligacao' | 'whatsapp') => void
  arrastando?: boolean
  className?: string
}) {
  const hoje = agora ?? new Date()
  const passo = linhaDoProximoPasso(lead, hoje)
  const diasNaEtapa = textoDiasNaEtapa(lead, hoje.getTime())
  const tel = linkTelefone(lead.telefone)
  const wa = montarWaLink(lead.telefone)
  const valor = lead.valorEstimado && lead.valorEstimado > 0 ? formatarMoedaCompacta(lead.valorEstimado) : null
  const atrasado = passo.estado === 'atrasado'
  const IconePasso = atrasado ? AlarmClock : passo.estado === 'hoje' ? CalendarCheck2 : passo.estado === 'sem' ? CalendarPlus : CalendarClock

  return (
    <article
      aria-label={`Lead ${lead.nome}`}
      className={cn(
        'group/card relative flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3 pl-3.5 transition-[box-shadow,opacity,transform] duration-200',
        atrasado ? 'border-[#FDA29B]' : 'border-border',
        atrasado && "before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-[#D92D20] before:content-['']",
        CARD_SHADOW,
        CARD_SHADOW_HOVER,
        arrastando && 'opacity-40',
        className,
      )}
    >
      <div className="flex items-start gap-1.5">
        {slotArrasto}
        {onAbrir ? (
          <button
            type="button"
            onClick={onAbrir}
            title={lead.nome}
            className={cn('line-clamp-2 min-w-0 flex-1 rounded text-left text-sm font-semibold leading-snug text-foreground hover:underline', FOCUS_RING)}
          >
            {lead.nome}
          </button>
        ) : (
          <h3 className="m-0 line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground">{lead.nome}</h3>
        )}
        {menu && menu.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Mais ações para ${lead.nome}`}
                className={cn(
                  '-mr-1.5 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[#F2F4F7] hover:text-foreground',
                  FOCUS_RING,
                )}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 rounded-xl">
              {menu.map(item => (
                <div key={item.rotulo}>
                  {item.separador ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    onSelect={item.onSelecionar}
                    className={cn('min-h-10 cursor-pointer flex-col items-start gap-0', item.perigo && 'text-[#B42318] focus:text-[#B42318]')}
                  >
                    {item.rotulo}
                    {item.descricao ? <span className="text-xs font-normal text-muted-foreground">{item.descricao}</span> : null}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {lead.temperatura || lead.interessePlanoNome || valor ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <TemperaturaChip temperatura={lead.temperatura} motivo={lead.temperaturaMotivo} />
          {lead.interessePlanoNome || valor ? (
            <p className="m-0 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {lead.interessePlanoNome ? <span className="truncate">{lead.interessePlanoNome}</span> : null}
              {lead.interessePlanoNome && valor ? <span aria-hidden="true">·</span> : null}
              {valor ? (
                <span className="shrink-0 font-semibold tabular-nums text-foreground" title={`Valor estimado: ${lead.valorEstimado!.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}>
                  {valor}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      <p
        className={cn(
          'm-0 flex min-w-0 items-center gap-1.5 text-xs',
          atrasado ? 'font-semibold text-[#B42318]' : passo.estado === 'sem' ? 'text-muted-foreground' : 'font-medium text-[#344054]',
        )}
      >
        <IconePasso className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">
          {passo.texto}
          {passo.acao && passo.estado !== 'sem' ? <span className="font-normal text-muted-foreground"> · {passo.acao}</span> : null}
        </span>
        {passo.estado === 'sem' && onMarcarPasso ? (
          <button
            type="button"
            onClick={onMarcarPasso}
            className={cn('shrink-0 rounded px-1 font-semibold text-[var(--vr-accent,#1E2A4A)] underline-offset-2 hover:underline', FOCUS_RING)}
          >
            Marcar
          </button>
        ) : null}
      </p>

      <div className="relative">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          <IconeOrigem origem={lead.origem} detalhe={lead.origemDetalhe} />
          {diasNaEtapa ? (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Timer className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{diasNaEtapa}</span>
            </span>
          ) : null}
          {mostrarAgente && lead.agenteNome ? (
            <span
              title={`Com ${lead.agenteNome}`}
              className="ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[#E5EDF5] text-[10px] font-bold text-[#1E2A4A]"
            >
              <span aria-hidden="true">{iniciais(lead.agenteNome)}</span>
              <span className="sr-only">Com {lead.agenteNome}</span>
            </span>
          ) : null}
        </div>
        {tel || wa || onRegistrarContato ? (
          <div
            className={cn(
              'flex items-center gap-1.5',
              rapidas === 'hover'
                ? 'absolute -inset-y-1 inset-x-0 bg-card opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/card:opacity-100'
                : 'mt-2 border-t border-border/70 pt-2',
            )}
          >
            {tel ? (
              <AcaoRapida href={tel} rotulo="Ligar" nome={lead.nome} icone={<Phone />} onClick={() => onLigouOuChamou?.('ligacao')} rapidas={rapidas} />
            ) : null}
            {wa ? (
              <AcaoRapida href={wa} rotulo="WhatsApp" nome={lead.nome} icone={<MessageCircle />} externo onClick={() => onLigouOuChamou?.('whatsapp')} rapidas={rapidas} />
            ) : null}
            {onRegistrarContato ? (
              <AcaoRapida rotulo="Registrar contato" nome={lead.nome} icone={<PhoneCall />} onClick={onRegistrarContato} rapidas={rapidas} grande />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function AcaoRapida({
  rotulo,
  nome,
  icone,
  href,
  externo,
  onClick,
  rapidas,
  grande,
}: {
  rotulo: string
  nome: string
  icone: ReactNode
  href?: string
  externo?: boolean
  onClick?: () => void
  rapidas: 'hover' | 'sempre'
  grande?: boolean
}) {
  const classes = cn(
    'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white text-xs font-semibold text-[#344054] transition-colors hover:bg-[#F2F4F7]',
    rapidas === 'sempre' ? 'min-h-11 min-w-11 px-3' : 'min-h-8 min-w-8 px-2',
    grande && 'flex-1',
    FOCUS_RING,
  )
  const conteudo = (
    <>
      <span aria-hidden="true" className="inline-flex [&>svg]:size-3.5">
        {icone}
      </span>
      <span className={cn(grande ? 'truncate' : 'sr-only')}>{rotulo}</span>
      <span className="sr-only"> {nome}</span>
    </>
  )
  if (href) {
    return (
      <a href={href} {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})} onClick={onClick} className={classes} title={rotulo}>
        {conteudo}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={classes} title={rotulo}>
      {conteudo}
    </button>
  )
}
