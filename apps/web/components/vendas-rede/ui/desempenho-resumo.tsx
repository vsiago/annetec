import { CARD_SURFACE } from '@/components/admin-platform/ui/tone'
import { cn } from '@/lib/utils'
import { formatarPercentual } from './mascaras'
import { ValorMoeda } from './valor-moeda'

/**
 * Bloco "Desempenho" de uma pessoa ou equipe, em duas partes que respondem à
 * largura do CONTÊINER (não da janela), então servem na folha lateral, no painel
 * e no celular:
 *
 * 1. `FaixaContagens`: o funil em números (Leads, Contatos, Propostas, Ganhos). 4
 *    colunas quando há espaço (>= 24rem), 2 quando não. Rótulos de uma linha.
 * 2. `CartaoDinheiro`: o dinheiro em linhas largas. A comissão a pagar em destaque;
 *    o resto como linhas secundárias. Valor à direita, sem quebrar nem vazar.
 */

export type ContagensDesempenho = {
  leadsRecebidos: number
  contatos: number
  propostas: number
  ganhos: number
  taxaConversao: number
}

export type DinheiroDesempenho = {
  valorGanho: number
  comissaoAPagar: number
  comissaoPrevista: number
  comissaoPaga: number
}

const inteiro = (n: number) => n.toLocaleString('pt-BR')

function Contagem({ rotulo, valor, apoio, destaque }: { rotulo: string; valor: number; apoio?: string; destaque?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-[#F8F9FB] px-3 py-2.5">
      <dt className="truncate text-xs font-medium text-muted-foreground">{rotulo}</dt>
      <dd className="m-0 flex min-w-0 flex-col">
        <span className={cn('truncate text-2xl font-bold leading-tight tracking-tight tabular-nums', destaque ? 'text-[#067647]' : 'text-foreground')}>
          {inteiro(valor)}
        </span>
        {apoio ? <span className="truncate text-xs tabular-nums text-muted-foreground">{apoio}</span> : null}
      </dd>
    </div>
  )
}

export function FaixaContagens({ k, className }: { k: ContagensDesempenho; className?: string }) {
  return (
    <div className={cn('@container min-w-0', className)}>
      <dl className="m-0 grid grid-cols-2 gap-2 @sm:grid-cols-4">
        <Contagem rotulo="Leads" valor={k.leadsRecebidos} />
        <Contagem rotulo="Contatos" valor={k.contatos} />
        <Contagem rotulo="Propostas" valor={k.propostas} />
        <Contagem rotulo="Vendas" valor={k.ganhos} apoio={`Conversão ${formatarPercentual(k.taxaConversao, 1)}`} destaque />
      </dl>
    </div>
  )
}

function LinhaDinheiro({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={cn('flex min-w-0 items-baseline justify-between gap-3', destaque ? 'py-3' : 'py-2')}>
      <dt className={cn('min-w-0 truncate', destaque ? 'text-sm font-semibold text-foreground' : 'text-[13px] text-muted-foreground')}>{rotulo}</dt>
      <dd className="m-0 shrink-0">
        <ValorMoeda
          valor={valor}
          limite="sm"
          className={cn('block text-right', destaque ? 'text-xl font-bold text-[#B54708]' : 'text-sm font-semibold text-foreground')}
        />
      </dd>
    </div>
  )
}

export function CartaoDinheiro({ k, className }: { k: DinheiroDesempenho; className?: string }) {
  return (
    <div className={cn('@container min-w-0', className)}>
      <dl className={cn('m-0 flex flex-col divide-y divide-border/60 px-4 py-1', CARD_SURFACE)}>
        <LinhaDinheiro rotulo="Valor vendido" valor={k.valorGanho} />
        <LinhaDinheiro rotulo="Comissão a pagar" valor={k.comissaoAPagar} destaque />
        <LinhaDinheiro rotulo="Comissão prevista" valor={k.comissaoPrevista} />
        <LinhaDinheiro rotulo="Comissão paga" valor={k.comissaoPaga} />
      </dl>
    </div>
  )
}
