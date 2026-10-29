'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { listClubsOverviewAction } from '@/lib/actions/tenants-api'
import { ClubsTable, ClubsTableSkeleton } from '@/components/admin-platform/clubs/clubs-table'
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

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-secondary/40 focus-visible:ring-offset-2'
const primaryButton = cn(buttonBase, 'min-h-11 border border-secondary bg-secondary px-4 text-white hover:bg-secondary/90')
const secondaryButton = cn(
  buttonBase,
  'min-h-10 border border-[#D0D5DD] bg-white px-3.5 text-[#344054] hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:text-[#98A2B3] disabled:hover:bg-white',
)
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Clubes</h1>
          <p className="text-[15px] text-muted-foreground" aria-live="polite">
            {state.phase === 'ready' ? clubsSummary(rows.length, attentionTotal) : 'Carregando clubes…'}
          </p>
        </div>
        <Link href="/admin/inquilinos/novo" className={primaryButton}>
          <Plus className="size-[18px]" aria-hidden="true" />
          Cadastrar clube
        </Link>
      </header>

      {state.phase === 'error' ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-white p-7">
          <strong className="text-lg text-foreground">Não foi possível carregar esta página</strong>
          <span className="text-[15px] leading-relaxed text-muted-foreground">
            Verifique sua internet e tente de novo.
          </span>
          <button type="button" onClick={() => void load()} className={secondaryButton}>
            Tentar de novo
          </button>
        </div>
      ) : state.phase === 'loading' ? (
        <ClubsTableSkeleton />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-white p-7">
          <strong className="text-lg text-foreground">Nenhum clube por aqui ainda</strong>
          <span className="text-[15px] leading-relaxed text-muted-foreground">
            Cadastre o primeiro clube para começar a vender planos.
          </span>
          <Link href="/admin/inquilinos/novo" className={primaryButton}>
            Cadastrar clube
          </Link>
        </div>
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
            <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-white p-7">
              <strong className="text-lg text-foreground">Nenhum clube encontrado com esse filtro.</strong>
              {hasFilter ? (
                <button type="button" onClick={clearFilters} className={secondaryButton}>
                  Limpar filtros
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <ClubsTable rows={pageRows} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {shownLabel}
                </span>
                {totalPages > 1 ? (
                  <nav aria-label="Páginas da lista de clubes" className="flex gap-2">
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={currentPage <= 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={currentPage >= totalPages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Próxima
                    </button>
                  </nav>
                ) : null}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
