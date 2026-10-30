'use client'

import { useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import { usePlatformSidebarContext } from '@/app/admin/layout'
import { getOnboardingQueueSummaryAction } from '@/lib/actions/platform-onboarding-api'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { initialsOf } from '@/components/admin-platform/ui/entity-avatar'
import { cn } from '@/lib/utils'
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
  ChevronDown,
  ChevronsUpDown,
  Activity,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
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

interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * Menu principal em grupos com rótulo (Operação, Financeiro, Equipe) — os
 * mesmos itens e a mesma ordem no desktop e no mobile.
 */
const navGroups: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { href: '/admin', label: 'Início', icon: LayoutDashboard },
      { href: '/admin/inquilinos', label: 'Clubes', icon: Building2 },
      { href: '/admin/compliance', label: 'Aprovações', icon: ShieldCheck, showWaitingCount: true },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { href: '/admin/financeiro', label: 'Financeiro', icon: Receipt },
      { href: '/admin/configuracoes', label: 'Planos e preços', icon: Tags },
    ],
  },
  {
    label: 'Equipe',
    items: [{ href: '/admin/usuarios', label: 'Equipe ANNETEC', icon: Users }],
  },
]

/** Os mesmos itens, sem os grupos (barra inferior do celular). */
const mainLinks: NavItem[] = navGroups.flatMap(group => group.items)

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

/** Papel da equipe, nos mesmos nomes da tela Equipe ANNETEC. */
const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Superadmin',
  platform_admin: 'Padrão (operacional)',
}

function roleLabel(role: string | null | undefined): string {
  return (role && ROLE_LABEL[role]) || 'Equipe ANNETEC'
}

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

/** Foco visível no menu escuro. */
const focusDark = 'outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-0'

/**
 * Selo do ícone do item: quadrado arredondado translúcido; no item ativo vira
 * branco com o ícone em coral (a cor da marca, sem texto pequeno em cima).
 */
function IconSeal({
  icon: Icon,
  active,
  small = false,
  dot = false,
}: {
  icon: LucideIcon
  active: boolean
  small?: boolean
  /** Ponto coral no canto (contador do menu recolhido). */
  dot?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150',
        small ? 'size-7' : 'size-8',
        active
          ? 'bg-white text-primary shadow-[0_1px_2px_rgba(0,0,0,0.25)]'
          : 'bg-white/[0.07] text-white/80 ring-1 ring-inset ring-white/10 group-hover/item:bg-white/[0.13] group-hover/item:text-white',
      )}
    >
      <Icon className={small ? 'size-3.5' : 'size-[18px]'} strokeWidth={active ? 2.25 : 2} />
      {dot ? <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-primary ring-2 ring-secondary" /> : null}
    </span>
  )
}

/** Avatar de iniciais da conta (coral suave, texto coral escuro: contraste 6:1). */
function AccountAvatar({ name, className }: { name?: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#FDECEF] text-[13px] font-bold text-[#A51D41]',
        className,
      )}
    >
      {name ? initialsOf(name) : 'AN'}
    </span>
  )
}

