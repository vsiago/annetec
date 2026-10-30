'use client'

import { Suspense, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Handshake, Search } from 'lucide-react'
import {
  MANAGED_ACCOUNT_REQUEST_STATUS_LABELS,
  MANAGED_AUTO_DEBIT_STATUS_LABELS,
  type ManagedAccountRequestStatus,
} from '@annetec/contracts'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { BackLink, PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { FilterSelect, SearchInput } from '@/components/admin-platform/ui/table-controls'
import { LoadError, RefreshButton, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { openableRowProps, pluralize } from '@/components/admin-platform/billing/billing-bits'
import { ManagedAccountSheet } from '@/components/admin-platform/managed-accounts/managed-account-sheet'
import { DEBIT_TONE, GENERAL_TONE, Pill, REQUEST_TONE } from '@/components/admin-platform/managed-accounts/managed-bits'
import { listManagedAccountsAction } from '@/lib/actions/platform-managed-accounts-api'
import { formatBRL, formatDateBR } from '@/lib/adapters/platform-console'

/**
 * Financeiro › Contas gerenciadas: clubes que pediram (ou já têm) a conta de
 * recebimento gerenciada pela ANNETEC. A equipe consulta; só o superadmin
 * aprova, recusa e mexe no débito automático (as ações ficam na gaveta de
 * detalhe, que abre também por `?clube=<orgId>`, como nos links das notificações).
 */

const STATUS_OPTIONS = (Object.keys(MANAGED_ACCOUNT_REQUEST_STATUS_LABELS) as ManagedAccountRequestStatus[]).map(value => ({
  value,
  label: MANAGED_ACCOUNT_REQUEST_STATUS_LABELS[value],
}))

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function ContasGerenciadas() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const clube = searchParams.get('clube')

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | ManagedAccountRequestStatus>('all')
  const [version, setVersion] = useState(0)
  const q = useDebounced(search)

  const list = useConsoleData(
    () => listManagedAccountsAction({ q: q || undefined, status: status === 'all' ? undefined : status }),
    [q, status, version],
  )

  const rows = list.data ?? []
  const filtered = !!q || status !== 'all'
  const pending = rows.filter(row => row.request?.status === 'pendente').length

  const openClub = (orgId: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (orgId) params.set('clube', orgId)
    else params.delete('clube')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <PageContainer>
      <PageHeader
        breadcrumb={<BackLink href="/admin/financeiro">Voltar ao Financeiro</BackLink>}
        title="Contas gerenciadas"
        icon={Handshake}
        description="Clubes que pediram para a ANNETEC gerenciar a conta de recebimento das mensalidades."
        live
        actions={<RefreshButton loading={list.loading} onClick={() => setVersion(value => value + 1)} />}
      />

      <SectionCard
        padded={false}
        className="overflow-hidden"
        title="Pedidos e contas"
        description={
          list.data
            ? pending > 0
              ? `${pluralize(pending, 'pedido aguardando aprovação', 'pedidos aguardando aprovação')}.`
              : 'Nenhum pedido aguardando aprovação.'
            : undefined
        }
      >
        <div className="flex flex-col gap-3 p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome ou endereço do clube" />
          <FilterSelect
            label="Situação do pedido"
            value={status}
            onChange={value => setStatus(value as 'all' | ManagedAccountRequestStatus)}
            allLabel="Todas"
            options={STATUS_OPTIONS}
          />
        </div>

        {list.error && !list.data ? (
          <LoadError message={list.error} onRetry={() => list.reload()} framed={false} />
        ) : list.loading && !list.data ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={filtered ? Search : Handshake}
            title={filtered ? 'Nenhum clube com esses filtros' : 'Nenhum pedido ainda'}
            description={
              filtered
                ? 'Ajuste a busca ou limpe o filtro.'
                : 'Quando um clube pedir a conta gerenciada pelo painel dele, o pedido aparece aqui.'
            }
          />
        ) : (
          <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
            <DataTable caption="Contas de recebimento gerenciadas" minWidth="min-w-[960px]" framed={false}>
              <thead>
                <tr>
                  <Th>Clube</Th>
                  <Th>Pedido</Th>
                  <Th>Conta</Th>
                  <Th align="right">Documentos pendentes</Th>
                  <Th>Débito automático</Th>
                  <Th>Último débito</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <Tr key={row.organizationId} {...openableRowProps(() => openClub(row.organizationId))}>
                    <Td>
                      <div className="min-w-0 max-w-60">
                        <p className="m-0 truncate font-medium text-foreground">{row.tenantName}</p>
                        <p className="m-0 truncate text-xs text-muted-foreground">/{row.tenantSlug}</p>
                      </div>
                    </Td>
                    <Td>
                      {row.request ? (
                        <div className="space-y-1">
                          <Pill tone={REQUEST_TONE[row.request.status]}>{row.request.statusLabel}</Pill>
                          <p className="m-0 text-xs text-muted-foreground">{formatDateBR(row.request.createdAt)}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td>
                      {row.source === 'subaccount' && row.generalStatus && row.generalStatusLabel ? (
                        <Pill tone={GENERAL_TONE[row.generalStatus]}>{row.generalStatusLabel}</Pill>
                      ) : row.source === 'api_key' ? (
                        <span className="text-xs text-muted-foreground">Conta própria do clube</span>
                      ) : (
                        <span className="text-muted-foreground">Sem conta</span>
                      )}
                    </Td>
                    <Td align="right">
                      {row.source === 'subaccount' ? (
                        row.pendingDocuments > 0 ? (
                          <strong className="text-[#B54708]">{row.pendingDocuments}</strong>
                        ) : (
                          '0'
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td>
                      {row.source === 'subaccount' ? (
                        <Pill tone={row.autoDebitEnabled ? 'success' : 'neutral'}>
                          {row.autoDebitEnabled ? 'Ligado' : 'Desligado'}
                        </Pill>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td>
                      {row.lastDebit ? (
                        <div className="space-y-1">
                          <Pill tone={DEBIT_TONE[row.lastDebit.status]}>
                            {MANAGED_AUTO_DEBIT_STATUS_LABELS[row.lastDebit.status]}
                          </Pill>
                          <p className="m-0 text-xs text-muted-foreground">
                            {formatBRL(row.lastDebit.amount)} · {formatDateBR(row.lastDebit.startedAt)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </SectionCard>

      <ManagedAccountSheet
        orgId={clube}
        onClose={() => openClub(null)}
        onChanged={() => void list.reload({ silent: true })}
      />
    </PageContainer>
  )
}

export default function ContasGerenciadasPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <PageHeader title="Contas gerenciadas" icon={Handshake} />
          <SectionCard>
            <SectionSkeleton rows={4} label="Carregando as contas…" />
          </SectionCard>
        </PageContainer>
      }
    >
      <ContasGerenciadas />
    </Suspense>
  )
}
