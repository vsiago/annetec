'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleSlash, Clock3, MessageCircle, Search } from 'lucide-react'
import { initialsOf } from '@/components/admin-platform/ui/entity-avatar'
import { ErrorState } from '@/components/admin-platform/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getCarteiraAction } from '@/lib/actions/vendas-rede-api'
import { chaveDoEscopo } from '@/lib/vendas-rede/escopo'
import type { CarteiraResposta, ItemCarteira, SituacaoCarteira } from '@/lib/vendas-rede/tipos'
import { cn } from '@/lib/utils'
import { useVendasRede } from '../provider'
import { Conteudo } from '../shell/base'
import { AcaoPrincipal } from '../ui/acao-principal'
import { EstadoVazio } from '../ui/estado-vazio'
import { formatarMoeda, primeiroNome } from '../ui/mascaras'
import { CARD_SHADOW, FOCUS_RING } from '../ui/tokens'
import { montarWaLink } from '../ui/wa-link'
import { LeadDetalhe } from '../lead/lead-detalhe'

const SITUACOES: ReadonlyArray<{ id: SituacaoCarteira; rotulo: string; plural: string; icone: typeof CheckCircle2; classe: string }> = [
  { id: 'ativa', rotulo: 'Ativa', plural: 'Ativas', icone: CheckCircle2, classe: 'bg-[#ECFDF3] text-[#067647]' },
  { id: 'atrasada', rotulo: 'Atrasada', plural: 'Atrasadas', icone: AlertTriangle, classe: 'bg-[#FEF3DC] text-[#B54708]' },
  { id: 'pendente', rotulo: 'Pendente', plural: 'Pendentes', icone: Clock3, classe: 'bg-[#EEF4FF] text-[#1E2A4A]' },
  { id: 'cancelada', rotulo: 'Cancelada', plural: 'Canceladas', icone: CircleSlash, classe: 'bg-[#F2F4F7] text-[#475467]' },
]

const META = Object.fromEntries(SITUACOES.map(s => [s.id, s])) as Record<SituacaoCarteira, (typeof SITUACOES)[number]>

function frase(totais: CarteiraResposta['totais']): string {
  const total = totais.ativa + totais.atrasada + totais.pendente + totais.cancelada
  if (total === 0) return 'Seus clientes aparecem aqui quando uma venda é fechada.'
  const partes: string[] = []
  if (totais.ativa) partes.push(`${totais.ativa} ${totais.ativa === 1 ? 'ativo' : 'ativos'}`)
  if (totais.atrasada) partes.push(`${totais.atrasada} ${totais.atrasada === 1 ? 'atrasado' : 'atrasados'}`)
  if (totais.pendente) partes.push(`${totais.pendente} ${totais.pendente === 1 ? 'pendente' : 'pendentes'}`)
  if (totais.cancelada) partes.push(`${totais.cancelada} ${totais.cancelada === 1 ? 'cancelado' : 'cancelados'}`)
  return `Você tem ${total} ${total === 1 ? 'cliente' : 'clientes'}: ${partes.join(', ')}.`
}

/**
 * Carteira: clientes que já fecharam, com o estado da assinatura em uma frase
 * ("Ativa · vence em 12 dias"), chips por situação com contagem e busca.
 * Cartões, não tabela. Vale para os dois escopos.
 */
