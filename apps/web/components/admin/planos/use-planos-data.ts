'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BillingSettings, ClubPlan, ClubPlanStatsReport } from '@annetec/contracts'
import { getBillingSettingsAction } from '@/lib/actions/faturamento-api'
import { getClubPlanStatsAction, listClubPlansAction } from '@/lib/actions/planos-api'
import type { PlanosActionResult } from '@/lib/adapters/planos'

const FALHA_INESPERADA = 'Não foi possível carregar os dados. Verifique a conexão e tente novamente.'

export interface AsyncResult<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: (options?: { silent?: boolean }) => Promise<void>
  setData: (data: T | null) => void
}

/**
 * Resultado de uma server action com dado, erro e carregamento. Só a última
 * chamada escreve no estado: resposta atrasada de um filtro antigo é
 * descartada. `reload({ silent: true })` atualiza sem voltar ao esqueleto.
 */
export function useAsyncResult<T>(
  load: (() => Promise<PlanosActionResult<T>>) | null,
  deps: readonly unknown[],
): AsyncResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(load !== null)
  const sequence = useRef(0)
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    const current = loadRef.current
    const id = ++sequence.current
    if (!current) {
      setLoading(false)
      return
    }
    if (!options?.silent) setLoading(true)
    try {
      const result = await current()
      if (id !== sequence.current) return
      if (result.success) {
        setData(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
    } catch {
      if (id !== sequence.current) return
      setError(FALHA_INESPERADA)
    } finally {
      if (id === sequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    // As dependências são as do chamador (slug, filtros, página).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload, setData }
}

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/**
 * O que toda tela de Produtos e Planos precisa: os planos (ativos e inativos),
 * as estatísticas por plano e as formas de pagamento habilitadas no clube.
 * Cada um com erro próprio — estatística fora do ar não esconde a lista.
 */
export function usePlanosData(slug: string, options: { stats?: boolean; settings?: boolean } = {}) {
  const withStats = options.stats ?? true
  const withSettings = options.settings ?? true
  const plans = useAsyncResult<ClubPlan[]>(slug ? () => listClubPlansAction(slug) : null, [slug])
  const stats = useAsyncResult<ClubPlanStatsReport>(
    slug && withStats ? () => getClubPlanStatsAction(slug) : null,
    [slug, withStats],
  )
  const settings = useAsyncResult<BillingSettings>(
    slug && withSettings ? () => getBillingSettingsAction(slug) : null,
    [slug, withSettings],
  )
  return { plans, stats, settings }
}

/** Copia para a área de transferência; devolve se deu certo. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
