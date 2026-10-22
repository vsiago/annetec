'use client'

import { Suspense } from 'react'
import { ReceiptsView } from '@/components/admin/faturamento/receipts-view'
import { useTenant } from '@/contexts/tenant-context'

/**
 * Financeiro → Recebimento: pagamentos confirmados e estornos do clube.
 * `?cobranca=<id>` abre o detalhe da cobrança (atalho das notificações).
 */
export default function RecebimentoPage() {
  const { tenant } = useTenant()
  // `useSearchParams` (dentro da ReceiptsView) precisa de Suspense acima dele no App Router.
  return (
    <Suspense fallback={null}>
      <ReceiptsView tenantSlug={tenant?.slug ?? ''} />
    </Suspense>
  )
}
