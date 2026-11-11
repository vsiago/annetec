'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Columns3, List, Loader2, PartyPopper, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { ETAPA_LEAD_LABELS, type EtapaLead, type VendasAgente, type VendasLead } from '@annetec/contracts'
import { ErrorState } from '@/components/admin-platform/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { listarAgentesAction, mudarEtapaAction } from '@/lib/actions/vendas-rede-api'
import { veEquipe } from '@/lib/vendas-rede/adaptadores'
import { basePath } from '@/lib/vendas-rede/escopo'
import { destinosDoMenu, avaliarMovimento, textoDoResumo, transicaoPermitida } from '@/lib/vendas-rede/funil'
import type { FiltrosQuadro } from '@/lib/vendas-rede/tipos'
import { cn } from '@/lib/utils'
import { useVendasRede } from '../provider'
import { Conteudo } from '../shell/base'
import { AcaoPrincipal } from '../ui/acao-principal'
import { EstadoVazio } from '../ui/estado-vazio'
import { formatarMoedaCompacta } from '../ui/mascaras'
import type { LeadCardMenuItem } from '../ui/lead-card'
import { FAB_MOBILE, FOCUS_RING } from '../ui/tokens'
import { atenderLead, devolverAoPool } from '../lead/acoes'
import { LeadDetalhe, type AbaLead, type DialogoLead } from '../lead/lead-detalhe'
import { NovoLeadDialog } from '../lead/novo-lead'
import { BarraFiltros, FILTROS_VAZIOS, temFiltro, type FiltrosFunil } from '../funil/barra-filtros'
import { celebrarVenda } from '../funil/celebracao'
import { DialogosDeEtapa, type PedidoEtapa } from '../funil/dialogos-etapa'
import { EtapasMobile, type EtapaMobile } from '../funil/etapas-mobile'
import { FaixaDisponiveis } from '../funil/faixa-disponiveis'
import { ListaFunil } from '../funil/lista'
import { Quadro } from '../funil/quadro'
import type { AcoesDoFunil } from '../funil/tipos'
import { useQuadro } from '../funil/use-quadro'
import { mensagemDoErro } from '@/lib/vendas-rede/erros'

type Visao = 'quadro' | 'lista'
const CHAVE_VISAO = 'vendas-rede:funil:visao'
const LIMITE_INICIAL = 40
const PASSO_VER_MAIS = 40
/** Largura do contêiner a partir da qual o quadro de colunas cabe (abaixo: chips de etapa + lista). */
const LARGURA_QUADRO = 768

interface Aberto {
  id: string
  aba?: AbaLead
  dialogo?: DialogoLead
}

const lerVisao = (): Visao => {
  try {
    return window.localStorage.getItem(CHAVE_VISAO) === 'lista' ? 'lista' : 'quadro'
  } catch {
    return 'quadro'
  }
}

/** Largura do próprio contêiner (e não da janela): o menu lateral abre e fecha e muda o espaço da página. */
function useLarguraDoContainer() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [largura, setLargura] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setLargura(el.getBoundingClientRect().width)
    const obs = new ResizeObserver(entradas => {
      const w = entradas[0]?.contentRect.width
      if (typeof w === 'number') setLargura(w)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, largura }
}

/**
 * Funil: o quadro (kanban) com a faixa "Disponíveis" no topo, alternância Quadro/Lista, filtros e a
 * folha do lead. Colunas Novo · Em contato · Proposta · Negociação, cards com temperatura e próximo
 * passo, arrastar para mudar de etapa (o servidor continua mandando nas regras). No celular, chips de
 * etapa e lista de cards. `leadIdInicial` abre o detalhe de cara (`/funil/[id]`, links de aviso).
 * Funciona nos dois escopos e dentro dos consoles.
 */
