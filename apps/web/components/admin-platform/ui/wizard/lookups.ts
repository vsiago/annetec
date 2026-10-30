'use client'

import { useEffect, useRef, useState } from 'react'
import { onlyDigits } from '@annetec/contracts'

/**
 * Consultas automáticas que os assistentes compartilham.
 *
 * CEP: ViaCEP direto do navegador, como já fazem a contratação pública e o
 * checkout. Falha nunca bloqueia: o endereço continua digitável.
 */

export interface CepAddress {
  street: string
  neighborhood: string
  city: string
  state: string
}

async function fetchCep(cep: string, signal: AbortSignal): Promise<CepAddress | null> {
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal })
    if (!response.ok) return null
    const data = (await response.json()) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
    if (data.erro) return null
    return { street: data.logradouro ?? '', neighborhood: data.bairro ?? '', city: data.localidade ?? '', state: data.uf ?? '' }
  } catch {
    return null
  }
}

export type CepLookupState = 'idle' | 'loading' | 'found' | 'not-found'

const CEP_TIMEOUT_MS = 8000

/**
 * Busca o endereço quando o CEP fica com 8 números (e só quando ele muda).
 * `onFound` recebe o endereço — quem chama decide o que preencher.
 */
export function useCepLookup(cep: string, onFound: (address: CepAddress) => void): CepLookupState {
  const digits = onlyDigits(cep)
  const [state, setState] = useState<CepLookupState>('idle')
  const last = useRef(digits.length === 8 ? digits : '')
  const callback = useRef(onFound)
  callback.current = onFound

  useEffect(() => {
    if (digits.length !== 8) {
      if (digits.length < 8) last.current = ''
      setState('idle')
      return
    }
    if (digits === last.current) return
    last.current = digits
    const controller = new AbortController()
    let cancelled = false
    let done = false
    let guard: number | undefined
    setState('loading')
    const timer = window.setTimeout(() => {
      // ViaCEP fora do ar não pode deixar o "buscando" girando para sempre.
      guard = window.setTimeout(() => controller.abort(), CEP_TIMEOUT_MS)
      void fetchCep(digits, controller.signal).then(found => {
        window.clearTimeout(guard)
        done = true
        if (cancelled) return
        if (!found) {
          setState('not-found')
          return
        }
        setState('found')
        callback.current(found)
      })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      window.clearTimeout(guard)
      controller.abort()
      // Consulta interrompida antes de responder: o mesmo CEP pode ser consultado de novo.
      if (!done && last.current === digits) last.current = ''
    }
  }, [digits])

  return state
}
