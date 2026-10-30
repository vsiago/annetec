'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { BadgePercent } from 'lucide-react'
import { toast } from 'sonner'
import type { DiscountRequest, DiscountRequestStatus } from '@annetec/contracts'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  ConfirmDialog,
  LoadError,
  TableSkeleton,
  runCommand,
  useConsoleData,
  usePlatformRole,
} from '@/components/admin-platform/billing/console-kit'
import { openableRowProps } from '@/components/admin-platform/billing/billing-bits'
import { useSellers } from '@/components/admin-platform/comercial/comercial-kit'
import { ApproveDiscountWizard } from '@/components/admin-platform/comercial/discount-decision'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { FilterSelect, TableFooter } from '@/components/admin-platform/ui/table-controls'
import { ApprovalsTabsRow, SITUATIONS, type DiscountSituation } from '@/components/admin-platform/approvals/approvals-kit'
import { DiscountRequestDetail } from '@/components/admin-platform/approvals/discount-request-detail'
import { DiscountStatusPill, discountSummary, formatRelativeShort } from '@/components/sales/sales-ui'
import { getDiscountRequestAction, listDiscountRequestsAction, rejectDiscountAction } from '@/lib/actions/comercial-api'
import { formatDateTimeBR } from '@/lib/adapters/platform-console'

/**
 * Aprovações › Descontos de vendedores: a fila dos pedidos de condição
 * especial dos vendedores ANNETEC. O detalhe (gaveta) compara a cotação cheia
 * com a pedida, mostra a justificativa e deixa o superadmin aprovar (com
 * ajuste opcional) ou recusar com motivo. `?pedido=<id>` abre o pedido direto
 * (link do sino); `?proposta=<id>` abre o pedido aguardando daquela proposta.
 */

const STATUS_OF: Record<DiscountSituation, DiscountRequestStatus | undefined> = {
  aguardando: 'pending',
  aprovados: 'approved',
  recusados: 'rejected',
  todos: undefined,
}

