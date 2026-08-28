'use client'

import { useEffect } from 'react'
import { TenantProvider, useTenant } from '@/contexts/tenant-context'
import { TenantDataProvider } from '@/contexts/tenant-data-context'
import { AuthProvider } from '@/contexts/auth-context'
import { buildTenantThemeVars } from '@/lib/theme'
import { Loader2 } from 'lucide-react'

// Applies the tenant palette to :root. It has to be the document element
// rather than a wrapper <div> because Radix portals (Dialog, Select,
// DropdownMenu) render into document.body and would otherwise fall back to
// Annetec's own brand colors.
function useTenantTheme(branding: { primaryColor: string; secondaryColor: string } | undefined) {
  useEffect(() => {
    if (!branding) return
    const root = document.documentElement
    const vars = buildTenantThemeVars(branding)
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value))
    return () => {
      Object.keys(vars).forEach(key => root.style.removeProperty(key))
    }
  }, [branding?.primaryColor, branding?.secondaryColor])
}

function TenantGate({ children }: { children: React.ReactNode }) {
  const { tenant, isLoading } = useTenant()
  useTenantTheme(tenant?.branding)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-background text-center px-4">
        <h1 className="text-2xl font-bold text-foreground">Clube não encontrado</h1>
        <p className="text-muted-foreground max-w-md">
          Verifique o endereço digitado ou fale com a organização responsável por este clube de benefícios.
        </p>
      </div>
    )
  }

  return (
    <TenantDataProvider>
      <AuthProvider>{children}</AuthProvider>
    </TenantDataProvider>
  )
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <TenantGate>{children}</TenantGate>
    </TenantProvider>
  )
}
