import { z } from 'zod'
import { paginationQuery } from '../common/pagination'
import { cnpj, dateOnly, email, telefone, uf, uuid } from '../common/primitives'
import { MAX_MONTHLY_DISCOUNT_PERCENT, platformPlanQuote } from './platform-billing'
import {
  legalForm,
  onboardingApplicant,
  onboardingStatus,
  proposalDiscount,
  sellerReferralCode,
  type OnboardingStatus,
} from './platform-onboarding'

/**
 * Vendas da PLATAFORMA (vendedores próprios da ANNETEC prospectando
 * operadoras/clubes que vão virar inquilinos). Separado do CRM dos clubes
 * (`crm.ts`, que é o funil de cada clube vendendo para associados).
 *
 *  - vendedor = conta de plataforma `platform_seller` + perfil (código de
 *    indicação, ativo, meta);
 *  - funil próprio (`platform_prospects` + interações), um dono por prospect;
 *  - link de contratação: proposta em rascunho criada pelo vendedor (pode usar
 *    plano não público) e e-mail ao cliente — retido enquanto houver pedido de
 *    desconto aguardando o superadmin;
 *  - comissão automática por fatura da plataforma PAGA do clube atribuído.
 *
 * Rotas: `/api/v1/platform/vendas/*` (o vendedor, só os próprios dados) e
 * `/api/v1/platform/comercial/*` (equipe; escrita só superadmin).
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const prospectStage = z.enum([
  'novo',
  'em_contato',
  'proposta_enviada',
  'em_contratacao',
  'em_aprovacao',
  'ganho',
  'perdido',
])
export type ProspectStage = z.infer<typeof prospectStage>

export const PROSPECT_STAGE_LABELS: Record<ProspectStage, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  proposta_enviada: 'Proposta enviada',
  em_contratacao: 'Em contratação',
  em_aprovacao: 'Em aprovação',
  ganho: 'Ganho',
  perdido: 'Perdido',
}

/** Etapas em que o prospect ainda está "vivo" no funil. */
export const OPEN_PROSPECT_STAGES: readonly ProspectStage[] = [
  'novo',
  'em_contato',
  'proposta_enviada',
  'em_contratacao',
  'em_aprovacao',
]

/**
 * Etapa do prospect que acompanha a proposta vinculada (sincronização
 * automática): link enviado/rascunho → `em_contratacao`; enviada, em análise,
 * pendência, aprovada, aguardando pagamento, provisionando → `em_aprovacao`;
 * no ar → `ganho`; reprovada/cancelada → `perdido`.
 */
export function prospectStageForProposalStatus(status: OnboardingStatus): ProspectStage {
  switch (status) {
    case 'draft':
      return 'em_contratacao'
    case 'active':
      return 'ganho'
    case 'rejected':
    case 'canceled':
      return 'perdido'
    default:
      return 'em_aprovacao'
  }
}

export const prospectOrigin = z.enum(['indicacao', 'prospeccao_ativa', 'evento', 'site', 'redes_sociais', 'outro'])
export type ProspectOrigin = z.infer<typeof prospectOrigin>

export const PROSPECT_ORIGIN_LABELS: Record<ProspectOrigin, string> = {
  indicacao: 'Indicação',
  prospeccao_ativa: 'Prospecção ativa',
  evento: 'Evento',
  site: 'Site (código do vendedor)',
  redes_sociais: 'Redes sociais',
  outro: 'Outro',
}

/** `sistema` = registro automático (link enviado, etapa sincronizada, reatribuição) — não aceito na entrada. */
export const prospectInteractionKind = z.enum(['ligacao', 'whatsapp', 'email', 'reuniao', 'visita', 'nota', 'sistema'])
export type ProspectInteractionKind = z.infer<typeof prospectInteractionKind>

export const PROSPECT_INTERACTION_KIND_LABELS: Record<ProspectInteractionKind, string> = {
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  reuniao: 'Reunião',
  visita: 'Visita',
  nota: 'Nota',
  sistema: 'Sistema',
}

export const discountRequestStatus = z.enum(['pending', 'approved', 'rejected', 'canceled'])
export type DiscountRequestStatus = z.infer<typeof discountRequestStatus>

export const DISCOUNT_REQUEST_STATUS_LABELS: Record<DiscountRequestStatus, string> = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovado',
  rejected: 'Recusado',
  canceled: 'Cancelado',
}

