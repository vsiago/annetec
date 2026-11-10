import type {
  AtribuicaoLead,
  ConversaoLead,
  DistribuicaoLeads,
  EnderecoVendas,
  EscopoVendas,
  EtapaLead,
  ModeloMensagem,
  OrigemLead,
  OverridesComissao,
  PapelComercial,
  ParteComissao,
  RepasseVendas,
  ResultadoBalcao,
  StatusComissao,
  StatusRede,
  TipoComissao,
  TipoEventoLead,
  TipoLead,
  TipoUnidade,
} from '@annetec/contracts'
import {
  DISTRIBUICOES_LEADS,
  ESCOPOS_VENDAS,
  ETAPAS_LEAD,
  ORIGENS_LEAD,
  PAPEIS_COMERCIAIS,
  PARTES_COMISSAO,
  RESULTADOS_BALCAO,
  STATUS_COMISSAO,
  STATUS_REDE,
  TIPOS_COMISSAO,
  TIPOS_EVENTO_LEAD,
  TIPOS_LEAD,
  TIPOS_UNIDADE,
} from '@annetec/contracts'
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
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
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { organization, user } from './auth'

/**
 * REDE COMERCIAL (`vendas-rede`) — ver `docs/rede-comercial.md`.
 *
 * Toda tabela carrega `scope` (`platform` | `tenant`) + `tenant_id`
 * (`organization.id`; nulo no escopo platform). O mesmo modelo serve a ANNETEC
 * vendendo planos da plataforma e a cada clube vendendo planos de associado.
 *
 * Enums como texto tipado + CHECK (mesmo padrão de `platform-sales.ts`).
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
const money = (name: string) => numeric(name, { precision: 12, scale: 2 })

const scopeColumn = () => text('scope', { enum: ESCOPOS_VENDAS }).$type<EscopoVendas>().notNull()
const tenantIdColumn = () => text('tenant_id').references(() => organization.id, { onDelete: 'cascade' })

const inList = (column: unknown, values: readonly string[]) =>
  sql`${column} in (${sql.join(
    values.map(value => sql.raw(`'${value}'`)),
    sql.raw(', '),
  )})`

/** Regra comercial do escopo (uma linha por escopo; criada sob demanda com os padrões da spec). */
export const vendasConfig = pgTable(
  'vendas_config',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: scopeColumn(),
    tenantId: tenantIdColumn(),
    /** % da mensalidade paga que vira comissão do vendedor na 1ª, 2ª, 3ª… parcela. */
    escalaMensal: jsonb('escala_mensal').$type<number[]>().notNull().default([100, 50, 25]),
    /** % da taxa de adesão paga (50 no platform, 0 no tenant — o padrão é aplicado na criação). */
    percentualAdesao: numeric('percentual_adesao', { precision: 5, scale: 2 }).notNull().default('0'),
    /** % SOBRE a comissão do vendedor, para quem existir na cadeia. */
    overrides: jsonb('overrides')
      .$type<OverridesComissao>()
      .notNull()
      .default({ supervisor: 10, gerente: 5, corretora: 5 }),
    /** Escala própria do balcão; nulo = usa `escala_mensal`. */
    balcaoPercentual: jsonb('balcao_percentual').$type<number[] | null>(),
    distribuicao: text('distribuicao', { enum: DISTRIBUICOES_LEADS }).$type<DistribuicaoLeads>().notNull().default('pool'),
    poolRetornoHoras: integer('pool_retorno_horas').notNull().default(48),
    presencaMinutos: integer('presenca_minutos').notNull().default(3),
    balcaoDescontoPadrao: integer('balcao_desconto_padrao').notNull().default(30),
    metaMensalPadrao: integer('meta_mensal_padrao').notNull().default(10),
    modelosMensagem: jsonb('modelos_mensagem').$type<ModeloMensagem[]>().notNull().default([]),
    updatedByUserId: text('updated_by_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    uniqueIndex('vendas_config_scope_tenant_key').on(table.scope, sql`coalesce(${table.tenantId}, '')`),
    check('vendas_config_scope_check', inList(table.scope, ESCOPOS_VENDAS)),
    check('vendas_config_distribuicao_check', inList(table.distribuicao, DISTRIBUICOES_LEADS)),
  ],
)

