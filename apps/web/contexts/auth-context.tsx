'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { User, Seller, Client, UserRole } from '@/lib/types'
import { useTenant } from './tenant-context'
import { getUserById, loginTenantUser, getRoleRedirectPath } from '@/lib/actions/tenant-users'

type TenantUser = User | Seller | Client

interface AuthContextType {
  user: TenantUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Tenant-scoped auth (admin/seller/client of a single tenant). Must be
// rendered under TenantProvider — the session is scoped per-tenant so a
// login on /clinica-vida/... never leaks into /annetec/....
export function AuthProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant()
  const [user, setUser] = useState<TenantUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const storageKey = tenant ? `annetec_session_${tenant.id}` : null

  useEffect(() => {
    if (!storageKey) return
    const storedUserId = localStorage.getItem(storageKey)
    if (storedUserId) {
      getUserById(storedUserId).then(result => {
        // Re-check tenant ownership: the stored id could point at a user that
        // was deleted, or that belongs to another tenant if the key was
        // tampered with. Never restore a session across tenant boundaries.
        if (result.success && result.data && result.data.tenantId === tenant?.id) {
          setUser(result.data)
        } else {
          localStorage.removeItem(storageKey)
          setUser(null)
        }
        setIsLoading(false)
      })
    } else {
      setUser(null)
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (!tenant || !storageKey) {
      return { success: false, error: 'Inquilino não carregado' }
    }
    setIsLoading(true)
    const result = await loginTenantUser(tenant.id, email, password)
    if (!result.success) {
      setIsLoading(false)
      return { success: false, error: result.error }
    }

    setUser(result.data)
    localStorage.setItem(storageKey, result.data.id)
    setIsLoading(false)
    router.push(getRoleRedirectPath(tenant.slug, result.data.role))
    return { success: true }
  }

  const logout = () => {
    setUser(null)
    if (storageKey) localStorage.removeItem(storageKey)
    if (tenant) router.push(`/${tenant.slug}/login`)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function getRedirectPath(tenantSlug: string, role: UserRole): string {
  return getRoleRedirectPath(tenantSlug, role)
}
