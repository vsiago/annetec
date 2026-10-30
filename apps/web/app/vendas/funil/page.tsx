'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Columns3, KanbanSquare, List, Plus, RefreshCw, Search } from 'lucide-react'
import type { Prospect, ProspectDetail, ProspectStage } from '@annetec/contracts'
import { TableSkeleton, useConsoleData } from '@/components/admin-platform/billing/console-kit'
import { Button } from '@/components/admin-platform/ui/button'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard } from '@/components/admin-platform/ui/section-card'
import { FilterSelect, SearchInput } from '@/components/admin-platform/ui/table-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useSellerProfile } from '@/contexts/seller-profile-context'
import { STAGE_META, STAGE_ORDER, StagePill, formatInt, formatMoney, formatRelativeShort } from '@/components/sales/sales-ui'
import { LinkWizard } from '@/components/vendas/link-wizard'
import { InteractionWizard, MANUAL_ONLY_HINT, canMoveTo, useMoveStage } from '@/components/vendas/prospect-actions'
import { NextAction, ProspectCard, ProspectMenu } from '@/components/vendas/prospect-card'
import { ProspectWizard } from '@/components/vendas/prospect-wizard'
import { listSellerProspectsAction } from '@/lib/actions/vendas-api'
import { cn } from '@/lib/utils'

/**
 * Funil do vendedor: quadro por etapa (arrastar ou "Mover para…", que
 * funciona no teclado) e lista. Perdido pede o motivo. As etapas de proposta
 * (Em contratação, Em aprovação, Ganho) andam sozinhas com a proposta.
 */

type View = 'quadro' | 'lista'
const VIEW_KEY = 'annetec.vendas.funil.visao'

function readView(): View | null {
  try {
    const value = window.localStorage.getItem(VIEW_KEY)
    return value === 'quadro' || value === 'lista' ? value : null
  } catch {
    return null
  }
}

