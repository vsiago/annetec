import type {
  CandidaturaAtuacao,
  CandidaturaDocumentoKind,
  CandidaturaEndereco,
  CandidaturaStatus,
  CandidaturaTipoPessoa,
  EscopoVendas,
} from '@annetec/contracts'
import {
  CANDIDATURA_ATUACOES,
  CANDIDATURA_DOCUMENTO_KINDS,
  CANDIDATURA_STATUS,
  CANDIDATURA_TIPOS_PESSOA,
  ESCOPOS_VENDAS,
} from '@annetec/contracts'
import { relations, sql } from 'drizzle-orm'
import { check, date, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { organization, user } from './auth'
import { platformFiles } from './platform-infra'
import { vendasAgentes, vendasCorretoras } from './vendas-rede'

/**
 * CANDIDATURAS DA REDE COMERCIAL ("Seja um parceiro comercial") — ver
 * `docs/rede-comercial.md`. Rascunho público retomável por chave HMAC; ao ser
 * aprovada vira agente (e corretora, se for o caso) pelo fluxo existente.
 */

const CANDIDATURA_DOCUMENTO_STATUS = ['uploaded', 'replaced'] as const
export type CandidaturaDocumentoStatus = (typeof CANDIDATURA_DOCUMENTO_STATUS)[number]

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

const inList = (column: unknown, values: readonly string[]) =>
  sql`${column} in (${sql.join(
    values.map(value => sql.raw(`'${value}'`)),
    sql.raw(', '),
  )})`

export interface CandidaturaDadosExtras {
  experiencia?: string
  regiaoAtuacao?: string
  comoConheceu?: string
}

export interface CandidaturaAceiteRegistro {
  termosVersao: string
  /** sha256 hex do texto de `CANDIDATURA_TERMOS` aceito. */
  termosHash: string
  nomeAssinatura: string
  aceitoEm: string
  ip: string | null
  userAgent: string | null
}

export const vendasCandidaturas = pgTable(
  'vendas_candidaturas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: text('scope', { enum: ESCOPOS_VENDAS }).$type<EscopoVendas>().notNull(),
    tenantId: text('tenant_id').references(() => organization.id, { onDelete: 'cascade' }),
    status: text('status', { enum: CANDIDATURA_STATUS }).$type<CandidaturaStatus>().notNull().default('rascunho'),
    tipoPessoa: text('tipo_pessoa', { enum: CANDIDATURA_TIPOS_PESSOA }).$type<CandidaturaTipoPessoa>().notNull(),
    atuacao: text('atuacao', { enum: CANDIDATURA_ATUACOES }).$type<CandidaturaAtuacao>().notNull(),
    nome: text('nome').notNull(),
    /** Minúsculo. */
    email: text('email').notNull(),
    telefone: text('telefone').notNull(),
    /** 11 dígitos (PF: do candidato; PJ: do representante). */
    cpf: text('cpf').notNull(),
    /** 14 dígitos; só PJ. */
    cnpj: text('cnpj'),
    razaoSocial: text('razao_social'),
    nomeFantasia: text('nome_fantasia'),
    dataNascimento: date('data_nascimento'),
    endereco: jsonb('endereco').$type<CandidaturaEndereco | null>(),
    codigoIndicacao: text('codigo_indicacao'),
    indicadoPorAgenteId: uuid('indicado_por_agente_id').references(() => vendasAgentes.id, { onDelete: 'set null' }),
    dados: jsonb('dados').$type<CandidaturaDadosExtras>().notNull().default({}),
    aceite: jsonb('aceite').$type<CandidaturaAceiteRegistro | null>(),
    origemIp: text('origem_ip'),
    origemUserAgent: text('origem_user_agent'),
    enviadaEm: timestamp('enviada_em', { withTimezone: true }),
    decididaEm: timestamp('decidida_em', { withTimezone: true }),
    decididaPorUserId: text('decidida_por_user_id').references(() => user.id, { onDelete: 'set null' }),
    motivoRecusa: text('motivo_recusa'),
    observacoesDecisao: text('observacoes_decisao'),
    agenteId: uuid('agente_id').references(() => vendasAgentes.id, { onDelete: 'set null' }),
    corretoraId: uuid('corretora_id').references(() => vendasCorretoras.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    index('vendas_candidaturas_scope_status_idx').on(table.scope, table.tenantId, table.status, table.createdAt.desc()),
    uniqueIndex('vendas_candidaturas_recebida_email_key')
      .on(table.scope, sql`coalesce(${table.tenantId}, '')`, table.email)
      .where(sql`${table.status} = 'recebida'`),
    check('vendas_candidaturas_scope_check', inList(table.scope, ESCOPOS_VENDAS)),
    check(
      'vendas_candidaturas_scope_tenant_check',
      sql`(${table.scope} = 'platform' and ${table.tenantId} is null) or (${table.scope} = 'tenant' and ${table.tenantId} is not null)`,
    ),
    check('vendas_candidaturas_status_check', inList(table.status, CANDIDATURA_STATUS)),
    check('vendas_candidaturas_tipo_pessoa_check', inList(table.tipoPessoa, CANDIDATURA_TIPOS_PESSOA)),
    check('vendas_candidaturas_atuacao_check', inList(table.atuacao, CANDIDATURA_ATUACOES)),
  ],
)

export const vendasCandidaturaDocumentos = pgTable(
  'vendas_candidatura_documentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    candidaturaId: uuid('candidatura_id')
      .notNull()
      .references(() => vendasCandidaturas.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: CANDIDATURA_DOCUMENTO_KINDS }).$type<CandidaturaDocumentoKind>().notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => platformFiles.id),
    status: text('status', { enum: CANDIDATURA_DOCUMENTO_STATUS }).$type<CandidaturaDocumentoStatus>().notNull().default('uploaded'),
    createdAt: createdAt(),
    replacedAt: timestamp('replaced_at', { withTimezone: true }),
  },
  table => [
    index('vendas_candidatura_documentos_candidatura_idx').on(table.candidaturaId),
    check('vendas_candidatura_documentos_kind_check', inList(table.kind, CANDIDATURA_DOCUMENTO_KINDS)),
    check('vendas_candidatura_documentos_status_check', inList(table.status, CANDIDATURA_DOCUMENTO_STATUS)),
  ],
)

export const vendasCandidaturasRelations = relations(vendasCandidaturas, ({ many, one }) => ({
  documentos: many(vendasCandidaturaDocumentos),
  indicadoPor: one(vendasAgentes, { fields: [vendasCandidaturas.indicadoPorAgenteId], references: [vendasAgentes.id] }),
}))

export const vendasCandidaturaDocumentosRelations = relations(vendasCandidaturaDocumentos, ({ one }) => ({
  candidatura: one(vendasCandidaturas, { fields: [vendasCandidaturaDocumentos.candidaturaId], references: [vendasCandidaturas.id] }),
  arquivo: one(platformFiles, { fields: [vendasCandidaturaDocumentos.fileId], references: [platformFiles.id] }),
}))
