'use client'

import type { ReactNode } from 'react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

/**
 * Abas sublinhadas do backoffice — a faixa de seções que aparece logo abaixo
 * dos indicadores em quase toda tela do painel. Ficam aqui em vez de repetir
 * o mesmo bloco de `data-[state=active]` em cada página.
 */
export function SectionTabsList({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
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
        // estica para uma fração igual da largura e a faixa fica espalhada,
        // em vez de as abas se agruparem à esquerda.
        'group relative shrink-0 grow-0 gap-2 rounded-none rounded-t-lg border-0 bg-transparent px-4 py-2.5 text-sm font-medium whitespace-nowrap shadow-none',
        'text-muted-foreground transition-colors duration-150',
        'hover:bg-muted/60 hover:text-foreground',
        'focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none',
        // O traço é um pseudo-elemento, não `border-b`: assim ele fica mais
        // curto que a área clicável (abraça o rótulo, não o padding) e ganha
        // ponta arredondada, que a borda não permite.
        "after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.75 after:rounded-full after:bg-transparent after:transition-colors after:duration-150 after:content-['']",
        'hover:after:bg-border',
        'data-[state=active]:bg-primary/[0.07] data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:after:bg-primary',
      )}
    >
      {children}
      {badge !== undefined && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground transition-colors group-data-[state=active]:bg-primary/15 group-data-[state=active]:text-primary">
          {badge}
        </span>
      )}
    </TabsTrigger>
  )
}
