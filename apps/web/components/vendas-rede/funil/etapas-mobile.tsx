'use client'

import { useRef, type KeyboardEvent } from 'react'
import { PartyPopper } from 'lucide-react'
import { ETAPA_LEAD_LABELS, type EtapaLead, type QuadroLeadsResposta } from '@annetec/contracts'
import { COR_DA_ETAPA, VAZIO_DA_ETAPA, type EtapaAberta } from '@/lib/vendas-rede/funil'
import { cn } from '@/lib/utils'
import { formatarMoedaCompacta } from '../ui/mascaras'
import { LeadCard } from '../ui/lead-card'
import { FOCUS_RING } from '../ui/tokens'
import type { AcoesDoFunil } from './tipos'

export type EtapaMobile = EtapaAberta | 'encerrados'

/**
 * Funil no celular (contêiner de até 768 px): sem quadro apertado. Chips de etapa roláveis com a
 * contagem (setas, Home e End trocam de chip) e, abaixo, a lista de cards da etapa escolhida.
 * Mudar de etapa é pelo menu do card ("Mover para"). Alvos de toque de 44 px ou mais.
 */
export function EtapasMobile({
  dados,
  etapa,
  aoMudar,
  acoes,
  aoVerMais,
}: {
  dados: QuadroLeadsResposta
  etapa: EtapaMobile
  aoMudar: (e: EtapaMobile) => void
  acoes: AcoesDoFunil
  aoVerMais: () => void
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const abas: Array<{ id: EtapaMobile; rotulo: string; contador: number }> = [
    ...dados.etapas.map(c => ({ id: c.etapa as EtapaMobile, rotulo: ETAPA_LEAD_LABELS[c.etapa], contador: c.total })),
    { id: 'encerrados', rotulo: 'Encerrados', contador: dados.fechados.ganhos.total + dados.fechados.perdidos.total },
  ]

  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const ultimo = abas.length - 1
    let destino = -1
    if (e.key === 'ArrowRight') destino = i === ultimo ? 0 : i + 1
    else if (e.key === 'ArrowLeft') destino = i === 0 ? ultimo : i - 1
    else if (e.key === 'Home') destino = 0
    else if (e.key === 'End') destino = ultimo
    if (destino < 0) return
    e.preventDefault()
    aoMudar(abas[destino]!.id)
    refs.current[destino]?.focus()
  }

  const coluna = etapa === 'encerrados' ? null : dados.etapas.find(c => c.etapa === etapa)

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Etapas do funil" className="-mx-4 flex gap-2 relative overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {abas.map((a, i) => {
          const ativa = a.id === etapa
          return (
            <button
              key={a.id}
              ref={el => {
                refs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`aba-funil-${a.id}`}
              aria-selected={ativa}
              aria-controls="painel-funil-etapa"
              tabIndex={ativa ? 0 : -1}
              onClick={() => aoMudar(a.id)}
              onKeyDown={ev => aoTeclar(ev, i)}
              data-zona-venda={a.id === 'encerrados' ? '' : undefined}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors',
                ativa ? 'border-[#1E2A4A] bg-[#1E2A4A] text-white' : 'border-border bg-white text-[#344054] hover:bg-[#F2F4F7]',
                FOCUS_RING,
              )}
            >
              {a.id !== 'encerrados' ? <span aria-hidden="true" className={cn('size-2 rounded-full', ativa ? 'bg-white' : COR_DA_ETAPA[a.id].ponto)} /> : null}
              {a.rotulo}
              <span className={cn('inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums', ativa ? 'bg-white/20 text-white' : 'bg-[#F2F4F7] text-[#344054]')}>
                {a.contador}
                <span className="sr-only"> {a.contador === 1 ? 'lead' : 'leads'}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div id="painel-funil-etapa" role="tabpanel" aria-labelledby={`aba-funil-${etapa}`} className="flex flex-col gap-2.5">
        {coluna ? (
          <>
            <p className="m-0 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="font-medium tabular-nums text-[#344054]">{formatarMoedaCompacta(coluna.valor)}</span>
              {coluna.atrasados > 0 ? (
                <span className="font-semibold text-[#B42318]">
                  {coluna.atrasados} {coluna.atrasados === 1 ? 'atrasado' : 'atrasados'}
                </span>
              ) : null}
            </p>
            {coluna.itens.length === 0 ? (
              <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-[#D0D5DD] px-4 py-8 text-center">
                <p className="m-0 text-sm font-medium text-[#344054]">{VAZIO_DA_ETAPA[coluna.etapa as EtapaAberta].titulo}</p>
                <p className="m-0 text-xs text-muted-foreground">{VAZIO_DA_ETAPA[coluna.etapa as EtapaAberta].dica}</p>
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
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
              <button type="button" onClick={aoVerMais} className={cn('min-h-11 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-[#344054]', FOCUS_RING)}>
                Mostrando {coluna.itens.length} de {coluna.total}. Ver mais
              </button>
            ) : null}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5 rounded-2xl border border-[#A6F4C5] bg-[#ECFDF3] p-3 text-[#067647]">
                <p className="m-0 flex items-center gap-1.5 text-sm font-semibold">
                  <PartyPopper className="size-4" aria-hidden="true" /> Venda fechada
                </p>
                <p className="m-0 text-xs">
                  {dados.fechados.ganhos.total} neste mês
                  {dados.fechados.ganhos.valor > 0 ? ` · ${formatarMoedaCompacta(dados.fechados.ganhos.valor)}` : ''}
                </p>
              </div>
              <div className="flex flex-col gap-0.5 rounded-2xl border border-border bg-white p-3 text-[#475467]">
                <p className="m-0 text-sm font-semibold">Perdido</p>
                <p className="m-0 text-xs">{dados.fechados.perdidos.total} neste mês</p>
              </div>
            </div>
            {dados.fechados.itens.length === 0 ? (
              <p className="m-0 rounded-2xl border border-dashed border-[#D0D5DD] px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhuma venda fechada ou perdida neste mês ainda. A primeira vem aí.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {dados.fechados.itens.map(lead => (
                  <li key={lead.id}>
                    <LeadCard lead={lead} mostrarAgente={acoes.mostrarAgente} agora={acoes.agora} rapidas="sempre" onAbrir={() => acoes.abrir(lead)} menu={acoes.menu(lead)} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export type { EtapaLead }
