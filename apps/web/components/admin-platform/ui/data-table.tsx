import type { ComponentProps, ReactNode } from 'react'
import { CARD_SURFACE } from '@/components/admin-platform/ui/tone'
import { cn } from '@/lib/utils'

/**
 * DataTable — a tabela padrão do console (/admin). Toda lista tabular usa o
 * mesmo cabeçalho, as mesmas linhas e a mesma caixa com rolagem horizontal no
 * celular. Não use `<Table>` do shadcn nem `<table>` solto nas telas do console.
 *
 *   <DataTable caption="Clubes cadastrados" minWidth="min-w-[960px]">
 *     <thead><tr><Th>Clube</Th><Th align="right">Valor</Th></tr></thead>
 *     <tbody>{rows.map(r => <Tr key={r.id}><Td>...</Td><Td align="right">...</Td></Tr>)}</tbody>
 *   </DataTable>
 *
 * - `caption`: descrição para leitores de tela (obrigatória, fica oculta).
 * - `minWidth`: largura mínima antes de rolar na horizontal (classe Tailwind).
 * - Dentro de um `SectionCard padded={false}` use `framed={false}` para a
 *   tabela não desenhar uma segunda borda.
 * - Lista vazia: não renderize a tabela; mostre `EmptyState`.
 * - `TH` / `TD`: as mesmas classes, para quem precisa de `<th>`/`<td>` crus.
 */

/**
 * Cabeçalho leve: fundo cinza-azulado, rótulo pequeno em caixa alta. É
 * `sticky` — fica preso no topo quando a caixa da tabela tem altura máxima
 * (`TableCard className="max-h-[...]"`), sem efeito quando não tem.
 */
export const TH =
  'sticky top-0 z-[1] whitespace-nowrap border-b border-border bg-[#F6F8FB] px-5 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#475467]'
export const TD = 'border-b border-[#EDF1F6] px-5 py-3.5 align-middle group-last:border-b-0'

/** Caixa da tabela: cantos arredondados, borda suave e rolagem horizontal. */
export function TableCard({
  children,
  framed = true,
  className,
}: {
  children: ReactNode
  framed?: boolean
  className?: string
}) {
  return (
    <div className={cn('max-w-full overflow-x-auto', framed && CARD_SURFACE, className)}>
      {children}
    </div>
  )
}

export function DataTable({
  caption,
  minWidth = 'min-w-[720px]',
  framed = true,
  children,
  className,
}: {
  caption: string
  minWidth?: string
  framed?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <TableCard framed={framed}>
      <table className={cn('w-full border-collapse text-sm', minWidth, className)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </TableCard>
  )
}

export function Th({
  align = 'left',
  className,
  ...props
}: ComponentProps<'th'> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={cn(TH, align === 'right' && 'text-right', align === 'center' && 'text-center', className)}
      {...props}
    />
  )
}

/** Célula. `align="right"` é para números: alinha à direita com algarismos de largura fixa. */
export function Td({
  align = 'left',
  className,
  ...props
}: ComponentProps<'td'> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={cn(TD, align === 'right' && 'text-right tabular-nums', align === 'center' && 'text-center', className)}
      {...props}
    />
  )
}

export function Tr({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('group transition-colors duration-150 hover:bg-[#F6F9FC]', className)} {...props} />
}

/** Esqueleto de tabela (carregando): cabeçalho + linhas, na mesma caixa. */
export function TableLoading({
  rows = 6,
  label = 'Carregando…',
  framed = true,
}: {
  rows?: number
  label?: string
  /** `false` dentro de um SectionCard, para não duplicar a borda. */
  framed?: boolean
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('overflow-hidden', framed && CARD_SURFACE)}
    >
      <span className="sr-only">{label}</span>
      <div className="h-11 border-b border-border bg-[#F6F8FB]" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-[#EDF1F6] px-5 py-4 last:border-b-0">
          <div className="size-10 shrink-0 animate-pulse rounded-xl bg-[#EEF0F3]" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-44 max-w-full animate-pulse rounded bg-[#EEF0F3]" />
            <div className="h-3 w-32 max-w-full animate-pulse rounded bg-[#F2F4F7]" />
          </div>
          <div className="h-6 w-16 animate-pulse rounded-full bg-[#EEF0F3]" />
          <div className="hidden h-4 w-12 animate-pulse rounded bg-[#EEF0F3] sm:block" />
          <div className="hidden h-6 w-24 animate-pulse rounded-full bg-[#EEF0F3] md:block" />
        </div>
      ))}
    </div>
  )
}
