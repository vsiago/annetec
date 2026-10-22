import type { ClubPaymentMethod, ClubPlanCoverage, ClubPlanDependentRule } from '@annetec/contracts'
import { relations } from 'drizzle-orm'
import {
  boolean,
  date,
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
  appointmentChannelEnum,
  appointmentMessageKindEnum,
  appointmentPriorityEnum,
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
    // Com o inquilino na chave: a mesma pessoa pode ser vendedora em dois clubes.
    uniqueIndex('sales_goals_org_seller_period_key').on(table.organizationId, table.sellerId, table.year, table.month),
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
    /** Frase curta do parceiro, exibida abaixo do nome na rede credenciada. */
    tagline: text('tagline'),
    category: partnerCategoryEnum('category').notNull(),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    address: text('address'),
    phone: text('phone'),
    email: text('email'),
    website: text('website'),
    city: text('city'),
    state: text('state'),
    /** Especialidades atendidas; é por elas que o associado busca a rede. */
    specialties: jsonb('specialties').$type<string[]>().notNull().default([]),
    /** Início do credenciamento. */
    since: date('since'),
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
/**
 * Mesa de atendimento do inquilino: um chamado por linha.
 *
 * É dado próprio da Annetec. Quando o inquilino tem o módulo de atendimento
 * da Digital Saúde contratado, o ERP devolve um `protocol` que fica guardado
 * junto — mas o chamado nasce e vive aqui, porque nem todo inquilino tem esse
 * módulo e o histórico não pode depender disso.
 */
export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    clientUserId: text('client_user_id').references(() => user.id, { onDelete: 'set null' }),
    clientName: text('client_name').notNull(),
    /** Assunto curto, o que aparece na lista. */
    subject: text('subject').notNull().default(''),
    description: text('description').notNull(),
    channel: appointmentChannelEnum('channel').notNull().default('app'),
    priority: appointmentPriorityEnum('priority').notNull().default('normal'),
    status: appointmentStatusEnum('status').notNull().default('aguardando'),
    /**
     * Quem da equipe está com o chamado. `set null` e não `cascade`: se a
     * pessoa sai do inquilino, o chamado volta para a fila em vez de sumir
     * junto com ela.
     */
    assignedUserId: text('assigned_user_id').references(() => user.id, { onDelete: 'set null' }),
    /** Protocolo devolvido por `/atendimento/` quando o inquilino usa o módulo. */
    protocol: text('protocol'),
    /**
     * Última movimentação. Guardado em coluna e não calculado da thread
     * porque é por ele que a mesa ordena e cobra prazo: um `max()` sobre as
     * mensagens a cada listagem custaria caro e o chamado sem mensagem
     * nenhuma ficaria sem data.
     */
    lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('appointments_org_status_idx').on(table.organizationId, table.status),
    index('appointments_org_last_idx').on(table.organizationId, table.lastInteractionAt),
  ],
)

