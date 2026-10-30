'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Search } from 'lucide-react'
import { listClubsOverviewAction } from '@/lib/actions/tenants-api'
import { ClubWizardButton } from '@/components/admin-platform/clubs/club-wizard'
import { ClubsTable } from '@/components/admin-platform/clubs/clubs-table'
import { Button } from '@/components/admin-platform/ui/button'
import { TableLoading } from '@/components/admin-platform/ui/data-table'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import {
  CLUBS_PAGE_SIZE,
  CLUB_FILTERS,
  CLUB_SORTS,
  clubsSummary,
  countByFilter,
  matchesFilter,
  matchesSearch,
  needsAttention,
  sortClubs,
  type ClubFilter,
  type ClubListRow,
  type ClubSort,
} from '@/components/admin-platform/clubs/club-list-model'
import { cn } from '@/lib/utils'

/**
 * Clubes — "Quais clubes tenho e qual precisa de atenção?"
 *
 * Junta o cadastro (`/platform/tenants`) com o ranking da holding
 * (`/platform/holding/inquilinos`) numa action só e trabalha com a lista
 * inteira no navegador: filtro, busca, ordenação e as 25 linhas por página.
 */

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; rows: ClubListRow[] }

const outlineButton = 'min-h-10 rounded-[10px] border-[#D0D5DD] px-3.5 text-sm font-semibold text-[#344054]'
const field =
  'min-h-11 rounded-[10px] border border-[#D0D5DD] bg-white px-3.5 text-sm text-foreground outline-none placeholder:text-[#667085] focus-visible:border-secondary focus-visible:ring-[3px] focus-visible:ring-secondary/25'

export default function ClubesPage() {
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [filter, setFilter] = useState<ClubFilter>('todos')
  const [sort, setSort] = useState<ClubSort>('atencao')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    setState({ phase: 'loading' })
    const result = await listClubsOverviewAction()
    setState(result.success ? { phase: 'ready', rows: result.data } : { phase: 'error' })
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => (state.phase === 'ready' ? state.rows : []), [state])

  // Contagens dos botões respeitam a busca: o número é o que a pessoa vai ver ao clicar.
  const searched = useMemo(() => rows.filter(row => matchesSearch(row, search)), [rows, search])
  const counts = useMemo(() => countByFilter(searched), [searched])
  const attentionTotal = useMemo(() => rows.filter(needsAttention).length, [rows])

  const visible = useMemo(
    () => sortClubs(searched.filter(row => matchesFilter(row, filter)), sort),
    [searched, filter, sort],
  )

  const totalPages = Math.max(1, Math.ceil(visible.length / CLUBS_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const firstIndex = (currentPage - 1) * CLUBS_PAGE_SIZE
  const pageRows = visible.slice(firstIndex, firstIndex + CLUBS_PAGE_SIZE)

  const hasFilter = filter !== 'todos' || search.trim() !== ''

  const changeFilter = (next: ClubFilter) => {
    setFilter(next)
    setPage(1)
  }
  const clearFilters = () => {
    setFilter('todos')
    setSearch('')
    setPage(1)
  }

  const shownLabel =
    visible.length <= CLUBS_PAGE_SIZE
      ? `Mostrando ${visible.length} de ${visible.length} ${visible.length === 1 ? 'clube' : 'clubes'}`
      : `Mostrando ${firstIndex + 1} a ${firstIndex + pageRows.length} de ${visible.length} clubes`

  return (
    <PageContainer>
      <PageHeader
        title="Clubes"
        icon={Building2}
        description={state.phase === 'ready' ? clubsSummary(rows.length, attentionTotal) : 'Carregando clubes…'}
        live
        actions={<ClubWizardButton onCreated={() => void load()} />}
      />

      {state.phase === 'error' ? (
        <ErrorState onRetry={() => void load()} />
      ) : state.phase === 'loading' ? (
        <TableLoading label="Carregando clubes…" />
      ) : rows.length === 0 ? (
        <EmptyState
          framed
          icon={Building2}
          title="Nenhum clube por aqui ainda"
          description="Cadastre o primeiro clube para começar a vender planos."
          action={<ClubWizardButton onCreated={() => void load()} />}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap gap-2">
              {CLUB_FILTERS.map(option => {
                const active = filter === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => changeFilter(option.value)}
                    className={cn(
                      'inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-secondary/40 focus-visible:ring-offset-2',
                      active
                        ? 'border-secondary bg-secondary text-white'
                        : 'border-[#D0D5DD] bg-white text-[#344054] hover:bg-[#F9FAFB]',
                    )}
                  >
                    {option.label}
                    <span
                      className={cn(
                        'rounded-full px-[7px] text-xs font-semibold',
                        active ? 'bg-white/20 text-white' : 'bg-[#F2F4F7] text-[#344054]',
                      )}
                    >
                      {counts[option.value]}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <label htmlFor="busca-clubes" className="sr-only">
                Buscar clube
              </label>
              <div className="relative w-full sm:w-[300px]">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#667085]"
                  aria-hidden="true"
                />
                <input
                  id="busca-clubes"
                  type="search"
                  value={search}
                  onChange={event => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Buscar por nome, CNPJ ou e-mail"
                  autoComplete="off"
                  className={cn(field, 'w-full pl-10')}
                />
              </div>
              <label htmlFor="ordem-clubes" className="sr-only">
                Ordenar por
              </label>
              <select
                id="ordem-clubes"
                value={sort}
                onChange={event => {
                  setSort(event.target.value as ClubSort)
                  setPage(1)
                }}
                className={field}
              >
                {CLUB_SORTS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              framed
              icon={Search}
              title="Nenhum clube encontrado com esse filtro."
              action={
                hasFilter ? (
                  <Button type="button" variant="outline" onClick={clearFilters} className={outlineButton}>
                    Limpar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <ClubsTable rows={pageRows} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {shownLabel}
                </span>
                {totalPages > 1 ? (
                  <nav aria-label="Páginas da lista de clubes" className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={outlineButton}
                      disabled={currentPage <= 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={outlineButton}
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Próxima
                    </Button>
                  </nav>
                ) : null}
              </div>
            </>
          )}
        </>
      )}
    </PageContainer>
  )
}
