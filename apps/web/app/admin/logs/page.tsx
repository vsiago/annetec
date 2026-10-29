'use client'

import { useCallback, useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/admin-platform/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageContainer } from '@/components/admin-platform/ui/page-container'
import { PageHeader } from '@/components/admin-platform/ui/page-header'
import { SectionCard, SectionSkeleton } from '@/components/admin-platform/ui/section-card'
import { EmptyState, ErrorState } from '@/components/admin-platform/ui/empty-state'
import { DataTable, Td, Th, Tr } from '@/components/admin-platform/ui/data-table'
import { KpiCard } from '@/components/admin-platform/ui/kpi-card'
import { StatusPill } from '@/components/admin-platform/ui/status-pill'
import { getActivityOverviewAction, listVisitorsAction } from '@/lib/actions/activity-api'
import { cn, getInitials } from '@/lib/utils'
import type { ActivityEvent, ActivityOverview, OnlineVisitor, Visitor } from '@annetec/contracts'
import {
  Activity,
  Eye,
  FileText,
  History,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  UserRound,
  Users,
  Radio,
} from 'lucide-react'

const REFRESH_MS = 20_000

export default function LogsPage() {
  const [overview, setOverview] = useState<ActivityOverview | null>(null)
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setIsLoading(true)
    else setIsRefreshing(true)
    setError('')

    const [overviewResult, visitorsResult] = await Promise.all([
      getActivityOverviewAction(),
      listVisitorsAction(search || undefined),
    ])

    if (overviewResult.success) setOverview(overviewResult.data)
    else setError(overviewResult.error)

    if (visitorsResult.success) setVisitors(visitorsResult.data)

    setLastUpdated(new Date())
    setIsLoading(false)
    setIsRefreshing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const interval = setInterval(() => load({ silent: true }), REFRESH_MS)
    return () => clearInterval(interval)
  }, [load])

  const maxPageCount = Math.max(1, ...(overview?.topPages.map(p => p.count) ?? [1]))
  // Esqueleto só na primeira carga: nas seguintes (busca, "Atualizar") a tela
  // mantém os números anteriores em vez de piscar.
  const firstLoad = isLoading && !overview

  return (
    <PageContainer>
      <PageHeader
        icon={Activity}
        title="Acessos ao sistema"
        description="Quem está usando o sistema agora, o que visitou e o que fez."
        actions={
          <>
            {lastUpdated && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                Atualizado {timeAgo(lastUpdated.toISOString())}
              </span>
            )}
            <Button
              variant="outline"
              className="h-11 rounded-[10px] px-4 font-semibold"
              onClick={() => load()}
              disabled={isLoading || isRefreshing}
            >
              <RefreshCw className={cn(isRefreshing && 'animate-spin')} aria-hidden="true" />
              Atualizar
            </Button>
          </>
        }
      />

      {error && (
        <ErrorState
          size="sm"
          title={overview ? 'Não foi possível atualizar' : 'Não foi possível carregar os acessos'}
          description={error}
          onRetry={() => load()}
        />
      )}

      {(overview || !error) && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Visitantes hoje"
              value={<StatValue value={overview?.visitorsToday} loading={firstLoad} />}
              hint="Pessoas distintas, logadas ou não"
              icon={<Users />}
            />
            <KpiCard
              label="Online agora"
              value={<StatValue value={overview?.onlineCount} loading={firstLoad} />}
              hint="Atividade nos últimos 5 min"
              icon={<Radio className="text-[#067647] motion-safe:animate-pulse" />}
            />
            <KpiCard
              label="Eventos hoje"
              value={<StatValue value={overview?.eventsToday} loading={firstLoad} />}
              hint="Páginas vistas + ações"
              icon={<Activity />}
            />
            <KpiCard
              label="Páginas diferentes hoje"
              value={<StatValue value={overview?.topPages.length} loading={firstLoad} />}
              hint="Páginas diferentes visitadas"
              icon={<FileText />}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard icon={Radio} title="Online agora" description="Atualiza sozinho a cada 20s">
              {firstLoad ? (
                <SectionSkeleton rows={4} label="Carregando quem está online…" />
              ) : !overview?.online.length ? (
                <EmptyState size="sm" icon={Users} title="Ninguém online agora." />
              ) : (
                <div className="flex flex-col">
                  {overview.online.map(person => (
                    <OnlineRow key={person.key} person={person} />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard icon={FileText} title="Páginas mais visitadas hoje" description="Por número de visualizações">
              {firstLoad ? (
                <SectionSkeleton rows={4} label="Carregando as páginas mais visitadas…" />
              ) : !overview?.topPages.length ? (
                <EmptyState size="sm" icon={FileText} title="Nenhuma página visitada hoje ainda." />
              ) : (
                <div className="flex flex-col gap-4">
                  {overview.topPages.map(page => (
                    <div key={page.path} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="max-w-[70%] truncate font-mono text-xs text-foreground" title={page.path}>
                          {page.path}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground">{page.count}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div
                          className="h-full rounded-full bg-secondary"
                          style={{ width: `${Math.max(4, (page.count / maxPageCount) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard icon={History} title="Atividade recente" description="Últimos 50 eventos — navegação e ações do sistema">
            {firstLoad ? (
              <SectionSkeleton rows={6} label="Carregando a atividade recente…" />
            ) : !overview?.recentActivity.length ? (
              <EmptyState size="sm" icon={History} title="Nenhuma atividade registrada ainda." />
            ) : (
              <ol className="relative m-0 ml-2 list-none space-y-5 border-l border-border p-0 py-1">
                {overview.recentActivity.map(event => (
                  <ActivityRow key={event.id} event={event} />
                ))}
              </ol>
            )}
          </SectionCard>

          <SectionCard
            padded={false}
            icon={UserRound}
            title="Visto por último"
            description="Todo mundo que já apareceu — logado ou anônimo"
            actions={
              <div className="relative w-full sm:w-64">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  placeholder="Buscar por nome"
                  aria-label="Buscar visitante por nome"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-11 rounded-[10px] pl-10"
                />
              </div>
            }
          >
            {isLoading && visitors.length === 0 ? (
              <div className="p-6">
                <SectionSkeleton rows={5} label="Carregando visitantes…" />
              </div>
            ) : visitors.length === 0 ? (
              <EmptyState
                icon={search ? Search : Users}
                title="Nenhum visitante encontrado."
                description={search ? 'Confira o nome digitado ou limpe a busca.' : undefined}
              />
            ) : (
              <div className={cn('transition-opacity', isLoading && 'opacity-60')}>
                <DataTable
                  framed={false}
                  caption="Visitantes do sistema, do visto mais recentemente ao mais antigo"
                  minWidth="min-w-[760px]"
                >
                  <thead>
                    <tr>
                      <Th>Pessoa</Th>
                      <Th>Última página</Th>
                      <Th>Primeira vez</Th>
                      <Th>Visto por último</Th>
                      <Th align="right">Eventos</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitors.map(visitor => (
                      <Tr key={visitor.key}>
                        <Td>
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Avatar className="h-9 w-9 bg-secondary">
                                <AvatarFallback className="bg-secondary text-xs text-white">
                                  {visitor.actorName ? (
                                    getInitials(visitor.actorName)
                                  ) : (
                                    <UserRound className="size-4" aria-hidden="true" />
                                  )}
                                </AvatarFallback>
                              </Avatar>
                              {visitor.isOnline && (
                                <span
                                  className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-emerald-500"
                                  role="img"
                                  aria-label="Online agora"
                                />
                              )}
                            </div>
                            <div className="flex flex-col items-start gap-1">
                              <p className="m-0 text-sm font-medium text-foreground">{visitor.actorName ?? 'Visitante anônimo'}</p>
                              <ActorBadge visitor={visitor} />
                            </div>
                          </div>
                        </Td>
                        <Td className="max-w-[220px] truncate font-mono text-xs text-muted-foreground" title={visitor.lastPath}>
                          {visitor.lastPath}
                        </Td>
                        <Td className="text-sm text-muted-foreground">{timeAgo(visitor.firstSeenAt)}</Td>
                        <Td className="text-sm text-muted-foreground">{timeAgo(visitor.lastSeenAt)}</Td>
                        <Td align="right" className="text-sm font-medium tabular-nums">
                          {visitor.totalEvents}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </PageContainer>
  )
}

/** Número do KpiCard: esqueleto na primeira carga, traço quando não há dado. */
function StatValue({ value, loading }: { value: number | undefined; loading: boolean }) {
  if (loading) {
    return (
      <span role="status" className="inline-block h-8 w-16 animate-pulse rounded-lg bg-muted align-middle">
        <span className="sr-only">Carregando…</span>
      </span>
    )
  }
  return <>{value ?? '—'}</>
}

function OnlineRow({ person }: { person: OnlineVisitor }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-3 first:pt-0 last:border-0 last:pb-0">
      <div className="relative">
        <Avatar className="h-9 w-9 bg-secondary">
          <AvatarFallback className="bg-secondary text-xs text-white">
            {person.actorName ? getInitials(person.actorName) : <UserRound className="size-4" aria-hidden="true" />}
          </AvatarFallback>
        </Avatar>
        <span
          className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-emerald-500"
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-sm font-medium text-foreground">{person.actorName ?? 'Visitante anônimo'}</p>
        <p className="m-0 truncate font-mono text-xs text-muted-foreground">{person.path}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <ActorBadge visitor={person} />
        <span className="text-[11px] text-muted-foreground">{timeAgo(person.lastSeenAt)}</span>
      </div>
    </div>
  )
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const isLogin = event.kind === 'action' && event.action === 'login'
  const isLogout = event.kind === 'action' && event.action === 'logout'

  return (
    <li className="ml-4">
      <span
        className={cn(
          'absolute -left-[7px] mt-1 flex size-3.5 items-center justify-center rounded-full ring-4 ring-card',
          isLogin ? 'bg-emerald-500' : isLogout ? 'bg-muted-foreground' : 'bg-blue-500',
        )}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2">
          {isLogin ? (
            <LogIn className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : isLogout ? (
            <LogOut className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <Eye className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="m-0 text-sm">
              <span className="font-medium text-foreground">{event.actorName ?? 'Visitante anônimo'}</span>{' '}
              <span className="text-muted-foreground">
                {isLogin ? 'entrou no sistema' : isLogout ? 'saiu do sistema' : 'visitou'}
              </span>{' '}
              {!isLogin && !isLogout && <span className="break-all font-mono text-xs text-muted-foreground">{event.path}</span>}
            </p>
            {event.tenantSlug && <p className="m-0 text-xs text-muted-foreground">Clube: {event.tenantSlug}</p>}
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{timeAgo(event.createdAt)}</span>
      </div>
    </li>
  )
}

function ActorBadge({
  visitor,
}: {
  visitor: { actorScope: string | null; actorRole: string | null; tenantSlug: string | null }
}) {
  const { actorScope, actorRole, tenantSlug } = visitor

  if (!actorScope) {
    return (
      <StatusPill tone="neutral" icon={<UserRound />}>
        Visitante
      </StatusPill>
    )
  }

  if (actorScope === 'platform') {
    return actorRole === 'superadmin' ? (
      <StatusPill tone="danger" icon={<ShieldCheck />}>
        Superadmin
      </StatusPill>
    ) : (
      <StatusPill tone="danger" icon={<Shield />}>
        Plataforma
      </StatusPill>
    )
  }

  const label = actorRole === 'admin' ? 'Admin' : actorRole === 'seller' ? 'Vendedor' : 'Associado'
  const tone = actorRole === 'admin' ? 'info' : actorRole === 'seller' ? 'neutral' : 'success'

  return (
    <StatusPill tone={tone}>
      {label}
      {tenantSlug ? ` · ${tenantSlug}` : ''}
    </StatusPill>
  )
}

function timeAgo(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 5) return 'agora mesmo'
  if (diffSec < 60) return `há ${diffSec}s`
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `há ${min}min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `há ${hr}h`
  const day = Math.floor(hr / 24)
  return `há ${day}d`
}
