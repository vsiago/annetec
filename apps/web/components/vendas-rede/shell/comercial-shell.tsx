'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, ChevronsUpDown, Ellipsis, LogOut, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { initialsOf } from '@/components/admin-platform/ui/entity-avatar'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { cn } from '@/lib/utils'
import { PresencaDot } from '../ui/presenca-dot'
import type { PapelComercial } from '../ui/tipos'
import { variaveisDeCor } from '../ui/tokens'
import { type Branding, Conteudo, ICONES, PularParaConteudo, type UsuarioShell } from './base'
import { itemAtivo, type ItemMenu } from './itens'

/**
 * Mesmas chaves do admin (clube e console): quem recolhe o menu num lugar
 * encontra o menu recolhido no outro, no mesmo navegador.
 */
const CHAVE_RECOLHIDO = {
  clube: 'annetec_admin_sidebar_collapsed',
  plataforma: 'annetec_platform_sidebar_collapsed',
} as const

const ROTULO_PAPEL: Record<PapelComercial, string> = {
  master: 'Administrador',
  gerente: 'Gerente',
  supervisor: 'Supervisor',
  vendedor: 'Vendedor',
  balcao: 'Balcão',
}

const FOCO = 'outline-none focus-visible:ring-2 focus-visible:ring-primary/40'

/** Indicador numérico do item (mesmo desenho do menu do admin). */
function Contador({ valor, embutido, rotulo }: { valor: number; embutido: boolean; rotulo: string }) {
  return (
    <span
      aria-label={rotulo}
      className={cn(
        'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground',
        !embutido && 'absolute -right-2 -top-1.5 h-4 min-w-4 px-1 text-[10px]',
      )}
    >
      {valor > 99 ? '99+' : valor}
    </span>
  )
}

function rotuloContador(valor: number): string {
  return `${valor} ${valor === 1 ? 'lead disponível' : 'leads disponíveis'}`
}

/** Avatar de iniciais com a bolinha de presença (cor primária, como o avatar do admin). */
function AvatarConta({ usuario }: { usuario: UsuarioShell }) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        aria-hidden="true"
        className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
      >
        {usuario.iniciais ?? initialsOf(usuario.nome)}
      </span>
      <PresencaDot online={usuario.online} className="absolute -bottom-0.5 -right-0.5" />
    </span>
  )
}

/** Marca de quadrado com a inicial, quando o clube ainda não subiu logo. */
function MarcaInicial({ nome, compacta }: { nome: string; compacta: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
        {nome.charAt(0).toUpperCase()}
      </span>
      {!compacta && <span className="truncate text-base font-bold text-foreground">{nome}</span>}
    </span>
  )
}

/**
 * Marca do topo do menu: no clube, logo (expandido) ou ícone (recolhido) do
 * clube, como no admin; na plataforma, a marca ANNETEC com a etiqueta "Comercial".
 */
function MarcaMenu({ area, branding, compacta }: { area: 'clube' | 'plataforma'; branding?: Branding; compacta: boolean }) {
  if (area === 'plataforma' || !branding) {
    return compacta ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/favicon.png" alt="ANNETEC" className="size-8 object-contain" />
    ) : (
      <span className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/annetec.svg" alt="ANNETEC" className="h-9 w-auto shrink-0" />
        <span className="whitespace-nowrap rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
          Comercial
        </span>
      </span>
    )
  }
  const imagem = compacta ? (branding.iconeUrl ?? branding.logoUrl) : branding.logoUrl
  return imagem ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={imagem} alt={branding.nome} className={cn('object-contain', compacta ? 'size-8' : 'h-9')} />
  ) : (
    <MarcaInicial nome={branding.nome} compacta={compacta} />
  )
}

