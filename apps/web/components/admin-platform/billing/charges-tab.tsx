'use client'

import { useEffect, useState } from 'react'
import { ReceiptText } from 'lucide-react'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  PLATFORM_CHARGE_STATUS_LABELS,
  daysBetweenDates,
  type ClubPaymentMethod,
  type PlatformCharge,
  type PlatformChargeKind,
  type PlatformChargeStatus,
} from '@annetec/contracts'
import { EmptyState } from '@/components/dashboard/empty-state'
import { DataTable, FilterSelect, SearchInput, TableFooter, type Column } from '@/components/dashboard/table-controls'
import { LoadError, Pill, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { ChargeKindPill, MethodLabel, pluralize } from '@/components/admin-platform/billing/billing-bits'
import { ChargeActionsMenu, useChargeActions } from '@/components/admin-platform/billing/charge-actions'
import { ChargeDetailSheet } from '@/components/admin-platform/billing/charge-detail-sheet'
import { listPlatformChargesAction } from '@/lib/actions/platform-billing-api'
import {
  CHARGE_KIND_OPTIONS,
  PERIOD_OPTIONS,
  chargeStatusMeta,
  formatBRL,
  formatDateBR,
  formatMonthShort,
  periodRange,
  todaySP,
  type PeriodPreset,
} from '@/lib/adapters/platform-console'

/**
 * Faturas da plataforma (ANNETEC → clubes) com filtros e ações. Serve a
 * aba "Faturas" do financeiro e, com `subscriptionId`, o detalhe de uma
 * assinatura (sem os filtros de clube).
 */

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

const STATUS_OPTIONS = (Object.keys(PLATFORM_CHARGE_STATUS_LABELS) as PlatformChargeStatus[]).map(value => ({
  value,
  label: PLATFORM_CHARGE_STATUS_LABELS[value],
}))

const METHOD_OPTIONS = (Object.keys(CLUB_PAYMENT_METHOD_LABELS) as ClubPaymentMethod[]).map(value => ({
  value,
  label: CLUB_PAYMENT_METHOD_LABELS[value],
}))

export function ChargesTab({
  canSimulate,
  defaultDueDays,
  subscriptionId,
  version = 0,
  onChanged,
  initialStatus = 'all',
}: {
  canSimulate: boolean
  defaultDueDays?: number
  /** Fixa a lista numa assinatura (detalhe da assinatura). */
  subscriptionId?: string
  /** Muda quando algo fora da tabela alterou as faturas. */
  version?: number
  /** Avisa o pai depois de uma ação (ex.: recarregar a assinatura). */
  onChanged?: () => void
  initialStatus?: 'all' | PlatformChargeStatus
}) {
  const embedded = !!subscriptionId
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | PlatformChargeStatus>(initialStatus)
  const [kind, setKind] = useState<'all' | PlatformChargeKind>('all')
  const [method, setMethod] = useState<'all' | ClubPaymentMethod>('all')
  const [period, setPeriod] = useState<'all' | PeriodPreset>('all')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(embedded ? '10' : '25')
  const [localVersion, setLocalVersion] = useState(0)
  const [detailId, setDetailId] = useState<string | null>(null)
  const q = useDebounced(search)

  const range = period === 'all' ? {} : periodRange(period)
  const list = useConsoleData(
    () =>
      listPlatformChargesAction({
        q: q || undefined,
        status: status === 'all' ? undefined : status,
        kind: kind === 'all' ? undefined : kind,
        method: method === 'all' ? undefined : method,
        from: range.from,
        to: range.to,
        subscriptionId,
        page,
        perPage: Number(perPage),
      }),
    [q, status, kind, method, period, subscriptionId, page, perPage, version, localVersion],
  )

  useEffect(() => setPage(1), [q, status, kind, method, period, perPage])

  const actions = useChargeActions({
    defaultDueDays,
    onChanged: () => {
      setLocalVersion(value => value + 1)
      onChanged?.()
    },
  })

  const today = todaySP()
  const rows = list.data?.items ?? []
  const total = list.data?.meta.total ?? 0
  const filtered = !!q || status !== 'all' || kind !== 'all' || method !== 'all' || period !== 'all'

  const columns: Column<PlatformCharge>[] = [
    ...(embedded
      ? []
      : [
          {
            key: 'clube',
            header: 'Clube',
            render: (charge: PlatformCharge) => (
              <div className="min-w-0 max-w-56">
                <p className="truncate font-medium text-foreground">{charge.tenantName ?? 'Nova contratação'}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {charge.tenantSlug ? `/${charge.tenantSlug}` : 'clube ainda não liberado'}
                </p>
              </div>
            ),
          } satisfies Column<PlatformCharge>,
        ]),
    {
      key: 'descricao',
      header: 'Descrição',
      render: charge => (
        <div className="min-w-0 max-w-64">
          <p className="truncate text-foreground">{charge.description}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <ChargeKindPill kind={charge.kind} />
            {charge.periodStart && <span className="text-xs text-muted-foreground">{formatMonthShort(charge.periodStart)}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'vencimento',
      header: 'Vencimento',
      render: charge => {
        const late = (charge.status === 'overdue' || charge.status === 'failed') && charge.dueDate < today
        return (
          <div className="whitespace-nowrap text-sm">
            <p className="text-foreground">{formatDateBR(charge.dueDate)}</p>
            {late && (
              <p className="text-xs text-[#B42318]">
                atrasada há {pluralize(daysBetweenDates(charge.dueDate, today), 'dia', 'dias')}
              </p>
            )}
            {charge.status === 'paid' && charge.paidAt && (
              <p className="text-xs text-muted-foreground">paga em {formatDateBR(charge.paidAt)}</p>
            )}
          </div>
        )
      },
    },
    {
      key: 'valor',
      header: 'Valor',
      align: 'right',
      render: charge => <span className="whitespace-nowrap font-medium tabular-nums text-foreground">{formatBRL(charge.amount)}</span>,
    },
    {
      key: 'forma',
      header: 'Forma de pagamento',
      hideOnMobile: true,
      render: charge => <MethodLabel method={charge.method} card={charge.card} className="text-xs" />,
    },
    {
      key: 'status',
      header: 'Situação',
      render: charge => <Pill meta={chargeStatusMeta(charge.status)} />,
    },
    {
      key: 'acoes',
      header: '',
      align: 'right',
      render: charge => (
        <ChargeActionsMenu charge={charge} canSimulate={canSimulate} onAction={actions.open} onDetail={item => setDetailId(item.id)} />
      ),
    },
  ]

  return (
    <div>
      {!embedded && (
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por clube ou descrição" />
          <FilterSelect
            label="Situação"
            value={status}
            onChange={value => setStatus(value as 'all' | PlatformChargeStatus)}
            allLabel="Todas"
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="Tipo"
            value={kind}
            onChange={value => setKind(value as 'all' | PlatformChargeKind)}
            allLabel="Todos"
            options={CHARGE_KIND_OPTIONS}
          />
          <FilterSelect
            label="Forma de pagamento"
            value={method}
            onChange={value => setMethod(value as 'all' | ClubPaymentMethod)}
            allLabel="Todas"
            options={METHOD_OPTIONS}
          />
          <FilterSelect
            label="Vencimento"
            value={period}
            onChange={value => setPeriod(value as 'all' | PeriodPreset)}
            allLabel="Qualquer data"
            options={PERIOD_OPTIONS}
          />
        </div>
      )}

      {list.error && !list.data ? (
        <div className="p-4 pt-0">
          <LoadError message={list.error} onRetry={() => list.reload()} />
        </div>
      ) : list.loading && !list.data ? (
        <TableSkeleton rows={embedded ? 3 : 6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={filtered ? 'Nenhuma fatura com esses filtros' : 'Nenhuma fatura por aqui ainda'}
          description={
            filtered
              ? 'Ajuste a busca ou limpe os filtros.'
              : 'A primeira fatura nasce quando um clube é aprovado. Depois, uma nova a cada mês.'
          }
        />
      ) : (
        <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
          <DataTable columns={columns} rows={rows} rowKey={charge => charge.id} onRowClick={charge => setDetailId(charge.id)} />
        </div>
      )}

      {list.data && (embedded ? total > Number(perPage) : total > 0) && (
        <TableFooter
          page={page}
          perPage={perPage}
          total={total}
          noun="faturas"
          onPageChange={setPage}
          onPerPageChange={setPerPage}
        />
      )}

      <ChargeDetailSheet
        chargeId={detailId}
        version={localVersion + version}
        canSimulate={canSimulate}
        onClose={() => setDetailId(null)}
        onAction={actions.open}
      />
      {actions.dialogs}
    </div>
  )
}
