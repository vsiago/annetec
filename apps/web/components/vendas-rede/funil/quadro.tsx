'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { KeyboardCoordinateGetter } from '@dnd-kit/core'
import { ChevronDown, GripVertical, PartyPopper, XCircle } from 'lucide-react'
import { ETAPA_LEAD_LABELS, type ColunaQuadro, type EtapaLead, type QuadroLeadsResposta, type VendasLead } from '@annetec/contracts'
import { COR_DA_ETAPA, VAZIO_DA_ETAPA, avaliarMovimento, type EtapaAberta } from '@/lib/vendas-rede/funil'
import { cn } from '@/lib/utils'
import { formatarMoedaCompacta } from '../ui/mascaras'
import { LeadCard } from '../ui/lead-card'
import { FOCUS_RING } from '../ui/tokens'
import { useVendasRede } from '../provider'
import { ID_ZONA_VENDA, preferePoucoMovimento } from './celebracao'
import type { AcoesDoFunil } from './tipos'

/** Largura mínima de coluna: abaixo disso o quadro rola na horizontal em vez de espremer os cards. */
const GRADE = 'grid-cols-[repeat(4,minmax(15rem,1fr))]'

const idColuna = (etapa: EtapaLead) => `col:${etapa}`
const etapaDoId = (id: string | number): EtapaLead | null => {
  const t = String(id)
  return t.startsWith('col:') ? (t.slice(4) as EtapaLead) : null
}

/** Colisão: ponteiro dentro da coluna; no teclado (sem ponteiro), o centro do card dentro da coluna. */
const colisao: CollisionDetection = args => {
  if (args.pointerCoordinates) {
    const dentro = pointerWithin(args)
    if (dentro.length > 0) return dentro
  }
  const { collisionRect, droppableRects, droppableContainers } = args
  const cx = collisionRect.left + collisionRect.width / 2
  const cy = collisionRect.top + collisionRect.height / 2
  return droppableContainers
    .filter(c => {
      const r = droppableRects.get(c.id)
      return r && cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom
    })
    .map(c => ({ id: c.id, data: { droppableContainer: c, value: 0 } }))
}

/** Setas movem o card entre colunas (e entre Venda fechada e Perdido) em vez de andar de pouco em pouco. */
const coordenadasDoTeclado: KeyboardCoordinateGetter = (event, { context: { active, over, droppableRects, droppableContainers, collisionRect } }) => {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.code)) return undefined
  event.preventDefault()
  if (!active || !collisionRect) return undefined
  const cx = collisionRect.left + collisionRect.width / 2
  const cy = collisionRect.top + collisionRect.height / 2
  const grupo = (id: string | number) => (String(id).startsWith('zona:') ? 'zona' : 'col')
  const atual = over ? grupo(over.id) : 'col'
  const horizontal = event.code === 'ArrowRight' || event.code === 'ArrowLeft'
  // Setas laterais andam entre as colunas (ou entre Venda fechada e Perdido); cima e baixo trocam de faixa.
  const alvoGrupo = horizontal ? atual : atual === 'col' ? 'zona' : 'col'
  if (!horizontal && ((event.code === 'ArrowUp' && atual === 'zona') || (event.code === 'ArrowDown' && atual === 'col'))) return undefined
  const centro = (r: { left: number; top: number; width: number; height: number }) => ({ x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 120) })
  const alvos = droppableContainers
    .getEnabled()
    .filter(c => grupo(c.id) === alvoGrupo && c.id !== over?.id)
    .map(c => ({ id: c.id, rect: droppableRects.get(c.id) }))
    .filter((a): a is { id: typeof a.id; rect: NonNullable<typeof a.rect> } => Boolean(a.rect))
  const escolhido = alvos
    .filter(a => {
      if (!horizontal) return true
      const c = centro(a.rect)
      return event.code === 'ArrowRight' ? c.x > cx + 20 : c.x < cx - 20
    })
    .sort((a, b) => {
      const ca = centro(a.rect)
      const cb = centro(b.rect)
      return Math.abs(ca.x - cx) - Math.abs(cb.x - cx)
    })[0]
  if (!escolhido) return undefined
  const c = centro(escolhido.rect)
  return { x: c.x - collisionRect.width / 2, y: c.y - collisionRect.height / 2 }
}

