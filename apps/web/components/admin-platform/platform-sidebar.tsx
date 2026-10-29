'use client'

import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import { usePlatformSidebarContext } from '@/app/admin/layout'
import { getOnboardingQueueSummaryAction } from '@/lib/actions/platform-onboarding-api'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { cn, getInitials } from '@/lib/utils'
import {
  LayoutDashboard,
  Building2,
  Users,
  UsersRound,
  UserCog,
  Receipt,
  Handshake,
  Tags,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Activity,
  Layers,
  ShieldCheck,
  Inbox,
  ScrollText,
  SlidersHorizontal,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Rotas que também acendem o item, além do próprio `href` e das subpáginas. */
  alsoActive?: string[]
  /** Aprovações mostra quantos clubes esperam análise. */
  showWaitingCount?: boolean
}

/** Menu principal — o mesmo no desktop e no mobile. */
const mainLinks: NavItem[] = [
  { href: '/admin', label: 'Início', icon: LayoutDashboard },
  { href: '/admin/inquilinos', label: 'Clubes', icon: Building2 },
  { href: '/admin/compliance', label: 'Aprovações', icon: ShieldCheck, showWaitingCount: true },
  { href: '/admin/financeiro', label: 'Financeiro', icon: Receipt },
  { href: '/admin/configuracoes', label: 'Planos e preços', icon: Tags },
  { href: '/admin/usuarios', label: 'Equipe ANNETEC', icon: Users },
]

/**
 * Grupo "Avançado": só superadmin, fechado por padrão. Além do que é de
 * suporte (histórico, acessos, e-mails), guarda as telas da Digital Saúde que
 * o painel do clube não cobre: contratos, catálogo, vendedores com comissões
 * e os benefícios do clube de vantagens. As rotas e os dados não mudam.
 */
const advancedLinks: NavItem[] = [
  { href: '/admin/holding/auditoria', label: 'Histórico de alterações', icon: ScrollText },
  { href: '/admin/logs', label: 'Acessos ao sistema', icon: Activity },
  { href: '/admin/emails', label: 'E-mails enviados', icon: Inbox },
  { href: '/admin/clientes', label: 'Contratos na Digital Saúde', icon: UsersRound },
  { href: '/admin/catalogo', label: 'Catálogo da Digital Saúde', icon: Layers },
  { href: '/admin/vendedores', label: 'Vendedores e comissões', icon: UserCog, alsoActive: ['/admin/comissoes'] },
  { href: '/admin/parceiros', label: 'Parceiros e benefícios', icon: Handshake },
]

function matchesRoute(pathname: string, href: string): boolean {
  if (pathname === href) return true
  return href !== '/admin' && pathname.startsWith(`${href}/`)
}

/**
 * Item ativo também nas subpáginas (`/admin/compliance/<id>`,
 * `/admin/financeiro/assinaturas/<id>`) — o Início (`/admin`) só na raiz.
 */
function isLinkActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false
  return matchesRoute(pathname, item.href) || (item.alsoActive?.some(href => matchesRoute(pathname, href)) ?? false)
}

/**
 * Quantos clubes esperam análise (fila de Aprovações). Usa o resumo que a
 * própria tela de Aprovações já carrega — uma contagem, sem lista. Atualiza ao
 * navegar e a cada minuto; se falhar, o contador simplesmente não aparece.
 */
function useWaitingApprovals(pathname: string | null): number | null {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (document.visibilityState === 'hidden') return
      try {
        const result = await getOnboardingQueueSummaryAction()
        if (!cancelled && result.success) setCount(result.data.queue)
      } catch {
        // Sem o contador o menu continua funcionando.
      }
    }
    void load()
    const timer = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pathname])

  return count
}

function countText(count: number): string {
  return count > 99 ? '99+' : String(count)
}

