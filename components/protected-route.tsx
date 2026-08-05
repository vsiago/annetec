'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth, getRedirectPath } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import type { UserRole } from '@/lib/types'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  allowedRoles: UserRole[]
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { tenant } = useTenant()
  const { user, isLoading, isAuthenticated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && tenant) {
      if (!isAuthenticated) {
        router.push(`/${tenant.slug}/login`)
      } else if (user && !allowedRoles.includes(user.role)) {
        router.push(getRedirectPath(tenant.slug, user.role))
      }
    }
  }, [isLoading, isAuthenticated, user, allowedRoles, router, tenant])

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
