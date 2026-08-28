import { ProtectedRoute } from '@/components/protected-route'
import { SellerSidebar } from '@/components/seller/seller-sidebar'

export default function SellerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute allowedRoles={['seller']}>
      <div className="min-h-screen bg-muted/30">
        <SellerSidebar />
        <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
          <div className="p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
