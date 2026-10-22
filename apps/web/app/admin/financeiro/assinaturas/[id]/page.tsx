'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadError, useConsoleData, usePlatformRole } from '@/components/admin-platform/billing/console-kit'
import { SubscriptionDetailView } from '@/components/admin-platform/billing/subscription-detail'
import { getPlatformBillingSettingsAction, getPlatformSubscriptionAction } from '@/lib/actions/platform-billing-api'

/**
 * Detalhe de uma assinatura de plataforma — a tela da demonstração da régua
 * (roteiro §F passo 7): avançar dias, ver o degrau mudar e o painel do
 * inquilino reagir, pagar e ver a reativação.
 */
export default function PlatformSubscriptionPage() {
  const params = useParams<{ id: string }>()
  const { isSuperadmin } = usePlatformRole()
  const detail = useConsoleData(() => getPlatformSubscriptionAction(params.id), [params.id])
  const settings = useConsoleData(() => getPlatformBillingSettingsAction(), [])

  return (
    <div className="space-y-6">
      <Link
        href="/admin/financeiro?aba=assinaturas"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para as assinaturas
      </Link>

      {detail.error && !detail.data ? (
        <LoadError message={detail.error} onRetry={() => detail.reload()} />
      ) : !detail.data ? (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <SubscriptionDetailView
          sub={detail.data}
          settings={settings.data}
          isSuperadmin={isSuperadmin}
          onChanged={updated => detail.setData(updated)}
          onReload={() => void detail.reload({ silent: true })}
          reloading={detail.loading}
        />
      )}
    </div>
  )
}
