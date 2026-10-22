'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FaturamentoActionResult as ActionResult } from '@/lib/adapters/faturamento'

const FALHA_INESPERADA = 'Não foi possível carregar os dados. Verifique a conexão e tente novamente.'

/**
 * Carrega o resultado de uma server action e guarda dado, erro e estado de
 * carregamento. Resposta atrasada de uma busca antiga (a pessoa trocou o
 * filtro no meio) é descartada — só a última chamada escreve no estado.
 *
 * `reload({ silent: true })` atualiza sem voltar ao esqueleto: a tabela
 * continua na tela enquanto a nova página chega.
 */
export function useActionData<T>(
  load: (() => Promise<ActionResult<T>>) | null,
  deps: readonly unknown[],
) {
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
    // As dependências são as do chamador (filtros, página, versão).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload, setData }
}

/** Copia para a área de transferência; devolve se deu certo. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
