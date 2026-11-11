'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Building2, MousePointerClick, MoreHorizontal, Pencil, Plus, Store, Trash2, UserPlus, UsersRound } from 'lucide-react'
import {
  TIPO_UNIDADE_LABELS,
  type PapelComercial,
  type VendasArvoreAgente,
  type VendasArvoreCorretora,
  type VendasArvoreEquipe,
  type VendasArvoreRede,
  type VendasArvoreUnidade,
  type VendasEu,
} from '@annetec/contracts'
import { ConfirmDialog, LoadError, RefreshButton, TableSkeleton, runCommand, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useIsMobile } from '@/components/ui/use-mobile'
import {
  arvoreAction,
  removerCorretoraAction,
  removerEquipeAction,
  removerUnidadeAction,
  updateCorretoraAction,
  updateEquipeAction,
  updateUnidadeAction,
} from '@/lib/actions/vendas-rede-gestao-api'
import { AcaoPrincipal } from '../ui/acao-principal'
import { ArvoreRede, type NoCorretora, type NoEquipe, type NoUnidade } from '../ui/arvore-rede'
import { KpiGrid } from '../ui/kpi-grid'
import type { AgenteResumo } from '../ui/agente-card'
import { formatarCnpj, formatarCelular } from '../ui/mascaras'
import { AgenteDetalhe, AgenteDetalheSheet } from './agente-detalhe'
import { AgenteWizard, type VinculoInicial } from './agente-wizard'
import { CabecalhoTela, PortaoDePapel, papeisCriaveis } from './comum'
import { CorretoraWizard } from './corretora-wizard'
import { EditarCorretoraDialog, EditarEquipeDialog, EditarUnidadeDialog } from './editar-rede-dialogs'
import { EquipeWizard } from './equipe-wizard'
import type { EscopoRede } from './tipos'
import { UnidadeWizard } from './unidade-wizard'

/**
 * Tela Rede (gerente e master): a árvore Corretora, Unidades, Equipes e
 * Agentes, com painel lateral do item selecionado (ficha do agente ou dados
 * do nó, com as ações do papel) e os wizards de cadastro. Uma ação principal
 * por papel: "Nova corretora" (master) ou "Novo agente" (gerente); os demais
 * cadastros ficam no menu "Cadastrar".
 *
 * Exporta `RedePage` (com portão de papel) e `RedeConteudo` (sem portão, para
 * o console, que já sabe o papel).
 */

type Selecao =
  | { tipo: 'agente'; id: string }
  | { tipo: 'corretora'; id: string }
  | { tipo: 'unidade'; id: string }
  | { tipo: 'equipe'; id: string }

type Cadastro =
  | { tipo: 'corretora' }
  | { tipo: 'unidade'; corretoraId?: string | null }
  | { tipo: 'equipe'; corretoraId?: string | null; unidadeId?: string | null }
  | { tipo: 'agente'; vinculo?: VinculoInicial }

export function RedePage({ escopo }: { escopo: EscopoRede }) {
  return <PortaoDePapel escopo={escopo} tela="rede">{eu => <RedeConteudo escopo={escopo} eu={eu} />}</PortaoDePapel>
}

// ---------------------------------------------------------------------------
// Conversão da árvore da API para o formato do kit visual
// ---------------------------------------------------------------------------

function resumo(a: VendasArvoreAgente, vinculo?: string): AgenteResumo {
  return { id: a.id, nome: a.nome, papel: a.papel, online: a.online && a.ativo, vinculo: a.ativo ? vinculo : ['Desativado', vinculo].filter(Boolean).join(' · ') }
}