/**
 * - `prevista`: reservado (cobrança emitida, ainda não paga) — hoje não gerado;
 * - `a_pagar`: a fatura do clube foi paga, comissão devida ao vendedor;
 * - `paga`: repassada ao vendedor (superadmin marcou);
 * - `cancelada`: a fatura foi estornada antes do repasse;
 * - `a_descontar`: estornada DEPOIS do repasse — descontar do vendedor.
 */
export const salesCommissionStatus = z.enum(['prevista', 'a_pagar', 'paga', 'cancelada', 'a_descontar'])
export type SalesCommissionStatus = z.infer<typeof salesCommissionStatus>

export const SALES_COMMISSION_STATUS_LABELS: Record<SalesCommissionStatus, string> = {
  prevista: 'Prevista',
  a_pagar: 'A pagar',
  paga: 'Paga',
  cancelada: 'Cancelada',
  a_descontar: 'A descontar',
}

/** Parte da fatura que gerou a comissão. */
export const salesCommissionKind = z.enum(['setup_fee', 'monthly'])
export type SalesCommissionKind = z.infer<typeof salesCommissionKind>

export const SALES_COMMISSION_KIND_LABELS: Record<SalesCommissionKind, string> = {
  setup_fee: 'Adesão',
  monthly: 'Mensalidade',
}

/** `yyyy-MM` (competência = mês do pagamento em São Paulo). */
export const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês no formato aaaa-mm')

// ---------------------------------------------------------------------------
// Vendedor
// ---------------------------------------------------------------------------

/** Perfil de vendedor (1:1 com a conta `platform_seller`). */
export const platformSeller = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  referralCode: z.string(),
  /** Perfil ativo: recebe indicações e cria links. Inativo só consulta o próprio histórico. */
  active: z.boolean(),
  /** Conta pode entrar (`user.banned` falso) — liga/desliga em Equipe. */
  accountActive: z.boolean(),
  /** Meta mensal em nº de clubes ganhos (no ar) no mês; `null` = sem meta. */
  monthlyGoal: z.number().int().nullable(),
  /** `https://<web>/contratar?ref=<código>` — link de indicação do site. */
  referralUrl: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type PlatformSeller = z.infer<typeof platformSeller>

/** `POST /platform/comercial/vendedores` (superadmin) — cria a conta E o perfil. */
export const createSellerInput = z.object({
  name: z.string().trim().min(3).max(120),
  email,
  phone: z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? undefined : v), telefone.optional()),
  password: z.string().min(8),
  /** Ausente = gerado do nome (`joao-silva`, `joao-silva-2`…). */
  referralCode: sellerReferralCode.optional(),
  monthlyGoal: z.number().int().min(1).max(1000).nullable().optional(),
})
export type CreateSellerInput = z.infer<typeof createSellerInput>

/** `PATCH /platform/comercial/vendedores/:userId` (superadmin). Conta (nome, senha, desligar) fica em Equipe. */
export const updateSellerInput = z
  .object({
    referralCode: sellerReferralCode.optional(),
    active: z.boolean().optional(),
    monthlyGoal: z.number().int().min(1).max(1000).nullable().optional(),
  })
  .refine(v => Object.values(v).some(value => value !== undefined), { message: 'Nada para alterar' })
export type UpdateSellerInput = z.infer<typeof updateSellerInput>

// ---------------------------------------------------------------------------
// Funil (prospects e interações)
// ---------------------------------------------------------------------------

const optionalText = (max: number) =>
  z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullable().optional())

export const prospectProposalRef = z.object({
  id: uuid,
  code: z.string(),
  status: onboardingStatus,
})
export type ProspectProposalRef = z.infer<typeof prospectProposalRef>

