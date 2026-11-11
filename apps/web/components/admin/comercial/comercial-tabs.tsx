'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ABAS = [
  { segmento: 'funil', rotulo: 'Funil' },
  { segmento: 'rede', rotulo: 'Rede' },
  { segmento: 'balcao', rotulo: 'Balcão' },
  { segmento: 'comissoes', rotulo: 'Comissões' },
  { segmento: 'resultados', rotulo: 'Resultados' },
  { segmento: 'regras', rotulo: 'Regras' },
] as const

/** Abas sublinhadas entre as telas do Comercial do clube (`/[tenant]/admin/comercial/*`). */
export function ComercialTabs({ slug }: { slug: string }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Telas do Comercial">
      <ul className="scrollbar-none m-0 flex list-none gap-0.5 overflow-x-auto border-b border-border p-0">
        {ABAS.map(aba => {
          const href = `/${slug}/admin/comercial/${aba.segmento}`
          const ativa = pathname === href || pathname?.startsWith(`${href}/`)
          return (
            <li key={aba.segmento} className="shrink-0">
              <Link
                href={href}
                aria-current={ativa ? 'page' : undefined}
                className={cn(
                  'relative inline-flex min-h-11 items-center whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm transition-colors duration-150',
                  'outline-none focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-primary/40',
                  "after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:content-['']",
                  ativa
                    ? 'bg-accent/50 font-semibold text-foreground after:bg-primary'
                    : 'font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:after:bg-border',
                )}
              >
                {aba.rotulo}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
