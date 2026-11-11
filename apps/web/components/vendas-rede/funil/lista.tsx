'use client'

import { AlarmClock, CalendarCheck2, CalendarClock, CalendarPlus, MessageCircle, MoreHorizontal, Phone, PhoneCall } from 'lucide-react'
import { ETAPA_LEAD_LABELS, type QuadroLeadsResposta, type VendasLead } from '@annetec/contracts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { COR_DA_ETAPA, iniciais, linhaDoProximoPasso, linkTelefone, textoDiasNaEtapa, type EtapaAberta } from '@/lib/vendas-rede/funil'
import { cn } from '@/lib/utils'
import { formatarMoedaCompacta } from '../ui/mascaras'
import { EtapaBadge } from '../ui/etapa-badge'
import { LeadCard } from '../ui/lead-card'
import { IconeOrigem } from '../ui/origem-badge'
import { FOCUS_RING } from '../ui/tokens'
import { montarWaLink } from '../ui/wa-link'
import { TemperaturaChip } from './temperatura-chip'
import type { AcoesDoFunil } from './tipos'

const COLUNAS = 'grid-cols-[minmax(0,2.4fr)_6.5rem_5.5rem_minmax(0,1.8fr)_5rem_2rem_7.5rem]'

/**
 * Visão em lista do Funil: uma seção por etapa (cabeçalho com contagem e soma) e uma linha densa por
 * lead: quem é, etapa, temperatura, próximo passo, valor, responsável e ações rápidas. No celular
 * (`largo` falso) cada lead vira o mesmo cartão do quadro.
 */
