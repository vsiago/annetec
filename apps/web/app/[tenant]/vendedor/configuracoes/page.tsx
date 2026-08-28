'use client'

import { useAuth } from '@/contexts/auth-context'
import type { Seller } from '@/lib/types'
import { PageHeader } from '@/components/dashboard/page-header'
import { ProfileForm } from '@/components/dashboard/profile-form'

export default function VendedorConfiguracoesPage() {
  const { user } = useAuth()
  const seller = user as Seller

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minhas Configurações"
        description="Atualize seus dados de acesso e contato"
      />
      <div className="max-w-2xl">
        <ProfileForm
          description="Informações exibidas para seus clientes"
          readOnlyFields={[
            {
              label: 'Região de Atuação',
              value: seller?.region ?? '-',
              hint: 'Sua região base é definida pela administração do clube.',
            },
            {
              label: 'Meta mensal',
              value: seller?.salesGoal ? `R$ ${seller.salesGoal.toLocaleString('pt-BR')}` : '-',
              hint: 'Definida pela administração do clube.',
            },
          ]}
        />
      </div>
    </div>
  )
}
