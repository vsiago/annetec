'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import type { PlatformAccessLevel, PlatformPlanOffer, PlatformSubscription } from '@annetec/contracts'
import { EmptyState } from '@/components/dashboard/empty-state'
import { DataTable, FilterSelect, SearchInput, TableFooter, type Column } from '@/components/dashboard/table-controls'
import { LoadError, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { AccessPill, SubscriptionStatusPill, UsageBar } from '@/components/admin-platform/billing/billing-bits'
import { listPlatformSubscriptionsAction } from '@/lib/actions/platform-billing-api'
import {
  ACCESS_LEVEL_OPTIONS,
  PLATFORM_SUBSCRIPTION_STATUS_OPTIONS,
  formatBRL,
  formatDateBR,
} from '@/lib/adapters/platform-console'

/**
 * Assinaturas de plataforma — uma por inquilino gerenciado (nasceu pela
 * contratação ou pelo seed de demonstração). Inquilino sem linha aqui é "não
 * gerenciado": nunca é cobrado nem restringido automaticamente.
 */

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function SubscriptionsTab({ plans, version = 0 }: { plans: PlatformPlanOffer[]; version?: number }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | PlatformSubscription['status']>('all')
  const [access, setAccess] = useState<'all' | PlatformAccessLevel>('all')
  const [planId, setPlanId] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('25')
  const q = useDebounced(search)

  const list = useConsoleData(
    () =>
      listPlatformSubscriptionsAction({
        q: q || undefined,
        status: status === 'all' ? undefined : status,
        access: access === 'all' ? undefined : access,
        planId: planId === 'all' ? undefined : planId,
        page,
        perPage: Number(perPage),
      }),
    [q, status, access, planId, page, perPage, version],
  )

  useEffect(() => setPage(1), [q, status, access, planId, perPage])

  const rows = list.data?.items ?? []
  const total = list.data?.meta.total ?? 0
  const filtered = !!q || status !== 'all' || access !== 'all' || planId !== 'all'

  const columns: Column<PlatformSubscription>[] = [
    {
      key: 'inquilino',
      header: 'Inquilino',
      render: sub => (
        <div className="min-w-0 max-w-60">
          <p className="truncate font-medium text-foreground">{sub.tenantName}</p>
          <p className="truncate text-xs text-muted-foreground">/{sub.tenantSlug}</p>
        </div>
      ),
    },
    {
      key: 'plano',
      header: 'Plano',
      hideOnMobile: true,
      render: sub => (
        <div className="text-xs">
          <p className="text-foreground">{sub.planName}</p>
          <p className="text-muted-foreground">{formatBRL(sub.planPriceMonthly)}/mês</p>
          {sub.scheduledPlanName && <p className="text-violet-700 dark:text-violet-300">→ {sub.scheduledPlanName} no próximo ciclo</p>}
        </div>
      ),
    },
    {
      key: 'vidas',
      header: 'Vidas',
      hideOnMobile: true,
      render: sub => <UsageBar lives={sub.lives} limit={sub.memberLimit} pct={sub.usagePct} />,
    },
    {
      key: 'mensal',
      header: 'Mensal estimado',
      align: 'right',
      render: sub => <span className="whitespace-nowrap font-medium tabular-nums text-foreground">{formatBRL(sub.estimatedMonthly)}</span>,
    },
    {
      key: 'aberto',
      header: 'Em aberto',
      align: 'right',
      render: sub =>
        sub.openAmount > 0 ? (
          <div className="whitespace-nowrap text-right text-xs">
            <p className="font-medium tabular-nums text-foreground">{formatBRL(sub.openAmount)}</p>
            {sub.daysLate > 0 ? (
              <p className="text-red-600">{sub.daysLate} dia(s) de atraso</p>
            ) : (
              <p className="text-muted-foreground">a vencer</p>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: 'vencimento',
      header: 'Próx. vencimento',
      hideOnMobile: true,
      render: sub => <span className="whitespace-nowrap text-xs text-foreground">{sub.nextDueDate ? formatDateBR(sub.nextDueDate) : '—'}</span>,
    },
    {
      key: 'status',
      header: 'Situação',
      render: sub => (
        <div className="flex flex-col items-start gap-1">
          <SubscriptionStatusPill status={sub.status} />
          {(sub.access.level !== 'full' || sub.access.source === 'override') && <AccessPill access={sub.access} />}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por inquilino, endereço ou CNPJ" />
        <FilterSelect
          label="Situação"
          value={status}
          onChange={value => setStatus(value as 'all' | PlatformSubscription['status'])}
          allLabel="Todas"
          options={PLATFORM_SUBSCRIPTION_STATUS_OPTIONS}
        />
        <FilterSelect
          label="Acesso ao painel"
          value={access}
          onChange={value => setAccess(value as 'all' | PlatformAccessLevel)}
          allLabel="Qualquer"
          options={ACCESS_LEVEL_OPTIONS}
        />
        {plans.length > 0 && (
          <FilterSelect
            label="Plano"
            value={planId}
            onChange={setPlanId}
            allLabel="Todos"
            options={plans.map(plan => ({ value: plan.id, label: plan.name }))}
          />
        )}
      </div>

      {list.error && !list.data ? (
        <div className="p-4 pt-0">
          <LoadError message={list.error} onRetry={() => list.reload()} />
        </div>
      ) : list.loading && !list.data ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={filtered ? 'Nenhuma assinatura com esses filtros' : 'Nenhuma assinatura de plataforma'}
          description={
            filtered
              ? 'Ajuste a busca ou limpe os filtros.'
              : 'Assinaturas nascem no provisionamento de uma contratação aprovada e paga (ou pelo seed de demonstração).'
          }
        />
      ) : (
        <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={sub => sub.id}
            onRowClick={sub => router.push(`/admin/financeiro/assinaturas/${sub.id}`)}
          />
        </div>
      )}

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
    </div>
  )
}
