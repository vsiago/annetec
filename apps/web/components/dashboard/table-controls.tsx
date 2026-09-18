'use client'

import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

/**
 * Peças da barra de filtros e do rodapé das listas do painel. Ficam juntas
 * aqui porque Leads, Vendas e Beneficiários repetem exatamente o mesmo
 * enquadramento — busca à esquerda, selects rotulados, paginação numerada e
 * o seletor de itens por página.
 */

export const PER_PAGE_OPTIONS = ['10', '25', '50']

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  return (
    <div className={cn('relative w-full min-w-0 flex-1 sm:min-w-60', className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-14 w-full rounded-xl border border-border/70 bg-muted/40 pl-11 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:bg-card focus:ring-2 focus:ring-primary/15"
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
      {/* `data-[size=default]:h-14` porque a altura padrão do trigger vem de um
          variant de data-attribute, que vence um `h-14` solto na especificidade. */}
      <SelectTrigger className="w-full rounded-xl data-[size=default]:h-14 sm:w-44">
        <span className="flex flex-col items-start gap-0.5">
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

export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  /** Esconde a coluna no mobile, onde não cabe tudo. */
  hideOnMobile?: boolean
  render: (row: T) => ReactNode
}

/**
 * Tabela das listagens do painel. Existe porque as abas de Financeiro,
 * Comissões e Relatórios são a MESMA tabela com colunas diferentes — sem
 * isso, cada aba viria com seu próprio `<thead>` copiado e colado.
 *
 * Rola na horizontal em telas estreitas e as colunas marcadas com
 * `hideOnMobile` somem, para o celular mostrar só o que decide.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = 'Nenhum registro encontrado.',
  onRowClick,
  isRowActive,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  empty?: string
  onRowClick?: (row: T) => void
  isRowActive?: (row: T) => boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
            {columns.map(column => (
              <th
                key={column.key}
                className={cn(
                  'px-4 py-3 font-medium whitespace-nowrap',
                  column.align === 'right' && 'text-right',
                  column.hideOnMobile && 'hidden md:table-cell',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-border/60 last:border-0',
                onRowClick && 'cursor-pointer hover:bg-muted/40',
                !onRowClick && 'hover:bg-muted/40',
                isRowActive?.(row) && 'bg-primary/5',
              )}
            >
              {columns.map(column => (
                <td
                  key={column.key}
                  className={cn(
                    'px-4 py-3',
                    column.align === 'right' && 'text-right',
                    column.hideOnMobile && 'hidden md:table-cell',
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Linha rótulo → valor, usada nos resumos laterais e nas fichas. */
export function SummaryRow({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string
  value: ReactNode
  hint?: string
  emphasis?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-1.5',
        emphasis && 'border-t border-border pt-2.5 font-semibold',
      )}
    >
      <span className="min-w-0">
        <span className={cn('block truncate text-sm', emphasis ? 'text-foreground' : 'text-muted-foreground')}>
          {label}
        </span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
      <span className={cn('shrink-0 text-sm', emphasis ? 'text-foreground' : 'font-medium text-foreground')}>
        {value}
      </span>
    </div>
  )
}

export function StatusPill({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', className)}>
      {label}
    </span>
  )
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
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {pages.map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? 'default' : 'outline'}
            size="icon"
            className="h-9 w-9 text-sm"
            onClick={() => onChange(item)}
          >
            {item}
          </Button>
        ),
      )}
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9"
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Próxima página"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
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
  /** Plural do que está listado: "leads", "vendas", "beneficiários". */
  noun: string
  onPageChange: (page: number) => void
  onPerPageChange: (perPage: string) => void
}) {
  const size = Number(perPage)
  const totalPages = Math.max(1, Math.ceil(total / size))

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border p-4">
      <p className="text-sm text-muted-foreground">
        {total === 0
          ? `Nenhum registro em ${noun}`
          : `Mostrando ${(page - 1) * size + 1} a ${Math.min(page * size, total)} de ${total.toLocaleString('pt-BR')} ${noun}`}
      </p>
      <div className="flex w-full items-center gap-4 overflow-x-auto sm:w-auto">
        <TablePagination page={page} totalPages={totalPages} onChange={onPageChange} />
        <Select value={perPage} onValueChange={onPerPageChange}>
          <SelectTrigger className="h-9 w-36 text-xs">
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
