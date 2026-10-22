'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ExternalLink, Link2, LoaderCircle, PackageSearch, Pencil, Power, PowerOff, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyStateCard } from '@/components/dashboard/empty-state'
import { SectionTab, SectionTabsList } from '@/components/dashboard/section-tabs'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { PlanCoveragesTab, PlanOverviewTab, PlanRulesTab } from '@/components/admin/planos/plan-detail-tabs'
import { PlanPeopleTab } from '@/components/admin/planos/plan-people-tab'
import { usePlanStatusActions } from '@/components/admin/planos/plan-status-actions'
import { LoadErrorBox, PlanBadgeChip, PlanKpis, PlanStatusBadge } from '@/components/admin/planos/plan-ui'
import { copyText, usePlanosData } from '@/components/admin/planos/use-planos-data'
import { useTenant } from '@/contexts/tenant-context'
import { formatInt, planBadge, statsForPlan, subscriptionsTotal } from '@/lib/adapters/planos'

const TABS = [
  { value: 'visao-geral', label: 'Visão geral' },
  { value: 'coberturas', label: 'Coberturas' },
  { value: 'regras', label: 'Regras' },
  { value: 'pessoas', label: 'Pessoas' },
] as const

type TabValue = (typeof TABS)[number]['value']

export default function PlanoDetailPage() {
  // `useSearchParams` precisa de Suspense acima dele no App Router.
  return (
    <Suspense fallback={null}>
      <PlanoDetail />
    </Suspense>
  )
}

function PlanoDetail() {
  const { tenant } = useTenant()
  const slug = tenant?.slug ?? ''
  const params = useParams<{ id: string }>()
  const id = params?.id ?? ''
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const listHref = `/${slug}/admin/planos`

  const [tab, setTab] = useState<TabValue>(() => {
    const requested = search.get('aba')
    return TABS.some(item => item.value === requested) ? (requested as TabValue) : 'visao-geral'
  })

  const { plans, stats, settings } = usePlanosData(slug)
  const plan = plans.data?.find(item => item.id === id) ?? null
  const counters = statsForPlan(stats.data, id)
  const subscriptions = counters ? subscriptionsTotal(counters) : null
  const enabledMethods = settings.data?.enabledMethods ?? null

  const actions = usePlanStatusActions({
    slug,
    onChanged: updated => plans.setData((plans.data ?? []).map(item => (item.id === updated.id ? updated : item))),
    onDeleted: () => router.push(listHref),
  })

  /**
   * A aba troca na hora (estado local) e só depois vai para a URL (`?aba=`),
   * via `history.replaceState` — o Next sincroniza com `useSearchParams` sem
   * rebuscar a página no servidor, como faria um `router.replace`.
   */
  function changeTab(value: string) {
    if (!TABS.some(item => item.value === value)) return
    setTab(value as TabValue)
    const next = new URLSearchParams(window.location.search)
    if (value === 'visao-geral') next.delete('aba')
    else next.set('aba', value)
    const query = next.toString()
    window.history.replaceState(null, '', query ? `${pathname}?${query}` : pathname)
  }

  async function copyCheckoutLink() {
    if (!plan) return
    const url = `${window.location.origin}/${slug}/assinar?plano=${encodeURIComponent(plan.id)}`
    const ok = await copyText(url)
    if (!ok) {
      toast.error('Não foi possível copiar', { description: url })
      return
    }
    toast.success('Link de contratação copiado', {
      description: plan.status === 'active' ? url : 'O plano está inativo: o link só funciona depois de ativar.',
    })
  }

  if (plans.error && !plans.data) {
    return (
      <div className="space-y-6">
        <BackLink href={listHref} />
        <LoadErrorBox message={plans.error} onRetry={() => void plans.reload()} />
      </div>
    )
  }

  if (plans.loading && !plans.data) return <DetailSkeleton listHref={listHref} />

  if (!plan) {
    return (
      <div className="space-y-6">
        <BackLink href={listHref} />
        <EmptyStateCard
          icon={PackageSearch}
          title="Plano não encontrado"
          description="Ele pode ter sido excluído. Volte à lista para ver os planos do clube."
          action={
            <Button asChild variant="outline">
              <Link href={listHref}>Ver todos os planos</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const badge = planBadge(plan)
  const active = plan.status === 'active'
  const editHref = `${listHref}/${plan.id}/editar`
  const working = actions.workingId === plan.id

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <BackLink href={listHref} />
        <div className="flex flex-col gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground xl:text-3xl">{plan.name}</h1>
              <PlanStatusBadge status={plan.status} />
              {badge && <PlanBadgeChip label={badge} />}
            </div>
            {(plan.tagline || plan.audience) && (
              <p className="max-w-2xl text-sm text-muted-foreground">{plan.tagline ?? plan.audience}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="gap-2">
              <Link href={editHref}>
                <Pencil className="size-4" aria-hidden="true" />
                Editar
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={working}
              onClick={() => actions.requestToggle(plan, subscriptions)}
            >
              {working ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : active ? (
                <PowerOff className="size-4" aria-hidden="true" />
              ) : (
                <Power className="size-4" aria-hidden="true" />
              )}
              {active ? 'Inativar' : 'Ativar'}
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <a href={`/${slug}/planos`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden="true" />
                Ver na vitrine
              </a>
            </Button>
            <Button type="button" variant="outline" className="gap-2" onClick={() => void copyCheckoutLink()}>
              <Link2 className="size-4" aria-hidden="true" />
              Copiar link de contratação
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => actions.requestDelete(plan, subscriptions)}
              aria-label={`Excluir ${plan.name}`}
              title="Excluir plano"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <section aria-label={`Indicadores do plano ${plan.name}`} className="space-y-2">
        <PlanKpis counters={counters} loading={stats.loading && !stats.data} />
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

      <Tabs value={tab} onValueChange={changeTab} className="gap-6">
        <SectionTabsList>
          <SectionTab value="visao-geral">Visão geral</SectionTab>
          <SectionTab value="coberturas" badge={(plan.coverages ?? []).length || undefined}>
            Coberturas
          </SectionTab>
          <SectionTab value="regras">Regras</SectionTab>
          <SectionTab value="pessoas" badge={subscriptions !== null ? formatInt(subscriptions) : undefined}>
            Pessoas
          </SectionTab>
        </SectionTabsList>

        <TabsContent value="visao-geral" className="m-0">
          <PlanOverviewTab plan={plan} enabledMethods={enabledMethods} editHref={editHref} />
        </TabsContent>
        <TabsContent value="coberturas" className="m-0">
          <PlanCoveragesTab plan={plan} editHref={editHref} />
        </TabsContent>
        <TabsContent value="regras" className="m-0">
          <PlanRulesTab plan={plan} enabledMethods={enabledMethods} editHref={editHref} />
        </TabsContent>
        <TabsContent value="pessoas" className="m-0">
          <PlanPeopleTab slug={slug} planId={plan.id} counters={counters} />
        </TabsContent>
      </Tabs>

      {actions.dialogs}
    </div>
  )
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Produtos e Planos
    </Link>
  )
}

function DetailSkeleton({ listHref }: { listHref: string }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando plano">
      <BackLink href={listHref} />
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  )
}