function converter(arvore: VendasArvoreRede) {
  const nomes = new Map<string, string>()
  const guardar = (lista: VendasArvoreAgente[]) => lista.forEach(a => nomes.set(a.id, a.nome))
  const equipesVistas = (e: VendasArvoreEquipe) => guardar(e.agentes)
  arvore.corretoras.forEach(c => {
    guardar(c.agentes)
    if (c.gerente) guardar([c.gerente])
    c.equipes.forEach(equipesVistas)
    c.unidades.forEach(u => {
      guardar(u.agentes)
      u.equipes.forEach(equipesVistas)
    })
  })
  arvore.unidadesProprias.forEach(u => {
    guardar(u.agentes)
    u.equipes.forEach(equipesVistas)
  })
  guardar(arvore.solos)

  const equipe = (e: VendasArvoreEquipe, contexto: string): NoEquipe => ({
    id: e.id,
    nome: e.status === 'inativa' ? `${e.nome} (inativa)` : e.nome,
    supervisor: e.supervisorAgenteId ? nomes.get(e.supervisorAgenteId) : undefined,
    agentes: e.agentes.map(a => resumo(a, contexto)),
  })

  const unidade = (u: VendasArvoreUnidade): NoUnidade => {
    const nasEquipes = new Set(u.equipes.flatMap(e => e.agentes.map(a => a.id)))
    return {
      id: u.id,
      nome: u.status === 'inativa' ? `${u.nome} (inativa)` : u.nome,
      endereco: [TIPO_UNIDADE_LABELS[u.tipo], u.endereco?.cidade].filter(Boolean).join(' · '),
      equipes: u.equipes.map(e => equipe(e, u.nome)),
      agentesDiretos: u.agentes.filter(a => !nasEquipes.has(a.id)).map(a => resumo(a, u.nome)),
    }
  }

  const corretoras: NoCorretora[] = arvore.corretoras.map(c => {
    const unidades = c.unidades.map(unidade)
    const emUnidade = new Set(c.unidades.flatMap(u => [...u.agentes.map(a => a.id), ...u.equipes.flatMap(e => e.agentes.map(a => a.id))]))
    const equipesSemUnidade = c.equipes.filter(e => !e.unidadeId)
    const nasEquipes = new Set(equipesSemUnidade.flatMap(e => e.agentes.map(a => a.id)))
    const diretos = [...(c.gerente ? [c.gerente] : []), ...c.agentes]
      .filter((a, i, todos) => todos.findIndex(x => x.id === a.id) === i)
      .filter(a => !emUnidade.has(a.id) && !nasEquipes.has(a.id))
    if (equipesSemUnidade.length > 0 || diretos.length > 0) {
      unidades.unshift({
        id: `__direto:${c.id}`,
        nome: 'Direto na corretora',
        endereco: 'Gerência, equipes e agentes sem unidade',
        equipes: equipesSemUnidade.map(e => equipe(e, c.nomeFantasia)),
        agentesDiretos: diretos.map(a => resumo(a, c.nomeFantasia)),
      })
    }
    return {
      id: c.id,
      nome: c.status === 'inativa' ? `${c.nomeFantasia} (inativa)` : c.nomeFantasia,
      cnpj: formatarCnpj(c.cnpj),
      gerente: c.gerente?.nome,
      unidades,
    }
  })

  return {
    corretoras,
    unidadesProprias: arvore.unidadesProprias.map(unidade),
    solos: arvore.solos.map(a => resumo(a)),
  }
}

// ---------------------------------------------------------------------------
// Conteúdo
// ---------------------------------------------------------------------------

