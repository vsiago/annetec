'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Search } from 'lucide-react'
import type { PlatformAccessLevel, PlatformPlanOffer, PlatformSubscription } from '@annetec/contracts'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { FilterSelect, SearchInput, TableFooter } from '@/components/admin-platform/ui/table-controls'
import { LoadError, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { AccessPill, SubscriptionStatusPill, UsageBar, openableRowProps, pluralize } from '@/components/admin-platform/billing/billing-bits'
import { listPlatformSubscriptionsAction } from '@/lib/actions/platform-billing-api'
import {
  ACCESS_LEVEL_OPTIONS,
  PLATFORM_SUBSCRIPTION_STATUS_OPTIONS,
  formatBRL,
  formatDateBR,
} from '@/lib/adapters/platform-console'

/**
 * Clubes pagantes: uma assinatura de plataforma por clube (nasce com a
 * contratação aprovada). Clube sem linha aqui não paga a ANNETEC pela
 * plataforma: nunca é cobrado nem restringido automaticamente.
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

  return (
    <div>
      <div className="flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por clube, endereço do site ou CNPJ" />
        <FilterSelect
          label="Situação"
          value={status}
          onChange={value => setStatus(value as 'all' | PlatformSubscription['status'])}
          allLabel="Todas"
          options={PLATFORM_SUBSCRIPTION_STATUS_OPTIONS}
        />
        <FilterSelect
          label="Acesso do clube"
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
        <LoadError message={list.error} onRetry={() => list.reload()} framed={false} />
      ) : list.loading && !list.data ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={filtered ? Search : Building2}
          title={filtered ? 'Nenhum clube com esses filtros' : 'Nenhum clube pagante ainda'}
          description={
            filtered
              ? 'Ajuste a busca ou limpe os filtros.'
              : 'Um clube aparece aqui quando a contratação é aprovada e a primeira fatura é paga.'
          }
        />
      ) : (
        <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
          <DataTable caption="Clubes pagantes" minWidth="min-w-[900px]" framed={false}>
            <thead>
              <tr>
                <Th>Clube</Th>
                <Th className="hidden md:table-cell">Plano</Th>
                <Th className="hidden md:table-cell">Vidas</Th>
                <Th align="right">Mensalidade estimada</Th>
                <Th align="right">Em aberto</Th>
                <Th className="hidden md:table-cell">Próximo vencimento</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(sub => (
                <Tr key={sub.id} {...openableRowProps(() => router.push(`/admin/financeiro/assinaturas/${sub.id}`))}>
                  <Td>
                    <div className="min-w-0 max-w-60">
                      <p className="m-0 truncate font-medium text-foreground">{sub.tenantName}</p>
                      <p className="m-0 truncate text-xs text-muted-foreground">/{sub.tenantSlug}</p>
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <div className="text-xs">
                      <p className="m-0 text-foreground">{sub.planName}</p>
                      <p className="m-0 text-muted-foreground">{formatBRL(sub.planPriceMonthly)}/mês</p>
                      {sub.scheduledPlanName && (
                        <p className="m-0 text-violet-700 dark:text-violet-300">→ {sub.scheduledPlanName} no próximo mês</p>
                      )}
                    </div>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <UsageBar lives={sub.lives} limit={sub.memberLimit} pct={sub.usagePct} />
                  </Td>
                  <Td align="right">
                    <span className="whitespace-nowrap font-medium tabular-nums text-foreground">{formatBRL(sub.estimatedMonthly)}</span>
                  </Td>
                  <Td align="right">
                    {sub.openAmount > 0 ? (
                      <div className="whitespace-nowrap text-right text-xs">
                        <p className="m-0 font-medium tabular-nums text-foreground">{formatBRL(sub.openAmount)}</p>
                        {sub.daysLate > 0 ? (
                          <p className="m-0 text-[#B42318]">{pluralize(sub.daysLate, 'dia', 'dias')} de atraso</p>
                        ) : (
                          <p className="m-0 text-muted-foreground">a vencer</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className="whitespace-nowrap text-xs text-foreground">
                      {sub.nextDueDate ? formatDateBR(sub.nextDueDate) : '—'}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <SubscriptionStatusPill status={sub.status} />
                      {(sub.access.level !== 'full' || sub.access.source === 'override') && <AccessPill access={sub.access} />}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}

      {list.data && total > 0 && (
        <TableFooter
          page={page}
          perPage={perPage}
          total={total}
          noun="clubes"
          onPageChange={setPage}
          onPerPageChange={setPerPage}
        />
      )}
    </div>
  )
}
