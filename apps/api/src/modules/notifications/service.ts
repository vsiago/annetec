import type { AppNotification, NotificationAudience, NotificationList, NotificationPayload } from '@annetec/contracts'
import { and, desc, eq, gt, inArray, isNull, notInArray, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { notificationReads, notifications, organization, tenantProfiles } from '@/db/schema'
import { logger } from '@/lib/logger'

/**
 * Leitura, "lidas" e stream das notificações (ver `lib/notifications.ts`
 * para a emissão).
 *
 * ESCOPO é a única regra de acesso, aplicada em TODA consulta:
 *  - `tenant`: linhas `audience = 'tenant'` do clube da rota (o
 *    `requireTenantRole('admin')` já garantiu que a sessão é deste clube);
 *  - `platform`: linhas `audience = 'platform'` de todos os clubes;
 *  - `seller`: linhas `audience = 'seller'` destinadas ao PRÓPRIO vendedor
 *    (`recipient_user_id` = a pessoa da sessão);
 *  - `sales`: linhas `audience = 'sales'` da PRÓPRIA pessoa no escopo da Rede
 *    Comercial (`organization_id` = clube da rota; nulo na plataforma).
 * "Não lida" é por pessoa (`notification_reads`) e só conta os últimos
 * 30 dias — conta nova não nasce com um histórico inteiro "não lido".
 */

export interface NotificationScope {
  audience: NotificationAudience
  /** Obrigatório no público `tenant`; ignorado no `platform` e no `seller`. */
  organizationId: string | null
  userId: string
}

export interface NotificationRecord {
  id: string
  audience: NotificationAudience
  kind: AppNotification['kind']
  organizationId: string | null
  title: string
  body: string | null
  amount: string | null
  payload: NotificationPayload
  link: string | null
  createdAt: Date
  readAt: Date | null
  orgSlug: string | null
  orgName: string | null
  orgLogo: string | null
  branding: { primaryColor?: string; logoUrl?: string } | null
}

const UNREAD_WINDOW = sql`now() - interval '30 days'`

export function scopeCondition(scope: NotificationScope): SQL {
  if (scope.audience === 'tenant') {
    // Sem clube não há o que ler: condição que nunca casa, em vez de "todas".
    if (!scope.organizationId) return sql`false`
    return and(eq(notifications.audience, 'tenant'), eq(notifications.organizationId, scope.organizationId))!
  }
  if (scope.audience === 'seller') {
    if (!scope.userId) return sql`false`
    return and(eq(notifications.audience, 'seller'), eq(notifications.recipientUserId, scope.userId))!
  }
  if (scope.audience === 'sales') {
    // Rede Comercial: só as destinadas à própria pessoa, no escopo da rota (clube ou plataforma).
    if (!scope.userId) return sql`false`
    return and(
      eq(notifications.audience, 'sales'),
      eq(notifications.recipientUserId, scope.userId),
      scope.organizationId ? eq(notifications.organizationId, scope.organizationId) : isNull(notifications.organizationId),
    )!
  }
  return eq(notifications.audience, 'platform')
}

export function presentNotification(row: NotificationRecord): AppNotification {
  return {
    id: row.id,
    audience: row.audience,
    kind: row.kind,
    organizationId: row.organizationId,
    tenant:
      row.organizationId && row.orgSlug && row.orgName
        ? {
            id: row.organizationId,
            slug: row.orgSlug,
            name: row.orgName,
            primaryColor: row.branding?.primaryColor ?? null,
            logoUrl: row.branding?.logoUrl ?? row.orgLogo ?? null,
          }
        : null,
    title: row.title,
    body: row.body,
    amount: row.amount === null ? null : Number(row.amount),
    payload: row.payload ?? {},
    link: row.link,
    createdAt: row.createdAt.toISOString(),
    read: row.readAt !== null,
  }
}

/** Acesso ao banco — injetável para os testes rodarem sem Postgres. */
export interface NotificationStore {
  /** Relógio do BANCO (é ele que carimba `created_at`): cursor sem desvio de relógio. */
  now: () => Promise<Date>
  latest: (scope: NotificationScope, limit: number) => Promise<NotificationRecord[]>
  unreadCount: (scope: NotificationScope) => Promise<number>
  /** Criadas depois de `since`, mais antigas primeiro, sem as já entregues nesta conexão. */
  createdAfter: (scope: NotificationScope, since: Date, excludeIds: string[], limit: number) => Promise<NotificationRecord[]>
  markRead: (scope: NotificationScope, ids: string[] | null) => Promise<number>
}

function baseSelect(userId: string) {
  return db
    .select({
      id: notifications.id,
      audience: notifications.audience,
      kind: notifications.kind,
      organizationId: notifications.organizationId,
      title: notifications.title,
      body: notifications.body,
      amount: notifications.amount,
      payload: notifications.payload,
      link: notifications.link,
      createdAt: notifications.createdAt,
      readAt: notificationReads.readAt,
      orgSlug: organization.slug,
      orgName: organization.name,
      orgLogo: organization.logo,
      branding: tenantProfiles.branding,
    })
    .from(notifications)
    .leftJoin(organization, eq(organization.id, notifications.organizationId))
    .leftJoin(tenantProfiles, eq(tenantProfiles.organizationId, notifications.organizationId))
    .leftJoin(
      notificationReads,
      and(eq(notificationReads.notificationId, notifications.id), eq(notificationReads.userId, userId)),
    )
}

export const notificationStoreDb: NotificationStore = {
  now: async () => {
    const rows = await db.execute(sql`select floor(extract(epoch from clock_timestamp()) * 1000)::float8 as ms`)
    const ms = Number((rows as unknown as { ms: number | string }[])[0]?.ms)
    return Number.isFinite(ms) ? new Date(ms) : new Date()
  },

  latest: async (scope, limit) =>
    (await baseSelect(scope.userId)
      .where(scopeCondition(scope))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)) as NotificationRecord[],

  unreadCount: async scope => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          scopeCondition(scope),
          sql`${notifications.createdAt} > ${UNREAD_WINDOW}`,
          sql`not exists (select 1 from ${notificationReads} r where r.notification_id = ${notifications.id} and r.user_id = ${scope.userId})`,
        ),
      )
    return Number(row?.count ?? 0)
  },

  createdAfter: async (scope, since, excludeIds, limit) =>
    (await baseSelect(scope.userId)
      .where(
        and(
          scopeCondition(scope),
          gt(notifications.createdAt, since),
          excludeIds.length > 0 ? notInArray(notifications.id, excludeIds) : undefined,
        ),
      )
      .orderBy(notifications.createdAt)
      .limit(limit)) as NotificationRecord[],

  markRead: async (scope, ids) => {
    const target = db
      // Mesmas colunas, na mesma ordem da tabela (exigência do insert … select).
      .select({
        notificationId: notifications.id,
        userId: sql<string>`${scope.userId}::text`.as('user_id'),
        readAt: sql<Date>`now()`.as('read_at'),
      })
      .from(notifications)
      .where(
        and(
          scopeCondition(scope),
          ids ? inArray(notifications.id, ids) : sql`${notifications.createdAt} > ${UNREAD_WINDOW}`,
        ),
      )
    const inserted = await db
      .insert(notificationReads)
      .select(target)
      .onConflictDoNothing()
      .returning({ id: notificationReads.notificationId })
    return inserted.length
  },
}