export function ListaFunil({
  dados,
  acoes,
  largo,
  aoVerMais,
}: {
  dados: QuadroLeadsResposta
  acoes: AcoesDoFunil
  largo: boolean
  aoVerMais: () => void
}) {
  const colunas = dados.etapas.filter(c => c.total > 0)
  return (
    <div className="flex flex-col gap-5">
      {colunas.map(coluna => {
        const etapa = coluna.etapa as EtapaAberta
        return (
          <section key={coluna.etapa} aria-labelledby={`lista-${coluna.etapa}`} className="flex flex-col gap-2">
            <h2 id={`lista-${coluna.etapa}`} className="m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-foreground">
              <span aria-hidden="true" className={cn('size-2.5 rounded-full', COR_DA_ETAPA[etapa].ponto)} />
              {ETAPA_LEAD_LABELS[coluna.etapa]}
              <span className={cn('inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums', COR_DA_ETAPA[etapa].chip)}>
                {coluna.total}
              </span>
              {coluna.valor > 0 ? <span className="text-xs font-normal text-muted-foreground">{formatarMoedaCompacta(coluna.valor)}</span> : null}
              {coluna.atrasados > 0 ? (
                <span className="text-xs font-semibold text-[#B42318]">
                  {coluna.atrasados} {coluna.atrasados === 1 ? 'atrasado' : 'atrasados'}
                </span>
              ) : null}
            </h2>
            {largo ? (
              <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <li aria-hidden="true" className={cn('hidden gap-3 border-b border-border bg-[#F9FAFB] px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground @3xl:grid', COLUNAS)}>
                  <span>Lead</span>
                  <span>Etapa</span>
                  <span>Temperatura</span>
                  <span>Próximo passo</span>
                  <span className="text-right">Valor</span>
                  <span />
                  <span />
                </li>
                {coluna.itens.map(lead => (
                  <li key={lead.id} className="border-b border-border last:border-b-0">
                    <LinhaLead lead={lead} acoes={acoes} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {coluna.itens.map(lead => (
                  <li key={lead.id}>
                    <LeadCard
                      lead={lead}
                      mostrarAgente={acoes.mostrarAgente}
                      agora={acoes.agora}
                      rapidas="sempre"
                      menu={acoes.menu(lead)}
                      onAbrir={() => acoes.abrir(lead)}
                      onRegistrarContato={acoes.podeEscrever ? () => acoes.abrir(lead, { dialogo: 'contato' }) : undefined}
                      onMarcarPasso={acoes.podeEscrever ? () => acoes.abrir(lead, { dialogo: 'passo' }) : undefined}
                      onLigouOuChamou={canal => acoes.aoLigouOuChamou(lead, canal)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {coluna.total > coluna.itens.length ? (
              <button
                type="button"
                onClick={aoVerMais}
                className={cn('min-h-11 self-start rounded-xl border border-border bg-white px-4 text-xs font-semibold text-[#344054] hover:bg-[#F2F4F7]', FOCUS_RING)}
              >
                Mostrando {coluna.itens.length} de {coluna.total}. Ver mais
              </button>
            ) : null}
          </section>
        )
      })}
      {dados.fechados.itens.length > 0 ? (
        <section aria-labelledby="lista-encerrados" className="flex flex-col gap-2">
          <h2 id="lista-encerrados" className="m-0 flex flex-wrap items-center gap-x-2 text-sm font-semibold text-foreground">
            Encerrados neste mês
            <span className="text-xs font-normal text-muted-foreground">
              {dados.fechados.ganhos.total} {dados.fechados.ganhos.total === 1 ? 'venda fechada' : 'vendas fechadas'} · {dados.fechados.perdidos.total} {dados.fechados.perdidos.total === 1 ? 'perdido' : 'perdidos'}
            </span>
          </h2>
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-border bg-card p-0">
            {dados.fechados.itens.map(lead => (
              <li key={lead.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => acoes.abrir(lead)}
                  className={cn('flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-[#F9FAFB]', FOCUS_RING)}
                >
                  <span className="min-w-0 truncate text-sm font-semibold text-foreground">{lead.nome}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {lead.valorEstimado ? formatarMoedaCompacta(lead.valorEstimado) : null}
                    <EtapaBadge etapa={lead.etapa} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function LinhaLead({ lead, acoes }: { lead: VendasLead; acoes: AcoesDoFunil }) {
  const passo = linhaDoProximoPasso(lead, acoes.agora)
  const atrasado = passo.estado === 'atrasado'
  const IconePasso = atrasado ? AlarmClock : passo.estado === 'hoje' ? CalendarCheck2 : passo.estado === 'sem' ? CalendarPlus : CalendarClock
  const tel = linkTelefone(lead.telefone)
  const wa = montarWaLink(lead.telefone)
  const menu = acoes.menu(lead)
  const dias = textoDiasNaEtapa(lead, acoes.agora.getTime())
  return (
    <div className={cn('grid items-center gap-3 px-4 py-2.5 hover:bg-[#FCFCFD]', COLUNAS, atrasado && 'bg-[#FFFBFA]')}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <button type="button" onClick={() => acoes.abrir(lead)} className={cn('min-w-0 truncate rounded text-left text-sm font-semibold text-foreground hover:underline', FOCUS_RING)}>
          {lead.nome}
        </button>
        <p className="m-0 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <IconeOrigem origem={lead.origem} detalhe={lead.origemDetalhe} />
          <span className="truncate">{[lead.interessePlanoNome, dias].filter(Boolean).join(' · ')}</span>
        </p>
      </div>
      <span>
        <EtapaBadge etapa={lead.etapa} />
      </span>
      <span>
        <TemperaturaChip temperatura={lead.temperatura} motivo={lead.temperaturaMotivo} tamanho="md" />
      </span>
      <p className={cn('m-0 flex min-w-0 items-center gap-1.5 text-xs', atrasado ? 'font-semibold text-[#B42318]' : passo.estado === 'sem' ? 'text-muted-foreground' : 'font-medium text-[#344054]')}>
        <IconePasso className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{passo.texto}</span>
        {passo.estado === 'sem' && acoes.podeEscrever ? (
          <button type="button" onClick={() => acoes.abrir(lead, { dialogo: 'passo' })} className={cn('shrink-0 rounded px-1 font-semibold text-[var(--vr-accent,#1E2A4A)] hover:underline', FOCUS_RING)}>
            Marcar
          </button>
        ) : null}
      </p>
      <span className="text-right text-xs font-semibold tabular-nums text-foreground">
        {lead.valorEstimado && lead.valorEstimado > 0 ? formatarMoedaCompacta(lead.valorEstimado) : <span className="font-normal text-muted-foreground">-</span>}
      </span>
      <span>
        {acoes.mostrarAgente && lead.agenteNome ? (
          <span title={`Com ${lead.agenteNome}`} className="inline-flex size-7 items-center justify-center rounded-full bg-[#E5EDF5] text-[10px] font-bold text-[#1E2A4A]">
            <span aria-hidden="true">{iniciais(lead.agenteNome)}</span>
            <span className="sr-only">Com {lead.agenteNome}</span>
          </span>
        ) : null}
      </span>
      <div className="flex items-center justify-end gap-1">
        {tel ? (
          <a href={tel} onClick={() => acoes.aoLigouOuChamou(lead, 'ligacao')} title="Ligar" className={cn('inline-flex size-9 items-center justify-center rounded-lg text-[#344054] hover:bg-[#F2F4F7]', FOCUS_RING)}>
            <Phone className="size-4" aria-hidden="true" />
            <span className="sr-only">Ligar para {lead.nome}</span>
          </a>
        ) : null}
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => acoes.aoLigouOuChamou(lead, 'whatsapp')} title="WhatsApp" className={cn('inline-flex size-9 items-center justify-center rounded-lg text-[#344054] hover:bg-[#F2F4F7]', FOCUS_RING)}>
            <MessageCircle className="size-4" aria-hidden="true" />
            <span className="sr-only">Chamar {lead.nome} no WhatsApp</span>
          </a>
        ) : null}
        {acoes.podeEscrever ? (
          <button type="button" onClick={() => acoes.abrir(lead, { dialogo: 'contato' })} title="Registrar contato" className={cn('inline-flex size-9 items-center justify-center rounded-lg text-[#344054] hover:bg-[#F2F4F7]', FOCUS_RING)}>
            <PhoneCall className="size-4" aria-hidden="true" />
            <span className="sr-only">Registrar contato com {lead.nome}</span>
          </button>
        ) : null}
        {menu.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`Mais ações para ${lead.nome}`} className={cn('inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-[#F2F4F7]', FOCUS_RING)}>
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              {menu.map(item => (
                <div key={item.rotulo}>
                  {item.separador ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem onSelect={item.onSelecionar} className={cn('min-h-10 cursor-pointer flex-col items-start gap-0', item.perigo && 'text-[#B42318] focus:text-[#B42318]')}>
                    {item.rotulo}
                    {item.descricao ? <span className="text-xs font-normal text-muted-foreground">{item.descricao}</span> : null}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  )
}
