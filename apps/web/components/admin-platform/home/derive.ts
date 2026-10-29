import { HOLDING_RECEIVING_ISSUE_LABELS } from '@annetec/contracts'
import type { HealthFactor, HoldingReceivingIssue, HoldingTenantRow, TenantHealthBand } from '@annetec/contracts'
import { formatPct } from '@/lib/adapters/holding'
import type { KpiDelta } from '@/components/admin-platform/ui/kpi-card'
import type { StatusPillTone } from '@/components/admin-platform/ui/status-pill'
import type { HomeData, HomeExtras } from './use-home-data'
import {
  brlExact,
  brlWhole,
  dayAndMonth,
  daysBetween,
  formatCount,
  monthLongName,
  monthShortName,
  plural,
  previousMonthOf,
  waitedSince,
} from './format'

/**
 * Tudo que o Início mostra, derivado do que a API já calculou. Nenhuma fórmula
 * de negócio é refeita aqui: só escolhe o que mostrar e traduz para a língua
 * do dono (clube, em atraso, saúde Boa/Atenção/Crítica).
 */

// ---------------------------------------------------------------------------
// Precisa de você
// ---------------------------------------------------------------------------

export interface ActionItem {
  key: 'approvals' | 'billing' | 'clubs'
  /** Área do console a que a pendência pertence. */
  area: string
  title: string
  detail: string
  cta: string
  href: string
  tone: 'warning' | 'danger'
}

function activeClubs(rows: HoldingTenantRow[]): HoldingTenantRow[] {
  return rows.filter(row => row.tenantStatus !== 'cancelled')
}

function clubsWithReceivingIssue(rows: HoldingTenantRow[]): HoldingTenantRow[] {
  return activeClubs(rows).filter(row => row.receivingIssue !== null)
}

function receivingDetail(name: string, issue: HoldingReceivingIssue): string {
  switch (issue) {
    case 'nao_conectado':
      return `${name}: falta conectar a conta do Asaas. Sem ela, o clube não consegue vender.`
    case 'conta_pendente':
      return `${name}: a conta está conectada, mas o Asaas ainda a analisa. Se faltar algo, o responsável conclui o cadastro lá.`
    case 'aviso_com_erro':
      return `${name}: o aviso de pagamento está com falha. Os pagamentos podem demorar a aparecer.`
  }
}

