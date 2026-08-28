'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import type { PlatformRole } from '@/lib/types'
import { Loader2 } from 'lucide-react'

interface ProtectedPlatformRouteProps {
  children: React.ReactNode
  allowedRoles?: PlatformRole[]
}

export function ProtectedPlatformRoute({
  children,
  allowedRoles = ['superadmin', 'platform_admin'],
}: ProtectedPlatformRouteProps) {
  const { user, isLoading, isAuthenticated } = usePlatformAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push('/admin/login')
      } else if (user && !allowedRoles.includes(user.role)) {
        router.push('/admin')
      }
    }
  }, [isLoading, isAuthenticated, user, allowedRoles, router])

  if (isLoading) {
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
