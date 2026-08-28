'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getActivityOverviewAction, listVisitorsAction } from '@/lib/actions/activity-api'
import { getInitials } from '@/lib/utils'
import type { ActivityEvent, ActivityOverview, OnlineVisitor, Visitor } from '@annetec/contracts'
import {
  Activity,
  AlertCircle,
  Eye,
  FileText,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Logs e Rastreabilidade
          </h1>
          <p className="text-muted-foreground">Visitas, atividade do sistema e quem está online agora</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Atualizado {timeAgo(lastUpdated.toISOString())}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => load()} disabled={isLoading || isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Visitantes hoje"
          value={overview?.visitorsToday}
          hint="Pessoas distintas, logadas ou não"
          icon={Users}
          colorClass="bg-blue-100 text-blue-600"
        />
        <StatCard
          label="Online agora"
          value={overview?.onlineCount}
          hint="Atividade nos últimos 5 min"
          icon={Radio}
          colorClass="bg-emerald-100 text-emerald-600"
          pulse
        />
        <StatCard
          label="Eventos hoje"
          value={overview?.eventsToday}
          hint="Páginas vistas + ações"
          icon={Activity}
          colorClass="bg-purple-100 text-purple-600"
        />
        <StatCard
          label="Páginas distintas hoje"
          value={overview?.topPages.length}
          hint="Rotas diferentes visitadas"
          icon={FileText}
          colorClass="bg-amber-100 text-amber-600"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Online agora */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              Online agora
            </CardTitle>
            <CardDescription>Atualiza sozinho a cada 20s</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading ? (
              <SkeletonRows />
            ) : !overview?.online.length ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Ninguém online no momento</p>
            ) : (
              overview.online.map(person => <OnlineRow key={person.key} person={person} />)
            )}
          </CardContent>
        </Card>

        {/* Páginas mais visitadas */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>Páginas mais visitadas hoje</CardTitle>
            <CardDescription>Por número de visualizações</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <SkeletonRows />
            ) : !overview?.topPages.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem dados ainda hoje</p>
            ) : (
              overview.topPages.map(page => (
                <div key={page.path} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs truncate max-w-[70%]" title={page.path}>
                      {page.path}
                    </span>
                    <span className="text-muted-foreground font-medium">{page.count}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(4, (page.count / maxPageCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Atividade recente */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Atividade recente</CardTitle>
          <CardDescription>Últimos 50 eventos — navegação e ações do sistema</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <SkeletonRows rows={6} />
          ) : !overview?.recentActivity.length ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma atividade registrada ainda</p>
          ) : (
            <ol className="relative border-l border-border ml-2 space-y-5 py-1">
              {overview.recentActivity.map(event => (
                <ActivityRow key={event.id} event={event} />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Visto por último */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Visto por último</CardTitle>
            <CardDescription>Todo mundo que já apareceu — logado ou anônimo</CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Pessoa</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Última página</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Primeira vez</th>
                  <th className="text-left py-3 px-6 text-sm font-medium text-muted-foreground">Visto por último</th>
                  <th className="text-right py-3 px-6 text-sm font-medium text-muted-foreground">Eventos</th>
                </tr>
              </thead>
              <tbody>
                {visitors.map(visitor => (
                  <tr key={visitor.key} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar className="h-9 w-9 bg-secondary">
                            <AvatarFallback className="bg-secondary text-white text-xs">
                              {visitor.actorName ? getInitials(visitor.actorName) : <UserRound className="h-4 w-4" />}
                            </AvatarFallback>
                          </Avatar>
                          {visitor.isOnline && (
                            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{visitor.actorName ?? 'Visitante anônimo'}</p>
                          <ActorBadge visitor={visitor} />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-6 text-sm font-mono text-xs text-muted-foreground max-w-[220px] truncate">
                      {visitor.lastPath}
                    </td>
                    <td className="py-3 px-6 text-sm text-muted-foreground">{timeAgo(visitor.firstSeenAt)}</td>
                    <td className="py-3 px-6 text-sm text-muted-foreground">{timeAgo(visitor.lastSeenAt)}</td>
                    <td className="py-3 px-6 text-sm text-right font-medium">{visitor.totalEvents}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isLoading && visitors.length === 0 && (
            <p className="text-sm text-muted-foreground py-12 text-center">Nenhum visitante encontrado</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  colorClass,
  pulse,
}: {
  label: string
  value: number | undefined
  hint: string
  icon: typeof Activity
  colorClass: string
  pulse?: boolean
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value ?? '—'}</p>
            <p className="text-sm text-muted-foreground mt-1">{hint}</p>
          </div>
          <div className={`p-3 rounded-lg ${colorClass} ${pulse ? 'animate-pulse' : ''}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function OnlineRow({ person }: { person: OnlineVisitor }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div className="relative">
        <Avatar className="h-9 w-9 bg-secondary">
          <AvatarFallback className="bg-secondary text-white text-xs">
            {person.actorName ? getInitials(person.actorName) : <UserRound className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{person.actorName ?? 'Visitante anônimo'}</p>
        <p className="text-xs text-muted-foreground truncate font-mono">{person.path}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
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
        className={`absolute -left-[7px] mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-4 ring-background ${
          isLogin ? 'bg-emerald-500' : isLogout ? 'bg-muted-foreground' : 'bg-blue-500'
        }`}
      />
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2 min-w-0">
          {isLogin ? (
            <LogIn className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : isLogout ? (
            <LogOut className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          ) : (
            <Eye className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className="text-sm">
              <span className="font-medium">{event.actorName ?? 'Visitante anônimo'}</span>{' '}
              <span className="text-muted-foreground">
                {isLogin ? 'entrou no sistema' : isLogout ? 'saiu do sistema' : 'visitou'}
              </span>{' '}
              {!isLogin && !isLogout && (
                <span className="font-mono text-xs text-muted-foreground">{event.path}</span>
              )}
            </p>
            {event.tenantSlug && <p className="text-xs text-muted-foreground">Inquilino: {event.tenantSlug}</p>}
          </div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">{timeAgo(event.createdAt)}</span>
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
      <Badge variant="outline" className="text-muted-foreground text-[11px]">
        <UserRound className="w-3 h-3 mr-1" /> Visitante
      </Badge>
    )
  }

  if (actorScope === 'platform') {
    return actorRole === 'superadmin' ? (
      <Badge className="bg-red-100 text-red-700 text-[11px]">
        <ShieldCheck className="w-3 h-3 mr-1" /> Superadmin
      </Badge>
    ) : (
      <Badge className="bg-red-100 text-red-700 text-[11px]">
        <Shield className="w-3 h-3 mr-1" /> Plataforma
      </Badge>
    )
  }

  const label = actorRole === 'admin' ? 'Admin' : actorRole === 'seller' ? 'Vendedor' : 'Associado'
  const colorClass =
    actorRole === 'admin'
      ? 'bg-blue-100 text-blue-700'
      : actorRole === 'seller'
        ? 'bg-purple-100 text-purple-700'
        : 'bg-green-100 text-green-700'

  return (
    <Badge className={`${colorClass} text-[11px]`}>
      {label}
      {tenantSlug ? ` · ${tenantSlug}` : ''}
    </Badge>
  )
}

function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 rounded-md bg-muted animate-pulse" />
      ))}
    </div>
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
