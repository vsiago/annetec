'use client'

import { usePathname } from 'next/navigation'
import { PlatformAuthProvider } from '@/contexts/platform-auth-context'
import { TenantsProvider } from '@/contexts/tenants-context'
import { ProtectedPlatformRoute } from '@/components/protected-platform-route'
import { PlatformSidebar } from '@/components/admin-platform/platform-sidebar'

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLoginPage = pathname === '/admin/login'

  return (
    <PlatformAuthProvider>
      {isLoginPage ? (
        children
      ) : (
        <ProtectedPlatformRoute>
          <TenantsProvider>
            <div className="min-h-screen bg-muted/30">
              <PlatformSidebar />
              <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
                <div className="p-4 lg:p-6">{children}</div>
              </main>
            </div>
          </TenantsProvider>
        </ProtectedPlatformRoute>
      )}
    </PlatformAuthProvider>
  )
}
