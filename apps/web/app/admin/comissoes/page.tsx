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
import { getOperatorAction, listOperatorSellersAction } from '@/lib/actions/operator-api'
import { Receipt, Loader2, UserCog, ArrowRight } from 'lucide-react'

export default function OperatorComissoesPage() {
  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const [sellers, setSellers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getOperatorAction().then(async result => {
      if (!result.success) {
        setError(result.error)
        setLoading(false)
        return
      }
      if (!result.data) {
        setError('A Annetec ainda não está configurada como operadora.')
        setLoading(false)
        return
      }
      setTenantSlug(result.data.slug)
      const sellersResult = await listOperatorSellersAction(result.data.slug)
      setLoading(false)
      if (sellersResult.success) setSellers(sellersResult.data)
    })
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Comissões</h1>
        <p className="text-muted-foreground">Recibos de comissão por vendedor, direto da Digital Saúde.</p>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!error && (
        <Card className="border border-border/80 shadow-xs bg-card">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando...
              </div>
            ) : sellers.length === 0 ? (
              <EmptyStateCard
                icon={Receipt}
                title="Nenhum vendedor cadastrado"
                description="Cadastre vendedores primeiro na tela de Vendedores."
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
                      </div>
                    </div>
                    {seller.upstreamProdutorCodigo ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/vendedores/${seller.id}/comissoes`}>
                          Ver comissões <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
                        <Link href="/admin/vendedores">
                          <UserCog className="h-3.5 w-3.5 mr-1.5" /> Vincular produtor
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