export async function listNotifications(
  scope: NotificationScope,
  limit: number,
  demoToolsEnabled: boolean,
  store: NotificationStore = notificationStoreDb,
): Promise<NotificationList> {
  const [now, rows, unread] = await Promise.all([store.now(), store.latest(scope, limit), store.unreadCount(scope)])
  return { items: rows.map(presentNotification), unread, cursor: now.toISOString(), demoToolsEnabled }
}

export async function markNotificationsRead(
  scope: NotificationScope,
  ids: string[] | null,
  store: NotificationStore = notificationStoreDb,
): Promise<{ marked: number; unread: number }> {
  const marked = await store.markRead(scope, ids)
  return { marked, unread: await store.unreadCount(scope) }
}

// ---------------------------------------------------------------------------
// Stream (SSE) compatível com função serverless
// ---------------------------------------------------------------------------

/**
 * O pedaço do `SSEStreamingApi` do Hono que o loop usa — os testes passam
 * um gravador em memória.
 */
export interface SseWriter {
  writeSSE: (message: { data: string; event?: string; id?: string; retry?: number }) => Promise<void>
  write: (input: string) => Promise<unknown>
  sleep: (ms: number) => Promise<unknown>
  readonly aborted: boolean
  readonly closed: boolean
}

export interface StreamTiming {
  /** Intervalo entre consultas ao banco. */
  pollMs: number
  /** Comentário `: ping` quando nada foi escrito há este tempo (proxies cortam conexão muda). */
  heartbeatMs: number
  /** A resposta termina sozinha aqui; o EventSource reconecta e retoma pelo Last-Event-ID. */
  maxMs: number
  /** O navegador espera isto antes de reconectar. */
  retryMs: number
}

export const DEFAULT_STREAM_TIMING: StreamTiming = { pollMs: 2_000, heartbeatMs: 15_000, maxMs: 25_000, retryMs: 1_000 }

/**
 * Margem de releitura: uma linha cujo INSERT começou antes da anterior mas
 * fez commit depois tem `created_at` menor que o cursor. Relendo os últimos
 * segundos (sem as já entregues nesta conexão) ela não se perde; numa
 * reconexão pode vir repetida — o navegador deduplica pelo id.
 */
