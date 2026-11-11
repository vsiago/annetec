'use client'

import { Clock, Inbox, UserCheck, UserPlus } from 'lucide-react'
import type { VendasLead } from '@annetec/contracts'
import { esperaDoDisponivel } from '@/lib/vendas-rede/funil'
import { cn } from '@/lib/utils'
import { formatarCelular } from '../ui/mascaras'
import { IconeOrigem } from '../ui/origem-badge'
import { FOCUS_RING } from '../ui/tokens'
import { AcaoPrincipal } from '../ui/acao-principal'
import type { AcoesDoFunil } from './tipos'

/**
 * Faixa "Disponíveis" no topo do Funil: leads sem responsável. Quem atender primeiro fica com o lead.
 * Cada card é compacto, com "Atender" como ação principal (um toque) e o tempo de espera à vista:
 * âmbar depois de 15 min. Para quem não tem perfil de agente (master do console) a ação é "Passar para alguém".
 * Vazia, uma linha discreta.
 */
export function FaixaDisponiveis({
  itens,
  total,
  acoes,
  agoraMs,
}: {
  itens: VendasLead[]
  total: number
  acoes: AcoesDoFunil
  agoraMs: number
}) {
  if (itens.length === 0) {
    return (
      <p role="status" className="m-0 flex items-center gap-2 px-1 text-sm text-muted-foreground">
        <Inbox className="size-4 shrink-0" aria-hidden="true" />
        Nenhum lead esperando agora. Quando alguém pedir contato, ele aparece aqui.
      </p>
    )
  }
  const urgentes = itens.filter(l => esperaDoDisponivel(l, agoraMs).urgente).length
  return (
    <section id="funil-disponiveis" tabIndex={-1} aria-labelledby="funil-disponiveis-titulo" className="flex flex-col gap-2.5 rounded-2xl border border-[#FEDF89] bg-[#FFFCF5] p-3 outline-none sm:p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h2 id="funil-disponiveis-titulo" className="m-0 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Inbox className="size-4 text-[#B54708]" aria-hidden="true" />
          Disponíveis
          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[#FEF3DC] px-1.5 text-xs font-semibold tabular-nums text-[#B54708]">
            {total}
            <span className="sr-only"> {total === 1 ? 'lead' : 'leads'}</span>
          </span>
        </h2>
        <p className="m-0 text-xs text-muted-foreground">
          Leads sem responsável. Quem atender primeiro fica com o lead.
          {urgentes > 0 ? <span className="font-semibold text-[#B54708]"> {urgentes === 1 ? '1 espera' : `${urgentes} esperam`} há mais de 15 min.</span> : null}
        </p>
      </header>
      <ul className="m-0 flex list-none gap-2.5 relative overflow-x-auto p-0 pb-1 [scrollbar-width:thin] @3xl:grid @3xl:grid-cols-2 @3xl:overflow-visible @5xl:grid-cols-3">
        {itens.slice(0, 6).map(lead => {
          const espera = esperaDoDisponivel(lead, agoraMs)
          const carregando = acoes.atendendoId === lead.id
          return (
            <li key={lead.id} className="w-[min(18rem,82%)] shrink-0 @3xl:w-auto">
              <article
                aria-label={`Disponível: ${lead.nome}`}
                className={cn(
                  'flex h-full items-center gap-3 rounded-xl border bg-white p-3',
                  espera.urgente ? 'border-[#FDB022]' : 'border-border',
                )}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => acoes.abrir(lead)}
                    className={cn('min-w-0 truncate rounded text-left text-sm font-semibold text-foreground hover:underline', FOCUS_RING)}
                  >
                    {lead.nome}
                  </button>
                  <p className="m-0 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <IconeOrigem origem={lead.origem} detalhe={lead.origemDetalhe} />
                    <span className="truncate">{lead.interessePlanoNome ?? (lead.telefone ? formatarCelular(lead.telefone) : 'Sem plano definido')}</span>
                  </p>
                  <p className={cn('m-0 flex items-center gap-1 text-xs', espera.urgente ? 'font-semibold text-[#B54708]' : 'text-muted-foreground')}>
                    <Clock className="size-3 shrink-0" aria-hidden="true" />
                    {espera.texto}
                    {espera.urgente ? <span className="sr-only"> (passou de 15 minutos)</span> : null}
                  </p>
                </div>
                <AcaoPrincipal
                  tamanho="md"
                  icone={acoes.podeAtender ? <UserCheck /> : <UserPlus />}
                  carregando={carregando}
                  onClick={() => acoes.atender(lead)}
                  disabled={!acoes.podeEscrever}
                  className="shrink-0"
                  aria-label={`${acoes.podeAtender ? 'Atender' : 'Passar para alguém'}: ${lead.nome}`}
                >
                  {acoes.podeAtender ? 'Atender' : 'Passar para alguém'}
                </AcaoPrincipal>
              </article>
            </li>
          )
        })}
      </ul>
      {total > itens.length || itens.length > 6 ? (
        <p className="m-0 text-xs text-muted-foreground">
          Mostrando {Math.min(6, itens.length)} dos {total}. Atenda os primeiros e os próximos aparecem aqui.
        </p>
      ) : null}
    </section>
  )
}
