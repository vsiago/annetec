'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, ChevronDown, Search, UsersRound } from 'lucide-react'
import {
  CLUB_SUBSCRIPTION_STATUS_LABELS,
  DEPENDENT_RELATIONSHIP_LABELS,
  formatBRL,
  formatDateBR,
  maskCpfPartially,
  type ClubPlanStatsCounters,
  type ClubSubscription,
  type ClubSubscriptionStatus,
} from '@annetec/contracts'
import { EmptyState } from '@/components/dashboard/empty-state'
import { TableFooter } from '@/components/dashboard/table-controls'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { listClubSubscriptionsAction } from '@/lib/actions/faturamento-api'
import { PEOPLE_STATUS_FILTERS, formatInt, type PeopleStatusFilter } from '@/lib/adapters/planos'
import { cn } from '@/lib/utils'
import { LoadErrorBox, Panel } from './plan-ui'
import { useAsyncResult, useDebouncedValue } from './use-planos-data'

const STATUS_TONE: Record<ClubSubscriptionStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  past_due: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  suspended: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  pending_payment: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  canceled: 'bg-muted text-muted-foreground',
}

const COLUMNS = 8

/**
 * Quem está no plano — `GET /faturamento/assinaturas?planId=&status=&q=`.
 * Contagem por status vem das estatísticas do plano; a ficha completa (e as
 * ações de cobrança) continuam em Cadastros.
 */
export function PlanPeopleTab({
  slug,
  planId,
  counters,
}: {
  slug: string
  planId: string
  /** Contagens por status do plano; `null` = estatística indisponível (sem números nos filtros). */
  counters: ClubPlanStatsCounters | null
}) {
  const [status, setStatus] = useState<PeopleStatusFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState('10')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const q = useDebouncedValue(search.trim(), 300)

  useEffect(() => {
    setPage(1)
  }, [q, status, perPage])

  const list = useAsyncResult(
    slug
      ? () =>
          listClubSubscriptionsAction(slug, {
            planId,
            page,
            perPage: Number(perPage),
            q: q || undefined,
            status: status === 'all' ? undefined : status,
          })
      : null,
    [slug, planId, page, perPage, q, status],
  )

  const rows = list.data?.items ?? []
  const total = list.data?.meta.total ?? 0
  const base = `/${slug}/admin/cadastros`
  const filtered = status !== 'all' || q !== ''

  function toggle(id: string) {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Panel bodyClassName="p-0 sm:p-0">
      <div className="space-y-4 p-5 sm:p-6">
        <div
          role="radiogroup"
          aria-label="Filtrar por status"
          className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        >
          {PEOPLE_STATUS_FILTERS.map(option => {
            const selected = status === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setStatus(option.value)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                  selected
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {option.label}
                {counters && (
                  <span className={cn('text-xs tabular-nums', selected ? 'text-background/70' : 'text-muted-foreground')}>
                    {formatInt(option.count(counters))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <div className="relative sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar por nome, CPF, e-mail ou carteirinha"
            aria-label="Buscar pessoas do plano"
            className="h-10 rounded-xl pl-10"
          />
        </div>
      </div>

      {list.error ? (
        <div className="px-5 pb-6 sm:px-6">
          <LoadErrorBox message={list.error} onRetry={() => void list.reload()} />
        </div>
      ) : list.loading && !list.data ? (
        <PeopleSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={filtered ? 'Ninguém com esse filtro' : 'Ninguém neste plano ainda'}
          description={
            filtered
              ? 'Troque o status ou a busca para ver outras pessoas.'
              : 'As adesões pelo checkout aparecem aqui assim que a assinatura é criada.'
          }
          className="border-t border-border/60"
        />
      ) : (
        <div className={cn('overflow-x-auto border-t border-border/60 transition-opacity', list.loading && 'opacity-60')}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium sm:px-6">Titular</th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">CPF</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Dependentes</th>
                <th scope="col" className="hidden px-4 py-3 font-medium lg:table-cell">Carteirinha</th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Desde</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Mensalidade</th>
                <th scope="col" className="px-4 py-3 sm:pr-6">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(subscription => (
                <PersonRow
                  key={subscription.id}
                  subscription={subscription}
                  expanded={expanded.has(subscription.id)}
                  onToggle={() => toggle(subscription.id)}
                  fichaHref={`${base}?assinatura=${encodeURIComponent(subscription.id)}`}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!list.error && total > 0 && (
        <TableFooter
          page={page}
          perPage={perPage}
          total={total}
          noun="assinaturas"
          onPageChange={setPage}
          onPerPageChange={setPerPage}
        />
      )}
      <div className="flex justify-end border-t border-border/60 px-5 py-3 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href={`${base}?plano=${encodeURIComponent(planId)}`}>
            Ver todos em Cadastros
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Panel>
  )
}

function PersonRow({
  subscription,
  expanded,
  onToggle,
  fichaHref,
}: {
  subscription: ClubSubscription
  expanded: boolean
  onToggle: () => void
  fichaHref: string
}) {
  const dependents = subscription.dependents ?? []
  const since = subscription.startedAt ?? subscription.createdAt
  const detailsId = `dependentes-${subscription.id}`
  return (
    <Fragment>
      <tr className={cn('border-b border-border/60 last:border-0', expanded && 'border-b-0')}>
        <td className="max-w-64 px-5 py-3 sm:px-6">
          <p className="truncate font-medium text-foreground">{subscription.holder.name}</p>
          <p className="truncate text-xs text-muted-foreground">{subscription.holder.email}</p>
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground md:table-cell">
          {maskCpfPartially(subscription.holder.cpf) || '—'}
        </td>
        <td className="px-4 py-3">
          <span
            className={cn(
              'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
              STATUS_TONE[subscription.status] ?? STATUS_TONE.canceled,
            )}
          >
            {CLUB_SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status}
          </span>
        </td>
        <td className="px-4 py-3">
          {dependents.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={detailsId}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {dependents.length}
              <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
              <span className="sr-only">{expanded ? 'Esconder dependentes' : 'Ver dependentes'}</span>
            </button>
          )}
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground lg:table-cell">
          {subscription.cardNumber ?? '—'}
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground md:table-cell">
          {since ? formatDateBR(since) : '—'}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-foreground">
          {formatBRL(subscription.amount)}
        </td>
        <td className="px-4 py-3 text-right sm:pr-6">
          <Button asChild variant="ghost" size="sm" className="gap-1 whitespace-nowrap">
            <Link href={fichaHref} aria-label={`Abrir ficha de ${subscription.holder.name}`}>
              <span className="hidden sm:inline">Abrir ficha</span>
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </td>
      </tr>
      {expanded && dependents.length > 0 && (
        <tr id={detailsId} className="border-b border-border/60">
          <td colSpan={COLUMNS} className="bg-muted/30 px-5 py-3 sm:px-6">
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {dependents.map(dependent => (
                <li key={dependent.id} className="min-w-0 text-sm">
                  <p className="truncate font-medium text-foreground">{dependent.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {DEPENDENT_RELATIONSHIP_LABELS[dependent.relationship] ?? dependent.relationship}
                    {dependent.cardNumber ? ` · ${dependent.cardNumber}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

function PeopleSkeleton() {
  return (
    <div className="space-y-4 border-t border-border/60 p-5 sm:p-6" aria-busy="true" aria-label="Carregando pessoas">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}