export function CarteiraPage() {
  const { escopo } = useVendasRede()
  const chave = chaveDoEscopo(escopo)
  const [dados, setDados] = useState<CarteiraResposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [situacao, setSituacao] = useState<SituacaoCarteira | ''>('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [aberto, setAberto] = useState<string | null>(null)
  const sequencia = useRef(0)

  useEffect(() => {
    const t = window.setTimeout(() => setBuscaAplicada(busca.trim()), 300)
    return () => window.clearTimeout(t)
  }, [busca])

  const carregar = useCallback(async () => {
    const id = ++sequencia.current
    setCarregando(true)
    const r = await getCarteiraAction(escopo, { situacao: situacao || undefined, q: buscaAplicada || undefined, perPage: 50 })
    if (id !== sequencia.current) return
    if (r.success) {
      setDados(r.data)
      setErro(null)
    } else setErro(r.error)
    setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, situacao, buscaAplicada])

  useEffect(() => {
    void carregar()
  }, [carregar])

  const totais = dados?.totais
  const totalGeral = totais ? totais.ativa + totais.atrasada + totais.pendente + totais.cancelada : 0

  return (
    <Conteudo>
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-2xl font-bold leading-tight tracking-tight text-foreground">Carteira</h1>
        <p className="m-0 text-base text-[#475467]" aria-live="polite">
          {totais ? frase(totais) : 'Carregando a sua carteira…'}
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <div role="group" aria-label="Filtrar por situação" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
          <Chip ativo={situacao === ''} aoClicar={() => setSituacao('')} rotulo="Todos" contador={totalGeral} />
          {SITUACOES.map(s => (
            <Chip key={s.id} ativo={situacao === s.id} aoClicar={() => setSituacao(s.id)} rotulo={s.plural} contador={totais?.[s.id] ?? 0} />
          ))}
        </div>

        <div className="relative flex flex-col gap-1">
          <label htmlFor="vr-carteira-busca" className="sr-only">
            Buscar cliente
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="vr-carteira-busca"
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone ou documento"
            className="min-h-11 rounded-xl bg-white pl-9"
          />
        </div>

        {erro && !dados ? (
          <ErrorState onRetry={() => void carregar()} />
        ) : !dados ? (
          <div role="status" aria-label="Carregando" className="grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        ) : dados.items.length === 0 ? (
          buscaAplicada || situacao ? (
            <EstadoVazio
              moldura
              ilustracao="busca"
              titulo="Nenhum cliente encontrado"
              descricao="Tente outra busca ou veja todas as situações."
              acao={
                <AcaoPrincipal
                  variante="secundaria"
                  onClick={() => {
                    setBusca('')
                    setSituacao('')
                  }}
                >
                  Limpar filtros
                </AcaoPrincipal>
              }
            />
          ) : (
            <EstadoVazio
              moldura
              ilustracao="carteira"
              titulo="Sua carteira ainda está vazia"
              descricao="Quando uma venda é fechada e o primeiro pagamento cai, o cliente aparece aqui com o estado da assinatura."
            />
          )
        ) : (
          <ul className={cn('m-0 grid list-none gap-3 p-0 lg:grid-cols-2', carregando && 'opacity-60 transition-opacity')} aria-busy={carregando}>
            {dados.items.map(item => (
              <li key={item.lead.id} className="min-w-0">
                <CartaoCliente item={item} aoAbrir={() => setAberto(item.lead.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <LeadDetalhe leadId={aberto} aoFechar={() => setAberto(null)} aoAlterar={() => void carregar()} />
    </Conteudo>
  )
}

function Chip({ ativo, aoClicar, rotulo, contador }: { ativo: boolean; aoClicar: () => void; rotulo: string; contador: number }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
        ativo ? 'border-[#1E2A4A] bg-[#1E2A4A] text-white' : 'border-border bg-white text-[#344054] hover:bg-[#F2F4F7]',
        FOCUS_RING,
      )}
    >
      {rotulo}
      <span className={cn('inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums', ativo ? 'bg-white/20' : 'bg-[#F2F4F7]')}>{contador}</span>
    </button>
  )
}

function CartaoCliente({ item, aoAbrir }: { item: ItemCarteira; aoAbrir: () => void }) {
  const meta = META[item.situacao]
  const Icone = meta.icone
  const plano = item.assinatura?.planoNome ?? item.clube?.planoNome ?? item.lead.interessePlanoNome
  const nomeClube = item.clube?.nome
  const wa =
    item.situacao === 'atrasada'
      ? montarWaLink(
          item.lead.telefone,
          `Olá, ${primeiroNome(item.lead.nome)}! Vi que a mensalidade${plano ? ` do plano ${plano}` : ''} está em atraso. Posso ajudar a regularizar?`,
        )
      : null
  return (
    <article aria-label={`Cliente ${item.lead.nome}`} className={cn('flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4', CARD_SHADOW)}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#E5EDF5] text-[13px] font-bold text-[#1E2A4A]">
          {initialsOf(item.lead.nome)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <button type="button" onClick={aoAbrir} className={cn('min-w-0 truncate rounded text-left text-base font-semibold text-foreground hover:underline', FOCUS_RING)}>
            {item.lead.nome}
          </button>
          <p className="m-0 truncate text-xs text-muted-foreground">
            {[nomeClube, plano].filter(Boolean).join(' · ') || 'Plano não informado'}
          </p>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', meta.classe)}>
          <Icone className="size-3.5" aria-hidden="true" />
          {meta.rotulo}
        </span>
      </div>
      <p className="m-0 text-sm font-medium text-foreground">{item.resumo}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-xs text-muted-foreground">
          {item.assinatura ? `${formatarMoeda(item.assinatura.valorMensal)} por mês` : item.clube ? 'Contratação do clube' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {wa ? (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className={cn('inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--vr-accent,#1E2A4A)] px-4 text-sm font-semibold text-[var(--vr-accent-fg,#FFFFFF)] hover:brightness-110', FOCUS_RING)}
            >
              <MessageCircle className="size-4" aria-hidden="true" /> Lembrar no WhatsApp
            </a>
          ) : null}
          <AcaoPrincipal variante="secundaria" onClick={aoAbrir}>
            Ver lead
          </AcaoPrincipal>
        </div>
      </div>
    </article>
  )
}