export function PlatformSidebar() {
  const pathname = usePathname()
  const { user, logout } = usePlatformAuth()
  const { isCollapsed, toggleSidebar } = usePlatformSidebarContext()
  const waiting = useWaitingApprovals(pathname)

  const isSuperadmin = user?.platformRole === 'superadmin'
  const role = roleLabel(user?.platformRole)
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

  /** Link da sidebar do desktop; `nested` são os itens do grupo Avançado. */
  function desktopLink(item: NavItem, nested = false) {
    const isActive = isLinkActive(pathname, item)
    const count = item.showWaitingCount && waiting ? waiting : 0

    const linkElement = (
      <Link
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        aria-label={isCollapsed ? waitingLabel(item) : undefined}
        className={cn(
          'group/item relative flex items-center rounded-xl text-sm transition-colors duration-150',
          focusDark,
          isCollapsed ? 'mx-auto size-11 justify-center' : 'min-h-11 gap-3 px-1.5 py-1.5',
          isActive
            ? 'bg-white/[0.09] font-semibold text-white'
            : 'font-medium text-white/75 hover:bg-white/[0.06] hover:text-white',
        )}
      >
        {isActive && (
          <span
            className={cn(
              'absolute top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary',
              isCollapsed ? '-left-[18px]' : '-left-3',
            )}
            aria-hidden="true"
          />
        )}
        <IconSeal icon={item.icon} active={isActive} small={nested} dot={isCollapsed && count > 0} />
        {!isCollapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {!isCollapsed && count > 0 && (
          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold leading-none text-secondary tabular-nums">
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
            <TooltipContent side="right" sideOffset={10}>
              {waitingLabel(item)}
            </TooltipContent>
          </Tooltip>
        </li>
      )
    }

    return <li key={item.href}>{linkElement}</li>
  }

  /**
   * Grupo Avançado. Expandida, o próprio rótulo do grupo abre e fecha a lista;
   * recolhida não cabe o acordeão: vira um menu flutuante ao lado do selo.
   */
  function advancedGroup() {
    if (isCollapsed) {
      return (
        <div className="mt-3 border-t border-white/10 pt-3">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Avançado"
                    className={cn(
                      'group/item relative mx-auto flex size-11 items-center justify-center rounded-xl transition-colors duration-150',
                      focusDark,
                      advancedActive ? 'bg-white/[0.09]' : 'hover:bg-white/[0.06]',
                    )}
                  >
                    {advancedActive && (
                      <span
                        className="absolute -left-[18px] top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                        aria-hidden="true"
                      />
                    )}
                    <IconSeal icon={SlidersHorizontal} active={advancedActive} />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                Avançado
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              side="right"
              align="start"
              sideOffset={14}
              className="z-110 max-h-[75vh] w-72 overflow-y-auto rounded-xl p-1.5"
            >
              <DropdownMenuLabel className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
                        'min-h-10 cursor-pointer gap-3 rounded-lg py-1.5',
                        isActive && 'bg-accent font-semibold text-secondary focus:bg-accent focus:text-secondary',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'inline-flex size-7 shrink-0 items-center justify-center rounded-lg',
                          isActive ? 'bg-[#FDECEF] text-primary' : 'bg-accent text-secondary',
                        )}
                      >
                        <ItemIcon className="size-3.5" />
                      </span>
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    }

    return (
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="mt-5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors duration-150',
              focusDark,
              'text-white/60 hover:bg-white/[0.06] hover:text-white',
            )}
          >
            <span className="flex-1 text-left">Avançado</span>
            {advancedActive && !advancedOpen && (
              <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            )}
            <ChevronDown
              className={cn('size-4 shrink-0 transition-transform duration-200', advancedOpen && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <ul className="mt-1 space-y-0.5">{advancedLinks.map(item => desktopLink(item, true))}</ul>
        </CollapsibleContent>
      </Collapsible>
    )
  }

  const accountMenu = (
    <>
      <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
        <AccountAvatar name={user?.name} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{user?.name}</span>
          {user?.email ? <span className="truncate text-xs text-muted-foreground">{user.email}</span> : null}
          <span className="truncate text-xs text-muted-foreground">{role}</span>
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={logout} className="min-h-10 cursor-pointer gap-2 text-[#B42318] focus:text-[#B42318]">
        <LogOut className="size-4" aria-hidden="true" />
        Sair
      </DropdownMenuItem>
    </>
  )

  return (
    <TooltipProvider delayDuration={100}>
      {/* Topo do celular: marca, sino e conta. */}
      <header className="lg:hidden fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-white/95 px-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <Link href="/admin" className={cn('flex items-center gap-2.5 rounded-lg', 'outline-none focus-visible:ring-2 focus-visible:ring-secondary/40')}>
          <img src="/annetec.svg" alt="ANNETEC" className="h-8 w-auto" />
          <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
            Console
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell variant="mobile" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
                aria-label={`Conta: ${user?.name ?? 'sua conta'} (${role})`}
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

      {/* Menu lateral do desktop (recolhível). */}
      <aside
        className={cn(
          'hidden lg:flex fixed inset-y-0 left-0 z-50 flex-col bg-secondary text-white shadow-[1px_0_0_rgba(255,255,255,0.06),4px_0_24px_-12px_rgba(16,24,40,0.35)] transition-[width] duration-300 ease-in-out',
          isCollapsed ? 'w-20' : 'w-64',
        )}
      >
        {/* Marca. O botão de recolher/expandir fica no rodapé. */}
        <div className={cn('flex h-[76px] shrink-0 items-center', isCollapsed ? 'justify-center px-3' : 'px-5')}>
          {!isCollapsed ? (
            <Link
              href="/admin"
              aria-label="ANNETEC — Início do console"
              className={cn('flex items-center gap-2.5 overflow-hidden rounded-lg', focusDark)}
            >
              <img src="/annetec-light.svg" alt="" className="h-9 w-auto shrink-0" />
              <span className="whitespace-nowrap rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/85 ring-1 ring-inset ring-white/15">
                Console
              </span>
            </Link>
          ) : (
            <Link
              href="/admin"
              aria-label="ANNETEC — Início do console"
              className={cn(
                'flex size-11 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10',
                focusDark,
              )}
            >
              <img src="/favicon.png" alt="" className="size-7 object-contain" />
            </Link>
          )}
        </div>
        <div className="mx-4 h-px shrink-0 bg-white/10" aria-hidden="true" />

        {/* Navegação em grupos. */}
        <nav
          className="scrollbar-translucent flex-1 overflow-y-auto overflow-x-hidden px-3 py-4"
          aria-label="Menu do console"
        >
          {navGroups.map((group, index) => {
            const labelId = `menu-grupo-${index}`
            return (
              <div key={group.label} className={cn(index > 0 && (isCollapsed ? 'mt-3 border-t border-white/10 pt-3' : 'mt-5'))}>
                {!isCollapsed ? (
                  <p
                    id={labelId}
                    className="m-0 mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/60"
                  >
                    {group.label}
                  </p>
                ) : null}
                <ul
                  className="space-y-1"
                  aria-labelledby={isCollapsed ? undefined : labelId}
                  aria-label={isCollapsed ? group.label : undefined}
                >
                  {group.items.map(item => desktopLink(item))}
                </ul>
              </div>
            )
          })}

          {isSuperadmin && advancedGroup()}
        </nav>

        {/* Rodapé: notificações, conta e recolher. */}
        <div className="shrink-0 space-y-1 border-t border-white/10 p-3">
          {/* Notificações em tempo real (todos os clubes) */}
          <NotificationBell variant={isCollapsed ? 'sidebar-collapsed' : 'sidebar'} />

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center rounded-xl text-left transition-colors duration-150',
                      focusDark,
                      isCollapsed
                        ? 'mx-auto size-11 justify-center hover:bg-white/[0.06]'
                        : 'gap-3 bg-white/[0.06] p-2 ring-1 ring-inset ring-white/10 hover:bg-white/10',
                    )}
                    aria-label={`Conta: ${user?.name ?? 'sua conta'} (${role})`}
                  >
                    <AccountAvatar name={user?.name} />
                    {!isCollapsed && (
                      <>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold text-white">{user?.name}</span>
                          <span className="truncate text-xs text-white/65">{role}</span>
                        </span>
                        <ChevronsUpDown className="size-4 shrink-0 text-white/60" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              {isCollapsed ? (
                <TooltipContent side="right" sideOffset={10}>
                  {user?.name} · {role}
                </TooltipContent>
              ) : null}
            </Tooltip>
            <DropdownMenuContent side="right" align="end" sideOffset={14} className="z-110 w-64 rounded-xl">
              {accountMenu}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Recolher/expandir: discreto, no rodapé (atalho Ctrl+B). */}
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  className={cn(
                    'mx-auto flex size-11 items-center justify-center rounded-xl text-white/65 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white',
                    focusDark,
                  )}
                  aria-label="Expandir menu"
                  aria-keyshortcuts="Control+B"
                >
                  <PanelLeftOpen className="size-[18px]" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                Expandir menu (Ctrl+B)
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={toggleSidebar}
              className={cn(
                'flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium text-white/65 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white',
                focusDark,
              )}
              aria-label="Recolher menu"
              aria-keyshortcuts="Control+B"
              title="Recolher menu (Ctrl+B)"
            >
              <PanelLeftClose className="size-[18px] shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate text-left">Recolher menu</span>
              <kbd className="rounded-md border border-white/15 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-white/60">
                Ctrl B
              </kbd>
            </button>
          )}
        </div>
      </aside>

      {/* Barra inferior do celular: o menu principal e, para superadmin, o
          "Avançado" que abre uma folha com os demais itens. */}
      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-100 flex h-16 items-stretch overflow-x-auto bg-secondary px-1 shadow-[0_-6px_20px_-8px_rgba(16,24,40,0.35)] scrollbar-none"
        aria-label="Navegação móvel"
      >
        {mainLinks.map(item => {
          const isActive = isLinkActive(pathname, item)
          const count = item.showWaitingCount && waiting ? waiting : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group/item relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0 text-center text-[10px] leading-tight tracking-tight transition-colors duration-150',
                focusDark,
                isActive ? 'font-semibold text-white' : 'font-medium text-white/75 hover:text-white',
              )}
            >
              {isActive && (
                <span
                  className="absolute left-1/2 top-0 h-[3px] w-7 -translate-x-1/2 rounded-b-full bg-primary"
                  aria-hidden="true"
                />
              )}
              <span className="relative">
                <IconSeal icon={item.icon} active={isActive} />
                {count > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold leading-none text-secondary ring-2 ring-secondary">
                    <span aria-hidden="true">{countText(count)}</span>
                    <span className="sr-only">{count} para analisar</span>
                  </span>
                )}
              </span>
              <span className="line-clamp-2 w-full">{item.label}</span>
            </Link>
          )
        })}
        {isSuperadmin && (
          <button
            type="button"
            onClick={() => setAdvancedSheetOpen(open => !open)}
            aria-expanded={advancedSheetOpen}
            className={cn(
              'group/item relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0 text-center text-[10px] leading-tight tracking-tight transition-colors duration-150',
              focusDark,
              advancedActive || advancedSheetOpen ? 'font-semibold text-white' : 'font-medium text-white/75 hover:text-white',
            )}
          >
            {advancedActive && (
              <span
                className="absolute left-1/2 top-0 h-[3px] w-7 -translate-x-1/2 rounded-b-full bg-primary"
                aria-hidden="true"
              />
            )}
            <IconSeal icon={SlidersHorizontal} active={advancedActive || advancedSheetOpen} />
            <span className="line-clamp-2 w-full">Avançado</span>
          </button>
        )}
      </nav>

      {isSuperadmin && (
        <Sheet open={advancedSheetOpen} onOpenChange={setAdvancedSheetOpen}>
          {/* Fica acima da barra inferior (bottom-16), que continua à vista. */}
          <SheetContent side="bottom" className="bottom-16 max-h-[70vh] gap-0 rounded-t-3xl pb-3 lg:hidden">
            <SheetHeader className="pb-3">
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
                      'flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border p-2 text-center text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40',
                      isActive
                        ? 'border-primary/30 bg-[#FDECEF]/60 font-semibold text-secondary'
                        : 'border-border bg-card font-medium text-foreground hover:bg-accent/60',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-flex size-9 items-center justify-center rounded-xl',
                        isActive ? 'bg-white text-primary shadow-sm' : 'bg-accent text-secondary',
                      )}
                    >
                      <Icon className="size-[18px]" />
                    </span>
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
