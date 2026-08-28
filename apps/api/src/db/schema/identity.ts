import { relations } from 'drizzle-orm'
import { index, numeric, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { organization, user } from './auth'

/**
 * Perfis complementares por vínculo pessoa↔inquilino.
 *
 * Chave composta (userId, organizationId), não userId sozinho: a mesma conta
 * Better Auth pode ser vendedora em um inquilino e associada em outro, então
 * o perfil de vendedor de uma pessoa em X não pode vazar para Y.
 */
export const sellerProfiles = pgTable(
  'seller_profiles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    region: text('region'),
    salesGoal: numeric('sales_goal', { precision: 12, scale: 2 }).notNull().default('0'),
    commissionRate: numeric('commission_rate', { precision: 5, scale: 4 }).notNull().default('0'),
    /** Vínculo com o `Produtor` da Digital Saúde. */
    upstreamProdutorCodigo: text('upstream_produtor_codigo'),
    upstreamProdutorLogin: text('upstream_produtor_login'),
    /** Cifrada: o upstream exige login+senha em query string nos recibos. */
    upstreamProdutorPasswordEncrypted: text('upstream_produtor_password_encrypted'),
  },
  table => [
    primaryKey({ columns: [table.userId, table.organizationId] }),
    index('seller_profiles_produtor_idx').on(table.upstreamProdutorCodigo),
  ],
)

export const clientProfiles = pgTable(
  'client_profiles',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    cpf: text('cpf').notNull(),
    /** Contrato principal exibido na carteirinha. */
    primaryContractCodigo: text('primary_contract_codigo'),
  },
  table => [
    primaryKey({ columns: [table.userId, table.organizationId] }),
    index('client_profiles_cpf_idx').on(table.cpf),
  ],
)

export const sellerProfilesRelations = relations(sellerProfiles, ({ one }) => ({
  user: one(user, { fields: [sellerProfiles.userId], references: [user.id] }),
  organization: one(organization, {
    fields: [sellerProfiles.organizationId],
    references: [organization.id],
  }),
}))

export const clientProfilesRelations = relations(clientProfiles, ({ one }) => ({
  user: one(user, { fields: [clientProfiles.userId], references: [user.id] }),
  organization: one(organization, {
    fields: [clientProfiles.organizationId],
    references: [organization.id],
  }),
}))
