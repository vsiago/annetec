import { relations } from 'drizzle-orm'
import {
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
import type { DsBeneficiario, DsContrato } from '@annetec/contracts'
import { beneficiaryKindEnum, contractStatusEnum } from './enums'
import { organization, user } from './auth'

/**
 * Espelho local dos contratos da Digital Saúde.
 *
 * A fonte da verdade continua sendo o ERP: esta tabela existe para (a) permitir
 * listagem/filtro/relatório sem estourar a API upstream, (b) ligar contrato a
 * usuário e vendedor da Annetec e (c) manter histórico auditável. `raw` guarda
 * a resposta original para que nenhum campo se perca em mudanças de mapper.
 */
export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    upstreamCodigo: text('upstream_codigo').notNull(),
    proposalNumber: text('proposal_number'),
    holderName: text('holder_name'),
    holderCpf: text('holder_cpf'),
    status: contractStatusEnum('status').notNull().default('desconhecido'),
    upstreamStatus: text('upstream_status'),
    signedAt: date('signed_at'),
    dueDay: integer('due_day'),
    monthlyValue: numeric('monthly_value', { precision: 12, scale: 2 }),
    outstandingBalance: numeric('outstanding_balance', { precision: 12, scale: 2 }),
    planCodigo: text('plan_codigo'),
    planName: text('plan_name'),
    convenioCodigo: text('convenio_codigo'),
    convenioName: text('convenio_name'),
    sellerUpstreamCodigo: text('seller_upstream_codigo'),
    /** Vendedor Annetec responsável, quando a venda nasceu no CRM. */
    sellerUserId: text('seller_user_id').references(() => user.id, { onDelete: 'set null' }),
    /** Associado dono do contrato no portal. */
    clientUserId: text('client_user_id').references(() => user.id, { onDelete: 'set null' }),
    raw: jsonb('raw').$type<DsContrato>(),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('contracts_org_upstream_key').on(table.organizationId, table.upstreamCodigo),
    index('contracts_org_status_idx').on(table.organizationId, table.status),
    index('contracts_holder_cpf_idx').on(table.organizationId, table.holderCpf),
    index('contracts_client_user_idx').on(table.clientUserId),
  ],
)

export const beneficiaries = pgTable(
  'beneficiaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contractId: uuid('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    upstreamCodigo: text('upstream_codigo'),
    kind: beneficiaryKindEnum('kind').notNull().default('dependente'),
    name: text('name').notNull(),
    cpf: text('cpf'),
    birthDate: date('birth_date'),
    motherName: text('mother_name'),
    relationship: text('relationship'),
    gender: text('gender'),
    email: text('email'),
    phone: text('phone'),
    monthlyFee: numeric('monthly_fee', { precision: 12, scale: 2 }),
    effectiveDate: date('effective_date'),
    provisionalCardUrl: text('provisional_card_url'),
    status: text('status'),
    raw: jsonb('raw').$type<DsBeneficiario>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('beneficiaries_contract_idx').on(table.contractId),
    index('beneficiaries_cpf_idx').on(table.cpf),
  ],
)

export const contractsRelations = relations(contracts, ({ many, one }) => ({
  beneficiaries: many(beneficiaries),
  seller: one(user, { fields: [contracts.sellerUserId], references: [user.id] }),
  client: one(user, { fields: [contracts.clientUserId], references: [user.id] }),
}))

export const beneficiariesRelations = relations(beneficiaries, ({ one }) => ({
  contract: one(contracts, { fields: [beneficiaries.contractId], references: [contracts.id] }),
}))
