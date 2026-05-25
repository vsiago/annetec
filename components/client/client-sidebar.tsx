'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard,
  CreditCard,
  Users,
  Gift,
  HeadphonesIcon,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Bell,
  Phone,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const sidebarLinks = [
  { href: '/cliente', label: 'Meu Painel', icon: LayoutDashboard },
  { href: '/cliente/carteirinha', label: 'Carteirinha Digital', icon: CreditCard },
  { href: '/cliente/dependentes', label: 'Dependentes', icon: Users },
  { href: '/cliente/beneficios', label: 'Benefícios', icon: Gift },
  { href: '/cliente/suporte', label: 'Suporte', icon: HeadphonesIcon },
  { href: '/cliente/configuracoes', label: 'Configurações', icon: Settings },
]

export function ClientSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

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
        <img
          src="/annetec.svg"
          alt="Annetec"
          className="h-8"
        />
        <div className="flex items-center gap-2">
          <button className="p-2 text-muted-foreground hover:text-foreground relative">
            <Bell className="h-5 w-5" />
          </button>
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
          'fixed top-0 left-0 h-full w-64 bg-[#1c3670] z-50 flex flex-col transition-transform duration-300 lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          <Link href="/cliente">
            <img
              src="/annetec-light.svg"
              alt="Annetec"
              className="h-8"
            />
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-2 -mr-2 text-white/60 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Teleorientation Banner */}
        <div className="mx-4 mt-4 p-3 rounded-lg bg-[#e5375b]/20 border border-[#e5375b]/30">
          <div className="flex items-center gap-2 text-white">
            <Phone className="h-4 w-4" />
            <span className="text-sm font-medium">Teleorientação 24h</span>
          </div>
          <p className="text-xs text-white/70 mt-1">0800 000 0000</p>
        </div>

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
                <Avatar className="h-9 w-9 bg-[#e5375b]">
                  <AvatarFallback className="bg-[#e5375b] text-white text-sm">
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
                <Link href="/cliente/configuracoes">
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/cliente/carteirinha">
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
