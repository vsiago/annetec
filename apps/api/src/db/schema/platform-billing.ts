import type {
  ClubPaymentMethod,
  PlatformAccessLevel,
  PlatformChargeItem,
  PlatformChargeKind,
  PlatformEventSource,
  PlatformSubscriptionStatus,
} from '@annetec/contracts'
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { organization } from './auth'
import { clubChargeStatusEnum, clubPaymentMethodEnum, paymentGatewayProviderEnum } from './club-billing'
import { tenantPlans } from './platform'
import { platformOnboardingProposals } from './platform-onboarding'

/**
 * Faturamento ANNETEC → inquilinos (blueprint da plataforma §0.4). Motor
 * PRÓPRIO, separado do `club-billing` (que a demo usa e não pode ser mexido);
 * reaproveita só os tipos do Postgres de método, status de cobrança e gateway.
 *
 * Só inquilino com linha em `platform_subscriptions` é "gerenciado" (cobrado e
 * restringível). Inquilinos reais pré-existentes NUNCA ganham linha aqui.
 */
const SUBSCRIPTION_STATUS = ['active', 'past_due', 'restricted', 'suspended', 'canceled'] as const
const ACCESS_LEVELS = ['full', 'read_only', 'blocked'] as const
const CHARGE_KINDS = ['activation', 'monthly', 'adjustment'] as const
const EVENT_SOURCES = ['webhook', 'automation', 'onboarding', 'manual', 'simulation', 'tenant'] as const

SUBSCRIPTION_STATUS satisfies readonly PlatformSubscriptionStatus[]
ACCESS_LEVELS satisfies readonly PlatformAccessLevel[]
CHARGE_KINDS satisfies readonly PlatformChargeKind[]
EVENT_SOURCES satisfies readonly PlatformEventSource[]

export const platformSubscriptionStatusEnum = pgEnum('platform_subscription_status', SUBSCRIPTION_STATUS)

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
const money = (name: string) => numeric(name, { precision: 12, scale: 2 })

/** Preço comercial do plano ANNETEC (1:1 com `tenant_plans`; TS `tenantPlanPrices` para não colidir com o zod `tenantPlanPricing`). Sem linha = padrões do contracts. */
export const tenantPlanPrices = pgTable('tenant_plan_prices', {
  planId: text('plan_id')
    .primaryKey()
    .references(() => tenantPlans.id, { onDelete: 'cascade' }),
  setupFee: money('setup_fee').notNull().default('0'),
  pricePerExtraLife: money('price_per_extra_life').notNull().default('0'),
  /** 0 = split desligado (padrão). */
  revenueSharePercent: numeric('revenue_share_percent', { precision: 5, scale: 2 }).notNull().default('0'),
  publicVisible: boolean('public_visible').notNull().default(true),
  highlight: boolean('highlight').notNull().default(false),
  sortOrder: integer('sort_order'),
  tagline: text('tagline'),
  description: text('description'),
  updatedAt: updatedAt(),
})

/** Régua da plataforma — linha única `id = 'default'` (TS `platformBillingConfig` para não colidir com o zod `platformBillingSettings`). Sem linha = `DEFAULT_PLATFORM_BILLING_POLICY`. */
export const platformBillingConfig = pgTable('platform_billing_settings', {
  id: text('id').primaryKey().default('default'),
  /** Override do gateway; `null` = env `PLATFORM_PAYMENT_GATEWAY`. */
  gateway: paymentGatewayProviderEnum('gateway'),
  enabledMethods: jsonb('enabled_methods')
    .$type<ClubPaymentMethod[]>()
    .notNull()
    .default(['pix', 'boleto', 'credit_card']),
  generateDaysBefore: integer('generate_days_before').notNull().default(10),
  reminderDaysBefore: integer('reminder_days_before').notNull().default(3),
  restrictAfterDays: integer('restrict_after_days').notNull().default(10),
  suspendAfterDays: integer('suspend_after_days').notNull().default(30),
  cancelAfterDays: integer('cancel_after_days').notNull().default(90),
  boletoDueDays: integer('boleto_due_days').notNull().default(5),
  finePercent: numeric('fine_percent', { precision: 5, scale: 2 }).notNull().default('2'),
  interestMonthlyPercent: numeric('interest_monthly_percent', { precision: 5, scale: 2 }).notNull().default('1'),
  maxCardRetries: integer('max_card_retries').notNull().default(3),
  cardRetryIntervalHours: integer('card_retry_interval_hours').notNull().default(24),
  activationExpiryDays: integer('activation_expiry_days').notNull().default(15),
  draftExpiryDays: integer('draft_expiry_days').notNull().default(30),
  lastAutomationRunAt: timestamp('last_automation_run_at', { withTimezone: true }),
  updatedAt: updatedAt(),
})

