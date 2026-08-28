import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import {
  activeStatusEnum,
  appointmentStatusEnum,
  benefitCategoryEnum,
  interactionTypeEnum,
  leadStatusEnum,
  partnerCategoryEnum,
  saleStatusEnum,
} from './enums'
import { organization, user } from './auth'
import { contracts } from './membership'

/** Funil de vendas. Dado exclusivamente Annetec, sem espelho no upstream. */
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    source: text('source'),
    status: leadStatusEnum('status').notNull().default('new'),
    notes: text('notes'),
    estimatedValue: numeric('estimated_value', { precision: 12, scale: 2 }),
    sellerId: text('seller_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('leads_org_status_idx').on(table.organizationId, table.status),
    index('leads_seller_idx').on(table.sellerId),
  ],
)

export const leadInteractions = pgTable(
  'lead_interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    type: interactionTypeEnum('type').notNull(),
    description: text('description').notNull(),
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('lead_interactions_lead_idx').on(table.leadId)],
)

export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),
    contractUpstreamCodigo: text('contract_upstream_codigo'),
    clientUserId: text('client_user_id').references(() => user.id, { onDelete: 'set null' }),
    clientName: text('client_name').notNull(),
    sellerId: text('seller_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    planCodigo: text('plan_codigo'),
    planName: text('plan_name'),
    value: numeric('value', { precision: 12, scale: 2 }).notNull(),
    commission: numeric('commission', { precision: 12, scale: 2 }).notNull().default('0'),
    status: saleStatusEnum('status').notNull().default('pending'),
    soldAt: timestamp('sold_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('sales_org_seller_idx').on(table.organizationId, table.sellerId),
    index('sales_sold_at_idx').on(table.organizationId, table.soldAt),
  ],
)

export const salesGoals = pgTable(
  'sales_goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    sellerId: text('seller_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    month: integer('month').notNull(),
    year: integer('year').notNull(),
    target: numeric('target', { precision: 12, scale: 2 }).notNull(),
    commissionRate: numeric('commission_rate', { precision: 5, scale: 4 }).notNull().default('0'),
  },
  table => [
    uniqueIndex('sales_goals_seller_period_key').on(table.sellerId, table.year, table.month),
  ],
)

/** Rede credenciada exibida ao associado. */
export const partners = pgTable(
  'partners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    category: partnerCategoryEnum('category').notNull(),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    address: text('address'),
    phone: text('phone'),
    city: text('city'),
    state: text('state'),
    status: activeStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('partners_org_category_idx').on(table.organizationId, table.category)],
)

export const benefits = pgTable(
  'benefits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    category: benefitCategoryEnum('category').notNull(),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }),
    provider: text('provider'),
    locations: jsonb('locations').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('benefits_org_idx').on(table.organizationId)],
)

/** Teleorientação / suporte ao associado. */
export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    clientUserId: text('client_user_id').references(() => user.id, { onDelete: 'set null' }),
    clientName: text('client_name').notNull(),
    description: text('description').notNull(),
    status: appointmentStatusEnum('status').notNull().default('aguardando'),
    /** Protocolo devolvido por `/atendimento/` quando o inquilino usa o módulo. */
    protocol: text('protocol'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('appointments_org_status_idx').on(table.organizationId, table.status)],
)

export const leadsRelations = relations(leads, ({ many, one }) => ({
  interactions: many(leadInteractions),
  seller: one(user, { fields: [leads.sellerId], references: [user.id] }),
}))

export const leadInteractionsRelations = relations(leadInteractions, ({ one }) => ({
  lead: one(leads, { fields: [leadInteractions.leadId], references: [leads.id] }),
}))