export function FunilPage({ leadIdInicial }: { leadIdInicial?: string }) {
  const { escopo, eu, recarregar } = useVendasRede()
  const raiz = basePath(escopo)
  const equipe = veEquipe(eu.papel)
  const params = useSearchParams()
  const leadDaUrl = params.get('lead')
  const estacaoDaUrl = params.get('estacao')
  const { ref: refRaiz, largura } = useLarguraDoContainer()
  const largo = largura !== null && largura >= LARGURA_QUADRO

  const [visao, setVisao] = useState<Visao>('quadro')
  useEffect(() => setVisao(lerVisao()), [])
  const trocarVisao = (v: Visao) => {
    setVisao(v)
    try {
      window.localStorage.setItem(CHAVE_VISAO, v)
    } catch {
      /* sem armazenamento (janela privada): a escolha vale só nesta tela */
    }
  }

  const [filtros, setFiltros] = useState<FiltrosFunil>(FILTROS_VAZIOS)
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [limite, setLimite] = useState(LIMITE_INICIAL)
  const [agentes, setAgentes] = useState<VendasAgente[]>([])
  const [etapaMobile, setEtapaMobile] = useState<EtapaMobile>(estacaoDaUrl === 'andamento' ? 'em_contato' : 'novo')
  const [aberto, setAberto] = useState<Aberto | null>(leadIdInicial ? { id: leadIdInicial } : leadDaUrl ? { id: leadDaUrl } : null)
  const [novoAberto, setNovoAberto] = useState(false)
  const [pedido, setPedido] = useState<PedidoEtapa | null>(null)
  const [atendendoId, setAtendendoId] = useState<string | null>(null)
  const [anuncio, setAnuncio] = useState('')
  const [agoraMs, setAgoraMs] = useState(() => Date.now())

  // Busca com atraso de 300 ms.
  useEffect(() => {
    const t = window.setTimeout(() => setBuscaAplicada(filtros.busca.trim()), 300)
    return () => window.clearTimeout(t)
  }, [filtros.busca])

  // Relógio da tela: o "esperando há 18 min" e o "atrasado há 2 dias" andam sozinhos.
  useEffect(() => {
    const t = window.setInterval(() => setAgoraMs(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!equipe) return
    void listarAgentesAction(escopo, { perPage: 100 }).then(r => {
      if (r.success) setAgentes(r.data.filter(a => a.papel !== 'balcao'))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipe, escopo.kind === 'tenant' ? escopo.slug : 'p'])

  const filtrosApi = useMemo<FiltrosQuadro>(
    () => ({
      busca: buscaAplicada || undefined,
      origem: filtros.origem || undefined,
      temperatura: filtros.temperatura || undefined,
      agente: filtros.agente || undefined,
      atrasados: filtros.atrasados || undefined,
      limite,
    }),
    [buscaAplicada, filtros.origem, filtros.temperatura, filtros.agente, filtros.atrasados, limite],
  )

  const celebrar = useCallback((lead: Pick<VendasLead, 'nome' | 'valorEstimado'>) => {
    toast.success('Venda fechada!', {
      icon: <PartyPopper className="size-5" aria-hidden="true" />,
      description: `${lead.nome}${lead.valorEstimado ? ` · ${formatarMoedaCompacta(lead.valorEstimado)}` : ''}. Parabéns!`,
      duration: 7000,
    })
    window.requestAnimationFrame(() => celebrarVenda())
  }, [])

  const quadro = useQuadro({
    escopo,
    filtros: filtrosApi,
    aoGanhar: celebrar,
    aoZerarAtrasados: () =>
      toast.success('Nenhum atrasado!', { icon: <CheckCircle2 className="size-5" aria-hidden="true" />, description: 'Todos os próximos passos estão em dia. Bom trabalho.' }),
  })
  const { dados, carregando, atualizando, erro } = quadro

  // `?estacao=disponiveis` (ou o antigo `pool`, de links e notificações já enviados) leva à faixa Disponíveis.
  const irParaDisponiveis = estacaoDaUrl === 'disponiveis' || estacaoDaUrl === 'pool'
  const jaRolou = useRef(false)
  useEffect(() => {
    if (!irParaDisponiveis || !dados || jaRolou.current) return
    const faixa = document.getElementById('funil-disponiveis')
    if (!faixa) return
    jaRolou.current = true
    faixa.scrollIntoView({ behavior: 'smooth', block: 'start' })
    faixa.focus({ preventScroll: true })
  }, [irParaDisponiveis, dados])

  const atualizarTudo = useCallback(() => {
    void quadro.recarregar()
    void recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quadro.recarregar, recarregar])

  // ----- Folha do lead e URL -------------------------------------------------

  const sincronizarUrl = useCallback(
    (id: string | null) => {
      const alvo = id ? `${raiz}/funil/${encodeURIComponent(id)}` : `${raiz}/funil`
      if (typeof window !== 'undefined' && window.location.pathname + window.location.search !== alvo) {
        window.history.replaceState(window.history.state, '', alvo)
      }
    },
    [raiz],
  )
  const abrirPorId = useCallback(
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

  // ----- Mover de etapa -----------------------------------------------------

  const executarMover = useCallback(
    async (lead: VendasLead, para: EtapaLead, extras: { motivoPerda?: string; confirmar?: boolean } = {}): Promise<boolean> => {
      const r = await quadro.mover(lead, para, extras)
      if (!r.ok) {
        const titulo = r.codigo === 'VENDAS_TRANSICAO_INVALIDA' ? 'Movimento não permitido' : 'Não foi possível mover o lead'
        const motivo = mensagemDoErro(r.codigo, r.erro)
        toast.error(titulo, { description: motivo })
        setAnuncio(`${titulo}. ${motivo}`)
        return false
      }
      void recarregar()
      if (para === 'ganho') {
        celebrar(lead)
        setAnuncio(`Venda fechada: ${lead.nome}.`)
        return true
      }
      const voltaPossivel = para !== 'perdido' && transicaoPermitida(para, lead.etapa, eu.papel)
      toast.success(`${lead.nome} foi para ${ETAPA_LEAD_LABELS[para]}`, {
        duration: 8000,
        action: voltaPossivel
          ? {
              label: 'Desfazer',
              onClick: () => {
                void mudarEtapaAction(escopo, lead.id, { etapa: lead.etapa }).then(res => {
                  if (res.success) toast.success('Etapa restaurada')
                  else toast.error(mensagemDoErro(res.code, res.error))
                  atualizarTudo()
                })
              },
            }
          : undefined,
      })
      setAnuncio(`${lead.nome} foi para ${ETAPA_LEAD_LABELS[para]}.`)
      return true
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quadro.mover, recarregar, celebrar, eu.papel, escopo, atualizarTudo],
  )

  const pedirMover = useCallback<AcoesDoFunil['pedirMover']>(
    (lead, para) => {
      const v = avaliarMovimento(lead, para, eu.papel)
      switch (v.tipo) {
        case 'mesma-etapa':
          return
        case 'invalido':
          toast.error('Movimento não permitido', { description: v.motivo })
          setAnuncio(`Movimento não permitido. ${v.motivo}`)
          return
        case 'perdido':
          setPedido({ tipo: 'perdido', lead })
          return
        case 'ganho-confirmar':
          setPedido({ tipo: 'ganho', lead })
          return
        case 'ganho-bloqueado':
          setPedido({ tipo: 'ganho-bloqueado', lead, motivo: v.motivo })
          return
        case 'mover':
          void executarMover(lead, para)
      }
    },
    [eu.papel, executarMover],
  )

  // ----- Ações dos cards ------------------------------------------------------

  const podeAtender = eu.podeEscrever && Boolean(eu.agente)

  const atender = useCallback(
    async (lead: VendasLead) => {
      if (!eu.podeEscrever) return
      if (!podeAtender) {
        abrirPorId(lead.id, { dialogo: 'reatribuir' })
        return
      }
      setAtendendoId(lead.id)
      const atualizado = await atenderLead(escopo, lead)
      setAtendendoId(null)
      atualizarTudo()
      if (atualizado) abrirPorId(lead.id, { dialogo: 'contato' })
    },
    [eu.podeEscrever, podeAtender, escopo, atualizarTudo, abrirPorId],
  )

  const menuDoLead = useCallback(
    (lead: VendasLead): LeadCardMenuItem[] => {
      const itens: LeadCardMenuItem[] = [{ rotulo: 'Abrir detalhes', onSelecionar: () => abrirPorId(lead.id) }]
      if (!eu.podeEscrever) return itens
      const encerrado = lead.etapa === 'ganho' || lead.etapa === 'perdido'
      if (!encerrado) {
        itens.push({ rotulo: 'Registrar contato', onSelecionar: () => abrirPorId(lead.id, { dialogo: 'contato' }) })
        itens.push({ rotulo: 'Marcar próximo passo', onSelecionar: () => abrirPorId(lead.id, { dialogo: 'passo' }) })
      }
      // "Mover para": só o que o papel pode fazer (não é preciso arrastar).
      const destinos = destinosDoMenu(lead, eu.papel).filter(para => {
        const v = avaliarMovimento(lead, para, eu.papel)
        return v.tipo === 'mover' || v.tipo === 'perdido' || v.tipo === 'ganho-confirmar'
      })
      destinos.forEach((para, i) => {
        itens.push({
          rotulo: para === 'perdido' ? 'Marcar como perdido' : para === 'ganho' ? 'Mover para Venda fechada' : `Mover para ${ETAPA_LEAD_LABELS[para]}`,
          onSelecionar: () => pedirMover(lead, para, 'menu'),
          separador: i === 0,
          perigo: para === 'perdido',
        })
      })
      if (equipe) itens.push({ rotulo: 'Passar para outra pessoa', separador: destinos.length === 0, onSelecionar: () => abrirPorId(lead.id, { dialogo: 'reatribuir' }) })
      if (!encerrado && lead.agenteId && (equipe || lead.agenteId === eu.agente?.id)) {
        itens.push({
          rotulo: 'Liberar lead',
          descricao: 'Volta para Disponíveis para outra pessoa atender.',
          perigo: true,
          onSelecionar: () => void devolverAoPool(escopo, lead, atualizarTudo),
        })
      }
      return itens
    },
    [eu.podeEscrever, eu.papel, eu.agente?.id, equipe, escopo, abrirPorId, pedirMover, atualizarTudo],
  )

  const aoLigouOuChamou = useCallback(
    (lead: VendasLead, canal: 'ligacao' | 'whatsapp') => {
      if (!eu.podeEscrever) return
      window.setTimeout(() => {
        toast(`Como foi com ${lead.nome}?`, {
          description: canal === 'ligacao' ? 'Registre a ligação enquanto está fresco.' : 'Registre a conversa enquanto está fresco.',
          duration: 12_000,
          action: { label: 'Registrar contato', onClick: () => abrirPorId(lead.id, { dialogo: 'contato' }) },
        })
      }, 1200)
    },
    [eu.podeEscrever, abrirPorId],
  )

  const acoes = useMemo<AcoesDoFunil>(
    () => ({
      agora: new Date(agoraMs),
      mostrarAgente: equipe,
      podeEscrever: eu.podeEscrever,
      abrir: (lead, extra) => abrirPorId(lead.id, extra),
      menu: menuDoLead,
      pedirMover,
      aoLigouOuChamou,
      atender: lead => void atender(lead),
      atendendoId,
      podeAtender,
    }),
    [agoraMs, equipe, eu.podeEscrever, abrirPorId, menuDoLead, pedirMover, aoLigouOuChamou, atender, atendendoId, podeAtender],
  )

  const verMais = useCallback(() => setLimite(l => Math.min(200, l + PASSO_VER_MAIS)), [])

  // ----- Render -------------------------------------------------------------

  const resumo = dados ? textoDoResumo(dados.resumo, formatarMoedaCompacta) : null
  const comFiltro = temFiltro(filtros)
  const semNada =
    dados !== null &&
    dados.etapas.every(c => c.total === 0) &&
    dados.disponiveis.total === 0 &&
    dados.fechados.itens.length === 0 &&
    dados.fechados.ganhos.total + dados.fechados.perdidos.total === 0
  // Disponíveis são leads sem responsável: não valem para filtros que olham só os com dono.
  const mostrarDisponiveis = !filtros.agente && !filtros.temperatura && !filtros.atrasados

  return (
    <Conteudo>
      <div ref={refRaiz} className="@container flex w-full min-w-0 flex-col gap-4">
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="m-0 text-2xl font-bold leading-tight tracking-tight text-foreground">Funil</h1>
            <p className="m-0 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground" aria-live="polite">
              {resumo ? (
                <>
                  <span>{resumo.andamento}</span>
                  {resumo.negociacao ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{resumo.negociacao}</span>
                    </>
                  ) : null}
                  <span aria-hidden="true">·</span>
                  <span className={cn('inline-flex items-center gap-1', resumo.atrasados.ok ? 'font-medium text-[#067647]' : 'font-semibold text-[#B42318]')}>
                    {resumo.atrasados.ok ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : null}
                    {resumo.atrasados.texto}
                  </span>
                  {atualizando ? <Loader2 className="ml-1 size-3 animate-spin" aria-label="Atualizando" /> : null}
                </>
              ) : (
                <span>{equipe ? 'Os leads da sua rede, do primeiro contato à venda.' : 'Seus leads, do primeiro contato à venda.'}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Forma de exibição" className="inline-flex rounded-xl border border-border bg-white p-0.5">
              {(
                [
                  { id: 'quadro', rotulo: 'Quadro', icone: <Columns3 /> },
                  { id: 'lista', rotulo: 'Lista', icone: <List /> },
                ] as const
              ).map(o => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={visao === o.id}
                  onClick={() => trocarVisao(o.id)}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium transition-colors',
                    visao === o.id ? 'bg-[#1E2A4A] text-white' : 'text-[#344054] hover:bg-[#F2F4F7]',
                    FOCUS_RING,
                  )}
                >
                  <span aria-hidden="true" className="inline-flex [&>svg]:size-4">
                    {o.icone}
                  </span>
                  {o.rotulo}
                </button>
              ))}
            </div>
            {eu.podeEscrever ? (
              <AcaoPrincipal icone={<Plus />} onClick={() => setNovoAberto(true)} className="hidden sm:inline-flex">
                Novo lead
              </AcaoPrincipal>
            ) : null}
          </div>
        </header>

        {dados && mostrarDisponiveis ? <FaixaDisponiveis itens={dados.disponiveis.itens} total={dados.disponiveis.total} acoes={acoes} agoraMs={agoraMs} /> : null}

        <BarraFiltros filtros={filtros} aoMudar={p => { setFiltros(f => ({ ...f, ...p })); setLimite(LIMITE_INICIAL) }} agentes={agentes} equipe={equipe} />

        <div aria-live="polite" className="sr-only">
          {anuncio}
        </div>

        {erro && !dados ? (
          <ErrorState onRetry={() => void quadro.recarregarInicial()} />
        ) : carregando || !dados || largura === null ? (
          <EsqueletoFunil largo={largo} />
        ) : semNada && !comFiltro ? (
          <EstadoVazio
            moldura
            ilustracao="funil"
            titulo="Seu funil está pronto para o primeiro lead"
            descricao="Quando um lead aparecer em Disponíveis, é só atender. Se já tem alguém em mente, cadastre agora e comece a conversa."
            acao={
              eu.podeEscrever ? (
                <AcaoPrincipal icone={<Plus />} onClick={() => setNovoAberto(true)}>
                  Novo lead
                </AcaoPrincipal>
              ) : undefined
            }
          />
        ) : semNada && comFiltro ? (
          <EstadoVazio
            moldura
            ilustracao="busca"
            titulo="Nenhum lead com esses filtros"
            descricao="Tente outro nome ou tire algum filtro para ver o funil inteiro."
            acao={
              <AcaoPrincipal variante="secundaria" onClick={() => setFiltros({ ...FILTROS_VAZIOS })}>
                Limpar filtros
              </AcaoPrincipal>
            }
          />
        ) : visao === 'quadro' && largo ? (
          <Quadro dados={dados} acoes={acoes} aoPausar={quadro.pausar} aoVerMais={verMais} />
        ) : visao === 'quadro' ? (
          <EtapasMobile dados={dados} etapa={etapaMobile} aoMudar={setEtapaMobile} acoes={acoes} aoVerMais={verMais} />
        ) : (
          <ListaFunil dados={dados} acoes={acoes} largo={largo} aoVerMais={verMais} />
        )}

        {dados && resumo?.atrasados.ok && dados.resumo.emAndamento > 0 && !comFiltro ? (
          <p className="m-0 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-[#067647]" aria-hidden="true" />
            Tudo em dia por aqui. Continue assim.
          </p>
        ) : null}
      </div>

      {eu.podeEscrever ? (
        <button
          type="button"
          onClick={() => setNovoAberto(true)}
          aria-label="Novo lead"
          className={cn(
            FAB_MOBILE,
            'inline-flex size-14 items-center justify-center rounded-full bg-[var(--vr-accent,#1E2A4A)] text-[var(--vr-accent-fg,#FFFFFF)] shadow-lg hover:brightness-110 sm:hidden',
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
        aoAlterar={atualizarTudo}
      />
      <NovoLeadDialog
        aberto={novoAberto}
        aoFechar={() => setNovoAberto(false)}
        escopo={escopo}
        aoCriar={lead => {
          atualizarTudo()
          abrirPorId(lead.id)
        }}
      />
      <DialogosDeEtapa
        pedido={pedido}
        aoFechar={() => setPedido(null)}
        aoConfirmarPerda={async (lead, motivo) => {
          const ok = await executarMover(lead, 'perdido', { motivoPerda: motivo })
          if (ok) setPedido(null)
        }}
        aoConfirmarGanho={async lead => {
          const ok = await executarMover(lead, 'ganho', { confirmar: true })
          if (ok) setPedido(null)
        }}
      />
    </Conteudo>
  )
}

function EsqueletoFunil({ largo }: { largo: boolean }) {
  if (!largo) {
    return (
      <div role="status" aria-label="Carregando o funil" className="flex flex-col gap-3">
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2, 3].map(i => (
            <Skeleton key={i} className="h-11 w-28 shrink-0 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-36 rounded-xl" />
      </div>
    )
  }
  return (
    <div role="status" aria-label="Carregando o funil" className="grid grid-cols-[repeat(4,minmax(0,1fr))_15rem] gap-3">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="flex flex-col gap-2 rounded-2xl border border-border bg-[#F6F7F9] p-2">
          <Skeleton className="h-10 rounded-lg" />
          {i < 4 ? (
            <>
              <Skeleton className="h-32 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
              {i < 3 ? <Skeleton className="h-32 rounded-xl" /> : null}
            </>
          ) : (
            <>
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </>
          )}
        </div>
      ))}
    </div>
  )
}