/** Empresa parceira (CNPJ) com um gerente, N unidades e N equipes. */
export const vendasCorretoras = pgTable(
  'vendas_corretoras',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: scopeColumn(),
    tenantId: tenantIdColumn(),
    nomeFantasia: text('nome_fantasia').notNull(),
    razaoSocial: text('razao_social').notNull(),
    /** 14 dígitos. */
    cnpj: text('cnpj').notNull(),
    email: text('email'),
    telefone: text('telefone'),
    endereco: jsonb('endereco').$type<EnderecoVendas>(),
    gerenteAgenteId: uuid('gerente_agente_id').references((): AnyPgColumn => vendasAgentes.id, { onDelete: 'set null' }),
    status: text('status', { enum: STATUS_REDE }).$type<StatusRede>().notNull().default('ativa'),
    /** Sobrescreve `vendas_config.overrides` para a corretora. */
    comissaoOverrides: jsonb('comissao_overrides').$type<OverridesComissao | null>(),
    observacoes: text('observacoes'),
    createdByUserId: text('created_by_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    uniqueIndex('vendas_corretoras_cnpj_key').on(table.scope, sql`coalesce(${table.tenantId}, '')`, table.cnpj),
    index('vendas_corretoras_scope_idx').on(table.scope, table.tenantId, table.status),
    check('vendas_corretoras_scope_check', inList(table.scope, ESCOPOS_VENDAS)),
    check('vendas_corretoras_status_check', inList(table.status, STATUS_REDE)),
  ],
)

/** Local físico: unidade da corretora ou unidade própria do escopo (clínica, loja…). */
export const vendasUnidades = pgTable(
  'vendas_unidades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: scopeColumn(),
    tenantId: tenantIdColumn(),
    corretoraId: uuid('corretora_id').references(() => vendasCorretoras.id, { onDelete: 'cascade' }),
    nome: text('nome').notNull(),
    tipo: text('tipo', { enum: TIPOS_UNIDADE }).$type<TipoUnidade>().notNull().default('outro'),
    endereco: jsonb('endereco').$type<EnderecoVendas>(),
    telefone: text('telefone'),
    responsavelAgenteId: uuid('responsavel_agente_id').references((): AnyPgColumn => vendasAgentes.id, { onDelete: 'set null' }),
    status: text('status', { enum: STATUS_REDE }).$type<StatusRede>().notNull().default('ativa'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    index('vendas_unidades_scope_idx').on(table.scope, table.tenantId, table.status),
    index('vendas_unidades_corretora_idx').on(table.corretoraId),
    check('vendas_unidades_scope_check', inList(table.scope, ESCOPOS_VENDAS)),
    check('vendas_unidades_tipo_check', inList(table.tipo, TIPOS_UNIDADE)),
    check('vendas_unidades_status_check', inList(table.status, STATUS_REDE)),
  ],
)

/** Grupo de vendedores sob UM supervisor. */
export const vendasEquipes = pgTable(
  'vendas_equipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: scopeColumn(),
    tenantId: tenantIdColumn(),
    corretoraId: uuid('corretora_id').references(() => vendasCorretoras.id, { onDelete: 'cascade' }),
    unidadeId: uuid('unidade_id').references(() => vendasUnidades.id, { onDelete: 'set null' }),
    nome: text('nome').notNull(),
    supervisorAgenteId: uuid('supervisor_agente_id').references((): AnyPgColumn => vendasAgentes.id, { onDelete: 'set null' }),
    status: text('status', { enum: STATUS_REDE }).$type<StatusRede>().notNull().default('ativa'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    index('vendas_equipes_scope_idx').on(table.scope, table.tenantId, table.status),
    index('vendas_equipes_corretora_idx').on(table.corretoraId),
    index('vendas_equipes_supervisor_idx').on(table.supervisorAgenteId),
    check('vendas_equipes_scope_check', inList(table.scope, ESCOPOS_VENDAS)),
    check('vendas_equipes_status_check', inList(table.status, STATUS_REDE)),
  ],
)

