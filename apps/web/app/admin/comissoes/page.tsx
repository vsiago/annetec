'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { TenantUser } from '@annetec/contracts'
import { Button } from '@/components/admin-platform/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { getInitials } from '@/lib/utils'
import { useAdminScope } from '@/contexts/admin-scope-context'
import { listOperatorSellersAction } from '@/lib/actions/operator-api'
import { Receipt, UserCog, ArrowRight, Users } from 'lucide-react'

export default function OperatorComissoesPage() {
  const { slug: tenantSlug, error: scopeError } = useAdminScope()
  const [sellers, setSellers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Erro de escopo (sem operadora, sem inquilino) vem antes de qualquer outro.
  const mensagemErro = scopeError || error

  useEffect(() => {
    if (!tenantSlug) {
      setLoading(false)
      return
    }
    setLoading(true)
    listOperatorSellersAction(tenantSlug).then(result => {
      setLoading(false)
      if (!result.success) {
        setError(result.error)
        return
      }
      setError('')
      setSellers(result.data)
    })
  }, [tenantSlug])

  return (
    <PageContainer>
      <PageHeader
        icon={Receipt}
        title="Comissões"
        description="Recibos de comissão por vendedor, direto da Digital Saúde."
      />

      {mensagemErro && <ErrorState description={mensagemErro} />}

      {!mensagemErro &&
        (loading ? (
          <SectionCard>
            <SectionSkeleton rows={4} label="Carregando vendedores…" />
          </SectionCard>
        ) : sellers.length === 0 ? (
          <EmptyState
            framed
            icon={Users}
            title="Nenhum vendedor neste clube"
            description="Comissão vem dos recibos do produtor no ERP — sem vendedor com produtor vinculado, não há o que consultar."
            action={
              <Button variant="outline" className="h-10" asChild>
                <Link href="/admin/vendedores">Ir para Vendedores</Link>
              </Button>
            }
          />
        ) : (
          <SectionCard icon={Users} title="Vendedores" padded={false}>
            <ul className="m-0 list-none divide-y divide-border p-0">
              {sellers.map(seller => (
                <li
                  key={seller.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-10 bg-secondary">
                      <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-medium">
                        {getInitials(seller.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="m-0 text-sm font-semibold text-foreground">{seller.name}</p>
                      <div>
                        {seller.upstreamProdutorCodigo ? (
                          <StatusPill tone="neutral">
                            <span className="font-mono">{seller.upstreamProdutorCodigo}</span>
                          </StatusPill>
                        ) : (
                          <StatusPill tone="warning">Sem produtor vinculado</StatusPill>
                        )}
                      </div>
                      {seller.upstreamProdutorCodigo && !seller.hasProdutorCredentials && (
                        <p className="m-0 text-[13px] text-[#B54708]">
                          Falta a senha do produtor — o ERP exige login e senha para devolver os recibos.
                        </p>
                      )}
                    </div>
                  </div>
                  {/*
                    Três estados, não dois. Ter o código do produtor não
                    basta: `/recibo/procurarPorEmitido` do ERP exige login e
                    senha do produtor em query string. Sem a senha guardada,
                    "Ver comissões" só levava a um erro — agora a tela diz o
                    que falta e leva direto para onde se resolve.
                  */}
                  {seller.upstreamProdutorCodigo && seller.hasProdutorCredentials ? (
                    <Button variant="outline" className="h-10 shrink-0" asChild>
                      <Link href={`/admin/vendedores/${seller.id}/comissoes`}>
                        Ver comissões <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="ghost" asChild className="h-10 shrink-0 text-muted-foreground">
                      <Link href="/admin/vendedores">
                        <UserCog aria-hidden="true" />
                        {seller.upstreamProdutorCodigo ? 'Informar senha do produtor' : 'Vincular produtor'}
                      </Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>
        ))}
    </PageContainer>
  )
}
