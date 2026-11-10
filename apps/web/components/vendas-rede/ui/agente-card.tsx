import type { ReactNode } from 'react'
import { initialsOf } from '@/components/admin-platform/ui/entity-avatar'
import { cn } from '@/lib/utils'
import { PresencaDot } from './presenca-dot'
import { CARD_SHADOW, CARD_SHADOW_HOVER, FOCUS_RING } from './tokens'
import type { PapelComercial } from './tipos'

export const ROTULO_PAPEL: Record<PapelComercial, string> = {
  master: 'Master',
  gerente: 'Gerente',
  supervisor: 'Supervisor',
  vendedor: 'Vendedor',
  balcao: 'Balcão',
}

export type AgenteResumo = {
  id: string
  nome: string
  papel: PapelComercial
  online: boolean
  /** Contexto: equipe, unidade ou corretora. */
  vinculo?: string
  emAndamento?: number
  ganhosNoMes?: number
  metaMensal?: number
}

/**
 * Cartão de agente (tela Equipe e árvore da Rede): avatar com bolinha de
 * presença, nome, papel, e três números: em andamento, ganhos no mês e meta
 * (barra de progresso com o texto "x de y"). `acao` aceita UMA ação
 * (ex.: "Ver leads"); `aoAbrir` torna o nome um botão.
 */
export function AgenteCard({
  agente,
  acao,
  aoAbrir,
  className,
}: {
  agente: AgenteResumo
  acao?: ReactNode
  aoAbrir?: () => void
  className?: string
}) {
  const { ganhosNoMes = 0, metaMensal = 0 } = agente
  const pct = metaMensal > 0 ? Math.min(100, Math.round((ganhosNoMes / metaMensal) * 100)) : 0
  const nome = <span className="truncate text-sm font-semibold text-foreground">{agente.nome}</span>
  return (
    <article
      aria-label={`${agente.nome}, ${ROTULO_PAPEL[agente.papel]}, ${agente.online ? 'online' : 'offline'}`}
      className={cn('flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4', CARD_SHADOW, CARD_SHADOW_HOVER, className)}
    >
      <div className="flex items-center gap-3">
        <span className="relative inline-flex shrink-0">
          <span
            aria-hidden="true"
            className="inline-flex size-11 items-center justify-center rounded-full bg-[#E5EDF5] text-[13px] font-bold text-[#1E2A4A]"
          >
            {initialsOf(agente.nome)}
          </span>
          <PresencaDot online={agente.online} className="absolute -bottom-0.5 -right-0.5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          {aoAbrir ? (
            <button type="button" onClick={aoAbrir} className={cn('min-w-0 rounded text-left hover:underline', FOCUS_RING)}>
              {nome}
            </button>
          ) : (
            nome
          )}
          <span className="truncate text-xs text-muted-foreground">
            {ROTULO_PAPEL[agente.papel]}
            {agente.vinculo ? ` · ${agente.vinculo}` : ''}
          </span>
        </div>
        <span className={cn('text-xs font-medium', agente.online ? 'text-[#067647]' : 'text-muted-foreground')} aria-hidden="true">
          {agente.online ? 'Online' : 'Offline'}
        </span>
      </div>

      {typeof agente.emAndamento === 'number' || typeof agente.ganhosNoMes === 'number' ? (
        <div className="flex flex-col gap-2">
          <dl className="m-0 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Em andamento</dt>
              <dd className="m-0 font-semibold tabular-nums">{agente.emAndamento ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Ganhos no mês</dt>
              <dd className="m-0 font-semibold tabular-nums">{ganhosNoMes}</dd>
            </div>
          </dl>
          {metaMensal > 0 ? (
            <div className="flex flex-col gap-1">
              <div
                role="progressbar"
                aria-valuenow={ganhosNoMes}
                aria-valuemin={0}
                aria-valuemax={metaMensal}
                aria-label={`Meta do mês: ${ganhosNoMes} de ${metaMensal}`}
                className="h-2 overflow-hidden rounded-full bg-[#F2F4F7]"
              >
                <div className="h-full rounded-full bg-[#1E2A4A]" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">
                Meta: {ganhosNoMes} de {metaMensal}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      {acao ? <div className="flex">{acao}</div> : null}
    </article>
  )
}
