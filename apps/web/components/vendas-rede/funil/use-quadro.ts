'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { EtapaLead, QuadroLeadsResposta, VendasLead } from '@annetec/contracts'
import { getQuadroLeadsAction, mudarEtapaAction } from '@/lib/actions/vendas-rede-api'
import type { EscopoVendas } from '@/lib/vendas-rede/escopo'
import type { FiltrosQuadro } from '@/lib/vendas-rede/tipos'

const POLLING_MS = 30_000
/** O provider da casca dispara este evento quando chega o aviso "Novo lead disponível" (SSE). */
export const EVENTO_LEAD_NOVO = 'vendas-rede:lead-novo'

export interface ResultadoMover {
  ok: boolean
  lead?: VendasLead
  erro?: string
  codigo?: string
}

/** Tira o card da coluna de origem e o põe no topo da coluna de destino (otimista), acertando contagens e somas. */
export function moverNoQuadro(dados: QuadroLeadsResposta, lead: VendasLead, para: EtapaLead): QuadroLeadsResposta {
  const valor = lead.valorEstimado ?? 0
  const atrasado = Boolean(lead.proximoPassoInfo?.atrasado)
  const agora = new Date().toISOString()
  const movido: VendasLead = { ...lead, etapa: para, etapaDesde: agora, updatedAt: agora }
  const etapas = dados.etapas.map(coluna => {
    let atual = coluna
    if (coluna.itens.some(i => i.id === lead.id)) {
      atual = {
        ...atual,
        itens: atual.itens.filter(i => i.id !== lead.id),
        total: Math.max(0, atual.total - 1),
        valor: Math.max(0, atual.valor - valor),
        atrasados: Math.max(0, atual.atrasados - (atrasado ? 1 : 0)),
      }
    }
    if (coluna.etapa === para) {
      atual = {
        ...atual,
        itens: [movido, ...atual.itens],
        total: atual.total + 1,
        valor: atual.valor + valor,
        atrasados: atual.atrasados + (atrasado ? 1 : 0),
      }
    }
    return atual
  })
  const fechados = { ...dados.fechados }
  if (para === 'ganho') {
    fechados.ganhos = { total: fechados.ganhos.total + 1, valor: fechados.ganhos.valor + valor }
    fechados.itens = [movido, ...fechados.itens.filter(i => i.id !== lead.id)]
  } else if (para === 'perdido') {
    fechados.perdidos = { total: fechados.perdidos.total + 1, valor: fechados.perdidos.valor + valor }
    fechados.itens = [movido, ...fechados.itens.filter(i => i.id !== lead.id)]
  }
  const abertas = etapas
  return {
    ...dados,
    etapas,
    fechados,
    resumo: {
      emAndamento: abertas.reduce((s, c) => s + c.total, 0),
      valorNegociacao: etapas.find(c => c.etapa === 'negociacao')?.valor ?? 0,
      valorAberto: abertas.reduce((s, c) => s + c.valor, 0),
      atrasados: abertas.reduce((s, c) => s + c.atrasados, 0),
    },
  }
}

/**
 * Dados do Funil em quadro: busca `GET /leads/quadro`, atualiza sozinho (a cada 30 s com a aba
 * visível, ao voltar para a aba e quando chega aviso de lead novo) e move cards de forma otimista
 * com volta ao estado anterior se a API recusar.
 */
