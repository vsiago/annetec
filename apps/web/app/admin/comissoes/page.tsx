'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { TenantUser } from '@annetec/contracts'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import { getInitials } from '@/lib/utils'
import { useAdminScope } from '@/contexts/admin-scope-context'
import { listOperatorSellersAction } from '@/lib/actions/operator-api'
import { Receipt, Loader2, UserCog, ArrowRight } from 'lucide-react'

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Comissões</h1>
        <p className="text-muted-foreground">Recibos de comissão por vendedor, direto da Digital Saúde.</p>
      </div>

      {mensagemErro && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{mensagemErro}</CardContent>
        </Card>
      )}

      {!mensagemErro && (
        <Card className="border border-border/80 shadow-xs bg-card">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando...
              </div>
            ) : sellers.length === 0 ? (
              <EmptyStateCard
                icon={Receipt}
                title="Nenhum vendedor neste inquilino"
                description="Comissão vem dos recibos do produtor no ERP — sem vendedor com produtor vinculado, não há o que consultar."
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/admin/vendedores">Ir para Vendedores</Link>
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-border">
                {sellers.map(seller => (
                  <div key={seller.id} className="flex items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9 bg-primary">
                        <AvatarFallback className="bg-primary text-white text-xs font-medium">
                          {getInitials(seller.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-foreground">{seller.name}</p>
                        {seller.upstreamProdutorCodigo ? (
                          <Badge variant="secondary" className="font-mono text-xs mt-0.5">
                            {seller.upstreamProdutorCodigo}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs mt-0.5">Sem produtor vinculado</Badge>
                        )}
                        {seller.upstreamProdutorCodigo && !seller.hasProdutorCredentials && (
                          <p className="mt-1 text-xs text-amber-700">
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
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/vendedores/${seller.id}/comissoes`}>
                          Ver comissões <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
                        <Link href="/admin/vendedores">
                          <UserCog className="h-3.5 w-3.5 mr-1.5" />
                          {seller.upstreamProdutorCodigo ? 'Informar senha do produtor' : 'Vincular produtor'}
                        </Link>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