export const prospect = z.object({
  id: uuid,
  /** Dono (vendedor). */
  sellerUserId: z.string(),
  sellerName: z.string().nullable(),
  /** Nome da operadora/clube prospectado. */
  name: z.string(),
  cnpj: z.string().nullable(),
  contactName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  estimatedLives: z.number().int().nullable(),
  interestPlanId: z.string().nullable(),
  interestPlanName: z.string().nullable(),
  /** R$/mês estimado. */
  estimatedValue: z.number().nullable(),
  origin: prospectOrigin,
  stage: prospectStage,
  lostReason: z.string().nullable(),
  nextAction: z.string().nullable(),
  nextActionAt: dateOnly.nullable(),
  /** Proposta de contratação vinculada (a etapa acompanha o status dela). */
  proposal: prospectProposalRef.nullable(),
  stageChangedAt: z.string().datetime(),
  wonAt: z.string().datetime().nullable(),
  lostAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Prospect = z.infer<typeof prospect>

export const prospectInteraction = z.object({
  id: uuid,
  prospectId: uuid,
  kind: prospectInteractionKind,
  description: z.string(),
  occurredAt: z.string().datetime(),
  authorName: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type ProspectInteraction = z.infer<typeof prospectInteraction>

export const prospectDetail = prospect.extend({
  /** Mais recente primeiro. */
  interactions: z.array(prospectInteraction),
})
export type ProspectDetail = z.infer<typeof prospectDetail>

const prospectFields = {
  name: z.string().trim().min(2).max(160),
  cnpj: z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? null : v), cnpj.nullable().optional()),
  contactName: optionalText(120),
  email: z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? null : v), email.nullable().optional()),
  phone: z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? null : v), telefone.nullable().optional()),
  city: optionalText(80),
  state: z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? null : v), uf.nullable().optional()),
  estimatedLives: z.number().int().min(0).max(10_000_000).nullable().optional(),
  interestPlanId: uuid.nullable().optional(),
  estimatedValue: z.number().min(0).max(100_000_000).nullable().optional(),
  origin: prospectOrigin.exclude(['site']).optional(),
  nextAction: optionalText(300),
  nextActionAt: dateOnly.nullable().optional(),
}

/** `POST /platform/vendas/prospects` — nasce `novo` (ou a etapa informada, menos `ganho`). */
export const createProspectInput = z.object({
  ...prospectFields,
  stage: prospectStage.exclude(['ganho', 'perdido', 'em_contratacao', 'em_aprovacao']).optional(),
})
export type CreateProspectInput = z.infer<typeof createProspectInput>

/**
 * `PATCH /platform/vendas/prospects/:id`. `perdido` exige `lostReason`. Com
 * proposta vinculada em andamento a etapa é automática (a sincronização volta
 * a escrever a etapa da proposta na próxima mudança dela).
 */
export const updateProspectInput = z
  .object({
    ...prospectFields,
    name: prospectFields.name.optional(),
    stage: prospectStage.optional(),
    lostReason: optionalText(500),
  })
  .refine(v => v.stage !== 'perdido' || Boolean(v.lostReason), {
    message: 'Informe o motivo da perda',
    path: ['lostReason'],
  })
export type UpdateProspectInput = z.infer<typeof updateProspectInput>

export const createProspectInteractionInput = z.object({
  kind: prospectInteractionKind.exclude(['sistema']),
  description: z.string().trim().min(2).max(4000),
  /** Ausente = agora. */
  occurredAt: z.string().datetime().optional(),
})
export type CreateProspectInteractionInput = z.infer<typeof createProspectInteractionInput>

/** `POST /platform/comercial/prospects/:id/reatribuir` (superadmin). */
export const reassignProspectInput = z.object({
  sellerUserId: z.string().trim().min(1).max(100),
  reason: z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(500).optional()),
})
export type ReassignProspectInput = z.infer<typeof reassignProspectInput>

export const listProspectsQuery = paginationQuery.extend({
  stage: prospectStage.optional(),
  /** `open` = etapas vivas; `closed` = ganho/perdido. */
  status: z.enum(['open', 'closed', 'all']).optional(),
  /** Só na visão da equipe. */
  sellerUserId: z.string().trim().min(1).max(100).optional(),
})
export type ListProspectsQuery = z.infer<typeof listProspectsQuery>

// ---------------------------------------------------------------------------
// Desconto (pedido do vendedor → decisão do superadmin)
// ---------------------------------------------------------------------------

const discountFields = {
  /** Desconto na adesão, 0–100 (100 = isenção total). */
  setupFeePercent: z.number().min(0).max(100).optional(),
  /** Desconto na mensalidade do plano, 0–50. */
  monthlyPercent: z.number().min(0).max(MAX_MONTHLY_DISCOUNT_PERCENT).optional(),
  /**
   * Quantas mensalidades (a 1ª, que vai na ativação, conta) têm o desconto;
   * `null` = permanente. Obrigatório com `monthlyPercent` > 0.
   */
  monthlyMonths: z.number().int().min(1).max(60).nullable().optional(),
}

