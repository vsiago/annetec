'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import type { MyClubAccess, MyClubMembership } from '@annetec/contracts'
import { getMyClubAccessAction, getMyClubMembershipAction } from '@/lib/actions/cliente-assinatura-api'
import { useAuth } from '@/contexts/auth-context'

/**
 * Assinatura do Clube do associado logado, lida UMA vez para o portal inteiro
 * (painel, carteirinha, dependentes, faturas e o menu) e atualizada sob
 * demanda — depois de um pagamento, por exemplo.
 *
 * `membership === null` depois da carga = a pessoa não assina o clube: cada
 * tela mantém o comportamento de antes (fallback).
 *
 * `access` diz se ela ainda precisa assinar (`none`/`pending_payment`) —
 * é a leitura FRESCA que o gate do portal usa para mandar ao onboarding
 * `/cliente/assinar` (ver `ClientSubscriptionGate`). Falha ao ler `access`
 * fica `null`, e o gate cai no `needsSubscription` da sessão.
 *
 * 401 em qualquer das duas leituras = a sessão caiu no servidor (associado
 * excluído/bloqueado, sessões derrubadas): o estado é zerado e o
 * AuthProvider encerra a sessão — o `ProtectedRoute` leva ao login.
 */
interface ClubMembershipContextValue {
  tenantSlug: string
  membership: MyClubMembership | null
  /** Situação frente à assinatura; `null` enquanto carrega ou se a leitura falhou. */
  access: MyClubAccess | null
  /** Primeira leitura ainda em andamento. */
  isLoading: boolean
  /** Alguma leitura (inclusive silenciosa) em andamento. */
  isRefreshing: boolean
  /** Mensagem da última leitura que falhou; `null` quando a última deu certo. */
  error: string | null
  refresh: () => Promise<void>
}

const FALLBACK: ClubMembershipContextValue = {
  tenantSlug: '',
  membership: null,
  access: null,
  isLoading: false,
  isRefreshing: false,
  error: null,
  refresh: async () => {},
}

const ClubMembershipContext = createContext<ClubMembershipContextValue | null>(null)

/** Ao voltar para a aba (ex.: depois de pagar o Pix no app do banco), relê se o dado tiver mais que isto. */
const REFRESH_ON_FOCUS_AFTER_MS = 15_000

export function ClubMembershipProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ tenant: string }>()
  const tenantSlug = params?.tenant ?? ''
  const { endSession } = useAuth()
  const [membership, setMembership] = useState<MyClubMembership | null>(null)
  const [access, setAccess] = useState<MyClubAccess | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const loadedAt = useRef(0)

  const refresh = useCallback(async () => {
    if (!tenantSlug) return
    if (inFlight.current) return inFlight.current

    const task = (async () => {
      setIsRefreshing(true)
      try {
        const [result, accessResult] = await Promise.all([
          getMyClubMembershipAction(tenantSlug),
          getMyClubAccessAction(tenantSlug),
        ])
        if ((!result.success && result.unauthorized) || (!accessResult.success && accessResult.unauthorized)) {
          setMembership(null)
          setAccess(null)
          setError(null)
          await endSession()
          return
        }
        if (accessResult.success) setAccess(accessResult.data)
        if (result.success) {
          setMembership(result.data)
          setError(null)
          loadedAt.current = Date.now()
        } else {
          setError(result.error)
        }
      } catch {
        // A própria server action não chegou ao servidor Next (rede caiu, deploy novo).
        setError('Não conseguimos falar com o servidor. Verifique sua conexão e tente novamente.')
      } finally {
        setIsRefreshing(false)
        setIsLoading(false)
      }
    })()

    inFlight.current = task
    try {
      await task
    } finally {
      inFlight.current = null
    }
  }, [tenantSlug, endSession])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt.current > REFRESH_ON_FOCUS_AFTER_MS) {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const value = useMemo<ClubMembershipContextValue>(
    () => ({ tenantSlug, membership, access, isLoading, isRefreshing, error, refresh }),
    [tenantSlug, membership, access, isLoading, isRefreshing, error, refresh],
  )

  return <ClubMembershipContext.Provider value={value}>{children}</ClubMembershipContext.Provider>
}

/** Fora do provider (não deveria acontecer no portal) devolve "sem assinatura" em vez de quebrar a tela. */
export function useClubMembership(): ClubMembershipContextValue {
  return useContext(ClubMembershipContext) ?? FALLBACK
}
