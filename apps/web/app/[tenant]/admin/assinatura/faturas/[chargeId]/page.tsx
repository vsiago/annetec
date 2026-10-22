'use client'

import { TenantInvoiceView } from '@/components/platform-billing/tenant-invoice-view'

/**
 * `/{slug}/admin/assinatura/faturas/<id>` — pagar a fatura ANNETEC dentro do
 * painel ("Regularizar agora"). Sob `/admin/assinatura`: liberado mesmo com o
 * painel em somente leitura ou bloqueado.
 */
export default function PagarFaturaAnnetecPage() {
  return <TenantInvoiceView />
}