const hasSomeDiscount = (v: { setupFeePercent?: number; monthlyPercent?: number }) =>
  (v.setupFeePercent ?? 0) > 0 || (v.monthlyPercent ?? 0) > 0
const monthsGiven = (v: { monthlyPercent?: number; monthlyMonths?: number | null }) =>
  (v.monthlyPercent ?? 0) <= 0 || v.monthlyMonths !== undefined

/** Pedido de desconto (no link ou depois, em `POST /vendas/propostas/:id/desconto`). */
export const discountRequestInput = z
  .object({
    ...discountFields,
    justification: z.string().trim().min(10, 'Justifique o pedido').max(2000),
  })
  .refine(hasSomeDiscount, { message: 'Informe o desconto na adesão e/ou na mensalidade', path: ['setupFeePercent'] })
  .refine(monthsGiven, {
    message: 'Informe por quantas mensalidades (ou permanente)',
    path: ['monthlyMonths'],
  })
export type DiscountRequestInput = z.infer<typeof discountRequestInput>

/**
 * Aprovação (superadmin): campos ausentes = como o vendedor pediu; pode
 * ajustar. Incluir desconto na mensalidade que o pedido não tinha exige
 * `monthlyMonths` (número ou `null` = permanente) — a API confere.
 */
export const approveDiscountInput = z.object({
  ...discountFields,
  note: z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(2000).optional()),
})
export type ApproveDiscountInput = z.infer<typeof approveDiscountInput>

export const rejectDiscountInput = z.object({ reason: z.string().trim().min(5, 'Explique o motivo').max(2000) })
export type RejectDiscountInput = z.infer<typeof rejectDiscountInput>

