'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { PlatformUser } from '@/lib/types'
import { getPlatformUser, loginPlatformUser } from '@/lib/actions/platform-users'

const STORAGE_KEY = 'annetec_platform_session'

interface PlatformAuthContextType {
  user: PlatformUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  isAuthenticated: boolean
}

const PlatformAuthContext = createContext<PlatformAuthContextType | undefined>(undefined)

// Auth for the platform-level /admin panel (Annetec staff: superadmin /
// platform_admin). Fully separate session from any tenant's auth-context.
export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PlatformUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const storedUserId = localStorage.getItem(STORAGE_KEY)
    if (storedUserId) {
      getPlatformUser(storedUserId).then(result => {
        if (result.success && result.data) setUser(result.data)
        setIsLoading(false)
      })
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true)
    const result = await loginPlatformUser(email, password)
    if (!result.success) {
      setIsLoading(false)
      return { success: false, error: result.error }
    }
    setUser(result.data)
    localStorage.setItem(STORAGE_KEY, result.data.id)
    setIsLoading(false)
    router.push('/admin')
    return { success: true }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem(STORAGE_KEY)
    router.push('/admin/login')
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