/**
 * Casca comercial (vendedor, supervisor, gerente e master), montada com o
 * mesmo desenho do menu do admin do clube:
 *
 * Desktop (lg+): menu fixo à esquerda, expandido (`w-64`, com rótulos) ou
 * recolhido em ícones (`w-20`, com dica ao lado). O botão redondo na borda e
 * `Ctrl+B` (`Cmd+B` no Mac) alternam; a escolha fica no `localStorage` com a
 * mesma chave do admin. Marca no topo; rodapé com sino e conta (avatar com
 * presença, Ajustes e Sair).
 *
 * Celular: topo `h-14` (marca, sino e conta) e barra inferior `h-16` como a do
 * admin: até 5 entradas; com mais, 4 + "Mais", que abre uma folha acima da
 * barra com as demais.
 *
 * Área da página: `p-4 lg:p-6`, sem largura máxima (igual `/admin`). As telas
 * usam `Conteudo`, que só empilha as seções.
 *
 * Props: `area` (`clube` ou `plataforma`: escolhe a chave de persistência e a
 * marca), `papel`, `itens` (use `itensDoPapel`), `usuario`, `branding?`,
 * `hrefAjustes?`, `aoSair?`, `raiz` (rota do "Hoje", para marcar o item ativo;
 * padrão = href do primeiro item).
 */
