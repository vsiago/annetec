'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Plus, Search, X } from 'lucide-react'
import {
  ESTACOES_LEAD,
  ETAPAS_LEAD,
  ETAPA_LEAD_LABELS,
  ORIGENS_LEAD,
  ORIGEM_LEAD_LABELS,
  type EstacaoLead,
  type EtapaLead,
  type OrigemLead,
  type VendasAgente,
  type VendasLead,
} from '@annetec/contracts'
import { ErrorState } from '@/components/admin-platform/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getContadoresLeadsAction, listarAgentesAction, listarLeadsAction } from '@/lib/actions/vendas-rede-api'
import { leadParaCard, veEquipe } from '@/lib/vendas-rede/adaptadores'
import { basePath, chaveDoEscopo } from '@/lib/vendas-rede/escopo'
import type { ContadoresLeads } from '@/lib/vendas-rede/tipos'
import { cn } from '@/lib/utils'
import { useVendasRede } from '../provider'
import { Conteudo } from '../shell/base'
import { AcaoPrincipal } from '../ui/acao-principal'
import { EstacoesTabs } from '../ui/estacoes-tabs'
import { EstadoVazio, type IlustracaoVazio } from '../ui/estado-vazio'
import { LeadCard, type LeadCardMenuItem } from '../ui/lead-card'
import { FOCUS_RING } from '../ui/tokens'
import { acaoPrincipalDoLead, atenderLead, devolverAoPool, leadNoPool } from '../lead/acoes'
import { SelectFiltro } from '../lead/campos'
import { LeadDetalhe, type AbaLead, type DialogoLead } from '../lead/lead-detalhe'
import { NovoLeadDialog } from '../lead/novo-lead'

const POR_PAGINA = 20

interface Aberto {
  id: string
  aba?: AbaLead
  dialogo?: DialogoLead
}

const ESTACOES_VALIDAS = new Set<string>(ESTACOES_LEAD)

/** Textos dos estados vazios, que dizem o que aconteceu e o que fazer. */
const VAZIOS: Record<EstacaoLead, { ilustracao: IlustracaoVazio; titulo: string; descricao: string }> = {
  pool: {
    ilustracao: 'pool',
    titulo: 'Nenhum lead no pool agora',
    descricao: 'Quando alguém pedir contato no site, ele aparece aqui e você recebe um aviso para atender.',
  },
  novos: {
    ilustracao: 'funil',
    titulo: 'Você não tem leads novos',
    descricao: 'Pegue um lead no Pool ou cadastre o seu. Quem ainda não recebeu o primeiro contato fica aqui.',
  },
  andamento: {
    ilustracao: 'funil',
    titulo: 'Nada em andamento',
    descricao: 'Depois do primeiro contato, o lead passa a aparecer aqui até virar venda ou ser perdido.',
  },
  fechados: {
    ilustracao: 'carteira',
    titulo: 'Ainda não há leads fechados',
    descricao: 'Vendas ganhas e leads perdidos ficam guardados aqui, com todo o histórico.',
  },
}

/**
 * Funil: estações (Pool · Novos · Em andamento · Fechados) com contadores,
 * cartões com UMA ação principal por lead, filtros e detalhe em folha.
 * `leadIdInicial` abre o detalhe de cara (rota `/funil/[id]`, links de
 * notificação). Funciona nos dois escopos.
 */
