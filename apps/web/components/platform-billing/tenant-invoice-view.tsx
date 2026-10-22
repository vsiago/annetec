'use client'

import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PLATFORM_CHARGE_KIND_LABELS, type PlatformPublicInvoice } from '@annetec/contracts'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Notice } from '@/components/contratar/ui'
import { useTenant } from '@/contexts/tenant-context'
import {
  getMyPlatformInvoiceAction,
  payMyPlatformInvoiceAction,
  simulateMyPlatformInvoiceAction,
} from '@/lib/actions/assinatura-annetec-api'
import { invoiceHref } from '@/lib/adapters/contratacao'
import { isDemoMode } from '@/lib/demo-mode'
import { PLATFORM_ACCESS_CHANGED_EVENT } from './access-gate'
import { InvoicePaymentGrid, InvoiceUnavailable, usePlatformInvoice, type PlatformInvoiceSource } from './invoice-view'

/** "Fatura 10/2026" (mensalidade) ou "Fatura de ativação". */
export function platformInvoiceTitle(charge: Pick<PlatformPublicInvoice['charge'], 'kind' | 'periodStart'>): string {
  if (charge.kind === 'monthly' && charge.periodStart) return `Fatura ${charge.periodStart.slice(5, 7)}/${charge.periodStart.slice(0, 4)}`
  return `Fatura de ${PLATFORM_CHARGE_KIND_LABELS[charge.kind].toLowerCase()}`
}

/**
 * `/{slug}/admin/assinatura/faturas/<id>` — pagar a fatura ANNETEC SEM sair do
 * painel (sidebar e topbar do admin). Mesmo componente e fluxo da fatura
 * pública, pela rota autenticada do inquilino (sem chave). Fica sob
 * `/admin/assinatura`, que o guard de restrição e o bloqueio do painel liberam.
 */
export function TenantInvoiceView() {
  const { tenant } = useTenant()
  const slug = tenant?.slug ?? ''
  const params = useParams<{ chargeId: string }>()
  const chargeId = params.chargeId ?? ''

  const source = useMemo<PlatformInvoiceSource | null>(
    () =>
      slug && chargeId
        ? {
            get: () => getMyPlatformInvoiceAction(slug, chargeId),
            pay: input => payMyPlatformInvoiceAction(slug, chargeId, input),
            simulate: () => simulateMyPlatformInvoiceAction(slug, chargeId),
          }
        : null,
    [slug, chargeId],
  )
  const ctrl = usePlatformInvoice(source, { missingMessage: 'Fatura não encontrada.' })
  const { invoice } = ctrl
  const paid = invoice?.charge.status === 'paid'

  // Pago: o banner de atraso do painel recarrega na hora (sem esperar o polling dele).
  useEffect(() => {
    if (paid) window.dispatchEvent(new Event(PLATFORM_ACCESS_CHANGED_EVENT))
  }, [paid])

  const panelHref = `/${slug}/admin`
  const title = invoice ? platformInvoiceTitle(invoice.charge) : 'Fatura'
  const backButton = (
    <Button asChild variant="outline" className="h-11 gap-2">
      <Link href={panelHref}>
        <ArrowLeft className="size-4" aria-hidden />
        Voltar ao painel
      </Link>
    </Button>
  )

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/${slug}/admin/assinatura`}>Assinatura da plataforma</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PageHeader title={title} description="Pague a fatura da plataforma sem sair do painel: Pix, boleto ou cartão.">
        {backButton}
      </PageHeader>

      {!invoice ? (
        <InvoiceUnavailable ctrl={ctrl} />
      ) : (
        <>
          {isDemoMode({ gateway: invoice.charge.gatewayProvider, canSimulatePayment: invoice.canSimulatePayment }) ? (
            <Notice tone="warning" title="Ambiente de testes">
              Esta fatura é de teste: nenhum valor é cobrado.
            </Notice>
          ) : null}
          <InvoicePaymentGrid
            ctrl={ctrl}
            invoice={invoice}
            printHref={invoiceHref(invoice.charge.publicUrl, { imprimir: '1' })}
            paidExtra={
              <Button asChild className="mt-2 h-11 gap-2 rounded-xl">
                <Link href={panelHref}>
                  <ArrowLeft className="size-4" aria-hidden />
                  Voltar ao painel
                </Link>
              </Button>
            }
          />
        </>
      )}
    </div>
  )
}
