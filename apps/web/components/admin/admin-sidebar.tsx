'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { useAdminSidebarContext } from '@/app/[tenant]/admin/layout'
import { cn, getInitials } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  UserCog,
  UsersRound,
  Handshake,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Bell,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function AdminSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { tenant } = useTenant()
  const { isCollapsed, toggleSidebar } = useAdminSidebarContext()

  if (!tenant) return null

  const base = `/${tenant.slug}/admin`
  const sidebarLinks = [
    { href: base, label: 'Dashboard', icon: LayoutDashboard },
    { href: `${base}/usuarios`, label: 'Usuários', icon: Users },
    { href: `${base}/vendedores`, label: 'Vendedores', icon: UserCog },
    { href: `${base}/clientes`, label: 'Clientes', icon: UsersRound },
    { href: `${base}/parceiros`, label: 'Parceiros', icon: Handshake },
    { href: `${base}/planos`, label: 'Planos', icon: Wallet },
    { href: `${base}/relatorios`, label: 'Relatórios', icon: BarChart3 },
    { href: `${base}/configuracoes`, label: 'Configurações', icon: Settings },
  ]

  return (
    <TooltipProvider delayDuration={100}>
      {/* Mobile Top Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-border z-40 flex items-center justify-between px-4">
        {tenant.branding.logoUrl ? (
          <img src={tenant.branding.logoUrl} alt={tenant.name} className="h-7 object-contain" />
        ) : (
          <span className="font-bold text-foreground truncate max-w-[180px]">{tenant.name}</span>
        )}
        <div className="flex items-center gap-2">
          <button className="p-2 text-muted-foreground hover:text-foreground relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-secondary rounded-full" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors">
                <Avatar className="h-8 w-8 bg-secondary">
                  <AvatarFallback className="bg-secondary text-white text-xs">
                    {user?.name ? getInitials(user.name) : 'AD'}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 z-50">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground">Administrador</p>
              </div>
              <DropdownMenuItem asChild>
                <Link href={`${base}/configuracoes`}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-red-600">
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
          'hidden lg:flex fixed top-0 left-0 h-full bg-primary z-50 flex-col transition-all duration-300 ease-in-out border-r border-white/10 shadow-lg',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Logo and Toggle "Sextinha" button */}
        <div className="h-16 flex items-center justify-between px-3 border-b border-white/10">
          {!isCollapsed ? (
            <Link href={base} className="flex items-center gap-2 overflow-hidden">
              {(tenant.branding.logoLightUrl || tenant.branding.logoUrl) ? (
                <img
                  src={tenant.branding.logoLightUrl || tenant.branding.logoUrl}
                  alt={tenant.name}
                  className="h-8 object-contain"
                />
              ) : (
                <span className="font-bold text-white text-base truncate">{tenant.name}</span>
              )}
            </Link>
          ) : (
            <Link href={base} className="mx-auto flex items-center justify-center">
              {tenant.branding.logoUrl ? (
                <img src={tenant.branding.logoUrl} alt={tenant.name} className="h-7 w-7 object-contain" />
              ) : (
                <span className="font-bold text-white text-lg">{tenant.name.charAt(0)}</span>
              )}
            </Link>
          )}

          {/* Toggle Button ("Sextinha") */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleSidebar}
                className={cn(
                  'p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors',
                  isCollapsed && 'mx-auto'
                )}
                aria-label={isCollapsed ? 'Expandir Sidebar (Ctrl+B)' : 'Recolher Sidebar (Ctrl+B)'}
              >
                {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isCollapsed ? 'Expandir (Ctrl+B)' : 'Recolher (Ctrl+B)'}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto overflow-x-hidden space-y-1 scrollbar-translucent">
          <ul className="space-y-1">
            {sidebarLinks.map(link => {
              const Icon = link.icon
              const isActive = pathname === link.href

              const linkElement = (
                <Link
                  href={link.href}
                  className={cn(
                    'flex items-center rounded-lg text-sm font-medium transition-colors',
                    isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                    isActive
                      ? 'bg-white/15 text-white shadow-sm font-semibold'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {!isCollapsed && <span className="truncate">{link.label}</span>}
                </Link>
              )

              if (isCollapsed) {
                return (
                  <li key={link.href}>
                    <Tooltip>
                      <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
                      <TooltipContent side="right">{link.label}</TooltipContent>
                    </Tooltip>
                  </li>
                )
              }

              return <li key={link.href}>{linkElement}</li>
            })}
          </ul>
        </nav>

        {/* User Footer */}
        <div className="p-3 border-t border-white/10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'w-full flex items-center rounded-lg hover:bg-white/10 transition-colors',
                  isCollapsed ? 'justify-center p-2' : 'gap-3 p-2'
                )}
              >
                <Avatar className="h-9 w-9 bg-secondary shrink-0">
                  <AvatarFallback className="bg-secondary text-white text-sm font-medium">
                    {user?.name ? getInitials(user.name) : 'AD'}
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                      <p className="text-xs text-white/60 truncate">Administrador</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-white/60 shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isCollapsed ? 'start' : 'end'} side="right" className="w-56 z-50">
              <DropdownMenuItem asChild>
                <Link href={`${base}/configuracoes`}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile Horizontal Scrollable Bottombar */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-primary border-t border-white/10 z-[100] flex items-center overflow-x-auto px-2 gap-1 scrollbar-none shadow-2xl"
        aria-label="Navegação móvel"
      >
        {[
          { href: base, label: 'Dashboard', icon: LayoutDashboard },
          { href: `${base}/usuarios`, label: 'Usuários', icon: Users },
          { href: `${base}/vendedores`, label: 'Vendedores', icon: UserCog },
          { href: `${base}/clientes`, label: 'Clientes', icon: UsersRound },
          { href: `${base}/parceiros`, label: 'Parceiros', icon: Handshake },
          { href: `${base}/planos`, label: 'Planos', icon: Wallet },
          { href: `${base}/relatorios`, label: 'Relatórios', icon: BarChart3 },
          { href: `${base}/configuracoes`, label: 'Config', icon: Settings },
        ].map(link => {
          const Icon = link.icon
          const isActive = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex-shrink-0 flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-medium transition-all min-w-[66px] max-w-[85px] text-center gap-1',
                isActive
                  ? 'bg-white/20 text-white font-semibold shadow-sm'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              )}
            >
              <Icon className={cn('h-5 w-5 shrink-0 transition-transform', isActive && 'scale-110')} />
              <span className="truncate w-full px-1">{link.label}</span>
            </Link>
          )
        })}
      </nav>
    </TooltipProvider>
  )
}

