'use client'

import { Bell, Search } from 'lucide-react'
import { useTenant } from '@/contexts/tenant-context'
import { MockBadge } from '@/components/dashboard/mock-badge'
import { AdminUserMenu } from './admin-user-menu'

/**
 * Barra superior do painel: busca global, notificações e usuário. Só no
 * desktop — no mobile esse papel é do header compacto da AdminSidebar.
 */
export function AdminTopbar() {
  const { tenant } = useTenant()
  if (!tenant) return null

  return (
    <header className="sticky top-0 z-30 hidden h-18 shrink-0 items-center gap-4 border-b border-border bg-card px-6 lg:flex">
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Buscar por nome, CPF, e-mail ou nº do contrato..."
          className="h-11 w-full rounded-xl border border-border/70 bg-muted/40 pl-11 pr-20 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card focus:ring-2 focus:ring-primary/15"
        />
        <MockBadge className="absolute right-3 top-1/2 -translate-y-1/2" />
      </div>

      <div className="ml-auto flex items-center gap-4">
        <button
          type="button"
          className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
        </button>
        <div className="h-8 w-px bg-border" />
        <AdminUserMenu base={`/${tenant.slug}/admin`} />
      </div>
    </header>
  )
}
