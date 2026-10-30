import type {
  DiscountRequestStatus,
  ProspectInteractionKind,
  ProspectOrigin,
  ProspectStage,
  SalesCommissionKind,
  SalesCommissionStatus,
} from '@annetec/contracts'
import { relations, sql } from 'drizzle-orm'
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
import { user } from './auth'
import { tenantPlans } from './platform'
import { platformOnboardingProposals } from './platform-onboarding'

/**
 * Vendas da PLATAFORMA — vendedores próprios da ANNETEC prospectando
 * operadoras/clubes (futuros inquilinos). Separado do CRM dos clubes
 * (`leads`/`sales`, que são de cada inquilino).
 *
 * Enums como texto tipado (o `satisfies` garante que batem com o contracts):
 * nenhum deles é máquina de estados que precise do tipo do Postgres.
 */
const PROSPECT_STAGES = ['novo', 'em_contato', 'proposta_enviada', 'em_contratacao', 'em_aprovacao', 'ganho', 'perdido'] as const
const PROSPECT_ORIGINS = ['indicacao', 'prospeccao_ativa', 'evento', 'site', 'redes_sociais', 'outro'] as const
const INTERACTION_KINDS = ['ligacao', 'whatsapp', 'email', 'reuniao', 'visita', 'nota', 'sistema'] as const
const DISCOUNT_STATUSES = ['pending', 'approved', 'rejected', 'canceled'] as const
const COMMISSION_STATUSES = ['prevista', 'a_pagar', 'paga', 'cancelada', 'a_descontar'] as const
const COMMISSION_KINDS = ['setup_fee', 'monthly'] as const

PROSPECT_STAGES satisfies readonly ProspectStage[]
PROSPECT_ORIGINS satisfies readonly ProspectOrigin[]
INTERACTION_KINDS satisfies readonly ProspectInteractionKind[]
DISCOUNT_STATUSES satisfies readonly DiscountRequestStatus[]
COMMISSION_STATUSES satisfies readonly SalesCommissionStatus[]
COMMISSION_KINDS satisfies readonly SalesCommissionKind[]

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
const money = (name: string) => numeric(name, { precision: 12, scale: 2 })
const percent = (name: string) => numeric(name, { precision: 5, scale: 2 })

/** Perfil do vendedor (1:1 com a conta `user.role = 'platform_seller'`). */
export const platformSellers = pgTable(
  'platform_sellers',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Slug curto do link de indicação (`/contratar?ref=joao-silva`). Único. */
    referralCode: text('referral_code').notNull(),
    /** Inativo: não recebe indicação nem cria link; segue vendo o próprio histórico. */
    active: boolean('active').notNull().default(true),
    /** Meta mensal em nº de clubes ganhos (no ar) no mês. */
    monthlyGoal: integer('monthly_goal'),
    createdByUserId: text('created_by_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [uniqueIndex('platform_sellers_referral_code_key').on(table.referralCode)],
)

/** Prospect do funil da plataforma. Dono = vendedor (sem FK: a carteira sobrevive à conta). */
export const platformProspects = pgTable(
  'platform_prospects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerUserId: text('seller_user_id').notNull(),
    name: text('name').notNull(),
    /** Só dígitos. */
    cnpj: text('cnpj'),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    city: text('city'),
    state: text('state'),
    estimatedLives: integer('estimated_lives'),
    interestPlanId: text('interest_plan_id').references(() => tenantPlans.id, { onDelete: 'set null' }),
    estimatedValue: money('estimated_value'),
    origin: text('origin', { enum: PROSPECT_ORIGINS }).notNull().default('prospeccao_ativa'),
    stage: text('stage', { enum: PROSPECT_STAGES }).notNull().default('novo'),
    lostReason: text('lost_reason'),
    nextAction: text('next_action'),
    nextActionAt: date('next_action_at'),
    /** Proposta de contratação vinculada (a etapa acompanha o status dela). */
    proposalId: uuid('proposal_id').references(() => platformOnboardingProposals.id, { onDelete: 'set null' }),
    stageChangedAt: timestamp('stage_changed_at', { withTimezone: true }).notNull().defaultNow(),
    wonAt: timestamp('won_at', { withTimezone: true }),
    lostAt: timestamp('lost_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    index('platform_prospects_seller_stage_idx').on(table.sellerUserId, table.stage),
    index('platform_prospects_proposal_idx').on(table.proposalId),
    index('platform_prospects_next_action_idx').on(table.sellerUserId, table.nextActionAt),
  ],
)

export const platformProspectInteractions = pgTable(
  'platform_prospect_interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prospectId: uuid('prospect_id')
      .notNull()
      .references(() => platformProspects.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: INTERACTION_KINDS }).notNull(),
    description: text('description').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    /** Sem FK (trilha). `null` = sistema. */
    authorUserId: text('author_user_id'),
    authorName: text('author_name'),
    createdAt: createdAt(),
  },
  table => [index('platform_prospect_interactions_prospect_idx').on(table.prospectId, table.occurredAt)],
)

