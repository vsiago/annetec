'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { TenantUser } from '@annetec/contracts'
import { useAdminScope } from '@/contexts/admin-scope-context'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { DataTable, TableLoading, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import { listOperatorSellersAction, deactivateOperatorSellerAction } from '@/lib/actions/operator-api'
import { LinkProdutorWizard, NewSellerWizard } from '@/components/admin-platform/forms/seller-wizards'
import { Plus, UserCog, Link2, Mail, Phone, UserX, Receipt } from 'lucide-react'

export default function OperatorVendedoresPage() {
  // De qual inquilino são os dados desta tela — ver AdminScopeProvider.
  const {
    slug: tenantSlug,
    tenantId,
    isLoading: loadingOperator,
    error: operatorError,
  } = useAdminScope()

  const [sellers, setSellers] = useState<TenantUser[]>([])
  const [loadingSellers, setLoadingSellers] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState<TenantUser | null>(null)


  const refresh = async (slug: string) => {
    setLoadingSellers(true)
    const result = await listOperatorSellersAction(slug)
    setLoadingSellers(false)
    if (result.success) setSellers(result.data)
  }

  useEffect(() => {
    if (tenantSlug) refresh(tenantSlug)
  }, [tenantSlug])

  const handleDeactivate = async (sellerId: string) => {
    if (!tenantSlug) return
    const result = await deactivateOperatorSellerAction(tenantSlug, sellerId)
    if (result.success) await refresh(tenantSlug)
  }

  return (
    <PageContainer>
      <PageHeader
        icon={UserCog}
        title="Vendedores"
        description="Vendedores do clube selecionado acima, vinculados a um produtor na Digital Saúde."
        actions={
          tenantSlug ? (
            <>
              <Button className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => setAddOpen(true)}>
                <Plus aria-hidden="true" /> Novo vendedor
              </Button>
              <NewSellerWizard
                open={addOpen}
                onOpenChange={setAddOpen}
                onCreated={() => refresh(tenantSlug)}
                onLinkRequested={created => {
                  setAddOpen(false)
                  setLinkOpen(created)
                }}
                tenantSlug={tenantSlug}
              />
            </>
          ) : undefined
        }
      />

      {operatorError ? (
        <ErrorState description={operatorError} />
      ) : loadingSellers || loadingOperator ? (
        <TableLoading label="Carregando vendedores…" />
      ) : sellers.length === 0 ? (
        <EmptyState
          framed
          icon={UserCog}
          title="Nenhum vendedor cadastrado"
          description='Clique em "Novo vendedor" para começar.'
        />
      ) : (
        <DataTable caption="Vendedores do clube selecionado" minWidth="min-w-[820px]">
          <thead>
            <tr>
              <Th>Vendedor</Th>
              <Th>Contato</Th>
              <Th>Produtor (Digital Saúde)</Th>
              <Th align="right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {sellers.map(seller => (
              <Tr key={seller.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10 bg-secondary">
                      <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-medium">
                        {getInitials(seller.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start gap-1">
                      <p className="m-0 text-sm font-semibold text-foreground">{seller.name}</p>
                      {!seller.active && <StatusPill tone="neutral">Inativo</StatusPill>}
                    </div>
                  </div>
                </Td>
                <Td>
                  <p className="m-0 flex items-center gap-1.5 text-sm text-foreground">
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> {seller.email}
                  </p>
                  {seller.phone && (
                    <p className="m-0 mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                      <Phone className="size-3.5 shrink-0" aria-hidden="true" /> {seller.phone}
                    </p>
                  )}
                </Td>
                <Td>
                  {seller.upstreamProdutorCodigo ? (
                    <StatusPill tone="info">
                      <span className="font-mono">{seller.upstreamProdutorCodigo}</span>
                    </StatusPill>
                  ) : (
                    <StatusPill tone="warning">Não vinculado</StatusPill>
                  )}
                </Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    {seller.upstreamProdutorCodigo && (
                      <Button variant="ghost" size="sm" className="h-10 px-3" asChild>
                        <Link href={`/admin/vendedores/${seller.id}/comissoes`}>
                          <Receipt aria-hidden="true" />
                          Comissões
                        </Link>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-10 px-3" onClick={() => setLinkOpen(seller)}>
                      <Link2 aria-hidden="true" />
                      {seller.upstreamProdutorCodigo ? 'Trocar' : 'Vincular'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10 text-[#B42318] hover:bg-[#FEF3F2] hover:text-[#B42318]"
                      onClick={() => handleDeactivate(seller.id)}
                    >
                      <UserX aria-hidden="true" />
                      <span className="sr-only">Desativar {seller.name}</span>
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}

      {linkOpen && tenantSlug && (
        <LinkProdutorWizard
          open
          tenantId={tenantId}
          seller={linkOpen}
          tenantSlug={tenantSlug}
          onOpenChange={open => !open && setLinkOpen(null)}
          onLinked={() => {
            setLinkOpen(null)
            refresh(tenantSlug)
          }}
        />
      )}
    </PageContainer>
  )
}
