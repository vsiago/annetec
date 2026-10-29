'use client'

import { useParams } from 'next/navigation'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { BackLink } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { KpiSkeleton, LoadError, useConsoleData, usePlatformRole } from '@/components/admin-platform/billing/console-kit'
import { SubscriptionDetailView } from '@/components/admin-platform/billing/subscription-detail'
import { getPlatformBillingSettingsAction, getPlatformSubscriptionAction } from '@/lib/actions/platform-billing-api'

/**
 * Detalhe de um clube pagante (a assinatura de plataforma) — a tela da
 * demonstração das regras de cobrança (roteiro §F passo 7): avançar dias, ver a
 * etapa mudar e o painel do clube reagir, pagar e ver a reativação. O
 * histórico do clube fica aqui; "avançar dias" só aparece em demonstração.
 */
export default function PlatformSubscriptionPage() {
  const params = useParams<{ id: string }>()
  const { isSuperadmin } = usePlatformRole()
  const detail = useConsoleData(() => getPlatformSubscriptionAction(params.id), [params.id])
  const settings = useConsoleData(() => getPlatformBillingSettingsAction(), [])

  const back = <BackLink href="/admin/financeiro?aba=assinaturas">Voltar aos clubes pagantes</BackLink>

  return (
    <PageContainer>
      {detail.error && !detail.data ? (
        <>
          <div className="flex items-center">{back}</div>
          <LoadError message={detail.error} onRetry={() => detail.reload()} />
        </>
      ) : !detail.data ? (
        <>
          <div className="flex items-center">{back}</div>
          <SectionCard>
            <SectionSkeleton rows={3} label="Carregando o clube pagante…" />
          </SectionCard>
          <KpiSkeleton />
          <SectionCard>
            <SectionSkeleton rows={5} label="Carregando o histórico do clube…" />
          </SectionCard>
        </>
      ) : (
        <SubscriptionDetailView
          sub={detail.data}
          settings={settings.data}
          isSuperadmin={isSuperadmin}
          onChanged={updated => detail.setData(updated)}
          onReload={() => void detail.reload({ silent: true })}
          reloading={detail.loading}
          breadcrumb={back}
        />
      )}
    </PageContainer>
  )
}
