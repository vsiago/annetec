'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Mantido por compatibilidade com os layouts do console (`/admin/comercial` e
 * `/<clube>/admin/comercial`). Não tem mais efeito: o `Conteudo` é o mesmo
 * dentro e fora do console.
 */
export function Embutido({ children }: { children: ReactNode }) {
  return <>{children}</>
}

/**
 * Raiz de cada tela da Rede Comercial. Igual ao `PageContainer` do console:
 * só empilha as seções com `gap-6`. Largura e margem ficam na `main` da casca
 * (`p-4 lg:p-6`, sem largura máxima) ou no layout do admin quando a tela roda
 * embutida. NUNCA ponha `max-w-*`, `mx-auto` ou padding aqui.
 *
 * `largo` é aceito só para não quebrar quem já o passa; não muda nada.
 */
export function Conteudo({ children, className }: { children: ReactNode; largo?: boolean; className?: string }) {
  return <div className={cn('flex w-full min-w-0 flex-col gap-6', className)}>{children}</div>
}
