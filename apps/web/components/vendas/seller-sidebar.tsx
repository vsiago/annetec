'use client'

import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronsUpDown, FileSignature, KanbanSquare, LayoutDashboard, Link2, LogOut, Wallet } from 'lucide-react'
import { PLATFORM_ROLE_LABELS } from '@annetec/contracts'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import { useSellerProfile } from '@/contexts/seller-profile-context'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { initialsOf } from '@/components/admin-platform/ui/entity-avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * Menu da área do vendedor ANNETEC (`/vendas`). Mesma linguagem visual do
 * menu do console (marinho, selos de ícone, item ativo com traço coral), sem
 * nada da equipe: só as telas do próprio vendedor, o sino dele e a conta.
 */

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const SELLER_NAV: NavItem[] = [
  { href: '/vendas', label: 'Painel', icon: LayoutDashboard },
  { href: '/vendas/funil', label: 'Funil', icon: KanbanSquare },
  { href: '/vendas/propostas', label: 'Propostas', icon: FileSignature },
  { href: '/vendas/comissoes', label: 'Comissões', icon: Wallet },
  { href: '/vendas/meu-link', label: 'Meu link', icon: Link2 },
]

const ROLE = PLATFORM_ROLE_LABELS.platform_seller

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (href === '/vendas') return pathname === '/vendas'
  return pathname === href || pathname.startsWith(`${href}/`)
}

const focusDark = 'outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-0'

function IconSeal({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150',
        active
          ? 'bg-white text-primary shadow-[0_1px_2px_rgba(0,0,0,0.25)]'
          : 'bg-white/[0.07] text-white/80 ring-1 ring-inset ring-white/10 group-hover/item:bg-white/[0.13] group-hover/item:text-white',
      )}
    >
      <Icon className="size-[18px]" strokeWidth={active ? 2.25 : 2} />
    </span>
  )
}

function AccountAvatar({ name, className }: { name?: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#FDECEF] text-[13px] font-bold text-[#A51D41]',
        className,
      )}
    >
      {name ? initialsOf(name) : 'VA'}
    </span>
  )
}

export function SellerSidebar() {
  const pathname = usePathname()
  const { user, logout } = usePlatformAuth()
  const { profile } = useSellerProfile()

  const accountMenu = (
    <>
      <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
        <AccountAvatar name={user?.name} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{user?.name}</span>
          {user?.email ? <span className="truncate text-xs text-muted-foreground">{user.email}</span> : null}
          <span className="truncate text-xs text-muted-foreground">
            {ROLE}
            {profile ? ` · código ${profile.referralCode}` : ''}
          </span>
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild className="min-h-10 cursor-pointer gap-2">
        <Link href="/vendas/meu-link">
          <Link2 className="size-4" aria-hidden="true" />
          Meu link de indicação
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={logout} className="min-h-10 cursor-pointer gap-2 text-[#B42318] focus:text-[#B42318]">
        <LogOut className="size-4" aria-hidden="true" />
        Sair
      </DropdownMenuItem>
    </>
  )

  return (
    <>
      {/* Topo do celular: marca, sino e conta. */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-white/95 px-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] backdrop-blur supports-[backdrop-filter]:bg-white/85 lg:hidden">
        <Link href="/vendas" className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-secondary/40">
          <img src="/annetec.svg" alt="ANNETEC" className="h-8 w-auto" />
          <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
            Vendas
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell variant="mobile" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
                aria-label={`Conta: ${user?.name ?? 'sua conta'} (${ROLE})`}
              >
                <AccountAvatar name={user?.name} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-110 w-64 rounded-xl">
              {accountMenu}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Menu lateral do desktop. */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col bg-secondary text-white shadow-[1px_0_0_rgba(255,255,255,0.06),4px_0_24px_-12px_rgba(16,24,40,0.35)] lg:flex">
        <div className="flex h-[76px] shrink-0 items-center px-5">
          <Link href="/vendas" aria-label="ANNETEC — Painel de vendas" className={cn('flex items-center gap-2.5 overflow-hidden rounded-lg', focusDark)}>
            <img src="/annetec-light.svg" alt="" className="h-9 w-auto shrink-0" />
            <span className="whitespace-nowrap rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/85 ring-1 ring-inset ring-white/15">
              Vendas
            </span>
          </Link>
        </div>
        <div className="mx-4 h-px shrink-0 bg-white/10" aria-hidden="true" />

        <nav className="scrollbar-translucent flex-1 overflow-y-auto overflow-x-hidden px-3 py-4" aria-label="Menu de vendas">
          <p id="menu-vendas" className="m-0 mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60">
            Minhas vendas
          </p>
          <ul className="space-y-1" aria-labelledby="menu-vendas">
            {SELLER_NAV.map(item => {
              const active = isActive(pathname, item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group/item relative flex min-h-11 items-center gap-3 rounded-xl px-1.5 py-1.5 text-sm transition-colors duration-150',
                      focusDark,
                      active ? 'bg-white/[0.09] font-semibold text-white' : 'font-medium text-white/75 hover:bg-white/[0.06] hover:text-white',
                    )}
                  >
                    {active && (
                      <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" aria-hidden="true" />
                    )}
                    <IconSeal icon={item.icon} active={active} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="shrink-0 space-y-1 border-t border-white/10 p-3">
          <NotificationBell variant="sidebar" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl bg-white/[0.06] p-2 text-left ring-1 ring-inset ring-white/10 transition-colors duration-150 hover:bg-white/10',
                  focusDark,
                )}
                aria-label={`Conta: ${user?.name ?? 'sua conta'} (${ROLE})`}
              >
                <AccountAvatar name={user?.name} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-white">{user?.name}</span>
                  <span className="truncate text-xs text-white/65">{ROLE}</span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-white/60" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" sideOffset={14} className="z-110 w-64 rounded-xl">
              {accountMenu}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Barra inferior do celular. */}
      <nav
        className="scrollbar-none fixed inset-x-0 bottom-0 z-100 flex h-16 items-stretch overflow-x-auto bg-secondary px-1 shadow-[0_-6px_20px_-8px_rgba(16,24,40,0.35)] lg:hidden"
        aria-label="Navegação móvel"
      >
        {SELLER_NAV.map(item => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group/item relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0 text-center text-[10px] leading-tight tracking-tight transition-colors duration-150',
                focusDark,
                active ? 'font-semibold text-white' : 'font-medium text-white/75 hover:text-white',
              )}
            >
              {active && (
                <span className="absolute left-1/2 top-0 h-[3px] w-7 -translate-x-1/2 rounded-b-full bg-primary" aria-hidden="true" />
              )}
              <IconSeal icon={item.icon} active={active} />
              <span className="line-clamp-2 w-full">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
