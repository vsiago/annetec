'use client'

import { ErrorState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
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
    <div className="flex flex-col gap-6">
      {health.error && !detail ? (
        <ErrorState
          title="Não foi possível carregar os números do clube."
          description={health.error}
          onRetry={() => void health.reload()}
        />
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ReadyToSellCard tenant={tenant} summary={summary} isSuperadmin={isSuperadmin} onOpenAdvanced={onOpenAdvanced} />
        <ClubKpis detail={detail} loading={health.loading} tenantId={tenant.id} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {detail ? (
          <>
            <ClubHealthCard row={detail.tenant} />
            <RecentActivityCard entries={detail.recentAudit} organizationId={tenant.id} />
          </>
        ) : health.loading ? (
          <>
            <SectionCard>
              <SectionSkeleton rows={5} label="Carregando a saúde do clube…" />
            </SectionCard>
            <SectionCard>
              <SectionSkeleton rows={5} label="Carregando a atividade recente…" />
            </SectionCard>
          </>
        ) : null}
      </div>
    </div>
  )
}
