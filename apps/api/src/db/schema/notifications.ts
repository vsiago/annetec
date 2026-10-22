import { NOTIFICATION_AUDIENCES, NOTIFICATION_KINDS, type NotificationPayload } from '@annetec/contracts'
import { sql } from 'drizzle-orm'
import { check, index, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { organization, user } from './auth'

/**
 * Notificações em tempo real (pagamento recebido, assinatura paga, cadastro
 * novo) — ver `lib/notifications.ts` (emissão) e `modules/notifications`
 * (lista, leitura e stream SSE).
 *
 * Uma linha por PÚBLICO: o mesmo fato vira uma linha `tenant` (admin do
 * clube de origem) e outra `platform` (equipe Annetec). `organization_id` é
 * sempre o clube de origem (nas duas); nulo só na fatura de ativação de um
 * clube que ainda não foi provisionado.
 *
 * `dedupe_key` (único por público) é a segunda trava contra duplicidade: a
 * primeira é só emitir quando a transição de status aconteceu de fato.
 *
 * Leitura é POR PESSOA em `notification_reads` — o admin A ter lido não
 * apaga o "não lida" do admin B.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
    audience: text('audience', { enum: NOTIFICATION_AUDIENCES }).notNull(),
    kind: text('kind', { enum: NOTIFICATION_KINDS }).notNull(),
    title: text('title').notNull(),
    body: text('body'),
    amount: numeric('amount', { precision: 12, scale: 2 }),
    payload: jsonb('payload').$type<NotificationPayload>().notNull().default({}),
    link: text('link'),
    dedupeKey: text('dedupe_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('notifications_audience_org_created_idx').on(table.audience, table.organizationId, table.createdAt),
    index('notifications_audience_created_idx').on(table.audience, table.createdAt),
    uniqueIndex('notifications_audience_dedupe_key').on(table.audience, table.dedupeKey),
    check('notifications_audience_check', sql`${table.audience} in ('tenant', 'platform')`),
  ],
)

export const notificationReads = pgTable(
  'notification_reads',
  {
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    primaryKey({ columns: [table.notificationId, table.userId] }),
    index('notification_reads_user_idx').on(table.userId),
  ],
)

export type NotificationRow = typeof notifications.$inferSelect
export type NewNotificationRow = typeof notifications.$inferInsert
