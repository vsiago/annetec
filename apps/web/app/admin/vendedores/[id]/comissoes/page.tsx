'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import type { CommissionReceipt, TenantUser } from '@annetec/contracts'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { BackLink, PageHeader } from '@/components/admin-platform/ui/page-header'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { DataTable, TableLoading, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { StatusPill, type StatusPillTone } from '@/components/admin-platform/ui/status-pill'
import { getOperatorAction, listOperatorSellersAction, listOperatorCommissionReceiptsAction } from '@/lib/actions/operator-api'
import { Receipt, ExternalLink } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  emitido: 'Emitido',
  pago: 'Pago',
  cancelado: 'Cancelado',
  desconhecido: 'Desconhecido',
}

const STATUS_TONE: Record<string, StatusPillTone> = {
  emitido: 'info',
  pago: 'success',
  cancelado: 'danger',
  desconhecido: 'neutral',
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
    <PageContainer>
      <PageHeader
        icon={Receipt}
        breadcrumb={<BackLink href="/admin/vendedores">Voltar para Vendedores</BackLink>}
        title={seller ? `Comissões — ${seller.name}` : 'Comissões'}
        description="Recibos direto da Digital Saúde, pelo produtor vinculado."
      />

      {baseError && !loadingBase ? (
        <ErrorState description={baseError} />
      ) : !baseError ? (
        <>
          <Tabs value={tab} onValueChange={v => setTab(v as 'emitido' | 'pago')}>
            <TabsList className="h-12 rounded-xl">
              <TabsTrigger value="emitido" className="rounded-lg px-5">
                Emitidos
              </TabsTrigger>
              <TabsTrigger value="pago" className="rounded-lg px-5">
                Pagos
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {loadingReceipts || loadingBase ? (
            <TableLoading label="Carregando recibos…" />
          ) : receiptsError ? (
            <ErrorState description={receiptsError} />
          ) : !receipts || receipts.length === 0 ? (
            <EmptyState
              framed
              icon={Receipt}
              title="Nenhum recibo encontrado"
              description={
                seller?.upstreamProdutorCodigo
                  ? 'Confira se o produtor tem login e senha vinculados na tela de Vendedores.'
                  : 'Vincule um produtor a este vendedor primeiro.'
              }
            />
          ) : (
            <DataTable caption="Recibos de comissão do vendedor" minWidth="min-w-[720px]">
              <thead>
                <tr>
                  <Th>Recibo</Th>
                  <Th>Emitido em</Th>
                  <Th>Valor</Th>
                  <Th>Status</Th>
                  <Th align="right">Documento</Th>
                </tr>
              </thead>
              <tbody>
                {receipts.map(receipt => (
                  <Tr key={receipt.upstreamCodigo}>
                    <Td>
                      <p className="m-0 text-sm font-semibold text-foreground">{receipt.upstreamCodigo}</p>
                      <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">
                        {receipt.entries.length} lançamento(s)
                      </p>
                    </Td>
                    <Td className="text-foreground">{receipt.issuedAt ?? '—'}</Td>
                    <Td className="font-medium text-foreground">{money(receipt.amount)}</Td>
                    <Td>
                      <StatusPill tone={STATUS_TONE[receipt.status] ?? 'neutral'}>
                        {STATUS_LABEL[receipt.status] ?? receipt.status}
                      </StatusPill>
                    </Td>
                    <Td align="right">
                      {receipt.documentUrl && (
                        <a
                          href={receipt.documentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-10 items-center gap-1 rounded-md text-sm font-medium text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
                        >
                          Ver<span className="sr-only"> documento do recibo {receipt.upstreamCodigo}</span>
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
      ) : null}
    </PageContainer>
  )
}
