'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Handshake, Search } from 'lucide-react'
import {
  MANAGED_ACCOUNT_GENERAL_STATUS_LABELS,
  MANAGED_AUTO_DEBIT_STATUS_LABELS,
  type ManagedAccountGeneralStatus,
  type ManagedAccountListItem,
} from '@annetec/contracts'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState } from '@/components/admin-platform/ui/empty-state'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { FilterSelect, SearchInput } from '@/components/admin-platform/ui/table-controls'
import { Button } from '@/components/admin-platform/ui/button'
import { LoadError, TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { openableRowProps } from '@/components/admin-platform/billing/billing-bits'
import { ManagedAccountSheet } from '@/components/admin-platform/managed-accounts/managed-account-sheet'
import { DEBIT_TONE, GENERAL_TONE, Pill, REQUEST_TONE } from '@/components/admin-platform/managed-accounts/managed-bits'
import { ApprovalsTabsRow, SITUATIONS, type ManagedSituation } from '@/components/admin-platform/approvals/approvals-kit'
import { listManagedAccountsAction } from '@/lib/actions/platform-managed-accounts-api'
import { formatBRL, formatDateBR } from '@/lib/adapters/platform-console'

/**
 * Aprovações › Contas gerenciadas: clubes que pediram (ou já têm) a conta de
 * recebimento gerenciada pela ANNETEC. A equipe consulta; só o superadmin
 * aprova, recusa, corrige o pedido e mexe no débito automático (as ações ficam
 * na gaveta de detalhe, que abre também por `?clube=<orgId>`, como nos links
 * das notificações).
 *
 * Situações (da API: status do último pedido + situação da subconta no Asaas):
 *  - Para analisar: pedido pendente, criando a conta ou com falha;
 *  - Aguardando documentos: subconta criada, ainda não aprovada pelo Asaas;
 *  - Ativas: subconta aprovada pelo Asaas;
 *  - Recusadas: último pedido recusado pela ANNETEC.
 */

const OPEN_STATUSES = new Set(['pendente', 'aprovando', 'falhou'])

function matchesSituation(row: ManagedAccountListItem, situation: ManagedSituation): boolean {
  const managed = row.source === 'subaccount'
  switch (situation) {
    case 'para-analisar':
      return Boolean(row.request && OPEN_STATUSES.has(row.request.status))
    case 'aguardando-documentos':
      return managed && row.generalStatus !== 'aprovada'
    case 'ativas':
      return managed && row.generalStatus === 'aprovada'
    case 'recusadas':
      return !managed && row.request?.status === 'recusado'
    case 'todas':
      return true
  }
}

const EMPTY_TEXT: Record<ManagedSituation, { title: string; description: string }> = {
  'para-analisar': {
    title: 'Nenhum pedido para analisar',
    description: 'Quando um clube pedir a conta gerenciada pelo painel dele, o pedido aparece aqui e no sino.',
  },
  'aguardando-documentos': {
    title: 'Nenhuma conta aguardando documentos',
    description: 'Contas criadas que o Asaas ainda não aprovou aparecem aqui.',
  },
  ativas: { title: 'Nenhuma conta ativa', description: 'Contas aprovadas pelo Asaas aparecem aqui.' },
  recusadas: { title: 'Nenhum pedido recusado', description: 'Pedidos recusados pela ANNETEC aparecem aqui.' },
  todas: {
    title: 'Nenhum pedido ainda',
    description: 'Quando um clube pedir a conta gerenciada pelo painel dele, o pedido aparece aqui.',
  },
}

type AccountFilter = 'all' | ManagedAccountGeneralStatus | 'sem-conta'

const ACCOUNT_OPTIONS: { value: AccountFilter; label: string }[] = [
  ...(Object.keys(MANAGED_ACCOUNT_GENERAL_STATUS_LABELS) as ManagedAccountGeneralStatus[]).map(value => ({
    value,
    label: MANAGED_ACCOUNT_GENERAL_STATUS_LABELS[value],
  })),
  { value: 'sem-conta', label: 'Sem conta gerenciada' },
]

function matchesAccount(row: ManagedAccountListItem, filter: AccountFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'sem-conta') return row.source !== 'subaccount'
  return row.source === 'subaccount' && row.generalStatus === filter
}

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function ManagedAccountsPanel({
  situation,
  onSituationChange,
  kindSwitcher,
  focusedClub,
  onFocusClub,
  version,
  onChanged,
}: {
  situation: ManagedSituation
  onSituationChange: (value: ManagedSituation) => void
  kindSwitcher: ReactNode
  /** `?clube=<orgId>`: a gaveta desse clube aberta. */
  focusedClub: string | null
  onFocusClub: (orgId: string | null) => void
  version: number
  /** Algo mudou (aprovação, recusa…): a página relê o resumo. */
  onChanged: () => void
}) {
  const [search, setSearch] = useState('')
  const [account, setAccount] = useState<AccountFilter>('all')
  const q = useDebounced(search)

  const list = useConsoleData(() => listManagedAccountsAction({ q: q || undefined }), [q])

  useEffect(() => {
    if (version === 0) return
    void list.reload({ silent: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const all = useMemo(() => list.data ?? [], [list.data])
  const counts = useMemo(() => {
    const result = {} as Record<ManagedSituation, number>
    for (const item of SITUATIONS['contas-gerenciadas']) {
      result[item.value] = all.filter(row => matchesSituation(row, item.value)).length
    }
    return result
  }, [all])
  const rows = all.filter(row => matchesSituation(row, situation) && matchesAccount(row, account))
  const filtered = !!q || account !== 'all'

  return (
    <SectionCard padded={false} className="overflow-hidden">
      <ApprovalsTabsRow
        situations={SITUATIONS['contas-gerenciadas']}
        value={situation}
        onChange={onSituationChange}
        counts={list.data ? counts : undefined}
        kindSwitcher={kindSwitcher}
      />

      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:flex-wrap lg:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome ou endereço do clube" />
        <FilterSelect
          label="Situação da conta"
          value={account}
          onChange={value => setAccount(value as AccountFilter)}
          allLabel="Todas"
          options={ACCOUNT_OPTIONS}
        />
      </div>

      <div className="border-t border-border">
        {list.error && !list.data ? (
          <LoadError message={list.error} onRetry={() => list.reload()} framed={false} />
        ) : list.loading && !list.data ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState
              icon={Search}
              title="Nenhum clube com esses filtros"
              description="Ajuste a busca ou limpe os filtros."
              action={
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-[10px] px-4 font-semibold"
                  onClick={() => {
                    setSearch('')
                    setAccount('all')
                  }}
                >
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState icon={Handshake} title={EMPTY_TEXT[situation].title} description={EMPTY_TEXT[situation].description} />
          )
        ) : (
          <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
            <DataTable caption="Pedidos de conta gerenciada" minWidth="min-w-[960px]" framed={false}>
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
                  <Tr key={row.organizationId} {...openableRowProps(() => onFocusClub(row.organizationId))}>
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
                        <Pill tone={row.autoDebitEnabled ? 'success' : 'neutral'}>{row.autoDebitEnabled ? 'Ligado' : 'Desligado'}</Pill>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </Td>
                    <Td>
                      {row.lastDebit ? (
                        <div className="space-y-1">
                          <Pill tone={DEBIT_TONE[row.lastDebit.status]}>{MANAGED_AUTO_DEBIT_STATUS_LABELS[row.lastDebit.status]}</Pill>
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
      </div>

      <ManagedAccountSheet
        orgId={focusedClub}
        onClose={() => onFocusClub(null)}
        onChanged={() => {
          void list.reload({ silent: true })
          onChanged()
        }}
      />
    </SectionCard>
  )
}
