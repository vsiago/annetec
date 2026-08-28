'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { SessionUser } from '@annetec/contracts'
import { loginAction, logoutAction, meAction } from '@/lib/actions/auth-api'

interface PlatformAuthContextType {
  user: SessionUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  isAuthenticated: boolean
}

const PlatformAuthContext = createContext<PlatformAuthContextType | undefined>(undefined)

/**
 * Auth do painel de plataforma (`/admin`, equipe Annetec: superadmin /
 * platform_admin). A sessão em si é do Better Auth — vive num cookie
 * httpOnly gravado pelas Server Actions em `lib/actions/auth-api.ts`; este
 * contexto só espelha o usuário autenticado em estado de cliente para a UI
 * (sidebar, guard de rota) não precisar de round-trip a cada render.
 */
export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    meAction().then(result => {
      if (cancelled) return
      // `scope !== 'platform'` cobre o caso de um cookie de sessão de
      // inquilino estar presente neste navegador — não conta como logado
      // aqui.
      if (result.success && result.data.scope === 'platform') {
        setUser(result.data)
      }
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true)
    const result = await loginAction({ email, password })
    if (!result.success) {
      setIsLoading(false)
      return { success: false, error: result.error }
    }
    setUser(result.data)
    setIsLoading(false)
    router.push('/admin')
    return { success: true }
  }

  const logout = () => {
    setUser(null)
    logoutAction().finally(() => router.push('/login'))
  }

  return (
    <PlatformAuthContext.Provider value={{ user, isLoading, login, logout, isAuthenticated: !!user }}>
      {children}
    </PlatformAuthContext.Provider>
  )
}

export function usePlatformAuth() {
  const context = useContext(PlatformAuthContext)
  if (context === undefined) {
    throw new Error('usePlatformAuth must be used within a PlatformAuthProvider')
  }
  return context
}
