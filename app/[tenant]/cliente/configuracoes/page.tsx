'use client'

import { useAuth } from '@/contexts/auth-context'
import type { Client } from '@/lib/types'
import { PageHeader } from '@/components/dashboard/page-header'
import { ProfileForm } from '@/components/dashboard/profile-form'

export default function ClienteConfiguracoesPage() {
  const { user } = useAuth()
  const client = user as Client

  return (
    <div className="space-y-6">
      <PageHeader title="Minha Conta" description="Atualize seus dados de acesso e contato" />
      <div className="max-w-2xl">
        <ProfileForm
          description="Dados cadastrais do titular"
          readOnlyFields={[
            { label: 'CPF', value: client?.cpf ?? '-', hint: 'Para alterar o CPF, fale com o suporte.' },
            { label: 'Plano', value: client?.plan ?? '-' },
            { label: 'Nº da carteirinha', value: client?.cardNumber ?? '-' },
          ]}
        />
      </div>
    </div>
  )
}
