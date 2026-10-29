import type { LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * SectionCard — o cartão padrão do console (/admin). Todo bloco de conteúdo
 * (formulário, lista, resumo, tabela) vive num SectionCard; não monte
 * `<Card>` nem `<div className="rounded border ...">` à mão.
 *
 * Visual fixo: `rounded-2xl`, borda suave, `shadow-sm`, fundo `bg-card`.
 * - `title` / `description` / `icon` / `actions`: cabeçalho opcional. O ícone é
 *   decorativo (chip pequeno `bg-accent`). Sem título, o cartão fica sem cabeçalho.
 * - `padded` (padrão): corpo com `p-6`. Use `padded={false}` quando o filho é
 *   uma tabela (`DataTable`) ou uma lista que vai de borda a borda; o cabeçalho
 *   ganha uma linha divisória.
 * - `headingLevel`: nível do título (padrão h2) — use 3 dentro de outro cartão.
 *
 * Para um título de seção SEM cartão (ex.: grade de KpiCard) use `SectionHeading`.
 * Estados vazios e de erro: `EmptyState` / `ErrorState` dentro do corpo.
 */
export function SectionCard({
  title,
  description,
  icon,
  actions,
  children,
  padded = true,
  headingLevel = 2,
  id,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  children?: ReactNode
  padded?: boolean
  headingLevel?: 2 | 3
  id?: string
  className?: string
  bodyClassName?: string
}) {
  const autoId = useId()
  const headingId = `${id ?? autoId}-titulo`
  const hasHeader = Boolean(title || actions)
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={cn('min-w-0 rounded-2xl border border-border bg-card shadow-sm', className)}
    >
      {hasHeader ? (
        <div
          className={cn(
            'flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-6 pt-5',
            padded ? 'pb-1' : 'border-b border-border pb-4',
          )}
        >
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <IconChip icon={icon} /> : null}
            <div className="flex min-w-0 flex-col gap-0.5">
              {title ? (
                <SectionTitle id={headingId} level={headingLevel}>
                  {title}
                </SectionTitle>
              ) : null}
              {description ? <p className="m-0 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children ? (
        <div className={cn(padded && (hasHeader ? 'p-6 pt-4' : 'p-6'), bodyClassName)}>{children}</div>
      ) : hasHeader && padded ? (
        <div className="pb-4" />
      ) : null}
    </section>
  )
}

/**
 * SectionHeading — título de seção sem cartão (ex.: "Outubro em números"
 * acima de uma grade de KpiCard). Mesmo vocabulário do cabeçalho do SectionCard.
 */
export function SectionHeading({
  id,
  title,
  description,
  icon,
  actions,
}: {
  id?: string
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <IconChip icon={icon} /> : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          <SectionTitle id={id} level={2}>
            {title}
          </SectionTitle>
          {description ? <p className="m-0 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

function SectionTitle({ id, level, children }: { id?: string; level: 2 | 3; children: ReactNode }) {
  const Tag = level === 3 ? 'h3' : 'h2'
  return (
    <Tag id={id} className="m-0 text-base font-bold leading-snug text-foreground sm:text-[17px]">
      {children}
    </Tag>
  )
}

/** Chip de ícone pequeno dos títulos de seção (decorativo). */
function IconChip({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-secondary"
      aria-hidden="true"
    >
      <Icon className="size-4" />
    </span>
  )
}

/**
 * Esqueleto de carregamento para o corpo de um SectionCard. Padrão de
 * "carregando" do console: linhas cinzas no lugar do conteúdo, com texto
 * oculto para leitores de tela.
 */
export function SectionSkeleton({ rows = 3, label = 'Carregando…' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={cn('h-5', index === rows - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}
