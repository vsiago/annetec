'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { useTenant } from '@/contexts/tenant-context'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { AdminUserMenu } from './admin-user-menu'

/**
 * Barra superior do painel: busca e usuário. Só no desktop — no mobile esse
 * papel é do header compacto da AdminSidebar.
 *
 * A busca leva para Cadastros (`?q=`), que procura por nome, CPF, e-mail ou
 * nº da carteirinha na API — titular ou dependente.
 */
export function AdminTopbar() {
  const { tenant } = useTenant()
  const router = useRouter()
  const [query, setQuery] = useState('')
  if (!tenant) return null

  const base = `/${tenant.slug}/admin`

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const term = query.trim()
    router.push(term ? `${base}/cadastros?q=${encodeURIComponent(term)}` : `${base}/cadastros`)
  }

  return (
    <header className="sticky top-0 z-30 hidden h-18 shrink-0 items-center gap-4 border-b border-border bg-card px-6 lg:flex">
      <form role="search" onSubmit={handleSubmit} className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Buscar associado por nome, CPF, e-mail ou carteirinha..."
          aria-label="Buscar associado"
          className="h-11 w-full rounded-xl border border-border/70 bg-muted/40 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card focus:ring-2 focus:ring-primary/15"
        />
      </form>

      <div className="ml-auto flex items-center gap-3">
        <NotificationBell variant="topbar" />
        <AdminUserMenu base={base} />
      </div>
    </header>
  )
}
