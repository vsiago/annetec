import Link from 'next/link'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * PageHeader — cabeçalho padrão de toda tela do console (/admin). Um por
 * página, logo dentro do `PageContainer`.
 *
 * - `title`: o nome da tela (h1, 26–30px). Só um h1 por página.
 * - `description`: uma frase em cinza que diz para que serve a tela.
 * - `icon`: ícone opcional num chip suave à esquerda do título (decorativo).
 * - `badge`: selo de situação ao lado do título (ex.: `StatusPill`).
 * - `breadcrumb`: o que vem acima do título, normalmente `<BackLink>`.
 * - `actions` (ou `children`): botões à direita; no celular quebram para baixo
 *   do título. Botão principal = `Button` de `ui/button` (marinho).
 * - `live`: anuncia mudanças da descrição a leitores de tela (ex.: contagens
 *   que carregam depois).
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  badge,
  breadcrumb,
  actions,
  children,
  live = false,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  badge?: ReactNode
  breadcrumb?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  live?: boolean
  className?: string
}) {
  const right = actions ?? children
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      {breadcrumb ? <div className="flex flex-wrap items-center gap-2 text-sm">{breadcrumb}</div> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {Icon ? (
            <span
              className="mt-0.5 hidden size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-secondary sm:inline-flex"
              aria-hidden="true"
            >
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className="m-0 text-[26px] font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
                {title}
              </h1>
              {badge}
            </div>
            {description ? (
              <p
                className="m-0 max-w-3xl text-[15px] leading-relaxed text-muted-foreground"
                aria-live={live ? 'polite' : undefined}
              >
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {right ? <div className="flex flex-wrap items-center gap-3 sm:justify-end">{right}</div> : null}
      </div>
    </header>
  )
}

/** Link "Voltar para …" do `breadcrumb` do PageHeader (telas de detalhe). */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-sm font-medium text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  )
}
