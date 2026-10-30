import type {
  AsaasEnvironmentName,
  ClubChargeKind,
  ClubChargeStatus,
  ClubPaymentMethod,
  ClubReceivingWebhookStatus,
  ClubSubscriptionStatus,
  DependentRelationship,
  PaymentEventSource,
  PaymentGatewayProvider,
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
import { organization, user } from './auth'
import { clubPlans } from './business'

/**
 * Clube de Benefícios — assinatura, cobrança e faturamento PRÓPRIOS da Annetec
 * (blueprint §0.4). O gateway (Asaas ou simulado) é só o processador: o ciclo,
 * a régua e a inadimplência vivem aqui. Nada disto toca `contracts`/
 * `beneficiaries` (espelhos do ERP).
 *
 * Os valores dos enums são literais (o drizzle-kit precisa deles em tempo de
 * geração); o `satisfies` abaixo garante que não divergem do contracts.
 */
const SUBSCRIPTION_STATUS = ['pending_payment', 'active', 'past_due', 'suspended', 'canceled'] as const
const CHARGE_STATUS = ['pending', 'paid', 'overdue', 'failed', 'canceled', 'refunded'] as const
const PAYMENT_METHOD = ['pix', 'boleto', 'credit_card'] as const
const GATEWAY_PROVIDER = ['simulated', 'asaas'] as const
const EVENT_SOURCE = ['webhook', 'automation', 'checkout', 'manual', 'simulation'] as const
const RELATIONSHIP = ['conjuge', 'filho', 'enteado', 'pai_mae', 'irmao', 'neto', 'outro'] as const

SUBSCRIPTION_STATUS satisfies readonly ClubSubscriptionStatus[]
CHARGE_STATUS satisfies readonly ClubChargeStatus[]
PAYMENT_METHOD satisfies readonly ClubPaymentMethod[]
GATEWAY_PROVIDER satisfies readonly PaymentGatewayProvider[]
EVENT_SOURCE satisfies readonly PaymentEventSource[]
RELATIONSHIP satisfies readonly DependentRelationship[]

export const clubSubscriptionStatusEnum = pgEnum('club_subscription_status', SUBSCRIPTION_STATUS)
export const clubChargeStatusEnum = pgEnum('club_charge_status', CHARGE_STATUS)
export const clubPaymentMethodEnum = pgEnum('club_payment_method', PAYMENT_METHOD)
export const paymentGatewayProviderEnum = pgEnum('payment_gateway_provider', GATEWAY_PROVIDER)
export const paymentEventSourceEnum = pgEnum('payment_event_source', EVENT_SOURCE)
export const dependentRelationshipEnum = pgEnum('dependent_relationship', RELATIONSHIP)

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
const money = (name: string) => numeric(name, { precision: 12, scale: 2 })

/**
 * Régua de cobrança do inquilino. Sem linha = padrões (o GET não insere; o
 * PATCH e a automação fazem upsert).
 */
export const clubBillingSettings = pgTable('billing_settings', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  /** Override do gateway; `null` = segue a env `PAYMENT_GATEWAY`. */
  gateway: paymentGatewayProviderEnum('gateway'),
  enabledMethods: jsonb('enabled_methods')
    .$type<ClubPaymentMethod[]>()
    .notNull()
    .default(['pix', 'boleto', 'credit_card']),
  generateDaysBefore: integer('generate_days_before').notNull().default(10),
  reminderDaysBefore: integer('reminder_days_before').notNull().default(3),
  maxCardRetries: integer('max_card_retries').notNull().default(3),
  cardRetryIntervalHours: integer('card_retry_interval_hours').notNull().default(24),
  suspendAfterDays: integer('suspend_after_days').notNull().default(15),
  cancelAfterDays: integer('cancel_after_days').notNull().default(60),
  boletoDueDays: integer('boleto_due_days').notNull().default(3),
  finePercent: numeric('fine_percent', { precision: 5, scale: 2 }).notNull().default('2'),
  interestMonthlyPercent: numeric('interest_monthly_percent', { precision: 5, scale: 2 }).notNull().default('1'),
  lastAutomationRunAt: timestamp('last_automation_run_at', { withTimezone: true }),
  updatedAt: updatedAt(),
})

