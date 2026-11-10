import type { ComponentProps, ReactNode } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCENT_BG, FOCUS_RING } from './tokens'

const TAMANHOS = {
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-[15px]',
  /** Balcão: botão grande de toque. */
  xl: 'min-h-16 px-6 text-lg',
} as const

type Base = {
  children: ReactNode
  icone?: ReactNode
  tamanho?: keyof typeof TAMANHOS
  /** Ocupa a linha inteira (padrão no celular). */
  bloco?: boolean
  carregando?: boolean
  /** `secundaria` = contorno, para a segunda ação quando precisa existir. */
  variante?: 'principal' | 'secundaria'
  className?: string
}

type ComoBotao = Base & Omit<ComponentProps<'button'>, keyof Base | 'href'> & { href?: undefined }
type ComoLink = Base & { href: string; disabled?: boolean } & Omit<ComponentProps<typeof Link>, keyof Base | 'href'>

/**
 * A ação principal do cartão/tela (a parte "10" do 60/30/10): botão cheio na
 * cor de ação. Use UMA por cartão. Com `href` vira link (Next `Link`).
 * `carregando` desabilita e troca o ícone por um spinner (feedback imediato).
 */
export function AcaoPrincipal(props: ComoBotao | ComoLink) {
  const { children, icone, tamanho = 'md', bloco, carregando, variante = 'principal', className } = props
  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[filter,background-color] duration-150',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    variante === 'principal'
      ? cn(ACCENT_BG, 'hover:brightness-110 active:brightness-95')
      : 'border border-border bg-white text-foreground hover:bg-[#F2F4F7]',
    TAMANHOS[tamanho],
    bloco && 'w-full',
    FOCUS_RING,
    className,
  )
  const conteudo = (
    <>
      {carregando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : icone ? <span aria-hidden="true" className="inline-flex [&>svg]:size-[1.1em]">{icone}</span> : null}
      {children}
    </>
  )

  if (props.href !== undefined) {
    const { href, disabled, children: _c, icone: _i, tamanho: _t, bloco: _b, carregando: _l, variante: _v, className: _k, ...resto } = props
    return (
      <Link href={href} aria-disabled={disabled || carregando || undefined} className={classes} {...resto}>
        {conteudo}
      </Link>
    )
  }
  const { children: _c, icone: _i, tamanho: _t, bloco: _b, carregando: _l, variante: _v, className: _k, type, disabled, ...resto } = props
  return (
    <button type={type ?? 'button'} disabled={disabled || carregando} aria-busy={carregando || undefined} className={classes} {...resto}>
      {conteudo}
    </button>
  )
}
