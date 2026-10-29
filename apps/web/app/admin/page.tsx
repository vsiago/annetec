'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Building2, LayoutDashboard, Plus, TrendingUp, Users, Wallet } from 'lucide-react'
import { Button } from '@/components/admin-platform/ui/button'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionHeading } from '@/components/admin-platform/ui/section-card'
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

/** Ícone de cada número do mês (a chave vem de `buildMonthKpis`). */
const KPI_ICONS: Record<string, ReactNode> = {
  revenue: <TrendingUp />,
  receivable: <Wallet />,
  clubs: <Building2 />,
  lives: <Users />,
}

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
    <PageContainer>
      <PageHeader
        title={
          now ? (
            `${greetingFor(now)}${firstName ? `, ${firstName}` : ''}`
          ) : (
            <span className="block h-8 w-56 animate-pulse rounded-md bg-accent" aria-hidden="true" />
          )
        }
        description={
          now ? (
            `${longDate(now)}.${ready ? ` ${pendingSentence(items.length)}` : ''}`
          ) : (
            <span className="block h-5 w-72 max-w-full animate-pulse rounded-md bg-accent" aria-hidden="true" />
          )
        }
        icon={LayoutDashboard}
        actions={
          <Button asChild className="h-11 rounded-[10px] px-4 text-sm font-semibold">
            <Link href="/admin/inquilinos/novo">
              <Plus aria-hidden="true" />
              Cadastrar clube
            </Link>
          </Button>
        }
      />

      {state.status === 'error' ? (
        <HomeError onRetry={reload} />
      ) : state.status === 'loading' || !now ? (
        <HomeLoading />
      ) : (
        <HomeContent data={state.data} extras={state.extras} items={items} now={now} />
      )}
    </PageContainer>
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
        <SectionHeading id="home-mes" title={`${capitalize(monthLongName(todayIso))} em números`} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          {monthKpis.map(kpi => (
            <KpiCard
              key={kpi.key}
              label={kpi.label}
              value={kpi.value}
              hint={kpi.hint}
              delta={kpi.delta}
              href={kpi.href}
              icon={KPI_ICONS[kpi.key]}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-6">
        <RevenueChartCard bars={bars} hasClubs={data.rows.length > 0} />
        <ClubHealthCard counts={data.overview.healthDistribution} attention={attention} />
      </div>
    </>
  )
}
