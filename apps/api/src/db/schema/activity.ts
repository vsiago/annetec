import { pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Rastreabilidade do sistema — visitas de página e ações relevantes
 * (login/logout por enquanto; outras ações de negócio podem passar a gravar
 * aqui depois, sem mudar o formato).
 *
 * Cada linha é um evento imutável — não há update, só insert. "Online agora"
 * e "visto por último" (em `activityService`) são derivados por consulta
 * (MAX/agrupamento), não guardados à parte, pra não ter dois lugares de
 * verdade sobre a mesma informação.
 *
 * `visitorId` identifica o navegador antes de qualquer login (cookie
 * `annetec.visitor_id`, ver `apps/web/middleware.ts`) — é o que permite
 * contar visitante anônimo (ex.: alguém batendo na home antes de entrar).
 * Uma vez logado, `actorUserId` também é preenchido; os dois convivem no
 * mesmo evento.
 */
export const activityKindEnum = pgEnum('activity_kind', ['page_view', 'action'])

export const activityEvents = pgTable('activity_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  kind: activityKindEnum('kind').notNull(),

  visitorId: text('visitor_id'),

  actorUserId: text('actor_user_id'),
  actorName: text('actor_name'),
  /** 'platform' | 'tenant' | null (visitante anônimo, ainda sem sessão). */
  actorScope: text('actor_scope'),
  /** PlatformRole ou TenantRole, conforme `actorScope`. */
  actorRole: text('actor_role'),

  tenantId: text('tenant_id'),
  tenantSlug: text('tenant_slug'),

  path: text('path').notNull(),
  /** Preenchido quando `kind = 'action'` (ex.: 'login', 'logout'). */
  action: text('action'),

  ip: text('ip'),
  userAgent: text('user_agent'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
