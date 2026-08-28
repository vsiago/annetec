'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { SessionUser } from '@annetec/contracts'
import type { User, UserRole } from '@/lib/types'
import { useTenant } from './tenant-context'
import { loginAction, logoutAction, meAction } from '@/lib/actions/auth-api'
import { getRoleRedirectPath } from '@/lib/actions/tenant-users'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Auth escopado ao inquilino (admin/vendedor deste `/[tenant]/...`).
 *
 * A sessão em si é uma só (o cookie do Better Auth, global — ver
 * `lib/api/session.ts`), não uma por inquilino: por isso toda leitura aqui
 * confere se `tenantSlug` da sessão bate com o inquilino da URL atual antes
 * de considerar autenticado. Uma conta logada no inquilino A nunca aparece
 * autenticada em `/[tenant-b]/...`, mesmo com o cookie presente.
 *
 * Associados (papel `client`) não têm senha — entram pelo portal em `/login`
 * (CPF + e-mail); uma vez logados, chegam aqui já com sessão válida e esta
 * tela só precisa reconhecê-la, não pedir login de novo.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const loadSession = useCallback(async () => {
    if (!tenant) return
    setIsLoading(true)
    const result = await meAction()
    if (result.success && result.data.scope === 'tenant' && result.data.tenantSlug === tenant.slug) {
      setUser(toLegacyUser(result.data))
    } else {
      setUser(null)
    }
    setIsLoading(false)
  }, [tenant])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (!tenant) {
      return { success: false, error: 'Inquilino não carregado' }
    }
    setIsLoading(true)
    const result = await loginAction({ email, password, tenantSlug: tenant.slug })
    if (!result.success) {
      setIsLoading(false)
      return { success: false, error: result.error }
    }
    if (result.data.scope !== 'tenant' || result.data.tenantSlug !== tenant.slug) {
      // Conta existe mas não tem vínculo de admin/vendedor com ESTE
      // inquilino (é da plataforma, ou é admin/vendedor de outro clube).
      await logoutAction()
      setIsLoading(false)
      return { success: false, error: 'Esta conta não tem acesso a este inquilino' }
    }

    setUser(toLegacyUser(result.data))
    setIsLoading(false)
    router.push(getRoleRedirectPath(tenant.slug, result.data.tenantRole as UserRole))
    return { success: true }
  }

  const logout = () => {
    setUser(null)
    void logoutAction()
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

function toLegacyUser(sessionUser: SessionUser): User {
  return {
    id: sessionUser.id,
    tenantId: sessionUser.tenantId!,
    name: sessionUser.name,
    email: sessionUser.email,
    role: sessionUser.tenantRole as UserRole,
    avatar: sessionUser.avatarUrl ?? undefined,
    // A sessão não carrega a data de criação da conta — nenhuma tela lê este
    // campo a partir do usuário logado (só da listagem de usuários, que vem
    // de tenant-users-api.ts com o valor real).
    createdAt: new Date(),
  }
}