function rotuloDoAlvo(id: string | number | undefined): string {
  const t = String(id ?? '')
  if (t === 'zona:ganho') return 'Venda fechada'
  if (t === 'zona:perdido') return 'Perdido'
  const etapa = etapaDoId(t)
  return etapa ? ETAPA_LEAD_LABELS[etapa] : 'fora das colunas'
}

function etapaDoAlvo(id: string | number | undefined): EtapaLead | null {
  const t = String(id ?? '')
  if (t === 'zona:ganho') return 'ganho'
  if (t === 'zona:perdido') return 'perdido'
  return etapaDoId(t)
}

const anuncios: Announcements = {
  onDragStart: ({ active }) => `Pegou ${(active.data.current?.lead as VendasLead | undefined)?.nome ?? 'o lead'}, em ${ETAPA_LEAD_LABELS[(active.data.current?.lead as VendasLead | undefined)?.etapa ?? 'novo']}.`,
  onDragOver: ({ active, over }) =>
    over ? `${(active.data.current?.lead as VendasLead | undefined)?.nome ?? 'O lead'} sobre ${rotuloDoAlvo(over.id)}.` : 'Fora das colunas.',
  onDragEnd: ({ active, over }) =>
    over ? `${(active.data.current?.lead as VendasLead | undefined)?.nome ?? 'O lead'} solto em ${rotuloDoAlvo(over.id)}.` : 'Soltou fora das colunas. Nada mudou.',
  onDragCancel: () => 'Movimento cancelado. O lead continua onde estava.',
}

/**
 * Funil em quadro: colunas Novo · Em contato · Proposta · Negociação e, à direita, o encerramento
 * (Venda fechada e Perdido, com os totais do mês). Arrastar um card para outra coluna muda a etapa
 * (com mouse, toque ou teclado: alça do card, setas, Espaço); o servidor continua mandando nas regras
 * e a página devolve o card com o motivo quando a transição não vale.
 */
