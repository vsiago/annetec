'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileSignature, KanbanSquare } from 'lucide-react'
import { RefreshButton, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { SectionTab, SectionTabsList } from '@/components/admin-platform/ui/section-tabs'
import { TableFooter } from '@/components/admin-platform/ui/table-controls'
import { Tabs } from '@/components/ui/tabs'
import { useSellerProfile } from '@/contexts/seller-profile-context'
import { formatCnpj } from '@/lib/adapters/platform-console'
import {
  LinkStatusPill,
  SellerProposalStatusPill,
  formatInt,
  formatMoney,
  formatRelativeShort,
} from '@/components/sales/sales-ui'
import { DiscountCell, ProposalActionsMenu, useProposalActions } from '@/components/vendas/proposal-actions'
import { listSellerProposalsAction } from '@/lib/actions/vendas-api'

/**
 * "Minhas propostas": as propostas de contratação atribuídas ao vendedor
 * (links que ele gerou e clientes que vieram pelo código dele), com a
 * situação da proposta, do link e do desconto.
 */

type Group = 'open' | 'done' | 'all'

const GROUPS: { value: Group; label: string }[] = [
  { value: 'open', label: 'Em andamento' },
  { value: 'done', label: 'Concluídas' },
  { value: 'all', label: 'Todas' },
]

const EMPTY: Record<Group, { title: string; description: string }> = {
  open: { title: 'Nenhuma proposta em andamento', description: 'Gere um link de contratação a partir de um prospect do funil.' },
  done: { title: 'Nenhuma proposta concluída', description: 'Clubes no ar, reprovados e cancelados aparecem aqui.' },
  all: { title: 'Nenhuma proposta ainda', description: 'Gere um link de contratação a partir de um prospect do funil.' },
}

export default function SellerProposalsPage() {
  const router = useRouter()
  const { canWrite } = useSellerProfile()
  const [group, setGroup] = useState<Group>('open')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('25')
  const list = useConsoleData(() => listSellerProposalsAction({ group, page, perPage: Number(perPage) }), [group, page, perPage])

  useEffect(() => setPage(1), [group, perPage])

  const { dialogs, sendLink, requestDiscount } = useProposalActions(updated => {
    list.setData(current =>
      current ? { ...current, items: current.items.map(item => (item.id === updated.id ? updated : item)) } : current,
    )
  })

  const rows = list.data?.items ?? []

  return (
    <PageContainer>
      <PageHeader
        icon={FileSignature}
        title="Propostas"
        description="Os links de contratação que você gerou e os clientes que vieram pelo seu código."
        actions={<RefreshButton loading={list.loading} onClick={() => list.reload({ silent: true })} />}
      />

      <SectionCard padded={false}>
        <Tabs value={group} onValueChange={value => setGroup(value as Group)} className="gap-0">
          <div className="px-6 pt-3">
            <SectionTabsList>
              {GROUPS.map(item => (
                <SectionTab key={item.value} value={item.value}>
                  {item.label}
                </SectionTab>
              ))}
            </SectionTabsList>
          </div>
        </Tabs>

        {list.error && !list.data ? (
          <ErrorState framed={false} onRetry={() => list.reload()} />
        ) : !list.data ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title={EMPTY[group].title}
            description={EMPTY[group].description}
            action={
              <Button asChild variant="outline" className="h-11 rounded-[10px] px-4 font-semibold">
                <Link href="/vendas/funil">
                  <KanbanSquare aria-hidden="true" />
                  Abrir o funil
                </Link>
              </Button>
            }
          />
        ) : (
          <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
            <DataTable caption="Suas propostas de contratação" minWidth="min-w-[1000px]" framed={false}>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Plano</Th>
                  <Th>Proposta</Th>
                  <Th>Link</Th>
                  <Th>Desconto</Th>
                  <Th align="right">
                    <span className="sr-only">Ações</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(item => (
                  <Tr key={item.id} className="cursor-pointer" onClick={() => router.push(`/vendas/propostas/${item.id}`)}>
                    <Td>
                      <Link
                        href={`/vendas/propostas/${item.id}`}
                        onClick={event => event.stopPropagation()}
                        className="block max-w-64 truncate rounded font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
                      >
                        {item.customerName}
                      </Link>
                      <p className="m-0 whitespace-nowrap text-xs text-muted-foreground">CNPJ {formatCnpj(item.cnpj)}</p>
                      <p className="m-0 font-mono text-[11px] text-muted-foreground">{item.code}</p>
                    </Td>
                    <Td>
                      <p className="m-0 text-sm text-foreground">{item.planName ?? '—'}</p>
                      <p className="m-0 whitespace-nowrap text-xs text-muted-foreground">
                        {formatInt(item.expectedLives)} vidas{item.quote ? ` · ${formatMoney(item.quote.monthlyTotal)}/mês` : ''}
                      </p>
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <SellerProposalStatusPill status={item.status} />
                        <span className="text-xs text-muted-foreground">atualizada {formatRelativeShort(item.updatedAt)}</span>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <LinkStatusPill status={item.linkStatus} />
                        {item.inviteSentAt ? (
                          <span className="text-xs text-muted-foreground">enviado {formatRelativeShort(item.inviteSentAt)}</span>
                        ) : null}
                      </div>
                    </Td>
                    <Td>
                      <DiscountCell proposal={item} />
                    </Td>
                    <Td align="right" onClick={event => event.stopPropagation()}>
                      <ProposalActionsMenu proposal={item} canWrite={canWrite} onSend={sendLink} onDiscount={requestDiscount} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}

        {list.data && list.data.meta.total > 0 ? (
          <TableFooter
            page={page}
            perPage={perPage}
            total={list.data.meta.total}
            noun="propostas"
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        ) : null}
      </SectionCard>
      {dialogs}
    </PageContainer>
  )
}
