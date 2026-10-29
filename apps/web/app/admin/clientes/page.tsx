'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Contract } from '@annetec/contracts'
import { useAdminScope } from '@/contexts/admin-scope-context'
import { Button } from '@/components/admin-platform/ui/button'
import { Input } from '@/components/ui/input'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { DataTable, TableLoading, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { StatusPill, type StatusPillTone } from '@/components/admin-platform/ui/status-pill'
import {
  listOperatorContractsAction,
  searchOperatorContractByCpfAction,
  syncOperatorContractAction,
} from '@/lib/actions/operator-api'
import { Search, RefreshCw, Users, Loader2, CheckCircle2, Plus } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  produzido: 'Produzido',
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  cancelado: 'Cancelado',
  desconhecido: 'Desconhecido',
}

const STATUS_TONE: Record<string, StatusPillTone> = {
  ativo: 'success',
  produzido: 'info',
  pendente: 'warning',
  suspenso: 'warning',
  cancelado: 'danger',
  desconhecido: 'neutral',
}

function money(value: number | null) {
  if (value === null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function OperatorClientesPage() {
  const router = useRouter()
  // De qual inquilino são os dados desta tela — ver AdminScopeProvider.
  const { slug: tenantSlug, isLoading: loadingOperator, error: operatorError } = useAdminScope()

  const [contracts, setContracts] = useState<Contract[]>([])
  const [loadingContracts, setLoadingContracts] = useState(false)

  const [cpf, setCpf] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchMessage, setSearchMessage] = useState('')
  const [syncingCodigo, setSyncingCodigo] = useState<string | null>(null)


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
    <PageContainer>
      <PageHeader
        icon={Users}
        title="Clientes"
        description="Contratos do clube selecionado acima, direto da Digital Saúde — não misturado com os outros clubes."
        actions={
          <Button asChild className="h-10">
            <Link href="/admin/clientes/nova-adesao">
              <Plus aria-hidden="true" /> Nova adesão
            </Link>
          </Button>
        }
      />

      {operatorError && <ErrorState size="sm" description={operatorError} />}

      <SectionCard
        icon={Search}
        title="Buscar no ERP por CPF"
        description="Busca ao vivo na Digital Saúde — encontrou, já salva aqui na Annetec automaticamente."
      >
        <div className="flex flex-col gap-4">
          <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
            <Input
              aria-label="CPF do titular"
              placeholder="CPF do titular"
              value={cpf}
              onChange={e => setCpf(e.target.value)}
              disabled={!tenantSlug || loadingOperator}
              className="h-10 sm:max-w-xs"
            />
            <Button type="submit" className="h-10" disabled={!tenantSlug || !cpf || searching}>
              {searching ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
              Buscar e salvar
            </Button>
          </form>

          {searchError && (
            <p role="alert" className="m-0 text-sm font-medium text-[#B42318]">
              {searchError}
            </p>
          )}
          {searchMessage && (
            <p role="status" className="m-0 flex items-center gap-2 text-sm font-medium text-[#067647]">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> {searchMessage}
            </p>
          )}
        </div>
      </SectionCard>

      {loadingContracts || loadingOperator ? (
        <TableLoading rows={5} label="Carregando clientes…" />
      ) : contracts.length === 0 ? (
        <EmptyState
          framed
          icon={Users}
          title="Nenhum cliente sincronizado ainda"
          description="Use a busca por CPF acima para trazer um contrato do ERP — ele já entra salvo aqui."
        />
      ) : (
        <DataTable caption="Contratos sincronizados com a Digital Saúde" minWidth="min-w-[880px]">
          <thead>
            <tr>
              <Th>Titular</Th>
              <Th>Plano / Convênio</Th>
              <Th>Status</Th>
              <Th align="right">Mensalidade</Th>
              <Th>Sincronizado</Th>
              <Th align="right">Ações</Th>
            </tr>
          </thead>
          <tbody>
            {contracts.map(contract => (
              <Tr
                key={contract.id}
                onClick={() => router.push(`/admin/clientes/${encodeURIComponent(contract.upstreamCodigo)}`)}
                className="cursor-pointer"
              >
                <Td>
                  <Link
                    href={`/admin/clientes/${encodeURIComponent(contract.upstreamCodigo)}`}
                    onClick={e => e.stopPropagation()}
                    className="rounded-md font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2"
                  >
                    {contract.holderName ?? '—'}
                  </Link>
                  <p className="m-0 text-[13px] text-muted-foreground">{contract.upstreamCodigo}</p>
                </Td>
                <Td className="text-foreground">
                  {contract.planName ?? '—'}
                  <span className="text-muted-foreground"> / {contract.convenioName ?? '—'}</span>
                </Td>
                <Td>
                  <StatusPill tone={STATUS_TONE[contract.status] ?? 'neutral'}>
                    {STATUS_LABEL[contract.status] ?? contract.status}
                  </StatusPill>
                </Td>
                <Td align="right" className="tabular-nums text-foreground">
                  {money(contract.monthlyValue)}
                </Td>
                <Td className="text-[13px] text-muted-foreground">
                  {contract.syncedAt ? new Date(contract.syncedAt).toLocaleString('pt-BR') : '—'}
                </Td>
                <Td align="right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-10"
                    aria-label={`Atualizar ${contract.holderName ?? contract.upstreamCodigo} do ERP`}
                    title="Atualizar do ERP"
                    onClick={e => {
                      e.stopPropagation()
                      handleResync(contract.upstreamCodigo)
                    }}
                    disabled={syncingCodigo === contract.upstreamCodigo}
                  >
                    {syncingCodigo === contract.upstreamCodigo ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw aria-hidden="true" />
                    )}
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </PageContainer>
  )
}
