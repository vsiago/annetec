'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { CalendarClock, Loader2, Mail, MessageCircle, Pencil, Phone, Repeat2, Undo2, XCircle, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import type { MensagemLeadResponse, VendasLead } from '@annetec/contracts'
import { initialsOf } from '@/components/admin-platform/ui/entity-avatar'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsMobile } from '@/components/ui/use-mobile'
import { getLeadAction, getMensagemLeadAction } from '@/lib/actions/vendas-rede-api'
import { eventosParaTimeline, jornadaDoLead, proximoPassoDoCard, tempoDecorrido, veEquipe } from '@/lib/vendas-rede/adaptadores'
import { cn } from '@/lib/utils'
import { useVendasRede } from '../provider'
import { AcaoPrincipal } from '../ui/acao-principal'
import { EstadoVazio } from '../ui/estado-vazio'
import { EtapaBadge } from '../ui/etapa-badge'
import { JornadaTrilha } from '../ui/jornada-trilha'
import { formatarCelular, formatarDocumento, formatarMoeda, primeiroNome } from '../ui/mascaras'
import { ModeloMensagemCard } from '../ui/modelo-mensagem-card'
import { OrigemBadge } from '../ui/origem-badge'
import { ProximoPassoBadge } from '../ui/proximo-passo-badge'
import { TimelineLead } from '../ui/timeline-lead'
import { FOCUS_RING } from '../ui/tokens'
import { TemperaturaChip } from '../funil/temperatura-chip'
import { CampoFicha, ValorLongo } from '../ui/campo-ficha'
import { acaoPrincipalDoLead, atenderLead, devolverAoPool, leadNoPool } from './acoes'
import { ConversaoClube } from './conversao-clube'
import { ConversaoPlataforma } from './conversao-plataforma'
import { EditarLeadDialog } from './editar-lead'
import { MudarEtapaDialog } from './mudar-etapa'
import { ProximoPassoDialog } from './proximo-passo'
import { ReatribuirDialog } from './reatribuir'
import { RegistrarContatoDialog } from './registrar-contato'

export type AbaLead = 'resumo' | 'mensagens' | 'venda' | 'historico'
type Aba = AbaLead

const ABAS: ReadonlyArray<{ id: Aba; rotulo: string }> = [
  { id: 'resumo', rotulo: 'Resumo' },
  { id: 'mensagens', rotulo: 'Mensagens' },
  { id: 'venda', rotulo: 'Venda' },
  { id: 'historico', rotulo: 'Histórico' },
]

export type DialogoLead = 'contato' | 'passo' | 'etapa' | 'perdido' | 'reatribuir' | 'editar'
type Dialogo = null | DialogoLead

/**
 * Detalhe do lead: folha lateral no desktop e folha de baixo no celular.
 * Abas: Resumo (ficha e ações), Mensagens (modelos com WhatsApp e copiar),
 * Venda (proposta/link no escopo plataforma; link de adesão e "assinar agora"
 * no clube) e Histórico (linha do tempo).
 *
 * `aoAlterar` avisa a tela de fora (Funil/Hoje) para recarregar as listas.
 */