export function PlatformSidebar() {
  const pathname = usePathname()
  const { user, logout } = usePlatformAuth()
  const { isCollapsed, toggleSidebar } = usePlatformSidebarContext()
  const waiting = useWaitingApprovals(pathname)

  const isSuperadmin = user?.platformRole === 'superadmin'
  const advancedActive = isSuperadmin && advancedLinks.some(item => isLinkActive(pathname, item))

  // Fechado por padrão; estar numa tela do grupo abre o grupo, para o item
  // ativo aparecer destacado. A pessoa pode fechar de novo à mão.
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [advancedSheetOpen, setAdvancedSheetOpen] = useState(false)

  useEffect(() => {
    if (advancedActive) setAdvancedOpen(true)
  }, [advancedActive, pathname])

  // A folha do mobile fecha ao trocar de página.
  useEffect(() => {
    setAdvancedSheetOpen(false)
  }, [pathname])

  const waitingLabel = (item: NavItem) =>
    item.showWaitingCount && waiting ? `${item.label} · ${waiting} para analisar` : item.label

  /** Link da sidebar do desktop; `nested` é o recuo dos itens do grupo. */
  function desktopLink(item: NavItem, nested = false) {
    const Icon = item.icon
    const isActive = isLinkActive(pathname, item)
    const count = item.showWaitingCount && waiting ? waiting : 0

    const linkElement = (
      <Link
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'relative flex items-center rounded-lg text-sm font-medium transition-colors',
          isCollapsed ? 'justify-center p-2.5' : nested ? 'gap-3 px-3 py-2' : 'gap-3 px-3 py-2.5',
          isActive
            ? 'bg-white/15 text-white shadow-sm font-semibold'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
        )}
      >
        {isActive && (
          <span
            className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
            aria-hidden="true"
          />
        )}
        <Icon className={cn('shrink-0', nested ? 'h-4 w-4' : 'h-5 w-5')} />
        {!isCollapsed && <span className="truncate">{item.label}</span>}
        {count > 0 && (
          <span
            className={cn(
              'inline-flex items-center justify-center rounded-full bg-white font-semibold text-secondary',
              isCollapsed
                ? 'absolute right-1 top-1 h-4 min-w-4 px-1 text-[10px] leading-none'
                : 'ml-auto h-5 min-w-5 px-1.5 text-[11px] leading-none'
            )}
          >
            <span aria-hidden="true">{countText(count)}</span>
            <span className="sr-only">{count} para analisar</span>
          </span>
        )}
      </Link>
    )

    if (isCollapsed) {
      return (
        <li key={item.href}>
          <Tooltip>
            <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
            <TooltipContent side="right">{waitingLabel(item)}</TooltipContent>
          </Tooltip>
        </li>
      )
    }

    return <li key={item.href}>{linkElement}</li>
  }

  /**
   * Grupo Avançado. Expandida, abre e fecha como acordeão; recolhida não cabe o
   * acordeão: vira um menu flutuante ao lado do ícone.
   */
  function advancedGroup() {
    if (isCollapsed) {
      return (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Avançado"
                  className={cn(
                    'relative flex w-full items-center justify-center rounded-lg p-2.5 transition-colors',
                    advancedActive
                      ? 'bg-white/15 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  {advancedActive && (
                    <span
                      className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                      aria-hidden="true"
                    />
                  )}
                  <SlidersHorizontal className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">Avançado</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="start" sideOffset={12} className="z-110 max-h-[75vh] w-64 overflow-y-auto">
            <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Avançado
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {advancedLinks.map(item => {
              const ItemIcon = item.icon
              const isActive = isLinkActive(pathname, item)
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'cursor-pointer gap-3 py-2',
                      isActive && 'bg-accent font-semibold text-secondary focus:bg-accent focus:text-secondary'
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
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              advancedActive && !advancedOpen
                ? 'bg-white/10 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            <SlidersHorizontal className="h-5 w-5 shrink-0" />
            <span className="flex-1 truncate text-left">Avançado</span>
            {advancedActive && !advancedOpen && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            )}
            <ChevronDown
              className={cn('h-4 w-4 shrink-0 transition-transform duration-200', advancedOpen && 'rotate-180')}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <ul className="ml-5 mt-1 space-y-0.5 border-l border-white/10 pl-2">
            {advancedLinks.map(item => desktopLink(item, true))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  return (
    <TooltipProvider delayDuration={100}>
      {/* Mobile Top Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-border z-40 flex items-center justify-between px-4 shadow-sm">
        <Link href="/admin" className="flex items-center gap-2">
          <img src="/annetec.svg" alt="Annetec" className="h-7" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Superadmin</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell variant="mobile" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 transition-colors" aria-label="Menu da conta">
                <Avatar className="h-8 w-8 bg-secondary">
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-medium">
                    {user?.name ? getInitials(user.name) : 'SA'}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 z-110">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{isSuperadmin ? 'Superadmin' : 'Padrão'}</p>
              </div>
              <DropdownMenuItem onClick={logout} className="text-[#B42318]">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex fixed top-0 left-0 h-full bg-secondary z-50 flex-col transition-all duration-300 ease-in-out border-r border-white/10 shadow-lg',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Topo: só a marca. O botão de recolher/expandir fica no rodapé. */}
        <div
          className={cn(
            'h-16 flex items-center border-b border-white/10',
            isCollapsed ? 'justify-center px-3' : 'px-4'
          )}
        >
          {!isCollapsed ? (
            <Link href="/admin" className="flex items-center gap-2 overflow-hidden">
              <img src="/annetec-light.svg" alt="Annetec" className="h-7 shrink-0" />
              <span className="text-white/60 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                Superadmin
              </span>
            </Link>
          ) : (
            <Link href="/admin" className="flex items-center justify-center">
              <img src="/favicon.png" alt="Annetec" className="h-7 w-7 object-contain" />
            </Link>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 overflow-y-auto overflow-x-hidden scrollbar-translucent" aria-label="Menu do console">
          <ul className="space-y-1">{mainLinks.map(item => desktopLink(item))}</ul>

          {isSuperadmin && (
            <>
              <div className="my-3 h-px bg-white/10" role="separator" />
              {advancedGroup()}
            </>
          )}
        </nav>

        {/* Bottom Section */}
        <div className="p-3 border-t border-white/10 space-y-1">
          {/* Notificações em tempo real (todos os clubes) */}
          <NotificationBell variant={isCollapsed ? 'sidebar-collapsed' : 'sidebar'} />

          {/* User Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'w-full flex items-center rounded-lg hover:bg-white/10 transition-colors',
                  isCollapsed ? 'justify-center p-2' : 'gap-3 p-2'
                )}
                aria-label="Menu da conta"
              >
                <Avatar className="h-9 w-9 bg-accent shrink-0">
                  <AvatarFallback className="bg-accent text-secondary text-sm font-medium">
                    {user?.name ? getInitials(user.name) : 'SA'}
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                      <p className="text-xs text-white/60 truncate">
                        {isSuperadmin ? 'Superadmin' : 'Padrão'}
                      </p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-white/60 shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isCollapsed ? 'start' : 'end'} side="right" className="w-56 z-50">
              <DropdownMenuItem onClick={logout} className="text-[#B42318]">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Recolher/expandir: discreto, no rodapé (atalho Ctrl+B). */}
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className="flex h-10 w-full items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  aria-label="Expandir menu"
                  aria-keyshortcuts="Control+B"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Expandir menu (Ctrl+B)</TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={toggleSidebar}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-xs font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="Recolher menu"
              aria-keyshortcuts="Control+B"
              title="Recolher menu (Ctrl+B)"
            >
              <ChevronLeft className="h-5 w-5 shrink-0" />
              <span className="truncate">Recolher menu</span>
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Horizontal Scrollable Bottombar: o menu principal e, para
          superadmin, o "Avançado" que abre uma folha com os demais itens. */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-secondary border-t border-white/10 z-100 flex items-center justify-around px-2 shadow-2xl overflow-x-auto scrollbar-none"
        aria-label="Navegação móvel"
      >
        {mainLinks.map(item => {
          const Icon = item.icon
          const isActive = isLinkActive(pathname, item)
          const count = item.showWaitingCount && waiting ? waiting : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex-1 shrink-0 flex flex-col items-center justify-center py-1 rounded-xl text-[11px] leading-tight font-medium transition-all min-w-16 max-w-24 text-center gap-1',
                isActive
                  ? 'bg-white/15 text-white font-semibold shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              )}
            >
              {isActive && (
                <span
                  className="absolute left-1/2 top-0 h-1 w-6 -translate-x-1/2 rounded-b-full bg-primary"
                  aria-hidden="true"
                />
              )}
              <span className="relative">
                <Icon className={cn('h-5 w-5 shrink-0 transition-transform', isActive && 'scale-110')} />
                {count > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold leading-none text-secondary">
                    <span aria-hidden="true">{countText(count)}</span>
                    <span className="sr-only">{count} para analisar</span>
                  </span>
                )}
              </span>
              <span className="line-clamp-2 w-full px-1">{item.label}</span>
            </Link>
          )
        })}
        {isSuperadmin && (
          <button
            type="button"
            onClick={() => setAdvancedSheetOpen(open => !open)}
            aria-expanded={advancedSheetOpen}
            className={cn(
              'flex-1 shrink-0 flex flex-col items-center justify-center py-1 rounded-xl text-[11px] leading-tight font-medium transition-all min-w-16 max-w-24 text-center gap-1',
              advancedActive || advancedSheetOpen
                ? 'bg-white/15 text-white font-semibold shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            )}
          >
            <SlidersHorizontal className={cn('h-5 w-5 shrink-0 transition-transform', advancedActive && 'scale-110')} />
            <span className="line-clamp-2 w-full px-1">Avançado</span>
          </button>
        )}
      </nav>

      {isSuperadmin && (
        <Sheet open={advancedSheetOpen} onOpenChange={setAdvancedSheetOpen}>
          {/* Fica acima da barra inferior (bottom-16), que continua à vista. */}
          <SheetContent side="bottom" className="bottom-16 max-h-[70vh] gap-0 rounded-t-2xl pb-2 lg:hidden">
            <SheetHeader className="pb-2">
              <SheetTitle>Avançado</SheetTitle>
              <SheetDescription>Histórico, acessos, e-mails e telas da Digital Saúde.</SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 overflow-y-auto px-4 pb-2">
              {advancedLinks.map(item => {
                const Icon = item.icon
                const isActive = isLinkActive(pathname, item)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setAdvancedSheetOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs transition-colors',
                      isActive
                        ? 'border-secondary/20 bg-accent font-semibold text-secondary'
                        : 'border-border/70 font-medium text-foreground hover:bg-muted'
                    )}
                  >
                    <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="line-clamp-2 leading-tight">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </TooltipProvider>
  )
}