/** Assinatura do inquilino junto à ANNETEC (uma por inquilino; reativação reaproveita a linha). */
export const platformSubscriptions = pgTable(
  'platform_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id').references(() => platformOnboardingProposals.id, { onDelete: 'set null' }),
    planId: text('plan_id').references(() => tenantPlans.id, { onDelete: 'set null' }),
    /** Retrato do plano (contratação ou última troca). */
    planName: text('plan_name').notNull(),
    planPriceMonthly: money('plan_price_monthly').notNull(),
    memberLimit: integer('member_limit').notNull(),
    pricePerExtraLife: money('price_per_extra_life').notNull().default('0'),
    setupFee: money('setup_fee').notNull().default('0'),
    revenueSharePercent: numeric('revenue_share_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    status: platformSubscriptionStatusEnum('status').notNull().default('active'),
    /** Override manual da holding (vence a régua enquanto vigente). */
    accessOverride: text('access_override', { enum: ACCESS_LEVELS }),
    accessOverrideReason: text('access_override_reason'),
    accessOverrideUntil: timestamp('access_override_until', { withTimezone: true }),
    accessOverrideByUserId: text('access_override_by_user_id'),
    accessOverrideAt: timestamp('access_override_at', { withTimezone: true }),
    paymentMethod: clubPaymentMethodEnum('payment_method').notNull(),
    dueDay: integer('due_day').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    currentPeriodStart: date('current_period_start'),
    currentPeriodEnd: date('current_period_end'),
    nextDueDate: date('next_due_date'),
    gatewayProvider: paymentGatewayProviderEnum('gateway_provider').notNull(),
    gatewayCustomerId: text('gateway_customer_id'),
    /** Cartão salvo: token do gateway + bandeira/finais/validade. Nunca o número. */
    cardToken: text('card_token'),
    cardBrand: text('card_brand'),
    cardLast4: text('card_last4'),
    cardExpiry: text('card_expiry'),
    billingName: text('billing_name').notNull(),
    /** CNPJ, só dígitos. */
    billingDocument: text('billing_document').notNull(),
    billingEmail: text('billing_email').notNull(),
    /** Downgrade agendado para o próximo ciclo. */
    scheduledPlanId: text('scheduled_plan_id').references(() => tenantPlans.id, { onDelete: 'set null' }),
    /** Itens a lançar na próxima fatura (proporcional de upgrade, ajustes). */
    pendingAdjustments: jsonb('pending_adjustments').$type<PlatformChargeItem[]>().notNull().default([]),
    /**
     * Desconto na mensalidade aprovado na venda (0 = sem). Vale para o período
     * que começa até `monthly_discount_until` (inclusive; `null` = permanente).
     * O preço do plano (`plan_price_monthly`) fica cheio: o desconto entra como
     * linha `discount` na geração de cada fatura.
     */
    monthlyDiscountPercent: numeric('monthly_discount_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    monthlyDiscountUntil: date('monthly_discount_until'),
    pastDueAt: timestamp('past_due_at', { withTimezone: true }),
    restrictedAt: timestamp('restricted_at', { withTimezone: true }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    reactivatedAt: timestamp('reactivated_at', { withTimezone: true }),
    source: text('source', { enum: ['onboarding', 'seed', 'console'] }).notNull().default('onboarding'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    uniqueIndex('platform_subscriptions_org_key').on(table.organizationId),
    index('platform_subscriptions_status_idx').on(table.status),
    index('platform_subscriptions_next_due_idx').on(table.nextDueDate),
  ],
)

/**
 * Fatura da plataforma. `activation` nasce da proposta (sem organização) e é
 * vinculada no provisionamento; `monthly` é única por (assinatura, período)
 * entre as não canceladas.
 * Segunda via/troca de método reaproveitam a linha (como no clube).
 */
export const platformCharges = pgTable(
  'platform_charges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'set null' }),
    subscriptionId: uuid('subscription_id').references(() => platformSubscriptions.id, { onDelete: 'set null' }),
    proposalId: uuid('proposal_id').references(() => platformOnboardingProposals.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: CHARGE_KINDS }).notNull(),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    dueDate: date('due_date').notNull(),
    amount: money('amount').notNull(),
    items: jsonb('items').$type<PlatformChargeItem[]>().notNull().default([]),
    /** Vidas apuradas na geração (mensal). */
    livesCount: integer('lives_count'),
    method: clubPaymentMethodEnum('method').notNull(),
    status: clubChargeStatusEnum('status').notNull().default('pending'),
    description: text('description').notNull(),
    gatewayProvider: paymentGatewayProviderEnum('gateway_provider').notNull(),
    gatewayChargeId: text('gateway_charge_id'),
    invoiceUrl: text('invoice_url'),
    pixPayload: text('pix_payload'),
    /** PNG em base64, sem o prefixo `data:`. */
    pixQrCode: text('pix_qr_code'),
    pixExpiresAt: timestamp('pix_expires_at', { withTimezone: true }),
    boletoIdentificationField: text('boleto_identification_field'),
    boletoBarCode: text('boleto_bar_code'),
    boletoUrl: text('boleto_url'),
    cardBrand: text('card_brand'),
    cardLast4: text('card_last4'),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    reminderSentAt: timestamp('reminder_sent_at', { withTimezone: true }),
    overdueNotifiedAt: timestamp('overdue_notified_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paidAmount: money('paid_amount'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    // Uma mensalidade VIGENTE por período: a cancelada (ex.: migrada de
    // gateway) fica no histórico e a substituta reusa o mesmo período.
    uniqueIndex('platform_charges_sub_period_key')
      .on(table.subscriptionId, table.periodStart)
      .where(sql`kind = 'monthly' and status <> 'canceled'`),
    uniqueIndex('platform_charges_gateway_key').on(table.gatewayProvider, table.gatewayChargeId),
    index('platform_charges_org_status_due_idx').on(table.organizationId, table.status, table.dueDate),
    index('platform_charges_status_due_idx').on(table.status, table.dueDate),
    index('platform_charges_proposal_idx').on(table.proposalId),
    index('platform_charges_paid_idx').on(table.paidAt),
  ],
)

/** Timeline de cobrança da plataforma. `payload` NUNCA contém dado de cartão. */
export const platformBillingEvents = pgTable(
  'platform_billing_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'set null' }),
    subscriptionId: uuid('subscription_id').references(() => platformSubscriptions.id, { onDelete: 'set null' }),
    chargeId: uuid('charge_id').references(() => platformCharges.id, { onDelete: 'set null' }),
    proposalId: uuid('proposal_id').references(() => platformOnboardingProposals.id, { onDelete: 'set null' }),
    /** Um de `PLATFORM_BILLING_EVENT_TYPES`. */
    type: text('type').notNull(),
    source: text('source', { enum: EVENT_SOURCES }).notNull(),
    gatewayProvider: paymentGatewayProviderEnum('gateway_provider'),
    /** Id do evento no gateway (dedupe de webhook at-least-once). */
    externalEventId: text('external_event_id'),
    message: text('message').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    actorUserId: text('actor_user_id'),
    createdAt: createdAt(),
  },
  table => [
    uniqueIndex('platform_billing_events_gateway_event_key').on(table.gatewayProvider, table.externalEventId),
    index('platform_billing_events_org_created_idx').on(table.organizationId, table.createdAt),
    index('platform_billing_events_sub_created_idx').on(table.subscriptionId, table.createdAt),
    index('platform_billing_events_charge_idx').on(table.chargeId),
  ],
)

