'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Ellipsis, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { PapelComercial } from '../ui/tipos'
import { FOCUS_RING } from '../ui/tokens'
import { AvatarPresenca, type Branding, Conteudo, ICONES, Marca, PularParaConteudo, Selo, type UsuarioShell, estiloDaCasca } from './base'
import { itemAtivo, type ItemMenu } from './itens'

const CHAVE_FIXO = 'vr-trilho-fixo'
const ROTULO_PAPEL: Record<PapelComercial, string> = {
  master: 'Master',
  gerente: 'Gerente',
  supervisor: 'Supervisor',
  vendedor: 'Vendedor',
  balcao: 'Balcão',
}

function lerFixo(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_FIXO) === '1'
  } catch {
    return false
  }
}

/**
 * Casca comercial (vendedor, supervisor, gerente e master).
 *
 * Desktop (lg+): trilho fixo de ícones à esquerda (56 px). Abre com o mouse ou
 * o foco do teclado mostrando os rótulos (sobrepõe o conteúdo) e `Ctrl+B`
 * (ou o botão do rodapé) fixa-o aberto; a escolha fica no localStorage.
 * Sem barra de topo.
 *
 * Celular: topo `h-14` (marca, sino, avatar com bolinha de presença) e barra
 * inferior `h-16` com até 5 entradas (a 5ª vira "Mais" se o menu tiver mais).
 *
 * Tema claro forçado; `branding.corPrimaria` colore a ação principal.
 * Props: `papel`, `itens` (use `itensDoPapel`), `usuario`, `branding?`,
 * `slotSino?` (o sino de notificações; recebe o mesmo elemento no desktop e no
 * celular), `slotConta?` (ex.: menu da conta; no celular substitui o avatar
 * simples), `raiz` (rota do "Hoje", para marcar o item ativo; padrão = href do
 * primeiro item).
 */
