'use client'

import { useEffect, useState } from 'react'
import { UsersRound } from 'lucide-react'
import type { ClubPaymentMethod, ClubSubscription, ClubSubscriptionStatus } from '@annetec/contracts'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/dashboard/empty-state'
import {
  DataTable,
  FilterSelect,
  SearchInput,
  StatusPill,
  TableFooter,
  type Column,
} from '@/components/dashboard/table-controls'
import { listClubSubscriptionsAction } from '@/lib/actions/faturamento-api'
import {
  formatBRL,
  formatCpf,
  formatDateBR,
  PAYMENT_METHOD_OPTIONS,
  SUBSCRIPTION_STATUS_OPTIONS,
  subscriptionStatusMeta,
} from '@/lib/adapters/faturamento'
import { cn } from '@/lib/utils'
import { LoadError, MethodLabel, TableSkeleton } from './billing-ui'
import { useDebounced } from './charges-tab'
import { SubscriptionActionsMenu, useSubscriptionActions, type SubscriptionAction } from './subscription-actions'
import { SubscriptionDetailSheet } from './subscription-detail-sheet'
import { useActionData } from './use-action-data'

export function SubscriptionsTab({
  tenantSlug,
  version,
  onChanged,
  plans,
  onViewCharges,
  onOpenCharge,
  openSubscriptionId,
  onOpenSubscriptionHandled,
}: {
  tenantSlug: string
  version: number
  onChanged: () => void
  plans: { id: string; name: string }[]
  onViewCharges: (subscription: { id: string; name: string }) => void
  /** Abre o detalhe de uma cobrança na aba Cobranças ("Ver cobrança" do "Gerar cobrança"). */
  onOpenCharge?: (chargeId: string) => void
  /** Abre a ficha desta assinatura (link vindo do detalhe de uma cobrança). */
  openSubscriptionId?: string | null
  onOpenSubscriptionHandled?: () => void
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | ClubSubscriptionStatus>('all')
  const [planId, setPlanId] = useState('all')
  const [method, setMethod] = useState<'all' | ClubPaymentMethod>('all')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('10')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [localVersion, setLocalVersion] = useState(0)

  const q = useDebounced(search.trim())

  useEffect(() => {
    setPage(1)
  }, [q, status, planId, method, perPage])

  useEffect(() => {
    if (openSubscriptionId) {
      setDetailId(openSubscriptionId)
      onOpenSubscriptionHandled?.()
    }
  }, [openSubscriptionId, onOpenSubscriptionHandled])

  const list = useActionData(
    tenantSlug
      ? () =>
          listClubSubscriptionsAction(tenantSlug, {
            page,
            perPage: Number(perPage),
            q: q || undefined,
            status: status === 'all' ? undefined : status,
            planId: planId === 'all' ? undefined : planId,
            method: method === 'all' ? undefined : method,
          })
      : null,
    [tenantSlug, page, perPage, q, status, planId, method, version, localVersion],
  )

  function changed() {
    setLocalVersion(value => value + 1)
    onChanged()
  }

  const actions = useSubscriptionActions({
    tenantSlug,
    onChanged: changed,
    onChargeCreated: changed,
    onViewCharge: onOpenCharge
      ? chargeId => {
          setDetailId(null)
          onOpenCharge(chargeId)
        }
      : undefined,
  })

  function handleAction(action: SubscriptionAction, subscription: ClubSubscription) {
    if (action === 'detail') setDetailId(subscription.id)
    else if (action === 'charges') onViewCharges({ id: subscription.id, name: subscription.holder.name })
    else if (action === 'generate_charge') actions.requestGenerateCharge(subscription)
    else if (action === 'cancel') actions.requestCancel(subscription)
    else if (action === 'reactivate') actions.requestReactivate(subscription)
  }

  const rows = list.data?.items ?? []
  const total = list.data?.meta.total ?? 0
  const filtersActive = Boolean(q) || status !== 'all' || planId !== 'all' || method !== 'all'

  const columns: Column<ClubSubscription>[] = [
    {
      key: 'titular',
      header: 'Titular',
      render: subscription => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{subscription.holder.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatCpf(subscription.holder.cpf)} · {subscription.holder.email}
          </p>
        </div>
      ),
    },
    {
      key: 'plano',
      header: 'Plano',
      hideOnMobile: true,
      render: subscription => (
        <div>
          <p className="text-foreground">{subscription.planName}</p>
          <p className="text-xs text-muted-foreground">
            {subscription.dependents.length === 0
              ? 'Individual'
              : `+ ${subscription.dependents.length} ${subscription.dependents.length === 1 ? 'dependente' : 'dependentes'}`}
          </p>
        </div>
      ),
    },
    {
      key: 'valor',
      header: 'Valor/mês',
      render: subscription => (
        <span className="whitespace-nowrap font-medium text-foreground">{formatBRL(subscription.amount)}</span>
      ),
    },
    {
      key: 'metodo',
      header: 'Método',
      hideOnMobile: true,
      render: subscription => <MethodLabel method={subscription.paymentMethod} card={subscription.paymentCard} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: subscription => <StatusPill {...subscriptionStatusMeta(subscription.status)} />,
    },
    {
      key: 'proximo',
      header: 'Próx. vencimento',
      hideOnMobile: true,
      render: subscription => (
        <span className="whitespace-nowrap text-muted-foreground">
          {subscription.nextDueDate ? formatDateBR(subscription.nextDueDate) : '—'}
        </span>
      ),
    },
    {
      key: 'aberto',
      header: 'Em aberto',
      hideOnMobile: true,
      render: subscription =>
        subscription.openAmount > 0 ? (
          <div className="whitespace-nowrap">
            <p className="font-medium text-red-600 dark:text-red-400">{formatBRL(subscription.openAmount)}</p>
            {subscription.overdueCount > 0 && (
              <p className="text-xs text-muted-foreground">{subscription.overdueCount} vencida(s)</p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'acoes',
      header: '',
      align: 'right',
      render: subscription => (
        <div onClick={event => event.stopPropagation()} className="inline-flex">
          <SubscriptionActionsMenu subscription={subscription} onAction={handleAction} />
        </div>
      ),
    },
  ]

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <div className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nome, CPF, e-mail ou nº da carteirinha..."
        />
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Status"
            value={status}
            onChange={value => setStatus(value as 'all' | ClubSubscriptionStatus)}
            allLabel="Todos"
            options={SUBSCRIPTION_STATUS_OPTIONS}
          />
          <FilterSelect
            label="Plano"
            value={planId}
            onChange={setPlanId}
            allLabel="Todos os planos"
            options={plans.map(plan => ({ value: plan.id, label: plan.name }))}
          />
          <FilterSelect
            label="Método"
            value={method}
            onChange={value => setMethod(value as 'all' | ClubPaymentMethod)}
            allLabel="Todos"
            options={PAYMENT_METHOD_OPTIONS}
          />
        </div>
      </div>

      {list.error && (
        <div className="px-4 pb-4">
          <LoadError message={list.error} onRetry={() => void list.reload()} />
        </div>
      )}

      <CardContent className={cn('p-0 transition-opacity', list.loading && list.data && 'opacity-60')}>
        {!list.data && list.loading ? (
          <TableSkeleton />
        ) : !list.data ? null : rows.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title={filtersActive ? 'Nenhuma assinatura com estes filtros' : 'Nenhuma assinatura ainda'}
            description={
              filtersActive
                ? 'Ajuste a busca ou os filtros.'
                : 'As assinaturas chegam pelo checkout do site do clube — nenhuma precisa ser digitada aqui.'
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={subscription => subscription.id}
            onRowClick={subscription => setDetailId(subscription.id)}
            isRowActive={subscription => subscription.id === detailId}
          />
        )}
      </CardContent>

      {list.data && total > 0 && (
        <TableFooter
          page={page}
          perPage={perPage}
          total={total}
          noun="assinaturas"
          onPageChange={setPage}
          onPerPageChange={setPerPage}
        />
      )}

      <SubscriptionDetailSheet
        tenantSlug={tenantSlug}
        subscriptionId={detailId}
        open={detailId !== null}
        onOpenChange={open => !open && setDetailId(null)}
        onChanged={changed}
        onChargesChanged={changed}
        onViewCharges={(id, name) => {
          setDetailId(null)
          onViewCharges({ id, name })
        }}
        onOpenCharge={
          onOpenCharge
            ? chargeId => {
                setDetailId(null)
                onOpenCharge(chargeId)
              }
            : undefined
        }
      />
      {actions.dialogs}
    </Card>
  )
}