/** Quantos pedidos em cada situação (com o filtro de vendedor). */
function useDiscountCounts(seller: string, version: number) {
  const [counts, setCounts] = useState<Partial<Record<DiscountSituation, number>>>({})
  useEffect(() => {
    let cancelled = false
    const sellerUserId = seller === 'all' ? undefined : seller
    void Promise.all(
      SITUATIONS.descontos.map(async item => {
        const result = await listDiscountRequestsAction({ status: STATUS_OF[item.value], sellerUserId, perPage: 1 })
        return [item.value, result.success ? result.data.meta.total : undefined] as const
      }),
    )
      .then(entries => {
        if (!cancelled) setCounts(Object.fromEntries(entries))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [seller, version])
  return counts
}

export function DiscountsPanel({
  situation,
  onSituationChange,
  kindSwitcher,
  focusedRequest,
  focusedProposal,
  onFocus,
  version,
  onChanged,
}: {
  situation: DiscountSituation
  onSituationChange: (value: DiscountSituation) => void
  kindSwitcher: ReactNode
  /** `?pedido=<id>`: a gaveta desse pedido aberta. */
  focusedRequest: string | null
  /** `?proposta=<id>`: abre o pedido aguardando desta proposta. */
  focusedProposal: string | null
  onFocus: (focus: { pedido: string | null; proposta?: string | null }) => void
  version: number
  /** Decisão tomada: a página relê o resumo. */
  onChanged: () => void
}) {
  const { isSuperadmin } = usePlatformRole()
  const sellers = useSellers()
  const [seller, setSeller] = useState('all')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('25')
  const [localVersion, setLocalVersion] = useState(0)
  const [approving, setApproving] = useState<DiscountRequest | null>(null)
  const [rejecting, setRejecting] = useState<DiscountRequest | null>(null)

  const status = STATUS_OF[situation]
  const list = useConsoleData(
    () =>
      listDiscountRequestsAction({
        status,
        sellerUserId: seller === 'all' ? undefined : seller,
        page,
        perPage: Number(perPage),
      }),
    [status, seller, page, perPage, version, localVersion],
  )
  const counts = useDiscountCounts(seller, version + localVersion)
  const detail = useConsoleData(focusedRequest ? () => getDiscountRequestAction(focusedRequest) : null, [focusedRequest])

  useEffect(() => setPage(1), [status, seller, perPage])

  // Veio do aviso da proposta (`?proposta=`): o pedido aguardando daquela proposta.
  useEffect(() => {
    if (!focusedProposal || focusedRequest) return
    let cancelled = false
    void listDiscountRequestsAction({ status: 'pending', perPage: 100 }).then(result => {
      if (cancelled) return
      const match = result.success ? result.data.items.find(item => item.proposalId === focusedProposal) : undefined
      if (match) onFocus({ pedido: match.id, proposta: null })
      else {
        toast.info('Nenhum pedido de desconto aguardando para esta proposta.')
        onFocus({ pedido: null, proposta: null })
      }
    })
    return () => {
      cancelled = true
    }
  }, [focusedProposal, focusedRequest, onFocus])

  const items = list.data?.items ?? []
  const total = list.data?.meta.total ?? 0
  const current = detail.data && detail.data.id === focusedRequest ? detail.data : null

  const afterDecision = (updated: DiscountRequest) => {
    detail.setData(updated)
    setLocalVersion(value => value + 1)
    onChanged()
  }

  return (
    <SectionCard padded={false}>
      <ApprovalsTabsRow
        situations={SITUATIONS.descontos}
        value={situation}
        onChange={onSituationChange}
        counts={counts}
        kindSwitcher={kindSwitcher}
      />

      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:flex-wrap lg:items-center">
        <FilterSelect label="Vendedor" value={seller} onChange={setSeller} allLabel="Todos" options={sellers.options} />
      </div>

      <div className="border-t border-border">
        {list.error && !list.data ? (
          <LoadError message={list.error} onRetry={() => list.reload()} framed={false} />
        ) : !list.data ? (
          <TableSkeleton rows={4} />
        ) : items.length === 0 ? (
          <EmptyState
            tone={situation === 'aguardando' ? 'success' : 'default'}
            icon={BadgePercent}
            title={situation === 'aguardando' ? 'Nenhum pedido aguardando' : 'Nenhum pedido aqui'}
            description={situation === 'aguardando' ? 'Quando um vendedor pedir desconto, ele aparece aqui e no sino.' : undefined}
          />
        ) : (
          <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
            <DataTable caption="Descontos pedidos pelos vendedores" minWidth="min-w-[860px]" framed={false}>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Vendedor</Th>
                  <Th>Desconto pedido</Th>
                  <Th>Plano</Th>
                  <Th>Pedido</Th>
                  <Th>Situação</Th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <Tr
                    key={item.id}
                    {...openableRowProps(() => onFocus({ pedido: item.id }))}
                    aria-current={item.id === focusedRequest ? 'true' : undefined}
                  >
                    <Td>
                      <div className="min-w-0 max-w-64">
                        <p className="m-0 truncate font-medium text-foreground">{item.customerName}</p>
                        <p className="m-0 truncate font-mono text-xs text-muted-foreground">{item.proposalCode}</p>
                      </div>
                    </Td>
                    <Td>
                      <span className="text-sm text-foreground">{item.sellerName ?? '—'}</span>
                    </Td>
                    <Td>
                      <span className="text-sm text-foreground">{discountSummary(item.requested)}</span>
                    </Td>
                    <Td>
                      <span className="text-sm text-muted-foreground">{item.planName ?? '—'}</span>
                    </Td>
                    <Td>
                      <span className="whitespace-nowrap text-xs text-muted-foreground" title={formatDateTimeBR(item.createdAt)}>
                        {formatRelativeShort(item.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      <DiscountStatusPill status={item.status} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>

      {list.data && total > 0 ? (
        <TableFooter page={page} perPage={perPage} total={total} noun="pedidos" onPageChange={setPage} onPerPageChange={setPerPage} />
      ) : null}

      <Sheet open={!!focusedRequest} onOpenChange={open => !open && onFocus({ pedido: null })}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="border-b border-border">
            <SheetTitle>{current ? `Desconto para ${current.customerName}` : 'Pedido de desconto'}</SheetTitle>
            <SheetDescription>
              {current ? `Pedido por ${current.sellerName ?? 'vendedor'} · ${discountSummary(current.requested)}` : 'Carregando…'}
            </SheetDescription>
          </SheetHeader>
          <div className="p-4 sm:p-6">
            {detail.error && !current ? (
              <ErrorState framed={false} size="sm" title={detail.error} onRetry={() => detail.reload()} />
            ) : !current ? (
              <SectionSkeleton rows={8} label="Carregando o pedido…" />
            ) : (
              <DiscountRequestDetail
                request={current}
                isSuperadmin={isSuperadmin}
                onApprove={() => setApproving(current)}
                onReject={() => setRejecting(current)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ApproveDiscountWizard
        request={approving}
        onOpenChange={open => !open && setApproving(null)}
        onDone={updated => {
          afterDecision(updated)
          toast.success('Desconto aprovado. O vendedor foi avisado')
        }}
      />
      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={open => !open && setRejecting(null)}
        title={rejecting ? `Recusar o desconto para ${rejecting.customerName}?` : 'Recusar o desconto?'}
        description="O vendedor recebe o motivo no sino e pode reenviar o link sem desconto ou fazer outro pedido."
        confirmLabel="Recusar desconto"
        destructive
        reason={{ label: 'Motivo (o vendedor vai ler)', placeholder: 'Ex.: isenção total só para clubes acima de 5 mil vidas.', minLength: 5 }}
        onConfirm={async reason => {
          if (!rejecting) return false
          const updated = await runCommand(rejectDiscountAction(rejecting.id, { reason }), 'Desconto recusado. O vendedor foi avisado')
          if (updated) afterDecision(updated)
          return !!updated
        }}
      />
    </SectionCard>
  )
}