export function useQuadro({
  escopo,
  filtros,
  aoGanhar,
  aoZerarAtrasados,
}: {
  escopo: EscopoVendas
  filtros: FiltrosQuadro
  /** Chamado quando um lead passa a Venda fechada (por ação ou por atualização de outra pessoa). */
  aoGanhar?: (lead: VendasLead) => void
  /** Chamado quando os atrasados vão de >0 para 0. */
  aoZerarAtrasados?: () => void
}) {
  const [dados, setDados] = useState<QuadroLeadsResposta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const sequencia = useRef(0)
  const ocupado = useRef(false)
  const ganhosConhecidos = useRef<Set<string> | null>(null)
  const atrasadosAntes = useRef<number | null>(null)
  const aoGanharRef = useRef(aoGanhar)
  aoGanharRef.current = aoGanhar
  const aoZerarRef = useRef(aoZerarAtrasados)
  aoZerarRef.current = aoZerarAtrasados
  const filtrosRef = useRef(filtros)
  filtrosRef.current = filtros
  const dadosRef = useRef<QuadroLeadsResposta | null>(null)
  dadosRef.current = dados

  const chaveEscopo = escopo.kind === 'tenant' ? `t:${escopo.slug}` : 'p'
  const chaveFiltros = JSON.stringify(filtros)

  const carregar = useCallback(
    async (modo: 'inicial' | 'silencioso' = 'silencioso') => {
      const id = ++sequencia.current
      if (modo === 'inicial') setCarregando(true)
      else setAtualizando(true)
      const r = await getQuadroLeadsAction(escopo, filtrosRef.current)
      if (id !== sequencia.current) return
      setCarregando(false)
      setAtualizando(false)
      if (!r.success) {
        // Atualização silenciosa que falha mantém o que já está na tela.
        if (modo === 'inicial' || !dadosRef.current) setErro(r.error)
        return
      }
      setErro(null)
      const novo = r.data
      // Vendas fechadas desde a última leitura (de qualquer pessoa): celebra uma vez.
      const idsGanhos = new Set(novo.fechados.itens.filter(l => l.etapa === 'ganho').map(l => l.id))
      if (ganhosConhecidos.current) {
        for (const lead of novo.fechados.itens) {
          if (lead.etapa === 'ganho' && !ganhosConhecidos.current.has(lead.id)) aoGanharRef.current?.(lead)
        }
      }
      ganhosConhecidos.current = idsGanhos
      if (atrasadosAntes.current !== null && atrasadosAntes.current > 0 && novo.resumo.atrasados === 0 && !filtrosRef.current.atrasados) {
        aoZerarRef.current?.()
      }
      atrasadosAntes.current = filtrosRef.current.atrasados ? atrasadosAntes.current : novo.resumo.atrasados
      setDados(novo)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chaveEscopo],
  )

  // Troca de escopo ou de filtro: nova leitura (a 1ª mostra o esqueleto; as outras mantêm o quadro).
  const primeira = useRef(true)
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false
      void carregar('inicial')
      return
    }
    void carregar('silencioso')
  }, [carregar, chaveFiltros])

  // Atualização automática.
  useEffect(() => {
    const atualizar = () => {
      if (document.visibilityState === 'visible' && !ocupado.current) void carregar('silencioso')
    }
    const timer = window.setInterval(atualizar, POLLING_MS)
    document.addEventListener('visibilitychange', atualizar)
    window.addEventListener(EVENTO_LEAD_NOVO, atualizar)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', atualizar)
      window.removeEventListener(EVENTO_LEAD_NOVO, atualizar)
    }
  }, [carregar])

  /** Pausa as leituras automáticas durante um arrasto ou uma gravação. */
  const pausar = useCallback((valor: boolean) => {
    ocupado.current = valor
  }, [])

  /** Move com atualização otimista; em erro, volta ao estado anterior e devolve o motivo. */
  const mover = useCallback(
    async (lead: VendasLead, para: EtapaLead, extras: { motivoPerda?: string; confirmar?: boolean } = {}): Promise<ResultadoMover> => {
      const anterior = dadosRef.current
      if (anterior) setDados(moverNoQuadro(anterior, lead, para))
      ocupado.current = true
      if (para === 'ganho') ganhosConhecidos.current?.add(lead.id)
      const r = await mudarEtapaAction(escopo, lead.id, {
        etapa: para,
        ...(extras.motivoPerda ? { motivoPerda: extras.motivoPerda } : {}),
        ...(extras.confirmar ? { confirmar: true } : {}),
      })
      ocupado.current = false
      if (!r.success) {
        if (para === 'ganho') ganhosConhecidos.current?.delete(lead.id)
        if (anterior) setDados(anterior)
        void carregar('silencioso')
        return { ok: false, erro: r.error, codigo: r.code }
      }
      void carregar('silencioso')
      return { ok: true, lead: r.data }
    },
    [escopo, carregar],
  )

  return { dados, carregando, atualizando, erro, recarregar: () => carregar('silencioso'), recarregarInicial: () => carregar('inicial'), mover, pausar }
}