export const platformSubscriptionsRelations = relations(platformSubscriptions, ({ many, one }) => ({
  charges: many(platformCharges),
  events: many(platformBillingEvents),
  organization: one(organization, { fields: [platformSubscriptions.organizationId], references: [organization.id] }),
  plan: one(tenantPlans, { fields: [platformSubscriptions.planId], references: [tenantPlans.id] }),
  proposal: one(platformOnboardingProposals, {
    fields: [platformSubscriptions.proposalId],
    references: [platformOnboardingProposals.id],
  }),
}))

export const platformChargesRelations = relations(platformCharges, ({ many, one }) => ({
  subscription: one(platformSubscriptions, {
    fields: [platformCharges.subscriptionId],
    references: [platformSubscriptions.id],
  }),
  proposal: one(platformOnboardingProposals, {
    fields: [platformCharges.proposalId],
    references: [platformOnboardingProposals.id],
  }),
  events: many(platformBillingEvents),
}))

export const platformBillingEventsRelations = relations(platformBillingEvents, ({ one }) => ({
  subscription: one(platformSubscriptions, {
    fields: [platformBillingEvents.subscriptionId],
    references: [platformSubscriptions.id],
  }),
  charge: one(platformCharges, { fields: [platformBillingEvents.chargeId], references: [platformCharges.id] }),
}))

export const tenantPlanPricesRelations = relations(tenantPlanPrices, ({ one }) => ({
  plan: one(tenantPlans, { fields: [tenantPlanPrices.planId], references: [tenantPlans.id] }),
}))