export function buildActionItems(data: HomeData, extras: HomeExtras | null, nowMs: number): ActionItem[] {
  const items: ActionItem[] = []

  const waiting = data.queue.total
  if (waiting > 0) {
    const waited = data.queue.oldestSubmittedAt ? waitedSince(data.queue.oldestSubmittedAt, nowMs) : ''
    const detail = !waited
      ? 'Esperam a sua análise.'
      : waiting === 1
        ? `Espera há ${waited}.`
        : `O mais antigo espera há ${waited}.`
    items.push({
      key: 'approvals',
      area: 'Aprovações',
      title: `${formatCount(waiting)} ${waiting === 1 ? 'clube esperando' : 'clubes esperando'} aprovação`,
      detail,
      cta: 'Analisar agora',
      href: '/admin/compliance',
      tone: data.queue.oldestBreached ? 'danger' : 'warning',
    })
  }

  const overdue = data.billing.overdueCharges
  if (overdue > 0) {
    const oldestDue = extras?.oldestOverdueDue
    const lateDays = oldestDue && extras ? Math.max(1, daysBetween(oldestDue, extras.today)) : null
    const total = brlExact(data.billing.overdueAmount)
    let detail: string
    if (overdue === 1) {
      detail = lateDays ? `${total}. Venceu há ${plural(lateDays, 'dia', 'dias')}.` : `${total}.`
    } else {
      detail = lateDays
        ? `${total} no total. A mais antiga venceu há ${plural(lateDays, 'dia', 'dias')}.`
        : `${total} no total.`
    }
    items.push({
      key: 'billing',
      area: 'Financeiro',
      title: `${formatCount(overdue)} ${overdue === 1 ? 'fatura em atraso' : 'faturas em atraso'}`,
      detail,
      cta: 'Ver faturas',
      href: '/admin/financeiro',
      tone: 'danger',
    })
  }

  const withoutReceiving = data.overview.kpis.clubsWithoutReceiving
  if (withoutReceiving > 0) {
    const affected = clubsWithReceivingIssue(data.rows)
    const [first, second] = affected
    let detail: string
    if (withoutReceiving === 1 && first?.receivingIssue) {
      detail = receivingDetail(first.name, first.receivingIssue)
    } else if (first && second) {
      const rest = withoutReceiving - 2
      detail = `${first.name}, ${second.name}${rest > 0 ? ` e mais ${formatCount(rest)}` : ''} precisam conectar ou corrigir o recebimento.`
    } else {
      detail = 'Estes clubes precisam conectar ou corrigir o recebimento das mensalidades.'
    }
    const single = withoutReceiving === 1 && first
    items.push({
      key: 'clubs',
      area: 'Clubes',
      title: `${formatCount(withoutReceiving)} ${withoutReceiving === 1 ? 'clube sem recebimento' : 'clubes sem recebimento'}`,
      detail,
      cta: single ? 'Ver clube' : 'Ver clubes',
      href: single ? `/admin/inquilinos/${encodeURIComponent(first.organizationId)}` : '/admin/inquilinos',
      tone: 'warning',
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// Números do mês
// ---------------------------------------------------------------------------

export interface MonthKpi {
  key: string
  label: string
  value: string
  hint?: string
  delta?: KpiDelta
  href?: string
}

export function buildMonthKpis(data: HomeData, extras: HomeExtras | null, todayIso: string): MonthKpi[] {
  const { kpis } = data.overview
  const monthName = monthLongName(todayIso)
  const previousName = monthLongName(previousMonthOf(todayIso))
  const kpisList: MonthKpi[] = []

  // Receita da ANNETEC: o recebido no mês, contra o mês anterior inteiro.
  const received = kpis.platformReceivedThisMonth
  const last = kpis.platformReceivedLastMonth
  let revenueDelta: KpiDelta | undefined
  let revenueHint: string
  if (last > 0) {
    const pct = Math.round(((received - last) / last) * 100)
    if (received >= last) {
      revenueDelta = { text: `${pct}%`, tone: pct > 0 ? 'up' : 'neutral' }
      revenueHint = `recebido, contra ${previousName}`
    } else {
      // Mês ainda em andamento: queda parcial não é motivo de alarme, então não fica vermelha.
      revenueDelta = { text: `−${Math.abs(pct)}%`, tone: 'neutral' }
      revenueHint = `recebido até hoje, contra ${previousName} inteiro`
    }
  } else {
    revenueHint = received > 0 ? 'recebido no mês' : 'nada recebido ainda no mês'
  }
  kpisList.push({
    key: 'revenue',
    label: 'Receita da ANNETEC',
    value: brlWhole(received),
    delta: revenueDelta,
    hint: revenueHint,
    href: '/admin/financeiro',
  })

  // A receber: faturas que vencem de hoje até o fim do mês.
  const monthEnd = extras ? dayAndMonth(extras.monthEnd) : null
  const pendingCount = extras?.pendingCount
  let receivableHint: string | undefined
  if (monthEnd) {
    if (pendingCount === undefined) receivableHint = `a vencer até ${monthEnd}`
    else if (pendingCount === 0) receivableHint = `nenhuma fatura vence até ${monthEnd}`
    else receivableHint = `${pendingCount === 1 ? '1 fatura vence' : `${formatCount(pendingCount)} faturas vencem`} até ${monthEnd}`
  } else {
    receivableHint = 'a vencer até o fim do mês'
  }
  kpisList.push({
    key: 'receivable',
    label: 'A receber',
    value: brlWhole(data.billing.pendingThisMonth),
    hint: receivableHint,
    href: '/admin/financeiro',
  })

  // Clubes ativos (em teste e suspensos não entram) e quantos são novos no mês.
  const activeCount = activeClubs(data.rows).filter(row => row.tenantStatus === 'active').length
  const fresh = kpis.tenantsNewThisMonth
  kpisList.push({
    key: 'clubs',
    label: 'Clubes ativos',
    value: formatCount(activeCount),
    delta: fresh > 0 ? { text: `+${formatCount(fresh)}`, tone: 'up' } : undefined,
    hint: fresh > 0 ? `${fresh === 1 ? 'novo' : 'novos'} em ${monthName}` : `nenhum clube novo em ${monthName}`,
    href: '/admin/inquilinos',
  })

  // Vidas nos clubes: titulares e dependentes.
  const added = kpis.livesAddedThisMonth
  kpisList.push({
    key: 'lives',
    label: 'Vidas nos clubes',
    value: formatCount(kpis.totalLives),
    delta: added > 0 ? { text: `+${formatCount(added)}`, tone: 'up' } : undefined,
    hint: added > 0 ? `entraram em ${monthName}, titulares e dependentes` : 'titulares e dependentes',
  })

  return kpisList
}

// ---------------------------------------------------------------------------
// Receita dos últimos 6 meses
// ---------------------------------------------------------------------------

export interface RevenueBar {
  month: string
  shortLabel: string
  longLabel: string
  value: number
  current: boolean
}

export function buildRevenueBars(data: HomeData): RevenueBar[] {
  const points = data.overview.monthly.slice(-6)
  return points.map((point, index) => ({
    month: point.month,
    shortLabel: monthShortName(point.month),
    longLabel: monthLongName(point.month),
    value: point.platformReceived,
    current: index === points.length - 1,
  }))
}

// ---------------------------------------------------------------------------
// Saúde dos clubes
// ---------------------------------------------------------------------------

export const HEALTH_BAND_TEXT: Record<TenantHealthBand, { label: string; tone: StatusPillTone }> = {
  healthy: { label: 'Boa', tone: 'success' },
  attention: { label: 'Atenção', tone: 'warning' },
  risk: { label: 'Crítica', tone: 'danger' },
}

export interface AttentionClub {
  id: string
  name: string
  reason: string
  band: TenantHealthBand
}

const BAND_RANK: Record<TenantHealthBand, number> = { risk: 0, attention: 1, healthy: 2 }

/** O mesmo rótulo curto da lista de clubes (`HOLDING_RECEIVING_ISSUE_LABELS`). */
const RECEIVING_REASON: Record<HoldingReceivingIssue, string> = HOLDING_RECEIVING_ISSUE_LABELS

const PLATFORM_STATUS_REASON: Record<string, string> = {
  past_due: 'Mensalidade da ANNETEC em atraso',
  restricted: 'Acesso restrito por falta de pagamento',
  suspended: 'Acesso suspenso por falta de pagamento',
  canceled: 'Assinatura cancelada',
}

function factorReason(row: HoldingTenantRow, factor: HealthFactor): string {
  switch (factor.factor) {
    case 'platform_billing':
      if (row.platformDaysLate > 0) return `Mensalidade atrasada há ${plural(row.platformDaysLate, 'dia', 'dias')}`
      return (row.platformStatus && PLATFORM_STATUS_REASON[row.platformStatus]) || 'Problema na mensalidade da ANNETEC'
    case 'member_delinquency':
      return `${formatPct(row.memberDelinquencyRate)} das mensalidades dos associados em atraso`
    case 'sales_drop':
      return row.salesTrendPct !== null && row.salesTrendPct < 0
        ? `Vendas caíram ${Math.round(Math.abs(row.salesTrendPct))}% em 30 dias`
        : 'Vendas em queda'
    case 'no_new_members':
      return 'Nenhum associado novo em 30 dias'
    case 'low_adoption':
      return row.usagePct !== null ? `Só ${Math.round(row.usagePct)}% do limite de vidas em uso` : 'Poucos associados'
    default:
      return factor.detail
  }
}

/**
 * Uma frase com o motivo. Clube com saúde Boa só está na lista por causa do
 * recebimento ou da mensalidade atrasada; nos demais, vale o que mais derrubou a nota.
 */
function attentionReason(row: HoldingTenantRow): string {
  if (row.healthBand === 'healthy' && row.receivingIssue) return RECEIVING_REASON[row.receivingIssue]
  if (row.healthBand === 'healthy' && row.platformDaysLate > 0) {
    return `Mensalidade atrasada há ${plural(row.platformDaysLate, 'dia', 'dias')}`
  }
  const worst = [...row.healthFactors].sort((a, b) => a.impact - b.impact)[0]
  if (worst) return factorReason(row, worst)
  if (row.receivingIssue) return RECEIVING_REASON[row.receivingIssue]
  return 'Pede uma olhada'
}

/**
 * Mesma regra do filtro "Pedem atenção" da lista de Clubes
 * (`attentionReasons` em `clubs/club-list-model.ts`): clube ativo ou em teste
 * com saúde abaixo de Boa, problema de recebimento ou mensalidade da ANNETEC
 * atrasada. Suspensos e encerrados ficam de fora nos dois lugares.
 */
function needsAttention(row: HoldingTenantRow): boolean {
  if (row.tenantStatus !== 'active' && row.tenantStatus !== 'trial') return false
  return row.healthBand !== 'healthy' || row.receivingIssue !== null || row.platformDaysLate > 0
}

/** Até `limit` clubes que pedem atenção (mesma regra da lista de Clubes), os piores primeiro. */
export function buildAttentionClubs(rows: HoldingTenantRow[], limit = 4): AttentionClub[] {
  return rows
    .filter(needsAttention)
    .sort(
      (a, b) =>
        BAND_RANK[a.healthBand] - BAND_RANK[b.healthBand] ||
        a.healthScore - b.healthScore ||
        a.name.localeCompare(b.name, 'pt-BR'),
    )
    .slice(0, limit)
    .map(row => ({
      id: row.organizationId,
      name: row.name,
      reason: attentionReason(row),
      band: row.healthBand,
    }))
}
