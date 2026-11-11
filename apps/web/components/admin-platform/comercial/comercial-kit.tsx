'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { PlatformSeller } from '@annetec/contracts'
import { useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { listSellersAction } from '@/lib/actions/comercial-api'
import { cn } from '@/lib/utils'

/**
 * Peças comuns do grupo Comercial do console (/admin/comercial/*): as abas
 * entre as seis telas (no celular o menu tem um item só, "Comercial") e a
 * lista de vendedores para os filtros. Os descontos pedidos pelos vendedores
 * ficam em Aprovações › Descontos de vendedores (`/admin/compliance?tipo=descontos`).
 */

export const COMERCIAL_TABS = [
  { href: '/admin/comercial/funil', label: 'Funil' },
  { href: '/admin/comercial/rede', label: 'Rede' },
  { href: '/admin/comercial/comissoes', label: 'Comissões' },
  { href: '/admin/comercial/descontos', label: 'Descontos' },
  { href: '/admin/comercial/resultados', label: 'Resultados' },
  { href: '/admin/comercial/regras', label: 'Regras' },
] as const

/** Abas sublinhadas (links) entre as telas do Comercial, no mesmo desenho das `SectionTabs`. */
export function ComercialNav({ badges }: { badges?: Partial<Record<(typeof COMERCIAL_TABS)[number]['href'], number>> }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Telas do Comercial" className="-mt-2">
      <ul className="scrollbar-none m-0 flex list-none gap-0.5 overflow-x-auto border-b border-border p-0">
        {COMERCIAL_TABS.map(tab => {
          const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`)
          const badge = badges?.[tab.href]
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm transition-colors duration-150',
                  'outline-none focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-secondary/40',
                  "after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.75 after:rounded-full after:content-['']",
                  active
                    ? 'bg-accent/50 font-semibold text-secondary after:bg-secondary'
                    : 'font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:after:bg-border',
                )}
              >
                {tab.label}
                {badge ? (
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-secondary-foreground">
                    {badge}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** Vendedores para filtros e seleção (`GET /comercial/vendedores`). */
export function useSellers() {
  const state = useConsoleData(() => listSellersAction(), [])
  const sellers: PlatformSeller[] = state.data ?? []
  const options = sellers.map(seller => ({
    value: seller.userId,
    label: seller.active ? seller.name : `${seller.name} (inativo)`,
  }))
  return { ...state, sellers, options }
}

/** Texto padrão do bloqueio de escrita para quem não é superadmin. */
export const SUPERADMIN_ONLY = 'Somente o superadmin pode fazer isso.'
