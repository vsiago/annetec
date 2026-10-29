import { z } from 'zod'
import { paginationQuery } from '../common/pagination'
import { dateOnly, uuid } from '../common/primitives'
import { asaasEnvironment } from './club-billing'
import { tenantStatus } from './enums'
import { platformAccessLevel, platformSubscription, platformSubscriptionStatus, type PlatformSubscriptionStatus } from './platform-billing'

/**
 * Camada HOLDING — console da ANNETEC com visão consolidada de todos os
 * inquilinos (blueprint da plataforma §0.5). Leitura agregada calculada na
 * hora (cache de 60 s na API; `?fresh=1` ignora o cache) + controle do ciclo
 * de vida (restringir, suspender, reativar) e trilha de auditoria.
 *
 * Taxas são PERCENTUAIS 0–100 com 1 casa. Meses são `yyyy-MM` (America/Sao_Paulo).
 * "Vida" = titular ou dependente de assinatura do clube `active`/`past_due`.
 */

/** `?meses=` 3–24 (padrão 12) e `?fresh=1`. */
export const holdingPeriodQuery = z.object({
  meses: z.coerce.number().int().min(3).max(24).default(12),
  fresh: z.enum(['0', '1']).optional(),
})
export type HoldingPeriodQuery = z.infer<typeof holdingPeriodQuery>

export const holdingKpis = z.object({
  /** Σ mensal estimado das assinaturas de plataforma `active`/`past_due`/`restricted`. */
  platformMrr: z.number(),
  /** Σ `tenant_plans.priceMonthly` dos inquilinos SEM assinatura de plataforma e `active` (contratos fora da cobrança automática). */
  legacyMrrEstimate: z.number(),
  platformReceivedThisMonth: z.number(),
  platformReceivedLastMonth: z.number(),
  /** Receita somada dos clubes: Σ `club_charges.paid_amount` pagas no mês. */
  gmvThisMonth: z.number(),
  gmvLastMonth: z.number(),
  /** (gmvThisMonth − gmvLastMonth) ÷ gmvLastMonth × 100; `null` sem base. */
  gmvGrowthPct: z.number().nullable(),
  /** Σ `club_subscriptions.amount` `active`/`past_due`, todos os clubes. */
  clubMrr: z.number(),
  totalLives: z.number().int(),
  /** Vidas de assinaturas ativadas no mês corrente (titular + dependentes). */
  livesAddedThisMonth: z.number().int(),
  /** (novos − cancelados no mês) ÷ assinaturas vivas no início do mês × 100. */
  memberNetGrowthPct: z.number().nullable(),
  tenantsTotal: z.number().int(),
  /** Com assinatura de plataforma. */
  tenantsManaged: z.number().int(),
  tenantsByAccess: z.object({ full: z.number().int(), read_only: z.number().int(), blocked: z.number().int() }),
  tenantsNewThisMonth: z.number().int(),
  /**
   * Clubes (operadores não cancelados) com problema no recebimento das
   * mensalidades: `receivingIssue ≠ null` na linha do ranking, ou seja, sem
   * conta Asaas conectada, conta ainda não aprovada ou webhook `pendente`/`erro`.
   * Bate com a contagem de linhas de `/holding/inquilinos` com `receivingIssue ≠ null`.
   */
  clubsWithoutReceiving: z.number().int(),
  /** Churn do mês nos 2 níveis (fórmulas em blueprint §0.5). */
  tenantChurnRate: z.number().nullable(),
  memberChurnRate: z.number().nullable(),
  /** Inadimplência nos 2 níveis: vencido em aberto ÷ faturado com vencimento em 90 dias. */
  platformDelinquencyRate: z.number(),
  memberDelinquencyRate: z.number(),
  platformOverdueAmount: z.number(),
  memberOverdueAmount: z.number(),
  onboarding: z.object({
    queue: z.number().int(),
    slaBreached: z.number().int(),
    awaitingPayment: z.number().int(),
    activatedThisMonth: z.number().int(),
    /** Ativadas ÷ enviadas nos últimos 90 dias × 100. */
    conversionRate90d: z.number().nullable(),
  }),
})
export type HoldingKpis = z.infer<typeof holdingKpis>

