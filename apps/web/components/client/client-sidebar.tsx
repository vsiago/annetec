'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useTenant } from '@/contexts/tenant-context'
import { cn, getInitials } from '@/lib/utils'
import { isChargeLate } from '@/lib/adapters/cliente-assinatura'
import { useClubMembership } from '@/components/client/club-membership-provider'
import {
  LayoutDashboard,
  CreditCard,
  Users,
  Gift,
  Handshake,
  HeadphonesIcon,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Bell,
  Phone,
  Receipt,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export function ClientSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { tenant } = useTenant()
  const { membership } = useClubMembership()
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!tenant) return null

  // Faturas em aberto da assinatura do clube: contador no menu, vermelho se alguma venceu.
  const openCharges = membership?.openCharges ?? []
  const hasLateCharge = openCharges.some(isChargeLate)

  const base = `/${tenant.slug}/cliente`
  const sidebarLinks: { href: string; label: string; icon: typeof LayoutDashboard; badge?: number }[] = [
    { href: base, label: 'Meu Painel', icon: LayoutDashboard },
    { href: `${base}/carteirinha`, label: 'Carteirinha Digital', icon: CreditCard },
    {
      href: `${base}/faturas`,
      label: 'Minhas faturas',
      icon: Receipt,
      badge: openCharges.length > 0 ? openCharges.length : undefined,
    },
    { href: `${base}/dependentes`, label: 'Dependentes', icon: Users },
    { href: `${base}/beneficios`, label: 'Benefícios', icon: Gift },
    { href: `${base}/parceiros`, label: 'Rede de Parceiros', icon: Handshake },
    { href: `${base}/suporte`, label: 'Suporte', icon: HeadphonesIcon },
    { href: `${base}/configuracoes`, label: 'Configurações', icon: Settings },
  ]

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-border z-50 flex items-center justify-between px-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <Menu className="h-6 w-6" />
        </button>
        {tenant.branding.logoUrl ? (
          <img src={tenant.branding.logoUrl} alt={tenant.name} className="h-8" />
        ) : (
          <span className="font-bold text-foreground">{tenant.name}</span>
        )}
        <div className="flex items-center gap-2">
          {hasLateCharge ? (
            <Link
              href={`${base}/faturas`}
              className="p-2 text-muted-foreground hover:text-foreground relative"
              aria-label="Você tem fatura vencida"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
            </Link>
          ) : (
            <button className="p-2 text-muted-foreground hover:text-foreground relative">
              <Bell className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-64 bg-primary z-50 flex flex-col transition-transform duration-300 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          <Link href={base}>
            {(tenant.branding.logoLightUrl || tenant.branding.logoUrl) ? (
              <img src={tenant.branding.logoLightUrl || tenant.branding.logoUrl} alt={tenant.name} className="h-9 object-contain" />
            ) : (
              <span className="font-bold text-white text-lg">{tenant.name}</span>
            )}
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-2 -mr-2 text-white/60 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Central do clube */}
        {tenant.phone && (
          <div className="mx-4 mt-4 p-3 rounded-lg bg-secondary/20 border border-secondary/30">
            <div className="flex items-center gap-2 text-white">
              <Phone className="h-4 w-4" />
              <span className="text-sm font-medium">Central do clube</span>
            </div>
            <p className="text-xs text-white/70 mt-1">{tenant.phone}</p>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-1">
            {sidebarLinks.map(link => {
              const Icon = link.icon
              const isActive = pathname === link.href
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {link.label}
                    {link.badge !== undefined && (
                      <span
                        className={cn(
                          'ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold',
                          hasLateCharge ? 'bg-red-500 text-white' : 'bg-white/20 text-white',
                        )}
                        aria-label={`${link.badge} em aberto`}
                      >
                        {link.badge}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* User */}
        <div className="p-4 border-t border-white/10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                <Avatar className="h-9 w-9 bg-secondary">
                  <AvatarFallback className="bg-secondary text-white text-sm">
                    {user?.name ? getInitials(user.name) : 'CL'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                  <p className="text-xs text-white/60">Associado</p>
                </div>
                <ChevronDown className="h-4 w-4 text-white/60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href={`${base}/configuracoes`}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`${base}/carteirinha`}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Minha Carteirinha
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
    </>
  )
}
