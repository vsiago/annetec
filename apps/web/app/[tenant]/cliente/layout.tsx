import { ProtectedRoute } from '@/components/protected-route'
import { ClubMembershipProvider } from '@/components/client/club-membership-provider'
import { ClientPortalChrome } from '@/components/client/client-portal-chrome'
import { ClientSubscriptionGate } from '@/components/client/subscription-access'

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute allowedRoles={['client']}>
      {/* Assinatura do Clube lida uma vez para o portal inteiro (menu + telas). */}
      <ClubMembershipProvider>
        {/* Sem assinatura: tudo leva ao onboarding `/cliente/assinar` (tela cheia, sem o menu). */}
        <ClientSubscriptionGate>
          <ClientPortalChrome>{children}</ClientPortalChrome>
        </ClientSubscriptionGate>
      </ClubMembershipProvider>
    </ProtectedRoute>
  )
}
