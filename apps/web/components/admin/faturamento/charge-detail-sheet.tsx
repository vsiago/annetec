'use client'

import { useState } from 'react'
import {
  Ban,
  Barcode,
  Copy,
  CreditCard,
  ExternalLink,
  FlaskConical,
  HandCoins,
  LoaderCircle,
  QrCode,
  RotateCcw,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { CARD_BRAND_LABELS, type ClubCharge } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusPill, SummaryRow } from '@/components/dashboard/table-controls'
import { getClubChargeAction } from '@/lib/actions/faturamento-api'
import {
  chargeCompetence,
  isOneOffCharge,
  chargeStatusMeta,
  formatBRL,
  formatBoletoLine,
  formatCpf,
  formatDateBR,
  formatDateTimeBR,
  gatewayLabel,
  paymentMethodLabel,
  pixQrDataUrl,
  subscriptionStatusMeta,
} from '@/lib/adapters/faturamento'
import { EventsTimeline, LoadError, MethodLabel } from './billing-ui'
import { chargeCapabilities, useChargeActions } from './charge-actions'
import { copyToClipboard, useActionData } from './use-action-data'

/**
 * Detalhe de uma cobrança: dados de pagamento (QR do Pix, linha digitável,
 * cartão), a história dela nos eventos e as ações de exceção.
 */
