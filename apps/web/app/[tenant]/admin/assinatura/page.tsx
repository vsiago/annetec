'use client'

import { MyPlatformSubscriptionView } from '@/components/platform-billing/subscription-view'

/** `/{slug}/admin/assinatura` — "Assinatura da plataforma" (acessível mesmo com o painel bloqueado). */
export default function MinhaAssinaturaPage() {
  return <MyPlatformSubscriptionView />
}
