'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Headset, Heart, Menu } from 'lucide-react'
import { useTenant } from '@/contexts/tenant-context'
import { useTenantData } from '@/contexts/tenant-data-context'
import { useAdminSidebarContext } from '@/app/[tenant]/admin/layout'
import {
  adminNavGroups,
  adminNavHome,
  adminNavHref,
  adminNavItems,
  adminNavKey,
  adminNavMobileBar,
  isAdminNavItemActive,
  type AdminNavBadge,
  type AdminNavItem,
} from './admin-nav'
import { AdminUserMenu } from './admin-user-menu'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { getBillingSettingsAction } from '@/lib/actions/faturamento-api'
import { RECEIVING_ACCOUNT_CHANGED_EVENT } from '@/lib/receiving-account-events'
import { getReceivingAccountAction } from '@/lib/actions/faturamento-api'
import { SUPPORT_EMAIL } from '@/lib/support-contact'
import { cn } from '@/lib/utils'
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

/** Atendimento que ainda espera a primeira resposta do clube. */
const AWAITING_SUPPORT = new Set(['aguardando'])

/**
 * Dados vivos dos indicadores do menu: se o clube já tem conta de recebimento
 * e quantos atendimentos esperam resposta. Falha ao consultar a conta NÃO
 * acende o alerta (melhor calar do que acusar sem saber).
 */
function useNavIndicators(slug: string) {
  const { appointments } = useTenantData()
  const [receivingMissing, setReceivingMissing] = useState(false)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    async function check() {
      try {
        const result = await getBillingSettingsAction(slug)
        // Só o gateway Asaas pede conta própria; nos demais não há o que conectar.
        if (!cancelled && result.success) {
          const missing = result.data.gateway === 'asaas' && !result.data.asaasConfigured
          let pendingDocs = false
          // Conta gerenciada pela ANNETEC com documento a enviar também é pendência.
          if (!missing && result.data.gateway === 'asaas') {
            const account = await getReceivingAccountAction(slug)
            pendingDocs = account.success && (account.data.managed?.pendingDocuments ?? 0) > 0
          }
          if (!cancelled) setReceivingMissing(missing || pendingDocs)
        }
      } catch {
        // Sem resposta: mantém o estado anterior.
      }
    }
    void check()
    function onChanged(event: Event) {
      const detail = (event as CustomEvent<{ connected?: boolean; pendingDocuments?: number }>).detail
      if (typeof detail?.connected === 'boolean') setReceivingMissing(!detail.connected || (detail.pendingDocuments ?? 0) > 0)
      else void check()
    }
    window.addEventListener(RECEIVING_ACCOUNT_CHANGED_EVENT, onChanged)
    return () => {
      cancelled = true
      window.removeEventListener(RECEIVING_ACCOUNT_CHANGED_EVENT, onChanged)
    }
  }, [slug])

  const supportWaiting = appointments.filter(item => AWAITING_SUPPORT.has(item.status)).length

  /** Contagem (número) ou alerta (true); `null` = sem indicador. */
  function badgeOf(badge: AdminNavBadge | undefined): number | true | null {
    if (badge === 'receiving-missing') return receivingMissing ? true : null
    if (badge === 'support-waiting') return supportWaiting > 0 ? supportWaiting : null
    return null
  }

  return { badgeOf, receivingMissing, supportWaiting }
}

/** Indicador do item: ponto âmbar (alerta) ou contador. */
function NavBadge({ value, inline = false, label }: { value: number | true; inline?: boolean; label: string }) {
  if (value === true) {
    return (
      <span
        role="img"
        aria-label={label}
        className={cn(
          'h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500 ring-2 ring-card',
          !inline && 'absolute right-1.5 top-1.5',
        )}
      />
    )
  }
  return (
    <span
      aria-label={label}
      className={cn(
        'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground',
        !inline && 'absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[10px]',
      )}
    >
      {value > 99 ? '99+' : value}
    </span>
  )
}

function badgeLabel(item: AdminNavItem, value: number | true): string {
  if (item.badge === 'receiving-missing') return 'Conta de recebimento com pendência'
  return typeof value === 'number' ? `${value} aguardando resposta` : ''
}