export function ChargeDetailSheet({
  tenantSlug,
  chargeId,
  open,
  onOpenChange,
  canSimulate,
  onChanged,
  onOpenSubscription,
}: {
  tenantSlug: string
  chargeId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  canSimulate: boolean
  onChanged?: (charge: ClubCharge) => void
  onOpenSubscription?: (subscriptionId: string) => void
}) {
  const [version, setVersion] = useState(0)
  const detail = useActionData(
    open && chargeId ? () => getClubChargeAction(tenantSlug, chargeId) : null,
    [open, chargeId, tenantSlug, version],
  )
  const actions = useChargeActions({
    tenantSlug,
    onChanged: charge => {
      setVersion(value => value + 1)
      onChanged?.(charge)
    },
  })

  const charge = detail.data && detail.data.id === chargeId ? detail.data : null
  const can = charge ? chargeCapabilities(charge, canSimulate) : null
  const status = charge ? chargeStatusMeta(charge.status) : null
  const busy = charge !== null && actions.busyId === charge.id

  async function copy(text: string, label: string) {
    if (await copyToClipboard(text)) toast.success(`${label} copiado`)
    else toast.error('Não foi possível copiar', { description: 'Selecione o texto e copie manualmente.' })
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle>{charge ? charge.holderName : 'Cobrança'}</SheetTitle>
            <SheetDescription>
              {charge
                ? isOneOffCharge(charge)
                  ? `Cobrança avulsa · ${charge.description}`
                  : `${charge.planName} · competência ${chargeCompetence(charge)}`
                : 'Carregando os dados da cobrança…'}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 p-4">
            {detail.error && !charge && (
              <LoadError message={detail.error} onRetry={() => void detail.reload()} />
            )}

            {!charge && !detail.error && (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
              </div>
            )}

            {charge && status && can && (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Valor da cobrança</p>
                    <p className="text-3xl font-bold text-foreground">{formatBRL(charge.amount)}</p>
                    <p className="text-sm text-muted-foreground">Vencimento {formatDateBR(charge.dueDate)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusPill {...status} />
                    <MethodLabel method={charge.method} card={charge.card} className="text-xs" />
                  </div>
                </div>

                {(can.simulate || can.reissue || can.manual || can.cancel) && (
                  <div className="flex flex-wrap gap-2">
                    {can.simulate && (
                      <Button size="sm" className="gap-2" disabled={busy} onClick={() => actions.run('simulate', charge)}>
                        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                        Simular pagamento
                      </Button>
                    )}
                    {can.reissue && (
                      <Button size="sm" variant="outline" className="gap-2" onClick={() => actions.run('reissue', charge)}>
                        <RotateCcw className="h-4 w-4" />
                        Segunda via
                      </Button>
                    )}
                    {can.manual && (
                      <Button size="sm" variant="outline" className="gap-2" onClick={() => actions.run('manual', charge)}>
                        <HandCoins className="h-4 w-4" />
                        Baixa manual
                      </Button>
                    )}
                    {can.cancel && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 text-destructive hover:text-destructive"
                        onClick={() => actions.run('cancel', charge)}
                      >
                        <Ban className="h-4 w-4" />
                        Cancelar
                      </Button>
                    )}
                  </div>
                )}

                {charge.pix && (
                  <section className="space-y-3 rounded-xl border border-border p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <QrCode className="h-4 w-4 text-primary" />
                      Pix
                    </h3>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      {pixQrDataUrl(charge.pix.qrCodeBase64) && (
                        <img
                          src={pixQrDataUrl(charge.pix.qrCodeBase64) ?? undefined}
                          alt="QR Code do Pix"
                          className="h-40 w-40 shrink-0 rounded-lg border border-border bg-white p-1"
                        />
                      )}
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-xs text-muted-foreground">Pix copia e cola</p>
                        <p className="max-h-28 overflow-y-auto break-all rounded-lg bg-muted/60 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                          {charge.pix.payload}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => charge.pix && void copy(charge.pix.payload, 'Pix copia e cola')}
                          >
                            <Copy className="h-4 w-4" />
                            Copiar código
                          </Button>
                          {charge.pix.expiresAt && (
                            <span className="text-xs text-muted-foreground">
                              Expira em {formatDateTimeBR(charge.pix.expiresAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                )}

                {charge.boleto && (
                  <section className="space-y-3 rounded-xl border border-border p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Barcode className="h-4 w-4 text-primary" />
                      Boleto
                    </h3>
                    <p className="break-all rounded-lg bg-muted/60 p-2 font-mono text-xs text-foreground">
                      {formatBoletoLine(charge.boleto.identificationField)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() =>
                          charge.boleto && void copy(charge.boleto.identificationField, 'Linha digitável')
                        }
                      >
                        <Copy className="h-4 w-4" />
                        Copiar linha digitável
                      </Button>
                      {charge.boleto.url && (
                        <Button size="sm" variant="outline" className="gap-2" asChild>
                          <a href={charge.boleto.url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Abrir boleto
                          </a>
                        </Button>
                      )}
                    </div>
                  </section>
                )}

                {charge.method === 'credit_card' && (
                  <section className="space-y-2 rounded-xl border border-border p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <CreditCard className="h-4 w-4 text-primary" />
                      Cartão de crédito
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {charge.card
                        ? `${CARD_BRAND_LABELS[charge.card.brand] ?? 'Cartão'} •••• ${charge.card.last4}`
                        : 'Cartão salvo na assinatura (cobrado automaticamente no vencimento).'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Tentativas: <strong className="text-foreground">{charge.attempts}</strong>
                    </p>
                    {charge.failureReason && (
                      <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                        {charge.failureReason}
                      </p>
                    )}
                  </section>
                )}

                {charge.invoiceUrl && (
                  <Button variant="outline" size="sm" className="gap-2" asChild>
                    <a href={charge.invoiceUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Abrir fatura no gateway
                    </a>
                  </Button>
                )}

                <section>
                  <h3 className="mb-1 text-sm font-semibold text-foreground">Dados da cobrança</h3>
                  {isOneOffCharge(charge) ? (
                    <SummaryRow label="Descrição" value={charge.description} hint="Avulsa: não altera a assinatura" />
                  ) : (
                    <SummaryRow
                      label="Período coberto"
                      value={`${formatDateBR(charge.periodStart)} a ${formatDateBR(charge.periodEnd)}`}
                    />
                  )}
                  <SummaryRow label="Forma de pagamento" value={paymentMethodLabel(charge.method)} />
                  {charge.paidAt && <SummaryRow label="Pago em" value={formatDateTimeBR(charge.paidAt)} />}
                  {charge.paidAmount !== null && charge.paidAt && (
                    <SummaryRow label="Valor pago" value={formatBRL(charge.paidAmount)} />
                  )}
                  {charge.canceledAt && <SummaryRow label="Cancelada em" value={formatDateTimeBR(charge.canceledAt)} />}
                  {charge.refundedAt && <SummaryRow label="Estornada em" value={formatDateTimeBR(charge.refundedAt)} />}
                  <SummaryRow label="Gateway" value={gatewayLabel(charge.gatewayProvider)} />
                  {charge.gatewayChargeId && (
                    <SummaryRow
                      label="ID no gateway"
                      value={<span className="font-mono text-xs">{charge.gatewayChargeId}</span>}
                    />
                  )}
                  <SummaryRow label="Criada em" value={formatDateTimeBR(charge.createdAt)} />
                </section>

                <Separator />

                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <UserRound className="h-4 w-4 text-primary" />
                      Assinante
                    </h3>
                    <StatusPill {...subscriptionStatusMeta(charge.subscription.status)} />
                  </div>
                  <SummaryRow label="Titular" value={charge.subscription.holder.name} />
                  <SummaryRow label="CPF" value={formatCpf(charge.subscription.holder.cpf)} />
                  <SummaryRow label="E-mail" value={charge.subscription.holder.email} />
                  {charge.subscription.cardNumber && (
                    <SummaryRow
                      label="Carteirinha"
                      value={<span className="font-mono text-xs">{charge.subscription.cardNumber}</span>}
                    />
                  )}
                  {onOpenSubscription && (
                    <Button
                      variant="link"
                      className="h-auto px-0"
                      onClick={() => onOpenSubscription(charge.subscriptionId)}
                    >
                      Ver assinatura completa
                    </Button>
                  )}
                </section>

                <Separator />

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Histórico da cobrança</h3>
                  <EventsTimeline
                    events={charge.events}
                    emptyText="Nenhum evento registrado para esta cobrança."
                  />
                </section>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {actions.dialogs}
    </>
  )
}
