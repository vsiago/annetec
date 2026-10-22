import {
  HOLDING_THRESHOLDS,
  PLATFORM_ACCESS_LEVEL_LABELS,
  PLATFORM_SUBSCRIPTION_STATUS_LABELS,
  TENANT_LIFECYCLE_ACTION_LABELS,
  formatBRL,
  tenantAlertKinds,
  type AuditEntry,
  type HoldingAlertKind,
  type HoldingAlertSeverity,
  type HoldingTenantRow,
  type PageMeta,
  type PlatformAccessLevel,
  type PlatformSubscription,
  type TenantHealthInputs,
  type TenantLifecycleAction,
  type TenantStatus,
} from '@annetec/contracts'

/**
 * Apoio de tela da camada HOLDING (blueprint §Q5). Tudo aqui é PURO — roda no
 * browser e no servidor — e só traduz o que a API já calculou (§0.5) para a
 * linguagem da diretoria: formatação pt-BR, rótulos, a explicação de cada
 * componente da nota de saúde e quais comandos de ciclo de vida fazem sentido
 * no estado atual. Nenhuma fórmula de negócio é refeita aqui: nota, faixa e
 * alertas vêm da API, que usa `computeTenantHealth`/`tenantAlertKinds`.
 *
 * Os tipos de retorno das Server Actions de `lib/actions/holding-api.ts`
 * também moram aqui: arquivo `'use server'` só pode exportar função async.
 */

// ---------------------------------------------------------------------------
// Tipos compartilhados com as Server Actions
// ---------------------------------------------------------------------------

export interface HoldingAuditPage {
  rows: AuditEntry[]
  meta: PageMeta | null
}

export interface HoldingFetchOptions {
  /** 3–24 (padrão da API: 12). */
  meses?: number
  /** `?fresh=1`: ignora o cache de 60 s da API. */
  fresh?: boolean
}

export const HOLDING_PERIOD_OPTIONS = [6, 12, 24] as const
export const HOLDING_DEFAULT_MONTHS = 12

// ---------------------------------------------------------------------------
// Formatação (BRL e datas vêm de `@annetec/contracts` — br.ts)
// ---------------------------------------------------------------------------

const intFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const pctFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const compactBrlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const compactIntFormatter = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_LONGOS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/** Traço usado quando a taxa não tem base (`null` na API). */
export const SEM_BASE = '—'

export { formatBRL }

export function formatInt(value: number | null | undefined): string {
  return Number.isFinite(value) ? intFormatter.format(value as number) : SEM_BASE
}

/** `12.34` → `"12,3%"`; `null` → `"—"`. Com `signed`, `"+12,3%"` / `"−4,0%"`. */
export function formatPct(value: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return SEM_BASE
  const text = `${pctFormatter.format(Math.abs(value))}%`
  if (value < 0) return `−${text}`
  return opts.signed && value > 0 ? `+${text}` : text
}

/** Diferença entre duas taxas, em pontos percentuais: `"+5,2 p.p."`. */
export function formatPp(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return SEM_BASE
  const text = `${pctFormatter.format(Math.abs(value))} p.p.`
  if (value === 0) return `0,0 p.p.`
  return value > 0 ? `+${text}` : `−${text}`
}

/** Eixo de gráfico: `"R$ 12 mil"`, `"R$ 1,2 mi"`. */
export function formatCompactBRL(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value) < 1000) return formatBRL(Math.round(value)).replace(/,00$/, '')
  return compactBrlFormatter.format(value)
}

export function formatCompactInt(value: number): string {
  return Number.isFinite(value) ? compactIntFormatter.format(value) : ''
}

/** `"2026-09"` → `"set/26"`. */
export function monthShort(month: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(month ?? '')
  if (!match) return month ?? ''
  return `${MESES_CURTOS[Number(match[2]) - 1] ?? match[2]}/${match[1].slice(2)}`
}

/** `"2026-09"` → `"setembro de 2026"`. */
export function monthLong(month: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(month ?? '')
  if (!match) return month ?? ''
  return `${MESES_LONGOS[Number(match[2]) - 1] ?? match[2]} de ${match[1]}`
}

