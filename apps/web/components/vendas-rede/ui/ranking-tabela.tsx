import { initialsOf } from '@/components/admin-platform/ui/entity-avatar'
import { cn } from '@/lib/utils'
import { formatarPercentual } from './mascaras'
import { ValorMoeda } from './valor-moeda'
import { EstadoVazio } from './estado-vazio'

export type LinhaRanking = {
  id: string
  nome: string
  /** Segunda linha discreta: equipe, unidade, corretora. */
  detalhe?: string
  leads: number
  ganhos: number
  /** Valor fechado no período (R$). Opcional. */
  valor?: number
}

/**
 * Ranking em tabela compacta (nas áreas de resultado, onde tabela é adequada).
 * Ordene antes de passar (`linhas` aparece na ordem recebida). Mostra a posição
 * como número simples, sem medalhas: é leitura de desempenho, não competição.
 * Conversão = ganhos ÷ leads. Em telas estreitas, rola na horizontal.
 */
export function RankingTabela({
  linhas,
  rotuloNome = 'Agente',
  className,
}: {
  linhas: LinhaRanking[]
  rotuloNome?: string
  className?: string
}) {
  if (linhas.length === 0) {
    return (
      <EstadoVazio
        ilustracao="resultados"
        titulo="Sem resultados no período"
        descricao="Assim que houver leads e vendas, o ranking aparece aqui."
        className="py-8"
      />
    )
  }
  const mostrarValor = linhas.some(l => typeof l.valor === 'number')
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[460px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-[#F8F9FB] text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="w-12 rounded-tl-lg py-2.5 pl-3 pr-2 font-semibold">#</th>
            <th scope="col" className="py-2.5 pr-3 font-semibold">{rotuloNome}</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-semibold">Leads</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-semibold">Vendas</th>
            <th scope="col" className="py-2.5 pr-3 text-right font-semibold">Conversão</th>
            {mostrarValor ? <th scope="col" className="rounded-tr-lg py-2.5 pr-3 text-right font-semibold">Valor</th> : null}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={l.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-[#F8F9FB]">
              <td className="py-3 pl-3 pr-2">
                <span
                  className={cn(
                    'inline-flex size-6 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                    i === 0 ? 'bg-[var(--vr-accent,#1E2A4A)] text-[var(--vr-accent-fg,#FFFFFF)]' : 'bg-[#F2F4F7] text-[#344054]',
                  )}
                >
                  {i + 1}
                </span>
              </td>
              <th scope="row" className="max-w-[240px] py-3 pr-3 text-left font-normal">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#E5EDF5] text-[11px] font-bold text-[#1E2A4A]">
                    {initialsOf(l.nome)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-foreground" title={l.nome}>{l.nome}</span>
                    {l.detalhe ? <span className="block truncate text-xs text-muted-foreground">{l.detalhe}</span> : null}
                  </span>
                </span>
              </th>
              <td className="py-3 pr-3 text-right tabular-nums">{l.leads.toLocaleString('pt-BR')}</td>
              <td className="py-3 pr-3 text-right font-semibold tabular-nums">{l.ganhos.toLocaleString('pt-BR')}</td>
              <td className="py-3 pr-3 text-right tabular-nums text-muted-foreground">
                {l.leads > 0 ? formatarPercentual((l.ganhos / l.leads) * 100) : '—'}
              </td>
              {mostrarValor ? <td className="py-3 pr-3 text-right font-semibold"><ValorMoeda valor={l.valor ?? 0} compacto="nunca" /></td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