export function ComercialShell({
  papel,
  itens,
  usuario,
  branding,
  slotSino,
  slotConta,
  raiz,
  children,
}: {
  papel: PapelComercial
  itens: ItemMenu[]
  usuario: UsuarioShell
  branding?: Branding
  slotSino?: ReactNode
  slotConta?: ReactNode
  raiz?: string
  children: ReactNode
}) {
  const pathname = usePathname()
  const [fixo, setFixo] = useState(false)
  const [sobre, setSobre] = useState(false)
  const [maisAberto, setMaisAberto] = useState(false)
  const raizDoMenu = raiz ?? itens[0]?.href ?? '/'

  useEffect(() => {
    setFixo(lerFixo())
  }, [])

  const alternarFixo = useCallback(() => {
    setFixo(atual => {
      const proximo = !atual
      try {
        window.localStorage.setItem(CHAVE_FIXO, proximo ? '1' : '0')
      } catch {
        /* sem storage: vale só nesta sessão */
      }
      return proximo
    })
  }, [])

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        alternarFixo()
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [alternarFixo])

  useEffect(() => {
    setMaisAberto(false)
  }, [pathname])

  const expandido = fixo || sobre
  const ativo = (href: string) => itemAtivo(pathname, href, raizDoMenu)
  const caber = itens.length <= 5 ? itens : itens.slice(0, 4)
  const resto = itens.length <= 5 ? [] : itens.slice(4)
  const restoAtivo = resto.some(i => ativo(i.href))
  const linkAjustes = itens.find(i => i.icon === 'ajustes')

  return (
    <div style={estiloDaCasca(branding?.corPrimaria)} className="min-h-dvh bg-[#F8F9FB] text-foreground">
      <PularParaConteudo alvo="conteudo-comercial" />

      {/* Trilho do desktop */}
      <aside
        aria-label="Menu da área comercial"
        onMouseEnter={() => setSobre(true)}
        onMouseLeave={() => setSobre(false)}
        onFocusCapture={() => setSobre(true)}
        onBlurCapture={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false)
        }}
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-white transition-[width,box-shadow] duration-200 lg:flex',
          expandido ? 'w-60' : 'w-14',
          expandido && !fixo && 'shadow-[8px_0_24px_-12px_rgba(16,24,40,0.18)]',
        )}
      >
        <div className="flex h-14 shrink-0 items-center overflow-hidden px-3">
          <Marca branding={branding} compacta={!expandido} />
        </div>
        <nav aria-label="Principal" className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 py-2">
          {itens.map(item => {
            const Icone = ICONES[item.icon]
            const atual = ativo(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={expandido ? undefined : item.label}
                aria-current={atual ? 'page' : undefined}
                aria-label={item.badge ? `${item.label}, ${item.badge} novidades` : undefined}
                className={cn(
                  'group relative flex h-10 items-center gap-3 rounded-xl px-2.5 text-sm font-medium transition-colors',
                  atual ? 'bg-[#E5EDF5] text-[#1E2A4A]' : 'text-[#475467] hover:bg-[#F2F4F7] hover:text-foreground',
                  FOCUS_RING,
                )}
              >
                {atual ? (
                  <span aria-hidden="true" className="absolute -left-2 top-2 h-6 w-1 rounded-r-full bg-[var(--vr-accent,#1E2A4A)]" />
                ) : null}
                <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                  <Icone className="size-5" strokeWidth={atual ? 2.25 : 2} aria-hidden="true" />
                  <Selo valor={item.badge} />
                </span>
                <span className={cn('truncate transition-opacity duration-150', expandido ? 'opacity-100' : 'sr-only opacity-0')}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>
        <div className="flex shrink-0 flex-col gap-1 border-t border-border px-2 py-2">
          {slotSino ? <div className="flex min-h-10 items-center justify-start px-0.5">{slotSino}</div> : null}
          <div className="flex h-12 items-center gap-3 overflow-hidden px-1.5">
            <AvatarPresenca usuario={usuario} />
            <span className={cn('flex min-w-0 flex-col leading-tight transition-opacity', expandido ? 'opacity-100' : 'sr-only opacity-0')}>
              <span className="truncate text-sm font-semibold text-foreground">{usuario.nome}</span>
              <span className="truncate text-xs text-muted-foreground">
                {ROTULO_PAPEL[papel]} · {usuario.online ? 'Online' : 'Offline'}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={alternarFixo}
            aria-pressed={fixo}
            aria-keyshortcuts="Control+B"
            title="Fixar menu aberto (Ctrl+B)"
            className={cn('flex h-10 items-center gap-3 rounded-xl px-2.5 text-sm text-[#475467] hover:bg-[#F2F4F7]', FOCUS_RING)}
          >
            {fixo ? <PanelLeftClose className="size-5 shrink-0" aria-hidden="true" /> : <PanelLeftOpen className="size-5 shrink-0" aria-hidden="true" />}
            <span className={cn('truncate', expandido ? 'opacity-100' : 'sr-only opacity-0')}>
              {fixo ? 'Recolher menu' : 'Fixar menu'} <kbd className="ml-1 rounded border border-border px-1 text-[10px]">Ctrl B</kbd>
            </span>
          </button>
        </div>
      </aside>

      {/* Topo do celular */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-border bg-white/95 px-4 backdrop-blur lg:hidden">
        <Link href={raizDoMenu} className={cn('min-w-0 rounded-lg', FOCUS_RING)}>
          <Marca branding={branding} />
        </Link>
        <div className="flex items-center gap-1">
          {slotSino}
          {slotConta ??
            (linkAjustes ? (
              <Link
                href={linkAjustes.href}
                aria-label={`Ajustes de ${usuario.nome}, ${usuario.online ? 'online' : 'offline'}`}
                className={cn('flex size-11 items-center justify-center rounded-full', FOCUS_RING)}
              >
                <AvatarPresenca usuario={usuario} />
              </Link>
            ) : (
              <span className="flex size-11 items-center justify-center">
                <AvatarPresenca usuario={usuario} />
              </span>
            ))}
        </div>
      </header>

      <main
        id="conteudo-comercial"
        tabIndex={-1}
        className={cn(
          'pb-24 pt-14 outline-none transition-[padding] duration-200 lg:pb-0 lg:pt-0',
          fixo ? 'lg:pl-60' : 'lg:pl-14',
        )}
      >
        {children}
      </main>

      {/* Barra inferior do celular */}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="m-0 grid h-16 list-none grid-cols-[repeat(auto-fit,minmax(0,1fr))] p-0">
          {caber.map(item => {
            const Icone = ICONES[item.icon]
            const atual = ativo(item.href)
            return (
              <li key={item.href} className="min-w-0">
                <Link
                  href={item.href}
                  aria-current={atual ? 'page' : undefined}
                  className={cn('flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium', atual ? 'text-[#1E2A4A]' : 'text-[#667085]', FOCUS_RING)}
                >
                  <span className={cn('relative inline-flex h-7 w-12 items-center justify-center rounded-full transition-colors', atual && 'bg-[#E5EDF5]')}>
                    <Icone className="size-5" strokeWidth={atual ? 2.25 : 2} aria-hidden="true" />
                    <Selo valor={item.badge} />
                  </span>
                  <span className="max-w-full truncate px-1">{item.label}</span>
                </Link>
              </li>
            )
          })}
          {resto.length > 0 ? (
            <li className="min-w-0">
              <button
                type="button"
                onClick={() => setMaisAberto(true)}
                aria-haspopup="dialog"
                className={cn('flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium', restoAtivo ? 'text-[#1E2A4A]' : 'text-[#667085]', FOCUS_RING)}
              >
                <span className={cn('inline-flex h-7 w-12 items-center justify-center rounded-full', restoAtivo && 'bg-[#E5EDF5]')}>
                  <Ellipsis className="size-5" aria-hidden="true" />
                </span>
                Mais
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {resto.length > 0 ? (
        <Sheet open={maisAberto} onOpenChange={setMaisAberto}>
          <SheetContent side="bottom" style={estiloDaCasca(branding?.corPrimaria)} className="rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]">
            <SheetHeader>
              <SheetTitle>Mais opções</SheetTitle>
              <SheetDescription className="sr-only">Outras áreas do módulo comercial</SheetDescription>
            </SheetHeader>
            <ul className="m-0 flex list-none flex-col gap-1 p-4 pt-0">
              {resto.map(item => {
                const Icone = ICONES[item.icon]
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMaisAberto(false)}
                      aria-current={ativo(item.href) ? 'page' : undefined}
                      className={cn('flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium', ativo(item.href) ? 'bg-[#E5EDF5] text-[#1E2A4A]' : 'hover:bg-[#F2F4F7]', FOCUS_RING)}
                    >
                      <Icone className="size-5" aria-hidden="true" />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}

export { Conteudo }
