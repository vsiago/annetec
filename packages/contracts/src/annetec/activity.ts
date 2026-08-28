import { z } from 'zod'
import { activityKind, platformRole, tenantRole } from './enums'

/**
 * Rastreabilidade — página vista e ações pontuais (login/logout). Ver
 * `apps/api/src/db/schema/activity.ts` pro porquê do modelo.
 */

/**
 * Corpo aceito por `POST /api/v1/activity/events`. O ator (quem é, se
 * logado) NUNCA vem do corpo — a API resolve a partir da própria sessão, pra
 * não dar pra um evento se passar por outra pessoa.
 */
export const trackEventInput = z.object({
  kind: activityKind,
  path: z.string().min(1),
  /** Preenchido quando `kind = 'action'` (ex.: 'login', 'logout'). */
  action: z.string().min(1).optional(),
  /** Cookie `annetec.visitor_id` — identifica o navegador antes do login. */
  visitorId: z.string().optional(),
})
export type TrackEventInput = z.infer<typeof trackEventInput>

const actorFields = {
  actorName: z.string().nullable(),
  actorScope: z.enum(['platform', 'tenant']).nullable(),
  actorRole: z.union([platformRole, tenantRole]).nullable(),
  tenantSlug: z.string().nullable(),
}

/** Um evento de atividade, para o feed recente. */
export const activityEvent = z.object({
  id: z.string(),
  kind: activityKind,
  ...actorFields,
  path: z.string(),
  action: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type ActivityEvent = z.infer<typeof activityEvent>

/** Pessoa com atividade recente (últimos minutos) — "online agora". */
export const onlineVisitor = z.object({
  key: z.string(),
  ...actorFields,
  path: z.string(),
  lastSeenAt: z.string().datetime(),
})
export type OnlineVisitor = z.infer<typeof onlineVisitor>

/** Linha da tabela "visto por último" — todo mundo que já apareceu, não só quem está online agora. */
export const visitor = z.object({
  key: z.string(),
  ...actorFields,
  lastPath: z.string(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  totalEvents: z.number().int().nonnegative(),
  isOnline: z.boolean(),
})
export type Visitor = z.infer<typeof visitor>

export const topPage = z.object({
  path: z.string(),
  count: z.number().int().nonnegative(),
})
export type TopPage = z.infer<typeof topPage>

/** Payload único do dashboard — tudo que a tela de Logs precisa numa chamada. */
export const activityOverview = z.object({
  visitorsToday: z.number().int().nonnegative(),
  eventsToday: z.number().int().nonnegative(),
  onlineCount: z.number().int().nonnegative(),
  topPages: z.array(topPage),
  recentActivity: z.array(activityEvent),
  online: z.array(onlineVisitor),
})
export type ActivityOverview = z.infer<typeof activityOverview>

export const listVisitorsQuery = z.object({
  q: z.string().optional(),
})
export type ListVisitorsQuery = z.infer<typeof listVisitorsQuery>
