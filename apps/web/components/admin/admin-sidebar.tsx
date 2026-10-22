'use client'

import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Headset,
  Heart,
  LayoutGrid,
} from 'lucide-react'
import { useTenant } from '@/contexts/tenant-context'
import { useAdminSidebarContext } from '@/app/[tenant]/admin/layout'
import {
  ADMIN_NAV_FINANCE_STORAGE_KEY,
  ADMIN_NAV_MORE_STORAGE_KEY,
  adminNavFinance,
  adminNavHref,
  adminNavMore,
  adminNavPrimary,
  isAdminNavActive,
  type AdminNavItem,
} from './admin-nav'
import { AdminUserMenu } from './admin-user-menu'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { cn } from '@/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/**
 * `localStorage` pode não existir ou lançar (aba anônima, cookies bloqueados).
 * Sem ele o grupo só não lembra do último estado — nunca quebra o menu.
 */
function readGroupOpen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function writeGroupOpen(key: string, open: boolean) {
  try {
    window.localStorage.setItem(key, String(open))
  } catch {
    // Sem armazenamento: o estado vale só até recarregar a página.
  }
}

type MobileSheet = 'more' | 'finance' | null

export function AdminSidebar() {
  const pathname = usePathname()
  const { tenant } = useTenant()
  const { isCollapsed, toggleSidebar } = useAdminSidebarContext()

  // "Mais módulos" nasce recolhido; o que a pessoa escolheu da última vez
  // vem do localStorage depois da montagem (no servidor não há storage).
  const [moreOpen, setMoreOpen] = useState(false)
  const [financeOpen, setFinanceOpen] = useState(false)
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null)

  const base = tenant ? `/${tenant.slug}/admin` : ''
  const moreActive = adminNavMore.some(item => isAdminNavActive(pathname, base, item.segment))
  const financeActive = adminNavFinance.items.some(item => isAdminNavActive(pathname, base, item.segment))

  useEffect(() => {
    if (readGroupOpen(ADMIN_NAV_MORE_STORAGE_KEY)) setMoreOpen(true)
    if (readGroupOpen(ADMIN_NAV_FINANCE_STORAGE_KEY)) setFinanceOpen(true)
  }, [])

  // Rota dentro do grupo abre o grupo, para o item ativo aparecer destacado.
  // Não grava: é consequência da navegação, não uma escolha da pessoa.
  useEffect(() => {
    if (moreActive) setMoreOpen(true)
  }, [moreActive, pathname])

  useEffect(() => {
    if (financeActive) setFinanceOpen(true)
  }, [financeActive, pathname])

  // A folha do mobile fecha ao trocar de página.
  useEffect(() => {
    setMobileSheet(null)
  }, [pathname])

  if (!tenant) return null

  const logo = tenant.branding.logoUrl

  function handleMoreOpenChange(open: boolean) {
    setMoreOpen(open)
    writeGroupOpen(ADMIN_NAV_MORE_STORAGE_KEY, open)
  }

  function handleFinanceOpenChange(open: boolean) {
    setFinanceOpen(open)
    writeGroupOpen(ADMIN_NAV_FINANCE_STORAGE_KEY, open)
  }

  const mobileSheetItems = mobileSheet === 'finance' ? adminNavFinance.items : adminNavMore

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

  /** Link da sidebar do desktop; `nested` é o recuo dos itens do grupo. */
  function desktopLink(item: AdminNavItem, nested = false) {
    const href = adminNavHref(base, item.segment)
    const Icon = item.icon
    const isActive = isAdminNavActive(pathname, base, item.segment)

    const link = (
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex items-center rounded-lg text-sm transition-colors',
          isCollapsed ? 'justify-center p-2.5' : nested ? 'gap-3 px-3 py-2' : 'gap-3 px-3 py-2.5',
          isActive
            ? 'bg-primary/10 font-semibold text-primary'
            : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Icon className={cn('shrink-0', nested ? 'h-4.5 w-4.5' : 'h-5 w-5')} />
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
  }

  /**
   * Grupo do menu (Financeiro, Mais módulos). Expandida, abre e fecha como
   * acordeão; recolhida não cabe o acordeão: vira um menu flutuante ao lado
   * do ícone, com o item ativo destacado lá dentro.
   */
  function navGroup({
    label,
    icon: Icon,
    items,
    active,
    open,
    onOpenChange,
  }: {
    label: string
    icon: LucideIcon
    items: AdminNavItem[]
    active: boolean
    open: boolean
    onOpenChange: (open: boolean) => void
  }) {
    if (isCollapsed) {
      return (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={label}
                  className={cn(
                    'relative flex w-full items-center justify-center rounded-lg p-2.5 transition-colors',
                    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="start" sideOffset={12} className="max-h-[75vh] w-64 overflow-y-auto">
            <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {items.map(item => {
              const ItemIcon = item.icon
              const isActive = isAdminNavActive(pathname, base, item.segment)
              return (
                <DropdownMenuItem key={item.segment} asChild>
                  <Link
                    href={adminNavHref(base, item.segment)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'cursor-pointer gap-3 py-2',
                      isActive && 'bg-primary/10 font-semibold text-primary focus:bg-primary/15 focus:text-primary',
                    )}
                  >
                    <ItemIcon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }

    return (
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active && !open
                ? 'bg-primary/5 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="flex-1 truncate text-left">{label}</span>
            {active && !open && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />}
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 transition-transform duration-200', open && 'rotate-180')}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <ul className="ml-5 mt-1 space-y-0.5 border-l border-border pl-2">
            {items.map(item => desktopLink(item, true))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    )
  }

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
          <NotificationBell variant="mobile" />
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

        <nav className="scrollbar-translucent flex-1 overflow-y-auto overflow-x-hidden p-3" aria-label="Menu do painel">
          <ul className="space-y-1">{adminNavPrimary.map(item => desktopLink(item))}</ul>
          <div className="mt-1">
            {navGroup({
              label: adminNavFinance.label,
              icon: adminNavFinance.icon,
              items: adminNavFinance.items,
              active: financeActive,
              open: financeOpen,
              onOpenChange: handleFinanceOpenChange,
            })}
          </div>

          <div className="my-3 h-px bg-border" role="separator" />

          {navGroup({
            label: 'Mais módulos',
            icon: LayoutGrid,
            items: adminNavMore,
            active: moreActive,
            open: moreOpen,
            onOpenChange: handleMoreOpenChange,
          })}
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

      {/* Barra inferior do mobile: os três primários, "Financeiro" e "Mais" (uma
          coluna cada; os dois últimos abrem a folha com seus itens). Em ~360px
          cada coluna tem ~70px: margem e vão mínimos e rótulo de 10px (11px a
          partir de 400px) para "Financeiro" caber inteiro, sem reticências. */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-100 grid h-16 grid-cols-5 items-center gap-0.5 border-t border-border bg-card px-1 shadow-[0_-2px_12px_rgba(15,23,42,0.06)] min-[400px]:gap-1 min-[400px]:px-2 lg:hidden"
        aria-label="Navegação móvel"
      >
        {adminNavPrimary.map(item => {
          const href = adminNavHref(base, item.segment)
          const Icon = item.icon
          const isActive = isAdminNavActive(pathname, base, item.segment)
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex h-13 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-center text-[10px] font-medium tracking-tight transition-all min-[400px]:text-[11px] min-[400px]:tracking-normal',
                isActive
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className={cn('h-5 w-5 shrink-0 transition-transform', isActive && 'scale-110')} />
              <span className="w-full truncate px-0.5">{item.shortLabel ?? item.label}</span>
            </Link>
          )
        })}
        {(
          [
            { sheet: 'finance', label: adminNavFinance.label, icon: adminNavFinance.icon, active: financeActive },
            { sheet: 'more', label: 'Mais', icon: LayoutGrid, active: moreActive },
          ] as const
        ).map(entry => {
          const Icon = entry.icon
          const open = mobileSheet === entry.sheet
          return (
            <button
              key={entry.sheet}
              type="button"
              onClick={() => setMobileSheet(current => (current === entry.sheet ? null : entry.sheet))}
              aria-expanded={open}
              className={cn(
                'relative flex h-13 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-center text-[10px] font-medium tracking-tight transition-all min-[400px]:text-[11px] min-[400px]:tracking-normal',
                entry.active || open
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className={cn('h-5 w-5 shrink-0 transition-transform', entry.active && 'scale-110')} />
              <span className="w-full truncate px-0.5">{entry.label}</span>
            </button>
          )
        })}
      </nav>

      <Sheet open={mobileSheet !== null} onOpenChange={open => !open && setMobileSheet(null)}>
        {/* Fica acima da barra inferior (bottom-16), que continua à vista. */}
        <SheetContent
          side="bottom"
          className="bottom-16 max-h-[70vh] gap-0 rounded-t-2xl pb-2 lg:hidden"
        >
          <SheetHeader className="pb-2">
            <SheetTitle>{mobileSheet === 'finance' ? adminNavFinance.label : 'Mais módulos'}</SheetTitle>
            <SheetDescription>
              {mobileSheet === 'finance' ? 'Recebimentos e faturamento do clube.' : 'Os demais módulos do painel.'}
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 overflow-y-auto px-4 pb-2">
            {mobileSheetItems.map(item => {
              const Icon = item.icon
              const isActive = isAdminNavActive(pathname, base, item.segment)
              return (
                <Link
                  key={item.segment}
                  href={adminNavHref(base, item.segment)}
                  onClick={() => setMobileSheet(null)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs transition-colors',
                    isActive
                      ? 'border-primary/30 bg-primary/10 font-semibold text-primary'
                      : 'border-border/70 font-medium text-foreground hover:bg-muted',
                  )}
                >
                  <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="line-clamp-2 leading-tight">{item.shortLabel ?? item.label}</span>
                </Link>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
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