/** ISO → `"27/09/2026 14:32"` no fuso de São Paulo. */
export function formatDateTimeBR(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** ISO → `"14:32"` no fuso de São Paulo. */
export function formatTimeBR(value: string | Date | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

/** "há 3 min", "há 2 h", "há 5 dias". */
export function timeAgo(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  const diff = Math.max(0, now.getTime() - date.getTime())
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/**
 * `yyyy-MM-dd` escolhido na tela → fim daquele dia em São Paulo, em ISO UTC
 * (`z.string().datetime()` do contrato só aceita o sufixo `Z`). Brasil não tem
 * horário de verão desde 2019: o deslocamento é sempre −03:00.
 */
export function endOfDaySaoPauloIso(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const parsed = new Date(`${date}T23:59:59-03:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/**
 * Erro de negócio da API já vem em português e cabe na tela. Erro INTERNO
 * (500) pode trazer a consulta SQL inteira ("Error: Failed query: select …")
 * — a diretoria vê uma frase curta e o texto técnico fica recolhido.
 */
export function describeError(raw: string): { message: string; technical: string | null } {
  const text = (raw ?? '').trim()
  const technical =
    text.length > 200 || /^error:|failed query|does not exist|\bselect\b[\s\S]+\bfrom\b|\n\s+at\s/i.test(text)
  return technical
    ? { message: 'A API encontrou um erro interno ao montar estes dados. Tente novamente em instantes.', technical: text }
    : { message: text || 'Falha desconhecida.', technical: null }
}

/** Hoje (São Paulo) como `yyyy-MM-dd` — mínimo do seletor de data. */
export function todaySaoPaulo(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  trial: 'Em teste',
  active: 'Ativo',
  suspended: 'Suspenso',
  cancelled: 'Cancelado',
}

export const ALERT_SEVERITY_LABELS: Record<HoldingAlertSeverity, string> = {
  critical: 'Crítico',
  warning: 'Atenção',
  info: 'Informativo',
}

export const ALERT_SEVERITY_RANK: Record<HoldingAlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

/** Verbo do botão de cada alerta — o que a diretoria faz a partir dele. */
export const ALERT_ACTION_LABELS: Record<HoldingAlertKind, string> = {
  near_member_limit: 'Propor upgrade',
  over_member_limit: 'Propor upgrade',
  platform_delinquency: 'Ver cobrança e acesso',
  member_delinquency_rising: 'Analisar inadimplência',
  sales_drop: 'Analisar vendas',
  low_adoption: 'Ver adesão',
  onboarding_pending: 'Abrir análise',
  onboarding_awaiting_payment: 'Ver proposta',
  provisioning_failed: 'Reprocessar',
}

/** Rótulo curto para chip/badge (os longos estão em `HOLDING_ALERT_LABELS`). */
export const ALERT_SHORT_LABELS: Record<HoldingAlertKind, string> = {
  near_member_limit: 'Perto do limite',
  over_member_limit: 'Acima do limite',
  platform_delinquency: 'Deve à ANNETEC',
  member_delinquency_rising: 'Inadimplência subindo',
  sales_drop: 'Queda de vendas',
  low_adoption: 'Baixa adesão',
  onboarding_pending: 'Análise pendente',
  onboarding_awaiting_payment: 'Sem pagamento',
  provisioning_failed: 'Provisionamento',
}

/** Severidade padrão por tipo (quando a linha só traz o `kind`). */
const DEFAULT_ALERT_SEVERITY: Record<HoldingAlertKind, HoldingAlertSeverity> = {
  near_member_limit: 'info',
  over_member_limit: 'warning',
  platform_delinquency: 'warning',
  member_delinquency_rising: 'warning',
  sales_drop: 'warning',
  low_adoption: 'info',
  onboarding_pending: 'warning',
  onboarding_awaiting_payment: 'info',
  provisioning_failed: 'critical',
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  'tenant.lifecycle.restrict': 'Restringiu o painel (somente leitura)',
  'tenant.lifecycle.suspend': 'Suspendeu o painel',
  'tenant.lifecycle.reactivate': 'Reativou o acesso',
  'tenant.lifecycle.clear_override': 'Devolveu o acesso à régua automática',
  'tenant.provisioned': 'Provisionou o inquilino',
  'tenant.created': 'Criou o inquilino',
  'tenant.updated': 'Atualizou o cadastro do inquilino',
  'tenant.cancelled': 'Cancelou o inquilino',
  'tenant.integration_saved': 'Salvou a integração',
  'tenant_user.created': 'Criou usuário do inquilino',
  'tenant_user.updated': 'Atualizou usuário do inquilino',
  'tenant_user.deactivated': 'Desativou usuário do inquilino',
  'tenant_user.password_reset': 'Redefiniu senha de usuário',
  'tenant_user.impersonate_start': 'Entrou como usuário do inquilino',
  'platform_user.created': 'Criou usuário da plataforma',
  'billing_settings.updated': 'Alterou a configuração de cobrança do clube',
  'billing_automation.executed': 'Executou a automação de cobrança do clube',
  'club_plan.created': 'Criou plano do clube',
  'club_plan.updated': 'Alterou plano do clube',
  'club_plan.deleted': 'Excluiu plano do clube',
  'club_subscription.canceled': 'Cancelou assinatura de associado',
  'club_subscription.reactivated': 'Reativou assinatura de associado',
  'club_charge.manual_payment': 'Deu baixa manual em cobrança do clube',
  'club_charge.canceled': 'Cancelou cobrança do clube',
  'club_charge.reissued': 'Emitiu 2ª via de cobrança do clube',
  login: 'Entrou no sistema',
}

/** Ações pré-definidas do filtro da trilha de auditoria. */
export const AUDIT_ACTION_FILTERS: { value: string; label: string }[] = [
  { value: 'tenant.lifecycle.restrict', label: 'Restrição de painel' },
  { value: 'tenant.lifecycle.suspend', label: 'Suspensão de painel' },
  { value: 'tenant.lifecycle.reactivate', label: 'Reativação de acesso' },
  { value: 'tenant.lifecycle.clear_override', label: 'Volta à régua automática' },
  { value: 'tenant.provisioned', label: 'Provisionamento' },
  { value: 'tenant.updated', label: 'Cadastro do inquilino' },
  { value: 'tenant_user.impersonate_start', label: 'Entrar como' },
]

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action
}

export function isLifecycleAudit(entry: Pick<AuditEntry, 'action'>): boolean {
  return entry.action.startsWith('tenant.lifecycle.')
}

/** Motivo gravado em `metadata` pelas ações de ciclo de vida (e outras que tenham). */
export function auditReason(entry: Pick<AuditEntry, 'metadata'>): string | null {
  // O ciclo de vida grava `{ motivo, ate, antes, depois, mudou }`; outras ações usam `reason`.
  const reason = entry.metadata?.motivo ?? entry.metadata?.reason
  return typeof reason === 'string' && reason.trim() ? reason : null
}

/** Resumo legível do `metadata` (prazo e acesso antes → depois), quando houver. */
export function auditMetadataSummary(entry: Pick<AuditEntry, 'metadata'>): string | null {
  const meta = entry.metadata
  if (!meta) return null
  const accessLabel = (value: unknown) =>
    typeof value === 'string' && value in PLATFORM_ACCESS_LEVEL_LABELS
      ? PLATFORM_ACCESS_LEVEL_LABELS[value as PlatformAccessLevel]
      : typeof value === 'string'
        ? value
        : null
  const parts: string[] = []
  const before = accessLabel(meta.antes ?? meta.previousAccess)
  const after = accessLabel(meta.depois ?? meta.access)
  if (before && after) parts.push(`${before} → ${after}`)
  if (meta.mudou === false) parts.push('acesso já estava assim')
  const until = meta.ate ?? meta.until
  if (typeof until === 'string' && until) parts.push(`vale até ${formatDateTimeBR(until)}`)
  return parts.length ? parts.join(' · ') : null
}

// ---------------------------------------------------------------------------
// Nota de saúde — o motivo de cada componente
// ---------------------------------------------------------------------------

export function tenantAgeDays(createdAt: string, now: Date = new Date()): number {
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return 0
  return Math.max(0, Math.floor((now.getTime() - created) / 86_400_000))
}

/** Entradas de `computeTenantHealth`/`tenantAlertKinds` a partir da linha da API. */
export function healthInputsFromRow(row: HoldingTenantRow, now: Date = new Date()): TenantHealthInputs {
  return {
    managed: row.managed,
    platformStatus: row.platformStatus,
    memberDelinquencyRate: row.memberDelinquencyRate,
    memberDelinquencyRatePrev: row.memberDelinquencyRatePrev,
    gmvLast30: row.gmvLast30,
    gmvPrev30: row.gmvPrev30,
    usagePct: row.usagePct,
    tenantAgeDays: tenantAgeDays(row.createdAt, now),
    newMembersLast30: row.newMembersLast30,
  }
}

export interface HealthComponent {
  key: string
  label: string
  /** Pontos descontados (≤ 0), exatamente o que a API aplicou. */
  impact: number
  /** Desconto máximo possível deste componente. */
  maxPenalty: number
  /** Por que descontou — ou por que não descontou. */
  reason: string
}

const HEALTH_COMPONENTS: { key: string; label: string; maxPenalty: number }[] = [
  { key: 'platform_billing', label: 'Pagamento à ANNETEC', maxPenalty: 70 },
  { key: 'member_delinquency', label: 'Inadimplência dos associados', maxPenalty: 25 },
  { key: 'sales_drop', label: 'Vendas do clube (30 dias)', maxPenalty: 25 },
  { key: 'no_new_members', label: 'Novos associados (30 dias)', maxPenalty: 10 },
  { key: 'low_adoption', label: 'Adesão (uso do limite de vidas)', maxPenalty: 10 },
]

/**
 * Os 5 componentes da nota (§0.5 / `computeTenantHealth`), cada um com o
 * desconto aplicado pela API e a explicação em português — inclusive quando
 * não descontou nada, para a diretoria ver o que está bem e não só o que está
 * mal. Fator desconhecido (regra nova na API) entra no fim com o `detail` cru.
 */
export function healthBreakdown(row: HoldingTenantRow, now: Date = new Date()): HealthComponent[] {
  const age = tenantAgeDays(row.createdAt, now)
  const impactOf = (key: string) => row.healthFactors.find(f => f.factor === key)?.impact ?? 0

  const reasons: Record<string, string> = {
    platform_billing: !row.managed
      ? 'Contrato fora da cobrança automática — não entra na nota'
      : row.platformStatus
        ? `Assinatura: ${PLATFORM_SUBSCRIPTION_STATUS_LABELS[row.platformStatus].toLowerCase()}${
            row.platformDaysLate > 0 ? ` · ${row.platformDaysLate} dias de atraso` : ''
          }${row.platformOpenAmount > 0 ? ` · ${formatBRL(row.platformOpenAmount)} em aberto` : ''}`
        : 'Sem assinatura de plataforma',
    member_delinquency: `Taxa de ${formatPct(row.memberDelinquencyRate)} (há 30 dias: ${formatPct(
      row.memberDelinquencyRatePrev,
    )}) — desconta 1 ponto por ponto percentual, até 25`,
    sales_drop:
      row.gmvPrev30 > 0
        ? `GMV dos últimos 30 dias ${formatPct(row.salesTrendPct, { signed: true })} (${formatBRL(
            row.gmvLast30,
          )} contra ${formatBRL(row.gmvPrev30)}) — queda ≥ ${HOLDING_THRESHOLDS.salesDropPct}% desconta`
        : 'Sem receita nos 30 dias anteriores — sem base de comparação',
    no_new_members:
      row.newMembersLast30 > 0
        ? `${formatInt(row.newMembersLast30)} ${row.newMembersLast30 === 1 ? 'associado novo' : 'associados novos'} em 30 dias`
        : age < 30
          ? 'Nenhum associado novo, mas o inquilino tem menos de 30 dias'
          : 'Nenhum associado novo em 30 dias',
    low_adoption:
      row.usagePct === null
        ? 'Sem limite de vidas definido — não entra na nota'
        : `${formatPct(row.usagePct)} do limite (${formatInt(row.lives)} de ${formatInt(row.memberLimit)} vidas)${
            age < HOLDING_THRESHOLDS.lowAdoptionMinAgeDays
              ? ` — inquilino com menos de ${HOLDING_THRESHOLDS.lowAdoptionMinAgeDays} dias`
              : row.usagePct < HOLDING_THRESHOLDS.lowAdoptionPct
                ? ` — abaixo de ${HOLDING_THRESHOLDS.lowAdoptionPct}%`
                : ''
          }`,
  }

  const known = HEALTH_COMPONENTS.map(component => ({
    ...component,
    impact: impactOf(component.key),
    reason: reasons[component.key] ?? '',
  }))
  const extra = row.healthFactors
    .filter(f => !HEALTH_COMPONENTS.some(c => c.key === f.factor))
    .map(f => ({ key: f.factor, label: f.factor, impact: f.impact, maxPenalty: Math.abs(f.impact), reason: f.detail }))
  return [...known, ...extra]
}

/** Alertas da linha com severidade (a linha da API só traz o `kind`). */
export function rowAlerts(row: HoldingTenantRow, now: Date = new Date()): { kind: HoldingAlertKind; severity: HoldingAlertSeverity }[] {
  const computed = tenantAlertKinds(healthInputsFromRow(row, now))
  return row.alerts
    .map(kind => ({ kind, severity: computed.find(a => a.kind === kind)?.severity ?? DEFAULT_ALERT_SEVERITY[kind] }))
    .sort((a, b) => ALERT_SEVERITY_RANK[a.severity] - ALERT_SEVERITY_RANK[b.severity])
}

// ---------------------------------------------------------------------------
// Ciclo de vida (restringir, suspender, reativar, voltar à régua)
// ---------------------------------------------------------------------------

export interface LifecycleOption {
  action: TenantLifecycleAction
  label: string
  description: string
  /** Botão de confirmação. */
  confirmLabel: string
  tone: 'danger' | 'warning' | 'positive' | 'neutral'
  /** Acesso resultante (`null` = volta a valer a régua). */
  resultingAccess: PlatformAccessLevel | null
  allowUntil: boolean
  untilHint: string
  /** Motivo de estar indisponível agora (`null` = disponível). */
  unavailableReason: string | null
}

const NAO_AFETA =
  'Associados, vitrine, checkout do clube, portal do associado e carteirinhas NÃO são afetados.'

/**
 * Comandos de ciclo de vida e se cada um faz sentido no estado atual. Quem
 * decide de verdade é a API (422 para não gerenciado, 403 para quem não é
 * superadmin); a tela só evita oferecer o que é inócuo.
 */
export function lifecycleOptions(
  access: PlatformAccessLevel,
  subscription: Pick<PlatformSubscription, 'access'> | null,
): LifecycleOption[] {
  const overrideActive = subscription?.access.source === 'override'
  return [
    {
      action: 'restrict',
      label: TENANT_LIFECYCLE_ACTION_LABELS.restrict,
      description: `O painel da equipe (admin e vendedor) passa a SOMENTE LEITURA: consulta liberada, gravações bloqueadas. ${NAO_AFETA}`,
      confirmLabel: 'Confirmar restrição',
      tone: 'warning',
      resultingAccess: 'read_only',
      allowUntil: true,
      untilHint: 'Opcional. Na data, a decisão manual expira e volta a valer a régua de cobrança.',
      unavailableReason: access === 'read_only' ? 'O painel já está em somente leitura.' : null,
    },
    {
      action: 'suspend',
      label: TENANT_LIFECYCLE_ACTION_LABELS.suspend,
      description: `Bloqueia o painel da equipe — só a página "Minha assinatura ANNETEC" continua acessível. ${NAO_AFETA}`,
      confirmLabel: 'Confirmar suspensão',
      tone: 'danger',
      resultingAccess: 'blocked',
      allowUntil: true,
      untilHint: 'Opcional. Na data, a decisão manual expira e volta a valer a régua de cobrança.',
      unavailableReason: access === 'blocked' ? 'O painel já está bloqueado.' : null,
    },
    {
      action: 'reactivate',
      label: TENANT_LIFECYCLE_ACTION_LABELS.reactivate,
      description:
        'Libera o acesso completo agora, mesmo com fatura em aberto (ex.: promessa de pagamento). A cobrança continua correndo normalmente.',
      confirmLabel: 'Confirmar reativação',
      tone: 'positive',
      resultingAccess: 'full',
      allowUntil: true,
      untilHint: 'Opcional — prazo da promessa de pagamento. Sem data, vale até alguém voltar à régua.',
      unavailableReason: access === 'full' ? 'O painel já está com acesso completo.' : null,
    },
    {
      action: 'clear_override',
      label: TENANT_LIFECYCLE_ACTION_LABELS.clear_override,
      description:
        'Remove a decisão manual da holding: o acesso volta a seguir o status da assinatura (régua de cobrança automática).',
      confirmLabel: 'Voltar à régua',
      tone: 'neutral',
      resultingAccess: null,
      allowUntil: false,
      untilHint: '',
      unavailableReason: overrideActive ? null : 'Não há decisão manual vigente — o acesso já segue a régua.',
    },
  ]
}

/** Frase para o toast depois do comando. */
export function lifecycleSuccessMessage(action: TenantLifecycleAction, tenantName: string): string {
  const verbo: Record<TenantLifecycleAction, string> = {
    restrict: 'restrito (somente leitura)',
    suspend: 'suspenso',
    reactivate: 'reativado',
    clear_override: 'de volta à régua automática',
  }
  return `Painel de ${tenantName} ${verbo[action]}. Registrado na auditoria — o painel do inquilino reflete em até 30 s.`
}

// ---------------------------------------------------------------------------
// Tabela de inquilinos: filtros e ordenação no cliente
// ---------------------------------------------------------------------------

export type HoldingTenantSort = 'health' | 'lives' | 'gmv' | 'mrr' | 'name'

export const HOLDING_SORT_LABELS: Record<HoldingTenantSort, string> = {
  health: 'Pior saúde primeiro',
  lives: 'Mais vidas',
  gmv: 'Maior GMV (30 dias)',
  mrr: 'Maior receita da plataforma',
  name: 'Nome (A–Z)',
}

export interface HoldingTenantFilters {
  q: string
  band: HoldingTenantRow['healthBand'] | 'all'
  access: PlatformAccessLevel | 'all'
  alert: HoldingAlertKind | 'all'
  managed: 'all' | '1' | '0'
  sort: HoldingTenantSort
}

export const DEFAULT_TENANT_FILTERS: HoldingTenantFilters = {
  q: '',
  band: 'all',
  access: 'all',
  alert: 'all',
  managed: 'all',
  sort: 'health',
}

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export function filterAndSortTenants(rows: HoldingTenantRow[], filters: HoldingTenantFilters): HoldingTenantRow[] {
  const q = normalize(filters.q.trim())
  const filtered = rows.filter(row => {
    if (q && !normalize(`${row.name} ${row.slug}`).includes(q)) return false
    if (filters.band !== 'all' && row.healthBand !== filters.band) return false
    if (filters.access !== 'all' && row.access !== filters.access) return false
    if (filters.alert !== 'all' && !row.alerts.includes(filters.alert)) return false
    if (filters.managed === '1' && !row.managed) return false
    if (filters.managed === '0' && row.managed) return false
    return true
  })
  const byName = (a: HoldingTenantRow, b: HoldingTenantRow) => a.name.localeCompare(b.name, 'pt-BR')
  const comparators: Record<HoldingTenantSort, (a: HoldingTenantRow, b: HoldingTenantRow) => number> = {
    health: (a, b) => a.healthScore - b.healthScore || b.alerts.length - a.alerts.length || byName(a, b),
    lives: (a, b) => b.lives - a.lives || byName(a, b),
    gmv: (a, b) => b.gmvLast30 - a.gmvLast30 || byName(a, b),
    mrr: (a, b) => b.platformMrr - a.platformMrr || byName(a, b),
    name: byName,
  }
  return [...filtered].sort(comparators[filters.sort])
}

/** Tom do medidor de uso de vidas (≥ 100% acima do limite; ≥ 80% upsell). */
export function usageTone(usagePct: number | null): 'over' | 'near' | 'ok' | 'none' {
  if (usagePct === null) return 'none'
  if (usagePct >= 100) return 'over'
  if (usagePct >= HOLDING_THRESHOLDS.nearLimitPct) return 'near'
  return 'ok'
}
