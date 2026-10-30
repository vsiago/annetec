'use client'

import { useRouter } from 'next/navigation'
import { ClubWizard } from '@/components/admin-platform/clubs/club-wizard'
import ClubesPage from '../page'

/**
 * /admin/inquilinos/novo — continua funcionando para links antigos e para os
 * atalhos do Início: mostra a lista de clubes com o assistente "Cadastrar
 * clube" já aberto. Fechar volta para a lista.
 */
export default function CadastrarClubePage() {
  const router = useRouter()
  return (
    <>
      <ClubesPage />
      <ClubWizard
        open
        onOpenChange={open => {
          if (!open) router.replace('/admin/inquilinos')
        }}
      />
    </>
  )
}
