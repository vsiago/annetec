'use client'

import { useEffect, useState } from 'react'
import { Ban, CreditCard, FilePlus2, IdCard, ReceiptText, RotateCcw, UsersRound } from 'lucide-react'
import {
  ageOn,
  CARD_BRAND_LABELS,
  formatPhone,
  type ClubSubscriptionDetail,
} from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { StatusPill, SummaryRow } from '@/components/dashboard/table-controls'
import { DigitalCardMockup } from '@/components/digital-card-mockup'
import { useTenant } from '@/contexts/tenant-context'
import { getClubSubscriptionAction } from '@/lib/actions/faturamento-api'
import {
  chargeTitle,
  chargeStatusMeta,
  formatBRL,
  formatCpf,
  formatDateBR,
  formatDateTimeBR,
  gatewayLabel,
  paymentMethodLabel,
  relationshipLabel,
  subscriptionStatusMeta,
} from '@/lib/adapters/faturamento'
import { EventsTimeline, LoadError, MethodLabel } from './billing-ui'
import {
  canCancelSubscription,
  canGenerateCharge,
  canReactivateSubscription,
  useSubscriptionActions,
} from './subscription-actions'
import { useActionData } from './use-action-data'

/**
 * Ficha do assinante: titular, dependentes com as carteirinhas, cobranças e
 * histórico. Usada em Cadastros e na aba Assinaturas do Faturamento.
 */