/**
 * Pedido de desconto do vendedor para uma proposta. Só o superadmin decide;
 * no `approved`, os valores que valeram são copiados para
 * `platform_onboarding_proposals.discount` (é dali que cotação, ativação e
 * assinatura leem). Um pedido `pending` por proposta (índice parcial).
 */
export const platformDiscountRequests = pgTable(
  'platform_discount_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => platformOnboardingProposals.id, { onDelete: 'cascade' }),
    prospectId: uuid('prospect_id').references(() => platformProspects.id, { onDelete: 'set null' }),
    sellerUserId: text('seller_user_id').notNull(),
    status: text('status', { enum: DISCOUNT_STATUSES }).notNull().default('pending'),
    setupFeePercent: percent('setup_fee_percent').notNull().default('0'),
    monthlyPercent: percent('monthly_percent').notNull().default('0'),
    /** `null` = permanente (quando há desconto na mensalidade). */
    monthlyMonths: integer('monthly_months'),
    justification: text('justification').notNull(),
    approvedSetupFeePercent: percent('approved_setup_fee_percent'),
    approvedMonthlyPercent: percent('approved_monthly_percent'),
    approvedMonthlyMonths: integer('approved_monthly_months'),
    decisionNote: text('decision_note'),
    rejectionReason: text('rejection_reason'),
    decidedByUserId: text('decided_by_user_id'),
    decidedByName: text('decided_by_name'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    index('platform_discount_requests_status_idx').on(table.status, table.createdAt),
    index('platform_discount_requests_proposal_idx').on(table.proposalId),
    uniqueIndex('platform_discount_requests_pending_key').on(table.proposalId).where(sql`status = 'pending'`),
  ],
)

/** Regra de comissão — linha única `id = 'default'`. Sem linha = `DEFAULT_SALES_COMMISSION_SETTINGS`. */
export const platformSalesSettings = pgTable('platform_sales_settings', {
  id: text('id').primaryKey().default('default'),
  /** % por mensalidade paga (1ª, 2ª, 3ª…). */
  monthlySchedule: jsonb('monthly_schedule').$type<number[]>().notNull().default([50, 20, 10]),
  setupFeePercent: percent('setup_fee_percent').notNull().default('50'),
  updatedByUserId: text('updated_by_user_id'),
  updatedByName: text('updated_by_name'),
  updatedAt: updatedAt(),
})

/**
 * Lançamento de comissão: um por (fatura da plataforma, parte). Idempotente
 * pelo índice único — webhook repetido não duplica. Percentual e base ficam
 * gravados (a regra vigente no pagamento), nunca recalculados.
 */
export const platformSalesCommissions = pgTable(
  'platform_sales_commissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerUserId: text('seller_user_id').notNull(),
    proposalId: uuid('proposal_id').references(() => platformOnboardingProposals.id, { onDelete: 'set null' }),
    organizationId: text('organization_id'),
    /** Sem FK: a trilha do dinheiro sobrevive. */
    chargeId: uuid('charge_id').notNull(),
    chargeKind: text('charge_kind', { enum: ['activation', 'monthly', 'adjustment'] }).notNull(),
    kind: text('kind', { enum: COMMISSION_KINDS }).notNull(),
    /** Nº da mensalidade paga; `null` na adesão. */
    installment: integer('installment'),
    baseAmount: money('base_amount').notNull(),
    percent: percent('percent').notNull(),
    amount: money('amount').notNull(),
    status: text('status', { enum: COMMISSION_STATUSES }).notNull().default('a_pagar'),
    /** `yyyy-MM` do pagamento (São Paulo). */
    referenceMonth: text('reference_month').notNull(),
    chargePaidAt: timestamp('charge_paid_at', { withTimezone: true }),
    payoutDate: date('payout_date'),
    payoutNote: text('payout_note'),
    paidOutByUserId: text('paid_out_by_user_id'),
    paidOutByName: text('paid_out_by_name'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    uniqueIndex('platform_sales_commissions_charge_kind_key').on(table.chargeId, table.kind),
    index('platform_sales_commissions_seller_month_idx').on(table.sellerUserId, table.referenceMonth),
    index('platform_sales_commissions_status_idx').on(table.status),
    index('platform_sales_commissions_proposal_idx').on(table.proposalId),
  ],
)

export const platformProspectsRelations = relations(platformProspects, ({ many, one }) => ({
  interactions: many(platformProspectInteractions),
  proposal: one(platformOnboardingProposals, {
    fields: [platformProspects.proposalId],
    references: [platformOnboardingProposals.id],
  }),
}))

export const platformProspectInteractionsRelations = relations(platformProspectInteractions, ({ one }) => ({
  prospect: one(platformProspects, { fields: [platformProspectInteractions.prospectId], references: [platformProspects.id] }),
}))

export type PlatformSellerRow = typeof platformSellers.$inferSelect
export type PlatformProspectRow = typeof platformProspects.$inferSelect
export type PlatformProspectInteractionRow = typeof platformProspectInteractions.$inferSelect
export type PlatformDiscountRequestRow = typeof platformDiscountRequests.$inferSelect
export type PlatformSalesCommissionRow = typeof platformSalesCommissions.$inferSelect
