'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlarmClock, ArrowRight, Flag, Inbox, Phone, FileText, NotebookPen, Plus, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import type { VendasLinhaDaVez, VendasPainelHoje } from '@annetec/contracts'
import { useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { ErrorState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { Skeleton } from '@/components/ui/skeleton'
import { getPainelHojeAction } from '@/lib/actions/vendas-rede-api'
import { veEquipe } from '@/lib/vendas-rede/adaptadores'
import { basePath, chaveDoEscopo } from '@/lib/vendas-rede/escopo'
import { cn } from '@/lib/utils'
import { Conteudo } from '../shell/base'
import { useVendasRede } from '../provider'
import { EstadoVazio } from '../ui/estado-vazio'
import { DEGRAUS_PADRAO, FunilDegraus } from '../ui/funil-degraus'
import { LinhaDaVez } from '../ui/linha-da-vez'
import { dataPorExtenso, formatarPercentual, pluralizar, primeiroNome, saudacaoPorHora } from '../ui/mascaras'
import { NumerosDaSemana } from '../ui/numeros-da-semana'
import { ValorMoeda } from '../ui/valor-moeda'
import { PresencaDot } from '../ui/presenca-dot'
import { CARD_SHADOW, FAB_MOBILE, FOCUS_RING } from '../ui/tokens'
import { atenderLead } from '../lead/acoes'
import { LeadDetalhe, type AbaLead, type DialogoLead } from '../lead/lead-detalhe'
import { NovoLeadDialog } from '../lead/novo-lead'
import { AcaoPrincipal } from '../ui/acao-principal'

const ETAPAS_DEGRAUS = ['novo', 'em_contato', 'proposta', 'negociacao', 'ganho'] as const

interface Aberto {
  id: string
  aba?: AbaLead
  dialogo?: DialogoLead
}

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * "Hoje": o que fazer agora. Uma frase de abertura, três pílulas de estado,
 * um aviso (só se houver) e a grade: Sua vez agora (6) · Sua semana (3) ·
 * Seu funil (3). Quem enxerga equipe vê também "Equipe online agora".
 * Funciona nos dois escopos (plataforma e clube).
 */
export function HojePage() {
  const { escopo, eu, recarregar } = useVendasRede()
  const raiz = basePath(escopo)
  const chave = chaveDoEscopo(escopo)
  const painel = useConsoleData(() => getPainelHojeAction(escopo), [chave])
  const [aberto, setAberto] = useState<Aberto | null>(null)
  const [novoAberto, setNovoAberto] = useState(false)
  const [atendendo, setAtendendo] = useState<string | null>(null)
  const [agora, setAgora] = useState<Date | null>(null)

  useEffect(() => {
    setAgora(new Date())
  }, [])

  // Atualiza a tela sozinha a cada 2 min (só com a aba visível).
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void painel.reload({ silent: true })
    }, 120_000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recarregarTudo = useCallback(() => {
    void painel.reload({ silent: true })
    void recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarregar])

  const d = painel.data
  const nome = primeiroNome(d?.agente.nome ?? eu.agente?.nome ?? '')

  async function aoAcao(item: VendasLinhaDaVez) {
    const lead = item.lead
    if (item.acao === 'atender') {
      setAtendendo(lead.id)
      const atualizado = await atenderLead(escopo, lead)
      setAtendendo(null)
      recarregarTudo()
      if (atualizado) setAberto({ id: lead.id })
      return
    }
    if (item.acao === 'ligar') {
      const digitos = (lead.telefone ?? '').replace(/\D/g, '')
      if (!digitos) {
        // Sem celular não há para quem ligar: abre a edição para cadastrar.
        toast(`Cadastre o celular de ${lead.nome} para ligar.`)
        setAberto({ id: lead.id, dialogo: 'editar' })
        return
      }
      window.location.href = `tel:${digitos}`
      if (eu.podeEscrever) {
        window.setTimeout(() => {
          toast(`Como foi com ${lead.nome}?`, {
            description: 'Registre a ligação enquanto está fresco.',
            duration: 12_000,
            action: { label: 'Registrar contato', onClick: () => setAberto({ id: lead.id, dialogo: 'contato' }) },
          })
        }, 1200)
      }
      return
    }
    if (item.acao === 'registrar') setAberto({ id: lead.id, dialogo: 'contato' })
    else if (item.acao === 'enviar_proposta') setAberto({ id: lead.id, aba: 'venda' })
    else setAberto({ id: lead.id })
  }

  return (
    <Conteudo>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="m-0 text-sm text-muted-foreground">{agora ? maiuscula(dataPorExtenso(agora)) : ' '}</p>
            <h1 className="m-0 text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-[28px]">
              {agora ? saudacaoPorHora(agora) : 'Olá'}
              {nome ? `, ${nome}` : ''}
            </h1>
            <p className="m-0 text-base text-[#475467]" aria-live="polite">
              {!d
                ? 'Carregando o seu dia…'
                : d.contadores.minhaVez > 0
                  ? `${d.contadores.minhaVez} ${d.contadores.minhaVez === 1 ? 'lead espera' : 'leads esperam'} por você agora.`
                  : 'Nada urgente agora. Bom momento para prospectar.'}
            </p>
          </div>
          {eu.podeEscrever ? (
            <AcaoPrincipal variante="secundaria" onClick={() => setNovoAberto(true)} className="hidden sm:inline-flex">
              Novo lead
            </AcaoPrincipal>
          ) : null}
        </div>

        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Seu estado">
          <li className="inline-flex min-h-9 items-center rounded-full border border-border bg-white px-3.5">
            <PresencaDot online={d?.agente.online ?? eu.agente?.online ?? true} rotulo />
          </li>
          <li>
            <Link
              href={`${raiz}/funil?estacao=disponiveis`}
              className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3.5 text-xs font-medium text-[#344054] hover:bg-[#F2F4F7]', FOCUS_RING)}
            >
              <Inbox className="size-3.5" aria-hidden="true" />
              Disponíveis: {(d?.contadores.pool ?? eu.contadores.pool).toLocaleString('pt-BR')}
            </Link>
          </li>
          <li className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-white px-3.5 text-xs font-medium text-[#344054]">
            <Flag className="size-3.5" aria-hidden="true" />
            {d ? (
              d.meta.metaMensal ? (
                <>
                  Meta do mês: {d.meta.realizado.toLocaleString('pt-BR')} de {pluralizar(d.meta.metaMensal, 'venda', 'vendas')}
                  <span className="sr-only"> ({formatarPercentual((d.meta.realizado / d.meta.metaMensal) * 100)})</span>
                </>
              ) : (
                `Vendas no mês: ${d.meta.realizado.toLocaleString('pt-BR')}`
              )
            ) : (
              'Meta do mês'
            )}
          </li>
        </ul>
      </header>

      {d ? <AvisoDoDia painel={d} raiz={raiz} /> : null}

      {painel.error && !d ? (
        <ErrorState onRetry={() => painel.reload()} />
      ) : !d ? (
        <CarregandoHoje />
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          <SectionCard
            title="Sua vez agora"
            description="Quem precisa de você primeiro."
            icon={UserCheck}
            padded={false}
            className="lg:col-span-6"
            bodyClassName="px-4"
          >
            {d.suaVez.length === 0 ? (
              <EstadoVazio
                ilustracao="pool"
                titulo={d.contadores.pool > 0 ? 'Você está em dia' : 'Nenhum lead esperando por você'}
                descricao={
                  d.contadores.pool > 0
                    ? `Há ${d.contadores.pool} ${d.contadores.pool === 1 ? 'lead disponível' : 'leads disponíveis'}. Atenda um para começar.`
                    : 'Quando alguém pedir contato pelo site ou você marcar um próximo passo, ele aparece aqui.'
                }
                acao={
                  <AcaoPrincipal href={d.contadores.pool > 0 ? `${raiz}/funil?estacao=disponiveis` : `${raiz}/funil`} icone={<ArrowRight />}>
                    {d.contadores.pool > 0 ? 'Ver disponíveis' : 'Ver o funil'}
                  </AcaoPrincipal>
                }
              />
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                {d.suaVez.map(item => {
                  const rotulo = rotuloDaAcao(item.acao)
                  return (
                    <li key={item.lead.id}>
                      <LinhaDaVez
                        item={{
                          id: item.lead.id,
                          nome: item.lead.nome,
                          etapa: item.lead.etapa,
                          motivo: item.motivo,
                          urgente: item.acao === 'atender' || Boolean(item.lead.proximoPassoInfo?.atrasado),
                        }}
                        acao={{ rotulo: item.acao === 'ligar' && !item.lead.telefone ? 'Cadastrar celular' : rotulo.texto, icone: rotulo.icone, onClick: () => void aoAcao(item), carregando: atendendo === item.lead.id }}
                        onAbrir={() => setAberto({ id: item.lead.id })}
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Sua semana" description="Comparada com a semana passada." className="lg:col-span-3">
            <NumerosDaSemana
              itens={[
                { rotulo: 'Contatos', ...d.semana.contatos },
                { rotulo: 'Respostas', ...d.semana.respostas },
                { rotulo: 'Reuniões', ...d.semana.reunioes },
                { rotulo: 'Vendas', ...d.semana.vendas },
              ]}
            />
          </SectionCard>

          <SectionCard
            title="Seu funil"
            description="Onde estão seus leads."
            className="lg:col-span-3"
            actions={
              <Link href={`${raiz}/funil`} className={cn('rounded text-sm font-semibold text-[#1E2A4A] hover:underline', FOCUS_RING)}>
                Abrir
              </Link>
            }
          >
            <div className="flex flex-col gap-4">
              <FunilDegraus
                orientacao="vertical"
                degraus={ETAPAS_DEGRAUS.map((etapa, i) => ({ rotulo: DEGRAUS_PADRAO[i] ?? etapa, valor: d.funil.contagem[etapa] ?? 0 }))}
              />
              <dl className="@container m-0 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">Conversão</dt>
                  <dd className="m-0 font-semibold tabular-nums">{formatarPercentual(d.funil.taxaConversao, 1)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="truncate text-xs text-muted-foreground">Em negociação</dt>
                  <dd className="m-0 font-semibold">
                    <ValorMoeda valor={d.funil.valorEmNegociacao} inteiro limite="xs" />
                  </dd>
                </div>
              </dl>
            </div>
          </SectionCard>

          {veEquipe(eu.papel) ? (
            <SectionCard
              title="Equipe online agora"
              description={d.equipeOnline.length === 0 ? 'Ninguém online neste momento.' : `${d.equipeOnline.length} ${d.equipeOnline.length === 1 ? 'pessoa' : 'pessoas'} atendendo.`}
              className="lg:col-span-12"
            >
              {d.equipeOnline.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">Enquanto ninguém estiver online, os leads novos ficam em Disponíveis.</p>
              ) : (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {d.equipeOnline.map(p => (
                    <li key={p.id} className={cn('inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-white px-3.5 text-sm', CARD_SHADOW)}>
                      <PresencaDot online />
                      <span className="font-medium">{p.nome}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ) : null}
        </div>
      )}

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
        aoFechar={() => setAberto(null)}
        aoAlterar={recarregarTudo}
      />
      <NovoLeadDialog
        aberto={novoAberto}
        aoFechar={() => setNovoAberto(false)}
        escopo={escopo}
        aoCriar={lead => {
          recarregarTudo()
          setAberto({ id: lead.id })
        }}
      />
    </Conteudo>
  )
}

function rotuloDaAcao(acao: VendasLinhaDaVez['acao']): { texto: string; icone: React.ReactNode } {
  switch (acao) {
    case 'atender':
      return { texto: 'Atender', icone: <UserCheck /> }
    case 'ligar':
      return { texto: 'Ligar', icone: <Phone /> }
    case 'registrar':
      return { texto: 'Registrar contato', icone: <NotebookPen /> }
    case 'enviar_proposta':
      return { texto: 'Enviar proposta', icone: <FileText /> }
  }
}

/** Card âmbar: só aparece quando há lead disponível parado ou próximo passo atrasado. */
function AvisoDoDia({ painel, raiz }: { painel: VendasPainelHoje; raiz: string }) {
  const parados = painel.contadores.poolParadoMais15min
  const atrasados = painel.contadores.proximosPassosAtrasados
  const frases = useMemo(() => {
    const f: string[] = []
    if (parados > 0) f.push(`${parados} ${parados === 1 ? 'lead disponível' : 'leads disponíveis'} há mais de 15 minutos sem ninguém atender`)
    if (atrasados > 0) f.push(`${atrasados} ${atrasados === 1 ? 'próximo passo atrasado' : 'próximos passos atrasados'}`)
    return f
  }, [parados, atrasados])
  if (frases.length === 0) return null
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-[#93370D]">
      <AlarmClock className="size-5 shrink-0" aria-hidden="true" />
      <p className="m-0 min-w-0 flex-1 text-sm font-medium">{frases.join(' · ')}.</p>
      <Link
        href={`${raiz}/funil${parados > 0 ? '?estacao=disponiveis' : '?estacao=andamento'}`}
        className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[#FEDF89] bg-white px-4 text-sm font-semibold hover:bg-[#FEF3DC]', FOCUS_RING)}
      >
        Ver leads <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  )
}

function CarregandoHoje() {
  return (
    <div role="status" aria-label="Carregando" className="grid gap-6 lg:grid-cols-12">
      <Skeleton className="h-80 rounded-2xl lg:col-span-6" />
      <Skeleton className="h-80 rounded-2xl lg:col-span-3" />
      <Skeleton className="h-80 rounded-2xl lg:col-span-3" />
    </div>
  )
}
