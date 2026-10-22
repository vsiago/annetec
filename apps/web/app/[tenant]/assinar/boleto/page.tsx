'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Loader2, RefreshCw, SearchX } from 'lucide-react'
import type { CheckoutBoletoView } from '@annetec/contracts'
import { Button } from '@/components/ui/button'
import { BoletoDocument } from '@/components/checkout/boleto-document'
import { useTenant } from '@/contexts/tenant-context'
import { getCheckoutBoletoAction } from '@/lib/actions/checkout-api'
import { statusPagePath } from '@/lib/adapters/checkout'

/**
 * `/{slug}/assinar/boleto?assinatura=&cobranca=&chave=` — boleto imprimível
 * do modo simulado (a API aponta `boleto.url` para cá). Boleto de gateway
 * real NUNCA é desenhado aqui: a página leva ao PDF/fatura do próprio
 * gateway (`charge.boleto.url`, senão `charge.invoiceUrl`).
 */

/** Link do boleto emitido pelo gateway real — http(s) e fora desta página (sem laço). */
function gatewayBoletoUrl(view: CheckoutBoletoView): string | null {
  for (const candidate of [view.charge.boleto?.url, view.charge.invoiceUrl]) {
    if (!candidate || !/^https?:\/\//i.test(candidate)) continue
    if (candidate.includes('/assinar/boleto')) continue
    return candidate
  }
  return null
}

function BoletoPageContent() {
  const { tenant } = useTenant()
  const params = useSearchParams()
  const subscriptionId = params.get('assinatura') ?? ''
  const chargeId = params.get('cobranca') ?? ''
  const chave = params.get('chave') ?? ''
  const slug = tenant?.slug ?? ''

  const [view, setView] = useState<CheckoutBoletoView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!slug) return
    if (!subscriptionId || !chargeId || !chave) {
      setError('O link do boleto está incompleto.')
      return
    }
    setError(null)
    const result = await getCheckoutBoletoAction(slug, subscriptionId, chargeId, chave)
    if (!result.success) {
      setError(result.error)
      return
    }
    if (result.data.simulated) {
      setView(result.data)
      return
    }
    const external = gatewayBoletoUrl(result.data)
    if (external) window.location.replace(external)
    else setError('O banco ainda está emitindo este boleto. Use a linha digitável na página do pedido ou tente de novo em instantes.')
  }, [chargeId, chave, slug, subscriptionId])

  useEffect(() => {
    void load()
  }, [load])

  if (view?.simulated && tenant) return <BoletoDocument view={view} tenant={tenant} />

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
        <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <SearchX className="size-8" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Boleto indisponível</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
        <div className="mt-6 flex w-full flex-col gap-3">
          <Button type="button" onClick={() => void load()} className="h-12 rounded-xl">
            <RefreshCw className="size-4" aria-hidden />
            Tentar novamente
          </Button>
          {subscriptionId && chave && slug ? (
            <Button asChild variant="outline" className="h-12 rounded-xl">
              <Link href={statusPagePath(slug, subscriptionId, chave)}>Acompanhar o pedido</Link>
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true">
      <Loader2 className="size-8 animate-spin text-primary" aria-label="Carregando o boleto" />
    </div>
  )
}

export default function BoletoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        </div>
      }
    >
      <BoletoPageContent />
    </Suspense>
  )
}
