'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useTenant } from '@/contexts/tenant-context'
import { ClientSidebar } from '@/components/client/client-sidebar'
import { isClientOnboardingPath } from '@/components/client/subscription-access'

/**
 * Moldura do portal do associado: menu lateral + área de conteúdo.
 *
 * O onboarding `/cliente/assinar` é a exceção — tela cheia, só com a marca do
 * clube, porque quem está lá ainda não tem portal nenhum para navegar.
 */
export function ClientPortalChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? ''
  const { tenant } = useTenant()

  if (isClientOnboardingPath(pathname, tenant?.slug ?? '')) return <>{children}</>

  return (
    <div className="min-h-screen bg-muted/30">
      <ClientSidebar />
      <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-6">{children}</div>
      </main>
    </div>
  )
}
