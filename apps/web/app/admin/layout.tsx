'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { PlatformAuthProvider } from '@/contexts/platform-auth-context'
import { TenantsProvider } from '@/contexts/tenants-context'
import { AdminScopeProvider } from '@/contexts/admin-scope-context'
import { ProtectedPlatformRoute } from '@/components/protected-platform-route'
import { PlatformSidebar } from '@/components/admin-platform/platform-sidebar'
import { ScopeSwitcher } from '@/components/admin-platform/scope-switcher'
import { cn } from '@/lib/utils'

/**
 * Telas que operam sobre a carteira de UM inquilino — são as que precisam
 * dizer de quem são os dados. Inquilinos, Usuários da Plataforma,
 * Configurações, Logs e Dicionário são da plataforma inteira e não têm escopo.
 */
const ROTAS_COM_ESCOPO = [
  '/admin/clientes',
  '/admin/catalogo',
  '/admin/vendedores',
  '/admin/leads',
  '/admin/financeiro',
  '/admin/comissoes',
  '/admin/parceiros',
]

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
  const pathname = usePathname()
  const mostraEscopo = ROTAS_COM_ESCOPO.some(rota => pathname?.startsWith(rota))

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
          {mostraEscopo && (
            <div className="border-b border-border bg-card/60 px-4 py-3 lg:px-6">
              <ScopeSwitcher />
            </div>
          )}
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
          <AdminScopeProvider>
            <PlatformLayoutContent>{children}</PlatformLayoutContent>
          </AdminScopeProvider>
        </TenantsProvider>
      </ProtectedPlatformRoute>
    </PlatformAuthProvider>
  )
}