const ASAAS_ENVIRONMENT = ['sandbox', 'production'] as const
const RECEIVING_WEBHOOK_STATUS = ['ativo', 'pendente', 'erro'] as const
const RECEIVING_ACCOUNT_SOURCE = ['api_key', 'subaccount'] as const
ASAAS_ENVIRONMENT satisfies readonly AsaasEnvironmentName[]
RECEIVING_WEBHOOK_STATUS satisfies readonly ClubReceivingWebhookStatus[]

/** Retrato de `GET /myAccount/status` do Asaas (só a situação cadastral). */
export interface AsaasAccountStatusSnapshot {
  id?: string | null
  commercialInfo?: string | null
  bankAccountInfo?: string | null
  documentation?: string | null
  general?: string | null
}

/** Retrato de `GET /myAccount/documents` da subconta (conta gerenciada). Sem dado pessoal além do nome do responsável. */
export interface ManagedAccountDocumentsSnapshot {
  rejectReasons: string | null
  groups: {
    id: string
    status: string
    type: string | null
    title: string | null
    description: string | null
    responsibleName: string | null
    onboardingUrl: string | null
    onboardingUrlExpirationDate: string | null
  }[]
}

/**
 * Conta Asaas PRÓPRIA do clube, onde caem as mensalidades dos associados
 * (1:1 com `organization`). Sem linha = recebimento não configurado: com
 * gateway `asaas`, adesão e cobrança ficam bloqueadas — nunca caem na conta
 * da ANNETEC (`ASAAS_API_KEY` é só da plataforma).
 *
 * Chave e token do webhook gravados cifrados (`lib/crypto.ts`), nunca saem da
 * API. `source = 'subaccount'` fica reservado para quando a ANNETEC criar a
 * subconta do clube pela API (a chave devolvida na criação alimenta esta
 * mesma linha).
 *
 * Conta GERENCIADA (`source = 'subaccount'`, `modules/managed-account`): a
 * subconta foi criada pela API na conta da ANNETEC a pedido do clube; a chave
 * devolvida na criação fica aqui (cifrada), com a carteira (`wallet_id`), o
 * retrato dos documentos exigidos pelo Asaas e o débito automático das
 * faturas da ANNETEC (ligado na aprovação).
 */
