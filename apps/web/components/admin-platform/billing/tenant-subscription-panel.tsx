'use client'

import Link from 'next/link'
import { ArrowRight, CreditCard, FileSearch, History, Receipt, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { Field, useConsoleData } from '@/components/admin-platform/billing/console-kit'
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
 * Aba "Plano ANNETEC" do clube: a assinatura da ANNETEC (quando existe), as
 * faturas e o histórico. Sem assinatura = contrato fora da cobrança
 * automática — o clube nunca é cobrado nem restringido pela cobrança.
 */
export function TenantSubscriptionPanel({ tenantId, tenantSlug }: { tenantId: string; tenantSlug: string }) {
  const sub = useConsoleData(() => findPlatformSubscriptionByTenantAction(tenantId, tenantSlug), [tenantId, tenantSlug])
  const settings = useConsoleData(() => getPlatformBillingSettingsAction(), [])
  const canSimulate = settings.data ? canSimulatePayments(settings.data.gateway, settings.data.sandbox) : false

  if (sub.error && sub.data === null && !sub.loading) {
    return (
      <ErrorState
        title="Não foi possível carregar o plano do clube."
        description={sub.error}
        onRetry={() => void sub.reload()}
      />
    )
  }
  if (sub.loading && !sub.data) {
    return (
      <div className="flex flex-col gap-6">
        <SectionCard>
          <SectionSkeleton rows={4} label="Carregando o plano do clube…" />
        </SectionCard>
        <SectionCard>
          <SectionSkeleton rows={5} label="Carregando as faturas…" />
        </SectionCard>
      </div>
    )
  }

  const data = sub.data
  if (!data) {
    return (
      <EmptyState
        framed
        icon={ShieldCheck}
        title="Este clube não tem cobrança automática"
        description="O clube não tem assinatura da ANNETEC: a ANNETEC não emite faturas automáticas para ele e o painel nunca é restringido por atraso. A assinatura é criada quando o clube é aprovado e liberado a partir da contratação pelo site."
      />
    )
  }

  const events = [...data.events].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 15)

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        icon={CreditCard}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Plano {data.planName}
            <SubscriptionStatusPill status={data.status} />
            <AccessPill access={data.access} />
          </span>
        }
        description={`${formatBRL(data.planPriceMonthly)}/mês · vencimento todo dia ${data.dueDay}${
          data.scheduledPlanName ? ` · troca para ${data.scheduledPlanName} no próximo ciclo` : ''
        }`}
        actions={
          <Button asChild className="min-h-10 gap-1.5 rounded-[10px] px-4 text-sm font-semibold">
            <Link href={`/admin/financeiro/assinaturas/${data.id}`}>
              Ver no Financeiro
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      >
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Mensalidade estimada">
            <span className="text-lg font-semibold">{formatBRL(data.estimatedMonthly)}</span>
          </Field>
          <Field label="Vidas">
            <UsageBar lives={data.lives} limit={data.memberLimit} pct={data.usagePct} />
          </Field>
          <Field label="Em aberto">
            <span className="text-lg font-semibold">{formatBRL(data.openAmount)}</span>
            {data.daysLate > 0 && <span className="block text-xs text-[#B42318]">{data.daysLate} dia(s) de atraso</span>}
          </Field>
          <Field label="Próximo vencimento">{data.nextDueDate ? formatDateBR(data.nextDueDate) : '—'}</Field>
          <Field label="Forma de pagamento">
            <MethodLabel method={data.paymentMethod} card={data.paymentCard} className="text-foreground" />
          </Field>
          <Field label="E-mail da cobrança">{data.billingEmail}</Field>
          <Field label="Cliente desde">{data.startedAt ? formatDateBR(data.startedAt) : '—'}</Field>
          {data.proposalId && (
            <Field label="Cadastro de contratação">
              <Link
                href={`/admin/compliance/${data.proposalId}`}
                className="inline-flex min-h-10 items-center gap-1 rounded-md text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
              >
                <FileSearch className="size-3.5" aria-hidden="true" />
                Ver o cadastro
              </Link>
            </Field>
          )}
        </div>
      </SectionCard>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SectionCard title="Faturas da ANNETEC" icon={Receipt} padded={false}>
          <ChargesTab
            canSimulate={canSimulate}
            defaultDueDays={settings.data?.boletoDueDays}
            subscriptionId={data.id}
            onChanged={() => void sub.reload({ silent: true })}
          />
        </SectionCard>
        <SectionCard title="Histórico da assinatura" icon={History}>
          {events.length === 0 ? (
            <EmptyState size="sm" icon={History} title="Nenhum evento registrado ainda." />
          ) : (
            <PlatformEventsTimeline events={events} />
          )}
        </SectionCard>
      </div>
    </div>
  )
}