function writeView(view: View) {
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

function matches(prospect: Prospect, term: string): boolean {
  if (!term) return true
  const digits = term.replace(/\D/g, '')
  return (
    [prospect.name, prospect.contactName, prospect.email, prospect.city, prospect.interestPlanName].some(value =>
      value?.toLowerCase().includes(term),
    ) || (digits.length >= 3 && Boolean(prospect.cnpj?.includes(digits)))
  )
}

function FunnelPage() {
  const router = useRouter()
  const params = useSearchParams()
  const stageParam = params.get('etapa') as ProspectStage | null
  const initialStage = stageParam && STAGE_ORDER.includes(stageParam) ? stageParam : null
  const { canWrite } = useSellerProfile()

  const [view, setView] = useState<View>(initialStage ? 'lista' : 'quadro')
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<'all' | ProspectStage>(initialStage ?? 'all')
  const [dragging, setDragging] = useState<Prospect | null>(null)
  const [dropTarget, setDropTarget] = useState<ProspectStage | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [interactionFor, setInteractionFor] = useState<Prospect | null>(null)
  const [linkFor, setLinkFor] = useState<Prospect | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)

  useEffect(() => {
    if (initialStage) return
    const stored = readView()
    if (stored) setView(stored)
  }, [initialStage])

  const list = useConsoleData(() => listSellerProspectsAction({ status: 'all', perPage: 200 }), [])
  const items = list.data?.items ?? []

  const replaceItem = useCallback(
    (detail: ProspectDetail) => {
      list.setData(current =>
        current ? { ...current, items: current.items.map(item => (item.id === detail.id ? { ...item, ...detail } : item)) } : current,
      )
    },
    [list],
  )

  const { move, dialog: lostDialog, busyId } = useMoveStage(replaceItem)

  const term = search.trim().toLowerCase()
  const visible = useMemo(() => items.filter(item => matches(item, term)), [items, term])
  const listRows = useMemo(
    () => (stageFilter === 'all' ? visible : visible.filter(item => item.stage === stageFilter)),
    [visible, stageFilter],
  )

  const changeView = (next: View) => {
    setView(next)
    writeView(next)
  }

  const openLink = (prospect: Prospect) => {
    setLinkFor(prospect)
    setLinkOpen(true)
  }

  const drop = (stage: ProspectStage) => {
    const prospect = dragging
    setDragging(null)
    setDropTarget(null)
    if (!prospect || prospect.stage === stage) return
    if (!canMoveTo(prospect, stage)) {
      toast.info(MANUAL_ONLY_HINT(prospect, stage))
      return
    }
    void move(prospect, stage)
  }

  const header = (
    <PageHeader
      icon={KanbanSquare}
      title="Funil"
      description="Operadoras e clubes que você está prospectando, da primeira conversa ao clube no ar."
      actions={
        <>
          <Button variant="outline" className="h-11 gap-2 rounded-[10px] px-4 font-semibold" onClick={() => list.reload({ silent: true })} disabled={list.loading}>
            <RefreshCw className={cn('size-4', list.loading && 'animate-spin')} aria-hidden="true" />
            Atualizar
          </Button>
          {canWrite ? (
            <Button className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => setWizardOpen(true)}>
              <Plus aria-hidden="true" />
              Novo prospect
            </Button>
          ) : null}
        </>
      }
    />
  )

  const toolbar = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome, contato, cidade ou CNPJ" />
      {view === 'lista' ? (
        <FilterSelect
          label="Etapa"
          value={stageFilter}
          onChange={value => setStageFilter(value as 'all' | ProspectStage)}
          allLabel="Todas"
          options={STAGE_ORDER.map(stage => ({ value: stage, label: STAGE_META[stage].label }))}
        />
      ) : null}
      <div role="group" aria-label="Visualização" className="inline-flex h-12 shrink-0 items-center rounded-xl border border-border bg-card p-1">
        {(
          [
            ['quadro', 'Quadro', Columns3],
            ['lista', 'Lista', List],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => changeView(value)}
            className={cn(
              'inline-flex h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-secondary/40',
              view === value ? 'bg-secondary text-white' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )

  let body: React.ReactNode
  if (list.error && !list.data) {
    body = <ErrorState onRetry={() => list.reload()} />
  } else if (!list.data) {
    body =
      view === 'quadro' ? (
        <div className="flex gap-4 overflow-hidden" role="status" aria-busy="true">
          <span className="sr-only">Carregando o funil…</span>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-96 w-72 shrink-0 rounded-2xl" />
          ))}
        </div>
      ) : (
        <SectionCard padded={false}>
          <TableSkeleton />
        </SectionCard>
      )
  } else if (items.length === 0) {
    body = (
      <EmptyState
        framed
        size="lg"
        icon={KanbanSquare}
        title="Seu funil está vazio"
        description="Cadastre a primeira operadora ou clube que você vai abordar. Dali sai o link de contratação."
        action={
          canWrite ? (
            <Button className="h-11 rounded-[10px] px-4 font-semibold" onClick={() => setWizardOpen(true)}>
              <Plus aria-hidden="true" />
              Novo prospect
            </Button>
          ) : undefined
        }
      />
    )
  } else if (view === 'quadro') {
    // `relative` prende na rolagem do quadro o texto só para leitor de tela (sr-only é
    // absoluto): sem ele, as colunas da direita alargavam a página inteira.
    body = (
      <div className="relative -mx-4 overflow-x-auto px-4 pb-3 lg:-mx-6 lg:px-6" role="region" aria-label="Quadro do funil (role para o lado)" tabIndex={0}>
        <div className="flex min-w-max gap-4">
          {STAGE_ORDER.map(stage => {
            const column = visible.filter(item => item.stage === stage)
            const total = column.reduce((acc, item) => acc + (item.estimatedValue ?? 0), 0)
            const droppable = dragging ? canMoveTo(dragging, stage) : false
            return (
              <section
                key={stage}
                aria-label={`${STAGE_META[stage].label}: ${column.length} ${column.length === 1 ? 'prospect' : 'prospects'}`}
                onDragOver={event => {
                  if (!dragging) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = droppable ? 'move' : 'none'
                  if (dropTarget !== stage) setDropTarget(stage)
                }}
                onDragLeave={() => setDropTarget(current => (current === stage ? null : current))}
                onDrop={event => {
                  event.preventDefault()
                  drop(stage)
                }}
                className={cn(
                  'flex w-[17.5rem] shrink-0 flex-col rounded-2xl bg-[#F2F5F9] p-2.5 transition-colors sm:w-72',
                  dragging && droppable && 'ring-2 ring-dashed ring-secondary/30',
                  dropTarget === stage && droppable && 'bg-[#E5EDF5] ring-secondary/60',
                  dragging && !droppable && 'opacity-60',
                )}
              >
                <header className="flex items-center gap-2 px-1.5 pb-2.5 pt-1">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: STAGE_META[stage].bar }} aria-hidden="true" />
                  <h2 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{STAGE_META[stage].label}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-secondary ring-1 ring-inset ring-border">
                    {formatInt(column.length)}
                  </span>
                </header>
                <p className="m-0 px-1.5 pb-2.5 text-xs text-muted-foreground">
                  {total > 0 ? `${formatMoney(total)}/mês estimado` : STAGE_META[stage].hint}
                </p>
                <div className="flex min-h-24 flex-col gap-2.5">
                  {column.length === 0 ? (
                    <p className="m-0 rounded-xl border border-dashed border-[#D0D5DD] px-3 py-6 text-center text-xs text-muted-foreground">
                      {term ? 'Nada com essa busca' : 'Nenhum prospect aqui'}
                    </p>
                  ) : (
                    column.map(item => (
                      <ProspectCard
                        key={item.id}
                        prospect={item}
                        canWrite={canWrite}
                        busy={busyId === item.id}
                        draggable={canWrite && item.stage !== 'ganho'}
                        onDragStart={setDragging}
                        onDragEnd={() => {
                          setDragging(null)
                          setDropTarget(null)
                        }}
                        onMove={(prospect, target) => void move(prospect, target)}
                        onInteraction={setInteractionFor}
                        onLink={openLink}
                      />
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    )
  } else {
    body = (
      <SectionCard padded={false}>
        {listRows.length === 0 ? (
          <EmptyState icon={Search} title="Nenhum prospect com esses filtros" description="Ajuste a busca ou escolha outra etapa." />
        ) : (
          <DataTable caption="Prospects do seu funil" minWidth="min-w-[980px]" framed={false}>
            <thead>
              <tr>
                <Th>Prospect</Th>
                <Th>Etapa</Th>
                <Th align="right">Vidas</Th>
                <Th>Plano de interesse</Th>
                <Th align="right">Valor/mês</Th>
                <Th>Próxima ação</Th>
                <Th>Atualizado</Th>
                <Th align="right">
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {listRows.map(item => (
                <Tr key={item.id} className="cursor-pointer" onClick={() => router.push(`/vendas/funil/${item.id}`)}>
                  <Td>
                    <Link
                      href={`/vendas/funil/${item.id}`}
                      onClick={event => event.stopPropagation()}
                      className="block max-w-64 truncate rounded font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
                    >
                      {item.name}
                    </Link>
                    <p className="m-0 max-w-64 truncate text-xs text-muted-foreground">
                      {[item.contactName, item.city].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </Td>
                  <Td>
                    <StagePill stage={item.stage} />
                  </Td>
                  <Td align="right">{item.estimatedLives ? formatInt(item.estimatedLives) : '—'}</Td>
                  <Td className="text-sm">{item.interestPlanName ?? <span className="text-muted-foreground">—</span>}</Td>
                  <Td align="right">{item.estimatedValue ? formatMoney(item.estimatedValue) : '—'}</Td>
                  <Td className="max-w-64">
                    {item.nextAction || item.nextActionAt ? <NextAction prospect={item} /> : <span className="text-xs text-muted-foreground">—</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted-foreground">{formatRelativeShort(item.updatedAt)}</Td>
                  <Td align="right" onClick={event => event.stopPropagation()}>
                    <ProspectMenu
                      prospect={item}
                      canWrite={canWrite}
                      busy={busyId === item.id}
                      onMove={(prospect, target) => void move(prospect, target)}
                      onInteraction={setInteractionFor}
                      onLink={openLink}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>
    )
  }

  return (
    <PageContainer>
      {header}
      <div className="flex flex-col gap-4">
        {toolbar}
        {view === 'quadro' && list.data && items.length > 0 ? (
          <p className="m-0 text-[13px] text-muted-foreground">
            Arraste um cartão para outra etapa ou use o menu <span aria-hidden="true">⋯</span> do cartão. Em contratação, Em aprovação e Ganho
            acompanham a proposta sozinhos.
          </p>
        ) : null}
      </div>
      {body}

      {lostDialog}
      <ProspectWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSaved={() => void list.reload({ silent: true })}
        onOpenProspect={detail => router.push(`/vendas/funil/${detail.id}`)}
        onGenerateLink={detail => openLink(detail)}
      />
      <InteractionWizard
        open={interactionFor !== null}
        onOpenChange={open => !open && setInteractionFor(null)}
        prospect={interactionFor}
        onSaved={detail => {
          replaceItem(detail)
          toast.success('Interação registrada')
        }}
      />
      <LinkWizard open={linkOpen} onOpenChange={setLinkOpen} prospect={linkFor} onCreated={() => void list.reload({ silent: true })} />
    </PageContainer>
  )
}

export default function FunnelPageRoute() {
  return (
    <Suspense fallback={null}>
      <FunnelPage />
    </Suspense>
  )
}
