'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { PlatformAuthProvider } from '@/contexts/platform-auth-context'
import { TenantsProvider } from '@/contexts/tenants-context'
import { ProtectedPlatformRoute } from '@/components/protected-platform-route'
import { PlatformSidebar } from '@/components/admin-platform/platform-sidebar'
import { cn } from '@/lib/utils'

type SidebarContextType = {
  isCollapsed: boolean
  toggleSidebar: () => void
  setIsCollapsed: (collapsed: boolean) => void
}

export const PlatformSidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
  toggleSidebar: () => {},
  setIsCollapsed: () => {},
})

export const usePlatformSidebarContext = () => useContext(PlatformSidebarContext)

function PlatformLayoutContent({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('annetec_platform_sidebar_collapsed')
    if (stored !== null) {
      setIsCollapsed(stored === 'true')
    }
  }, [])

  const toggleSidebar = () => {
    setIsCollapsed(prev => {
      const next = !prev
      localStorage.setItem('annetec_platform_sidebar_collapsed', String(next))
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
    <PlatformSidebarContext.Provider value={{ isCollapsed, toggleSidebar, setIsCollapsed }}>
      <div className="min-h-screen bg-background">
        <PlatformSidebar />
        <main
          className={cn(
            'transition-[padding] duration-300 ease-in-out min-h-screen pt-16 lg:pt-0 pb-24 lg:pb-0',
            isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
          )}
        >
          <div className="p-4 lg:p-6">{children}</div>
        </main>
      </div>
    </PlatformSidebarContext.Provider>
  )
}

// Login da plataforma é só em /login — não existe mais /admin/login, então
// todo /admin/* passa pelo guard de sessão.
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <PlatformAuthProvider>
      <ProtectedPlatformRoute>
        <TenantsProvider>
          <PlatformLayoutContent>{children}</PlatformLayoutContent>
        </TenantsProvider>
      </ProtectedPlatformRoute>
    </PlatformAuthProvider>
  )
}