export const holdingMonthlyPoint = z.object({
  month: z.string(),
  platformBilled: z.number(),
  platformReceived: z.number(),
  gmv: z.number(),
  newTenants: z.number().int(),
  churnedTenants: z.number().int(),
  newMembers: z.number().int(),
  churnedMembers: z.number().int(),
  /** Assinaturas de associados vivas no fim do mês (aprox. por started/canceled). */
  membersEnd: z.number().int(),
  tenantChurnRate: z.number().nullable(),
  memberChurnRate: z.number().nullable(),
})
export type HoldingMonthlyPoint = z.infer<typeof holdingMonthlyPoint>

export const tenantHealthBand = z.enum(['healthy', 'attention', 'risk'])
export type TenantHealthBand = z.infer<typeof tenantHealthBand>

export const TENANT_HEALTH_BAND_LABELS: Record<TenantHealthBand, string> = {
  healthy: 'Saudável',
  attention: 'Atenção',
  risk: 'Risco',
}

export const holdingAlertKind = z.enum([
  'near_member_limit',
  'over_member_limit',
  'platform_delinquency',
  'member_delinquency_rising',
  'sales_drop',
  'low_adoption',
  'onboarding_pending',
  'onboarding_awaiting_payment',
  'provisioning_failed',
])
export type HoldingAlertKind = z.infer<typeof holdingAlertKind>

export const HOLDING_ALERT_LABELS: Record<HoldingAlertKind, string> = {
  near_member_limit: 'Perto do limite de vidas (upsell)',
  over_member_limit: 'Acima do limite de vidas (upgrade)',
  platform_delinquency: 'Inadimplência com a ANNETEC',
  member_delinquency_rising: 'Inadimplência dos associados subindo',
  sales_drop: 'Queda de vendas',
  low_adoption: 'Baixa adesão',
  onboarding_pending: 'Análise cadastral pendente',
  onboarding_awaiting_payment: 'Ativação aprovada sem pagamento',
  provisioning_failed: 'Falha no provisionamento',
}

export const holdingAlertSeverity = z.enum(['info', 'warning', 'critical'])
export type HoldingAlertSeverity = z.infer<typeof holdingAlertSeverity>

export const holdingAlert = z.object({
  /** Determinístico: `<kind>:<organizationId|proposalId>`. */
  id: z.string(),
  kind: holdingAlertKind,
  severity: holdingAlertSeverity,
  organizationId: z.string().nullable(),
  tenantName: z.string().nullable(),
  tenantSlug: z.string().nullable(),
  proposalId: uuid.nullable(),
  title: z.string(),
  message: z.string(),
  /** Valor que disparou (ex.: 92 = 92% do limite). */
  metric: z.number().nullable(),
  /** Rota da web para agir (ex.: `/admin/compliance/<id>`). */
  actionHref: z.string().nullable(),
  detectedAt: z.string().datetime(),
})
export type HoldingAlert = z.infer<typeof holdingAlert>

export const healthFactor = z.object({
  factor: z.string(),
  /** Pontos descontados (negativo). */
  impact: z.number(),
  detail: z.string(),
})
export type HealthFactor = z.infer<typeof healthFactor>

/**
 * Problema no recebimento das mensalidades do clube (conta Asaas própria em
 * `tenant_asaas_accounts`). Precedência: `nao_conectado` > `conta_pendente` >
 * `aviso_com_erro`; o clube sem nenhum problema fica com `null`.
 *  - `nao_conectado`: não há conta de recebimento;
 *  - `conta_pendente`: há conta, mas a situação cadastral no Asaas NÃO está
 *    aprovada (situação desconhecida — Asaas indisponível na conexão — não conta);
 *  - `aviso_com_erro`: conta aprovada, mas o webhook de avisos está `erro` ou `pendente`.
 */
export const holdingReceivingIssue = z.enum(['nao_conectado', 'conta_pendente', 'aviso_com_erro'])
export type HoldingReceivingIssue = z.infer<typeof holdingReceivingIssue>

export const HOLDING_RECEIVING_ISSUE_LABELS: Record<HoldingReceivingIssue, string> = {
  nao_conectado: 'Falta conectar',
  conta_pendente: 'Conta em aprovação no Asaas',
  aviso_com_erro: 'Aviso de pagamento com falha',
}

