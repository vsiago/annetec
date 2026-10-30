'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { PlatformSeller } from '@annetec/contracts'
import { getSellerProfileAction } from '@/lib/actions/vendas-api'

/**
 * Perfil do vendedor ANNETEC logado (`GET /platform/vendas/perfil`): código de
 * indicação, meta e se o perfil está ativo. Carrega uma vez na área
 * `/vendas` — o menu, o "Meu link" e os botões de escrita leem daqui.
 *
 * Perfil INATIVO só consulta o próprio histórico: a área esconde/desativa
 * cadastrar prospect, gerar link e pedir desconto (a API recusa com 403 do
 * mesmo jeito).
 */

interface SellerProfileContextValue {
  profile: PlatformSeller | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** Pode cadastrar, mover etapa, gerar link e pedir desconto. */
  canWrite: boolean
}

const SellerProfileContext = createContext<SellerProfileContextValue | null>(null)

export function SellerProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<PlatformSeller | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getSellerProfileAction()
      if (result.success) {
        setProfile(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
    } catch {
      setError('Não foi possível carregar o seu perfil de vendedor. Verifique a conexão e tente de novo.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <SellerProfileContext.Provider value={{ profile, loading, error, reload, canWrite: profile?.active ?? false }}>
      {children}
    </SellerProfileContext.Provider>
  )
}

export function useSellerProfile(): SellerProfileContextValue {
  const context = useContext(SellerProfileContext)
  if (!context) throw new Error('useSellerProfile precisa estar dentro de SellerProfileProvider (área /vendas)')
  return context
}

/** `https://site/contratar?ref=codigo` com a origem do site atual (o mesmo domínio que o vendedor está usando). */
export function absoluteReferralUrl(profile: Pick<PlatformSeller, 'referralCode' | 'referralUrl'> | null): string {
  if (!profile) return ''
  if (typeof window === 'undefined') return profile.referralUrl
  return `${window.location.origin}/contratar?ref=${encodeURIComponent(profile.referralCode)}`
}
