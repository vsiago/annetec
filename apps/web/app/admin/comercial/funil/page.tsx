'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRightLeft, KanbanSquare, Search } from 'lucide-react'
import {
  PROSPECT_INTERACTION_KIND_LABELS,
  PROSPECT_ORIGIN_LABELS,
  formatPhone,
  type Prospect,
  type ProspectStage,
} from '@annetec/contracts'
import { RefreshButton, SuperadminOnly, TableSkeleton, useConsoleData, usePlatformRole } from '@/components/admin-platform/billing/console-kit'
import { ComercialNav, SUPERADMIN_ONLY, useSellers } from '@/components/admin-platform/comercial/comercial-kit'
import { ReassignDialog } from '@/components/admin-platform/comercial/reassign-dialog'
import { Button } from '@/components/admin-platform/ui/button'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { FilterSelect, SearchInput, TableFooter } from '@/components/admin-platform/ui/table-controls'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatCnpj } from '@/lib/adapters/platform-console'
import {
  InfoRow,
  SellerProposalStatusPill,
  STAGE_META,
  STAGE_ORDER,
  StagePill,
  formatDateTime,
  formatInt,
  formatMoney,
  formatRelativeShort,
} from '@/components/sales/sales-ui'
import { NextAction } from '@/components/vendas/prospect-card'
import { getTeamProspectAction, listTeamProspectsAction } from '@/lib/actions/comercial-api'

