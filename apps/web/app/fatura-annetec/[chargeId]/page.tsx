import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PageLoading } from '@/components/contratar/ui'
import { InvoiceView } from '@/components/platform-billing/invoice-view'

export const metadata: Metadata = {
  title: 'Fatura ANNETEC',
  robots: { index: false, follow: false },
}

/** `/fatura-annetec/<id>?chave=` (`&imprimir=1` para a versão impressa). */
export default function FaturaAnnetecPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background print:bg-white">
      <Suspense fallback={<PageLoading label="Carregando a fatura…" />}>
        <InvoiceView />
      </Suspense>
    </div>
  )
}
