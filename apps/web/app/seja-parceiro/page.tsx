import type { Metadata } from 'next'
import { Footer } from '@/components/footer'
import { Navbar } from '@/components/navbar'
import { Landing } from '@/components/seja-parceiro/landing'
import { PLATFORM_ESCOPO } from '@/components/seja-parceiro/escopo'

export const metadata: Metadata = {
  title: 'Seja um parceiro comercial | ANNETEC',
  description: 'Venda planos e benefícios da ANNETEC, acompanhe tudo em um painel próprio e seja remunerado por cada venda.',
}

export default function SejaParceiroPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Landing escopo={PLATFORM_ESCOPO} marca="da ANNETEC" />
      <Footer />
    </main>
  )
}
