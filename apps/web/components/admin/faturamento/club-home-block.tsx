'use client'

import Link from 'next/link'
import { ArrowRight, HandCoins, IdCard } from 'lucide-react'
import type { BillingSummary } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/dashboard/empty-state'
import { StatusPill } from '@/components/dashboard/table-controls'
import { listClubChargesAction, listClubSubscriptionsAction } from '@/lib/actions/faturamento-api'
import {
  chargeCompetence,
  isOneOffCharge,
  formatBRL,
  formatRelative,
  subscriptionStatusMeta,
} from '@/lib/adapters/faturamento'
import { getInitials } from '@/lib/utils'
import { ClubKpiCards, GatewayBadge, LoadError, MethodLabel } from './billing-ui'
import { useActionData } from './use-action-data'

/**
 * Bloco "Clube de Benefícios" do Início: indicadores do `/faturamento/resumo`
 * e os últimos cadastros e pagamentos, com atalho para as telas completas.
 * O resumo vem de fora porque o Início também usa a inadimplência dele.
 */
export function ClubHomeBlock({
  tenantSlug,
  base,
  summary,
  summaryLoading,
  summaryError,
  onRetrySummary,
}: {
  tenantSlug: string
  base: string
  summary: BillingSummary | null
  summaryLoading: boolean
  summaryError: string | null
  onRetrySummary: () => void
}) {
  const subscriptions = useActionData(
    tenantSlug ? () => listClubSubscriptionsAction(tenantSlug, { page: 1, perPage: 5 }) : null,
    [tenantSlug],
  )
  const payments = useActionData(
    tenantSlug ? () => listClubChargesAction(tenantSlug, { page: 1, perPage: 30, status: 'paid' }) : null,
    [tenantSlug],
  )

  // A lista vem por vencimento; "últimos pagamentos" é por data do pagamento.
  const recentPayments = [...(payments.data?.items ?? [])]
    .filter(charge => charge.paidAt)
    .sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? ''))
    .slice(0, 5)

  return (
    <section className="space-y-4" aria-labelledby="clube-beneficios">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h2 id="clube-beneficios" className="text-xl font-bold tracking-tight text-foreground">
            Clube de Benefícios
          </h2>
          <p className="text-sm text-muted-foreground">
            Cadastros e pagamentos que chegam pelo site, com cobrança 100% automática.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GatewayBadge provider={summary?.gateway} sandbox={summary?.sandbox} />
          <Button asChild variant="outline" className="gap-2">
            <Link href={`${base}/faturamento`}>
              Abrir Faturamento
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {summaryError && !summary ? (
        <LoadError message={summaryError} onRetry={onRetrySummary} />
      ) : (
        <ClubKpiCards summary={summary} loading={summaryLoading} compact />
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Últimos cadastros</CardTitle>
            <CardAction className="self-center">
              <Link href={`${base}/cadastros`} className="text-sm font-medium text-primary hover:underline">
                Ver todos
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {subscriptions.error && !subscriptions.data ? (
              <LoadError message={subscriptions.error} onRetry={() => void subscriptions.reload()} />
            ) : !subscriptions.data ? (
              <RowsSkeleton />
            ) : subscriptions.data.items.length === 0 ? (
              <EmptyState
                icon={IdCard}
                title="Nenhum cadastro ainda"
                description="Os assinantes aparecem aqui assim que concluírem o checkout no site."
                className="py-6"
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {subscriptions.data.items.map(subscription => (
                  <li key={subscription.id}>
                    <Link
                      href={`${base}/cadastros?assinatura=${encodeURIComponent(subscription.id)}`}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {getInitials(subscription.holder.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {subscription.holder.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {subscription.planName} · {formatBRL(subscription.amount)}/mês
                          {subscription.dependents.length > 0 &&
                            ` · ${subscription.dependents.length} ${subscription.dependents.length === 1 ? 'dependente' : 'dependentes'}`}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <StatusPill {...subscriptionStatusMeta(subscription.status)} />
                        <span className="text-[11px] text-muted-foreground">
                          {formatRelative(subscription.createdAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Últimos pagamentos</CardTitle>
            <CardAction className="self-center">
              <Link
                href={`${base}/financeiro/recebimento`}
                className="text-sm font-medium text-primary hover:underline"
              >
                Ver todos
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {payments.error && !payments.data ? (
              <LoadError message={payments.error} onRetry={() => void payments.reload()} />
            ) : !payments.data ? (
              <RowsSkeleton />
            ) : recentPayments.length === 0 ? (
              <EmptyState
                icon={HandCoins}
                title="Nenhum pagamento ainda"
                description="Pagamentos confirmados pelo gateway aparecem aqui sozinhos."
                className="py-6"
              />
            ) : (
              <ul className="divide-y divide-border/60">
                {recentPayments.map(charge => (
                  <li key={charge.id}>
                    <Link
                      href={`${base}/faturamento?tab=cobrancas&cobranca=${encodeURIComponent(charge.id)}`}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <HandCoins className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {charge.holderName}
                        </span>
                        <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          {isOneOffCharge(charge) ? charge.description : `${charge.planName} · ${chargeCompetence(charge)}`} ·
                          <MethodLabel method={charge.method} card={charge.card} className="text-xs" />
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span className="text-sm font-semibold text-foreground">
                          {formatBRL(charge.paidAmount ?? charge.amount)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{formatRelative(charge.paidAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function RowsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}
