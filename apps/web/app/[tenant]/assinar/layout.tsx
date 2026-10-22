import type { Metadata } from 'next'
import { CheckoutFooter, CheckoutHeader } from '@/components/checkout/checkout-chrome'

/**
 * Casca própria do checkout (sem navbar/footer da vitrine). O layout do
 * inquilino, acima deste, já entrega TenantProvider, AuthProvider e o tema.
 */
export const metadata: Metadata = {
  title: 'Assinatura segura',
  robots: { index: false, follow: false },
}

export default function AssinarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/40 print:min-h-0 print:bg-white">
      <CheckoutHeader />
      <main className="flex-1">{children}</main>
      <CheckoutFooter />
    </div>
  )
}
