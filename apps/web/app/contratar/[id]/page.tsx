import { Suspense } from 'react'
import type { Metadata } from 'next'
import { OnboardingApp } from '@/components/contratar/onboarding-app'
import { PageLoading } from '@/components/contratar/ui'

/** Página privada (link com chave): fora dos buscadores. */
export const metadata: Metadata = { title: 'Sua proposta | ANNETEC', robots: { index: false, follow: false } }

/**
 * `/contratar/<id>?chave=` — wizard (proposta editável) ou acompanhamento
 * (demais estados). `?etapa=` guarda a etapa aberta do wizard.
 */
export default function PropostaPage() {
  return (
    <Suspense fallback={<PageLoading label="Carregando a proposta…" />}>
      <OnboardingApp />
    </Suspense>
  )
}
