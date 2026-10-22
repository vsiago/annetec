import { sql } from 'drizzle-orm'
import { boolean, check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Tabelas do Better Auth (https://better-auth.com), versão 1.7.2.
 *
 * Campos e nomes de modelo aqui são ditados pelo Better Auth, não por nós —
 * conferidos direto contra `@better-auth/core/dist/db/schema/*.d.mts` e contra
 * o plugin `organization` instalado, para casar exatamente com o que o
 * `drizzleAdapter` espera (ver `src/lib/auth.ts`). Não renomear colunas nem
 * adicionar `NOT NULL` além do que o Better Auth já garante — ele é quem
 * escreve nestas tabelas.
 *
 * Duas extensões nossas, feitas pelo mecanismo oficial de `additionalFields`:
 *   - `user.role`      → plugin `admin`: 'user' (padrão) | 'platform_admin' | 'superadmin'.
 *                        É o `platformRole`: só a equipe Annetec tem um valor
 *                        diferente de 'user'.
 *   - `member.role`    → plugin `organization`: 'admin' | 'seller' | 'client'.
 *                        É o papel da pessoa DENTRO do inquilino (organization).
 *
 * Um inquilino é uma `organization`. A pessoa pode ser membro de mais de uma
 * (ex.: mesmo e-mail é cliente em duas administradoras) — uma única conta,
 * múltiplos vínculos, exatamente o modelo que o plugin `organization` propõe.
 * Os dados de negócio do inquilino (CNPJ, endereço, marca, plano) NÃO vivem
 * aqui: ficam em `tenant_profiles` (platform.ts), 1:1 com `organization.id`.
 */

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  phone: text('phone'),
  /** Papel de plataforma (equipe Annetec). Só o plugin `admin` escreve aqui. */
  role: text('role').notNull().default('user'),
  banned: boolean('banned').default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  /** Adicionado pelo plugin `organization`: inquilino "ativo" da sessão. */
  activeOrganizationId: text('active_organization_id'),
  /** Adicionado pelo plugin `admin`: preenchido durante impersonação. */
  impersonatedBy: text('impersonated_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  issuer: text('issuer').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  /** Hash scrypt do provider `credential` (e-mail/senha). */
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Um inquilino Annetec. */
export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  /** Não usado pela Annetec (dados de negócio ficam em `tenant_profiles`); a coluna existe porque o plugin sempre lê/grava nela. */
  metadata: text('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
})

/** Situação do vínculo com o clube — ver `member.accessStatus`. */
export const MEMBER_ACCESS_STATUSES = ['active', 'removed', 'blocked'] as const
export type MemberAccessStatusValue = (typeof MEMBER_ACCESS_STATUSES)[number]

/**
 * Vínculo pessoa↔inquilino. `role`: 'admin' | 'seller' | 'client'.
 *
 * As colunas abaixo de `role` são NOSSAS, geridas só por escrita direta
 * (`modules/users/member-access.ts`, `users/service.ts`,
 * `tenants/members.service.ts`) — de propósito NÃO declaradas ao Better Auth
 * como `additionalFields` (ele nunca as escreve; os defaults cobrem o
 * `addMember`). "Inativo" aqui é por INQUILINO; o plugin `admin` (banimento)
 * é por conta inteira, em todo lugar que ela é membro — a coisa errada para
 * "essa pessoa está desativada neste inquilino".
 *
 * `accessStatus` é a fonte da verdade do vínculo:
 *  - `active`: entra normalmente;
 *  - `removed`: excluído pelo clube (associado) ou desativado (equipe).
 *    Associado que volta pelo site (Google, CPF + e-mail, senha, checkout com
 *    e-mail + CPF) tem ESTE mesmo vínculo reativado, sem assinatura;
 *  - `blocked`: bloqueado pelo clube — nenhum login nem recadastro.
 * `active` é coluna GERADA (`access_status = 'active'`): os leitores antigos
 * (regra do último responsável, listagens) continuam valendo e é impossível
 * os dois divergirem — o Drizzle nem deixa gravar em `active`.
 *
 * `onboardingRound`/`onboardingStartedAt`: rodada atual da régua "assine seu
 * plano" (`club_onboarding_emails.round`). Cada retorno de associado
 * removido abre uma rodada nova, contada a partir de `onboardingStartedAt`
 * (nulo = desde `createdAt`).
 */
export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('client'),
    accessStatus: text('access_status').$type<MemberAccessStatusValue>().notNull().default('active'),
    active: boolean('active')
      .notNull()
      .generatedAlwaysAs(sql`access_status = 'active'`),
    /** Última mudança de `accessStatus` (exclusão, bloqueio, retorno). */
    accessChangedAt: timestamp('access_changed_at', { withTimezone: true }),
    onboardingRound: integer('onboarding_round').notNull().default(1),
    onboardingStartedAt: timestamp('onboarding_started_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [check('member_access_status_check', sql`${table.accessStatus} in ('active', 'removed', 'blocked')`)],
)

export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  inviterId: text('inviter_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