export function FunilPage({ leadIdInicial }: { leadIdInicial?: string }) {
  const { escopo, eu, recarregar } = useVendasRede()
  const raiz = basePath(escopo)
  const chave = chaveDoEscopo(escopo)
  const equipe = veEquipe(eu.papel)
  const params = useSearchParams()
  const estacaoDaUrl = params.get('estacao')

  const [estacao, setEstacao] = useState<EstacaoLead | null>(
    estacaoDaUrl && ESTACOES_VALIDAS.has(estacaoDaUrl) ? (estacaoDaUrl as EstacaoLead) : null,
  )
  const [contadores, setContadores] = useState<ContadoresLeads | null>(null)
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [origem, setOrigem] = useState<OrigemLead | ''>('')
  const [etapa, setEtapa] = useState<EtapaLead | ''>('')
  const [agente, setAgente] = useState('')
  const [agentes, setAgentes] = useState<VendasAgente[]>([])

  const [itens, setItens] = useState<VendasLead[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<Aberto | null>(leadIdInicial ? { id: leadIdInicial } : null)
  const [novoAberto, setNovoAberto] = useState(false)
  const [atendendo, setAtendendo] = useState<string | null>(null)
  const sequencia = useRef(0)

  // Contadores das estações.
  const carregarContadores = useCallback(async () => {
    const r = await getContadoresLeadsAction(escopo)
    if (r.success) setContadores(r.data)
    else setEstacao(atual => atual ?? 'novos')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  useEffect(() => {
    void carregarContadores()
  }, [carregarContadores])

  // Estação padrão: Novos; se só o Pool tem coisa, começa nele.
  useEffect(() => {
    if (estacao || !contadores) return
    setEstacao(contadores.novos === 0 && contadores.pool > 0 && contadores.andamento === 0 ? 'pool' : contadores.novos === 0 && contadores.andamento > 0 ? 'andamento' : 'novos')
  }, [estacao, contadores])

  // Agentes para o filtro (só quem enxerga equipe).
  useEffect(() => {
    if (!equipe) return
    void listarAgentesAction(escopo, { perPage: 100 }).then(r => {
      if (r.success) setAgentes(r.data.filter(a => a.papel !== 'balcao'))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipe, chave])

  // Busca com atraso de 300 ms.
  useEffect(() => {
    const t = window.setTimeout(() => setBuscaAplicada(busca.trim()), 300)
    return () => window.clearTimeout(t)
  }, [busca])

  const filtrosAtivos = Boolean(buscaAplicada || origem || etapa || agente)

  const carregar = useCallback(
    async (alvo: number, anexar: boolean) => {
      if (!estacao) return
      const id = ++sequencia.current
      if (anexar) setCarregandoMais(true)
      else setCarregando(true)
      const r = await listarLeadsAction(escopo, {
        estacao,
        etapa: etapa || undefined,
        agente: agente || undefined,
        origem: origem || undefined,
        busca: buscaAplicada || undefined,
        page: alvo,
        perPage: POR_PAGINA,
      })
      if (id !== sequencia.current) return
      if (r.success) {
        setItens(atual => (anexar ? [...atual, ...r.data.items.filter(n => !atual.some(a => a.id === n.id))] : r.data.items))
        setTotal(r.data.meta.total)
        setPagina(alvo)
        setErro(null)
      } else {
        setErro(r.error)
      }
      setCarregando(false)
      setCarregandoMais(false)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chave, estacao, etapa, agente, origem, buscaAplicada],
  )

  useEffect(() => {
    setItens([])
    void carregar(1, false)
  }, [carregar])

  const atualizar = useCallback(() => {
    void carregar(1, false)
    void carregarContadores()
    void recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregar, carregarContadores, recarregar])

  // Mantém a URL em sincronia com o lead aberto, sem recarregar a página.
  const sincronizarUrl = useCallback(
    (id: string | null) => {
      const query = estacao ? `?estacao=${estacao}` : ''
      const alvo = id ? `${raiz}/funil/${encodeURIComponent(id)}` : `${raiz}/funil${query}`
      if (typeof window !== 'undefined' && window.location.pathname + window.location.search !== alvo) {
        window.history.replaceState(window.history.state, '', alvo)
      }
    },
    [estacao, raiz],
  )

  const abrir = useCallback(
    (id: string, extra: Omit<Aberto, 'id'> = {}) => {
      setAberto({ id, ...extra })
      sincronizarUrl(id)
    },
    [sincronizarUrl],
  )

  const fechar = useCallback(() => {
    setAberto(null)
    sincronizarUrl(null)
  }, [sincronizarUrl])

  async function aoAcaoPrincipal(lead: VendasLead) {
    const acao = acaoPrincipalDoLead(lead, escopo)
    if (acao.id === 'atender') {
      setAtendendo(lead.id)
      const atualizado = await atenderLead(escopo, lead)
      setAtendendo(null)
      atualizar()
      if (atualizado) abrir(lead.id)
      return
    }
    if (acao.id === 'contato') abrir(lead.id, { dialogo: 'contato' })
    else if (acao.id === 'proposta' || acao.id === 'fechar') abrir(lead.id, { aba: 'venda' })
    else abrir(lead.id)
  }

  function menuDoLead(lead: VendasLead): LeadCardMenuItem[] {
    const itensMenu: LeadCardMenuItem[] = [{ rotulo: 'Abrir detalhes', onSelecionar: () => abrir(lead.id) }]
    if (!eu.podeEscrever || leadNoPool(lead)) return itensMenu
    const encerrado = lead.etapa === 'ganho' || lead.etapa === 'perdido'
    if (!encerrado) {
      itensMenu.push({ rotulo: 'Registrar contato', onSelecionar: () => abrir(lead.id, { dialogo: 'contato' }) })
      itensMenu.push({ rotulo: 'Marcar próximo passo', onSelecionar: () => abrir(lead.id, { dialogo: 'passo' }) })
    }
    itensMenu.push({ rotulo: 'Mudar etapa', onSelecionar: () => abrir(lead.id, { dialogo: 'etapa' }) })
    if (equipe) itensMenu.push({ rotulo: 'Reatribuir', onSelecionar: () => abrir(lead.id, { dialogo: 'reatribuir' }) })
    if (!encerrado && lead.agenteId && (equipe || lead.agenteId === eu.agente?.id)) {
      itensMenu.push({
        rotulo: 'Devolver ao pool',
        separador: true,
        perigo: true,
        onSelecionar: () => void devolverAoPool(escopo, lead, atualizar),
      })
    }
    return itensMenu
  }

  const estacoes = useMemo(
    () =>
      [
        { id: 'pool', rotulo: 'Pool', contador: contadores?.pool, destaque: (contadores?.pool ?? 0) > 0 },
        { id: 'novos', rotulo: 'Novos', contador: contadores?.novos },
        { id: 'andamento', rotulo: 'Em andamento', contador: contadores?.andamento },
        { id: 'fechados', rotulo: 'Fechados', contador: contadores?.fechados },
      ] as const,
    [contadores],
  )

  function limparFiltros() {
    setBusca('')
    setBuscaAplicada('')
    setOrigem('')
    setEtapa('')
    setAgente('')
  }

  function trocarEstacao(id: string) {
    setEstacao(id as EstacaoLead)
    setItens([])
    if (!aberto) window.history.replaceState(window.history.state, '', `${raiz}/funil?estacao=${id}`)
  }

  const temMais = itens.length < total

  return (
    <Conteudo largo>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 text-2xl font-bold leading-tight tracking-tight text-foreground">Funil</h1>
          <p className="m-0 text-sm text-muted-foreground">
            {equipe ? 'Os leads da sua rede, do pool ao fechamento.' : 'Seus leads, do primeiro contato ao fechamento.'}
          </p>
        </div>
        {eu.podeEscrever ? (
          <AcaoPrincipal icone={<Plus />} onClick={() => setNovoAberto(true)} className="hidden sm:inline-flex">
            Novo lead
          </AcaoPrincipal>
        ) : null}
      </header>

      <div className="flex flex-col gap-4">
        <EstacoesTabs estacoes={estacoes as unknown as Array<{ id: string; rotulo: string; contador?: number; destaque?: boolean }>} valor={estacao ?? 'novos'} aoMudar={trocarEstacao} />

        <form
          role="search"
          aria-label="Filtrar leads"
          onSubmit={e => e.preventDefault()}
          className={cn('grid gap-3 sm:grid-cols-2', equipe ? 'lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]' : 'lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]')}
        >
          <div className="relative flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
            <label htmlFor="vr-funil-busca" className="text-xs font-medium text-muted-foreground">
              Buscar
            </label>
            <Search className="pointer-events-none absolute bottom-3.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="vr-funil-busca"
              type="search"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Nome, telefone ou documento"
              className="min-h-11 rounded-xl bg-white pl-9"
            />
          </div>
          <SelectFiltro rotulo="Origem" valor={origem} aoMudar={setOrigem} opcoes={ORIGENS_LEAD.map(o => ({ id: o, rotulo: ORIGEM_LEAD_LABELS[o] }))} />
          <SelectFiltro rotulo="Etapa" valor={etapa} aoMudar={setEtapa} opcoes={ETAPAS_LEAD.map(e => ({ id: e, rotulo: ETAPA_LEAD_LABELS[e] }))} />
          {equipe ? (
            <SelectFiltro rotulo="Agente" valor={agente} aoMudar={setAgente} opcoes={agentes.map(a => ({ id: a.id, rotulo: a.nome }))} />
          ) : null}
        </form>

        {filtrosAtivos ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            {carregando ? 'Buscando…' : `${total.toLocaleString('pt-BR')} ${total === 1 ? 'lead encontrado' : 'leads encontrados'}`}
            <button type="button" onClick={limparFiltros} className={cn('inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold text-[#1E2A4A] hover:bg-[#F2F4F7]', FOCUS_RING)}>
              <X className="size-4" aria-hidden="true" /> Limpar filtros
            </button>
          </div>
        ) : null}

        <div role="tabpanel" id={`painel-${estacao ?? 'novos'}`} aria-labelledby={`aba-${estacao ?? 'novos'}`} className="flex flex-col gap-3">
          {erro && itens.length === 0 ? (
            <ErrorState onRetry={() => void carregar(1, false)} />
          ) : (carregando || !estacao) && itens.length === 0 ? (
            <div role="status" aria-label="Carregando leads" className="grid gap-3 lg:grid-cols-2">
              <Skeleton className="h-44 rounded-2xl" />
              <Skeleton className="h-44 rounded-2xl" />
              <Skeleton className="hidden h-44 rounded-2xl lg:block" />
              <Skeleton className="hidden h-44 rounded-2xl lg:block" />
            </div>
          ) : itens.length === 0 && estacao ? (
            filtrosAtivos ? (
              <EstadoVazio
                moldura
                ilustracao="busca"
                titulo="Nenhum lead com esses filtros"
                descricao="Tente outro nome ou tire algum filtro para ver todos desta estação."
                acao={<AcaoPrincipal variante="secundaria" onClick={limparFiltros}>Limpar filtros</AcaoPrincipal>}
              />
            ) : (
              <EstadoVazio
                moldura
                ilustracao={VAZIOS[estacao].ilustracao}
                titulo={VAZIOS[estacao].titulo}
                descricao={VAZIOS[estacao].descricao}
                acao={
                  estacao === 'novos' || estacao === 'andamento' ? (
                    <>
                      {contadores && contadores.pool > 0 ? (
                        <AcaoPrincipal onClick={() => trocarEstacao('pool')}>Ir para o Pool ({contadores.pool})</AcaoPrincipal>
                      ) : null}
                      {eu.podeEscrever ? (
                        <AcaoPrincipal variante={contadores && contadores.pool > 0 ? 'secundaria' : 'principal'} icone={<Plus />} onClick={() => setNovoAberto(true)}>
                          Novo lead
                        </AcaoPrincipal>
                      ) : null}
                    </>
                  ) : undefined
                }
              />
            )
          ) : (
            <>
              <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2 2xl:grid-cols-3">
                {itens.map(lead => {
                  const acao = acaoPrincipalDoLead(lead, escopo)
                  const bloqueado = !eu.podeEscrever && acao.id !== 'abrir'
                  return (
                    <li key={lead.id} className="min-w-0">
                      <LeadCard
                        lead={leadParaCard(lead, { mostrarAgente: equipe })}
                        acao={{
                          rotulo: bloqueado ? 'Ver detalhes' : acao.rotulo,
                          icone: acao.icone,
                          onClick: () => (bloqueado ? abrir(lead.id) : void aoAcaoPrincipal(lead)),
                          carregando: atendendo === lead.id,
                        }}
                        menu={menuDoLead(lead)}
                        onAbrir={() => abrir(lead.id)}
                      />
                    </li>
                  )
                })}
              </ul>
              {temMais ? (
                <div className="flex justify-center pt-2">
                  <AcaoPrincipal variante="secundaria" carregando={carregandoMais} onClick={() => void carregar(pagina + 1, true)}>
                    Carregar mais ({(total - itens.length).toLocaleString('pt-BR')})
                  </AcaoPrincipal>
                </div>
              ) : (
                <p className="m-0 pt-1 text-center text-xs text-muted-foreground">
                  {total === 1 ? '1 lead' : `${total.toLocaleString('pt-BR')} leads`} nesta estação.
                </p>
              )}
              {carregando ? (
                <p role="status" className="m-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Atualizando…
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {eu.podeEscrever ? (
        <button
          type="button"
          onClick={() => setNovoAberto(true)}
          aria-label="Novo lead"
          className={cn(
            'fixed bottom-20 right-4 z-30 inline-flex size-14 items-center justify-center rounded-full bg-[var(--vr-accent,#1E2A4A)] text-[var(--vr-accent-fg,#FFFFFF)] shadow-lg hover:brightness-110 sm:hidden',
            FOCUS_RING,
          )}
        >
          <Plus className="size-6" aria-hidden="true" />
        </button>
      ) : null}

      <LeadDetalhe
        leadId={aberto?.id ?? null}
        inicial={aberto ? { aba: aberto.aba, dialogo: aberto.dialogo } : undefined}
        aoFechar={fechar}
        aoAlterar={atualizar}
      />
      <NovoLeadDialog
        aberto={novoAberto}
        aoFechar={() => setNovoAberto(false)}
        escopo={escopo}
        aoCriar={lead => {
          atualizar()
          abrir(lead.id)
        }}
      />
    </Conteudo>
  )
}