export function SubscriptionDetailSheet({
  tenantSlug,
  subscriptionId,
  open,
  onOpenChange,
  onChanged,
  onChargesChanged,
  onViewCharges,
  onOpenCharge,
  defaultTab = 'dados',
}: {
  tenantSlug: string
  subscriptionId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: (detail: ClubSubscriptionDetail) => void
  /** Cobrança gerada pelo "Gerar cobrança" desta ficha (a lista de fora recarrega). */
  onChargesChanged?: () => void
  /** Leva para a aba Cobranças do Faturamento filtrada por esta assinatura. */
  onViewCharges?: (subscriptionId: string, holderName: string) => void
  /** Abre o detalhe de uma cobrança ("Ver cobrança" do "Gerar cobrança"). */
  onOpenCharge?: (chargeId: string) => void
  defaultTab?: 'dados' | 'dependentes' | 'cobrancas' | 'historico'
}) {
  const { tenant } = useTenant()
  const [tab, setTab] = useState<string>(defaultTab)
  const detail = useActionData(
    open && subscriptionId ? () => getClubSubscriptionAction(tenantSlug, subscriptionId) : null,
    [open, subscriptionId, tenantSlug],
  )
  const actions = useSubscriptionActions({
    tenantSlug,
    onChanged: updated => {
      detail.setData(updated)
      onChanged?.(updated)
    },
    onChargeCreated: () => {
      void detail.reload({ silent: true })
      onChargesChanged?.()
    },
    onViewCharge: onOpenCharge,
  })

  // Cada ficha aberta começa na aba pedida, não na última que ficou aberta.
  useEffect(() => {
    if (open) setTab(defaultTab)
  }, [open, subscriptionId, defaultTab])

  const subscription = detail.data && detail.data.id === subscriptionId ? detail.data : null
  const status = subscription ? subscriptionStatusMeta(subscription.status) : null

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle>{subscription ? subscription.holder.name : 'Assinante'}</SheetTitle>
            <SheetDescription>
              {subscription
                ? `${subscription.planName} · ${formatBRL(subscription.amount)}/mês · ${paymentMethodLabel(subscription.paymentMethod)}`
                : 'Carregando a ficha do assinante…'}
            </SheetDescription>
            {subscription && status && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <StatusPill {...status} />
                {subscription.cardNumber && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-foreground">
                    <IdCard className="h-3.5 w-3.5 text-muted-foreground" />
                    {subscription.cardNumber}
                  </span>
                )}
                <div className="ml-auto flex flex-wrap gap-2">
                  {onViewCharges && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => onViewCharges(subscription.id, subscription.holder.name)}
                    >
                      <ReceiptText className="h-4 w-4" />
                      Cobranças
                    </Button>
                  )}
                  {canGenerateCharge(subscription.status) && (
                    <Button size="sm" className="gap-2" onClick={() => actions.requestGenerateCharge(subscription)}>
                      <FilePlus2 className="h-4 w-4" />
                      Gerar cobrança
                    </Button>
                  )}
                  {canReactivateSubscription(subscription.status) && (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => actions.requestReactivate(subscription)}>
                      <RotateCcw className="h-4 w-4" />
                      Reativar
                    </Button>
                  )}
                  {canCancelSubscription(subscription.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 text-destructive hover:text-destructive"
                      onClick={() => actions.requestCancel(subscription)}
                    >
                      <Ban className="h-4 w-4" />
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            )}
          </SheetHeader>

          <div className="p-4">
            {detail.error && !subscription && (
              <LoadError message={detail.error} onRetry={() => void detail.reload()} />
            )}

            {!subscription && !detail.error && (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-48 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            )}

            {subscription && (
              <Tabs value={tab} onValueChange={setTab} className="gap-4">
                <SectionTabsList>
                  <SectionTab value="dados">Dados</SectionTab>
                  <SectionTab value="dependentes" badge={subscription.dependents.length}>
                    Dependentes
                  </SectionTab>
                  <SectionTab value="cobrancas" badge={subscription.charges.length}>
                    Cobranças
                  </SectionTab>
                  <SectionTab value="historico">Histórico</SectionTab>
                </SectionTabsList>

                <TabsContent value="dados" className="m-0 space-y-5">
                  <SubscriptionData subscription={subscription} />
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">Carteirinha do titular</h3>
                    {subscription.cardNumber ? (
                      <DigitalCardMockup
                        tenant={tenant}
                        clientName={subscription.holder.name}
                        cardNumber={subscription.cardNumber}
                        planName={subscription.planName}
                        cpf={formatCpf(subscription.holder.cpf)}
                        contractDate={subscription.startedAt ?? subscription.createdAt}
                        dependentsCount={subscription.dependents.length}
                        size="sm"
                        interactive={false}
                      />
                    ) : (
                      <CardPending />
                    )}
                  </section>
                </TabsContent>

                <TabsContent value="dependentes" className="m-0 space-y-4">
                  {subscription.dependents.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Plano individual — nenhum dependente nesta assinatura.
                    </p>
                  ) : (
                    subscription.dependents.map(dependent => {
                      const age = dependent.birthDate ? ageOn(dependent.birthDate) : null
                      return (
                        <div key={dependent.id} className="space-y-3 rounded-xl border border-border p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-foreground">{dependent.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {relationshipLabel(dependent.relationship)}
                                {dependent.birthDate && ` · nascido(a) em ${formatDateBR(dependent.birthDate)}`}
                                {age !== null && ` (${age} ${age === 1 ? 'ano' : 'anos'})`}
                              </p>
                              {dependent.cpf && (
                                <p className="text-sm text-muted-foreground">CPF {formatCpf(dependent.cpf)}</p>
                              )}
                            </div>
                            <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs text-foreground">
                              {dependent.cardNumber ?? 'Carteirinha na ativação'}
                            </span>
                          </div>
                          {dependent.cardNumber && (
                            <DigitalCardMockup
                              tenant={tenant}
                              clientName={dependent.name}
                              cardNumber={dependent.cardNumber}
                              planName={subscription.planName}
                              cpf={dependent.cpf ? formatCpf(dependent.cpf) : undefined}
                              contractDate={subscription.startedAt ?? subscription.createdAt}
                              size="sm"
                              interactive={false}
                            />
                          )}
                        </div>
                      )
                    })
                  )}
                </TabsContent>

                <TabsContent value="cobrancas" className="m-0">
                  {subscription.charges.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma cobrança gerada ainda.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {subscription.charges.map(charge => (
                        <li key={charge.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-foreground">
                              {chargeTitle(charge)} · {formatBRL(charge.amount)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Vence {formatDateBR(charge.dueDate)}
                              {charge.paidAt && ` · paga em ${formatDateTimeBR(charge.paidAt)}`}
                              {charge.failureReason && ` · ${charge.failureReason}`}
                            </p>
                          </div>
                          <MethodLabel method={charge.method} card={charge.card} className="text-xs" />
                          <StatusPill {...chargeStatusMeta(charge.status)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="historico" className="m-0">
                  <EventsTimeline
                    events={subscription.events}
                    emptyText="Nenhum evento registrado para esta assinatura."
                  />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {actions.dialogs}
    </>
  )
}

function SubscriptionData({ subscription }: { subscription: ClubSubscriptionDetail }) {
  const holder = subscription.holder
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <section>
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <UsersRound className="h-4 w-4 text-primary" />
          Titular
        </h3>
        <SummaryRow label="Nome" value={holder.name} />
        <SummaryRow label="CPF" value={formatCpf(holder.cpf)} />
        <SummaryRow label="E-mail" value={<span className="break-all">{holder.email}</span>} />
        {holder.phone && <SummaryRow label="Telefone" value={formatPhone(holder.phone)} />}
        {holder.birthDate && <SummaryRow label="Nascimento" value={formatDateBR(holder.birthDate)} />}
        <SummaryRow label="Adesão" value={formatDateBR(subscription.startedAt ?? subscription.createdAt)} />
      </section>

      <section>
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
          <CreditCard className="h-4 w-4 text-primary" />
          Assinatura
        </h3>
        <SummaryRow label="Plano" value={subscription.planName} />
        <SummaryRow label="Mensalidade do titular" value={formatBRL(subscription.planPriceMonthly)} />
        {subscription.dependents.length > 0 && (
          <SummaryRow
            label={`Dependentes (${subscription.dependents.length})`}
            value={
              subscription.dependentPriceMonthly > 0
                ? `${formatBRL(subscription.dependentPriceMonthly)} cada`
                : 'Inclusos'
            }
          />
        )}
        <SummaryRow label="Total mensal" value={formatBRL(subscription.amount)} emphasis />
        <SummaryRow label="Dia de vencimento" value={`Todo dia ${subscription.dueDay}`} />
        {subscription.nextDueDate && (
          <SummaryRow label="Próximo vencimento" value={formatDateBR(subscription.nextDueDate)} />
        )}
        {subscription.currentPeriodStart && subscription.currentPeriodEnd && (
          <SummaryRow
            label="Período atual"
            value={`${formatDateBR(subscription.currentPeriodStart)} a ${formatDateBR(subscription.currentPeriodEnd)}`}
          />
        )}
        {subscription.paymentCard && (
          <SummaryRow
            label="Cartão salvo"
            value={`${CARD_BRAND_LABELS[subscription.paymentCard.brand] ?? 'Cartão'} •••• ${subscription.paymentCard.last4}`}
            hint={subscription.paymentCard.expiry ? `Validade ${subscription.paymentCard.expiry}` : undefined}
          />
        )}
        {subscription.openAmount > 0 && (
          <SummaryRow
            label="Em aberto"
            value={<span className="text-red-600 dark:text-red-400">{formatBRL(subscription.openAmount)}</span>}
            hint={subscription.overdueCount > 0 ? `${subscription.overdueCount} vencida(s)` : undefined}
          />
        )}
        <SummaryRow label="Gateway" value={gatewayLabel(subscription.gatewayProvider)} />
        {subscription.suspendedAt && (
          <SummaryRow label="Suspensa em" value={formatDateTimeBR(subscription.suspendedAt)} />
        )}
        {subscription.canceledAt && (
          <SummaryRow
            label="Cancelada em"
            value={formatDateTimeBR(subscription.canceledAt)}
            hint={subscription.cancelReason ?? undefined}
          />
        )}
      </section>
    </div>
  )
}

function CardPending() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      <IdCard className="h-5 w-5 shrink-0" />
      A carteirinha é emitida automaticamente quando o primeiro pagamento for confirmado.
    </div>
  )
}
