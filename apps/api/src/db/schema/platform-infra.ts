import type { EmailProvider, EmailStatus, FilePurpose, FileVisibility, StorageDriver } from '@annetec/contracts'
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { organization } from './auth'

/**
 * Infraestrutura da plataforma (blueprint da plataforma §0.7): índice de
 * arquivos guardados no Storage e caixa de saída de e-mail. Genéricas — hoje
 * servem à contratação (KYB, logo) e à cobrança da plataforma (faturas).
 *
 * Enums como texto tipado (sem tipo do Postgres): crescem sem ALTER TYPE.
 */
const STORAGE_DRIVERS = ['local', 'supabase', 's3'] as const
const FILE_VISIBILITY = ['private', 'public'] as const
const FILE_PURPOSES = ['kyb_document', 'brand_logo'] as const
const EMAIL_PROVIDERS = ['outbox', 'resend', 'sendgrid'] as const
const EMAIL_STATUSES = ['simulated', 'queued', 'sent', 'failed'] as const

STORAGE_DRIVERS satisfies readonly StorageDriver[]
FILE_VISIBILITY satisfies readonly FileVisibility[]
FILE_PURPOSES satisfies readonly FilePurpose[]
EMAIL_PROVIDERS satisfies readonly EmailProvider[]
EMAIL_STATUSES satisfies readonly EmailStatus[]

/**
 * Um arquivo no Storage (disco local fora do git, Supabase Storage ou S3).
 * O conteúdo nunca passa pelo banco: aqui só o índice. `private` só sai por
 * rota autorizada (chave da proposta ou sessão da plataforma); `public` (logo)
 * sai em `GET /api/v1/public/arquivos/:id`.
 *
 * `ownerType`/`ownerId` sem FK (tabela genérica, evita ciclo de import):
 * `proposal` + id da proposta enquanto a organização não existe.
 */
export const platformFiles = pgTable(
  'platform_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    driver: text('driver', { enum: STORAGE_DRIVERS }).notNull(),
    /** Bucket (supabase/s3); `null` no disco local. */
    bucket: text('bucket'),
    /** Caminho dentro do driver: `kyb/<proposalId>/<uuid>.<ext>`, `logos/<uuid>.<ext>`. */
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** sha256 hex do conteúdo (integridade e dedupe). */
    sha256: text('sha256').notNull(),
    visibility: text('visibility', { enum: FILE_VISIBILITY }).notNull().default('private'),
    purpose: text('purpose', { enum: FILE_PURPOSES }).notNull(),
    ownerType: text('owner_type', { enum: ['proposal', 'organization'] }).notNull(),
    ownerId: text('owner_id').notNull(),
    /** Preenchido no provisionamento (o arquivo passa a ser do inquilino). */
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'set null' }),
    /** `applicant` (candidato pela chave) ou `user.id` de quem enviou. */
    uploadedBy: text('uploaded_by').notNull(),
    /** Exclusão lógica; o binário é removido do driver pelo serviço. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('platform_files_owner_idx').on(table.ownerType, table.ownerId),
    index('platform_files_org_idx').on(table.organizationId),
  ],
)

/**
 * Caixa de saída. TODO e-mail transacional da plataforma nasce aqui; com
 * `EMAIL_PROVIDER=outbox` (padrão, demo) ele só fica gravado (`simulated`) e
 * visível no console. Com provedor real, o corpo gravado sai com os segredos
 * mascarados (senha provisória) — ver blueprint §0.7.
 */
export const platformEmailOutbox = pgTable(
  'platform_email_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Um de `EMAIL_TEMPLATES`. */
    template: text('template').notNull(),
    toEmail: text('to_email').notNull(),
    toName: text('to_name'),
    subject: text('subject').notNull(),
    bodyText: text('body_text').notNull(),
    bodyHtml: text('body_html'),
    provider: text('provider', { enum: EMAIL_PROVIDERS }).notNull(),
    status: text('status', { enum: EMAIL_STATUSES }).notNull(),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    organizationId: text('organization_id').references(() => organization.id, { onDelete: 'set null' }),
    /** Sem FK (genérica): proposta relacionada, quando houver. */
    proposalId: uuid('proposal_id'),
    /** `charge`, `subscription`, `proposal`… + id, para o console linkar. */
    relatedType: text('related_type'),
    relatedId: text('related_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('platform_email_outbox_created_idx').on(table.createdAt),
    index('platform_email_outbox_proposal_idx').on(table.proposalId),
    index('platform_email_outbox_org_idx').on(table.organizationId, table.createdAt),
  ],
)
