import { ProtectedRoute } from '@/components/protected-route'
import { ClientSidebar } from '@/components/client/client-sidebar'

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ProtectedRoute allowedRoles={['client']}>
      <div className="min-h-screen bg-muted/30">
        <ClientSidebar />
        <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
          <div className="p-4 lg:p-6">
            {children}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
