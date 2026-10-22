import { Suspense } from 'react'
import { CheckoutApp } from '@/components/checkout/checkout-app'
import { CheckoutSkeleton } from '@/components/checkout/checkout-states'
import { getCheckoutContextAction } from '@/lib/actions/checkout-api'

/**
 * `/{slug}/assinar` — checkout do Clube (`?plano=<id>`) e, depois do envio, a
 * tela de resultado (`?assinatura=<id>&chave=<hmac>`), que sobrevive a
 * recarregar a página.
 *
 * O contexto (planos, formas de pagamento) já vem buscado no servidor, junto
 * com o HTML: a tela abre pronta, sem esperar a hidratação para pedir os
 * planos. Se essa busca falhar, o cliente tenta de novo sozinho.
 */
export default async function AssinarPage({ params }: { params: Promise<{ tenant: string }> }) {
  return (
    <Suspense fallback={<CheckoutSkeleton />}>
      <PrefetchedCheckout params={params} />
    </Suspense>
  )
}

async function PrefetchedCheckout({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params
  const result = await getCheckoutContextAction(slug).catch(() => null)
  return <CheckoutApp initialContext={result?.success ? { slug, context: result.data } : null} />
}
