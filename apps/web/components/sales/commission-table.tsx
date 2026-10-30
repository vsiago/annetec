'use client'

import type { ReactNode } from 'react'
import type { SalesCommissionEntry } from '@annetec/contracts'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { CommissionStatusPill, commissionPartLabel, formatDay, formatMoney, formatPct, monthLabel, monthShort } from './sales-ui'

/**
 * Tabela de lançamentos de comissão (área do vendedor e Comercial). Na visão
 * da equipe ganha a coluna do vendedor e, opcionalmente, a seleção em lote.
 */
export function CommissionTable({
  items,
  showSeller = false,
  selection,
}: {
  items: SalesCommissionEntry[]
  showSeller?: boolean
  /** Seleção em lote (Comercial › Comissões): só os "a pagar" são selecionáveis. */
  selection?: {
    selected: ReadonlySet<string>
    toggle: (id: string) => void
    toggleAll: () => void
    allSelected: boolean
    disabled?: boolean
    header?: ReactNode
  }
}) {
  return (
    <DataTable caption="Lançamentos de comissão" minWidth={showSeller ? 'min-w-[1080px]' : 'min-w-[920px]'} framed={false}>
      <thead>
        <tr>
          {selection ? (
            <Th className="w-12">
              <input
                type="checkbox"
                className="size-4 accent-[#1E2A4A]"
                checked={selection.allSelected}
                onChange={selection.toggleAll}
                disabled={selection.disabled}
                aria-label="Selecionar todas as comissões a pagar desta página"
              />
            </Th>
          ) : null}
          {showSeller ? <Th>Vendedor</Th> : null}
          <Th>Clube</Th>
          <Th>Parte</Th>
          <Th>Competência</Th>
          <Th align="right">Base</Th>
          <Th align="right">%</Th>
          <Th align="right">Comissão</Th>
          <Th>Situação</Th>
          <Th>Data</Th>
        </tr>
      </thead>
      <tbody>
        {items.map(item => {
          const selectable = item.status === 'a_pagar'
          return (
            <Tr key={item.id}>
              {selection ? (
                <Td className="w-12">
                  <input
                    type="checkbox"
                    className="size-4 accent-[#1E2A4A]"
                    checked={selection.selected.has(item.id)}
                    onChange={() => selection.toggle(item.id)}
                    disabled={!selectable || selection.disabled}
                    aria-label={`Selecionar comissão de ${item.customerName} (${commissionPartLabel(item)})`}
                  />
                </Td>
              ) : null}
              {showSeller ? <Td className="whitespace-nowrap text-sm font-medium text-foreground">{item.sellerName ?? '—'}</Td> : null}
              <Td>
                <p className="m-0 max-w-60 truncate font-semibold text-foreground">{item.customerName}</p>
                {item.proposalCode ? <p className="m-0 font-mono text-[11px] text-muted-foreground">{item.proposalCode}</p> : null}
              </Td>
              <Td className="whitespace-nowrap text-sm">{commissionPartLabel(item)}</Td>
              <Td className="whitespace-nowrap text-sm">
                <span title={monthLabel(item.referenceMonth)}>{monthShort(item.referenceMonth)}</span>
              </Td>
              <Td align="right">{formatMoney(item.baseAmount)}</Td>
              <Td align="right">{formatPct(item.percent)}</Td>
              <Td align="right">
                <span className={item.status === 'a_descontar' ? 'font-semibold text-[#B42318]' : 'font-semibold text-foreground'}>
                  {item.status === 'a_descontar' ? `−${formatMoney(item.amount)}` : formatMoney(item.amount)}
                </span>
              </Td>
              <Td>
                <div className="flex flex-col items-start gap-1">
                  <CommissionStatusPill status={item.status} />
                  {item.status === 'cancelada' && item.cancelReason ? (
                    <span className="max-w-48 truncate text-xs text-muted-foreground" title={item.cancelReason}>
                      {item.cancelReason}
                    </span>
                  ) : null}
                </div>
              </Td>
              <Td className="whitespace-nowrap text-xs text-muted-foreground">
                {item.status === 'paga' && item.payoutDate ? (
                  <>
                    Repassada {formatDay(item.payoutDate)}
                    {item.payoutNote ? <span className="block max-w-48 truncate" title={item.payoutNote}>{item.payoutNote}</span> : null}
                  </>
                ) : item.chargePaidAt ? (
                  `Fatura paga ${new Date(item.chargePaidAt).toLocaleDateString('pt-BR')}`
                ) : (
                  '—'
                )}
              </Td>
            </Tr>
          )
        })}
      </tbody>
    </DataTable>
  )
}