/** Pessoa da força de vendas. Papel comercial em `papel`; o papel de autenticação não muda. */
export const vendasAgentes = pgTable(
  'vendas_agentes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: scopeColumn(),
    tenantId: tenantIdColumn(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    papel: text('papel', { enum: PAPEIS_COMERCIAIS }).$type<PapelComercial>().notNull(),
    corretoraId: uuid('corretora_id').references(() => vendasCorretoras.id, { onDelete: 'set null' }),
    unidadeId: uuid('unidade_id').references(() => vendasUnidades.id, { onDelete: 'set null' }),
    equipeId: uuid('equipe_id').references(() => vendasEquipes.id, { onDelete: 'set null' }),
    /** 6–8 caracteres maiúsculos sem ambíguos (gerador em `rules.ts`). Único no banco todo. */
    codigoIndicacao: text('codigo_indicacao').notNull(),
    ativo: boolean('ativo').notNull().default(true),
    metaMensal: integer('meta_mensal'),
    nome: text('nome').notNull(),
    /** 11 dígitos. */
    cpf: text('cpf'),
    telefone: text('telefone'),
    dataNascimento: date('data_nascimento'),
    endereco: jsonb('endereco').$type<EnderecoVendas | null>(),
    repasse: jsonb('repasse').$type<RepasseVendas | null>(),
    observacoes: text('observacoes'),
    ultimaPresencaEm: timestamp('ultima_presenca_em', { withTimezone: true }),
    criadoPorUserId: text('criado_por_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    uniqueIndex('vendas_agentes_user_scope_tenant_key').on(table.userId, table.scope, sql`coalesce(${table.tenantId}, '')`),
    uniqueIndex('vendas_agentes_codigo_key').on(table.codigoIndicacao),
    index('vendas_agentes_scope_papel_idx').on(table.scope, table.tenantId, table.papel),
    index('vendas_agentes_equipe_idx').on(table.equipeId),
    index('vendas_agentes_corretora_idx').on(table.corretoraId),
    index('vendas_agentes_unidade_idx').on(table.unidadeId),
    index('vendas_agentes_presenca_idx').on(table.ultimaPresencaEm),
    check('vendas_agentes_scope_check', inList(table.scope, ESCOPOS_VENDAS)),
    check('vendas_agentes_papel_check', inList(table.papel, PAPEIS_COMERCIAIS)),
  ],
)

/** Lead do funil comercial. `agente_id` nulo = pool. */
export const vendasLeads = pgTable(
  'vendas_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: scopeColumn(),
    tenantId: tenantIdColumn(),
    tipo: text('tipo', { enum: TIPOS_LEAD }).$type<TipoLead>().notNull().default('pessoa'),
    nome: text('nome').notNull(),
    /** CPF ou CNPJ, só dígitos. */
    documento: text('documento'),
    email: text('email'),
    telefone: text('telefone'),
    cidade: text('cidade'),
    uf: text('uf'),
    origem: text('origem', { enum: ORIGENS_LEAD }).$type<OrigemLead>().notNull().default('outro'),
    origemDetalhe: text('origem_detalhe'),
    etapa: text('etapa', { enum: ETAPAS_LEAD }).$type<EtapaLead>().notNull().default('novo'),
    agenteId: uuid('agente_id').references(() => vendasAgentes.id, { onDelete: 'set null' }),
    reivindicadoEm: timestamp('reivindicado_em', { withTimezone: true }),
    poolDesde: timestamp('pool_desde', { withTimezone: true }),
    proximoPasso: text('proximo_passo'),
    proximoPassoEm: timestamp('proximo_passo_em', { withTimezone: true }),
    ultimoContatoEm: timestamp('ultimo_contato_em', { withTimezone: true }),
    /** `club_plans.id` (tenant) ou `tenant_plans.id` (platform). */
    interessePlanoId: text('interesse_plano_id'),
    valorEstimado: money('valor_estimado'),
    vidasEstimadas: integer('vidas_estimadas'),
    /** Snapshot da cadeia na conversão: base da comissão (não se recalcula). */
    atribuicao: jsonb('atribuicao').$type<AtribuicaoLead | null>(),
    conversao: jsonb('conversao').$type<ConversaoLead | null>(),
    ganhoEm: timestamp('ganho_em', { withTimezone: true }),
    perdidoEm: timestamp('perdido_em', { withTimezone: true }),
    motivoPerda: text('motivo_perda'),
    observacoes: text('observacoes'),
    dados: jsonb('dados').$type<Record<string, unknown>>().notNull().default({}),
    /** Origem migrada: `{ tabela, id }`. */
    legado: jsonb('legado').$type<{ tabela: string; id: string } | null>(),
    createdByUserId: text('created_by_user_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    index('vendas_leads_scope_etapa_idx').on(table.scope, table.tenantId, table.etapa),
    index('vendas_leads_agente_etapa_idx').on(table.agenteId, table.etapa),
    index('vendas_leads_pool_idx').on(table.scope, table.tenantId).where(sql`${table.agenteId} is null`),
    index('vendas_leads_documento_idx').on(table.documento),
    index('vendas_leads_telefone_idx').on(table.telefone),
    index('vendas_leads_proximo_passo_idx').on(table.proximoPassoEm),
    check('vendas_leads_scope_check', inList(table.scope, ESCOPOS_VENDAS)),
    check('vendas_leads_etapa_check', inList(table.etapa, ETAPAS_LEAD)),
    check('vendas_leads_tipo_check', inList(table.tipo, TIPOS_LEAD)),
    check('vendas_leads_origem_check', inList(table.origem, ORIGENS_LEAD)),
  ],
)

/** Linha do tempo do lead. Eventos de contato atualizam `vendas_leads.ultimo_contato_em`. */
export const vendasLeadEventos = pgTable(
  'vendas_lead_eventos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => vendasLeads.id, { onDelete: 'cascade' }),
    tipo: text('tipo', { enum: TIPOS_EVENTO_LEAD }).$type<TipoEventoLead>().notNull(),
    texto: text('texto'),
    dados: jsonb('dados').$type<Record<string, unknown> | null>(),
    /** Sem FK: a trilha sobrevive à conta. */
    porUserId: text('por_user_id'),
    porAgenteId: uuid('por_agente_id'),
    em: timestamp('em', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('vendas_lead_eventos_lead_em_idx').on(table.leadId, table.em),
    check('vendas_lead_eventos_tipo_check', inList(table.tipo, TIPOS_EVENTO_LEAD)),
  ],
)

/**
 * Lançamento de comissão: um por (cobrança, tipo, parte, beneficiário).
 * Idempotente pelo índice único — webhook repetido não duplica.
 */
export const vendasComissoes = pgTable(
  'vendas_comissoes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: scopeColumn(),
    tenantId: tenantIdColumn(),
    leadId: uuid('lead_id').references(() => vendasLeads.id, { onDelete: 'set null' }),
    beneficiarioAgenteId: uuid('beneficiario_agente_id').references(() => vendasAgentes.id, { onDelete: 'set null' }),
    beneficiarioCorretoraId: uuid('beneficiario_corretora_id').references(() => vendasCorretoras.id, { onDelete: 'set null' }),
    parte: text('parte', { enum: PARTES_COMISSAO }).$type<ParteComissao>().notNull(),
    tipo: text('tipo', { enum: TIPOS_COMISSAO }).$type<TipoComissao>().notNull(),
    parcela: integer('parcela').notNull().default(1),
    cobrancaOrigem: text('cobranca_origem', { enum: ['platform', 'club'] }).notNull(),
    /** `platform_charges.id` ou `club_charges.id` (sem FK: a trilha do dinheiro sobrevive). */
    cobrancaRef: text('cobranca_ref').notNull(),
    base: money('base').notNull(),
    percentual: numeric('percentual', { precision: 6, scale: 2 }).notNull(),
    valor: money('valor').notNull(),
    status: text('status', { enum: STATUS_COMISSAO }).$type<StatusComissao>().notNull().default('a_pagar'),
    /** `yyyy-MM`. */
    mesReferencia: text('mes_referencia').notNull(),
    pagoEm: timestamp('pago_em', { withTimezone: true }),
    pagoPorUserId: text('pago_por_user_id'),
    pagamentoRef: text('pagamento_ref'),
    observacao: text('observacao'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    uniqueIndex('vendas_comissoes_cobranca_parte_key').on(
      table.cobrancaOrigem,
      table.cobrancaRef,
      table.tipo,
      table.parte,
      sql`coalesce(${table.beneficiarioAgenteId}::text, ${table.beneficiarioCorretoraId}::text, '')`,
    ),
    index('vendas_comissoes_scope_status_idx').on(table.scope, table.tenantId, table.status),
    index('vendas_comissoes_beneficiario_mes_idx').on(table.beneficiarioAgenteId, table.mesReferencia),
    check('vendas_comissoes_scope_check', inList(table.scope, ESCOPOS_VENDAS)),
    check('vendas_comissoes_parte_check', inList(table.parte, PARTES_COMISSAO)),
    check('vendas_comissoes_tipo_check', inList(table.tipo, TIPOS_COMISSAO)),
    check('vendas_comissoes_status_check', inList(table.status, STATUS_COMISSAO)),
    check('vendas_comissoes_origem_check', sql`${table.cobrancaOrigem} in ('platform', 'club')`),
  ],
)

/** Atendimento do balcão (só escopo tenant). */
export const vendasAtendimentosBalcao = pgTable(
  'vendas_atendimentos_balcao',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    agenteId: uuid('agente_id')
      .notNull()
      .references(() => vendasAgentes.id, { onDelete: 'cascade' }),
    unidadeId: uuid('unidade_id').references(() => vendasUnidades.id, { onDelete: 'set null' }),
    leadId: uuid('lead_id').references(() => vendasLeads.id, { onDelete: 'set null' }),
    nome: text('nome').notNull(),
    documento: text('documento'),
    telefone: text('telefone'),
    /** Ex.: "Consulta cardiologia". */
    servico: text('servico').notNull(),
    valorTabela: money('valor_tabela').notNull(),
    descontoPercentual: integer('desconto_percentual').notNull().default(0),
    valorComPlano: money('valor_com_plano').notNull(),
    planoId: text('plano_id'),
    resultado: text('resultado', { enum: RESULTADOS_BALCAO }).$type<ResultadoBalcao>().notNull(),
    observacoes: text('observacoes'),
    /** `club_subscriptions.id`. */
    assinaturaId: text('assinatura_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    index('vendas_atendimentos_balcao_idx').on(table.tenantId, table.agenteId, table.createdAt),
    check('vendas_atendimentos_balcao_resultado_check', inList(table.resultado, RESULTADOS_BALCAO)),
  ],
)

export const vendasCorretorasRelations = relations(vendasCorretoras, ({ one, many }) => ({
  gerente: one(vendasAgentes, { fields: [vendasCorretoras.gerenteAgenteId], references: [vendasAgentes.id], relationName: 'corretora_gerente' }),
  unidades: many(vendasUnidades),
  equipes: many(vendasEquipes),
  agentes: many(vendasAgentes, { relationName: 'agente_corretora' }),
}))

export const vendasUnidadesRelations = relations(vendasUnidades, ({ one, many }) => ({
  corretora: one(vendasCorretoras, { fields: [vendasUnidades.corretoraId], references: [vendasCorretoras.id] }),
  equipes: many(vendasEquipes),
  agentes: many(vendasAgentes, { relationName: 'agente_unidade' }),
}))

export const vendasEquipesRelations = relations(vendasEquipes, ({ one, many }) => ({
  corretora: one(vendasCorretoras, { fields: [vendasEquipes.corretoraId], references: [vendasCorretoras.id] }),
  unidade: one(vendasUnidades, { fields: [vendasEquipes.unidadeId], references: [vendasUnidades.id] }),
  supervisor: one(vendasAgentes, { fields: [vendasEquipes.supervisorAgenteId], references: [vendasAgentes.id], relationName: 'equipe_supervisor' }),
  agentes: many(vendasAgentes, { relationName: 'agente_equipe' }),
}))

export const vendasAgentesRelations = relations(vendasAgentes, ({ one, many }) => ({
  user: one(user, { fields: [vendasAgentes.userId], references: [user.id] }),
  corretora: one(vendasCorretoras, { fields: [vendasAgentes.corretoraId], references: [vendasCorretoras.id], relationName: 'agente_corretora' }),
  unidade: one(vendasUnidades, { fields: [vendasAgentes.unidadeId], references: [vendasUnidades.id], relationName: 'agente_unidade' }),
  equipe: one(vendasEquipes, { fields: [vendasAgentes.equipeId], references: [vendasEquipes.id], relationName: 'agente_equipe' }),
  leads: many(vendasLeads),
}))

export const vendasLeadsRelations = relations(vendasLeads, ({ one, many }) => ({
  agente: one(vendasAgentes, { fields: [vendasLeads.agenteId], references: [vendasAgentes.id] }),
  eventos: many(vendasLeadEventos),
  comissoes: many(vendasComissoes),
}))

export const vendasLeadEventosRelations = relations(vendasLeadEventos, ({ one }) => ({
  lead: one(vendasLeads, { fields: [vendasLeadEventos.leadId], references: [vendasLeads.id] }),
}))

export const vendasComissoesRelations = relations(vendasComissoes, ({ one }) => ({
  lead: one(vendasLeads, { fields: [vendasComissoes.leadId], references: [vendasLeads.id] }),
  beneficiarioAgente: one(vendasAgentes, { fields: [vendasComissoes.beneficiarioAgenteId], references: [vendasAgentes.id] }),
  beneficiarioCorretora: one(vendasCorretoras, { fields: [vendasComissoes.beneficiarioCorretoraId], references: [vendasCorretoras.id] }),
}))

export type VendasConfigRow = typeof vendasConfig.$inferSelect
export type VendasCorretoraRow = typeof vendasCorretoras.$inferSelect
export type VendasUnidadeRow = typeof vendasUnidades.$inferSelect
export type VendasEquipeRow = typeof vendasEquipes.$inferSelect
export type VendasAgenteRow = typeof vendasAgentes.$inferSelect
export type VendasLeadRow = typeof vendasLeads.$inferSelect
export type VendasLeadEventoRow = typeof vendasLeadEventos.$inferSelect
export type VendasComissaoRow = typeof vendasComissoes.$inferSelect
export type VendasAtendimentoBalcaoRow = typeof vendasAtendimentosBalcao.$inferSelect