export const STREAM_OVERLAP_MS = 5_000
const STREAM_BATCH = 50

/** Cursor de `Last-Event-ID`/`?after=`: ISO-8601; inválido ou no futuro → `null` (começa de agora). */
export function parseStreamCursor(raw: string | null | undefined, now: Date): Date | null {
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  if (date.getTime() > now.getTime() + 60_000) return null
  // Reconexão depois de muito tempo (notebook dormindo): não despeja o dia inteiro.
  const floor = now.getTime() - 24 * 60 * 60 * 1000
  return date.getTime() < floor ? new Date(floor) : date
}

export interface StreamOptions {
  timing?: StreamTiming
  store?: NotificationStore
  clock?: () => number
  /** Relógio do banco − relógio local (medido uma vez por conexão): o cursor anda no tempo do banco. */
  dbClockOffsetMs?: number
  /** Encerra o loop na hora (padrão: o sinal de desligamento do processo, `abortNotificationStreams`). */
  signal?: AbortSignal
}

/**
 * Desligamento do processo: toda conexão SSE aberta (e qualquer uma que
 * chegue depois) fecha na hora com o evento `cursor` — o navegador reconecta
 * em outra instância e retoma pelo Last-Event-ID. Sem isso cada stream
 * seguraria o `server.close()` por até `maxMs` (25 s), estourando o prazo do
 * encerramento gracioso.
 */
const streamsShutdown = new AbortController()

export function abortNotificationStreams(): void {
  streamsShutdown.abort()
}

/** `stream.sleep`, mas acorda assim que o sinal dispara. */
function sleepUnlessAborted(stream: SseWriter, ms: number, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) return Promise.resolve()
  let onAbort: () => void = () => {}
  const aborted = new Promise<void>(resolve => {
    onAbort = () => resolve()
    signal.addEventListener('abort', onAbort, { once: true })
  })
  return Promise.race([stream.sleep(ms), aborted]).finally(() => signal.removeEventListener('abort', onAbort))
}

/**
 * Loop de uma conexão. Todo evento leva `id:` = cursor (instante no relógio
 * do banco até onde tudo já foi entregue) — inclusive o `ping` e o `cursor`
 * final, que não têm dado útil: assim o `Last-Event-ID` da reconexão anda
 * mesmo sem notificação nova, e a próxima resposta começa de onde esta parou.
 */
export async function runNotificationStream(
  stream: SseWriter,
  scope: NotificationScope,
  start: Date,
  options: StreamOptions = {},
): Promise<{ delivered: number; cursor: Date }> {
  const timing = options.timing ?? DEFAULT_STREAM_TIMING
  const store = options.store ?? notificationStoreDb
  const clock = options.clock ?? Date.now
  const offset = options.dbClockOffsetMs ?? 0
  const signal = options.signal ?? streamsShutdown.signal

  const deadline = clock() + timing.maxMs
  const sent = new Set<string>()
  let cursor = start
  let lastWrite = clock()
  let delivered = 0

  await stream.writeSSE({ event: 'ready', id: cursor.toISOString(), data: '{}', retry: timing.retryMs })

  while (!stream.aborted && !stream.closed && !signal.aborted && clock() < deadline) {
    const polledAt = new Date(clock() + offset)
    let rows: NotificationRecord[]
    try {
      rows = await store.createdAfter(scope, new Date(cursor.getTime() - STREAM_OVERLAP_MS), [...sent], STREAM_BATCH)
    } catch (error) {
      // Banco instável: encerra; o navegador reconecta e retoma do mesmo cursor.
      logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'Stream de notificações: falha na consulta')
      break
    }

    for (const row of rows) {
      if (sent.has(row.id)) continue
      sent.add(row.id)
      if (row.createdAt.getTime() > cursor.getTime()) cursor = row.createdAt
      await stream.writeSSE({ event: 'notification', id: cursor.toISOString(), data: JSON.stringify(presentNotification(row)) })
      delivered += 1
      lastWrite = clock()
    }
    // Lote cheio: pode haver mais entre o último entregue e agora — o cursor
    // só pula para "agora" quando a consulta veio inteira.
    if (rows.length < STREAM_BATCH && polledAt.getTime() > cursor.getTime()) cursor = polledAt

    if (clock() - lastWrite >= timing.heartbeatMs) {
      await stream.writeSSE({ event: 'ping', id: cursor.toISOString(), data: '{}' })
      lastWrite = clock()
    }

    const remaining = deadline - clock()
    if (remaining <= 0) break
    await sleepUnlessAborted(stream, Math.min(timing.pollMs, remaining), signal)
  }

  if (!stream.aborted && !stream.closed) {
    await stream.writeSSE({ event: 'cursor', id: cursor.toISOString(), data: '{}' }).catch(() => undefined)
  }
  return { delivered, cursor }
}
