'use client'

import type { ReactNode } from 'react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

/**
 * Abas sublinhadas do console (/admin): a faixa de seções logo abaixo do
 * cabeçalho ou no topo de um SectionCard. Use dentro de `<Tabs>`:
 *
 *   <Tabs value=... onValueChange=...>
 *     <SectionTabsList>
 *       <SectionTab value="faturas" badge={3}>Faturas</SectionTab>
 *     </SectionTabsList>
 *     <TabsContent value="faturas">...</TabsContent>
 *   </Tabs>
 *
 * Versão do console das abas de `components/dashboard/section-tabs`: a aba
 * ativa usa o marinho (`secondary`), nunca o coral em texto pequeno (contraste),
 * e cada aba tem pelo menos 44px de altura.
 */
export function SectionTabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TabsList
      className={cn(
        'scrollbar-none h-auto w-full justify-start gap-0.5 overflow-x-auto rounded-none border-b border-border bg-transparent p-0',
        className,
      )}
    >
      {children}
    </TabsList>
  )
}

export function SectionTab({
  value,
  children,
  /** Contador ao lado do rótulo, como "Dependentes (3)". */
  badge,
}: {
  value: string
  children: ReactNode
  badge?: ReactNode
}) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        // `grow-0` anula o `flex-1` do TabsTrigger base: sem isso cada aba
        // estica e a faixa fica espalhada em vez de agrupada à esquerda.
        'group relative min-h-11 shrink-0 grow-0 gap-2 rounded-none rounded-t-xl border-0 bg-transparent px-4 py-2.5 text-sm font-medium whitespace-nowrap shadow-none',
        'text-muted-foreground transition-colors duration-150',
        'hover:bg-accent/60 hover:text-foreground',
        'focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-secondary/40 focus-visible:outline-none',
        // O traço é um pseudo-elemento: fica mais curto que a área clicável
        // (abraça o rótulo) e ganha ponta arredondada.
        "after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.75 after:rounded-full after:bg-transparent after:transition-colors after:duration-150 after:content-['']",
        'hover:after:bg-border',
        'data-[state=active]:bg-accent/50 data-[state=active]:font-semibold data-[state=active]:text-secondary data-[state=active]:shadow-none data-[state=active]:after:bg-secondary',
      )}
    >
      {children}
      {badge !== undefined && (
        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold leading-none text-secondary transition-colors group-data-[state=active]:bg-secondary group-data-[state=active]:text-secondary-foreground">
          {badge}
        </span>
      )}
    </TabsTrigger>
  )
}
