'use client'

import { useRouter } from 'next/navigation'
import { NovaAdesaoWizard } from '@/components/admin-platform/forms/enrollment-wizard'
import ClientesPage from '../page'

/**
 * Link antigo de "Nova adesão": mostra a lista de clientes com o assistente
 * aberto por cima. Fechar volta para /admin/clientes.
 */
export default function NovaAdesaoPage() {
  const router = useRouter()
  return (
    <>
      <ClientesPage />
      <NovaAdesaoWizard open onOpenChange={open => !open && router.replace('/admin/clientes')} />
    </>
  )
}
