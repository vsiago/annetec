import type { CSSProperties, ReactNode } from 'react'
import {
  BarChart3,
  History,
  KanbanSquare,
  Link2,
  type LucideIcon,
  Network,
  ScanSearch,
  Settings,
  SlidersHorizontal,
  Sun,
  UsersRound,
  Wallet,
  WalletCards,
} from 'lucide-react'
import { initialsOf } from '@/components/admin-platform/ui/entity-avatar'
import { cn } from '@/lib/utils'
export { Conteudo, Embutido } from './conteudo'
import { PresencaDot } from '../ui/presenca-dot'
import { variaveisDeCor } from '../ui/tokens'
import type { IconeMenu } from './itens'

export const ICONES: Record<IconeMenu, LucideIcon> = {
  hoje: Sun,
  funil: KanbanSquare,
  carteira: WalletCards,
  comissoes: Wallet,
  link: Link2,
  ajustes: Settings,
  equipe: UsersRound,
  resultados: BarChart3,
  rede: Network,
  regras: SlidersHorizontal,
  atender: ScanSearch,
  historico: History,
}


export type Branding = { nome: string; logoUrl?: string | null; corPrimaria?: string | null }
export type UsuarioShell = { nome: string; iniciais?: string; online: boolean }

/**
 * Tema claro forçado: redefine as variáveis do tema (iguais ao `:root`) na
 * própria casca, para ela continuar clara mesmo se o `<html>` estiver no
 * escuro. Acrescenta a cor de ação do clube.
 */
export function estiloDaCasca(cor?: string | null): CSSProperties {
  return {
    colorScheme: 'light',
    '--background': 'oklch(1 0 0)',
    '--foreground': 'oklch(0.145 0 0)',
    '--card': 'oklch(1 0 0)',
    '--card-foreground': 'oklch(0.145 0 0)',
    '--popover': 'oklch(1 0 0)',
    '--popover-foreground': 'oklch(0.145 0 0)',
    '--muted': 'oklch(0.97 0 0)',
    '--muted-foreground': 'oklch(0.556 0 0)',
    '--accent': 'oklch(0.97 0 0)',
    '--accent-foreground': 'oklch(0.205 0 0)',
    '--border': 'oklch(0.922 0 0)',
    '--input': 'oklch(0.922 0 0)',
    ...variaveisDeCor(cor),
  } as CSSProperties
}

/** Marca da casca: logo do clube/ANNETEC ou um quadrado com a inicial na cor de ação. */
export function Marca({ branding, compacta, className }: { branding?: Branding; compacta?: boolean; className?: string }) {
  const nome = branding?.nome ?? 'ANNETEC'
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      {branding?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={branding.logoUrl} alt="" className="size-8 shrink-0 rounded-lg object-contain" />
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--vr-accent,#1E2A4A)] text-xs font-bold text-[var(--vr-accent-fg,#FFFFFF)]"
        >
          {initialsOf(nome)}
        </span>
      )}
      {compacta ? <span className="sr-only">{nome}</span> : <span className="truncate text-sm font-semibold text-foreground">{nome}</span>}
    </span>
  )
}

/** Avatar de iniciais com a bolinha de presença no canto. */
export function AvatarPresenca({ usuario, tamanho = 'md' }: { usuario: UsuarioShell; tamanho?: 'sm' | 'md' }) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex items-center justify-center rounded-full bg-[#E5EDF5] font-bold text-[#1E2A4A]',
          tamanho === 'sm' ? 'size-8 text-[11px]' : 'size-9 text-[13px]',
        )}
      >
        {usuario.iniciais ?? initialsOf(usuario.nome)}
      </span>
      <PresencaDot online={usuario.online} className="absolute -bottom-0.5 -right-0.5" />
    </span>
  )
}

/** Selo numérico sobre o ícone do menu. Passa de 99 vira "99+". */
export function Selo({ valor }: { valor?: number }) {
  if (!valor || valor <= 0) return null
  return (
    <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[#B42318] px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-white">
      {valor > 99 ? '99+' : valor}
      <span className="sr-only"> {valor === 1 ? 'novidade' : 'novidades'}</span>
    </span>
  )
}

/**
 * Conteúdo da página dentro da casca: respiro lateral, largura máxima e
 * centralização. `largo` solta a largura máxima (Funil/Resultados em telas grandes).
 */
/** Link "Pular para o conteúdo" (primeiro foco da página). */
export function PularParaConteudo({ alvo }: { alvo: string }) {
  return (
    <a
      href={`#${alvo}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg focus:ring-2 focus:ring-[var(--vr-accent,#1E2A4A)]"
    >
      Pular para o conteúdo
    </a>
  )
}
