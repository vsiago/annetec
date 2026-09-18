'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, ChevronLeft, ChevronRight, Headset, Heart } from 'lucide-react'
import { useTenant } from '@/contexts/tenant-context'
import { useAdminSidebarContext } from '@/app/[tenant]/admin/layout'
import { adminNavHref, adminNavItems } from './admin-nav'
import { AdminUserMenu } from './admin-user-menu'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function AdminSidebar() {
  const pathname = usePathname()
  const { tenant } = useTenant()
  const { isCollapsed, toggleSidebar } = useAdminSidebarContext()

  if (!tenant) return null

  const base = `/${tenant.slug}/admin`
  const logo = tenant.branding.logoUrl

  const helpCard = (
    <Link
      href={`${base}/configuracoes`}
      className={cn(
        'flex items-center rounded-xl border border-primary/15 bg-primary/5 transition-colors hover:bg-primary/10',
        isCollapsed ? 'justify-center p-2.5' : 'gap-3 p-3',
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Headset className="h-4 w-4" />
      </span>
      {!isCollapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-foreground">
              Precisa de ajuda?
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              Acesse nosso suporte
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </>
      )}
    </Link>
  )

  return (
    <TooltipProvider delayDuration={100}>
      {/* Header compacto do mobile — no desktop esse papel é da AdminTopbar. */}
      <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <Link href={base} className="flex items-center gap-2 overflow-hidden">
          {logo ? (
            <img src={logo} alt={tenant.name} className="h-7 object-contain" />
          ) : (
            <BrandMark name={tenant.name} />
          )}
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="relative p-2 text-muted-foreground hover:text-foreground"
            aria-label="Notificações"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
          </button>
          <AdminUserMenu base={base} showDetails={false} />
        </div>
      </header>

      {/* Sidebar do desktop */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 hidden h-full flex-col border-r border-border bg-card transition-all duration-300 ease-in-out lg:flex',
          isCollapsed ? 'w-20' : 'w-64',
        )}
      >
        <div
          className={cn(
            'flex h-18 shrink-0 items-center border-b border-border',
            isCollapsed ? 'justify-center px-2' : 'px-5',
          )}
        >
          <Link href={base} className="flex items-center gap-2 overflow-hidden">
            {logo ? (
              <img
                src={logo}
                alt={tenant.name}
                className={cn('object-contain', isCollapsed ? 'h-8 w-8' : 'h-9')}
              />
            ) : (
              <BrandMark name={tenant.name} compact={isCollapsed} />
            )}
          </Link>
        </div>

        {/* Recolher/expandir: botão flutuante na borda, como no painel aprovado. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleSidebar}
              className="absolute -right-3 top-14.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-primary"
              aria-label={isCollapsed ? 'Expandir menu (Ctrl+B)' : 'Recolher menu (Ctrl+B)'}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {isCollapsed ? 'Expandir (Ctrl+B)' : 'Recolher (Ctrl+B)'}
          </TooltipContent>
        </Tooltip>

        <nav className="scrollbar-translucent flex-1 overflow-y-auto overflow-x-hidden p-3">
          <ul className="space-y-1">
            {adminNavItems.map(item => {
              const href = adminNavHref(base, item.segment)
              const Icon = item.icon
              const isActive = pathname === href

              const link = (
                <Link
                  href={href}
                  className={cn(
                    'flex items-center rounded-lg text-sm transition-colors',
                    isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                    isActive
                      ? 'bg-primary/10 font-semibold text-primary'
                      : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </Link>
              )

              return (
                <li key={href}>
                  {isCollapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="space-y-2 p-3">
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>{helpCard}</TooltipTrigger>
              <TooltipContent side="right">Precisa de ajuda? Acesse nosso suporte</TooltipContent>
            </Tooltip>
          ) : (
            helpCard
          )}

          {!isCollapsed && (
            <div className="flex items-center gap-3 rounded-xl bg-primary/10 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-primary">{tenant.name}</p>
                <p className="text-[11px] leading-tight text-foreground/70">
                  Saúde e benefícios para mais pessoas.
                </p>
              </div>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-card text-primary">
                <Heart className="h-4 w-4 fill-current" />
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Barra inferior do mobile, rolável na horizontal. */}
      <nav
        className="scrollbar-none fixed bottom-0 left-0 right-0 z-100 flex h-16 items-center gap-1 overflow-x-auto border-t border-border bg-card px-2 shadow-[0_-2px_12px_rgba(15,23,42,0.06)] lg:hidden"
        aria-label="Navegação móvel"
      >
        {adminNavItems.map(item => {
          const href = adminNavHref(base, item.segment)
          const Icon = item.icon
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-w-17 max-w-22 shrink-0 flex-col items-center justify-center gap-1 rounded-xl py-1 text-center text-[11px] font-medium transition-all',
                isActive
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className={cn('h-5 w-5 shrink-0 transition-transform', isActive && 'scale-110')} />
              <span className="w-full truncate px-1">{item.shortLabel ?? item.label}</span>
            </Link>
          )
        })}
      </nav>
    </TooltipProvider>
  )
}

/** Marca do inquilino quando ele ainda não subiu um logotipo. */
function BrandMark({ name, compact = false }: { name: string; compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
        {name.charAt(0).toUpperCase()}
      </span>
      {!compact && <span className="truncate text-base font-bold text-foreground">{name}</span>}
    </span>
  )
}
