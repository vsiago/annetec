'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlatformAuth } from '@/contexts/platform-auth-context'
import { todaySaoPaulo } from '@/lib/adapters/holding'
import { ActionSection } from '@/components/admin-platform/home/action-cards'
import { ClubHealthCard } from '@/components/admin-platform/home/club-health'
import {
  type ActionItem,
  buildActionItems,
  buildAttentionClubs,
  buildMonthKpis,
  buildRevenueBars,
} from '@/components/admin-platform/home/derive'
import { capitalize, greetingFor, longDate, monthLongName, pendingSentence } from '@/components/admin-platform/home/format'
import { HomeError, HomeLoading } from '@/components/admin-platform/home/home-states'
import { RevenueChartCard } from '@/components/admin-platform/home/revenue-chart'
import { useHomeData, type HomeData, type HomeExtras } from '@/components/admin-platform/home/use-home-data'
import { KpiCard } from '@/components/admin-platform/ui/kpi-card'

/**
 * Início do console da plataforma. Responde a uma pergunta: "Como está o
 * negócio e o que precisa de mim hoje?". Ordem: o que pede ação, os números do
 * mês, a receita dos últimos 6 meses e a saúde dos clubes.
 */
export default function PlatformDashboard() {
  const { user } = usePlatformAuth()
  const { state, reload } = useHomeData()

  // Data e hora só existem no navegador: ler no efeito evita diferença entre o HTML do servidor e o da tela.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
  }, [state.status])

  const firstName = user?.name?.trim().split(/\s+/)[0]
  const ready = state.status === 'ready'
  const items = useMemo(
    () => (state.status === 'ready' && now ? buildActionItems(state.data, state.extras, now.getTime()) : []),
    [state, now],
  )

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          {now ? (
            <>
              <h1 className="m-0 text-[26px] font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
                {greetingFor(now)}
                {firstName ? `, ${firstName}` : ''}
              </h1>
              <p className="m-0 text-[15px] text-muted-foreground">
                {longDate(now)}.{ready ? ` ${pendingSentence(items.length)}` : ''}
              </p>
            </>
          ) : (
            <>
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-5 w-72" />
            </>
          )}
        </div>
        <Button
          asChild
          className="h-11 rounded-[10px] bg-secondary px-4 text-sm font-semibold text-white hover:bg-secondary/90"
        >
          <Link href="/admin/inquilinos/novo">
            <Plus aria-hidden="true" />
            Cadastrar clube
          </Link>
        </Button>
      </header>

      {state.status === 'error' ? (
        <HomeError onRetry={reload} />
      ) : state.status === 'loading' || !now ? (
        <HomeLoading />
      ) : (
        <HomeContent data={state.data} extras={state.extras} items={items} now={now} />
      )}
    </div>
  )
}

function HomeContent({
  data,
  extras,
  items,
  now,
}: {
  data: HomeData
  extras: HomeExtras | null
  items: ActionItem[]
  now: Date
}) {
  const todayIso = extras?.today ?? todaySaoPaulo(now)
  const monthKpis = useMemo(() => buildMonthKpis(data, extras, todayIso), [data, extras, todayIso])
  const bars = useMemo(() => buildRevenueBars(data), [data])
  const attention = useMemo(() => buildAttentionClubs(data.rows), [data.rows])

  return (
    <>
      <ActionSection items={items} />

      <section aria-labelledby="home-mes" className="flex flex-col gap-4">
        <h2 id="home-mes" className="m-0 text-lg font-bold text-foreground">
          {capitalize(monthLongName(todayIso))} em números
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {monthKpis.map(kpi => (
            <KpiCard
              key={kpi.key}
              label={kpi.label}
              value={kpi.value}
              hint={kpi.hint}
              delta={kpi.delta}
              href={kpi.href}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-4">
        <RevenueChartCard bars={bars} />
        <ClubHealthCard counts={data.overview.healthDistribution} attention={attention} />
      </div>
    </>
  )
}
