'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { PlatformAuthProvider } from '@/contexts/platform-auth-context'
import { TenantsProvider } from '@/contexts/tenants-context'
import { AdminScopeProvider } from '@/contexts/admin-scope-context'
import { ProtectedPlatformRoute } from '@/components/protected-platform-route'
import { PlatformSidebar } from '@/components/admin-platform/platform-sidebar'
import { ScopeSwitcher } from '@/components/admin-platform/scope-switcher'
import { NotificationsProvider } from '@/components/notifications/notifications-provider'
import { cn } from '@/lib/utils'

/**
 * Telas que operam sobre a carteira de UM clube (ou a carteira própria da
 * ANNETEC) — são as que precisam dizer de quem são os dados. Hoje ficam no
 * grupo Avançado do menu. Início, Clubes, Aprovações, Financeiro, Planos e
 * preços, Equipe ANNETEC e as telas de suporte são da plataforma inteira e
 * não têm escopo, por isso o seletor não aparece nelas.
 */
const ROTAS_COM_ESCOPO = [
  '/admin/clientes',
  '/admin/catalogo',
  '/admin/vendedores',
  '/admin/leads',
  '/admin/comissoes',
  '/admin/parceiros',
]

/** A rota é a própria tela ou uma subpágina dela (`/admin/leads` e `/admin/leads/123`). */
function temEscopo(pathname: string | null): boolean {
  if (!pathname) return false
  return ROTAS_COM_ESCOPO.some(rota => pathname === rota || pathname.startsWith(`${rota}/`))
}

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
  const mostraEscopo = temEscopo(pathname)

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
            'relative transition-[padding] duration-300 ease-in-out min-h-screen pt-16 lg:pt-0 pb-24 lg:pb-0',
            isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
          )}
        >
          {/* Faixa sutil no topo (azul-claro da marca se dissolvendo no fundo): dá profundidade ao cabeçalho. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,#E1E9F4_0%,rgba(239,243,248,0)_100%)]"
          />
          {mostraEscopo && (
            <div className="relative border-b border-border bg-card/60 px-4 py-3 lg:px-6">
              <ScopeSwitcher />
            </div>
          )}
          {/*
            Largura e margem de TODAS as telas do console: p-4 (celular) / p-6 (desktop),
            sem largura máxima. Cada página começa com <PageContainer> (ui/page-container)
            e não define largura própria.
          */}
          <div className="relative p-4 lg:p-6 lg:pt-7">{children}</div>
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
            {/* Sino da equipe Annetec: pagamentos e cadastros de todos os clubes. */}
            <NotificationsProvider scope={{ kind: 'platform' }}>
              <PlatformLayoutContent>{children}</PlatformLayoutContent>
            </NotificationsProvider>
          </AdminScopeProvider>
        </TenantsProvider>
      </ProtectedPlatformRoute>
    </PlatformAuthProvider>
  )
}