export const tenantAsaasAccounts = pgTable('tenant_asaas_accounts', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  source: text('source', { enum: RECEIVING_ACCOUNT_SOURCE }).notNull().default('api_key'),
  apiKeyEncrypted: text('api_key_encrypted').notNull(),
  env: text('env', { enum: ASAAS_ENVIRONMENT }).notNull(),
  /** 4 últimos caracteres da chave. */
  keyHint: text('key_hint').notNull(),
  /** Id da conta no Asaas (`GET /myAccount/status` → `id`). */
  asaasAccountId: text('asaas_account_id'),
  accountName: text('account_name'),
  /** Só dígitos. */
  accountCpfCnpj: text('account_cpf_cnpj'),
  accountEmail: text('account_email'),
  accountStatusJson: jsonb('account_status_json').$type<AsaasAccountStatusSnapshot>(),
  webhookId: text('webhook_id'),
  /** `authToken` do webhook do clube (volta no header `asaas-access-token`). */
  webhookTokenEncrypted: text('webhook_token_encrypted'),
  webhookStatus: text('webhook_status', { enum: RECEIVING_WEBHOOK_STATUS }).notNull().default('pendente'),
  webhookLastError: text('webhook_last_error'),
  /** Id do usuário que conectou (sem FK: o registro sobrevive à conta). */
  connectedBy: text('connected_by'),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  /** Carteira da conta no Asaas (`walletId`) — conta gerenciada. */
  walletId: text('wallet_id'),
  /** Débito automático das faturas da ANNETEC no saldo (só conta gerenciada). */
  autoDebitEnabled: boolean('auto_debit_enabled').notNull().default(false),
  /** Retrato de `GET /myAccount/documents` (conta gerenciada). */
  documentsJson: jsonb('documents_json').$type<ManagedAccountDocumentsSnapshot>(),
  documentsCheckedAt: timestamp('documents_checked_at', { withTimezone: true }),
  /** Pedido (`managed_account_requests.id`) que criou a conta gerenciada. Sem FK (histórico). */
  managedRequestId: uuid('managed_request_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/** Assinatura do clube: retrato do plano na contratação + titular + cartão salvo (token, nunca o número). */
export const clubSubscriptions = pgTable(
  'club_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    clubPlanId: uuid('club_plan_id').references(() => clubPlans.id, { onDelete: 'set null' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    planName: text('plan_name').notNull(),
    planPriceMonthly: money('plan_price_monthly').notNull(),
    dependentPriceMonthly: money('dependent_price_monthly').notNull().default('0'),
    /** Retrato de `includedDependents` do plano na contratação (0 = todo dependente paga). */
    includedDependents: integer('included_dependents').notNull().default(0),
    /** Retrato da adesão cobrada na 1ª cobrança (0 = sem adesão ou isenta). */
    enrollmentFee: money('enrollment_fee').notNull().default('0'),
    amount: money('amount').notNull(),
    paymentMethod: clubPaymentMethodEnum('payment_method').notNull(),
    status: clubSubscriptionStatusEnum('status').notNull().default('pending_payment'),
    dueDay: integer('due_day').notNull(),
    holderName: text('holder_name').notNull(),
    /** Só dígitos. */
    holderCpf: text('holder_cpf').notNull(),
    holderEmail: text('holder_email').notNull(),
    holderPhone: text('holder_phone'),
    holderBirthDate: date('holder_birth_date'),
    /** Carteirinha do titular, emitida na ativação. */
    cardNumber: text('card_number'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    currentPeriodStart: date('current_period_start'),
    currentPeriodEnd: date('current_period_end'),
    nextDueDate: date('next_due_date'),
    gatewayProvider: paymentGatewayProviderEnum('gateway_provider').notNull(),
    gatewayCustomerId: text('gateway_customer_id'),
    /** Cartão salvo para a recorrência: token do gateway + bandeira/finais/validade. */
    cardToken: text('card_token'),
    cardBrand: text('card_brand'),
    cardLast4: text('card_last4'),
    /** `MM/YYYY`. */
    cardExpiry: text('card_expiry'),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    /** `checkout` | `seed` | `admin`. */
    source: text('source').notNull().default('checkout'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    index('club_subscriptions_org_status_idx').on(table.organizationId, table.status),
    index('club_subscriptions_org_user_idx').on(table.organizationId, table.userId),
    index('club_subscriptions_org_next_due_idx').on(table.organizationId, table.nextDueDate),
    index('club_subscriptions_org_cpf_idx').on(table.organizationId, table.holderCpf),
    uniqueIndex('club_subscriptions_org_card_key').on(table.organizationId, table.cardNumber),
  ],
)

export const clubSubscriptionDependents = pgTable(
  'club_subscription_dependents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => clubSubscriptions.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    cpf: text('cpf'),
    birthDate: date('birth_date'),
    relationship: dependentRelationshipEnum('relationship').notNull(),
    /** 1..n, na ordem do checkout. */
    position: integer('position').notNull(),
    cardNumber: text('card_number'),
    createdAt: createdAt(),
  },
  table => [
    index('club_subscription_dependents_sub_idx').on(table.subscriptionId),
    uniqueIndex('club_subscription_dependents_org_card_key').on(table.organizationId, table.cardNumber),
  ],
)

const CHARGE_KIND = ['cycle', 'one_off'] as const
CHARGE_KIND satisfies readonly ClubChargeKind[]

/**
 * Cobrança. `kind = 'cycle'`: mensalidade de um período `[period_start,
 * period_end)` — UMA por período (unique parcial abaixo; vale também para a
 * mensalidade adiantada pelo admin, que é a mesma linha que a automação
 * geraria). `kind = 'one_off'`: avulsa do admin — período vazio
 * (`period_start = period_end` = data de emissão), fora do unique, sem efeito
 * na assinatura. Segunda via/troca de método reaproveitam a linha.
 */
export const clubCharges = pgTable(
  'club_charges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => clubSubscriptions.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: CHARGE_KIND }).notNull().default('cycle'),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    dueDate: date('due_date').notNull(),
    amount: money('amount').notNull(),
    method: clubPaymentMethodEnum('method').notNull(),
    status: clubChargeStatusEnum('status').notNull().default('pending'),
    /** Mensalidade: "Clube · Plano X · mm/aaaa"; avulsa: o texto do admin (até 80). */
    description: text('description').notNull(),
    /** Chave do cliente na cobrança gerada pelo admin (clique duplo devolve a mesma linha). */
    idempotencyKey: text('idempotency_key'),
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
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paidAmount: money('paid_amount'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    uniqueIndex('club_charges_sub_period_key').on(table.subscriptionId, table.periodStart).where(sql`kind = 'cycle'`),
    uniqueIndex('club_charges_sub_idempotency_key')
      .on(table.subscriptionId, table.idempotencyKey)
      .where(sql`idempotency_key is not null`),
    index('club_charges_org_status_due_idx').on(table.organizationId, table.status, table.dueDate),
    uniqueIndex('club_charges_gateway_key').on(table.gatewayProvider, table.gatewayChargeId),
    index('club_charges_org_paid_idx').on(table.organizationId, table.paidAt),
  ],
)

/** Timeline de pagamento. `payload` NUNCA contém dados de cartão. */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => clubSubscriptions.id, { onDelete: 'set null' }),
    chargeId: uuid('charge_id').references(() => clubCharges.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    source: paymentEventSourceEnum('source').notNull(),
    gatewayProvider: paymentGatewayProviderEnum('gateway_provider'),
    /** Id do evento no gateway (dedupe de webhook at-least-once). */
    externalEventId: text('external_event_id'),
    message: text('message').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    /** Sem FK: a trilha sobrevive ao apagamento da conta do ator. */
    actorUserId: text('actor_user_id'),
    createdAt: createdAt(),
  },
  table => [
    uniqueIndex('payment_events_gateway_event_key').on(table.gatewayProvider, table.externalEventId),
    index('payment_events_org_created_idx').on(table.organizationId, table.createdAt),
    index('payment_events_sub_created_idx').on(table.subscriptionId, table.createdAt),
    index('payment_events_charge_idx').on(table.chargeId),
  ],
)