export const discountRequest = z.object({
  id: uuid,
  proposalId: uuid,
  proposalCode: z.string(),
  proposalStatus: onboardingStatus,
  /** Nome do contratante (razão/fantasia/candidato). */
  customerName: z.string(),
  prospectId: uuid.nullable(),
  sellerUserId: z.string(),
  sellerName: z.string().nullable(),
  status: discountRequestStatus,
  requested: proposalDiscount,
  /** Valores que valeram (aprovado, possivelmente ajustado); `null` fora de `approved`. */
  approved: proposalDiscount.nullable(),
  justification: z.string(),
  decisionNote: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: z.string().datetime().nullable(),
  /** Preço do plano da proposta: sem desconto e com o pedido aplicado. */
  quote: platformPlanQuote.nullable(),
  quoteWithDiscount: platformPlanQuote.nullable(),
  planName: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type DiscountRequest = z.infer<typeof discountRequest>

export const listDiscountRequestsQuery = paginationQuery.extend({
  status: discountRequestStatus.optional(),
  sellerUserId: z.string().trim().min(1).max(100).optional(),
})
export type ListDiscountRequestsQuery = z.infer<typeof listDiscountRequestsQuery>

// ---------------------------------------------------------------------------
// Link de contratação e propostas do vendedor
// ---------------------------------------------------------------------------

/**
 * `POST /platform/vendas/prospects/:id/link` — proposta em rascunho para o
 * prospect (pode ser plano NÃO público). Sem `discount`: e-mail com o link vai
 * na hora. Com `discount`: a proposta nasce, o pedido vai ao superadmin e o
 * e-mail fica RETIDO até a aprovação (recusado → `enviar-link` manda sem desconto).
 */
export const createSellerLinkInput = z.object({
  legalForm,
  cnpj,
  planId: uuid,
  expectedLives: z.number().int().min(1).max(1_000_000),
  applicant: onboardingApplicant,
  discount: discountRequestInput.optional(),
})
export type CreateSellerLinkInput = z.infer<typeof createSellerLinkInput>

/**
 * Situação do link para o cliente:
 *  - `awaiting_discount_approval`: e-mail retido (pedido de desconto pendente);
 *  - `not_sent`: proposta criada, e-mail ainda não enviado (desconto recusado — use `enviar-link`);
 *  - `sent`: e-mail com o link enviado ao cliente;
 *  - `site`: proposta iniciada pelo próprio cliente no site (código de indicação).
 */
export const sellerLinkStatus = z.enum(['awaiting_discount_approval', 'not_sent', 'sent', 'site'])
export type SellerLinkStatus = z.infer<typeof sellerLinkStatus>

export const sellerProposal = z.object({
  id: uuid,
  code: z.string(),
  status: onboardingStatus,
  source: z.enum(['site', 'console', 'seed']),
  cnpj: z.string(),
  customerName: z.string(),
  applicant: onboardingApplicant,
  planId: z.string().nullable(),
  planName: z.string().nullable(),
  expectedLives: z.number().int(),
  /** Com o desconto aprovado aplicado. */
  quote: platformPlanQuote.nullable(),
  discount: proposalDiscount.nullable(),
  /** Último pedido de desconto (qualquer status). */
  lastDiscountRequest: z
    .object({ id: uuid, status: discountRequestStatus, rejectionReason: z.string().nullable(), decidedAt: z.string().datetime().nullable() })
    .nullable(),
  linkStatus: sellerLinkStatus,
  inviteSentAt: z.string().datetime().nullable(),
  prospectId: uuid.nullable(),
  referralCode: z.string().nullable(),
  /** Inquilino criado (proposta no ar). */
  organizationId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type SellerProposal = z.infer<typeof sellerProposal>

/**
 * Resultado do link. O vendedor NUNCA recebe a URL com a chave da proposta
 * (ela dá acesso de edição, inclusive ao aceite do contrato): o link vai só
 * para o e-mail do cliente.
 */
export const sellerLinkResult = z.object({
  proposal: sellerProposal,
  discountRequest: discountRequest.nullable(),
  emailSent: z.boolean(),
})
export type SellerLinkResult = z.infer<typeof sellerLinkResult>

export const listSellerProposalsQuery = paginationQuery.extend({
  status: onboardingStatus.optional(),
  /** `open` = não finalizadas. */
  group: z.enum(['open', 'done', 'all']).optional(),
})
export type ListSellerProposalsQuery = z.infer<typeof listSellerProposalsQuery>

// ---------------------------------------------------------------------------
// Comissões
// ---------------------------------------------------------------------------

/**
 * Regra global (superadmin). `monthlySchedule[i]` = % da (i+1)ª mensalidade
 * PAGA do clube (acima do tamanho da escala não gera); `setupFeePercent` = %
 * da adesão paga. Vale a regra vigente no momento do pagamento.
 */
export const salesCommissionSettings = z.object({
  monthlySchedule: z.array(z.number().min(0).max(100)).max(36),
  setupFeePercent: z.number().min(0).max(100),
  updatedAt: z.string().datetime().nullable(),
  updatedByName: z.string().nullable(),
})
export type SalesCommissionSettings = z.infer<typeof salesCommissionSettings>

export const DEFAULT_SALES_COMMISSION_SETTINGS = {
  monthlySchedule: [50, 20, 10],
  setupFeePercent: 50,
} as const

export const updateSalesCommissionSettingsInput = z
  .object({
    monthlySchedule: z.array(z.number().min(0).max(100)).max(36).optional(),
    setupFeePercent: z.number().min(0).max(100).optional(),
  })
  .refine(v => v.monthlySchedule !== undefined || v.setupFeePercent !== undefined, { message: 'Nada para alterar' })
export type UpdateSalesCommissionSettingsInput = z.infer<typeof updateSalesCommissionSettingsInput>

export const salesCommissionEntry = z.object({
  id: uuid,
  sellerUserId: z.string(),
  sellerName: z.string().nullable(),
  proposalId: uuid.nullable(),
  proposalCode: z.string().nullable(),
  organizationId: z.string().nullable(),
  /** Clube (ou o contratante, antes do provisionamento). */
  customerName: z.string(),
  chargeId: uuid,
  chargeKind: z.enum(['activation', 'monthly', 'adjustment']),
  kind: salesCommissionKind,
  /** Nº da mensalidade paga (1, 2, 3…); `null` na adesão. */
  installment: z.number().int().nullable(),
  /** Valor efetivamente pago da parte (adesão ou mensalidade) — base do cálculo. */
  baseAmount: z.number(),
  percent: z.number(),
  amount: z.number(),
  status: salesCommissionStatus,
  /** Competência `yyyy-MM` (mês do pagamento da fatura, São Paulo). */
  referenceMonth: z.string(),
  chargePaidAt: z.string().datetime().nullable(),
  payoutDate: dateOnly.nullable(),
  payoutNote: z.string().nullable(),
  paidOutByName: z.string().nullable(),
  canceledAt: z.string().datetime().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type SalesCommissionEntry = z.infer<typeof salesCommissionEntry>

export const salesCommissionTotals = z.object({
  prevista: z.number(),
  a_pagar: z.number(),
  paga: z.number(),
  cancelada: z.number(),
  a_descontar: z.number(),
  /** a_pagar + paga − a_descontar. */
  net: z.number(),
})
export type SalesCommissionTotals = z.infer<typeof salesCommissionTotals>

export const salesCommissionList = z.object({
  items: z.array(salesCommissionEntry),
  /** Totais do filtro inteiro (não só da página). */
  totals: salesCommissionTotals,
  total: z.number().int(),
  page: z.number().int(),
  perPage: z.number().int(),
})
export type SalesCommissionList = z.infer<typeof salesCommissionList>

export const listSalesCommissionsQuery = paginationQuery.extend({
  status: salesCommissionStatus.optional(),
  /** Competência `yyyy-MM`. */
  mes: yearMonth.optional(),
  /** Só na visão da equipe. */
  sellerUserId: z.string().trim().min(1).max(100).optional(),
})
export type ListSalesCommissionsQuery = z.infer<typeof listSalesCommissionsQuery>

/** `POST /platform/comercial/comissoes/pagar` (superadmin): marca `a_pagar` → `paga`. */
export const markSalesCommissionsPaidInput = z.object({
  ids: z.array(uuid).min(1).max(200),
  payoutDate: dateOnly,
  note: z.preprocess(v => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(500).optional()),
})
export type MarkSalesCommissionsPaidInput = z.infer<typeof markSalesCommissionsPaidInput>

// ---------------------------------------------------------------------------
// Painel do vendedor e relatório da equipe
// ---------------------------------------------------------------------------

export const sellerDashboard = z.object({
  seller: platformSeller,
  /** Competência do painel (`yyyy-MM`, São Paulo). */
  month: z.string(),
  prospectsByStage: z.record(prospectStage, z.number().int()),
  openProspects: z.number().int(),
  /** Propostas atribuídas ainda não finalizadas. */
  proposalsInProgress: z.number().int(),
  /** Pedidos de desconto aguardando o superadmin. */
  pendingDiscounts: z.number().int(),
  /** Clubes que entraram no ar no mês (propostas `active` provisionadas no mês). */
  wonThisMonth: z.number().int(),
  commissionThisMonth: salesCommissionTotals,
  goal: z.object({ target: z.number().int().nullable(), achieved: z.number().int(), pct: z.number().nullable() }),
  /** Próximas ações (até 7 dias, inclusive atrasadas), no máx. 10. */
  upcomingActions: z.array(prospect),
})
export type SellerDashboard = z.infer<typeof sellerDashboard>

export const salesReportRow = z.object({
  sellerUserId: z.string(),
  sellerName: z.string(),
  referralCode: z.string(),
  active: z.boolean(),
  openProspects: z.number().int(),
  proposalsInProgress: z.number().int(),
  wonInMonth: z.number().int(),
  lostInMonth: z.number().int(),
  monthlyGoal: z.number().int().nullable(),
  commission: salesCommissionTotals,
})
export type SalesReportRow = z.infer<typeof salesReportRow>

export const salesReport = z.object({
  month: z.string(),
  rows: z.array(salesReportRow),
  totals: z.object({
    openProspects: z.number().int(),
    proposalsInProgress: z.number().int(),
    wonInMonth: z.number().int(),
    commission: salesCommissionTotals,
  }),
})
export type SalesReport = z.infer<typeof salesReport>

export const salesReportQuery = z.object({ mes: yearMonth.optional() })
export type SalesReportQuery = z.infer<typeof salesReportQuery>

// ---------------------------------------------------------------------------
// Regras puras (comissão)
// ---------------------------------------------------------------------------

/** % da mensalidade nº `installment` (1-based) na escala; `null` = acima da escala ou 0 (não gera). */
export function commissionPercentForInstallment(schedule: readonly number[], installment: number): number | null {
  if (!Number.isInteger(installment) || installment < 1) return null
  const percent = schedule[installment - 1]
  return percent !== undefined && percent > 0 ? percent : null
}

/** Slug do código de indicação a partir do nome (`João da Silva` → `joao-da-silva`). */
export function referralCodeFromName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34)
    .replace(/-+$/g, '')
  return base.length >= 3 ? base : `vendedor-${base || 'annetec'}`.slice(0, 34)
}
