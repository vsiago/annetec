'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { isValidCnpj, onlyDigits, type PlatformPlanOffer, type PublicCnpjLookupResponse } from '@annetec/contracts'
import { getPlatformOffersAction, lookupCnpjAction } from '@/lib/actions/contratacao-api'
import type { Outcome } from '@/lib/adapters/contratacao'

const FALHA = 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.'

/**
 * Chama a server action sem deixar exceção escapar: se o servidor Next caiu
 * no meio (a action nem chega a devolver `ActionResult`), vira uma falha com
 * frase clara em vez de promessa rejeitada sem tratamento.
 */
export async function safeAction<T>(fn: () => Promise<Outcome<T>>): Promise<Outcome<T>> {
  try {
    return await fn()
  } catch {
    return { success: false, error: FALHA }
  }
}

/** Planos da contratação pública (uma vez por tela). */
export function usePlatformOffers() {
  const [offers, setOffers] = useState<PlatformPlanOffer[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getPlatformOffersAction()
      if (result.success) {
        setOffers(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
    } catch {
      setError(FALHA)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { offers, error, loading, reload }
}

export type CnpjLookupState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; response: PublicCnpjLookupResponse }
  | { state: 'error'; message: string }

/**
 * Consulta a Receita assim que o CNPJ fica completo e válido (com pequena
 * espera para não disparar a cada tecla). Resposta de um CNPJ antigo é
 * descartada.
 */
export function useCnpjLookup(cnpj: string) {
  const digits = onlyDigits(cnpj)
  const [lookup, setLookup] = useState<CnpjLookupState>({ state: 'idle' })
  const sequence = useRef(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const id = ++sequence.current
    if (digits.length !== 14 || !isValidCnpj(digits)) {
      setLookup({ state: 'idle' })
      return
    }
    setLookup({ state: 'loading' })
    const timer = window.setTimeout(async () => {
      try {
        const result = await lookupCnpjAction(digits)
        if (id !== sequence.current) return
        setLookup(result.success ? { state: 'done', response: result.data } : { state: 'error', message: result.error })
      } catch {
        if (id === sequence.current) setLookup({ state: 'error', message: FALHA })
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [digits, attempt])

  const retry = useCallback(() => setAttempt(value => value + 1), [])
  return { lookup, retry }
}

/**
 * Executa `callback` a cada `intervalMs` enquanto `enabled` e a aba estiver
 * visível; volta a checar na hora quando a aba ganha foco.
 */
export function usePolling(callback: () => void | Promise<void>, intervalMs: number, enabled: boolean) {
  const saved = useRef(callback)
  saved.current = callback

  useEffect(() => {
    if (!enabled) return
    let running = false
    const tick = async () => {
      if (running || document.visibilityState !== 'visible') return
      running = true
      try {
        await saved.current()
      } finally {
        running = false
      }
    }
    const timer = window.setInterval(() => void tick(), intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, intervalMs])
}
