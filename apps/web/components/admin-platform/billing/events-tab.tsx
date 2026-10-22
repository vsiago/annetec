'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PlatformEventSource } from '@annetec/contracts'
import { FilterSelect, TableFooter } from '@/components/dashboard/table-controls'
import { LoadError, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { PlatformEventsTimeline } from '@/components/admin-platform/billing/billing-bits'
import { listPlatformBillingEventsAction, listPlatformSubscriptionsAction } from '@/lib/actions/platform-billing-api'
import { PLATFORM_EVENT_SOURCE_OPTIONS } from '@/lib/adapters/platform-console'

/**
 * Linha do tempo global do faturamento da plataforma: webhooks, automação,
 * contratação, ações manuais e simulações — o registro de tudo o que a régua
 * fez, mais recente primeiro.
 */
export function EventsTab({ version = 0 }: { version?: number }) {
  const [source, setSource] = useState<'all' | PlatformEventSource>('all')
  const [subscriptionId, setSubscriptionId] = useState('all')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('25')

  const subs = useConsoleData(() => listPlatformSubscriptionsAction({ page: 1, perPage: 200 }), [version])
  const events = useConsoleData(
    () =>
      listPlatformBillingEventsAction({
        source: source === 'all' ? undefined : source,
        subscriptionId: subscriptionId === 'all' ? undefined : subscriptionId,
        page,
        perPage: Number(perPage),
      }),
    [source, subscriptionId, page, perPage, version],
  )

  useEffect(() => setPage(1), [source, subscriptionId, perPage])

  const tenantNames = useMemo(
    () => new Map((subs.data?.items ?? []).map(sub => [sub.organizationId, sub.tenantName])),
    [subs.data],
  )
  const rows = events.data?.items ?? []
  const total = events.data?.meta.total ?? 0

  return (
    <div>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <FilterSelect
          label="Origem"
          value={source}
          onChange={value => setSource(value as 'all' | PlatformEventSource)}
          allLabel="Todas"
          options={PLATFORM_EVENT_SOURCE_OPTIONS}
        />
        <FilterSelect
          label="Inquilino"
          value={subscriptionId}
          onChange={setSubscriptionId}
          allLabel="Todos"
          options={(subs.data?.items ?? []).map(sub => ({ value: sub.id, label: sub.tenantName }))}
        />
      </div>

      {events.error && !events.data ? (
        <div className="p-4 pt-0">
          <LoadError message={events.error} onRetry={() => events.reload()} />
        </div>
      ) : events.loading && !events.data ? (
        <TableSkeleton rows={5} />
      ) : (
        <div className={events.loading ? 'px-6 pb-6 opacity-60 transition-opacity' : 'px-6 pb-6'}>
          <PlatformEventsTimeline
            events={rows}
            showTenant
            tenantNames={tenantNames}
            emptyText={
              source !== 'all' || subscriptionId !== 'all'
                ? 'Nenhum evento com esses filtros.'
                : 'Nenhum evento ainda — eles aparecem com a primeira cobrança da plataforma.'
            }
          />
        </div>
      )}

      {events.data && total > 0 && (
        <TableFooter
          page={page}
          perPage={perPage}
          total={total}
          noun="eventos"
          onPageChange={setPage}
          onPerPageChange={setPerPage}
        />
      )}
    </div>
  )
}