/**
 * Comercial › Funil geral: os prospects de todos os vendedores, com filtro
 * por vendedor e etapa. Detalhe numa gaveta (com a linha do tempo) e
 * reatribuição a outro vendedor (só superadmin).
 */

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function ProspectDrawer({ prospectId, onOpenChange }: { prospectId: string | null; onOpenChange: (open: boolean) => void }) {
  const detail = useConsoleData(prospectId ? () => getTeamProspectAction(prospectId) : null, [prospectId])
  const p = detail.data && detail.data.id === prospectId ? detail.data : null
  return (
    <Sheet open={prospectId !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{p?.name ?? 'Prospect'}</SheetTitle>
          <SheetDescription>{p ? `Vendedor: ${p.sellerName ?? '—'} · Origem: ${PROSPECT_ORIGIN_LABELS[p.origin]}` : 'Carregando…'}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          {detail.error && !p ? (
            <ErrorState size="sm" title={detail.error} onRetry={() => detail.reload()} />
          ) : !p ? (
            <SectionSkeleton rows={6} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StagePill stage={p.stage} />
                {p.proposal ? (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="font-mono">{p.proposal.code}</span>
                    <SellerProposalStatusPill status={p.proposal.status} />
                  </span>
                ) : null}
              </div>
              {p.proposal ? (
                <Link href={`/admin/compliance/${p.proposal.id}`} className="text-sm font-semibold text-secondary hover:underline">
                  Abrir a proposta em Aprovações
                </Link>
              ) : null}
              <dl className="m-0 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoRow label="CNPJ">{p.cnpj ? formatCnpj(p.cnpj) : 'Não informado'}</InfoRow>
                <InfoRow label="Cidade">{[p.city, p.state].filter(Boolean).join('/') || 'Não informada'}</InfoRow>
                <InfoRow label="Contato">{p.contactName ?? 'Não informado'}</InfoRow>
                <InfoRow label="E-mail / telefone">
                  {[p.email, p.phone ? formatPhone(p.phone) : null].filter(Boolean).join(' · ') || 'Não informado'}
                </InfoRow>
                <InfoRow label="Vidas estimadas">{p.estimatedLives ? `${formatInt(p.estimatedLives)} vidas` : 'A definir'}</InfoRow>
                <InfoRow label="Valor estimado">{p.estimatedValue ? `${formatMoney(p.estimatedValue)}/mês` : 'A definir'}</InfoRow>
                <InfoRow label="Plano de interesse">{p.interestPlanName ?? 'A definir'}</InfoRow>
                <InfoRow label="Na etapa desde">{formatDateTime(p.stageChangedAt)}</InfoRow>
              </dl>
              <NextAction prospect={p} />
              {p.lostReason ? <p className="m-0 rounded-xl bg-[#FEF3F2] px-3 py-2 text-sm text-[#B42318]">Motivo da perda: {p.lostReason}</p> : null}
              <section aria-labelledby="linha-do-tempo">
                <h3 id="linha-do-tempo" className="m-0 mb-3 text-sm font-semibold text-foreground">
                  Linha do tempo
                </h3>
                {p.interactions.length === 0 ? (
                  <p className="m-0 text-sm text-muted-foreground">Nenhuma interação registrada.</p>
                ) : (
                  <ol className="m-0 flex list-none flex-col gap-3 p-0">
                    {p.interactions.map(item => (
                      <li key={item.id} className="rounded-xl border border-border bg-[#FCFCFD] px-3 py-2.5">
                        <p className="m-0 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{PROSPECT_INTERACTION_KIND_LABELS[item.kind]}</span> ·{' '}
                          {formatDateTime(item.occurredAt)}
                          {item.authorName && item.kind !== 'sistema' ? ` · ${item.authorName}` : ''}
                        </p>
                        <p className="m-0 mt-1 whitespace-pre-line break-words text-sm text-[#344054]">{item.description}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default function ComercialFunnelPage() {
  const { isSuperadmin } = usePlatformRole()
  const sellers = useSellers()
  const [search, setSearch] = useState('')
  const [seller, setSeller] = useState('all')
  const [stage, setStage] = useState<'all' | ProspectStage>('all')
  const [status, setStatus] = useState<'open' | 'closed' | 'all'>('open')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('25')
  const [openId, setOpenId] = useState<string | null>(null)
  const [reassign, setReassign] = useState<Prospect | null>(null)
  const q = useDebounced(search)

  const list = useConsoleData(
    () =>
      listTeamProspectsAction({
        q: q || undefined,
        sellerUserId: seller === 'all' ? undefined : seller,
        stage: stage === 'all' ? undefined : stage,
        status: stage === 'all' ? status : 'all',
        page,
        perPage: Number(perPage),
      }),
    [q, seller, stage, status, page, perPage],
  )
  useEffect(() => setPage(1), [q, seller, stage, status, perPage])

  const rows = list.data?.items ?? []

  return (
    <PageContainer>
      <PageHeader
        icon={KanbanSquare}
        title="Funil geral"
        description="Os prospects de todos os vendedores ANNETEC, da primeira conversa ao clube no ar."
        actions={<RefreshButton loading={list.loading} onClick={() => list.reload({ silent: true })} />}
      />
      <ComercialNav />

      <SectionCard padded={false}>
        <div className="flex flex-col gap-3 px-6 py-5 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome, contato, cidade ou CNPJ" />
          <FilterSelect label="Vendedor" value={seller} onChange={setSeller} allLabel="Todos" options={sellers.options} />
          <FilterSelect
            label="Etapa"
            value={stage}
            onChange={value => setStage(value as 'all' | ProspectStage)}
            allLabel="Todas"
            options={STAGE_ORDER.map(value => ({ value, label: STAGE_META[value].label }))}
          />
          {stage === 'all' ? (
            <FilterSelect
              label="Mostrar"
              value={status}
              onChange={value => setStatus(value as 'open' | 'closed' | 'all')}
              allLabel="Todos"
              options={[
                { value: 'open', label: 'No funil' },
                { value: 'closed', label: 'Ganhos e perdidos' },
              ]}
            />
          ) : null}
        </div>
        <div className="border-t border-border">
          {list.error && !list.data ? (
            <ErrorState framed={false} onRetry={() => list.reload()} />
          ) : !list.data ? (
            <TableSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={q || seller !== 'all' || stage !== 'all' ? Search : KanbanSquare}
              title={q || seller !== 'all' || stage !== 'all' ? 'Nenhum prospect com esses filtros' : 'Nenhum prospect no funil'}
              description="Os vendedores cadastram os prospects na área de vendas deles."
            />
          ) : (
            <div className={list.loading ? 'opacity-60 transition-opacity' : undefined}>
              <DataTable caption="Prospects de todos os vendedores" minWidth="min-w-[1040px]" framed={false}>
                <thead>
                  <tr>
                    <Th>Prospect</Th>
                    <Th>Vendedor</Th>
                    <Th>Etapa</Th>
                    <Th align="right">Vidas</Th>
                    <Th align="right">Valor/mês</Th>
                    <Th>Proposta</Th>
                    <Th>Atualizado</Th>
                    <Th align="right">
                      <span className="sr-only">Ações</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(item => (
                    <Tr key={item.id} className="cursor-pointer" onClick={() => setOpenId(item.id)}>
                      <Td>
                        <button
                          type="button"
                          onClick={event => {
                            event.stopPropagation()
                            setOpenId(item.id)
                          }}
                          className="block max-w-64 truncate rounded text-left font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
                        >
                          {item.name}
                        </button>
                        <p className="m-0 max-w-64 truncate text-xs text-muted-foreground">
                          {[item.contactName, item.city].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </Td>
                      <Td className="whitespace-nowrap text-sm">{item.sellerName ?? '—'}</Td>
                      <Td>
                        <StagePill stage={item.stage} />
                      </Td>
                      <Td align="right">{item.estimatedLives ? formatInt(item.estimatedLives) : '—'}</Td>
                      <Td align="right">{item.estimatedValue ? formatMoney(item.estimatedValue) : '—'}</Td>
                      <Td>
                        {item.proposal ? (
                          <span className="flex flex-col items-start gap-1">
                            <span className="font-mono text-xs">{item.proposal.code}</span>
                            <SellerProposalStatusPill status={item.proposal.status} />
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem proposta</span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatRelativeShort(item.updatedAt)}</Td>
                      <Td align="right" onClick={event => event.stopPropagation()}>
                        <SuperadminOnly isSuperadmin={isSuperadmin} reason={SUPERADMIN_ONLY}>
                          <Button
                            variant="outline"
                            size="icon-lg"
                            className="rounded-[10px]"
                            onClick={() => setReassign(item)}
                            aria-label={`Reatribuir ${item.name} a outro vendedor`}
                            title="Reatribuir a outro vendedor"
                          >
                            <ArrowRightLeft aria-hidden="true" />
                          </Button>
                        </SuperadminOnly>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          )}
        </div>
        {list.data && list.data.meta.total > 0 ? (
          <TableFooter
            page={page}
            perPage={perPage}
            total={list.data.meta.total}
            noun="prospects"
            onPageChange={setPage}
            onPerPageChange={setPerPage}
          />
        ) : null}
      </SectionCard>

      <ProspectDrawer prospectId={openId} onOpenChange={open => !open && setOpenId(null)} />
      <ReassignDialog
        prospect={reassign}
        sellers={sellers.sellers}
        onOpenChange={open => !open && setReassign(null)}
        onDone={() => void list.reload({ silent: true })}
      />
    </PageContainer>
  )
}
