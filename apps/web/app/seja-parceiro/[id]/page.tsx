import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PageLoading } from '@/components/contratar/ui'
import { Footer } from '@/components/footer'
import { Navbar } from '@/components/navbar'
import { Onboarding } from '@/components/seja-parceiro/onboarding'
import { PLATFORM_ESCOPO } from '@/components/seja-parceiro/escopo'

/** Página privada (link com chave): fora dos buscadores. */
export const metadata: Metadata = {
  title: 'Seja um parceiro comercial | ANNETEC',
  robots: { index: false, follow: false },
}

export default async function CandidaturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <div className="pt-24 lg:pt-28">
        <Suspense fallback={<PageLoading label="Carregando sua candidatura…" />}>
          <Onboarding escopo={PLATFORM_ESCOPO} id={id} />
        </Suspense>
      </div>
      <Footer />
    </main>
  )
}