export const holdingTenantRow = z.object({
  organizationId: z.string(),
  slug: z.string(),
  name: z.string(),
  tenantStatus,
  /** Tem assinatura de plataforma (cobrança automática + restrição). */
  managed: z.boolean(),
  platformStatus: platformSubscriptionStatus.nullable(),
  access: platformAccessLevel,
  planName: z.string().nullable(),
  memberLimit: z.number().int().nullable(),
  lives: z.number().int(),
  usagePct: z.number().nullable(),
  platformMrr: z.number(),
  platformOpenAmount: z.number(),
  platformDaysLate: z.number().int(),
  clubMrr: z.number(),
  gmvLast30: z.number(),
  gmvPrev30: z.number(),
  /** (gmvLast30 − gmvPrev30) ÷ gmvPrev30 × 100; `null` sem base. */
  salesTrendPct: z.number().nullable(),
  newMembersLast30: z.number().int(),
  /** Assinaturas de associados `active` + `past_due` do clube agora (titulares; sem dependentes). */
  activeMembers: z.number().int(),
  /** Vidas ativas: titulares + dependentes das assinaturas `active`/`past_due`. Mesmo valor de `lives`. */
  activeLives: z.number().int(),
  /**
   * Variação aproximada de `activeMembers` em 30 dias: assinaturas vivas agora
   * − vivas há 30 dias (viva = `started_at` < instante e sem `canceled_at` até ele).
   * O banco não guarda histórico de status, então entrada/saída de `past_due` não aparece.
   */
  activeMembersDelta30: z.number().int(),
  /** Tem linha em `tenant_asaas_accounts` (conta de recebimento Asaas própria). */
  receivingConnected: z.boolean(),
  /** Ambiente da chave conectada; `null` = sem conta. */
  receivingEnv: asaasEnvironment.nullable(),
  /** `null` = recebimento em ordem (ver `holdingReceivingIssue`). */
  receivingIssue: holdingReceivingIssue.nullable(),
  memberDelinquencyRate: z.number(),
  /** Idem, 30 dias antes (para "subindo"). */
  memberDelinquencyRatePrev: z.number(),
  healthScore: z.number().int().min(0).max(100),
  healthBand: tenantHealthBand,
  healthFactors: z.array(healthFactor),
  alerts: z.array(holdingAlertKind),
  createdAt: z.string().datetime(),
})
export type HoldingTenantRow = z.infer<typeof holdingTenantRow>

/** `GET /platform/holding/visao-geral`. */
export const holdingOverview = z.object({
  generatedAt: z.string().datetime(),
  cached: z.boolean(),
  kpis: holdingKpis,
  monthly: z.array(holdingMonthlyPoint),
  healthDistribution: z.object({ healthy: z.number().int(), attention: z.number().int(), risk: z.number().int() }),
  /** Até 10, mais graves primeiro. */
  topAlerts: z.array(holdingAlert),
})
export type HoldingOverview = z.infer<typeof holdingOverview>

export const holdingCohortRow = z.object({
  /** `yyyy-MM` da ativação. */
  cohort: z.string(),
  size: z.number().int(),
  /** `retention[k]` = % da coorte não cancelada ao fim do mês cohort+k; `null` = mês futuro. */
  retention: z.array(z.number().nullable()),
})
export type HoldingCohortRow = z.infer<typeof holdingCohortRow>

export const holdingCohortLevel = z.enum(['inquilino', 'associado'])
export type HoldingCohortLevel = z.infer<typeof holdingCohortLevel>

export const holdingCohortsQuery = holdingPeriodQuery.extend({ nivel: holdingCohortLevel.default('associado') })
export type HoldingCohortsQuery = z.infer<typeof holdingCohortsQuery>

export const holdingCohorts = z.object({
  level: holdingCohortLevel,
  months: z.number().int(),
  rows: z.array(holdingCohortRow),
})
export type HoldingCohorts = z.infer<typeof holdingCohorts>

export const listHoldingTenantsQuery = paginationQuery.extend({
  band: tenantHealthBand.optional(),
  access: platformAccessLevel.optional(),
  alert: holdingAlertKind.optional(),
  managed: z.enum(['0', '1']).optional(),
  /** `health` (pior primeiro, padrão), `lives`, `gmv`, `mrr`, `name`. */
  sort: z.enum(['health', 'lives', 'gmv', 'mrr', 'name']).optional(),
})
export type ListHoldingTenantsQuery = z.infer<typeof listHoldingTenantsQuery>

