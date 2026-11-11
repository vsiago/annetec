'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { getRoleRedirectPath, tenantLoginPath } from '@/lib/auth/redirect'
import type { UserRole } from '@/lib/types'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles: UserRole[]
}

/**
 * Área logada do inquilino (painel, vendedor, portal do associado).
 *
 * Sem sessão, leva ao login. Se a sessão CAIU com a tela aberta (401 em
 * qualquer leitura — ver `endSession` no AuthProvider), o login recebe
 * `?motivo=sessao-encerrada` e avisa; e a área some na hora (`null`), sem
 * deixar dado antigo na tela enquanto a navegação acontece.
 */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { tenant } = useTenant()
  const { user, isLoading, isAuthenticated, sessionEnded } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && tenant) {
      if (!isAuthenticated) {
        router.replace(tenantLoginPath(tenant.slug, { sessionEnded }))
      } else if (user && !allowedRoles.includes(user.role)) {
        router.push(getRoleRedirectPath(tenant.slug, user.role, { needsSubscription: user.needsSubscription, salesRole: user.salesRole ?? null }))
      }
    }
  }, [isLoading, isAuthenticated, user, allowedRoles, router, tenant, sessionEnded])

  if (isLoading || !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || (user && !allowedRoles.includes(user.role))) {
    return null
  }

  return <>{children}</>
}
