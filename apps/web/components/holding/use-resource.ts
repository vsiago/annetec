'use client'

import { useCallback, useRef, useState } from 'react'

/** Mesmo formato do `ActionResult` das Server Actions (sem importar o módulo server-only). */
export type LoaderResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export interface Resource<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/**
 * Estado de uma leitura: mantém o dado anterior durante a nova busca (a tela
 * esmaece em vez de piscar esqueleto) e descarta resposta velha quando outra
 * busca começou depois (troca rápida de período/nível).
 */
export function useResource<T>() {
  const [state, setState] = useState<Resource<T>>({ data: null, error: null, loading: true })
  const sequence = useRef(0)

  const load = useCallback(async (loader: () => Promise<LoaderResult<T>>) => {
    const id = ++sequence.current
    setState(current => ({ ...current, loading: true }))
    const result = await loader()
    if (id !== sequence.current) return
    setState(current =>
      result.success
        ? { data: result.data, error: null, loading: false }
        : { data: current.data, error: result.error, loading: false },
    )
  }, [])

  const replace = useCallback((data: T) => {
    sequence.current += 1
    setState({ data, error: null, loading: false })
  }, [])

  return [state, load, replace] as const
}
