import type { LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { CARD_SURFACE, TONES, type ConsoleTone } from '@/components/admin-platform/ui/tone'
import { cn } from '@/lib/utils'

/**
 * SectionCard — o cartão padrão do console (/admin). Todo bloco de conteúdo
 * (formulário, lista, resumo, tabela) vive num SectionCard; não monte
 * `<Card>` nem `<div className="rounded border ...">` à mão.
 *
 * Visual fixo (`CARD_SURFACE` de `ui/tone`): `rounded-2xl`, borda suave,
 * sombra em camadas bem leve, fundo `bg-card`.
 * - `title` / `description` / `icon` / `actions`: cabeçalho opcional. O ícone é
 *   decorativo (selo de 36px); `iconTone` pinta o selo pelo assunto (padrão
 *   `navy`, o azul-claro da marca). Sem título, o cartão fica sem cabeçalho.
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
  iconTone = 'navy',
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
  iconTone?: ConsoleTone
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
      className={cn('min-w-0', CARD_SURFACE, className)}
    >
      {hasHeader ? (
        <div
          className={cn(
            'flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pt-5 sm:px-6',
            padded ? 'pb-1' : 'border-b border-border pb-4',
          )}
        >
          <div className="flex min-w-0 flex-[1_1_260px] items-start gap-3">
            {icon ? <IconChip icon={icon} tone={iconTone} /> : null}
            <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
              {title ? (
                <SectionTitle id={headingId} level={headingLevel}>
                  {title}
                </SectionTitle>
              ) : null}
              {description ? <p className="m-0 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children ? (
        <div className={cn(padded && (hasHeader ? 'p-5 pt-4 sm:p-6 sm:pt-4' : 'p-5 sm:p-6'), bodyClassName)}>{children}</div>
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
  iconTone = 'navy',
  actions,
}: {
  id?: string
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  iconTone?: ConsoleTone
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <IconChip icon={icon} tone={iconTone} /> : null}
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
    <Tag id={id} className="m-0 text-base font-semibold leading-snug tracking-[-0.01em] text-foreground sm:text-[17px]">
      {children}
    </Tag>
  )
}

/** Selo de ícone dos títulos de seção (decorativo), na cor do assunto. */
function IconChip({ icon: Icon, tone = 'navy' }: { icon: LucideIcon; tone?: ConsoleTone }) {
  return (
    <span
      className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-xl', TONES[tone].chip)}
      aria-hidden="true"
    >
      <Icon className="size-[18px]" />
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
