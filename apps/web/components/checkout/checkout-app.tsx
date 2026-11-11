'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { CheckoutContext } from '@annetec/contracts'
import { useTenant } from '@/contexts/tenant-context'
import { getCheckoutContextAction } from '@/lib/actions/checkout-api'
import { statusPagePath } from '@/lib/adapters/checkout'
import { CheckoutResultView, type CheckoutHandoff } from './checkout-result'
import { CheckoutEmpty, CheckoutLoadError, CheckoutReceivingUnavailable, CheckoutSkeleton } from './checkout-states'
import { CheckoutWizard } from './checkout-wizard'

/**
 * Raiz do `/{slug}/assinar`: carrega o contexto do checkout (planos ativos,
 * métodos, modo demonstração) e decide entre o wizard e a tela de resultado,
 * que vive na própria URL (`?assinatura=<id>&chave=<hmac>`) para sobreviver
 * a um recarregamento.
 */
export function CheckoutApp({
  initialContext = null,
}: {
  /** Contexto já buscado no servidor (page.tsx) — evita a ida e volta depois da hidratação. */
  initialContext?: { slug: string; context: CheckoutContext } | null
}) {
  const { tenant } = useTenant()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const slug = tenant?.slug ?? ''

  const subscriptionId = params.get('assinatura')
  const chave = params.get('chave')
  const planParam = params.get('plano')
  // Rede Comercial: indicação do agente e lead de origem (o servidor ignora o que for inválido).
  const refParam = params.get('ref')?.trim().slice(0, 40) || null
  const leadParam = params.get('lead')?.trim().slice(0, 50) || null

  const prefetched = initialContext && initialContext.slug === slug ? initialContext.context : null
  const [fetched, setFetched] = useState<CheckoutContext | null>(null)
  const context = fetched ?? prefetched
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [handoff, setHandoff] = useState<CheckoutHandoff | null>(null)

  useEffect(() => {
    if (!slug) return
    // Já veio do servidor para este clube: só busca de novo em "Tentar novamente".
    if (attempt === 0 && prefetched) return
    let alive = true
    setLoadError(null)
    getCheckoutContextAction(slug).then(result => {
      if (!alive) return
      if (result.success) setFetched(result.data)
      else setLoadError(result.error)
    })
    return () => {
      alive = false
    }
    // `prefetched` é estável (vem das props do servidor); a busca depende só do clube e da tentativa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, attempt])

  if (!tenant) return <CheckoutSkeleton />

  if (subscriptionId && chave) {
    return (
      <CheckoutResultView
        key={subscriptionId}
        slug={slug}
        tenant={tenant}
        subscriptionId={subscriptionId}
        chave={chave}
        context={context}
        handoff={handoff?.status.subscriptionId === subscriptionId ? handoff : null}
        onRestart={() => {
          setHandoff(null)
          router.replace(pathname)
        }}
      />
    )
  }

  if (loadError && !context) {
    return <CheckoutLoadError slug={slug} message={loadError} onRetry={() => setAttempt(value => value + 1)} />
  }
  if (!context) return <CheckoutSkeleton />
  if (!context.plans.some(plan => plan.status === 'active')) {
    return <CheckoutEmpty slug={slug} tenantName={tenant.name} />
  }
  // Asaas sem conta própria conectada: a API recusa a adesão (409) — avisa antes do formulário.
  if (context.receivingConfigured === false) {
    return <CheckoutReceivingUnavailable slug={slug} />
  }

  return (
    <CheckoutWizard
      key={planParam ?? 'sem-plano'}
      slug={slug}
      tenant={tenant}
      context={context}
      planParam={planParam}
      refParam={refParam}
      leadParam={leadParam}
      onSubmitted={(result, extra) => {
        const { accessKey, signedIn, accountCreated, session: _none, ...status } = result
        setHandoff({ status, signedIn, accountCreated, ...extra })
        router.replace(statusPagePath(slug, result.subscriptionId, accessKey), { scroll: true })
      }}
    />
  )
}
