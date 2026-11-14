'use client'

import { Suspense, useMemo } from 'react'
import { PageLoading } from '@/components/contratar/ui'
import { SiteShell } from '@/components/site/site-shell'
import { useVitrine } from '@/components/site/vitrine-context'
import { Landing } from './landing'
import { Onboarding } from './onboarding'
import type { Escopo } from './escopo'

function useTenantEscopo(): { escopo: Escopo; nome: string } {
  const { tenant } = useVitrine()
  const escopo = useMemo<Escopo>(() => ({ kind: 'tenant', slug: tenant.slug }), [tenant.slug])
  return { escopo, nome: tenant.name }
}

function LandingContent() {
  const { escopo, nome } = useTenantEscopo()
  return <Landing escopo={escopo} marca={`do ${nome}`} />
}

function OnboardingContent({ id }: { id: string }) {
  const { escopo } = useTenantEscopo()
  return (
    <Suspense fallback={<PageLoading label="Carregando sua candidatura…" />}>
      <Onboarding escopo={escopo} id={id} />
    </Suspense>
  )
}

/** `/<clube>/seja-parceiro` dentro da moldura da vitrine do clube. */
export function TenantLandingPage() {
  return (
    <SiteShell mobileCta={false}>
      <LandingContent />
    </SiteShell>
  )
}

/** `/<clube>/seja-parceiro/<id>?chave=` dentro da moldura da vitrine do clube. */
export function TenantOnboardingPage({ id }: { id: string }) {
  return (
    <SiteShell mobileCta={false}>
      <OnboardingContent id={id} />
    </SiteShell>
  )
}

