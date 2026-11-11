'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { ETAPA_LEAD_LABELS, type PapelComercial, type VendasAgente, type VendasEu, type VendasLead } from '@annetec/contracts'
import { LoadError, RefreshButton, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { FilterSelect } from '@/components/admin-platform/ui/table-controls'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  desempenhoAgenteAction,
  listAgentesAction,
  listLeadsDoAgenteAction,
  reatribuirLeadAction,
} from '@/lib/actions/vendas-rede-gestao-api'
import { mensagemDoErro } from '@/lib/vendas-rede/erros'
import { AcaoPrincipal } from '../ui/acao-principal'
import { AgenteCard, type AgenteResumo } from '../ui/agente-card'
import { EstadoVazio } from '../ui/estado-vazio'
import { AgenteDetalheSheet } from './agente-detalhe'
import { AgenteWizard } from './agente-wizard'
import { CabecalhoTela, PortaoDePapel, papeisCriaveis } from './comum'
import { useLookupsRede } from './lookups-rede'
import type { EscopoRede } from './tipos'

/**
 * Tela Equipe (supervisor; gerente e master também a enxergam): cards dos
 * vendedores com online, leads em andamento, ganhos no mês e meta, "Convidar
 * vendedor" e reatribuição de leads em lote de um vendedor para outro (ou de
 * volta ao pool). Uma ação principal: "Convidar vendedor".
 */

type Numeros = { emAndamento?: number; ganhosNoMes?: number }

export function EquipePage({ escopo }: { escopo: EscopoRede }) {
  return <PortaoDePapel escopo={escopo} tela="equipe">{eu => <EquipeConteudo escopo={escopo} eu={eu} />}</PortaoDePapel>
}