export function RedeConteudo({ escopo, eu }: { escopo: EscopoRede; eu: VendasEu }) {
  const chave = escopo.kind === 'platform' ? 'platform' : escopo.slug
  const { data: arvore, error, loading, reload } = useConsoleData<VendasArvoreRede>(() => arvoreAction(escopo), [chave])
  const [selecao, setSelecao] = useState<Selecao | null>(null)
  const [cadastro, setCadastro] = useState<Cadastro | null>(null)
  const [ultimoCadastro, setUltimoCadastro] = useState<Cadastro | null>(null)
  const mobile = useIsMobile()

  const papel: PapelComercial = eu.papel
  const master = papel === 'master'
  const corretoraDoGerente = eu.agente?.corretoraId ?? null
  const dados = useMemo(() => (arvore ? converter(arvore) : null), [arvore])

  const abrir = (c: Cadastro) => {
    setUltimoCadastro(c)
    setCadastro(c)
  }
  const aoCadastrar = async () => {
    await reload({ silent: true })
  }

  const totais = useMemo(() => {
    if (!arvore) return null
    const agentes = new Map<string, VendasArvoreAgente>()
    const add = (l: VendasArvoreAgente[]) => l.forEach(a => agentes.set(a.id, a))
    arvore.corretoras.forEach(c => {
      add(c.agentes)
      c.unidades.forEach(u => {
        add(u.agentes)
        u.equipes.forEach(e => add(e.agentes))
      })
      c.equipes.forEach(e => add(e.agentes))
    })
    arvore.unidadesProprias.forEach(u => {
      add(u.agentes)
      u.equipes.forEach(e => add(e.agentes))
    })
    add(arvore.solos)
    const lista = [...agentes.values()].filter(a => a.ativo)
    const unidades = arvore.corretoras.reduce((n, c) => n + c.unidades.length, 0) + arvore.unidadesProprias.length
    const equipes = new Set([...arvore.corretoras.flatMap(c => [...c.equipes, ...c.unidades.flatMap(u => u.equipes)]), ...arvore.unidadesProprias.flatMap(u => u.equipes)].map(e => e.id)).size
    return { corretoras: arvore.corretoras.length, unidades, equipes, agentes: lista.length, online: lista.filter(a => a.online).length }
  }, [arvore])

  const principal = master ? (
    <AcaoPrincipal icone={<Building2 />} onClick={() => abrir({ tipo: 'corretora' })}>
      Nova corretora
    </AcaoPrincipal>
  ) : papeisCriaveis(papel).length > 0 ? (
    <AcaoPrincipal icone={<UserPlus />} onClick={() => abrir({ tipo: 'agente' })}>
      Novo agente
    </AcaoPrincipal>
  ) : null

  const menuCadastrar = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <Plus aria-hidden="true" />
          Cadastrar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => abrir({ tipo: 'unidade' })}>
          <Store aria-hidden="true" />
          Nova unidade
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => abrir({ tipo: 'equipe' })}>
          <UsersRound aria-hidden="true" />
          Nova equipe
        </DropdownMenuItem>
        {master ? (
          <DropdownMenuItem onSelect={() => abrir({ tipo: 'agente' })}>
            <UserPlus aria-hidden="true" />
            Novo agente
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const nosAcoes = (rotulo: string, onClick: () => void) => (
    <Button type="button" variant="ghost" size="sm" onClick={onClick} className="gap-1.5 text-[13px] font-semibold text-secondary">
      <MoreHorizontal aria-hidden="true" />
      {rotulo}
    </Button>
  )

  const painel = selecao ? (
    selecao.tipo === 'agente' ? (
      <AgenteDetalhe escopo={escopo} agenteId={selecao.id} papelDoUsuario={papel} aoAlterar={() => void reload({ silent: true })} />
    ) : arvore ? (
      <PainelNo
        escopo={escopo}
        arvore={arvore}
        selecao={selecao}
        papel={papel}
        abrir={abrir}
        aoEditar={() => void reload({ silent: true })}
        aoMudar={() => {
          setSelecao(null)
          void reload({ silent: true })
        }}
      />
    ) : null
  ) : null

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoTela
        titulo="Rede"
        descricao={
          master
            ? 'Corretoras parceiras, unidades, equipes e a força de vendas, do jeito que ela está organizada.'
            : 'Unidades, equipes e agentes da sua corretora.'
        }
        acao={
          <>
            <RefreshButton loading={loading} onClick={() => void reload({ silent: true })} />
            {menuCadastrar}
            {principal}
          </>
        }
      />

      {totais ? (
        <KpiGrid
          colunas={4}
          itens={[
            { rotulo: master ? 'Corretoras' : 'Unidades', valor: master ? totais.corretoras : totais.unidades, icone: Building2 },
            { rotulo: master ? 'Unidades' : 'Equipes', valor: master ? totais.unidades : totais.equipes, icone: Store },
            { rotulo: master ? 'Equipes' : 'Agentes ativos', valor: master ? totais.equipes : totais.agentes, icone: UsersRound },
            { rotulo: master ? 'Agentes ativos' : 'Online agora', valor: master ? totais.agentes : totais.online, tom: 'green', dica: master ? `${totais.online} online agora` : undefined },
          ]}
        />
      ) : null}

      {loading && !arvore ? (
        <TableSkeleton rows={6} />
      ) : !arvore || !dados ? (
        <LoadError message={error ?? 'Não foi possível carregar a rede.'} onRetry={() => void reload()} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
          <ArvoreRede
            corretoras={dados.corretoras}
            solos={dados.solos}
            unidadesProprias={dados.unidadesProprias}
            aoAbrirAgente={a => setSelecao({ tipo: 'agente', id: a.id })}
            acoes={{
              corretora: n => (n.id.startsWith('__') ? null : nosAcoes('Detalhes', () => setSelecao({ tipo: 'corretora', id: n.id }))),
              unidade: n => (n.id.startsWith('__') ? null : nosAcoes('Detalhes', () => setSelecao({ tipo: 'unidade', id: n.id }))),
              equipe: n => nosAcoes('Detalhes', () => setSelecao({ tipo: 'equipe', id: n.id })),
            }}
            acaoVazio={principal}
          />
          {!mobile ? (
            <aside aria-label="Item selecionado" className="lg:sticky lg:top-4">
              <SectionCard padded>
                {painel ?? (
                  <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <MousePointerClick className="size-6 text-muted-foreground" aria-hidden="true" />
                    <p className="m-0 text-sm font-semibold">Selecione alguém ou um grupo</p>
                    <p className="m-0 max-w-xs text-sm text-muted-foreground">
                      Clique no nome de um agente ou em “Detalhes” de uma corretora, unidade ou equipe para ver a ficha e as ações.
                    </p>
                  </div>
                )}
              </SectionCard>
            </aside>
          ) : null}
        </div>
      )}

      {mobile && selecao?.tipo === 'agente' ? (
        <AgenteDetalheSheet escopo={escopo} agenteId={selecao.id} papelDoUsuario={papel} aoFechar={() => setSelecao(null)} aoAlterar={() => void reload({ silent: true })} />
      ) : null}
      {mobile && selecao && selecao.tipo !== 'agente' && painel ? (
        <FolhaPainel aoFechar={() => setSelecao(null)}>{painel}</FolhaPainel>
      ) : null}

      <CorretoraWizard escopo={escopo} aberto={cadastro?.tipo === 'corretora'} aoMudarAberto={a => !a && setCadastro(null)} aoCriar={aoCadastrar} />
      <UnidadeWizard
        escopo={escopo}
        papelCriador={papel}
        corretoraDoCriador={corretoraDoGerente}
        corretoraInicial={ultimoCadastro?.tipo === 'unidade' ? ultimoCadastro.corretoraId : null}
        aberto={cadastro?.tipo === 'unidade'}
        aoMudarAberto={a => !a && setCadastro(null)}
        aoCriar={aoCadastrar}
      />
      <EquipeWizard
        escopo={escopo}
        papelCriador={papel}
        corretoraDoCriador={corretoraDoGerente}
        corretoraInicial={ultimoCadastro?.tipo === 'equipe' ? ultimoCadastro.corretoraId : null}
        unidadeInicial={ultimoCadastro?.tipo === 'equipe' ? ultimoCadastro.unidadeId : null}
        aberto={cadastro?.tipo === 'equipe'}
        aoMudarAberto={a => !a && setCadastro(null)}
        aoCriar={aoCadastrar}
      />
      <AgenteWizard
        escopo={escopo}
        papelCriador={papel}
        corretoraDoCriador={corretoraDoGerente}
        vinculoInicial={ultimoCadastro?.tipo === 'agente' ? ultimoCadastro.vinculo : undefined}
        aberto={cadastro?.tipo === 'agente'}
        aoMudarAberto={a => !a && setCadastro(null)}
        aoCriar={aoCadastrar}
      />
    </div>
  )
}