export const auditEntry = z.object({
  id: uuid,
  organizationId: z.string().nullable(),
  tenantName: z.string().nullable(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorScope: z.enum(['platform', 'tenant']).nullable(),
  action: z.string(),
  resource: z.string(),
  resourceId: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  ip: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export type AuditEntry = z.infer<typeof auditEntry>

export const listAuditQuery = paginationQuery.extend({
  organizationId: z.string().min(1).optional(),
  resource: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
})
export type ListAuditQuery = z.infer<typeof listAuditQuery>

export const holdingTenantDetail = z.object({
  tenant: holdingTenantRow,
  monthly: z.array(
    z.object({
      month: z.string(),
      gmv: z.number(),
      newMembers: z.number().int(),
      churnedMembers: z.number().int(),
      platformBilled: z.number(),
      platformReceived: z.number(),
    }),
  ),
  alerts: z.array(holdingAlert),
  subscription: platformSubscription.nullable(),
  proposalId: uuid.nullable(),
  recentAudit: z.array(auditEntry),
})
export type HoldingTenantDetail = z.infer<typeof holdingTenantDetail>

/**
 * Controle do ciclo de vida (grava override de acesso na assinatura de
 * plataforma). Só para inquilino COM assinatura de plataforma — os demais
 * respondem 422 (nunca restringimos inquilino fora da cobrança automática).
 * `reactivate` = acesso completo até `until` (promessa de pagamento) ou até
 * limpar; `clear_override` volta a valer a régua.
 */
export const tenantLifecycleAction = z.enum(['restrict', 'suspend', 'reactivate', 'clear_override'])
export type TenantLifecycleAction = z.infer<typeof tenantLifecycleAction>

export const TENANT_LIFECYCLE_ACTION_LABELS: Record<TenantLifecycleAction, string> = {
  restrict: 'Restringir (somente leitura)',
  suspend: 'Suspender painel',
  reactivate: 'Reativar acesso',
  clear_override: 'Voltar à régua automática',
}

export const tenantLifecycleInput = z.object({
  action: tenantLifecycleAction,
  reason: z.string().trim().min(5, 'Explique o motivo').max(500),
  until: z.string().datetime().optional(),
})
export type TenantLifecycleInput = z.infer<typeof tenantLifecycleInput>

// ---------------------------------------------------------------------------
// Nota de saúde e alertas — regras puras (a API calcula com ESTAS funções)
// ---------------------------------------------------------------------------

export const HOLDING_THRESHOLDS = {
  /** Uso ≥ 80% do limite → alerta de upsell; ≥ 100% → acima do limite. */
  nearLimitPct: 80,
  /** Queda de GMV 30d vs 30d anteriores ≥ 30% → `sales_drop`. */
  salesDropPct: 30,
  /** Inadimplência de associados ≥ 15% OU subiu ≥ 5 p.p. em 30 dias → alerta. */
  memberDelinquencyHighPct: 15,
  memberDelinquencyRisePp: 5,
  /** Inquilino com 60+ dias e uso < 10% → baixa adesão. */
  lowAdoptionPct: 10,
  lowAdoptionMinAgeDays: 60,
  /** Ativação aprovada sem pagamento há 5+ dias. */
  awaitingPaymentDays: 5,
  healthyMin: 75,
  attentionMin: 50,
} as const

export interface TenantHealthInputs {
  managed: boolean
  platformStatus: PlatformSubscriptionStatus | null
  memberDelinquencyRate: number
  memberDelinquencyRatePrev: number
  gmvLast30: number
  gmvPrev30: number
  usagePct: number | null
  tenantAgeDays: number
  newMembersLast30: number
}

/**
 * Nota 0–100 (blueprint §0.5): começa em 100 e desconta
 *  - plataforma: past_due −15 · restricted −30 · suspended −50 · canceled −70;
 *  - inadimplência de associados: −min(25, taxa%);
 *  - vendas: GMV 30d caiu ≥ 30% → −15 (≥ 50% → −25);
 *  - sem novos associados em 30 dias (inquilino com 30+ dias) → −10;
 *  - baixa adesão (60+ dias e uso < 10%) → −10.
 * Faixas: ≥ 75 saudável · 50–74 atenção · < 50 risco.
 */
export function computeTenantHealth(input: TenantHealthInputs): {
  score: number
  band: TenantHealthBand
  factors: HealthFactor[]
} {
  const factors: HealthFactor[] = []
  const platformPenalty: Record<PlatformSubscriptionStatus, number> = {
    active: 0,
    past_due: 15,
    restricted: 30,
    suspended: 50,
    canceled: 70,
  }
  if (input.platformStatus && platformPenalty[input.platformStatus] > 0) {
    factors.push({
      factor: 'platform_billing',
      impact: -platformPenalty[input.platformStatus],
      detail: `Assinatura da plataforma: ${input.platformStatus}`,
    })
  }
  const delinquency = Math.min(25, Math.round(Math.max(0, input.memberDelinquencyRate)))
  if (delinquency > 0) {
    factors.push({ factor: 'member_delinquency', impact: -delinquency, detail: `Inadimplência dos associados: ${input.memberDelinquencyRate}%` })
  }
  if (input.gmvPrev30 > 0) {
    const drop = ((input.gmvPrev30 - input.gmvLast30) / input.gmvPrev30) * 100
    if (drop >= 50) factors.push({ factor: 'sales_drop', impact: -25, detail: `Receita do clube caiu ${Math.round(drop)}% em 30 dias` })
    else if (drop >= HOLDING_THRESHOLDS.salesDropPct) {
      factors.push({ factor: 'sales_drop', impact: -15, detail: `Receita do clube caiu ${Math.round(drop)}% em 30 dias` })
    }
  }
  if (input.tenantAgeDays >= 30 && input.newMembersLast30 === 0) {
    factors.push({ factor: 'no_new_members', impact: -10, detail: 'Nenhum associado novo em 30 dias' })
  }
  if (
    input.usagePct !== null &&
    input.tenantAgeDays >= HOLDING_THRESHOLDS.lowAdoptionMinAgeDays &&
    input.usagePct < HOLDING_THRESHOLDS.lowAdoptionPct
  ) {
    factors.push({ factor: 'low_adoption', impact: -10, detail: `Uso de ${input.usagePct}% do limite de vidas` })
  }
  const score = Math.max(0, Math.min(100, 100 + factors.reduce((acc, f) => acc + f.impact, 0)))
  const band: TenantHealthBand =
    score >= HOLDING_THRESHOLDS.healthyMin ? 'healthy' : score >= HOLDING_THRESHOLDS.attentionMin ? 'attention' : 'risk'
  return { score, band, factors }
}

/** Alertas de um inquilino (os de proposta vêm da fila de onboarding). */
export function tenantAlertKinds(input: TenantHealthInputs): { kind: HoldingAlertKind; severity: HoldingAlertSeverity }[] {
  const alerts: { kind: HoldingAlertKind; severity: HoldingAlertSeverity }[] = []
  if (input.usagePct !== null) {
    if (input.usagePct >= 100) alerts.push({ kind: 'over_member_limit', severity: 'warning' })
    else if (input.usagePct >= HOLDING_THRESHOLDS.nearLimitPct) alerts.push({ kind: 'near_member_limit', severity: 'info' })
  }
  if (input.platformStatus && input.platformStatus !== 'active') {
    alerts.push({
      kind: 'platform_delinquency',
      severity: input.platformStatus === 'past_due' ? 'warning' : 'critical',
    })
  }
  if (
    input.memberDelinquencyRate >= HOLDING_THRESHOLDS.memberDelinquencyHighPct ||
    input.memberDelinquencyRate - input.memberDelinquencyRatePrev >= HOLDING_THRESHOLDS.memberDelinquencyRisePp
  ) {
    alerts.push({ kind: 'member_delinquency_rising', severity: 'warning' })
  }
  if (input.gmvPrev30 > 0 && ((input.gmvPrev30 - input.gmvLast30) / input.gmvPrev30) * 100 >= HOLDING_THRESHOLDS.salesDropPct) {
    alerts.push({ kind: 'sales_drop', severity: 'warning' })
  }
  if (
    input.usagePct !== null &&
    input.tenantAgeDays >= HOLDING_THRESHOLDS.lowAdoptionMinAgeDays &&
    input.usagePct < HOLDING_THRESHOLDS.lowAdoptionPct
  ) {
    alerts.push({ kind: 'low_adoption', severity: 'info' })
  }
  return alerts
}