export function EquipeConteudo({ escopo, eu }: { escopo: EscopoRede; eu: VendasEu }) {
  const chave = escopo.kind === 'platform' ? 'platform' : escopo.slug
  const papel: PapelComercial = eu.papel
  const [equipeId, setEquipeId] = useState('all')
  const [versao, setVersao] = useState(0)
  const [numeros, setNumeros] = useState<Record<string, Numeros>>({})
  const [convidar, setConvidar] = useState(false)
  const [ficha, setFicha] = useState<string | null>(null)
  const [reatribuir, setReatribuir] = useState<VendasAgente | null>(null)
  const lookups = useLookupsRede(escopo, true)

  const lista = useConsoleData(
    () => listAgentesAction(escopo, { papel: 'vendedor', ...(equipeId !== 'all' ? { equipeId } : {}) }),
    [chave, equipeId, versao],
  )
  const vendedores = useMemo(() => lista.data?.items ?? [], [lista.data])

  // Números por vendedor (em andamento e ganhos no mês): uma consulta de cada por pessoa.
  useEffect(() => {
    let cancelado = false
    const alvos = vendedores.filter(v => v.ativo).slice(0, 40)
    if (alvos.length === 0) return
    void Promise.all(
      alvos.map(async v => {
        const [d, l] = await Promise.all([desempenhoAgenteAction(escopo, v.id, 'mes'), listLeadsDoAgenteAction(escopo, v.id, 'andamento')])
        return [v.id, { ganhosNoMes: d.success ? d.data.kpis.ganhos : undefined, emAndamento: l.success ? l.data.meta.total : undefined }] as const
      }),
    ).then(pares => {
      if (!cancelado) setNumeros(Object.fromEntries(pares))
    })
    return () => {
      cancelado = true
    }
  }, [escopo, vendedores])

  const equipesOpcoes = lookups.equipes.map(e => ({ value: e.id, label: e.nome }))
  const equipeUnica = lookups.equipes.length === 1 ? lookups.equipes[0] : undefined
  const podeConvidar = papeisCriaveis(papel).includes('vendedor')
  const metaPadrao = eu.config.metaMensalPadrao

  const cartoes = vendedores.map(v => {
    const resumo: AgenteResumo = {
      id: v.id,
      nome: v.nome,
      papel: v.papel,
      online: v.online && v.ativo,
      vinculo: v.ativo ? lookups.equipes.find(e => e.id === v.equipeId)?.nome : 'Desativado',
      emAndamento: numeros[v.id]?.emAndamento,
      ganhosNoMes: numeros[v.id]?.ganhosNoMes,
      metaMensal: v.metaMensal ?? (metaPadrao > 0 ? metaPadrao : undefined),
    }
    return { v, resumo }
  })
  const online = vendedores.filter(v => v.online && v.ativo).length

  const convite = (
    <AcaoPrincipal icone={<UserPlus />} onClick={() => setConvidar(true)}>
      Convidar vendedor
    </AcaoPrincipal>
  )

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoTela
        titulo="Equipe"
        descricao={
          vendedores.length > 0
            ? `${online} de ${vendedores.filter(v => v.ativo).length} vendedores online agora.`
            : 'Acompanhe quem está online, quantos leads cada vendedor atende e como ele está na meta do mês.'
        }
        acao={
          <>
            <RefreshButton loading={lista.loading} onClick={() => setVersao(v => v + 1)} />
            {podeConvidar && vendedores.length > 0 ? convite : null}
          </>
        }
      />

      {equipesOpcoes.length > 1 ? (
        <div className="flex flex-wrap items-center gap-3">
          <FilterSelect label="Equipe" value={equipeId} onChange={setEquipeId} allLabel="Todas as equipes" options={equipesOpcoes} />
        </div>
      ) : null}

      {lista.loading && !lista.data ? (
        <TableSkeleton rows={4} />
      ) : lista.error && !lista.data ? (
        <LoadError message={lista.error} onRetry={() => void lista.reload()} />
      ) : cartoes.length === 0 ? (
        <EstadoVazio
          ilustracao="equipe"
          moldura
          titulo="Nenhum vendedor na equipe ainda"
          descricao="Convide o primeiro vendedor: ele recebe o acesso por e-mail e já pode atender leads."
          acao={podeConvidar ? convite : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cartoes.map(({ v, resumo }) => (
            <AgenteCard
              key={v.id}
              agente={resumo}
              aoAbrir={() => setFicha(v.id)}
              acao={
                v.ativo ? (
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setReatribuir(v)}>
                    <ArrowRightLeft aria-hidden="true" />
                    Reatribuir leads
                  </Button>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      <AgenteDetalheSheet
        escopo={escopo}
        agenteId={ficha}
        papelDoUsuario={papel}
        aoFechar={() => setFicha(null)}
        aoAlterar={() => setVersao(v => v + 1)}
      />

      <AgenteWizard
        escopo={escopo}
        papelCriador={papel}
        corretoraDoCriador={eu.agente?.corretoraId}
        vinculoInicial={{ papel: 'vendedor', equipeId: equipeId !== 'all' ? equipeId : (equipeUnica?.id ?? null) }}
        titulo="Convidar vendedor"
        aberto={convidar}
        aoMudarAberto={setConvidar}
        aoCriar={() => setVersao(v => v + 1)}
      />

      <ReatribuirLeadsDialog
        escopo={escopo}
        de={reatribuir}
        destinos={vendedores.filter(v => v.ativo)}
        aoFechar={() => setReatribuir(null)}
        aoConcluir={() => setVersao(v => v + 1)}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reatribuição em lote
// ---------------------------------------------------------------------------

const POOL = '__pool'

export function ReatribuirLeadsDialog({
  escopo,
  de,
  destinos,
  aoFechar,
  aoConcluir,
}: {
  escopo: EscopoRede
  de: VendasAgente | null
  /** Quem pode receber (vendedores ativos). O dono atual é filtrado. */
  destinos: VendasAgente[]
  aoFechar: () => void
  aoConcluir: () => void
}) {
  const [leads, setLeads] = useState<VendasLead[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [destino, setDestino] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    if (!de) return
    setLeads(null)
    setErro(null)
    const [novos, andamento] = await Promise.all([listLeadsDoAgenteAction(escopo, de.id, 'novos'), listLeadsDoAgenteAction(escopo, de.id, 'andamento')])
    if (!novos.success || !andamento.success) {
      setErro((!novos.success ? novos.error : !andamento.success ? andamento.error : '') || 'Não foi possível carregar os leads.')
      return
    }
    const vistos = new Set<string>()
    const todos = [...novos.data.items, ...andamento.data.items].filter(l => (vistos.has(l.id) ? false : (vistos.add(l.id), true)))
    setLeads(todos)
  }, [escopo, de])

  useEffect(() => {
    setMarcados(new Set())
    setDestino('')
    if (de) void carregar()
  }, [de, carregar])

  const outros = destinos.filter(d => d.id !== de?.id)
  const todosMarcados = !!leads && leads.length > 0 && marcados.size === leads.length

  const alternar = (id: string) =>
    setMarcados(atual => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })

  const mover = async () => {
    if (!destino || marcados.size === 0) return
    setEnviando(true)
    const alvo = destino === POOL ? null : destino
    let feitos = 0
    let falhas = 0
    let ultimoErro = ''
    for (const id of marcados) {
      const r = await reatribuirLeadAction(escopo, id, alvo)
      if (r.success) feitos++
      else {
        falhas++
        ultimoErro = mensagemDoErro(r.code, r.error)
      }
    }
    setEnviando(false)
    const nomeDestino = alvo ? (outros.find(o => o.id === alvo)?.nome ?? 'o vendedor escolhido') : 'Disponíveis'
    if (feitos > 0) toast.success(`${feitos} ${feitos === 1 ? 'lead movido' : 'leads movidos'} para ${nomeDestino}.`)
    if (falhas > 0) toast.error(`${falhas} ${falhas === 1 ? 'lead não pôde ser movido' : 'leads não puderam ser movidos'}.`, { description: ultimoErro || undefined })
    if (feitos > 0) aoConcluir()
    if (falhas === 0) aoFechar()
    else void carregar()
  }

  return (
    <Dialog open={de !== null} onOpenChange={aberto => !aberto && !enviando && aoFechar()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Reatribuir leads de {de?.nome}</DialogTitle>
          <DialogDescription>Escolha os leads e para quem eles vão. Quem recebe passa a ser o responsável pelo lead.</DialogDescription>
        </DialogHeader>

        {erro ? (
          <LoadError message={erro} onRetry={() => void carregar()} framed={false} />
        ) : leads === null ? (
          <TableSkeleton rows={3} />
        ) : leads.length === 0 ? (
          <EstadoVazio ilustracao="funil" titulo="Nenhum lead em aberto" descricao={`${de?.nome ?? 'O vendedor'} não tem leads novos nem em andamento agora.`} className="py-6" />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={todosMarcados}
                  onCheckedChange={v => setMarcados(v === true ? new Set(leads.map(l => l.id)) : new Set())}
                  aria-label="Selecionar todos os leads"
                />
                Selecionar todos
              </label>
              <span className="text-sm text-muted-foreground" aria-live="polite">
                {marcados.size} de {leads.length} selecionados
              </span>
            </div>
            <ul className="m-0 max-h-64 list-none divide-y divide-border/60 overflow-y-auto rounded-xl border border-border p-0">
              {leads.map(l => (
                <li key={l.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[#F8F9FB]">
                    <Checkbox checked={marcados.has(l.id)} onCheckedChange={() => alternar(l.id)} aria-label={`Selecionar ${l.nome}`} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{l.nome}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[ETAPA_LEAD_LABELS[l.etapa], l.interessePlanoNome, l.cidade].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="destino-reatribuicao" className="text-sm font-medium">
                Mover para
              </label>
              <Select value={destino} onValueChange={setDestino}>
                <SelectTrigger id="destino-reatribuicao" className="w-full">
                  <SelectValue placeholder="Escolha o vendedor" />
                </SelectTrigger>
                <SelectContent>
                  {outros.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.nome}
                      {o.online ? ' · online' : ''}
                    </SelectItem>
                  ))}
                  <SelectItem value={POOL}>Liberar (volta para Disponíveis)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void mover()} disabled={enviando || marcados.size === 0 || !destino} className="gap-2">
            {enviando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRightLeft aria-hidden="true" />}
            {marcados.size > 0 ? `Mover ${marcados.size} ${marcados.size === 1 ? 'lead' : 'leads'}` : 'Mover leads'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
