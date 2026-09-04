import { relations, sql } from 'drizzle-orm'
import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import type { TenantAddress, TenantBranding } from '@annetec/contracts'
import { tenantKindEnum, tenantStatusEnum } from './enums'
import { organization } from './auth'

/**
 * Planos de assinatura que a Annetec vende aos inquilinos. Sem relação com
 * `organization` — é um catálogo compartilhado.
 */
export const tenantPlans = pgTable('tenant_plans', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  priceMonthly: numeric('price_monthly', { precision: 12, scale: 2 }).notNull(),
  memberLimit: integer('member_limit').notNull(),
  features: jsonb('features').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Dados de negócio do inquilino. 1:1 com `organization` (Better Auth) — a
 * identidade e o slug moram lá; aqui vive tudo que a Digital Saúde e o Better
 * Auth não sabem: CNPJ, endereço, marca, plano contratado, status comercial.
 */
export const tenantProfiles = pgTable(
  'tenant_profiles',
  {
    organizationId: text('organization_id')
      .primaryKey()
      .references(() => organization.id, { onDelete: 'cascade' }),
    legalName: text('legal_name').notNull(),
    document: text('document').notNull(),
    email: text('email').notNull(),
    phone: text('phone').notNull(),
    address: jsonb('address').$type<TenantAddress>().notNull(),
    branding: jsonb('branding').$type<TenantBranding>().notNull(),
    planId: text('plan_id').references(() => tenantPlans.id, { onDelete: 'set null' }),
    status: tenantStatusEnum('status').notNull().default('trial'),
    /**
     * `operator` (padrão) = inquilino contratante. `platform` = a própria
     * Annetec operando como operadora — no máximo uma linha com este valor
     * (índice único parcial abaixo).
     */
    kind: tenantKindEnum('kind').notNull().default('operator'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('tenant_profiles_single_platform')
      .on(table.kind)
      .where(sql`${table.kind} = 'platform'`),
  ],
)

/**
 * Credenciais da Digital Saúde por inquilino. `appToken` e `apiPassword` são
 * gravados cifrados (ver src/lib/crypto.ts) e nunca saem da API.
 */
export const tenantIntegrations = pgTable('tenant_integrations', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull().default('digitalsaude'),
  baseUrl: text('base_url').notNull().default('https://digitalsaude.com.br/api/v2'),
  appTokenEncrypted: text('app_token_encrypted').notNull(),
  apiPasswordEncrypted: text('api_password_encrypted').notNull(),
  defaultGrupoCodigo: text('default_grupo_codigo'),
  defaultFilialCodigo: text('default_filial_codigo'),
  defaultConvenioCodigo: text('default_convenio_codigo'),
  /**
   * Exigido por `GET /plano/procurarPorProduto` e por `POST /produtor/`. Não
   * ficavam guardados: `codigoProduto` vinha de quem chamasse a rota e
   * `grupoProdutorCodigo` era digitado à mão em cada cadastro de vendedor.
   * Ambos são descobríveis no ERP (ver `discoverIntegrationDefaults`).
   */
  defaultProdutoCodigo: text('default_produto_codigo'),
  defaultGrupoProdutorCodigo: text('default_grupo_produtor_codigo'),
  enabled: boolean('enabled').notNull().default(true),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  lastCheckOk: boolean('last_check_ok'),
  /**
   * Quais operações o token deste inquilino realmente pode executar. O 401 da
   * Digital Saúde é por endpoint, não por credencial: o mesmo par que lê todo
   * o catálogo recebe 401 em `POST /calculo/`. Guardar o resultado da sonda
   * evita descobrir isso na frente do cliente, no meio de uma cotação.
   */
  capabilities: jsonb('capabilities').$type<Record<string, boolean>>(),
  capabilitiesCheckedAt: timestamp('capabilities_checked_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tenantProfilesRelations = relations(tenantProfiles, ({ one }) => ({
  organization: one(organization, {
    fields: [tenantProfiles.organizationId],
    references: [organization.id],
  }),
  plan: one(tenantPlans, { fields: [tenantProfiles.planId], references: [tenantPlans.id] }),
  integration: one(tenantIntegrations, {
    fields: [tenantProfiles.organizationId],
    references: [tenantIntegrations.organizationId],
  }),
}))