function FolhaPainel({ children, aoFechar }: { children: ReactNode; aoFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" role="dialog" aria-modal="true" aria-label="Detalhes do item" onClick={aoFechar}>
      <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5" onClick={e => e.stopPropagation()}>
        {children}
        <div className="mt-4">
          <Button type="button" variant="outline" className="w-full" onClick={aoFechar}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Painel de corretora, unidade e equipe
// ---------------------------------------------------------------------------

function Dado({ rotulo, children }: { rotulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="text-[13px] text-muted-foreground">{rotulo}</dt>
      <dd className="m-0 break-words text-sm font-medium">{children || <span className="font-normal italic text-muted-foreground">Não informado</span>}</dd>
    </div>
  )
}

function PainelNo({
  escopo,
  arvore,
  selecao,
  papel,
  abrir,
  aoEditar,
  aoMudar,
}: {
  escopo: EscopoRede
  arvore: VendasArvoreRede
  selecao: Exclude<Selecao, { tipo: 'agente' }>
  papel: PapelComercial
  abrir: (c: Cadastro) => void
  aoEditar: () => void
  aoMudar: () => void
}) {
  const [remover, setRemover] = useState(false)
  const [editando, setEditando] = useState(false)
  const master = papel === 'master'
  const salvou = () => {
    setEditando(false)
    aoEditar()
  }

  const todasUnidades = [...arvore.corretoras.flatMap(c => c.unidades.map(u => ({ u, c }))), ...arvore.unidadesProprias.map(u => ({ u, c: null as VendasArvoreCorretora | null }))]
  const todasEquipes = [
    ...arvore.corretoras.flatMap(c => [...c.equipes, ...c.unidades.flatMap(u => u.equipes)].map(e => ({ e, c }))),
    ...arvore.unidadesProprias.flatMap(u => u.equipes.map(e => ({ e, c: null as VendasArvoreCorretora | null }))),
  ]
  const agentePorId = new Map<string, VendasArvoreAgente>()
  const guardar = (l: VendasArvoreAgente[]) => l.forEach(a => agentePorId.set(a.id, a))
  arvore.corretoras.forEach(c => {
    guardar(c.agentes)
    c.unidades.forEach(u => {
      guardar(u.agentes)
      u.equipes.forEach(e => guardar(e.agentes))
    })
    c.equipes.forEach(e => guardar(e.agentes))
  })

  let titulo = ''
  let subtitulo = ''
  let ativo = true
  let corpo: ReactNode = null
  let acoes: ReactNode = null
  let confirmar: { titulo: string; texto: string; executar: () => Promise<boolean> } | null = null
  let editor: ReactNode = null
  let alternar: { rotulo: string; executar: () => Promise<boolean> } | null = null

  if (selecao.tipo === 'corretora') {
    const c = arvore.corretoras.find(x => x.id === selecao.id)
    if (!c) return <p className="m-0 text-sm text-muted-foreground">Este item não existe mais. Atualize a tela.</p>
    titulo = c.nomeFantasia
    subtitulo = 'Corretora'
    ativo = c.status === 'ativa'
    const e = c.endereco
    corpo = (
      <dl className="m-0 divide-y divide-border/60">
        <Dado rotulo="Razão social">{c.razaoSocial}</Dado>
        <Dado rotulo="CNPJ">{formatarCnpj(c.cnpj)}</Dado>
        <Dado rotulo="Gerente">{c.gerente?.nome}</Dado>
        <Dado rotulo="E-mail">{c.email}</Dado>
        <Dado rotulo="Telefone">{c.telefone ? formatarCelular(c.telefone) : ''}</Dado>
        <Dado rotulo="Endereço">{e ? [e.logradouro, e.numero, e.bairro, e.cidade, e.uf].filter(Boolean).join(', ') : ''}</Dado>
        <Dado rotulo="Estrutura">{`${c.unidades.length} unidades · ${c.equipes.length} equipes · ${c.agentes.length} agentes`}</Dado>
      </dl>
    )
    acoes = (
      <>
        <Button type="button" variant="outline" className="gap-2" onClick={() => abrir({ tipo: 'unidade', corretoraId: c.id })}>
          <Store aria-hidden="true" />
          Nova unidade
        </Button>
        <Button type="button" variant="outline" className="gap-2" onClick={() => abrir({ tipo: 'equipe', corretoraId: c.id })}>
          <UsersRound aria-hidden="true" />
          Nova equipe
        </Button>
        <Button type="button" variant="outline" className="gap-2" onClick={() => abrir({ tipo: 'agente', vinculo: { corretoraId: c.id, papel: 'vendedor' } })}>
          <UserPlus aria-hidden="true" />
          Novo agente
        </Button>
      </>
    )
    if (master) {
      editor = <EditarCorretoraDialog escopo={escopo} corretora={c} aoMudarAberto={a => !a && setEditando(false)} aoSalvar={salvou} />
      alternar = {
        rotulo: ativo ? 'Desativar corretora' : 'Reativar corretora',
        executar: async () => (await runCommand(updateCorretoraAction(escopo, c.id, { status: ativo ? 'inativa' : 'ativa' }), ativo ? `${c.nomeFantasia} foi desativada.` : `${c.nomeFantasia} foi reativada.`)) !== null,
      }
      confirmar = {
        titulo: `Remover ${c.nomeFantasia}?`,
        texto: 'Se a corretora já tem histórico (leads, comissões), ela é apenas desativada e continua nos relatórios. Sem histórico, é apagada de vez.',
        executar: async () => {
          const r = await runCommand(removerCorretoraAction(escopo, c.id))
          if (r) toast.success(r.resultado === 'removida' ? 'Corretora removida.' : 'Corretora desativada: ela tem histórico e foi mantida nos relatórios.')
          return r !== null
        },
      }
    }
  } else if (selecao.tipo === 'unidade') {
    const par = todasUnidades.find(x => x.u.id === selecao.id)
    if (!par) return <p className="m-0 text-sm text-muted-foreground">Este item não existe mais. Atualize a tela.</p>
    const { u, c } = par
    titulo = u.nome
    subtitulo = `${TIPO_UNIDADE_LABELS[u.tipo]}${c ? ` · ${c.nomeFantasia}` : ' · unidade própria'}`
    ativo = u.status === 'ativa'
    const e = u.endereco
    corpo = (
      <dl className="m-0 divide-y divide-border/60">
        <Dado rotulo="Tipo">{TIPO_UNIDADE_LABELS[u.tipo]}</Dado>
        <Dado rotulo="Pertence a">{c ? c.nomeFantasia : 'Escopo (unidade própria)'}</Dado>
        <Dado rotulo="Telefone">{u.telefone ? formatarCelular(u.telefone) : ''}</Dado>
        <Dado rotulo="Endereço">{e ? [e.logradouro, e.numero, e.bairro, e.cidade, e.uf].filter(Boolean).join(', ') : ''}</Dado>
        <Dado rotulo="Estrutura">{`${u.equipes.length} equipes · ${u.agentes.length} agentes`}</Dado>
      </dl>
    )
    acoes = (
      <>
        <Button type="button" variant="outline" className="gap-2" onClick={() => abrir({ tipo: 'equipe', corretoraId: u.corretoraId, unidadeId: u.id })}>
          <UsersRound aria-hidden="true" />
          Nova equipe
        </Button>
        <Button type="button" variant="outline" className="gap-2" onClick={() => abrir({ tipo: 'agente', vinculo: { unidadeId: u.id, corretoraId: u.corretoraId, papel: 'balcao' } })}>
          <UserPlus aria-hidden="true" />
          Novo atendente de balcão
        </Button>
      </>
    )
    editor = <EditarUnidadeDialog escopo={escopo} unidade={u} aoMudarAberto={a => !a && setEditando(false)} aoSalvar={salvou} />
    alternar = {
      rotulo: ativo ? 'Desativar unidade' : 'Reativar unidade',
      executar: async () => (await runCommand(updateUnidadeAction(escopo, u.id, { status: ativo ? 'inativa' : 'ativa' }), ativo ? `${u.nome} foi desativada.` : `${u.nome} foi reativada.`)) !== null,
    }
    confirmar = {
      titulo: `Remover ${u.nome}?`,
      texto: 'Com histórico (atendimentos, agentes), a unidade é apenas desativada. Sem histórico, é apagada.',
      executar: async () => {
        const r = await runCommand(removerUnidadeAction(escopo, u.id))
        if (r) toast.success(r.resultado === 'removida' ? 'Unidade removida.' : 'Unidade desativada: ela tem histórico e foi mantida.')
        return r !== null
      },
    }
  } else {
    const par = todasEquipes.find(x => x.e.id === selecao.id)
    if (!par) return <p className="m-0 text-sm text-muted-foreground">Este item não existe mais. Atualize a tela.</p>
    const { e, c } = par
    titulo = e.nome
    subtitulo = `Equipe${c ? ` · ${c.nomeFantasia}` : ''}`
    ativo = e.status === 'ativa'
    corpo = (
      <dl className="m-0 divide-y divide-border/60">
        <Dado rotulo="Supervisor">{e.supervisorAgenteId ? agentePorId.get(e.supervisorAgenteId)?.nome : ''}</Dado>
        <Dado rotulo="Corretora">{c?.nomeFantasia}</Dado>
        <Dado rotulo="Vendedores">{`${e.agentes.length}`}</Dado>
      </dl>
    )
    acoes = (
      <Button type="button" variant="outline" className="gap-2" onClick={() => abrir({ tipo: 'agente', vinculo: { equipeId: e.id, papel: 'vendedor' } })}>
        <UserPlus aria-hidden="true" />
        Novo vendedor nesta equipe
      </Button>
    )
    editor = <EditarEquipeDialog escopo={escopo} equipe={e} arvore={arvore} aoMudarAberto={a => !a && setEditando(false)} aoSalvar={salvou} />
    alternar = {
      rotulo: ativo ? 'Desativar equipe' : 'Reativar equipe',
      executar: async () => (await runCommand(updateEquipeAction(escopo, e.id, { status: ativo ? 'inativa' : 'ativa' }), ativo ? `${e.nome} foi desativada.` : `${e.nome} foi reativada.`)) !== null,
    }
    confirmar = {
      titulo: `Remover ${e.nome}?`,
      texto: 'Com vendedores ou histórico, a equipe é apenas desativada. Sem nada vinculado, é apagada.',
      executar: async () => {
        const r = await runCommand(removerEquipeAction(escopo, e.id))
        if (r) toast.success(r.resultado === 'removida' ? 'Equipe removida.' : 'Equipe desativada: ela tem histórico e foi mantida.')
        return r !== null
      },
    }
  }

  const gerencia = master || papel === 'gerente'
  const podeEditar = editor !== null && (selecao.tipo === 'corretora' ? master : gerencia)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-lg font-bold leading-tight">{titulo}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{subtitulo}</span>
          <StatusPill tone={ativo ? 'success' : 'neutral'}>{ativo ? 'Ativa' : 'Inativa'}</StatusPill>
        </div>
      </div>
      {corpo}
      <div className="flex flex-col gap-2">
        {podeEditar ? (
          <Button type="button" variant="outline" className="gap-2" onClick={() => setEditando(true)}>
            <Pencil aria-hidden="true" />
            Editar
          </Button>
        ) : null}
        {acoes}
      </div>
      {gerencia && (alternar || confirmar) ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {alternar ? (
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                if (await alternar.executar()) aoMudar()
              }}
            >
              {alternar.rotulo}
            </Button>
          ) : null}
          {confirmar ? (
            <Button type="button" variant="ghost" className="gap-2 text-[#B42318] hover:text-[#B42318]" onClick={() => setRemover(true)}>
              <Trash2 aria-hidden="true" />
              Remover
            </Button>
          ) : null}
        </div>
      ) : null}
      {podeEditar && editando ? editor : null}
      {confirmar ? (
        <ConfirmDialog
          open={remover}
          onOpenChange={setRemover}
          title={confirmar.titulo}
          description={confirmar.texto}
          confirmLabel="Remover"
          destructive
          onConfirm={async () => {
            const ok = await confirmar.executar()
            if (ok) aoMudar()
            return ok
          }}
        />
      ) : null}
    </div>
  )
}


