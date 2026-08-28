'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import type { CommissionReceipt, TenantUser } from '@annetec/contracts'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import { getOperatorAction, listOperatorSellersAction, listOperatorCommissionReceiptsAction } from '@/lib/actions/operator-api'
import { ArrowLeft, Loader2, Receipt, ExternalLink } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  emitido: 'Emitido',
  pago: 'Pago',
  cancelado: 'Cancelado',
  desconhecido: 'Desconhecido',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  emitido: 'outline',
  pago: 'default',
  cancelado: 'destructive',
  desconhecido: 'outline',
}

function money(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function SellerCommissionsPage() {
  const params = useParams<{ id: string }>()

  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const [seller, setSeller] = useState<TenantUser | null>(null)
  const [loadingBase, setLoadingBase] = useState(true)
  const [baseError, setBaseError] = useState('')

  const [tab, setTab] = useState<'emitido' | 'pago'>('emitido')
  const [receipts, setReceipts] = useState<CommissionReceipt[] | null>(null)
  const [loadingReceipts, setLoadingReceipts] = useState(false)
  const [receiptsError, setReceiptsError] = useState('')

  useEffect(() => {
    getOperatorAction().then(async result => {
      if (!result.success) {
        setBaseError(result.error)
        setLoadingBase(false)
        return
      }
      if (!result.data) {
        setBaseError('A Annetec ainda não está configurada como operadora.')
        setLoadingBase(false)
        return
      }
      const slug = result.data.slug
      setTenantSlug(slug)
      const sellersResult = await listOperatorSellersAction(slug)
      if (sellersResult.success) {
        const found = sellersResult.data.find(s => s.id === params.id) ?? null
        setSeller(found)
        if (!found) setBaseError('Vendedor não encontrado.')
      }
      setLoadingBase(false)
    })
  }, [])

  useEffect(() => {
    if (!tenantSlug) return
    setLoadingReceipts(true)
    setReceiptsError('')
    listOperatorCommissionReceiptsAction(tenantSlug, params.id, tab).then(result => {
      setLoadingReceipts(false)
      if (!result.success) {
        setReceiptsError(result.error)
        return
      }
      setReceipts(result.data)
    })
  }, [tenantSlug, tab])

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/admin/vendedores"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para Vendedores
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Comissões {seller ? `— ${seller.name}` : ''}
        </h1>
        <p className="text-muted-foreground">Recibos direto da Digital Saúde, pelo produtor vinculado.</p>
      </div>

      {(baseError && !loadingBase) && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{baseError}</CardContent>
        </Card>
      )}

      {!baseError && (
        <>
          <Tabs value={tab} onValueChange={v => setTab(v as 'emitido' | 'pago')}>
            <TabsList>
              <TabsTrigger value="emitido">Emitidos</TabsTrigger>
              <TabsTrigger value="pago">Pagos</TabsTrigger>
            </TabsList>
          </Tabs>

          <Card className="border border-border/80 shadow-xs bg-card">
            <CardContent className="p-0">
              {loadingReceipts || loadingBase ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando...
                </div>
              ) : receiptsError ? (
                <p className="p-4 text-sm text-destructive">{receiptsError}</p>
              ) : !receipts || receipts.length === 0 ? (
                <EmptyStateCard
                  icon={Receipt}
                  title="Nenhum recibo encontrado"
                  description={
                    seller?.upstreamProdutorCodigo
                      ? 'Confira se o produtor tem login e senha vinculados na tela de Vendedores.'
                      : 'Vincule um produtor a este vendedor primeiro.'
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Recibo</th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Emitido em</th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Valor</th>
                        <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Status</th>
                        <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Documento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipts.map(receipt => (
                        <tr key={receipt.upstreamCodigo} className="border-b border-border last:border-0">
                          <td className="py-4 px-6">
                            <p className="text-sm font-medium text-foreground">{receipt.upstreamCodigo}</p>
                            <p className="text-xs text-muted-foreground">{receipt.entries.length} lançamento(s)</p>
                          </td>
                          <td className="py-4 px-6 text-sm text-foreground">{receipt.issuedAt ?? '—'}</td>
                          <td className="py-4 px-6 text-sm font-medium text-foreground">{money(receipt.amount)}</td>
                          <td className="py-4 px-6">
                            <Badge variant={STATUS_VARIANT[receipt.status] ?? 'outline'}>
                              {STATUS_LABEL[receipt.status] ?? receipt.status}
                            </Badge>
                          </td>
                          <td className="py-4 px-6 text-right">
                            {receipt.documentUrl && (
                              <a
                                href={receipt.documentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                              >
                                Ver <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
