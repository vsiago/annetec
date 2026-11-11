'use client'

import { Suspense } from 'react'
import { VendasRedeProvider } from '@/components/vendas-rede/provider'
import { FunilPage } from '@/components/vendas-rede/paginas/funil'

/**
 * Funil da Rede Comercial dentro do console. O console já tem o próprio sino
 * (`NotificationsProvider`) e a equipe da ANNETEC não marca presença aqui.
 */
export function FunilConsole({ leadIdInicial }: { leadIdInicial?: string }) {
  return (
    <VendasRedeProvider escopo={{ kind: 'platform' }} notificacoes={false} presenca={false}>
      <Suspense>
        <FunilPage leadIdInicial={leadIdInicial} />
      </Suspense>
    </VendasRedeProvider>
  )
}
