'use client'

import Link from 'next/link'
import { Copy, ExternalLink, FileSearch } from 'lucide-react'
import { toast } from 'sonner'
import { PLATFORM_CHARGE_ITEM_KIND_LABELS, type PlatformChargeDetail } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Field, LoadError, Pill, copyToClipboard, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { ChargeKindPill, MethodLabel, PlatformEventsTimeline } from '@/components/admin-platform/billing/billing-bits'
import { chargeCapabilities, type ChargeAction } from '@/components/admin-platform/billing/charge-actions'
import { getPlatformChargeAction } from '@/lib/actions/platform-billing-api'
import {
  chargeStatusMeta,
  formatBRL,
  formatBoletoLine,
  formatDateBR,
  formatDateTimeBR,
  gatewayLabel,
  pixQrDataUrl,
} from '@/lib/adapters/platform-console'
import { isDemoMode } from '@/lib/demo-mode'

/**
 * Detalhe de uma fatura da plataforma: itens (mensalidade, excedente, split,
 * ajustes), dados de pagamento (Pix, boleto, cartão), vínculos e a linha do
 * tempo. `version` força recarregar depois de uma ação feita fora do painel.
 */
export function ChargeDetailSheet({
  chargeId,
  version,
  canSimulate,
  onClose,
  onAction,
}: {
  chargeId: string | null
  version: number
  canSimulate: boolean
  onClose: () => void
  onAction: (action: ChargeAction, charge: PlatformChargeDetail) => void
}) {
  const { data, error, loading, reload } = useConsoleData(
    chargeId ? () => getPlatformChargeAction(chargeId) : null,
    [chargeId, version],
  )
  const charge = data && data.id === chargeId ? data : null
  const can = charge ? chargeCapabilities(charge, canSimulate) : null

  const copy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text)
    if (ok) toast.success(`${label} copiado`)
    else toast.error('Não foi possível copiar')
  }

  return (
    <Sheet open={!!chargeId} onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{charge ? charge.description : 'Fatura'}</SheetTitle>
          <SheetDescription>
            {charge ? `${charge.tenantName ?? 'Contratação (antes do provisionamento)'} · criada ${formatDateTimeBR(charge.createdAt)}` : 'Carregando…'}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-4">
          {!charge && loading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : error && !charge ? (
            <LoadError message={error} onRetry={() => reload()} />
          ) : charge ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
                <div>
                  <p className="text-2xl font-bold text-foreground">{formatBRL(charge.amount)}</p>
                  <p className="text-sm text-muted-foreground">Vence em {formatDateBR(charge.dueDate)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ChargeKindPill kind={charge.kind} />
                  <Pill meta={chargeStatusMeta(charge.status)} />
                </div>
              </div>

              {can && (can.reissue || can.manual || can.simulate || can.cancel) && (
                <div className="flex flex-wrap gap-2">
                  {can.reissue && (
                    <Button variant="outline" size="sm" onClick={() => onAction('reissue', charge)}>
                      Emitir 2ª via
                    </Button>
                  )}
                  {can.manual && (
                    <Button variant="outline" size="sm" onClick={() => onAction('manual', charge)}>
                      Dar baixa manual
                    </Button>
                  )}
                  {can.simulate && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300"
                      onClick={() => onAction('simulate', charge)}
                    >
                      Simular pagamento
                    </Button>
                  )}
                  {can.cancel && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-500/30"
                      onClick={() => onAction('cancel', charge)}
                    >
                      Cancelar
                    </Button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <Field label="Forma">
                  <MethodLabel method={charge.method} card={charge.card} className="text-foreground" />
                </Field>
                <Field label="Competência">
                  {charge.periodStart && charge.periodEnd
                    ? `${formatDateBR(charge.periodStart)} a ${formatDateBR(charge.periodEnd)}`
                    : charge.kind === 'activation'
                      ? 'Ativação (período nasce no provisionamento)'
                      : '—'}
                </Field>
                <Field label="Vidas apuradas">
                  {charge.livesCount !== null ? charge.livesCount.toLocaleString('pt-BR') : '—'}
                </Field>
                <Field label="Pagamento">
                  {charge.paidAt
                    ? `${formatBRL(charge.paidAmount ?? charge.amount)} em ${formatDateTimeBR(charge.paidAt)}`
                    : charge.canceledAt
                      ? `Cancelada em ${formatDateTimeBR(charge.canceledAt)}`
                      : charge.attempts > 0
                        ? `${charge.attempts} tentativa(s)`
                        : 'Em aberto'}
                </Field>
              </div>
              {charge.failureReason && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {charge.failureReason}
                </p>
              )}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Itens</h3>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <tbody>
                      {charge.items.map((item, index) => (
                        <tr key={index} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2">
                            <p className="text-foreground">{item.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {PLATFORM_CHARGE_ITEM_KIND_LABELS[item.kind] ?? item.kind}
                              {item.quantity !== 1 ? ` · ${item.quantity.toLocaleString('pt-BR')} × ${formatBRL(item.unitPrice)}` : ''}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums text-foreground">{formatBRL(item.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/40">
                        <td className="px-3 py-2 font-semibold text-foreground">Total</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">{formatBRL(charge.amount)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {(charge.pix || charge.boleto) && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Dados de pagamento</h3>
                  {charge.pix && (
                    <div className="flex gap-3 rounded-lg border border-border p-3">
                      {pixQrDataUrl(charge.pix.qrCodeBase64) && (
                        // QR em base64 vindo do gateway; next/image não se aplica.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pixQrDataUrl(charge.pix.qrCodeBase64)!} alt="QR Code Pix" className="h-28 w-28 rounded bg-white p-1" />
                      )}
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-xs text-muted-foreground">Pix copia e cola</p>
                        <p className="line-clamp-3 break-all font-mono text-[11px] text-foreground">{charge.pix.payload}</p>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => copy(charge.pix!.payload, 'Pix copia e cola')}>
                          <Copy className="h-3.5 w-3.5" />
                          Copiar
                        </Button>
                      </div>
                    </div>
                  )}
                  {charge.boleto && (
                    <div className="space-y-2 rounded-lg border border-border p-3">
                      <p className="text-xs text-muted-foreground">Linha digitável</p>
                      <p className="break-all font-mono text-xs text-foreground">{formatBoletoLine(charge.boleto.identificationField)}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => copy(charge.boleto!.identificationField, 'Linha digitável')}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copiar
                        </Button>
                        {charge.boleto.url && (
                          <Button variant="outline" size="sm" className="gap-1.5" asChild>
                            <a href={charge.boleto.url} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                              Boleto
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )}

              <section className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={charge.publicUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Fatura pública
                  </a>
                </Button>
                {charge.subscriptionId && (
                  <Button variant="outline" size="sm" className="gap-1.5" asChild>
                    <Link href={`/admin/financeiro/assinaturas/${charge.subscriptionId}`}>Assinatura</Link>
                  </Button>
                )}
                {charge.proposalId && (
                  <Button variant="outline" size="sm" className="gap-1.5" asChild>
                    <Link href={`/admin/compliance/${charge.proposalId}`}>
                      <FileSearch className="h-3.5 w-3.5" />
                      Proposta
                    </Link>
                  </Button>
                )}
              </section>

              <p className="text-xs text-muted-foreground">
                Gateway: {gatewayLabel(charge.gatewayProvider)}
                {isDemoMode({ gateway: charge.gatewayProvider }) ? ' (demonstração — sem dinheiro real)' : ''}
                {charge.gatewayChargeId ? ` · ${charge.gatewayChargeId}` : ''}
              </p>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Linha do tempo</h3>
                <PlatformEventsTimeline events={charge.events} />
              </section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