export function Quadro({
  dados,
  acoes,
  aoPausar,
  aoVerMais,
  aoArrastar,
}: {
  dados: QuadroLeadsResposta
  acoes: AcoesDoFunil
  aoPausar: (valor: boolean) => void
  aoVerMais: () => void
  aoArrastar?: (ativo: boolean) => void
}) {
  const { eu } = useVendasRede()
  const [ativo, setAtivo] = useState<VendasLead | null>(null)
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: coordenadasDoTeclado }),
  )

  const aoComecar = useCallback(
    (e: DragStartEvent) => {
      setAtivo((e.active.data.current?.lead as VendasLead | undefined) ?? null)
      aoPausar(true)
      aoArrastar?.(true)
    },
    [aoPausar, aoArrastar],
  )

  const aoTerminar = useCallback(
    (e: DragEndEvent) => {
      const lead = (e.active.data.current?.lead as VendasLead | undefined) ?? null
      setAtivo(null)
      aoPausar(false)
      aoArrastar?.(false)
      if (!lead || !e.over) return
      const para = etapaDoAlvo(e.over.id)
      if (para) acoes.pedirMover(lead, para, 'arrasto')
    },
    [acoes, aoPausar, aoArrastar],
  )

  const cancelar = useCallback(() => {
    setAtivo(null)
    aoPausar(false)
    aoArrastar?.(false)
  }, [aoPausar, aoArrastar])

  const textosDeAjuda = useMemo(
    () => ({
      draggable:
        'Para mover o lead, tecle Espaço para pegar, use as setas para escolher a coluna e Espaço para soltar. Esc cancela. Também dá para usar o menu do card, em Mover para.',
    }),
    [],
  )

  return (
    <DndContext
      sensors={sensores}
      collisionDetection={colisao}
      onDragStart={aoComecar}
      onDragEnd={aoTerminar}
      onDragCancel={cancelar}
      accessibility={{ announcements: anuncios, screenReaderInstructions: textosDeAjuda }}
    >
      <div className="flex flex-col gap-3">
        <Encerrados fechados={dados.fechados} acoes={acoes} papel={eu.papel} />
        <div className="relative overflow-x-auto pb-2 [scrollbar-width:thin]">
          <div className={cn('grid min-w-[62rem] items-start gap-3', GRADE)}>
            {dados.etapas.map(coluna => (
              <Coluna key={coluna.etapa} coluna={coluna} acoes={acoes} papel={eu.papel} aoVerMais={aoVerMais} />
            ))}
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={preferePoucoMovimento() ? null : undefined}>
        {ativo ? (
          <div className="w-[17rem] rotate-1 cursor-grabbing shadow-2xl">
            <LeadCard lead={ativo} mostrarAgente={acoes.mostrarAgente} agora={acoes.agora} rapidas="hover" />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

/** Como a coluna se mostra a quem está arrastando: destino válido, destino recusado ou neutro. */
function useEstadoDeArrasto(alvo: EtapaLead, papel: Parameters<typeof avaliarMovimento>[2]) {
  const { active } = useDndContext()
  const lead = (active?.data.current?.lead as VendasLead | undefined) ?? null
  if (!lead) return { arrastando: false, valido: false, mesma: false }
  const v = avaliarMovimento(lead, alvo, papel)
  return { arrastando: true, valido: v.tipo === 'mover' || v.tipo === 'perdido' || v.tipo === 'ganho-confirmar', mesma: v.tipo === 'mesma-etapa' }
}

function Coluna({
  coluna,
  acoes,
  papel,
  aoVerMais,
}: {
  coluna: ColunaQuadro
  acoes: AcoesDoFunil
  papel: Parameters<typeof avaliarMovimento>[2]
  aoVerMais: () => void
}) {
  const etapa = coluna.etapa as EtapaAberta
  const { setNodeRef, isOver } = useDroppable({ id: idColuna(coluna.etapa), disabled: !acoes.podeEscrever })
  const estado = useEstadoDeArrasto(coluna.etapa, papel)
  const cor = COR_DA_ETAPA[etapa]
  const rotulo = ETAPA_LEAD_LABELS[coluna.etapa]
  const vazio = VAZIO_DA_ETAPA[etapa]
  const tituloId = `funil-col-${coluna.etapa}`
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={tituloId}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-[#F6F7F9] transition-[box-shadow,opacity,border-color] duration-150',
        estado.arrastando && !estado.mesma && !estado.valido && 'opacity-55',
        estado.arrastando && estado.valido && 'border-dashed border-[#98A2B3]',
        isOver && estado.valido && 'border-solid border-[var(--vr-accent,#1E2A4A)] ring-2 ring-[var(--vr-accent,#1E2A4A)]/30',
        isOver && !estado.valido && !estado.mesma && 'border-[#F97066] ring-2 ring-[#D92D20]/25',
        !estado.arrastando && 'border-border',
      )}
    >
      <div aria-hidden="true" className={cn('h-1 w-full', cor.faixa)} />
      <header className="flex flex-col gap-0.5 px-3 pb-2 pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 id={tituloId} className="m-0 text-sm font-semibold text-foreground">
            {rotulo}
          </h2>
          <span className={cn('inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums', cor.chip)}>
            {coluna.total}
            <span className="sr-only"> {coluna.total === 1 ? 'lead' : 'leads'}</span>
          </span>
        </div>
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium tabular-nums text-[#344054]" title={coluna.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}>
            {coluna.valor > 0 ? formatarMoedaCompacta(coluna.valor) : 'Sem valor'}
          </span>
          {coluna.atrasados > 0 ? (
            <span className="font-semibold text-[#B42318]">
              {coluna.atrasados} {coluna.atrasados === 1 ? 'atrasado' : 'atrasados'}
            </span>
          ) : null}
        </p>
      </header>
      <div className="flex max-h-[max(24rem,calc(100dvh-24rem))] min-h-24 flex-col gap-2 overflow-y-auto overscroll-contain px-2 pb-2">
        {coluna.itens.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#D0D5DD] px-3 py-6 text-center">
            <p className="m-0 text-sm font-medium text-[#344054]">{vazio.titulo}</p>
            <p className="m-0 text-xs text-muted-foreground">{vazio.dica}</p>
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {coluna.itens.map(lead => (
              <li key={lead.id}>
                <CardArrastavel lead={lead} acoes={acoes} />
              </li>
            ))}
          </ul>
        )}
        {coluna.total > coluna.itens.length ? (
          <button
            type="button"
            onClick={aoVerMais}
            className={cn('min-h-11 rounded-xl border border-border bg-white px-3 text-xs font-semibold text-[#344054] hover:bg-[#F2F4F7]', FOCUS_RING)}
          >
            Mostrando {coluna.itens.length} de {coluna.total}. Ver mais
          </button>
        ) : null}
      </div>
    </section>
  )
}

function CardArrastavel({ lead, acoes }: { lead: VendasLead; acoes: AcoesDoFunil }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
    disabled: !acoes.podeEscrever,
  })
  return (
    <div ref={setNodeRef} {...(acoes.podeEscrever ? listeners : {})} className={cn(acoes.podeEscrever && 'cursor-grab touch-manipulation active:cursor-grabbing')}>
      <LeadCard
        lead={lead}
        mostrarAgente={acoes.mostrarAgente}
        agora={acoes.agora}
        arrastando={isDragging}
        menu={acoes.menu(lead)}
        onAbrir={() => acoes.abrir(lead)}
        onRegistrarContato={acoes.podeEscrever ? () => acoes.abrir(lead, { dialogo: 'contato' }) : undefined}
        onMarcarPasso={acoes.podeEscrever ? () => acoes.abrir(lead, { dialogo: 'passo' }) : undefined}
        onLigouOuChamou={canal => acoes.aoLigouOuChamou(lead, canal)}
        slotArrasto={
          acoes.podeEscrever ? (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              aria-label={`Mover ${lead.nome} para outra coluna`}
              className={cn(
                '-ml-2 -mt-0.5 inline-flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded text-[#98A2B3] hover:bg-[#F2F4F7] hover:text-[#475467] active:cursor-grabbing',
                FOCUS_RING,
              )}
            >
              <GripVertical className="size-4" aria-hidden="true" />
            </button>
          ) : undefined
        }
      />
    </div>
  )
}

