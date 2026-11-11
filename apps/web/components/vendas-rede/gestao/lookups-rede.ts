'use client'

import { useMemo } from 'react'
import type { PapelComercial, VendasArvoreAgente, VendasArvoreEquipe, VendasArvoreRede, VendasArvoreUnidade } from '@annetec/contracts'
import { useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { arvoreAction } from '@/lib/actions/vendas-rede-gestao-api'
import type { EscopoRede } from './tipos'

/**
 * Listas planas derivadas da árvore da rede, para os seletores dos cadastros
 * (corretora, unidade, equipe, supervisor). Carrega sob demanda: com
 * `ativo = false` não chama a API.
 */

export type OpcaoCorretora = { id: string; nome: string; ativa: boolean }
export type OpcaoUnidade = { id: string; nome: string; corretoraId: string | null; corretoraNome: string | null }
export type OpcaoEquipe = {
  id: string
  nome: string
  corretoraId: string | null
  unidadeId: string | null
  supervisorAgenteId: string | null
  rotulo: string
}
export type OpcaoAgente = { id: string; nome: string; papel: PapelComercial; corretoraId: string | null; ativo: boolean }

export type LookupsRede = {
  arvore: VendasArvoreRede | null
  corretoras: OpcaoCorretora[]
  unidades: OpcaoUnidade[]
  equipes: OpcaoEquipe[]
  agentes: OpcaoAgente[]
  carregando: boolean
  erro: string | null
  recarregar: () => void
}

export function derivarLookups(arvore: VendasArvoreRede | null): Omit<LookupsRede, 'carregando' | 'erro' | 'recarregar' | 'arvore'> {
  if (!arvore) return { corretoras: [], unidades: [], equipes: [], agentes: [] }

  const corretoras: OpcaoCorretora[] = arvore.corretoras.map(c => ({ id: c.id, nome: c.nomeFantasia, ativa: c.status === 'ativa' }))

  const unidades = new Map<string, OpcaoUnidade>()
  const equipes = new Map<string, OpcaoEquipe>()
  const agentes = new Map<string, OpcaoAgente>()

  const addAgentes = (lista: VendasArvoreAgente[]) =>
    lista.forEach(a =>
      agentes.set(a.id, { id: a.id, nome: a.nome, papel: a.papel, corretoraId: a.corretoraId, ativo: a.ativo }),
    )
  const addEquipe = (e: VendasArvoreEquipe, contexto: string | null) => {
    equipes.set(e.id, {
      id: e.id,
      nome: e.nome,
      corretoraId: e.corretoraId,
      unidadeId: e.unidadeId,
      supervisorAgenteId: e.supervisorAgenteId,
      rotulo: contexto ? `${e.nome} · ${contexto}` : e.nome,
    })
    addAgentes(e.agentes)
  }
  const addUnidade = (u: VendasArvoreUnidade, corretoraNome: string | null) => {
    unidades.set(u.id, { id: u.id, nome: u.nome, corretoraId: u.corretoraId, corretoraNome })
    u.equipes.forEach(e => addEquipe(e, corretoraNome ? `${corretoraNome} / ${u.nome}` : u.nome))
    addAgentes(u.agentes)
  }

  for (const c of arvore.corretoras) {
    c.unidades.forEach(u => addUnidade(u, c.nomeFantasia))
    c.equipes.forEach(e => {
      if (!equipes.has(e.id)) addEquipe(e, c.nomeFantasia)
    })
    addAgentes(c.agentes)
    if (c.gerente) addAgentes([c.gerente])
  }
  arvore.unidadesProprias.forEach(u => addUnidade(u, null))
  addAgentes(arvore.solos)

  return { corretoras, unidades: [...unidades.values()], equipes: [...equipes.values()], agentes: [...agentes.values()] }
}

export function useLookupsRede(escopo: EscopoRede, ativo: boolean): LookupsRede {
  const chave = escopo.kind === 'platform' ? 'platform' : escopo.slug
  const { data, loading, error, reload } = useConsoleData<VendasArvoreRede>(ativo ? () => arvoreAction(escopo) : null, [chave, ativo])
  const derivado = useMemo(() => derivarLookups(data), [data])
  return { arvore: data, ...derivado, carregando: loading && !data, erro: error, recarregar: () => void reload() }
}
