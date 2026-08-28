import type { ActivityEvent, ActivityOverview, OnlineVisitor, TrackEventInput, Visitor } from '@annetec/contracts'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { activityEvents } from '@/db/schema'

/** Alguém sem evento nos últimos 5 minutos não conta mais como "online". */
const ONLINE_WINDOW_MS = 5 * 60 * 1000
const RECENT_FEED_LIMIT = 50
const TOP_PAGES_LIMIT = 8

export interface RecordEventActor {
  userId?: string | null
  name?: string | null
  scope?: 'platform' | 'tenant' | null
  role?: string | null
  tenantId?: string | null
  tenantSlug?: string | null
}

/**
 * Rastreabilidade. `record` é chamado de dois lugares: o middleware do Next
 * (`POST /api/v1/activity/events`, uma linha por navegação) e, internamente,
 * pelo `authService` a cada login/logout — sempre via `runInBackground`,
 * nunca atrasando a resposta de verdade.
 *
 * "Online agora" e "visto por último" são derivados por SQL agregando por
 * `coalesce(actor_user_id, visitor_id)` — a chave de uma pessoa, logada ou
 * não. Sem tabela própria de presença: um evento recente já é a prova de que
 * alguém está ali.
 */
export const activityService = {
  async record(
    input: TrackEventInput,
    actor: RecordEventActor,
    meta: { ip: string | null; userAgent: string | null },
  ): Promise<void> {
    await db.insert(activityEvents).values({
      kind: input.kind,
      visitorId: input.visitorId ?? null,
      actorUserId: actor.userId ?? null,
      actorName: actor.name ?? null,
      actorScope: actor.scope ?? null,
      actorRole: actor.role ?? null,
      tenantId: actor.tenantId ?? null,
      tenantSlug: actor.tenantSlug ?? null,
      path: input.path,
      action: input.action ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
    })
  },

  async overview(): Promise<ActivityOverview> {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS)

    const [visitorsTodayRows, eventsTodayRows, topPagesRows, recentRows, onlineRows] = await Promise.all([
      db
        .select({
          value: sql<string>`count(distinct coalesce(${activityEvents.actorUserId}, ${activityEvents.visitorId}))`,
        })
        .from(activityEvents)
        .where(gte(activityEvents.createdAt, startOfDay)),
      db
        .select({ value: sql<string>`count(*)` })
        .from(activityEvents)
        .where(gte(activityEvents.createdAt, startOfDay)),
      db
        .select({ path: activityEvents.path, count: sql<string>`count(*)` })
        .from(activityEvents)
        .where(and(eq(activityEvents.kind, 'page_view'), gte(activityEvents.createdAt, startOfDay)))
        .groupBy(activityEvents.path)
        .orderBy(desc(sql`count(*)`))
        .limit(TOP_PAGES_LIMIT),
      db
        .select()
        .from(activityEvents)
        .orderBy(desc(activityEvents.createdAt))
        .limit(RECENT_FEED_LIMIT),
      queryVisitors({ onlineSince }),
    ])

    return {
      visitorsToday: Number(visitorsTodayRows[0]?.value ?? 0),
      eventsToday: Number(eventsTodayRows[0]?.value ?? 0),
      onlineCount: onlineRows.length,
      topPages: topPagesRows.map(row => ({ path: row.path, count: Number(row.count) })),
      recentActivity: recentRows.map(toActivityEvent),
      online: onlineRows.map(toOnlineVisitor),
    }
  },

  async listVisitors(search?: string): Promise<Visitor[]> {
    const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS)
    const rows = await queryVisitors({ onlineSince, search })
    return rows.map(row => toVisitor(row, onlineSince))
  },
}

interface VisitorRow {
  key: string
  actor_name: string | null
  actor_scope: string | null
  actor_role: string | null
  tenant_slug: string | null
  last_path: string
  first_seen_at: Date
  last_seen_at: Date
  total_events: string
}

/**
 * Uma linha por pessoa (chave = usuário logado ou `visitorId` anônimo), com
 * o último evento (nome/papel/página) e os agregados (primeira/última vez,
 * total). `onlineSince` filtra pra só quem teve atividade na janela — usado
 * tanto pro overview (`online`) quanto, sem filtro, pra lista completa.
 */
async function queryVisitors(params: { onlineSince?: Date; search?: string }): Promise<VisitorRow[]> {
  const searchFilter = params.search
    ? sql`and last_row.actor_name ilike ${'%' + params.search + '%'}`
    : sql``
  const onlineFilter = params.onlineSince
    ? sql`having max(events.created_at) >= ${params.onlineSince.toISOString()}`
    : sql``

  const result = await db.execute(sql`
    with events as (
      select
        coalesce(actor_user_id, visitor_id, 'unknown') as key,
        actor_name, actor_scope, actor_role, tenant_slug, path, created_at
      from activity_events
    ),
    agg as (
      select key, min(created_at) as first_seen_at, max(created_at) as last_seen_at, count(*) as total_events
      from events
      group by key
      ${onlineFilter}
    ),
    last_row as (
      select distinct on (key) key, actor_name, actor_scope, actor_role, tenant_slug, path as last_path
      from events
      order by key, created_at desc
    )
    select agg.key, last_row.actor_name, last_row.actor_scope, last_row.actor_role, last_row.tenant_slug,
           last_row.last_path, agg.first_seen_at, agg.last_seen_at, agg.total_events
    from agg
    join last_row using (key)
    where 1 = 1 ${searchFilter}
    order by agg.last_seen_at desc
  `)

  return Array.from(result) as unknown as VisitorRow[]
}

function toVisitor(row: VisitorRow, onlineSince: Date): Visitor {
  return {
    key: row.key,
    actorName: row.actor_name,
    actorScope: row.actor_scope as Visitor['actorScope'],
    actorRole: row.actor_role as Visitor['actorRole'],
    tenantSlug: row.tenant_slug,
    lastPath: row.last_path,
    firstSeenAt: new Date(row.first_seen_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    totalEvents: Number(row.total_events),
    isOnline: new Date(row.last_seen_at) >= onlineSince,
  }
}

function toOnlineVisitor(row: VisitorRow): OnlineVisitor {
  return {
    key: row.key,
    actorName: row.actor_name,
    actorScope: row.actor_scope as OnlineVisitor['actorScope'],
    actorRole: row.actor_role as OnlineVisitor['actorRole'],
    tenantSlug: row.tenant_slug,
    path: row.last_path,
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
  }
}

type EventRow = typeof activityEvents.$inferSelect

function toActivityEvent(row: EventRow): ActivityEvent {
  return {
    id: row.id,
    kind: row.kind as ActivityEvent['kind'],
    actorName: row.actorName,
    actorScope: row.actorScope as ActivityEvent['actorScope'],
    actorRole: row.actorRole as ActivityEvent['actorRole'],
    tenantSlug: row.tenantSlug,
    path: row.path,
    action: row.action,
    createdAt: row.createdAt.toISOString(),
  }
}
