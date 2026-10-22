'use client'

import Link from 'next/link'
import { ArrowRight, FileSearch, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/dashboard/empty-state'
import { Field, LoadError, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import {
  AccessPill,
  MethodLabel,
  PlatformEventsTimeline,
  SubscriptionStatusPill,
  UsageBar,
} from '@/components/admin-platform/billing/billing-bits'
import { ChargesTab } from '@/components/admin-platform/billing/charges-tab'
import {
  findPlatformSubscriptionByTenantAction,
  getPlatformBillingSettingsAction,
} from '@/lib/actions/platform-billing-api'
import { canSimulatePayments, formatBRL, formatDateBR } from '@/lib/adapters/platform-console'

/**
 * Aba "Assinatura ANNETEC" do inquilino: a assinatura de plataforma (quando
 * existe), as faturas e a linha do tempo. Sem assinatura = contrato fora da
 * cobrança automática — nunca é cobrado nem restringido pela régua.
 */
export function TenantSubscriptionPanel({ tenantId, tenantSlug }: { tenantId: string; tenantSlug: string }) {
  const sub = useConsoleData(() => findPlatformSubscriptionByTenantAction(tenantId, tenantSlug), [tenantId, tenantSlug])
  const settings = useConsoleData(() => getPlatformBillingSettingsAction(), [])
  const canSimulate = settings.data ? canSimulatePayments(settings.data.gateway, settings.data.sandbox) : false

  if (sub.error && sub.data === null && !sub.loading) return <LoadError message={sub.error} onRetry={() => sub.reload()} />
  if (sub.loading && !sub.data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const data = sub.data
  if (!data) {
    return (
      <Card className="shadow-none">
        <CardContent>
          <EmptyState
            icon={ShieldCheck}
            title="Contrato fora da cobrança automática"
            description="Este inquilino não tem assinatura de plataforma: a ANNETEC não emite faturas automáticas para ele e a régua nunca restringe o painel. Assinaturas nascem no provisionamento de uma contratação pelo site."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="gap-4 shadow-none">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Plano {data.planName}
            <SubscriptionStatusPill status={data.status} />
            <AccessPill access={data.access} />
          </CardTitle>
          <CardDescription>
            {formatBRL(data.planPriceMonthly)}/mês · vencimento todo dia {data.dueDay}
            {data.scheduledPlanName ? ` · troca para ${data.scheduledPlanName} no próximo ciclo` : ''}
          </CardDescription>
          <CardAction>
            <Button size="sm" className="gap-1.5" asChild>
              <Link href={`/admin/financeiro/assinaturas/${data.id}`}>
                Abrir no financeiro
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Mensal estimado">
            <span className="text-lg font-semibold">{formatBRL(data.estimatedMonthly)}</span>
          </Field>
          <Field label="Vidas">
            <UsageBar lives={data.lives} limit={data.memberLimit} pct={data.usagePct} />
          </Field>
          <Field label="Em aberto">
            <span className="text-lg font-semibold">{formatBRL(data.openAmount)}</span>
            {data.daysLate > 0 && <span className="block text-xs text-red-600">{data.daysLate} dia(s) de atraso</span>}
          </Field>
          <Field label="Próximo vencimento">{data.nextDueDate ? formatDateBR(data.nextDueDate) : '—'}</Field>
          <Field label="Forma">
            <MethodLabel method={data.paymentMethod} card={data.paymentCard} className="text-foreground" />
          </Field>
          <Field label="Faturamento">{data.billingEmail}</Field>
          <Field label="Desde">{data.startedAt ? formatDateBR(data.startedAt) : '—'}</Field>
          {data.proposalId && (
            <Field label="Contratação">
              <Link href={`/admin/compliance/${data.proposalId}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                <FileSearch className="h-3.5 w-3.5" />
                Ver proposta
              </Link>
            </Field>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="gap-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Faturas da ANNETEC</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ChargesTab
              canSimulate={canSimulate}
              defaultDueDays={settings.data?.boletoDueDays}
              subscriptionId={data.id}
              onChanged={() => void sub.reload({ silent: true })}
            />
          </CardContent>
        </Card>
        <Card className="gap-4 shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <PlatformEventsTimeline events={[...data.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 15)} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
