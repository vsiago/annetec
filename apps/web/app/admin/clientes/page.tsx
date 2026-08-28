'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Contract } from '@annetec/contracts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import {
  getOperatorAction,
  listOperatorContractsAction,
  searchOperatorContractByCpfAction,
  syncOperatorContractAction,
} from '@/lib/actions/operator-api'
import { Search, RefreshCw, Users, Loader2, CheckCircle2 } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  produzido: 'Produzido',
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
  desconhecido: 'Desconhecido',
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ativo: 'default',
  produzido: 'secondary',
  pendente: 'outline',
  suspenso: 'destructive',
  cancelado: 'destructive',
  desconhecido: 'outline',
}

function money(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function OperatorClientesPage() {
  const router = useRouter()
  const [tenantSlug, setTenantSlug] = useState<string | null>(null)
  const [loadingOperator, setLoadingOperator] = useState(true)
  const [operatorError, setOperatorError] = useState('')

  const [contracts, setContracts] = useState<Contract[]>([])
  const [loadingContracts, setLoadingContracts] = useState(false)

  const [cpf, setCpf] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchMessage, setSearchMessage] = useState('')
  const [syncingCodigo, setSyncingCodigo] = useState<string | null>(null)

  useEffect(() => {
    getOperatorAction().then(result => {
      setLoadingOperator(false)
      if (!result.success) {
        setOperatorError(result.error)
        return
      }
      if (!result.data) {
        setOperatorError('A Annetec ainda não está configurada como operadora.')
        return
      }
      setTenantSlug(result.data.slug)
    })
  }, [])

  useEffect(() => {
    if (!tenantSlug) return
    setLoadingContracts(true)
    listOperatorContractsAction(tenantSlug).then(result => {
      setLoadingContracts(false)
      if (result.success) setContracts(result.data.items)
    })
  }, [tenantSlug])

  const refreshContracts = async () => {
    if (!tenantSlug) return
    setLoadingContracts(true)
    const result = await listOperatorContractsAction(tenantSlug)
    setLoadingContracts(false)
    if (result.success) setContracts(result.data.items)
  }

  /**
   * Busca já grava: um cliente encontrado no ERP entra direto no espelho
   * local, sem clique extra de "sincronizar" — é assim que a base é
   * construída aos poucos, um CPF de cada vez (a Digital Saúde não tem
   * listagem em massa de contratos).
   */
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantSlug || !cpf) return
    setSearching(true)
    setSearchError('')
    setSearchMessage('')

    const found = await searchOperatorContractByCpfAction(tenantSlug, cpf.replace(/\D/g, ''))
    if (!found.success) {
      setSearching(false)
      setSearchError(found.error)
      return
    }
    if (found.data.length === 0) {
      setSearching(false)
      setSearchError('Nenhum contrato encontrado para este CPF.')
      return
    }

    const synced: string[] = []
    for (const contract of found.data) {
      const result = await syncOperatorContractAction(tenantSlug, contract.upstreamCodigo)
      if (result.success) synced.push(result.data.holderName ?? contract.upstreamCodigo)
    }

    setSearching(false)
    if (synced.length === 0) {
      setSearchError('Contrato encontrado no ERP, mas não foi possível salvá-lo. Tente de novo.')
      return
    }
    setSearchMessage(`${synced.join(', ')} sincronizado com sucesso.`)
    setCpf('')
    await refreshContracts()
  }

  const handleResync = async (upstreamCodigo: string) => {
    if (!tenantSlug) return
    setSyncingCodigo(upstreamCodigo)
    await syncOperatorContractAction(tenantSlug, upstreamCodigo)
    setSyncingCodigo(null)
    await refreshContracts()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
        <p className="text-muted-foreground">
          Contratos da Annetec como operadora, direto da Digital Saúde — não misturado com os
          inquilinos.
        </p>
      </div>

      {operatorError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{operatorError}</CardContent>
        </Card>
      )}

      <Card className="border border-border/80 shadow-xs bg-card">
        <CardHeader>
          <CardTitle className="text-base">Buscar no ERP por CPF</CardTitle>
          <CardDescription>
            Busca ao vivo na Digital Saúde — encontrou, já salva aqui na Annetec automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="CPF do titular"
              value={cpf}
              onChange={e => setCpf(e.target.value)}
              disabled={!tenantSlug || loadingOperator}
              className="max-w-xs"
            />
            <Button type="submit" disabled={!tenantSlug || !cpf || searching}>
              {searching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Buscar e salvar
            </Button>
          </form>

          {searchError && <p className="text-sm text-destructive">{searchError}</p>}
          {searchMessage && (
            <p className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> {searchMessage}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border border-border/80 shadow-xs bg-card">
        <CardContent className="p-0">
          {loadingContracts || loadingOperator ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Carregando...
            </div>
          ) : contracts.length === 0 ? (
            <EmptyStateCard
              icon={Users}
              title="Nenhum cliente sincronizado ainda"
              description="Use a busca por CPF acima para trazer um contrato do ERP — ele já entra salvo aqui."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Titular</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Plano / Convênio</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Mensalidade</th>
                    <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">Sincronizado</th>
                    <th className="text-right py-4 px-6 text-sm font-medium text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map(contract => (
                    <tr
                      key={contract.id}
                      onClick={() => router.push(`/admin/clientes/${encodeURIComponent(contract.upstreamCodigo)}`)}
                      className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <td className="py-4 px-6">
                        <p className="text-sm font-medium text-foreground">{contract.holderName ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{contract.upstreamCodigo}</p>
                      </td>
                      <td className="py-4 px-6 text-sm text-foreground">
                        {contract.planName ?? '—'}
                        <span className="text-muted-foreground"> / {contract.convenioName ?? '—'}</span>
                      </td>
                      <td className="py-4 px-6">
                        <Badge variant={STATUS_VARIANT[contract.status] ?? 'outline'}>
                          {STATUS_LABEL[contract.status] ?? contract.status}
                        </Badge>
                      </td>
                      <td className="py-4 px-6 text-sm text-foreground">{money(contract.monthlyValue)}</td>
                      <td className="py-4 px-6 text-xs text-muted-foreground">
                        {contract.syncedAt ? new Date(contract.syncedAt).toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={e => {
                            e.stopPropagation()
                            handleResync(contract.upstreamCodigo)
                          }}
                          disabled={syncingCodigo === contract.upstreamCodigo}
                        >
                          {syncingCodigo === contract.upstreamCodigo ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
