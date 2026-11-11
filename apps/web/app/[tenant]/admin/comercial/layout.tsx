import type { ReactNode } from 'react'
import { ComercialTabs } from '@/components/admin/comercial/comercial-tabs'
import { Embutido } from '@/components/vendas-rede/shell/base'

/** Abas do Comercial do clube; as telas vêm da Rede Comercial (`components/vendas-rede`). */
export default async function ComercialClubeLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ tenant: string }>
}) {
  const { tenant } = await params
  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <ComercialTabs slug={tenant} />
      <Embutido>{children}</Embutido>
    </div>
  )
}