/**
 * Régua "assine seu plano" (associado sem assinatura viva): uma linha por
 * e-mail da régua (`d0` boas-vindas, `d1`, `d3`, `d7`) por pessoa e clube.
 * A linha é gravada ANTES do envio (unique abaixo = idempotência entre o
 * timer da automação e o envio na hora do cadastro); falha de envio fica
 * registrada em `status` e não vira reenvio.
 */
export const clubOnboardingEmails = pgTable(
  'club_onboarding_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /**
     * Rodada da régua (`member.onboardingRound`): 1 na entrada no clube; cada
     * retorno de associado excluído abre a seguinte — as linhas antigas ficam
     * como histórico e não contam para a rodada nova.
     */
    round: integer('round').notNull().default(1),
    /** `d0` | `d1` | `d3` | `d7`. */
    step: text('step').notNull(),
    /** `sending` (reservado) → `sent` | `failed` | `skipped`. */
    status: text('status').notNull().default('sending'),
    /** Situação do associado no envio: `none` | `pending_payment`. */
    accessStatus: text('access_status'),
    /** Linha de `platform_email_outbox` (sem FK: a caixa de saída pode ser limpa). */
    emailId: text('email_id'),
    reason: text('reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    uniqueIndex('club_onboarding_emails_org_user_round_step_key').on(
      table.organizationId,
      table.userId,
      table.round,
      table.step,
    ),
    index('club_onboarding_emails_org_created_idx').on(table.organizationId, table.createdAt),
  ],
)

export const clubSubscriptionsRelations = relations(clubSubscriptions, ({ many, one }) => ({
  dependents: many(clubSubscriptionDependents),
  charges: many(clubCharges),
  events: many(paymentEvents),
  plan: one(clubPlans, { fields: [clubSubscriptions.clubPlanId], references: [clubPlans.id] }),
  user: one(user, { fields: [clubSubscriptions.userId], references: [user.id] }),
}))

export const clubSubscriptionDependentsRelations = relations(clubSubscriptionDependents, ({ one }) => ({
  subscription: one(clubSubscriptions, {
    fields: [clubSubscriptionDependents.subscriptionId],
    references: [clubSubscriptions.id],
  }),
}))

export const clubChargesRelations = relations(clubCharges, ({ many, one }) => ({
  subscription: one(clubSubscriptions, { fields: [clubCharges.subscriptionId], references: [clubSubscriptions.id] }),
  events: many(paymentEvents),
}))

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
  subscription: one(clubSubscriptions, { fields: [paymentEvents.subscriptionId], references: [clubSubscriptions.id] }),
  charge: one(clubCharges, { fields: [paymentEvents.chargeId], references: [clubCharges.id] }),
}))
