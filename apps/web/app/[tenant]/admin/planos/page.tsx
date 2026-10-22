'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Package, Plus } from 'lucide-react'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import { PageHeader } from '@/components/dashboard/page-header'
import { FilterSelect, SearchInput } from '@/components/dashboard/table-controls'
import { Button } from '@/components/ui/button'
import { OrphanPlanRow, PlanRow, PlanRowSkeleton } from '@/components/admin/planos/plan-list'
import { LoadErrorBox, PlanKpis } from '@/components/admin/planos/plan-ui'
import { usePlanStatusActions } from '@/components/admin/planos/plan-status-actions'
import { usePlanosData } from '@/components/admin/planos/use-planos-data'
import { useTenant } from '@/contexts/tenant-context'
import {
  PLAN_SORT_OPTIONS,
  PLAN_STATUS_FILTER_OPTIONS,
  filterAndSortPlans,
  orphanStats,
  planAudiences,
  statsForPlan,
  subscriptionsTotal,
  type PlanSortKey,
  type PlanStatusFilter,
} from '@/lib/adapters/planos'

/**
 * Produtos e Planos — a oferta do clube e quantas pessoas estão em cada plano.
 *
 * Planos vêm de `/rede/planos` (ativos e inativos) e os números de
 * `/faturamento/planos/estatisticas`. Estatística fora do ar não esconde a
 * lista: os números viram "—" com uma nota discreta.
 */
export default function PlanosPage() {
  const { tenant } = useTenant()
  const slug = tenant?.slug ?? ''
  const base = slug ? `/${slug}/admin/planos` : ''

  const { plans, stats } = usePlanosData(slug, { settings: false })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<PlanStatusFilter>('all')
  const [audience, setAudience] = useState('all')
  const [sort, setSort] = useState<PlanSortKey>('display')

  const list = useMemo(() => plans.data ?? [], [plans.data])
  const report = stats.data
  const visible = useMemo(
    () => filterAndSortPlans(list, report, { q: search, status, audience, sort }),
    [list, report, search, status, audience, sort],
  )
  const audiences = useMemo(() => planAudiences(list), [list])
  const orphan = orphanStats(report)
  const filtered = search.trim() !== '' || status !== 'all' || audience !== 'all'
  const activeCount = list.filter(plan => plan.status === 'active').length

  const actions = usePlanStatusActions({
    slug,
    onChanged: updated => plans.setData(list.map(plan => (plan.id === updated.id ? updated : plan))),
  })

  function clearFilters() {
    setSearch('')
    setStatus('all')
    setAudience('all')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos e Planos"
        description="Monte a oferta do clube e acompanhe quantas pessoas estão em cada plano."
      >
        <Button asChild className="h-11 gap-2 px-5">
          <Link href={`${base}/novo`}>
            <Plus className="size-4" aria-hidden="true" />
            Novo plano
          </Link>
        </Button>
      </PageHeader>

      <section aria-label="Indicadores do clube" className="space-y-2">
        <PlanKpis counters={report?.totals ?? null} loading={stats.loading && !report} />
        {stats.error && !stats.loading && (
          <p className="text-xs text-muted-foreground">
            Números indisponíveis agora: {stats.error}{' '}
            <button
              type="button"
              onClick={() => void stats.reload()}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Tentar de novo
            </button>
          </p>
        )}
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Buscar plano por nome, frase ou selo" />
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <FilterSelect
            label="Status"
            value={status}
            onChange={value => setStatus(value as PlanStatusFilter)}
            allLabel="Todos"
            options={PLAN_STATUS_FILTER_OPTIONS}
          />
          <FilterSelect
            label="Público"
            value={audience}
            onChange={setAudience}
            allLabel="Todos"
            options={audiences.map(item => ({ value: item, label: item }))}
          />
          <div className="col-span-2 sm:col-span-1">
            <FilterSelect
              label="Ordenar por"
              value={sort === 'display' ? 'all' : sort}
              onChange={value => setSort(value === 'all' ? 'display' : (value as PlanSortKey))}
              allLabel="Ordem da vitrine"
              options={PLAN_SORT_OPTIONS}
            />
          </div>
        </div>
      </div>

      {plans.error && !plans.data ? (
        <LoadErrorBox message={plans.error} onRetry={() => void plans.reload()} />
      ) : plans.loading && !plans.data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Carregando planos">
          <PlanRowSkeleton />
          <PlanRowSkeleton />
          <PlanRowSkeleton />
        </div>
      ) : list.length === 0 ? (
        <EmptyStateCard
          icon={Package}
          title="Nenhum plano cadastrado"
          description="Cadastre o primeiro plano do clube: preço, regras, coberturas e contrato. Ele aparece na vitrine assim que estiver ativo."
          action={
            <Button asChild className="gap-2">
              <Link href={`${base}/novo`}>
                <Plus className="size-4" aria-hidden="true" />
                Criar primeiro plano
              </Link>
            </Button>
          }
        />
      ) : (
        <section aria-label="Planos" className="space-y-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {filtered
              ? `${visible.length} de ${list.length} ${list.length === 1 ? 'plano' : 'planos'}`
              : `${list.length} ${list.length === 1 ? 'plano' : 'planos'} · ${activeCount} ${activeCount === 1 ? 'ativo' : 'ativos'}`}
          </p>
          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <p className="font-medium text-foreground">Nenhum plano com esses filtros</p>
              <Button variant="link" onClick={clearFilters} className="mt-1">
                Limpar filtros
              </Button>
            </div>
          ) : (
            visible.map(plan => {
              const counters = statsForPlan(report, plan.id)
              return (
                <PlanRow
                  key={plan.id}
                  plan={plan}
                  counters={counters}
                  totals={report?.totals ?? null}
                  href={`${base}/${plan.id}`}
                  working={actions.workingId === plan.id}
                  onToggleStatus={() => actions.requestToggle(plan, counters ? subscriptionsTotal(counters) : null)}
                />
              )
            })
          )}
          {orphan && !filtered && <OrphanPlanRow counters={orphan} totals={report?.totals ?? null} />}
        </section>
      )}

      {actions.dialogs}
    </div>
  )
}
