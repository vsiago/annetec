import { ProtectedRoute } from '@/components/protected-route'
import { BalcaoLayoutCliente } from '@/components/vendas-rede/balcao/layout-cliente'

export default function BalcaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['seller', 'admin']}>
      <BalcaoLayoutCliente>{children}</BalcaoLayoutCliente>
    </ProtectedRoute>
  )
}