export function ComercialShell({
  area,
  papel,
  itens,
  usuario,
  branding,
  hrefAjustes,
  aoSair,
  raiz,
  children,
}: {
  area: 'clube' | 'plataforma'
  papel: PapelComercial
  itens: ItemMenu[]
  usuario: UsuarioShell
  branding?: Branding
  hrefAjustes?: string
  aoSair?: () => void
  raiz?: string
  children: ReactNode
}) {
  const pathname = usePathname()
  const [recolhido, setRecolhido] = useState(false)
  const [maisAberto, setMaisAberto] = useState(false)
  const chave = CHAVE_RECOLHIDO[area]
  const raizDoMenu = raiz ?? itens[0]?.href ?? '/'

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(chave)
      if (guardado !== null) setRecolhido(guardado === 'true')
    } catch {
      /* sem storage: começa expandido */
    }
  }, [chave])

  const alternar = useCallback(() => {
    setRecolhido(atual => {
      const proximo = !atual
      try {
        window.localStorage.setItem(chave, String(proximo))
      } catch {
        /* sem storage: vale só nesta sessão */
      }
      return proximo
    })
  }, [chave])

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        alternar()
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [alternar])

  useEffect(() => {
    setMaisAberto(false)
  }, [pathname])

  const ativo = (href: string) => itemAtivo(pathname, href, raizDoMenu)
  const caber = itens.length <= 5 ? itens : itens.slice(0, 4)
  const resto = itens.length <= 5 ? [] : itens.slice(4)
  const restoAtivo = resto.some(i => ativo(i.href))
  const linkAjustes = hrefAjustes ?? itens.find(i => i.icon === 'ajustes')?.href
  const papelRotulo = ROTULO_PAPEL[papel]
  const presenca = usuario.online ? 'Online' : 'Offline'

  const menuConta = (
    <>
      <DropdownMenuLabel className="flex flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{usuario.nome}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {papelRotulo} · {presenca}
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {linkAjustes ? (
        <DropdownMenuItem asChild className="min-h-10 cursor-pointer">
          <Link href={linkAjustes}>
            <Settings aria-hidden="true" /> Ajustes
          </Link>
        </DropdownMenuItem>
      ) : null}
      {aoSair ? (
        <DropdownMenuItem onSelect={aoSair} className="min-h-10 cursor-pointer text-destructive focus:text-destructive">
          <LogOut aria-hidden="true" /> Sair
        </DropdownMenuItem>
      ) : null}
    </>
  )

  function linkDesktop(item: ItemMenu) {
    const Icone = ICONES[item.icon]
    const atual = ativo(item.href)
    const contador = item.badge && item.badge > 0 ? item.badge : null
    const rotulo = contador ? rotuloContador(contador) : ''
    const link = (
      <Link
        href={item.href}
        aria-current={atual ? 'page' : undefined}
        aria-label={rotulo ? `${item.label}, ${rotulo}` : recolhido ? item.label : undefined}
        className={cn(
          'relative flex items-center rounded-lg text-sm transition-colors',
          FOCO,
          recolhido ? 'justify-center p-2.5' : 'gap-3 px-3 py-2',
          atual ? 'bg-primary/10 font-semibold text-primary' : 'font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Icone className="h-5 w-5 shrink-0" aria-hidden="true" />
        {!recolhido && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {contador !== null && <Contador valor={contador} embutido={!recolhido} rotulo={rotulo} />}
      </Link>
    )
    return (
      <li key={item.href}>
        {recolhido ? (
          <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">
              {item.label}
              {rotulo && <span className="block text-xs opacity-80">{rotulo}</span>}
            </TooltipContent>
          </Tooltip>
        ) : (
          link
        )}
      </li>
    )
  }

  const gatilhoConta = (
    <button
      type="button"
      aria-label={`Conta de ${usuario.nome}, ${presenca.toLowerCase()}`}
      className={cn(
        'flex items-center rounded-xl text-left transition-colors hover:bg-muted',
        FOCO,
        recolhido ? 'mx-auto size-11 justify-center' : 'min-w-0 flex-1 gap-3 p-2',
      )}
    >
      <AvatarConta usuario={usuario} />
      {!recolhido && (
        <>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-semibold text-foreground">{usuario.nome}</span>
            <span className="truncate text-xs text-muted-foreground">
              {papelRotulo} · {presenca}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </>
      )}
    </button>
  )

  const marcaLink = (compacta: boolean) => (
    <Link href={raizDoMenu} aria-label="Início da área comercial" className={cn('flex items-center gap-2 overflow-hidden rounded-lg', FOCO)}>
      <MarcaMenu area={area} branding={branding} compacta={compacta} />
    </Link>
  )

  return (
    <TooltipProvider delayDuration={100}>
      <div style={{ colorScheme: 'light', ...variaveisDeCor(branding?.corPrimaria) }} className="min-h-screen bg-background text-foreground">
        <PularParaConteudo alvo="conteudo-comercial" />

        {/* Topo do celular: no desktop o menu lateral leva a marca. */}
        <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
          {marcaLink(false)}
          <div className="flex items-center gap-1">
            <NotificationBell variant="mobile" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Conta de ${usuario.nome}, ${presenca.toLowerCase()}`}
                  className={cn('flex size-11 items-center justify-center rounded-full', FOCO)}
                >
                  <AvatarConta usuario={usuario} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-110 w-56">
                {menuConta}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Menu lateral do desktop */}
        <aside
          aria-label="Menu da área comercial"
          className={cn(
            'fixed left-0 top-0 z-50 hidden h-full flex-col border-r border-border bg-card transition-all duration-300 ease-in-out lg:flex',
            recolhido ? 'w-20' : 'w-64',
          )}
        >
          <div className={cn('flex h-18 shrink-0 items-center border-b border-border', recolhido ? 'justify-center px-2' : 'px-5')}>
            {marcaLink(recolhido)}
          </div>

          {/* Recolher/expandir: botão flutuante na borda, como no painel do clube. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={alternar}
                aria-label={recolhido ? 'Expandir menu (Ctrl+B)' : 'Recolher menu (Ctrl+B)'}
                aria-keyshortcuts="Control+B Meta+B"
                className="absolute -right-3 top-14.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-primary"
              >
                {recolhido ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{recolhido ? 'Expandir (Ctrl+B)' : 'Recolher (Ctrl+B)'}</TooltipContent>
          </Tooltip>

          <nav className="scrollbar-translucent flex-1 overflow-y-auto overflow-x-hidden p-3" aria-label="Principal">
            <ul className="space-y-0.5">{itens.map(linkDesktop)}</ul>
          </nav>

          <div className={cn('shrink-0 border-t border-border p-3', recolhido ? 'space-y-2' : 'flex items-center gap-1')}>
            {recolhido ? (
              <>
                <div className="flex justify-center">
                  <NotificationBell variant="topbar" />
                </div>
                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>{gatilhoConta}</DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {usuario.nome} · {papelRotulo}
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent side="right" align="end" sideOffset={14} className="z-110 w-56">
                    {menuConta}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>{gatilhoConta}</DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" className="z-110 w-56">
                    {menuConta}
                  </DropdownMenuContent>
                </DropdownMenu>
                <NotificationBell variant="topbar" />
              </>
            )}
          </div>
        </aside>

        <div
          className={cn(
            'flex min-h-screen flex-col pt-14 transition-[padding] duration-300 ease-in-out lg:pt-0',
            recolhido ? 'lg:pl-20' : 'lg:pl-64',
          )}
        >
          {/* Área da página: igual ao `main` do admin (p-4 / lg:p-6, sem largura máxima). */}
          <main id="conteudo-comercial" tabIndex={-1} className="flex-1 p-4 pb-24 outline-none lg:p-6 lg:pb-6">
            {children}
          </main>
        </div>

        {/* Barra inferior do celular (mesmo desenho da do admin). */}
        <nav
          aria-label="Navegação móvel"
          style={{ gridTemplateColumns: `repeat(${caber.length + (resto.length > 0 ? 1 : 0)}, minmax(0, 1fr))` }}
          className="fixed bottom-0 left-0 right-0 z-100 grid h-16 items-center gap-0.5 border-t border-border bg-card px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(15,23,42,0.06)] min-[400px]:gap-1 min-[400px]:px-2 lg:hidden"
        >
          {caber.map(item => {
            const Icone = ICONES[item.icon]
            const atual = ativo(item.href)
            const contador = item.badge && item.badge > 0 ? item.badge : null
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={atual ? 'page' : undefined}
                aria-label={contador !== null ? `${item.label}, ${rotuloContador(contador)}` : undefined}
                className={cn(
                  'relative flex h-13 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-center text-[10px] font-medium tracking-tight transition-all min-[400px]:text-[11px] min-[400px]:tracking-normal',
                  FOCO,
                  atual ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <span className="relative inline-flex">
                  <Icone className={cn('h-5 w-5 shrink-0 transition-transform', atual && 'scale-110')} aria-hidden="true" />
                  {contador !== null && <Contador valor={contador} embutido={false} rotulo={rotuloContador(contador)} />}
                </span>
                <span className="w-full truncate px-0.5">{item.label}</span>
              </Link>
            )
          })}
          {resto.length > 0 ? (
            <button
              type="button"
              onClick={() => setMaisAberto(aberto => !aberto)}
              aria-expanded={maisAberto}
              aria-haspopup="dialog"
              className={cn(
                'relative flex h-13 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-center text-[10px] font-medium tracking-tight transition-all min-[400px]:text-[11px] min-[400px]:tracking-normal',
                FOCO,
                restoAtivo || maisAberto ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Ellipsis className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="w-full truncate px-0.5">Mais</span>
            </button>
          ) : null}
        </nav>

        {resto.length > 0 ? (
          <Sheet open={maisAberto} onOpenChange={setMaisAberto}>
            {/* Fica acima da barra inferior (bottom-16), que continua à vista. */}
            <SheetContent side="bottom" className="bottom-16 max-h-[78vh] gap-0 rounded-t-2xl pb-2 lg:hidden">
              <SheetHeader className="pb-2">
                <SheetTitle>Mais opções</SheetTitle>
                <SheetDescription>Outras áreas do módulo comercial.</SheetDescription>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-2 overflow-y-auto px-4 pb-2">
                {resto.map(item => {
                  const Icone = ICONES[item.icon]
                  const atual = ativo(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMaisAberto(false)}
                      aria-current={atual ? 'page' : undefined}
                      className={cn(
                        'relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs transition-colors',
                        FOCO,
                        atual ? 'border-primary/30 bg-primary/10 font-semibold text-primary' : 'border-border/70 font-medium text-foreground hover:bg-muted',
                      )}
                    >
                      <Icone className={cn('h-5 w-5', atual ? 'text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                      <span className="line-clamp-2 leading-tight">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </SheetContent>
          </Sheet>
        ) : null}
      </div>
    </TooltipProvider>
  )
}

export { Conteudo }