export function LeadDetalhe({
  leadId,
  aoFechar,
  aoAlterar,
  inicial,
}: {
  leadId: string | null
  aoFechar: () => void
  aoAlterar: () => void
  /** Aba (e diálogo) com que o detalhe abre; vale a cada novo `leadId`. */
  inicial?: { aba?: AbaLead; dialogo?: DialogoLead }
}) {
  const { escopo, eu, recarregar } = useVendasRede()
  const mobile = useIsMobile()
  const [lead, setLead] = useState<VendasLead | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('resumo')
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [trabalhando, setTrabalhando] = useState(false)
  const idRef = useRef<string | null>(null)
  idRef.current = leadId
  const abasRef = useRef<Array<HTMLButtonElement | null>>([])

  // Setas, Home e End trocam de aba (padrão de abas do WAI-ARIA).
  function aoTeclarNasAbas(e: KeyboardEvent<HTMLButtonElement>, indice: number) {
    const ultimo = ABAS.length - 1
    let destino = -1
    if (e.key === 'ArrowRight') destino = indice === ultimo ? 0 : indice + 1
    else if (e.key === 'ArrowLeft') destino = indice === 0 ? ultimo : indice - 1
    else if (e.key === 'Home') destino = 0
    else if (e.key === 'End') destino = ultimo
    if (destino < 0) return
    e.preventDefault()
    const alvo = ABAS[destino]
    if (alvo) {
      setAba(alvo.id)
      abasRef.current[destino]?.focus()
    }
  }

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!leadId) return
      if (!silencioso) {
        setLead(null)
        setErro(null)
      }
      const r = await getLeadAction(escopo, leadId)
      if (idRef.current !== leadId) return
      if (r.success) setLead(r.data)
      else if (!silencioso || !lead) setErro(r.error)
    },
    // `lead` só entra para decidir se o erro silencioso deve aparecer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [escopo, leadId],
  )

  const inicialRef = useRef(inicial)
  inicialRef.current = inicial
  useEffect(() => {
    setAba(inicialRef.current?.aba ?? 'resumo')
    setDialogo(inicialRef.current?.dialogo ?? null)
    void carregar()
  }, [carregar])

  const depoisDeMudar = useCallback(() => {
    void carregar(true)
    aoAlterar()
    void recarregar()
  }, [carregar, aoAlterar, recarregar])

  const aberto = Boolean(leadId)
  const noPool = lead ? leadNoPool(lead) : false
  const encerrado = lead ? lead.etapa === 'ganho' || lead.etapa === 'perdido' : false
  const equipe = veEquipe(eu.papel)
  const acao = lead ? acaoPrincipalDoLead(lead, escopo) : null

  async function executarAcao() {
    if (!lead || !acao) return
    if (acao.id === 'atender') {
      setTrabalhando(true)
      const atualizado = await atenderLead(escopo, lead)
      setTrabalhando(false)
      if (atualizado) depoisDeMudar()
      return
    }
    if (acao.id === 'contato') setDialogo('contato')
    else if (acao.id === 'proposta' || acao.id === 'fechar') setAba('venda')
  }

  return (
    <Sheet open={aberto} onOpenChange={o => (!o ? aoFechar() : undefined)}>
      <SheetContent
        side={mobile ? 'bottom' : 'right'}
        className={cn(
          'gap-0 overflow-hidden p-0',
          mobile ? 'h-[92dvh] max-h-[92dvh] rounded-t-3xl' : 'w-full sm:max-w-xl',
        )}
      >
        <SheetHeader className="shrink-0 gap-2 border-b border-border p-4 pr-12">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#E5EDF5] text-sm font-bold text-[#1E2A4A]">
              {lead ? initialsOf(lead.nome) : '··'}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <SheetTitle className="m-0 truncate text-lg font-semibold">{lead?.nome ?? 'Carregando o lead'}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {lead ? (
                    <>
                      <EtapaBadge etapa={lead.etapa} />
                      <TemperaturaChip temperatura={lead.temperatura} motivo={lead.temperaturaMotivo} tamanho="md" />
                      <OrigemBadge origem={lead.origem} detalhe={lead.origemDetalhe} />
                      <span>{noPool ? 'Disponível, sem responsável' : lead.agenteNome ? `Responsável: ${lead.agenteNome}` : ''}</span>
                    </>
                  ) : null}
                </div>
              </SheetDescription>
            </div>
          </div>
          {lead ? (
            <nav aria-label="Seções do lead" className="-mx-1 flex gap-1 relative overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div role="tablist" className="flex gap-1">
                {ABAS.map((a, i) => (
                  <button
                    key={a.id}
                    ref={el => {
                      abasRef.current[i] = el
                    }}
                    type="button"
                    role="tab"
                    id={`aba-lead-${a.id}`}
                    aria-selected={aba === a.id}
                    aria-controls={`painel-lead-${a.id}`}
                    tabIndex={aba === a.id ? 0 : -1}
                    onClick={() => setAba(a.id)}
                    onKeyDown={ev => aoTeclarNasAbas(ev, i)}
                    className={cn(
                      'min-h-11 shrink-0 rounded-full px-4 text-sm font-medium transition-colors',
                      aba === a.id ? 'bg-[#1E2A4A] text-white' : 'text-[#475467] hover:bg-[#F2F4F7]',
                      FOCUS_RING,
                    )}
                  >
                    {a.rotulo}
                  </button>
                ))}
              </div>
            </nav>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          {erro && !lead ? (
            <EstadoVazio
              ilustracao="busca"
              titulo="Não foi possível abrir este lead"
              descricao={erro}
              acao={<AcaoPrincipal onClick={() => void carregar()}>Tentar de novo</AcaoPrincipal>}
            />
          ) : !lead ? (
            <div role="status" aria-label="Carregando o lead" className="flex flex-col gap-4">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          ) : (
            <div role="tabpanel" id={`painel-lead-${aba}`} aria-labelledby={`aba-lead-${aba}`} className="flex flex-col gap-5">
              {aba === 'resumo' ? (
                <ResumoDoLead
                  lead={lead}
                  noPool={noPool}
                  encerrado={encerrado}
                  equipe={equipe}
                  rotuloAcao={acao}
                  trabalhando={trabalhando}
                  aoAcao={() => void executarAcao()}
                  aoAbrir={setDialogo}
                  aoDevolver={() => void devolverAoPool(escopo, lead, depoisDeMudar)}
                />
              ) : null}
              {aba === 'mensagens' ? <MensagensDoLead lead={lead} /> : null}
              {aba === 'venda' ? (
                noPool ? (
                  <EstadoVazio
                    ilustracao="pool"
                    titulo="Atenda este lead primeiro"
                    descricao={`Depois de atender, você gera ${escopo.kind === 'platform' ? 'a proposta' : 'o link de adesão'} por aqui.`}
                    acao={
                      <AcaoPrincipal carregando={trabalhando} onClick={() => void executarAcao()}>
                        Atender
                      </AcaoPrincipal>
                    }
                  />
                ) : lead.etapa === 'perdido' ? (
                  <EstadoVazio
                    ilustracao="funil"
                    titulo="Este lead foi marcado como perdido"
                    descricao={lead.motivoPerda ? `Motivo: ${lead.motivoPerda}` : 'Se ele voltou a ter interesse, mude a etapa para reabrir.'}
                    acao={<AcaoPrincipal variante="secundaria" onClick={() => setDialogo('etapa')}>Mudar etapa</AcaoPrincipal>}
                  />
                ) : escopo.kind === 'platform' ? (
                  <ConversaoPlataforma escopo={escopo} lead={lead} aoMudar={depoisDeMudar} aoEditarDados={() => setDialogo('editar')} />
                ) : (
                  <ConversaoClube escopo={escopo} lead={lead} aoMudar={depoisDeMudar} aoEditarDados={() => setDialogo('editar')} />
                )
              ) : null}
              {aba === 'historico' ? (
                <div className="flex flex-col gap-4">
                  {!noPool && !encerrado ? (
                    <AcaoPrincipal variante="secundaria" icone={<Phone />} onClick={() => setDialogo('contato')} bloco>
                      Registrar contato
                    </AcaoPrincipal>
                  ) : null}
                  <TimelineLead eventos={eventosParaTimeline(lead.eventos)} />
                </div>
              ) : null}
            </div>
          )}
        </div>

        {lead ? (
          <>
            <RegistrarContatoDialog
              aberto={dialogo === 'contato'}
              aoFechar={() => setDialogo(null)}
              escopo={escopo}
              leadId={lead.id}
              leadNome={lead.nome}
              aoConcluir={depoisDeMudar}
            />
            <ProximoPassoDialog
              aberto={dialogo === 'passo'}
              aoFechar={() => setDialogo(null)}
              escopo={escopo}
              leadId={lead.id}
              leadNome={lead.nome}
              textoAtual={lead.proximoPasso}
              aoConcluir={depoisDeMudar}
            />
            <MudarEtapaDialog
              aberto={dialogo === 'etapa' || dialogo === 'perdido'}
              aoFechar={() => setDialogo(null)}
              escopo={escopo}
              lead={lead}
              etapaInicial={dialogo === 'perdido' ? 'perdido' : undefined}
              aoConcluir={depoisDeMudar}
            />
            <ReatribuirDialog
              aberto={dialogo === 'reatribuir'}
              aoFechar={() => setDialogo(null)}
              escopo={escopo}
              lead={lead}
              aoConcluir={depoisDeMudar}
            />
            <EditarLeadDialog
              aberto={dialogo === 'editar'}
              aoFechar={() => setDialogo(null)}
              escopo={escopo}
              lead={lead}
              aoSalvar={depoisDeMudar}
            />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function Linha({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children: ReactNode }) {
  return (
    <CampoFicha rotulo={rotulo} largo={largo}>
      {children}
    </CampoFicha>
  )
}

function ResumoDoLead({
  lead,
  noPool,
  encerrado,
  equipe,
  rotuloAcao,
  trabalhando,
  aoAcao,
  aoAbrir,
  aoDevolver,
}: {
  lead: VendasLead
  noPool: boolean
  encerrado: boolean
  equipe: boolean
  rotuloAcao: ReturnType<typeof acaoPrincipalDoLead> | null
  trabalhando: boolean
  aoAcao: () => void
  aoAbrir: (d: Dialogo) => void
  aoDevolver: () => void
}) {
  const { eu } = useVendasRede()
  const proximo = proximoPassoDoCard(lead)
  const podeEscrever = eu.podeEscrever
  const souDono = lead.agenteId !== null && lead.agenteId === eu.agente?.id
  const telefone = lead.telefone ? formatarCelular(lead.telefone) : null
  // Ligar e WhatsApp não registram nada sozinhos: o lembrete leva direto ao registro do contato.
  function lembrarDeRegistrar(canal: 'ligacao' | 'whatsapp') {
    if (!podeEscrever || noPool || encerrado) return
    window.setTimeout(() => {
      toast(`${canal === 'ligacao' ? 'Ligou para' : 'Falou com'} ${primeiroNome(lead.nome)}?`, {
        description: 'Registre o contato enquanto está fresco.',
        duration: 12_000,
        action: { label: 'Registrar contato', onClick: () => aoAbrir('contato') },
      })
    }, 1200)
  }
  return (
    <>
      {rotuloAcao && rotuloAcao.id !== 'abrir' && podeEscrever ? (
        <AcaoPrincipal tamanho="lg" bloco icone={rotuloAcao.icone} carregando={trabalhando} onClick={aoAcao}>
          {rotuloAcao.rotulo}
        </AcaoPrincipal>
      ) : null}

      {lead.telefone ? (
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`tel:${lead.telefone.replace(/\D/g, '')}`}
            onClick={() => lembrarDeRegistrar('ligacao')}
            className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white text-sm font-semibold hover:bg-[#F2F4F7]', FOCUS_RING)}
          >
            <Phone className="size-4" aria-hidden="true" /> Ligar
          </a>
          <a
            href={`https://wa.me/55${lead.telefone.replace(/\D/g, '').replace(/^55/, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => lembrarDeRegistrar('whatsapp')}
            className={cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-white text-sm font-semibold hover:bg-[#F2F4F7]', FOCUS_RING)}
          >
            <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
          </a>
        </div>
      ) : null}

      <section aria-label="Jornada" className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4">
        <JornadaTrilha passos={jornadaDoLead(lead)} variante="completa" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ProximoPassoBadge passo={proximo} />
          {!noPool && !encerrado && podeEscrever ? (
            <button
              type="button"
              onClick={() => aoAbrir('passo')}
              className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[#1E2A4A] hover:bg-[#F2F4F7]', FOCUS_RING)}
            >
              <CalendarClock className="size-4" aria-hidden="true" />
              {lead.proximoPasso ? 'Alterar' : 'Marcar próximo passo'}
            </button>
          ) : null}
        </div>
        {lead.etapa === 'perdido' && lead.motivoPerda ? (
          <p className="m-0 rounded-xl bg-[#F2F4F7] px-3 py-2 text-sm text-[#344054]">Motivo da perda: {lead.motivoPerda}</p>
        ) : null}
      </section>

      <section aria-label="Ficha" className="@container flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-sm font-semibold">Ficha</h3>
          {podeEscrever ? (
            <button
              type="button"
              onClick={() => aoAbrir('editar')}
              className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-[#1E2A4A] hover:bg-[#F2F4F7]', FOCUS_RING)}
            >
              <Pencil className="size-4" aria-hidden="true" /> Editar dados
            </button>
          ) : null}
        </div>
        <dl className="m-0 grid grid-cols-1 gap-3 @sm:grid-cols-2">
          <Linha rotulo="Celular">{telefone ?? <span className="font-normal text-muted-foreground">Não informado</span>}</Linha>
          <Linha rotulo="E-mail" largo>
            {lead.email ? (
              <ValorLongo texto={lead.email} href={`mailto:${lead.email}`} icone={Mail} rotuloCopiar="Copiar e-mail" mensagemCopiar="E-mail copiado" />
            ) : (
              <span className="font-normal text-muted-foreground">Não informado</span>
            )}
          </Linha>
          <Linha rotulo={lead.tipo === 'empresa' ? 'CNPJ' : 'CPF'}>
            {lead.documento ? formatarDocumento(lead.documento) : <span className="font-normal text-muted-foreground">Não informado</span>}
          </Linha>
          <Linha rotulo="Cidade">{[lead.cidade, lead.uf].filter(Boolean).join('/') || <span className="font-normal text-muted-foreground">Não informada</span>}</Linha>
          {lead.interessePlanoNome ? <Linha rotulo="Plano de interesse">{lead.interessePlanoNome}</Linha> : null}
          {lead.vidasEstimadas ? <Linha rotulo="Vidas estimadas">{lead.vidasEstimadas.toLocaleString('pt-BR')}</Linha> : null}
          {lead.valorEstimado ? <Linha rotulo="Valor estimado">{formatarMoeda(lead.valorEstimado)}</Linha> : null}
          <Linha rotulo="Chegou">{tempoDecorrido(lead.createdAt)}</Linha>
        </dl>
        {lead.observacoes ? <p className="m-0 whitespace-pre-line rounded-xl bg-[#F8F9FB] px-3 py-2 text-sm text-[#344054]">{lead.observacoes}</p> : null}
      </section>

      {podeEscrever && !noPool ? (
        <section aria-label="Outras ações" className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold">Outras ações</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <AcaoPrincipal variante="secundaria" icone={<ArrowRightLeft />} onClick={() => aoAbrir('etapa')}>
              Mudar etapa
            </AcaoPrincipal>
            {lead.etapa !== 'perdido' && lead.etapa !== 'ganho' ? (
              <AcaoPrincipal variante="secundaria" icone={<XCircle />} onClick={() => aoAbrir('perdido')}>
                Marcar como perdido
              </AcaoPrincipal>
            ) : null}
            {equipe ? (
              <AcaoPrincipal variante="secundaria" icone={<Repeat2 />} onClick={() => aoAbrir('reatribuir')}>
                Passar para outra pessoa
              </AcaoPrincipal>
            ) : null}
            {(souDono || equipe) && !encerrado && lead.agenteId ? (
              <div className="flex flex-col gap-1">
                <AcaoPrincipal variante="secundaria" icone={<Undo2 />} onClick={aoDevolver} aria-describedby="dica-liberar-lead" className="w-full">
                  Liberar lead
                </AcaoPrincipal>
                <p id="dica-liberar-lead" className="m-0 px-1 text-xs text-muted-foreground">
                  Volta para Disponíveis para outra pessoa atender.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  )
}

function MensagensDoLead({ lead }: { lead: VendasLead }) {
  const { escopo, eu } = useVendasRede()
  const modelos = eu.config.modelosMensagem
  const [textos, setTextos] = useState<Record<string, MensagemLeadResponse | 'erro'> | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let cancelado = false
    setTextos(null)
    void Promise.all(
      modelos.map(async m => {
        const r = await getMensagemLeadAction(escopo, lead.id, m.id)
        return [m.id, r.success ? r.data : ('erro' as const)] as const
      }),
    ).then(pares => {
      if (!cancelado) setTextos(Object.fromEntries(pares))
    })
    return () => {
      cancelado = true
    }
    // Recarrega quando o lead muda (ex.: plano de interesse alterado).
  }, [escopo, lead.id, lead.updatedAt, modelos, tentativa])

  if (modelos.length === 0) {
    return (
      <EstadoVazio
        ilustracao="historico"
        titulo="Nenhum modelo de mensagem ainda"
        descricao="O administrador cadastra os modelos em Regras. Quando existirem, eles aparecem aqui prontos para enviar."
      />
    )
  }
  if (!textos) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Preparando as mensagens…
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted-foreground">Mensagens já com o nome de {primeiroNome(lead.nome)}. Escolha uma e envie.</p>
      {modelos.map(m => {
        const t = textos[m.id]
        if (!t || t === 'erro') {
          return (
            <div key={m.id} role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FEF3F2] px-3 py-2 text-sm text-[#B42318]">
              <p className="m-0">Não foi possível preparar “{m.titulo}”.</p>
              <button
                type="button"
                onClick={() => setTentativa(n => n + 1)}
                className={cn('inline-flex min-h-11 items-center rounded-lg px-2 font-semibold underline', FOCUS_RING)}
              >
                Tentar de novo
              </button>
            </div>
          )
        }
        return <ModeloMensagemCard key={m.id} titulo={m.titulo} texto={t.texto} canal={t.canal} telefone={lead.telefone} email={lead.email} />
      })}
    </div>
  )
}
