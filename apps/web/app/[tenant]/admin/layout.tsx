'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { ProtectedRoute } from '@/components/protected-route'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { AdminTopbar } from '@/components/admin/admin-topbar'
import { PlatformAccessGate } from '@/components/platform-billing/access-gate'
import { NotificationsProvider } from '@/components/notifications/notifications-provider'
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData } from '@/contexts/tenant-data-context'
import { cn } from '@/lib/utils'

type SidebarContextType = {
  isCollapsed: boolean
  toggleSidebar: () => void
  setIsCollapsed: (collapsed: boolean) => void
}

export const AdminSidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
  toggleSidebar: () => {},
  setIsCollapsed: () => {},
})

export const useAdminSidebarContext = () => useContext(AdminSidebarContext)

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('annetec_admin_sidebar_collapsed')
    if (stored !== null) {
      setIsCollapsed(stored === 'true')
    }
  }, [])

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev
      localStorage.setItem('annetec_admin_sidebar_collapsed', String(next))
      return next
    })
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <AdminSidebarContext.Provider value={{ isCollapsed, toggleSidebar, setIsCollapsed }}>
      <div className="min-h-screen bg-background">
        <AdminSidebar />
        <div
          className={cn(
            'flex min-h-screen flex-col pt-14 transition-[padding] duration-300 ease-in-out lg:pt-0',
            isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
          )}
        >
          <AdminTopbar />
          <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">
            <PlatformAccessGate>{children}</PlatformAccessGate>
          </main>
        </div>
      </div>
    </AdminSidebarContext.Provider>
  )
}

/**
 * Sino em tempo real do clube (pagamentos e cadastros). Cadastro novo também
 * rebusca a lista de usuários: o "Ver detalhes" abre `clientes/<id>`, que
 * procura a pessoa nela.
 */
function TenantNotifications({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant()
  const { reloadUsers } = useTenantData()
  if (!tenant) return <>{children}</>
  return (
    <NotificationsProvider
      scope={{ kind: 'tenant', slug: tenant.slug }}
      onNotification={notification => {
        if (notification.kind === 'client_signed_up') void reloadUsers()
      }}
    >
      {children}
    </NotificationsProvider>
  )
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <TenantNotifications>
        <AdminLayoutContent>{children}</AdminLayoutContent>
      </TenantNotifications>
    </ProtectedRoute>
  )
}

