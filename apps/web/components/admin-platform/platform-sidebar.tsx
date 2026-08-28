'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import { usePlatformSidebarContext } from '@/app/admin/layout'
import { cn, getInitials } from '@/lib/utils'
import {
  LayoutDashboard,
  Building2,
  Users,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  BookOpenText,
  ChevronDown,
  Activity,
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

const sidebarLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/inquilinos', label: 'Inquilinos', icon: Building2 },
  { href: '/admin/usuarios', label: 'Usuários da Plataforma', icon: Users },
  { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
]

export function PlatformSidebar() {
  const pathname = usePathname()
  const { user, logout } = usePlatformAuth()
  const { isCollapsed, toggleSidebar } = usePlatformSidebarContext()

  return (
    <TooltipProvider delayDuration={100}>
      {/* Mobile Top Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-border z-40 flex items-center justify-between px-4 shadow-sm">
        <Link href="/admin" className="flex items-center gap-2">
          <img src="/annetec.svg" alt="Annetec" className="h-7" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Superadmin</span>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 transition-colors">
              <Avatar className="h-8 w-8 bg-primary">
                <AvatarFallback className="bg-primary text-white text-xs font-medium">
                  {user?.name ? getInitials(user.name) : 'SA'}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 z-[110]">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground">Superadmin</p>
            </div>
            <DropdownMenuItem asChild>
              <Link href="/admin/configuracoes">
                <Settings className="mr-2 h-4 w-4" />
                Configurações
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/logs">
                <Activity className="mr-2 h-4 w-4" />
                Logs e Rastreabilidade
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/dicionario-ti">
                <BookOpenText className="mr-2 h-4 w-4" />
                Dicionário TI
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Desktop Collapsible Sidebar */}
      <aside
        className={cn(
          'hidden lg:flex fixed top-0 left-0 h-full bg-secondary z-50 flex-col transition-all duration-300 ease-in-out border-r border-white/10 shadow-lg',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Sidebar Header with Toggle "Sextinha" Button */}
        <div className="h-16 flex items-center justify-between px-3 border-b border-white/10">
          {!isCollapsed ? (
            <Link href="/admin" className="flex items-center gap-2 overflow-hidden">
              <img src="/annetec-light.svg" alt="Annetec" className="h-7 shrink-0" />
              <span className="text-white/60 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                Superadmin
              </span>
            </Link>
          ) : (
            <Link href="/admin" className="mx-auto flex items-center justify-center">
              <img src="/favicon.png" alt="Annetec" className="h-7 w-7 object-contain" />
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

        {/* Navigation Links */}
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

        {/* Bottom Section */}
        <div className="p-3 border-t border-white/10 space-y-1">
          {/* Logs e Rastreabilidade */}
          {(() => {
            const isLogsActive = pathname === '/admin/logs'
            const logsElement = (
              <Link
                href="/admin/logs"
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium transition-colors mb-2',
                  isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                  isLogsActive
                    ? 'bg-white/15 text-white shadow-sm font-semibold'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <Activity className="h-5 w-5 shrink-0" />
                {!isCollapsed && <span className="truncate">Logs e Rastreabilidade</span>}
              </Link>
            )

            if (isCollapsed) {
              return (
                <Tooltip>
                  <TooltipTrigger asChild>{logsElement}</TooltipTrigger>
                  <TooltipContent side="right">Logs e Rastreabilidade</TooltipContent>
                </Tooltip>
              )
            }
            return logsElement
          })()}

          {/* Dicionário TI */}
          {(() => {
            const isDictActive = pathname === '/admin/dicionario-ti'
            const dictElement = (
              <Link
                href="/admin/dicionario-ti"
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium transition-colors mb-2',
                  isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                  isDictActive
                    ? 'bg-white/15 text-white shadow-sm font-semibold'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <BookOpenText className="h-5 w-5 shrink-0" />
                {!isCollapsed && <span className="truncate">Dicionário TI</span>}
              </Link>
            )

            if (isCollapsed) {
              return (
                <Tooltip>
                  <TooltipTrigger asChild>{dictElement}</TooltipTrigger>
                  <TooltipContent side="right">Dicionário TI</TooltipContent>
                </Tooltip>
              )
            }
            return dictElement
          })()}

          {/* User Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'w-full flex items-center rounded-lg hover:bg-white/10 transition-colors',
                  isCollapsed ? 'justify-center p-2' : 'gap-3 p-2'
                )}
              >
                <Avatar className="h-9 w-9 bg-primary shrink-0">
                  <AvatarFallback className="bg-primary text-white text-sm font-medium">
                    {user?.name ? getInitials(user.name) : 'SA'}
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                      <p className="text-xs text-white/60 truncate">
                        {user?.platformRole === 'superadmin' ? 'Superadmin' : 'Padrão'}
                      </p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-white/60 shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isCollapsed ? 'start' : 'end'} side="right" className="w-56 z-50">
              <DropdownMenuItem asChild>
                <Link href="/admin/configuracoes">
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
        className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#1e2a4a] border-t border-white/10 z-[100] flex items-center justify-around px-2 shadow-2xl overflow-x-auto scrollbar-none"
        aria-label="Navegação móvel"
      >
        {[
          { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
          { href: '/admin/inquilinos', label: 'Inquilinos', icon: Building2 },
          { href: '/admin/usuarios', label: 'Usuários', icon: Users },
          { href: '/admin/configuracoes', label: 'Config', icon: Settings },
          { href: '/admin/logs', label: 'Logs', icon: Activity },
          { href: '/admin/dicionario-ti', label: 'Dicionário', icon: BookOpenText },
        ].map(link => {
          const Icon = link.icon
          const isActive = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex-1 flex-shrink-0 flex flex-col items-center justify-center py-1 rounded-xl text-[11px] font-medium transition-all min-w-[62px] max-w-[85px] text-center gap-1',
                isActive
                  ? 'bg-white/15 text-white font-semibold shadow-sm'
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

