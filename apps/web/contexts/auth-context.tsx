'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { SessionUser } from '@annetec/contracts'
import type { User, UserRole } from '@/lib/types'
import { useTenant } from './tenant-context'
import {
  clearLocalSessionAction,
  loginAction,
  loginClientPortalAction,
  loginGoogleAction,
  logoutAction,
  meAction,
  refreshSessionAction,
} from '@/lib/actions/auth-api'
import { getRoleRedirectPath, tenantLoginPath } from '@/lib/auth/redirect'
import type { ActionResult } from '@/lib/actions/_api-result'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  /** Associado sem senha: CPF + e-mail (portal do associado), já neste inquilino. */
  loginPortal: (cpf: string, email: string) => Promise<{ success: boolean; error?: string }>
  /**
   * Login com Google: `idToken` é o `credential` do Google Identity Services.
   * `redirect: false` abre a sessão e fica na tela atual (checkout).
   */
  loginGoogle: (
    idToken: string,
    options?: { redirect?: boolean },
  ) => Promise<{ success: boolean; error?: string; role?: UserRole }>
  logout: () => void
  /** Encerra a sessão sem sair da tela atual (ex.: "Trocar conta" no checkout). */
  logoutInPlace: () => Promise<void>
  isAuthenticated: boolean
  /** Esta sessão foi aberta por um superadmin via "Entrar como" (aba Acessos), não por login normal. */
  isImpersonating: boolean
  /**
   * A sessão caiu no servidor (401 — derrubada, expirada, vínculo com o clube
   * inativo). O `ProtectedRoute` leva ao login com `?motivo=sessao-encerrada`.
   */
  sessionEnded: boolean
  /**
   * Trata um 401 vindo de qualquer chamada: limpa o cookie (sem chamar a API),
   * zera o usuário e marca `sessionEnded`. Não navega sozinho — quem está
   * numa área protegida é levado ao login pelo `ProtectedRoute`; numa página
   * pública (landing, checkout) a pessoa só passa a ser visitante.
   */
  endSession: () => Promise<void>
  /**
   * Relê `/auth/me` e regrava o cookie da sessão, sem o `isLoading` global
   * (que desmontaria a tela). Usado depois do pagamento da assinatura, para
   * `needsSubscription` deixar de valer no portal.
   */
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Auth escopado ao inquilino (admin/vendedor/associado deste `/[tenant]/...`).
 *
 * A sessão em si é uma só (o cookie do Better Auth, global — ver
 * `lib/api/session.ts`), não uma por inquilino: por isso toda leitura aqui
 * confere se `tenantSlug` da sessão bate com o inquilino da URL atual antes
 * de considerar autenticado. Uma conta logada no inquilino A nunca aparece
 * autenticada em `/[tenant-b]/...`, mesmo com o cookie presente.
 *
 * Associados (papel `client`) entram pela mesma tela `/[tenant]/login`: com
 * senha, se a conta tiver uma (`login`), ou por CPF + e-mail no portal do
 * associado (`loginPortal`), se não tiver.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { tenant } = useTenant()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isImpersonating, setIsImpersonating] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)
  const router = useRouter()

  const endSession = useCallback(async () => {
    setUser(null)
    setIsImpersonating(false)
    setSessionEnded(true)
    setIsLoading(false)
    // Falha ao apagar o cookie não pode prender a pessoa numa tela logada:
    // o estado já foi zerado acima, e o próximo `/auth/me` dá 401 de novo.
    await clearLocalSessionAction().catch(() => null)
  }, [])

  const loadSession = useCallback(async () => {
    if (!tenant) return
    setIsLoading(true)
    const result = await meAction()
    if (!result.success && result.unauthorized) {
      await endSession()
      return
    }
    if (result.success && result.data.scope === 'tenant' && result.data.tenantSlug === tenant.slug) {
      setUser(toLegacyUser(result.data))
      setIsImpersonating(result.data.impersonatedBy !== null)
    } else {
      setUser(null)
      setIsImpersonating(false)
    }
    setIsLoading(false)
  }, [tenant, endSession])

  const refreshSession = useCallback(async () => {
    if (!tenant) return
    const result = await refreshSessionAction().catch(() => null)
    if (!result) return
    if (!result.success) {
      if (result.unauthorized) await endSession()
      return
    }
    if (result.data.scope === 'tenant' && result.data.tenantSlug === tenant.slug) {
      setUser(toLegacyUser(result.data))
      setIsImpersonating(result.data.impersonatedBy !== null)
    }
  }, [tenant, endSession])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  /**
   * Passo comum a `login` e `loginPortal`: confere se a sessão aberta é deste
   * inquilino e leva a pessoa para a área do papel dela.
   */
  const completeLogin = async (
    tenantSlug: string,
    result: ActionResult<SessionUser>,
    redirect = true,
  ): Promise<{ success: boolean; error?: string; role?: UserRole }> => {
    if (!result.success) {
      // Login recusado não pode deixar para trás a sessão de antes (outra
      // conta, outra aba, impersonação): revoga, limpa o cookie e mostra o
      // erro — a tela nunca segue logada como outra pessoa.
      await logoutAction()
      setUser(null)
      setIsImpersonating(false)
      setIsLoading(false)
      return { success: false, error: result.error }
    }
    if (result.data.scope !== 'tenant' || result.data.tenantSlug !== tenantSlug) {
      // Conta existe mas não tem vínculo com ESTE inquilino (é da
      // plataforma, ou é de outro clube).
      await logoutAction()
      setUser(null)
      setIsImpersonating(false)
      setIsLoading(false)
      return { success: false, error: 'Esta conta não tem acesso a este inquilino' }
    }

    setUser(toLegacyUser(result.data))
    setIsImpersonating(result.data.impersonatedBy !== null)
    setSessionEnded(false)
    setIsLoading(false)
    if (redirect) {
      router.push(
        getRoleRedirectPath(tenantSlug, result.data.tenantRole as UserRole, {
          needsSubscription: result.data.needsSubscription === true,
          salesRole: result.data.salesRole ?? null,
        }),
      )
    }
    return { success: true, role: result.data.tenantRole as UserRole }
  }

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    if (!tenant) {
      return { success: false, error: 'Inquilino não carregado' }
    }
    setIsLoading(true)
    const result = await loginAction({ email, password, tenantSlug: tenant.slug })
    return completeLogin(tenant.slug, result)
  }

  const loginPortal = async (cpf: string, email: string): Promise<{ success: boolean; error?: string }> => {
    if (!tenant) {
      return { success: false, error: 'Inquilino não carregado' }
    }
    setIsLoading(true)
    const result = await loginClientPortalAction({ cpf, email, tenantSlug: tenant.slug })
    return completeLogin(tenant.slug, result)
  }

  const loginGoogle = async (
    idToken: string,
    options: { redirect?: boolean } = {},
  ): Promise<{ success: boolean; error?: string; role?: UserRole }> => {
    if (!tenant) {
      return { success: false, error: 'Inquilino não carregado' }
    }
    setIsLoading(true)
    const result = await loginGoogleAction({ idToken, tenantSlug: tenant.slug })
    return completeLogin(tenant.slug, result, options.redirect ?? true)
  }

  const logout = () => {
    setUser(null)
    setIsImpersonating(false)
    setSessionEnded(false)
    void logoutAction()
    if (tenant) router.push(tenantLoginPath(tenant.slug))
  }

  const logoutInPlace = async () => {
    setUser(null)
    setIsImpersonating(false)
    setSessionEnded(false)
    await logoutAction()
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        loginPortal,
        loginGoogle,
        logout,
        logoutInPlace,
        isAuthenticated: !!user,
        isImpersonating,
        sessionEnded,
        endSession,
        refreshSession,
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
    needsSubscription: sessionUser.needsSubscription,
    salesRole: sessionUser.salesRole ?? null,
    subscriptionStatus: sessionUser.subscriptionStatus,
    // A sessão não carrega a data de criação da conta — nenhuma tela lê este
    // campo a partir do usuário logado (só da listagem de usuários, que vem
    // de tenant-users-api.ts com o valor real).
    createdAt: new Date(),
  }
}
