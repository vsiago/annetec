'use client'

import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * Barra de filtros e rodapé de paginação das listas do console (/admin).
 * Use junto com `DataTable`, dentro de um `SectionCard padded={false}`:
 *
 *   <div className="flex flex-wrap gap-4 px-6 py-5">
 *     <SearchInput ... /> <FilterSelect ... />
 *   </div>
 *   <DataTable framed={false} ...>...</DataTable>
 *   <TableFooter ... />
 *
 * É a versão do console das peças de `components/dashboard/table-controls`
 * (que continuam sendo as do painel do clube): campos de 48px com cantos
 * `rounded-xl`, foco marinho e botões de paginação de 40px.
 * Não use as do `dashboard` nas telas do console.
 */

export const PER_PAGE_OPTIONS = ['10', '25', '50']

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  /** Rótulo para leitores de tela (padrão: o próprio placeholder). */
  label?: string
  className?: string
}) {
  return (
    <div className={cn('relative w-full min-w-0 flex-1 sm:min-w-60', className)}>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoComplete="off"
        className="h-12 w-full rounded-xl border border-border bg-card pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-secondary focus-visible:ring-[3px] focus-visible:ring-secondary/25"
      />
    </div>
  )
}

/** Select da barra de filtros: rótulo pequeno acima do valor selecionado. */
export function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  allLabel: string
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      {/* `data-[size=default]:h-12` porque a altura padrão do trigger vem de um
          variant de data-attribute, que vence um `h-12` solto na especificidade. */}
      <SelectTrigger
        aria-label={label}
        className="w-full rounded-xl border-border bg-card data-[size=default]:h-12 sm:w-44"
      >
        <span className="flex min-w-0 flex-col items-start gap-0.5">
          <span className="text-[11px] leading-none text-muted-foreground">{label}</span>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map(option => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Coluna de uma lista simples (rótulo do cabeçalho + como desenhar a célula). */
export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  /** Esconde a coluna no mobile, onde não cabe tudo. */
  hideOnMobile?: boolean
  render: (row: T) => ReactNode
}

/** Paginação numerada com elipse, no formato "‹ 1 2 3 4 5 … 125 ›". */
export function TablePagination({
  page,
  totalPages,
  onChange,
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
}) {
  const pages: (number | 'gap')[] = []
  const windowSize = 5

  if (totalPages <= windowSize + 2) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    const start = Math.max(1, Math.min(page - 2, totalPages - windowSize))
    for (let i = start; i < start + windowSize; i++) pages.push(i)
    if (start + windowSize < totalPages) pages.push('gap')
    if (start + windowSize <= totalPages) pages.push(totalPages)
  }

  return (
    <nav aria-label="Páginas" className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="size-10 rounded-[10px]"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        aria-label="Página anterior"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Button>
      {pages.map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-muted-foreground" aria-hidden="true">
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? 'default' : 'outline'}
            size="icon"
            className="size-10 rounded-[10px] text-sm"
            aria-label={`Página ${item}`}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </Button>
        ),
      )}
      <Button
        variant="outline"
        size="icon"
        className="size-10 rounded-[10px]"
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Próxima página"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </nav>
  )
}

/** Rodapé padrão: contagem à esquerda, paginação e itens por página à direita. */
export function TableFooter({
  page,
  perPage,
  total,
  noun,
  onPageChange,
  onPerPageChange,
}: {
  page: number
  perPage: string
  total: number
  /** Plural do que está listado: "propostas", "e-mails", "faturas". */
  noun: string
  onPageChange: (page: number) => void
  onPerPageChange: (perPage: string) => void
}) {
  const size = Number(perPage)
  const totalPages = Math.max(1, Math.ceil(total / size))

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-6 py-4">
      <p className="m-0 text-sm text-muted-foreground" aria-live="polite">
        {total === 0
          ? `Nenhum registro em ${noun}`
          : `Mostrando ${(page - 1) * size + 1} a ${Math.min(page * size, total)} de ${total.toLocaleString('pt-BR')} ${noun}`}
      </p>
      <div className="flex w-full items-center gap-4 overflow-x-auto sm:w-auto">
        <TablePagination page={page} totalPages={totalPages} onChange={onPageChange} />
        <Select value={perPage} onValueChange={onPerPageChange}>
          <SelectTrigger aria-label="Itens por página" className="w-36 rounded-[10px] border-border bg-card text-xs data-[size=default]:h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PER_PAGE_OPTIONS.map(option => (
              <SelectItem key={option} value={option}>
                {option} por página
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
