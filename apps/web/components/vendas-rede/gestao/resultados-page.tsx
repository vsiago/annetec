'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BarChart3, CircleDollarSign, Funnel, Megaphone, Trophy, TrendingUp, Contact, FileText, Handshake, Inbox } from 'lucide-react'
import { ETAPA_LEAD_LABELS, type PapelComercial, type VendasEu, type VendasPainelResultados } from '@annetec/contracts'
import { LoadError, RefreshButton, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { resultadosAction } from '@/lib/actions/vendas-rede-gestao-api'
import { AcaoPrincipal } from '../ui/acao-principal'
import { EstadoVazio } from '../ui/estado-vazio'
import { FunilDegraus } from '../ui/funil-degraus'
import { GraficoLeadsGanhos } from '../ui/grafico-leads-ganhos'
import { GraficoOrigens } from '../ui/grafico-origens'
import { KpiGrid } from '../ui/kpi-grid'
import { formatarPercentual } from '../ui/mascaras'
import { RankingTabela } from '../ui/ranking-tabela'
import { ValorMoeda } from '../ui/valor-moeda'
import { CabecalhoTela, PERIODOS, PortaoDePapel, Segmentado, useCaminhoTela } from './comum'
import type { EscopoRede } from './tipos'

/**
 * Resultados (BI): seletor de período e de agrupamento conforme o papel, KPIs,
 * leads x ganhos por dia, funil, ranking, origem dos leads e a comissão do
 * período. Tudo vem de `GET /painel/resultados`, já filtrado pela visibilidade
 * do papel.
 */

type Agrupamento = 'agente' | 'equipe' | 'unidade' | 'corretora'

const AGRUPAMENTOS: Record<Agrupamento, { label: string; coluna: string }> = {
  agente: { label: 'Por agente', coluna: 'Agente' },
  equipe: { label: 'Por equipe', coluna: 'Equipe' },
  unidade: { label: 'Por unidade', coluna: 'Unidade' },
  corretora: { label: 'Por corretora', coluna: 'Corretora' },
}

function agrupamentosDoPapel(papel: PapelComercial): Agrupamento[] {
  if (papel === 'master') return ['agente', 'equipe', 'unidade', 'corretora']
  if (papel === 'gerente') return ['agente', 'equipe', 'unidade']
  return ['agente', 'equipe']
}

const ETAPAS_FUNIL = ['novo', 'em_contato', 'proposta', 'negociacao', 'ganho'] as const
const ROTULO_FUNIL: Record<(typeof ETAPAS_FUNIL)[number], string> = {
  novo: 'Novos',
  em_contato: 'Em contato',
  proposta: 'Proposta',
  negociacao: 'Negociação',
  ganho: 'Vendas',
}

function diaCurto(dia: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(dia)
  return m ? `${m[2]}/${m[1]}` : dia
}

export function ResultadosPage({ escopo }: { escopo: EscopoRede }) {
  return <PortaoDePapel escopo={escopo} tela="resultados">{eu => <ResultadosConteudo escopo={escopo} eu={eu} />}</PortaoDePapel>
}

export function ResultadosConteudo({ escopo, eu }: { escopo: EscopoRede; eu: VendasEu }) {
  const chave = escopo.kind === 'platform' ? 'platform' : escopo.slug
  const caminhoComissoes = useCaminhoTela(escopo, 'comissoes')
  const opcoesAgrupar = useMemo(() => agrupamentosDoPapel(eu.papel), [eu.papel])
  const [periodo, setPeriodo] = useState<'30d' | 'mes' | 'trimestre'>('30d')
  const [agrupar, setAgrupar] = useState<Agrupamento>('agente')
  const painel = useConsoleData<VendasPainelResultados>(() => resultadosAction(escopo, { periodo, agrupar }), [chave, periodo, agrupar])
  const d = painel.data

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoTela
        icone={BarChart3}
        titulo="Resultados"
        descricao="Como as vendas estão indo: leads, contatos, vendas fechadas e comissões no período."
        acao={
          <>
            <Segmentado rotulo="Período" valor={periodo} opcoes={PERIODOS} aoMudar={setPeriodo} />
            {opcoesAgrupar.length > 1 ? (
              <Segmentado
                rotulo="Agrupar ranking"
                valor={agrupar}
                opcoes={opcoesAgrupar.map(v => ({ value: v, label: AGRUPAMENTOS[v].label }))}
                aoMudar={setAgrupar}
              />
            ) : null}
            <RefreshButton loading={painel.loading} onClick={() => void painel.reload({ silent: true })} />
          </>
        }
      />

      {painel.loading && !d ? (
        <TableSkeleton rows={6} />
      ) : !d ? (
        <LoadError message={painel.error ?? 'Não foi possível carregar os resultados.'} onRetry={() => void painel.reload()} />
      ) : d.kpis.leads === 0 && d.kpis.ganhos === 0 && d.ranking.length === 0 ? (
        <EstadoVazio
          ilustracao="resultados"
          moldura
          titulo="Ainda não há resultados neste período"
          descricao="Quando chegarem leads e as primeiras vendas forem fechadas, os números e os gráficos aparecem aqui. Tente também um período maior."
          acao={
            periodo !== 'trimestre' ? (
              <AcaoPrincipal variante="secundaria" onClick={() => setPeriodo('trimestre')}>
                Ver o trimestre
              </AcaoPrincipal>
            ) : undefined
          }
        />
      ) : (
        <>
          <KpiGrid
            colunas={4}
            className="grid-cols-2 gap-3 sm:gap-4"
            itens={[
              { rotulo: 'Leads', valor: d.kpis.leads.toLocaleString('pt-BR'), icone: Inbox },
              { rotulo: 'Contatos', valor: d.kpis.contatos.toLocaleString('pt-BR'), icone: Contact, tom: 'blue' },
              { rotulo: 'Propostas', valor: d.kpis.propostas.toLocaleString('pt-BR'), icone: FileText, tom: 'violet' },
              {
                rotulo: 'Vendas',
                valor: d.kpis.ganhos.toLocaleString('pt-BR'),
                icone: Handshake,
                tom: 'green',
                dica: `Conversão de ${formatarPercentual(d.kpis.taxaConversao, 1)}`,
              },
            ]}
          />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <SectionCard title="Leads e vendas por dia" description="Entrada de leads e vendas fechadas." icon={TrendingUp} className="xl:col-span-2">
              <GraficoLeadsGanhos dados={d.serieDiaria.map(p => ({ dia: diaCurto(p.dia), leads: p.leads, ganhos: p.ganhos }))} />
            </SectionCard>
            <SectionCard title="Comissão do período" description="Do que foi vendido no período." icon={CircleDollarSign} iconTone="green">
              <dl className="@container m-0 flex flex-col divide-y divide-border/60">
                <LinhaValor rotulo="Valor vendido" valor={d.kpis.valorGanho} />
                <LinhaValor rotulo="Comissão prevista" valor={d.kpis.comissaoPrevista} />
                <LinhaValor rotulo="Comissão a pagar" valor={d.kpis.comissaoAPagar} destaque />
                <LinhaValor rotulo="Comissão paga" valor={d.kpis.comissaoPaga} />
              </dl>
              <Link
                href={caminhoComissoes}
                className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-semibold text-secondary hover:underline focus-visible:ring-2 focus-visible:ring-secondary/40"
              >
                Ver extrato de comissões
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </SectionCard>
          </div>

          <SectionCard title="Funil" description="Onde os leads estão agora, da entrada até a venda." icon={Funnel} iconTone="violet">
            <FunilDegraus
              degraus={ETAPAS_FUNIL.map(etapa => ({
                rotulo: ROTULO_FUNIL[etapa],
                valor: d.funil.find(f => f.etapa === etapa)?.total ?? 0,
              }))}
            />
            {(d.funil.find(f => f.etapa === 'perdido')?.total ?? 0) > 0 ? (
              <p className="m-0 mt-3 text-sm text-muted-foreground">
                {ETAPA_LEAD_LABELS.perdido}s no período: {(d.funil.find(f => f.etapa === 'perdido')?.total ?? 0).toLocaleString('pt-BR')}.
              </p>
            ) : null}
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <SectionCard title="Ranking" description={AGRUPAMENTOS[d.agrupar].label} icon={Trophy} iconTone="amber" className="xl:col-span-3">
              <RankingTabela
                rotuloNome={AGRUPAMENTOS[d.agrupar].coluna}
                linhas={d.ranking.map(r => ({ id: r.chave, nome: r.nome, leads: r.leads, ganhos: r.ganhos, valor: r.valor }))}
              />
            </SectionCard>
            <SectionCard title="De onde vêm os leads" description="Volume por origem." icon={Megaphone} iconTone="blue" className="xl:col-span-2">
              <GraficoOrigens dados={d.origens} />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}

function LinhaValor({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`flex min-w-0 items-baseline justify-between gap-3 ${destaque ? '-mx-3 rounded-xl bg-[#FEF3DC]/60 px-3 py-3' : 'py-2.5'}`}>
      <dt className={`min-w-0 truncate text-sm ${destaque ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{rotulo}</dt>
      <dd className={`m-0 shrink-0 ${destaque ? 'text-lg font-bold text-[#B54708]' : 'text-sm font-semibold'}`}>
        <ValorMoeda valor={valor} limite="sm" />
      </dd>
    </div>
  )
}
