'use client'

import { useId } from 'react'
import { AlarmClock, Search, X } from 'lucide-react'
import {
  ORIGENS_LEAD,
  ORIGEM_LEAD_LABELS,
  TEMPERATURAS_LEAD,
  TEMPERATURA_LEAD_LABELS,
  type OrigemLead,
  type TemperaturaLead,
  type VendasAgente,
} from '@annetec/contracts'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { FOCUS_RING } from '../ui/tokens'

export interface FiltrosFunil {
  busca: string
  origem: OrigemLead | ''
  temperatura: TemperaturaLead | ''
  agente: string
  atrasados: boolean
}

export const FILTROS_VAZIOS: FiltrosFunil = { busca: '', origem: '', temperatura: '', agente: '', atrasados: false }

export function temFiltro(f: FiltrosFunil): boolean {
  return Boolean(f.busca.trim() || f.origem || f.temperatura || f.agente || f.atrasados)
}

/**
 * Barra de filtros do Funil: busca, origem, temperatura, agente (só para quem vê equipe) e o atalho
 * "Só atrasados". Os filtros ativos aparecem como chips removíveis logo abaixo.
 */
export function BarraFiltros({
  filtros,
  aoMudar,
  agentes,
  equipe,
}: {
  filtros: FiltrosFunil
  aoMudar: (parcial: Partial<FiltrosFunil>) => void
  agentes: VendasAgente[]
  equipe: boolean
}) {
  const idBusca = useId()
  const nomeAgente = agentes.find(a => a.id === filtros.agente)?.nome ?? 'Agente'
  const chips: Array<{ chave: string; texto: string; remover: () => void }> = [
    ...(filtros.busca.trim() ? [{ chave: 'busca', texto: `Busca: ${filtros.busca.trim()}`, remover: () => aoMudar({ busca: '' }) }] : []),
    ...(filtros.origem ? [{ chave: 'origem', texto: `Origem: ${ORIGEM_LEAD_LABELS[filtros.origem]}`, remover: () => aoMudar({ origem: '' }) }] : []),
    ...(filtros.temperatura
      ? [{ chave: 'temperatura', texto: `Temperatura: ${TEMPERATURA_LEAD_LABELS[filtros.temperatura]}`, remover: () => aoMudar({ temperatura: '' }) }]
      : []),
    ...(filtros.agente ? [{ chave: 'agente', texto: `Agente: ${nomeAgente}`, remover: () => aoMudar({ agente: '' }) }] : []),
    ...(filtros.atrasados ? [{ chave: 'atrasados', texto: 'Só atrasados', remover: () => aoMudar({ atrasados: false }) }] : []),
  ]
  return (
    <div className="flex flex-col gap-2">
      <form role="search" aria-label="Filtrar leads" onSubmit={e => e.preventDefault()} className="flex flex-col gap-2 @3xl:flex-row @3xl:items-center">
        <div className="relative min-w-0 flex-1 @3xl:max-w-sm">
          <label htmlFor={idBusca} className="sr-only">
            Buscar lead
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={idBusca}
            type="search"
            value={filtros.busca}
            onChange={e => aoMudar({ busca: e.target.value })}
            placeholder="Buscar por nome, telefone ou documento"
            className="min-h-11 rounded-xl bg-white pl-9"
          />
        </div>
        <div className="-mx-4 flex items-center gap-2 relative overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] @3xl:mx-0 @3xl:flex-wrap @3xl:overflow-visible @3xl:px-0 [&::-webkit-scrollbar]:hidden">
          <SeletorChip
            rotulo="Origem"
            valor={filtros.origem}
            aoMudar={v => aoMudar({ origem: v as OrigemLead | '' })}
            opcoes={ORIGENS_LEAD.map(o => ({ id: o, rotulo: ORIGEM_LEAD_LABELS[o] }))}
          />
          <SeletorChip
            rotulo="Temperatura"
            valor={filtros.temperatura}
            aoMudar={v => aoMudar({ temperatura: v as TemperaturaLead | '' })}
            opcoes={TEMPERATURAS_LEAD.map(t => ({ id: t, rotulo: TEMPERATURA_LEAD_LABELS[t] }))}
          />
          {equipe ? (
            <SeletorChip rotulo="Agente" valor={filtros.agente} aoMudar={v => aoMudar({ agente: v })} opcoes={agentes.map(a => ({ id: a.id, rotulo: a.nome }))} />
          ) : null}
          <button
            type="button"
            aria-pressed={filtros.atrasados}
            onClick={() => aoMudar({ atrasados: !filtros.atrasados })}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors',
              filtros.atrasados ? 'border-[#D92D20] bg-[#FEF3F2] text-[#B42318]' : 'border-border bg-white text-[#344054] hover:bg-[#F2F4F7]',
              FOCUS_RING,
            )}
          >
            <AlarmClock className="size-4" aria-hidden="true" />
            Só atrasados
          </button>
        </div>
      </form>
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Filtros ativos">
          {chips.map(c => (
            <span key={c.chave} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-[#E5EDF5] pl-3 pr-1 text-xs font-semibold text-[#1E2A4A]">
              {c.texto}
              <button
                type="button"
                onClick={c.remover}
                aria-label={`Remover filtro ${c.texto}`}
                className={cn('inline-flex size-7 items-center justify-center rounded-full hover:bg-[#D0DDEC]', FOCUS_RING)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
          {chips.length > 1 ? (
            <button
              type="button"
              onClick={() => aoMudar({ ...FILTROS_VAZIOS })}
              className={cn('inline-flex min-h-8 items-center rounded-full px-2 text-xs font-semibold text-muted-foreground hover:text-foreground', FOCUS_RING)}
            >
              Limpar tudo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SeletorChip({
  rotulo,
  valor,
  aoMudar,
  opcoes,
}: {
  rotulo: string
  valor: string
  aoMudar: (id: string) => void
  opcoes: ReadonlyArray<{ id: string; rotulo: string }>
}) {
  const id = useId()
  return (
    <div className="shrink-0">
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        onChange={e => aoMudar(e.target.value)}
        className={cn(
          'min-h-11 rounded-xl border bg-white px-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          valor ? 'border-[#1E2A4A] text-[#1E2A4A]' : 'border-border text-[#344054]',
        )}
      >
        <option value="">{rotulo}</option>
        {opcoes.map(o => (
          <option key={o.id} value={o.id}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  )
}
