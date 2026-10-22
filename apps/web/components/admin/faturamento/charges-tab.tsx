'use client'

import { useEffect, useState } from 'react'
import { ReceiptText, SlidersHorizontal, X } from 'lucide-react'
import type { ClubCharge, ClubChargeStatus, ClubPaymentMethod } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/dashboard/empty-state'
import {
  DataTable,
  FilterSelect,
  SearchInput,
  StatusPill,
  TableFooter,
  type Column,
} from '@/components/dashboard/table-controls'
import { listClubChargesAction } from '@/lib/actions/faturamento-api'
import {
  CHARGE_STATUS_OPTIONS,
  chargeCompetence,
  isOneOffCharge,
  chargeStatusMeta,
  formatBRL,
  formatDateBR,
  PAYMENT_METHOD_OPTIONS,
  PERIOD_OPTIONS,
  periodRange,
  todaySP,
  type PeriodPreset,
} from '@/lib/adapters/faturamento'
import { cn } from '@/lib/utils'
import { LoadError, MethodLabel, TableSkeleton } from './billing-ui'
import { ChargeActionsMenu, useChargeActions } from './charge-actions'
import { ChargeDetailSheet } from './charge-detail-sheet'
import { useActionData } from './use-action-data'

export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Dias corridos entre duas datas-só (b − a). */
function daysBetween(a: string, b: string): number {
  const toUtc = (value: string) => {
    const [y, m, d] = value.split('-').map(Number)
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)
  }
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

type PeriodFilter = 'all' | PeriodPreset | 'custom'