/**
 * Faixa de encerramento acima das colunas: duas zonas para soltar (Venda fechada e Perdido) com os
 * totais do mês, e a lista dos últimos encerrados num bloco que abre e fecha. As zonas têm tamanho
 * fixo para o arrasto não "pular" quando alguém começa a arrastar, e ficam sempre à vista (sem rolar).
 */
function Encerrados({
  fechados,
  acoes,
  papel,
}: {
  fechados: QuadroLeadsResposta['fechados']
  acoes: AcoesDoFunil
  papel: Parameters<typeof avaliarMovimento>[2]
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <section aria-labelledby="funil-encerrados" className="flex flex-col gap-2 rounded-2xl border border-border bg-[#F6F7F9] p-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="funil-encerrados" className="m-0 px-2 text-sm font-semibold text-foreground">
          Encerrados <span className="text-xs font-normal text-muted-foreground">neste mês</span>
        </h2>
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 @3xl:max-w-xl">
          <Zona
            id="venda"
            alvo="ganho"
            papel={papel}
            podeEscrever={acoes.podeEscrever}
            icone={<PartyPopper className="size-4" aria-hidden="true" />}
            titulo="Venda fechada"
            total={fechados.ganhos.total}
            valor={fechados.ganhos.valor}
            tom="verde"
          />
          <Zona
            id="perdido"
            alvo="perdido"
            papel={papel}
            podeEscrever={acoes.podeEscrever}
            icone={<XCircle className="size-4" aria-hidden="true" />}
            titulo="Perdido"
            total={fechados.perdidos.total}
            valor={fechados.perdidos.valor}
            tom="cinza"
          />
        </div>
        <button
          type="button"
          aria-expanded={aberto}
          onClick={() => setAberto(a => !a)}
          className={cn('ml-auto inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-[#344054] hover:bg-white', FOCUS_RING)}
        >
          Últimos encerrados
          <ChevronDown className={cn('size-4 transition-transform', aberto && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>
      {aberto ? (
        fechados.itens.length === 0 ? (
          <p className="m-0 px-2 pb-2 text-xs text-muted-foreground">Nenhuma venda fechada ou perdida neste mês ainda. A primeira vem aí.</p>
        ) : (
          <ul className="m-0 grid list-none gap-1.5 p-0 @3xl:grid-cols-2 @5xl:grid-cols-3">
            {fechados.itens.map(lead => (
              <li key={lead.id}>
                <button
                  type="button"
                  onClick={() => acoes.abrir(lead)}
                  className={cn(
                    'flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-white px-2.5 py-2 text-left text-xs hover:bg-[#F9FAFB]',
                    FOCUS_RING,
                  )}
                >
                  <span className="min-w-0 truncate font-semibold text-foreground">{lead.nome}</span>
                  <span className={cn('shrink-0 font-medium', lead.etapa === 'ganho' ? 'text-[#067647]' : 'text-muted-foreground')}>
                    {lead.etapa === 'ganho' ? 'Venda fechada' : 'Perdido'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}

function Zona({
  id,
  alvo,
  papel,
  podeEscrever,
  icone,
  titulo,
  total,
  valor,
  tom,
}: {
  id: 'venda' | 'perdido'
  alvo: 'ganho' | 'perdido'
  papel: Parameters<typeof avaliarMovimento>[2]
  podeEscrever: boolean
  icone: React.ReactNode
  titulo: string
  total: number
  valor: number
  tom: 'verde' | 'cinza'
}) {
  const { setNodeRef, isOver } = useDroppable({ id: id === 'venda' ? 'zona:ganho' : 'zona:perdido', disabled: !podeEscrever })
  const estado = useEstadoDeArrasto(alvo, papel)
  return (
    <div
      ref={setNodeRef}
      id={id === 'venda' ? ID_ZONA_VENDA : undefined}
      className={cn(
        'flex min-h-[4.25rem] min-w-0 flex-col justify-center gap-0.5 rounded-xl border-2 border-dashed px-3 py-1.5 transition-colors duration-150',
        tom === 'verde' ? 'border-[#A6F4C5] bg-[#ECFDF3] text-[#067647]' : 'border-[#D0D5DD] bg-white text-[#475467]',
        estado.arrastando && !estado.valido && 'opacity-60',
        isOver && estado.valido && 'border-solid border-[var(--vr-accent,#1E2A4A)] ring-2 ring-[var(--vr-accent,#1E2A4A)]/30',
        isOver && !estado.valido && 'border-solid border-[#F97066]',
      )}
    >
      <p className="m-0 flex items-center gap-1.5 text-sm font-semibold">
        {icone}
        {titulo}
      </p>
      <p className="m-0 text-xs">
        <span className="font-semibold tabular-nums">{total}</span> {total === 1 ? 'lead' : 'leads'}
        {valor > 0 ? <span title={valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}> · {formatarMoedaCompacta(valor)}</span> : null}
      </p>
      {estado.arrastando ? <p className="m-0 text-[11px]">{estado.valido ? 'Solte aqui' : 'Não permitido para este lead'}</p> : null}
    </div>
  )
}
