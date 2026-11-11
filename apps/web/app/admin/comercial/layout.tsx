import type { ReactNode } from 'react'
import { ComercialNav } from '@/components/admin-platform/comercial/comercial-kit'
import { Embutido } from '@/components/vendas-rede/shell/base'
import { PageContainer } from '@/components/admin-platform/ui/page-container'

/** Abas do grupo Comercial do console; as telas vêm da Rede Comercial (`components/vendas-rede`). */
export default function ComercialLayout({ children }: { children: ReactNode }) {
  return (
    <PageContainer>
      <ComercialNav />
      <Embutido>{children}</Embutido>
    </PageContainer>
  )
}
