import { Suspense } from 'react'
import { FunilPage } from '@/components/vendas-rede/paginas/funil'

export default function VendasFunilPage() {
  return (
    <Suspense>
      <FunilPage />
    </Suspense>
  )
}
