import { StatusPill, type StatusPillTone } from '@/components/admin-platform/ui/status-pill'
import { cn } from '@/lib/utils'
import { EstadoVazio } from './estado-vazio'
import { formatarMoeda, formatarPercentual } from './mascaras'
import type { StatusComissao } from './tipos'

export type LinhaComissao = {
  id: string
  /** Descrição da fatura ou do cliente ("Maria Souza · fatura 11/2026"). */
  descricao?: string
  parcela: number
  tipo?: 'mensalidade' | 'adesao'
  base: number
  percentual: number
  valor: number
  parte: 'vendedor' | 'supervisor' | 'gerente' | 'corretora'
  status: StatusComissao
}

const STATUS: Record<StatusComissao, { rotulo: string; tom: StatusPillTone }> = {
  prevista: { rotulo: 'Prevista', tom: 'info' },
  a_pagar: { rotulo: 'A pagar', tom: 'warning' },
  paga: { rotulo: 'Paga', tom: 'success' },
  cancelada: { rotulo: 'Cancelada', tom: 'neutral' },
  a_descontar: { rotulo: 'A descontar', tom: 'danger' },
}

const PARTE = { vendedor: 'Vendedor', supervisor: 'Supervisor', gerente: 'Gerente', corretora: 'Corretora' } as const

export function rotuloDoStatusComissao(status: StatusComissao): string {
  return STATUS[status].rotulo
}

/**
 * Extrato compacto de comissões: parcela · base · % · valor · parte · status.
 * O rodapé soma só o que ainda conta (exclui canceladas). Status em `StatusPill`
 * (texto + cor). Em tela estreita rola na horizontal, mantendo as colunas.
 */
export function ComissaoExtrato({ linhas, className }: { linhas: LinhaComissao[]; className?: string }) {
  if (linhas.length === 0) {
    return (
      <EstadoVazio
        ilustracao="comissoes"
        titulo="Nenhuma comissão neste período"
        descricao="Quando um cliente seu pagar a primeira fatura, a comissão aparece aqui."
        className="py-8"
      />
    )
  }
  const total = linhas.filter(l => l.status !== 'cancelada').reduce((s, l) => s + l.valor, 0)
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-[#F8F9FB] text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">Referência</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Parcela</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Base</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">%</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Valor</th>
            <th scope="col" className="py-2 pr-3 font-medium">Parte</th>
            <th scope="col" className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l.id} className={cn('border-b border-border/60', l.status === 'cancelada' && 'text-muted-foreground')}>
              <td className="max-w-[220px] truncate py-2.5 pr-3">
                {l.descricao ?? (l.tipo === 'adesao' ? 'Taxa de adesão' : 'Mensalidade')}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{l.tipo === 'adesao' ? 'Adesão' : `${l.parcela}ª`}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatarMoeda(l.base)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatarPercentual(l.percentual, 2)}</td>
              <td className={cn('py-2.5 pr-3 text-right font-semibold tabular-nums', l.status === 'cancelada' && 'line-through')}>
                {formatarMoeda(l.valor)}
              </td>
              <td className="py-2.5 pr-3">{PARTE[l.parte]}</td>
              <td className="py-2.5">
                <StatusPill tone={STATUS[l.status].tom}>{STATUS[l.status].rotulo}</StatusPill>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={4} className="py-3 pr-3 text-right text-xs font-medium text-muted-foreground">
              Total (sem canceladas)
            </th>
            <td className="py-3 pr-3 text-right font-bold tabular-nums">{formatarMoeda(total)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
