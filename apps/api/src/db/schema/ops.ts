import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { organization } from './auth'

/**
 * Trilha de auditoria. Toda escrita relevante (criação de inquilino, adesão,
 * mudança de papel, chamada de escrita ao upstream) registra uma linha aqui.
 *
 * `actorScope`/`actorId` não referenciam Better Auth diretamente: o ator pode
 * ser um `user.id` (pessoa) ou, em jobs internos, `null`. Guardado solto
 * (texto) para a trilha sobreviver mesmo que a conta do ator seja apagada.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'set null',
    }),
    actorId: text('actor_id'),
    actorScope: text('actor_scope', { enum: ['platform', 'tenant'] }),
    action: text('action').notNull(),
    resource: text('resource').notNull(),
    resourceId: text('resource_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ip: text('ip'),
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('audit_logs_org_idx').on(table.organizationId, table.createdAt),
    index('audit_logs_resource_idx').on(table.resource, table.resourceId),
  ],
)

/**
 * Cache de leituras do upstream (convênios, planos, tabelas de preço). Evita
 * bater na Digital Saúde a cada carregamento de tela de catálogo, que muda
 * raramente. A chave inclui o inquilino porque cada um tem seu próprio token.
 */
export const upstreamCache = pgTable(
  'upstream_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    cacheKey: text('cache_key').notNull(),
    payload: jsonb('payload').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  table => [index('upstream_cache_key_idx').on(table.organizationId, table.cacheKey)],
)