/** Thread do chamado: o que o associado mandou, o que a equipe respondeu e as notas internas. */
export const appointmentMessages = pgTable(
  'appointment_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    kind: appointmentMessageKindEnum('kind').notNull().default('saida'),
    title: text('title').notNull().default(''),
    body: text('body').notNull(),
    /** Quem escreveu; null quando a mensagem veio do próprio associado. */
    authorUserId: text('author_user_id').references(() => user.id, { onDelete: 'set null' }),
    authorName: text('author_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('appointment_messages_appointment_idx').on(table.appointmentId, table.createdAt)],
)

export const appointmentsRelations = relations(appointments, ({ many, one }) => ({
  messages: many(appointmentMessages),
  client: one(user, { fields: [appointments.clientUserId], references: [user.id] }),
}))

export const appointmentMessagesRelations = relations(appointmentMessages, ({ one }) => ({
  appointment: one(appointments, {
    fields: [appointmentMessages.appointmentId],
    references: [appointments.id],
  }),
}))

/**
 * Planos que o INQUILINO vende ao associado — a vitrine comercial do clube.
 *
 * Não confundir com três coisas parecidas:
 *  - `tenant_plans`: o que a ANNETEC vende ao inquilino (assinatura do SaaS);
 *  - `HealthPlan` do catálogo: o produto da DIGITAL SAÚDE, identificado por
 *    `codigo` e dono das regras de carência e cobertura;
 *  - `benefits`: as vantagens avulsas do clube, que não têm mensalidade.
 *
 * Esta tabela é regra própria da Annetec: preço de tabela, texto de venda e
 * destaque na vitrine são decisões comerciais do inquilino e não existem do
 * lado do ERP. `upstreamPlanCodigo` é a ponte opcional — preenchido, amarra o
 * plano vendido ao produto que será contratado lá na adesão.
 */
export const clubPlans = pgTable(
  'club_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    priceMonthly: numeric('price_monthly', { precision: 12, scale: 2 }).notNull().default('0'),
    /** Preço mensal por dependente; `null`/0 = dependentes inclusos (checkout do clube). */
    priceDependentMonthly: numeric('price_dependent_monthly', { precision: 12, scale: 2 }),
    /** Teto de dependentes por assinatura; `null` = sem limite, 0 = individual. */
    maxDependents: integer('max_dependents'),
    /** Coberturas listadas no cartão do plano. */
    features: jsonb('features').$type<string[]>().notNull().default([]),
    /** Público a que o plano se destina ("Famílias", "MEI"), usado no filtro. */
    audience: text('audience'),
    /** Destaca como "Mais escolhido" na vitrine. */
    highlight: boolean('highlight').notNull().default(false),
    /** `codigo` do plano correspondente na Digital Saúde, quando houver. */
    upstreamPlanCodigo: text('upstream_plan_codigo'),
    status: activeStatusEnum('status').notNull().default('active'),
    // --- Modelo completo do plano (0007). Todos opcionais: ausentes = regra de antes.
    /** Frase curta de venda sob o nome. */
    tagline: text('tagline'),
    /** Selo do card ("Mais escolhido"). */
    badge: text('badge'),
    /** Ordem de exibição (menor primeiro); `null` = destaque, depois preço. */
    sortOrder: integer('sort_order'),
    /** Dependentes cobertos pela mensalidade do titular; os seguintes pagam `priceDependentMonthly`. */
    includedDependents: integer('included_dependents'),
    /** Taxa de adesão (R$), só na 1ª cobrança; `null`/0 = sem adesão. */
    enrollmentFee: numeric('enrollment_fee', { precision: 12, scale: 2 }),
    enrollmentFeeWaived: boolean('enrollment_fee_waived').notNull().default(false),
    /** Idade mínima do titular; `null` = 18. */
    holderMinAge: integer('holder_min_age'),
    /** Idade máxima do titular (inclusive); `null` = sem limite. */
    holderMaxAge: integer('holder_max_age'),
    /** Parentescos aceitos + idade máxima; `null` = qualquer parentesco, sem limite. */
    dependentRules: jsonb('dependent_rules').$type<ClubPlanDependentRule[]>(),
    /** Coberturas estruturadas (ordem do array = ordem de exibição). */
    coverages: jsonb('coverages').$type<ClubPlanCoverage[]>().notNull().default([]),
    /** Formas aceitas neste plano (∩ as do clube); `null` = todas as do clube. */
    paymentMethods: jsonb('payment_methods').$type<ClubPaymentMethod[]>(),
    /** Fidelidade em meses; 0/`null` = sem fidelidade. */
    loyaltyMonths: integer('loyalty_months'),
    cancellationPolicy: text('cancellation_policy'),
    adjustmentPolicy: text('adjustment_policy'),
    /** Regulamento exibido no checkout. */
    terms: text('terms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('club_plans_org_idx').on(table.organizationId, table.status),
    uniqueIndex('club_plans_org_name_key').on(table.organizationId, table.name),
  ],
)

export const leadsRelations = relations(leads, ({ many, one }) => ({
  interactions: many(leadInteractions),
  seller: one(user, { fields: [leads.sellerId], references: [user.id] }),
}))

export const leadInteractionsRelations = relations(leadInteractions, ({ one }) => ({
  lead: one(leads, { fields: [leadInteractions.leadId], references: [leads.id] }),
}))
