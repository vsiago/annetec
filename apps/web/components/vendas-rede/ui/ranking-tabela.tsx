import { cn } from '@/lib/utils'
import { formatarMoeda, formatarPercentual } from './mascaras'
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
        descricao="Assim que houver leads e fechamentos, o ranking aparece aqui."
        className="py-8"
      />
    )
  }
  const mostrarValor = linhas.some(l => typeof l.valor === 'number')
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
            <th scope="col" className="w-10 py-2 pr-2 font-medium">#</th>
            <th scope="col" className="py-2 pr-3 font-medium">{rotuloNome}</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Leads</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Ganhos</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Conversão</th>
            {mostrarValor ? <th scope="col" className="py-2 text-right font-medium">Valor</th> : null}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={l.id} className="border-b border-border/60 last:border-0">
              <td className="py-2.5 pr-2 tabular-nums text-muted-foreground">{i + 1}</td>
              <th scope="row" className="max-w-[220px] py-2.5 pr-3 text-left font-normal">
                <span className="block truncate font-semibold text-foreground">{l.nome}</span>
                {l.detalhe ? <span className="block truncate text-xs text-muted-foreground">{l.detalhe}</span> : null}
              </th>
              <td className="py-2.5 pr-3 text-right tabular-nums">{l.leads.toLocaleString('pt-BR')}</td>
              <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">{l.ganhos.toLocaleString('pt-BR')}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                {l.leads > 0 ? formatarPercentual((l.ganhos / l.leads) * 100) : '—'}
              </td>
              {mostrarValor ? <td className="py-2.5 text-right tabular-nums">{formatarMoeda(l.valor ?? 0)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
