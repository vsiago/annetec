'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { FOCUS_RING } from '../ui/tokens'
import { AvatarPresenca, type Branding, ICONES, Marca, PularParaConteudo, type UsuarioShell, estiloDaCasca } from './base'
import { itemAtivo, type ItemMenu } from './itens'

/**
 * Casca do balcão: uma coluna centralizada (largura de leitura, `max-w-2xl`),
 * pensada para tablet ou celular na recepção. Cabeçalho com o nome da unidade
 * e quem atende; barra inferior sempre visível (Atender · Hoje · Histórico ·
 * Ajustes, de `itensDoBalcao`) com alvos de 64 px. Tema claro forçado.
 *
 * Props: `unidade` (nome exibido no topo), `itens`, `usuario`, `branding?`
 * (nome e cor do clube), `slotSino?`.
 */
export function BalcaoShell({
  unidade,
  itens,
  usuario,
  branding,
  slotSino,
  children,
}: {
  unidade: string
  itens: ItemMenu[]
  usuario: UsuarioShell
  branding?: Branding
  slotSino?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()
  const raiz = itens[0]?.href ?? '/'
  return (
    <div style={estiloDaCasca(branding?.corPrimaria)} className="min-h-dvh bg-[#F8F9FB] text-foreground">
      <PularParaConteudo alvo="conteudo-balcao" />
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Marca branding={branding} compacta />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-base font-semibold text-foreground">{unidade}</span>
              <span className="truncate text-xs text-muted-foreground">{branding?.nome ?? 'Balcão'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {slotSino}
            <span className="flex min-w-0 items-center gap-2">
              <AvatarPresenca usuario={usuario} />
              <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">{usuario.nome}</span>
            </span>
          </div>
        </div>
      </header>

      <main id="conteudo-balcao" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 pb-32 pt-24 outline-none">
        <div className="flex flex-col gap-5">{children}</div>
      </main>

      <nav aria-label="Navegação do balcão" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto m-0 grid h-[72px] w-full max-w-2xl list-none grid-cols-4 p-0">
          {itens.slice(0, 4).map(item => {
            const Icone = ICONES[item.icon]
            const atual = itemAtivo(pathname, item.href, raiz)
            return (
              <li key={item.href} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={atual ? 'page' : undefined}
                  className={cn(
                    'flex h-full flex-col items-center justify-center gap-1 text-xs font-semibold',
                    atual ? 'text-[#1E2A4A]' : 'text-[#667085]',
                    FOCUS_RING,
                  )}
                >
                  <span className={cn('inline-flex h-8 w-14 items-center justify-center rounded-full', atual && 'bg-[#E5EDF5]')}>
                    <Icone className="size-6" strokeWidth={atual ? 2.25 : 2} aria-hidden="true" />
                  </span>
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
