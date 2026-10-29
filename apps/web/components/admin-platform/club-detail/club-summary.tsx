'use client'

import { LoadError } from '@/components/admin-platform/billing/console-kit'
import { Skeleton } from '@/components/ui/skeleton'
import { ClubHealthCard } from '@/components/admin-platform/club-detail/club-health-card'
import { ClubKpis } from '@/components/admin-platform/club-detail/club-kpis'
import { ReadyToSellCard } from '@/components/admin-platform/club-detail/ready-to-sell-card'
import { RecentActivityCard } from '@/components/admin-platform/club-detail/recent-activity-card'
import type { ClubSummary as ClubSummaryData } from '@/components/admin-platform/club-detail/use-club-summary'
import type { Tenant } from '@/lib/types'

/**
 * Aba "Resumo": responde "este clube está pronto para vender e pagando em dia?".
 * "Pronto para vender" e os quatro números em cima; saúde e atividade embaixo.
 */
export function ClubSummary({
  tenant,
  summary,
  isSuperadmin,
  onOpenAdvanced,
}: {
  tenant: Tenant
  summary: ClubSummaryData
  isSuperadmin: boolean
  onOpenAdvanced: () => void
}) {
  const { health } = summary
  const detail = health.data

  return (
    <div className="flex flex-col gap-4">
      {health.error && !detail ? (
        <LoadError
          message={`Não foi possível carregar os números do clube. ${health.error}`}
          onRetry={() => void health.reload()}
        />
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ReadyToSellCard tenant={tenant} summary={summary} isSuperadmin={isSuperadmin} onOpenAdvanced={onOpenAdvanced} />
        <ClubKpis detail={detail} loading={health.loading} tenantId={tenant.id} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {detail ? (
          <>
            <ClubHealthCard row={detail.tenant} />
            <RecentActivityCard entries={detail.recentAudit} organizationId={tenant.id} />
          </>
        ) : health.loading ? (
          <>
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </>
        ) : null}
      </div>
    </div>
  )
}
