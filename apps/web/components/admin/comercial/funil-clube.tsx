'use client'

import { Suspense } from 'react'
import { VendasRedeProvider } from '@/components/vendas-rede/provider'
import { FunilPage } from '@/components/vendas-rede/paginas/funil'

/** Funil da Rede Comercial dentro do painel do clube (o layout já tem o sino; sem presença). */
export function FunilClube({ slug, leadIdInicial }: { slug: string; leadIdInicial?: string }) {
  return (
    <VendasRedeProvider escopo={{ kind: 'tenant', slug }} notificacoes={false} presenca={false}>
      <Suspense>
        <FunilPage leadIdInicial={leadIdInicial} />
      </Suspense>
    </VendasRedeProvider>
  )
}