export function ChargesTab({
  tenantSlug,
  canSimulate,
  version,
  onChanged,
  initialStatus,
  subscriptionFilter,
  onClearSubscriptionFilter,
  onOpenSubscription,
  openChargeId,
  onOpenChargeHandled,
}: {
  tenantSlug: string
  canSimulate: boolean
  version: number
  onChanged: () => void
  initialStatus?: ClubChargeStatus
  /** Filtro vindo da ficha do assinante ("Ver cobranças"). */
  subscriptionFilter: { id: string; name?: string } | null
  onClearSubscriptionFilter: () => void
  onOpenSubscription?: (subscriptionId: string) => void
  /** Abre o detalhe desta cobrança ao montar (link do Início). */
  openChargeId?: string | null
  onOpenChargeHandled?: () => void
}) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | ClubChargeStatus>(initialStatus ?? 'all')
  const [method, setMethod] = useState<'all' | ClubPaymentMethod>('all')
  const [period, setPeriod] = useState<PeriodFilter>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  // Forma e período ficam recolhidos: o dia a dia é status e nome.
  const [moreFilters, setMoreFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('10')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [localVersion, setLocalVersion] = useState(0)

  const q = useDebounced(search.trim())
  const range =
    period === 'custom'
      ? { from: customFrom || undefined, to: customTo || undefined }
      : period === 'all'
        ? {}
        : periodRange(period)

  useEffect(() => {
    if (initialStatus) setStatus(initialStatus)
  }, [initialStatus])

  useEffect(() => {
    if (openChargeId) {
      setDetailId(openChargeId)
      onOpenChargeHandled?.()
    }
  }, [openChargeId, onOpenChargeHandled])

  useEffect(() => {
    setPage(1)
  }, [q, status, method, period, customFrom, customTo, perPage, subscriptionFilter?.id])

  const list = useActionData(
    tenantSlug
      ? () =>
          listClubChargesAction(tenantSlug, {
            page,
            perPage: Number(perPage),
            q: q || undefined,
            status: status === 'all' ? undefined : status,
            method: method === 'all' ? undefined : method,
            from: range.from,
            to: range.to,
            subscriptionId: subscriptionFilter?.id,
          })
      : null,
    [tenantSlug, page, perPage, q, status, method, range.from, range.to, subscriptionFilter?.id, version, localVersion],
  )

  function changed() {
    setLocalVersion(value => value + 1)
    onChanged()
  }

  const actions = useChargeActions({
    tenantSlug,
    onChanged: changed,
    onOpenDetail: charge => setDetailId(charge.id),
  })

  const today = todaySP()
  const rows = list.data?.items ?? []
  const total = list.data?.meta.total ?? 0
  const filtersActive =
    Boolean(q) || status !== 'all' || method !== 'all' || period !== 'all' || Boolean(subscriptionFilter)

  const columns: Column<ClubCharge>[] = [
    {
      key: 'titular',
      header: 'Titular',
      render: charge => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{charge.holderName}</p>
          <p className="truncate text-xs text-muted-foreground" title={isOneOffCharge(charge) ? charge.description : undefined}>
            {isOneOffCharge(charge) ? `Avulsa · ${charge.description}` : charge.planName}
          </p>
        </div>
      ),
    },
    {
      key: 'competencia',
      header: 'Competência',
      hideOnMobile: true,
      render: charge => <span className="text-muted-foreground">{chargeCompetence(charge)}</span>,
    },
    {
      key: 'vencimento',
      header: 'Vencimento',
      render: charge => {
        const late = charge.status === 'overdue' || (charge.status === 'failed' && charge.dueDate < today)
        const days = late ? daysBetween(charge.dueDate, today) : 0
        return (
          <div className="whitespace-nowrap">
            <p className="text-foreground">{formatDateBR(charge.dueDate)}</p>
            {late && days > 0 && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {days} {days === 1 ? 'dia' : 'dias'} em atraso
              </p>
            )}
            {charge.status === 'paid' && charge.paidAt && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">pago em {formatDateBR(charge.paidAt)}</p>
            )}
          </div>
        )
      },
    },
    {
      key: 'valor',
      header: 'Valor',
      render: charge => <span className="whitespace-nowrap font-medium text-foreground">{formatBRL(charge.amount)}</span>,
    },
    {
      key: 'metodo',
      header: 'Método',
      hideOnMobile: true,
      render: charge => <MethodLabel method={charge.method} card={charge.card} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: charge => (
        <div className="space-y-1">
          <StatusPill {...chargeStatusMeta(charge.status)} />
          {charge.status === 'failed' && (
            <p className="max-w-48 truncate text-xs text-muted-foreground" title={charge.failureReason ?? undefined}>
              {charge.attempts} {charge.attempts === 1 ? 'tentativa' : 'tentativas'}
              {charge.failureReason ? ` · ${charge.failureReason}` : ''}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'acoes',
      header: '',
      align: 'right',
      render: charge => (
        // O clique no menu não pode abrir o detalhe da linha.
        <div onClick={event => event.stopPropagation()} className="inline-flex">
          <ChargeActionsMenu
            charge={charge}
            canSimulate={canSimulate}
            busy={actions.busyId === charge.id}
            onAction={actions.run}
          />
        </div>
      ),
    },
  ]

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <div className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome, CPF ou e-mail..." />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Status"
            value={status}
            onChange={value => setStatus(value as 'all' | ClubChargeStatus)}
            allLabel="Todos"
            options={CHARGE_STATUS_OPTIONS}
          />
          {!(moreFilters || method !== 'all' || period !== 'all') && (
            <Button variant="ghost" className="h-14 gap-2 text-muted-foreground" onClick={() => setMoreFilters(true)}>
              <SlidersHorizontal className="h-4 w-4" />
              Mais filtros
            </Button>
          )}
          {(moreFilters || method !== 'all' || period !== 'all') && (
            <>
              <FilterSelect
                label="Método"
                value={method}
                onChange={value => setMethod(value as 'all' | ClubPaymentMethod)}
                allLabel="Todos"
                options={PAYMENT_METHOD_OPTIONS}
              />
              <FilterSelect
                label="Período"
                value={period}
                onChange={value => setPeriod(value as PeriodFilter)}
                allLabel="Qualquer vencimento"
                options={[...PERIOD_OPTIONS, { value: 'custom', label: 'Personalizado' }]}
              />
            </>
          )}
        </div>
      </div>

      {(period === 'custom' || subscriptionFilter) && (
        <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
          {period === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Vencimento de</span>
              <Input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={event => setCustomFrom(event.target.value)}
                className="h-9 w-40"
                aria-label="Vencimento a partir de"
              />
              <span>até</span>
              <Input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={event => setCustomTo(event.target.value)}
                className="h-9 w-40"
                aria-label="Vencimento até"
              />
            </div>
          )}
          {subscriptionFilter && (
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              Assinante: {subscriptionFilter.name ?? 'selecionado'}
              <button
                type="button"
                onClick={onClearSubscriptionFilter}
                className="rounded-full p-0.5 hover:bg-primary/15"
                aria-label="Remover filtro de assinante"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>
      )}

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
            icon={ReceiptText}
            title={filtersActive ? 'Nenhuma cobrança com estes filtros' : 'Nenhuma cobrança ainda'}
            description={
              filtersActive
                ? 'Ajuste a busca ou os filtros para ver outras cobranças.'
                : 'As cobranças nascem sozinhas: no checkout do site e, depois, a cada ciclo, pela automação.'
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={charge => charge.id}
            onRowClick={charge => setDetailId(charge.id)}
            isRowActive={charge => charge.id === detailId}
          />
        )}
      </CardContent>

      {list.data && total > 0 && (
        <TableFooter
          page={page}
          perPage={perPage}
          total={total}
          noun="cobranças"
          onPageChange={setPage}
          onPerPageChange={setPerPage}
        />
      )}

      <ChargeDetailSheet
        tenantSlug={tenantSlug}
        chargeId={detailId}
        open={detailId !== null}
        onOpenChange={open => !open && setDetailId(null)}
        canSimulate={canSimulate}
        onChanged={changed}
        onOpenSubscription={
          onOpenSubscription
            ? subscriptionId => {
                setDetailId(null)
                onOpenSubscription(subscriptionId)
              }
            : undefined
        }
      />
      {actions.dialogs}
    </Card>
  )
}
