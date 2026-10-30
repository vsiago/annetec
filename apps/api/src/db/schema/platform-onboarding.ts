import type {
  CnpjLookupResult,
  ComplianceChecklist,
  ContractAcceptance,
  ContractorType,
  KybDocumentKind,
  KybDocumentStatus,
  LegalForm,
  OnboardingApplicant,
  OnboardingBrandInput,
  OnboardingCompanyInput,
  OnboardingEventVisibility,
  OnboardingPendingRequest,
  OnboardingStatus,
  PepRelationship,
  PersonPosition,
  PrecheckResult,
  PrecheckSummary,
  ProposalDiscountRecord,
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
import { clubPaymentMethodEnum } from './club-billing'
import { tenantPlans } from './platform'
import { platformFiles } from './platform-infra'

/**
 * Contratação pública da suboperadora + análise cadastral (KYB) — blueprint
 * da plataforma §0.1–§0.3. A proposta vive aqui até o provisionamento; a
 * `organization` só nasce quando a ativação é paga (ou isentada).
 *
 * Só o status da proposta é enum do Postgres (máquina de estados). Os demais
 * enums são texto tipado — o `satisfies` garante que batem com o contracts.
 */
const ONBOARDING_STATUS = [
  'draft',
  'submitted',
  'in_review',
  'pending_info',
  'approved',
  'awaiting_payment',
  'provisioning',
  'active',
  'rejected',
  'canceled',
] as const
const CONTRACTOR_TYPES = ['empresa', 'entidade', 'organizacao'] as const
const LEGAL_FORMS = [
  'ltda',
  'sa',
  'slu',
  'ei',
  'associacao',
  'sindicato',
  'cooperativa',
  'conselho_classe',
  'ong_oscip',
  'fundacao',
  'instituicao_religiosa',
] as const
const PERSON_POSITIONS = [
  'socio_administrador',
  'socio',
  'administrador',
  'presidente',
  'vice_presidente',
  'diretor',
  'tesoureiro',
  'secretario',
  'procurador',
  'outro',
] as const
const PEP_RELATIONSHIPS = ['titular', 'familiar', 'colaborador_estreito'] as const
const KYB_DOCUMENT_KINDS = [
  'contrato_social',
  'estatuto_social',
  'ata_eleicao',
  'requerimento_empresario',
  'cartao_cnpj',
  'comprovante_endereco',
  'documento_identidade',
  'procuracao',
  'registro_sindical',
  'ato_criacao_conselho',
  'qualificacao_oscip',
  'balanco_patrimonial',
  'certidao_negativa',
  'registro_ocb',
  'outro',
] as const
const KYB_DOCUMENT_STATUSES = ['uploaded', 'approved', 'rejected', 'replaced'] as const
const PRECHECK_SUMMARIES = ['pass', 'warn', 'fail'] as const
const EVENT_VISIBILITY = ['public', 'internal'] as const

ONBOARDING_STATUS satisfies readonly OnboardingStatus[]
CONTRACTOR_TYPES satisfies readonly ContractorType[]
LEGAL_FORMS satisfies readonly LegalForm[]
PERSON_POSITIONS satisfies readonly PersonPosition[]
PEP_RELATIONSHIPS satisfies readonly PepRelationship[]
KYB_DOCUMENT_KINDS satisfies readonly KybDocumentKind[]
KYB_DOCUMENT_STATUSES satisfies readonly KybDocumentStatus[]
PRECHECK_SUMMARIES satisfies readonly PrecheckSummary[]
EVENT_VISIBILITY satisfies readonly OnboardingEventVisibility[]

export const platformOnboardingStatusEnum = pgEnum('platform_onboarding_status', ONBOARDING_STATUS)

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

/** Estados em que a proposta ainda "segura" CNPJ e slug (índices únicos parciais abaixo). */
const OPEN_PROPOSAL = sql`status not in ('active', 'rejected', 'canceled')`

export const platformOnboardingProposals = pgTable(
  'platform_onboarding_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Protocolo exibido ao candidato (`ANN-AAMM-XXXXX`). */
    code: text('code').notNull(),
    status: platformOnboardingStatusEnum('status').notNull().default('draft'),
    contractorType: text('contractor_type', { enum: CONTRACTOR_TYPES }).notNull(),
    legalForm: text('legal_form', { enum: LEGAL_FORMS }).notNull(),
    /** Só dígitos. */
    cnpj: text('cnpj').notNull(),
    /** Razão social/fantasia em coluna para a fila buscar e ordenar (a seção inteira fica em `company`). */
    legalName: text('legal_name'),
    tradeName: text('trade_name'),
    planId: text('plan_id').references(() => tenantPlans.id, { onDelete: 'set null' }),
    expectedLives: integer('expected_lives').notNull().default(0),
    /** Forma da ativação e da recorrência. */
    paymentMethod: clubPaymentMethodEnum('payment_method'),
    applicant: jsonb('applicant').$type<OnboardingApplicant>().notNull(),
    company: jsonb('company').$type<OnboardingCompanyInput>(),
    /** Retrato da consulta à Receita (auditoria da pré-checagem). */
    receitaSnapshot: jsonb('receita_snapshot').$type<CnpjLookupResult>(),
    receitaCheckedAt: timestamp('receita_checked_at', { withTimezone: true }),
    brand: jsonb('brand').$type<OnboardingBrandInput>(),
    /** Espelho de `brand.slug` para o índice único parcial. */
    slug: text('slug'),
    contractAcceptance: jsonb('contract_acceptance').$type<ContractAcceptance>(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    prechecks: jsonb('prechecks').$type<PrecheckResult[]>().notNull().default([]),
    precheckSummary: text('precheck_summary', { enum: PRECHECK_SUMMARIES }),
    precheckRanAt: timestamp('precheck_ran_at', { withTimezone: true }),
    hasPep: boolean('has_pep').notNull().default(false),
    checklist: jsonb('checklist').$type<ComplianceChecklist>().notNull().default({}),
    /** Pedido de pendência em aberto (ou o último, com `resolvedAt`). */
    pendingRequest: jsonb('pending_request').$type<OnboardingPendingRequest>(),
    /** Analista (sem FK: a trilha sobrevive à conta). */
    assignedToUserId: text('assigned_to_user_id'),
    assignedToName: text('assigned_to_name'),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    overrideReason: text('override_reason'),
    rejectionReason: text('rejection_reason'),
    decidedByUserId: text('decided_by_user_id'),
    decidedByName: text('decided_by_name'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    /** Inquilino criado no provisionamento. */
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'set null' }),
    provisionedAt: timestamp('provisioned_at', { withTimezone: true }),
    provisioningAttempts: integer('provisioning_attempts').notNull().default(0),
    provisioningError: text('provisioning_error'),
    /** Provisionada sem pagar a ativação (decisão do superadmin, com motivo em `overrideReason`). */
    activationWaived: boolean('activation_waived').notNull().default(false),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    firstSubmittedAt: timestamp('first_submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    /** Última ação do candidato ou do compliance (expiração de rascunho). */
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    source: text('source', { enum: ['site', 'console', 'seed'] }).notNull().default('site'),
    /**
     * Vendedor ANNETEC atribuído (link criado por ele, `source = 'console'`, ou
     * código de indicação no site). Sem FK: a atribuição sobrevive à conta. É a
     * chave da comissão.
     */
    sellerUserId: text('seller_user_id'),
    /** Código de indicação que vinculou a proposta (só quando válido). */
    referralCode: text('referral_code'),
    /** Desconto APROVADO pelo superadmin (cotação, ativação e assinatura leem daqui). */
    discount: jsonb('discount').$type<ProposalDiscountRecord>(),
    /** Link enviado ao cliente pelo fluxo do vendedor (`null` = e-mail ainda retido/não enviado). */
    inviteSentAt: timestamp('invite_sent_at', { withTimezone: true }),
    applicantIp: text('applicant_ip'),
    applicantUserAgent: text('applicant_user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    uniqueIndex('platform_onboarding_code_key').on(table.code),
    index('platform_onboarding_status_idx').on(table.status, table.submittedAt),
    index('platform_onboarding_cnpj_idx').on(table.cnpj),
    index('platform_onboarding_org_idx').on(table.organizationId),
    index('platform_onboarding_seller_idx').on(table.sellerUserId, table.status),
    uniqueIndex('platform_onboarding_open_cnpj_key').on(table.cnpj).where(OPEN_PROPOSAL),
    uniqueIndex('platform_onboarding_open_slug_key')
      .on(table.slug)
      .where(sql`slug is not null and status not in ('active', 'rejected', 'canceled')`),
  ],
)

/** Representantes, sócios e beneficiários finais (uma pessoa acumula papéis). */
export const platformOnboardingPeople = pgTable(
  'platform_onboarding_people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => platformOnboardingProposals.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Só dígitos. */
    cpf: text('cpf').notNull(),
    birthDate: date('birth_date'),
    email: text('email'),
    phone: text('phone'),
    position: text('position', { enum: PERSON_POSITIONS }).notNull(),
    positionOther: text('position_other'),
    isLegalRepresentative: boolean('is_legal_representative').notNull().default(false),
    isPartner: boolean('is_partner').notNull().default(false),
    isBeneficialOwner: boolean('is_beneficial_owner').notNull().default(false),
    ownershipPercent: numeric('ownership_percent', { precision: 5, scale: 2 }),
    actsByPowerOfAttorney: boolean('acts_by_power_of_attorney').notNull().default(false),
    isPep: boolean('is_pep').notNull().default(false),
    pepRole: text('pep_role'),
    pepRelationship: text('pep_relationship', { enum: PEP_RELATIONSHIPS }),
    /** Resultado da última pré-checagem de QSA. */
    qsaMatch: text('qsa_match', { enum: ['matched', 'not_found', 'not_applicable'] }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    index('platform_onboarding_people_proposal_idx').on(table.proposalId),
    uniqueIndex('platform_onboarding_people_proposal_cpf_key').on(table.proposalId, table.cpf),
  ],
)

/** Documento enviado (o binário está em `platform_files`). Reenvio cria linha nova e marca a anterior `replaced`. */
export const platformOnboardingDocuments = pgTable(
  'platform_onboarding_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => platformOnboardingProposals.id, { onDelete: 'cascade' }),
    /** Documento pessoal (identidade, procuração); `null` = da instituição. */
    personId: uuid('person_id').references(() => platformOnboardingPeople.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: KYB_DOCUMENT_KINDS }).notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => platformFiles.id),
    status: text('status', { enum: KYB_DOCUMENT_STATUSES }).notNull().default('uploaded'),
    reviewNote: text('review_note'),
    reviewedByUserId: text('reviewed_by_user_id'),
    reviewedByName: text('reviewed_by_name'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    replacedAt: timestamp('replaced_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [index('platform_onboarding_documents_proposal_idx').on(table.proposalId, table.kind)],
)

/** Timeline da proposta. `public` aparece para o candidato; `internal` só no console. */
export const platformOnboardingEvents = pgTable(
  'platform_onboarding_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    proposalId: uuid('proposal_id')
      .notNull()
      .references(() => platformOnboardingProposals.id, { onDelete: 'cascade' }),
    /** Um de `ONBOARDING_EVENT_TYPES`. */
    type: text('type').notNull(),
    visibility: text('visibility', { enum: EVENT_VISIBILITY }).notNull().default('internal'),
    message: text('message').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>(),
    /** Sem FK: a trilha sobrevive à conta do ator. `null` = candidato ou sistema. */
    actorUserId: text('actor_user_id'),
    actorName: text('actor_name'),
    createdAt: createdAt(),
  },
  table => [index('platform_onboarding_events_proposal_idx').on(table.proposalId, table.createdAt)],
)

export const platformOnboardingProposalsRelations = relations(platformOnboardingProposals, ({ many, one }) => ({
  people: many(platformOnboardingPeople),
  documents: many(platformOnboardingDocuments),
  events: many(platformOnboardingEvents),
  plan: one(tenantPlans, { fields: [platformOnboardingProposals.planId], references: [tenantPlans.id] }),
  organization: one(organization, {
    fields: [platformOnboardingProposals.organizationId],
    references: [organization.id],
  }),
}))

export const platformOnboardingPeopleRelations = relations(platformOnboardingPeople, ({ one }) => ({
  proposal: one(platformOnboardingProposals, {
    fields: [platformOnboardingPeople.proposalId],
    references: [platformOnboardingProposals.id],
  }),
}))

export const platformOnboardingDocumentsRelations = relations(platformOnboardingDocuments, ({ one }) => ({
  proposal: one(platformOnboardingProposals, {
    fields: [platformOnboardingDocuments.proposalId],
    references: [platformOnboardingProposals.id],
  }),
  person: one(platformOnboardingPeople, {
    fields: [platformOnboardingDocuments.personId],
    references: [platformOnboardingPeople.id],
  }),
  file: one(platformFiles, { fields: [platformOnboardingDocuments.fileId], references: [platformFiles.id] }),
}))

export const platformOnboardingEventsRelations = relations(platformOnboardingEvents, ({ one }) => ({
  proposal: one(platformOnboardingProposals, {
    fields: [platformOnboardingEvents.proposalId],
    references: [platformOnboardingProposals.id],
  }),
}))