export function AdminSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')
  const { tenant } = useTenant()
  const { isCollapsed, toggleSidebar } = useAdminSidebarContext()
  const [menuOpen, setMenuOpen] = useState(false)
  const { badgeOf } = useNavIndicators(tenant?.slug ?? '')

  const base = tenant ? `/${tenant.slug}/admin` : ''
  const activeOf = (item: AdminNavItem) => isAdminNavItemActive(pathname, base, item, currentTab)
  const financeActive = adminNavGroups.find(group => group.label === 'Financeiro')?.items.some(activeOf) ?? false
  // Atalho "Financeiro" da barra inferior acende em qualquer tela do grupo.
  const mobileBarActive = (item: AdminNavItem) =>
    item.label === 'Financeiro' ? financeActive : activeOf(item)
  // O "Menu" acende quando a página atual só existe nele (fora dos atalhos).
  const menuActive = adminNavItems.some(activeOf) && !adminNavMobileBar.some(mobileBarActive)

  // A folha do mobile fecha ao trocar de página.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname, currentTab])

  if (!tenant) return null

  const logo = tenant.branding.logoUrl

  const helpCard = (
    <Link
      href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Suporte do painel do clube')}`}
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
              Fale com a ANNETEC
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </>
      )}
    </Link>
  )

  /** Link da sidebar do desktop. */
  function desktopLink(item: AdminNavItem) {
    const href = adminNavHref(base, item.segment, item.tab)
    const Icon = item.icon
    const isActive = activeOf(item)
    const badge = badgeOf(item.badge)
    const label = badge !== null ? badgeLabel(item, badge) : ''

    const link = (
      <Link
        href={href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'relative flex items-center rounded-lg text-sm transition-colors',
          isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2',
          isActive
            ? 'bg-primary/10 font-semibold text-primary'
            : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        {!isCollapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {badge !== null && <NavBadge value={badge} inline={!isCollapsed} label={label} />}
      </Link>
    )

    return (
      <li key={adminNavKey(item)}>
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">
              {item.label}
              {label && <span className="block text-xs opacity-80">{label}</span>}
            </TooltipContent>
          </Tooltip>
        ) : (
          link
        )}
      </li>
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
          <ul className="space-y-0.5">{desktopLink(adminNavHome)}</ul>
          {adminNavGroups.map(group => (
            <div key={group.label} className="mt-4">
              {isCollapsed ? (
                <div className="mx-2 mb-2 h-px bg-border" role="separator" />
              ) : (
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">{group.items.map(item => desktopLink(item))}</ul>
            </div>
          ))}
        </nav>

        <div className="space-y-2 p-3">
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>{helpCard}</TooltipTrigger>
              <TooltipContent side="right">Precisa de ajuda? Fale com a ANNETEC</TooltipContent>
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

      {/* Barra inferior do mobile: quatro atalhos e "Menu" (a folha com todos os
          grupos). Em ~360px cada coluna tem ~70px: margem e vão mínimos e
          rótulo de 10px (11px a partir de 400px) para caber sem reticências. */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-100 grid h-16 grid-cols-5 items-center gap-0.5 border-t border-border bg-card px-1 shadow-[0_-2px_12px_rgba(15,23,42,0.06)] min-[400px]:gap-1 min-[400px]:px-2 lg:hidden"
        aria-label="Navegação móvel"
      >
        {adminNavMobileBar.map(item => {
          const href = adminNavHref(base, item.segment)
          const Icon = item.icon
          const isActive = mobileBarActive(item)
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
        <button
          type="button"
          onClick={() => setMenuOpen(open => !open)}
          aria-expanded={menuOpen}
          className={cn(
            'relative flex h-13 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-center text-[10px] font-medium tracking-tight transition-all min-[400px]:text-[11px] min-[400px]:tracking-normal',
            menuActive || menuOpen
              ? 'bg-primary/10 font-semibold text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Menu className={cn('h-5 w-5 shrink-0 transition-transform', menuActive && 'scale-110')} />
          <span className="w-full truncate px-0.5">Menu</span>
          {(badgeOf('receiving-missing') !== null || badgeOf('support-waiting') !== null) && (
            <span className="absolute right-3 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-card" aria-hidden />
          )}
        </button>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        {/* Fica acima da barra inferior (bottom-16), que continua à vista. */}
        <SheetContent side="bottom" className="bottom-16 max-h-[78vh] gap-0 rounded-t-2xl pb-2 lg:hidden">
          <SheetHeader className="pb-2">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Tudo o que o clube precisa para funcionar.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-2">
            {adminNavGroups.map(group => (
              <section key={group.label} aria-label={group.label}>
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {group.items.map(item => {
                    const Icon = item.icon
                    const isActive = activeOf(item)
                    const badge = badgeOf(item.badge)
                    return (
                      <Link
                        key={adminNavKey(item)}
                        href={adminNavHref(base, item.segment, item.tab)}
                        onClick={() => setMenuOpen(false)}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs transition-colors',
                          isActive
                            ? 'border-primary/30 bg-primary/10 font-semibold text-primary'
                            : 'border-border/70 font-medium text-foreground hover:bg-muted',
                        )}
                      >
                        <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                        <span className="line-clamp-2 leading-tight">{item.shortLabel ?? item.label}</span>
                        {badge !== null && <NavBadge value={badge} label={badgeLabel(item, badge)} />}
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))}
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
