'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const ContextoEmbutido = createContext(false)

/**
 * Dentro do console ou do painel do clube o layout já dá padding e largura:
 * `<Embutido>` faz o `Conteudo` das páginas da Rede Comercial se limitar a empilhar.
 */
export function Embutido({ children }: { children: ReactNode }) {
  return <ContextoEmbutido.Provider value>{children}</ContextoEmbutido.Provider>
}

export function Conteudo({ children, largo, className }: { children: ReactNode; largo?: boolean; className?: string }) {
  const embutido = useContext(ContextoEmbutido)
  if (embutido) return <div className={cn('flex w-full min-w-0 flex-col gap-6', className)}>{children}</div>
  return (
    <div className={cn('mx-auto flex w-full min-w-0 flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8', largo ? 'max-w-[1400px]' : 'max-w-6xl', className)}>
      {children}
    </div>
  )
}
