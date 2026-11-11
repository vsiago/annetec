'use client'

import type { ResultadoBalcao, VendasAtendimentoBalcao } from '@annetec/contracts'
import { cn } from '@/lib/utils'
import { formatarMoeda } from '../ui/mascaras'

const COR: Record<ResultadoBalcao, string> = {
  assinou: 'bg-[#E3F6EA] text-[#067647]',
  vai_pensar: 'bg-[#FEF3DC] text-[#B54708]',
  recusou: 'bg-[#F2F4F7] text-[#475467]',
  ja_associado: 'bg-[#E5EDF5] text-[#1E2A4A]',
  so_informacao: 'bg-[#F2F4F7] text-[#475467]',
}

export function horaCurta(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function AtendimentoLinha({
  item,
  nomePlano,
  mostrarData,
}: {
  item: VendasAtendimentoBalcao
  nomePlano?: string
  mostrarData?: boolean
}) {
  const comPlano = Boolean(item.planoId) && item.valorTabela > 0
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 min-w-0 truncate text-lg font-semibold text-foreground">{item.nome}</p>
        <span className={cn('shrink-0 rounded-full px-3 py-1 text-sm font-semibold', COR[item.resultado])}>{item.resultadoLabel}</span>
      </div>
      <p className="m-0 text-base text-foreground">
        {item.servico}
        {item.valorTabela > 0 ? <span className="tabular-nums"> · {formatarMoeda(item.valorTabela)}</span> : null}
      </p>
      <p className="m-0 flex flex-wrap gap-x-2 text-sm text-muted-foreground">
        {comPlano ? (
          <span>
            {nomePlano ? `Plano ${nomePlano}` : 'Com plano'}: {formatarMoeda(item.valorComPlano)} (−{item.descontoPercentual} %)
          </span>
        ) : null}
        <time dateTime={item.createdAt}>
          {mostrarData ? `${new Date(item.createdAt).toLocaleDateString('pt-BR')} às ` : ''}
          {horaCurta(item.createdAt)}
        </time>
      </p>
    </li>
  )
}
