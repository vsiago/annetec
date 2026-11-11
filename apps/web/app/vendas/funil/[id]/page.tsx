import { Suspense } from 'react'
import { FunilPage } from '@/components/vendas-rede/paginas/funil'

/** O mesmo Funil, já com o detalhe do lead aberto (links de notificação e compartilhamento). */
export default async function VendasLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Suspense>
      <FunilPage leadIdInicial={id} />
    </Suspense>
  )
}
