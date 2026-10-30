'use client'

import type { ReactNode } from 'react'
import { Pencil, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { cn } from '@/lib/utils'

/**
 * Etapa de revisão: um bloco por etapa, com "Editar" levando de volta a ela.
 *
 * @example
 *   <ReviewList>
 *     <ReviewSection title="Clube" icon={Building2} onEdit={() => wizard.goToStep('clube')}>
 *       <ReviewItem label="Nome" value={values.name} />
 *     </ReviewSection>
 *   </ReviewList>
 */

export function ReviewList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>
}

export function ReviewSection({
  title,
  icon: Icon,
  onEdit,
  children,
  className,
}: {
  title: string
  icon?: LucideIcon
  onEdit?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-border bg-white', className)}>
      <header className="flex items-center gap-3 border-b border-[#EEF0F3] bg-[#FCFCFD] px-4 py-2.5 sm:px-5">
        {Icon ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-secondary" aria-hidden="true">
            <Icon className="size-4" />
          </span>
        ) : null}
        <h4 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</h4>
        {onEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-10 rounded-[10px] px-3 text-sm font-semibold text-secondary hover:bg-accent hover:text-secondary"
          >
            <Pencil aria-hidden="true" />
            Editar<span className="sr-only"> {title}</span>
          </Button>
        ) : null}
      </header>
      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3.5 px-4 py-4 sm:grid-cols-2 sm:px-5">{children}</dl>
    </section>
  )
}

export function ReviewItem({
  label,
  value,
  wide,
  empty = 'Não informado',
}: {
  label: string
  value: ReactNode
  /** Ocupa as duas colunas. */
  wide?: boolean
  /** Texto quando não há valor. */
  empty?: string
}) {
  const isEmpty = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="m-0 mt-0.5 break-words text-sm font-medium text-foreground">
        {isEmpty ? <span className="font-normal italic text-muted-foreground">{empty}</span> : value}
      </dd>
    </div>
  )
}
