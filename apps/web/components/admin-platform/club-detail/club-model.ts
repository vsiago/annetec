import type { AuditEntry, HoldingTenantRow, TenantHealthBand, TenantStatus } from '@annetec/contracts'
import { formatCount, formatPercent } from '@/lib/adapters/platform-console'
import type { StatusPillTone } from '@/components/admin-platform/ui/status-pill'

/**
 * Modelo PURO do detalhe do clube (/admin/inquilinos/<id>): abas, rótulos de
 * situação, frases do Resumo (saúde, atividade, recebimento). Sem I/O e sem
 * React — as frases saem dos mesmos números que a holding já calcula, só que
 * ditas em português simples, sem a notação de pontos da fórmula.
 */

// ---------------------------------------------------------------------------
// Abas
// ---------------------------------------------------------------------------

export const CLUB_TABS = ['resumo', 'dados', 'pessoas', 'plano', 'documentos', 'avancado'] as const
export type ClubTab = (typeof CLUB_TABS)[number]

/** `?tab=` antigo continua abrindo a aba equivalente. */
const TAB_ALIASES: Record<string, ClubTab> = {
  'visao-geral': 'resumo',
  saude: 'resumo',
  cadastro: 'dados',
  marca: 'dados',
  acessos: 'pessoas',
  'assinatura-annetec': 'plano',
  kyb: 'documentos',
  integracao: 'avancado',
}

export function resolveClubTab(raw: string | null | undefined): ClubTab {
  const value = (raw ?? '').trim().toLowerCase()
  if ((CLUB_TABS as readonly string[]).includes(value)) return value as ClubTab
  return TAB_ALIASES[value] ?? 'resumo'
}

// ---------------------------------------------------------------------------
// Situação do clube
// ---------------------------------------------------------------------------

export const CLUB_STATUS_LABEL: Record<TenantStatus, string> = {
  trial: 'Em teste',
  active: 'Ativo',
  suspended: 'Suspenso',
  cancelled: 'Encerrado',
}

export const CLUB_STATUS_TONE: Record<TenantStatus, StatusPillTone> = {
  trial: 'info',
  active: 'success',
  suspended: 'danger',
  cancelled: 'neutral',
}

/** "março de 2026". */
export function clubSinceLabel(createdAt: Date | string): string {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
}

// ---------------------------------------------------------------------------
// Saúde do clube
// ---------------------------------------------------------------------------

/** A holding fala "saudável / atenção / risco"; no detalhe do clube a faixa é Boa / Atenção / Crítica. */
export const HEALTH_BAND_LABEL: Record<TenantHealthBand, string> = {
  healthy: 'Boa',
  attention: 'Atenção',
  risk: 'Crítica',
}

/** "Por que está boa" / "Por que está em atenção" / "Por que está crítica". */
export const HEALTH_BAND_WHY: Record<TenantHealthBand, string> = {
  healthy: 'Por que está boa',
  attention: 'Por que está em atenção',
  risk: 'Por que está crítica',
}

export const HEALTH_BAND_COLORS: Record<TenantHealthBand, { bg: string; fg: string }> = {
  healthy: { bg: '#ECFDF3', fg: '#067647' },
  attention: { bg: '#FFFAEB', fg: '#B54708' },
  risk: { bg: '#FEF3F2', fg: '#B42318' },
}

export interface HealthReason {
  /** `true` = ponto a favor (✓ verde); `false` = ponto de atenção (! âmbar). */
  good: boolean
  text: string
}

function plural(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`
}

/**
 * Fatores da nota (`healthFactors`) em frases simples, mais os pontos a favor
 * dos itens que NÃO descontaram nada. Pontos de atenção primeiro.
 */
export function healthReasons(row: HoldingTenantRow): HealthReason[] {
  const factors = new Set(row.healthFactors.map(factor => factor.factor))
  const bad: HealthReason[] = []
  const good: HealthReason[] = []

  for (const factor of row.healthFactors) {
    switch (factor.factor) {
      case 'platform_billing': {
        const late = row.platformDaysLate > 0 ? ` há ${plural(row.platformDaysLate, 'dia', 'dias')}` : ''
        if (row.platformStatus === 'canceled') bad.push({ good: false, text: 'Assinatura da ANNETEC cancelada' })
        else if (row.platformStatus === 'suspended') {
          bad.push({ good: false, text: `Mensalidade da ANNETEC atrasada${late}: painel bloqueado` })
        } else if (row.platformStatus === 'restricted') {
          bad.push({ good: false, text: `Mensalidade da ANNETEC atrasada${late}: painel só para consulta` })
        } else bad.push({ good: false, text: `Mensalidade da ANNETEC atrasada${late}` })
        break
      }
      case 'member_delinquency':
        // Atraso pequeno desconta um ponto ou dois, mas não é motivo de alarme.
        if (row.memberDelinquencyRate < 5) good.push({ good: true, text: 'Atraso dos associados abaixo de 5%' })
        else bad.push({ good: false, text: `Associados com mensalidade atrasada: ${formatPercent(row.memberDelinquencyRate)}` })
        break
      case 'sales_drop': {
        const drop = row.gmvPrev30 > 0 ? Math.round(((row.gmvPrev30 - row.gmvLast30) / row.gmvPrev30) * 100) : null
        bad.push({
          good: false,
          text:
            drop === null
              ? 'O que o clube recebeu caiu nos últimos 30 dias'
              : `O que o clube recebeu caiu ${drop}% nos últimos 30 dias`,
        })
        break
      }
      case 'no_new_members':
        bad.push({ good: false, text: 'Nenhum associado novo nos últimos 30 dias' })
        break
      case 'low_adoption':
        bad.push({
          good: false,
          text:
            row.usagePct === null
              ? 'Poucas vidas em uso no plano'
              : `Só ${formatPercent(row.usagePct, 0)} das vidas do plano estão em uso`,
        })
        break
      default:
        // Fator novo que esta tela ainda não conhece: usa a frase da própria holding.
        bad.push({ good: false, text: factor.detail })
    }
  }

  if (row.managed && !factors.has('platform_billing')) {
    good.push({ good: true, text: 'Mensalidade da ANNETEC em dia' })
  }
  if (!factors.has('member_delinquency')) {
    good.push({ good: true, text: 'Associados em dia com as mensalidades' })
  }
  if (!factors.has('sales_drop') && row.gmvPrev30 > 0) {
    good.push({ good: true, text: 'O que o clube recebeu não caiu nos últimos 30 dias' })
  }
  if (!factors.has('no_new_members') && row.newMembersLast30 > 0) {
    good.push({
      good: true,
      text: `${plural(row.newMembersLast30, 'associado novo', 'associados novos')} nos últimos 30 dias`,
    })
  }

  return [...bad, ...good].slice(0, 6)
}

// ---------------------------------------------------------------------------
// Recebimento das mensalidades (conta Asaas do próprio clube)
// ---------------------------------------------------------------------------

export type ReceivingIssue = NonNullable<HoldingTenantRow['receivingIssue']>

/** O que falta, em frase para a equipe ANNETEC. */
export const RECEIVING_ISSUE_TEXT: Record<ReceivingIssue, string> = {
  nao_conectado:
    'Peça ao responsável para conectar a conta do Asaas em Faturamento › Recebimento. Até lá, ninguém consegue assinar.',
  conta_pendente:
    'A conta está conectada, mas o Asaas ainda a analisa. Peça ao responsável para concluir o cadastro lá, se faltar algo.',
  aviso_com_erro:
    'A conta está conectada, mas o aviso de pagamento está com falha. Os pagamentos podem demorar a aparecer. Peça ao responsável para reconectar em Faturamento › Recebimento.',
}

/** Mensagem pronta para a equipe mandar ao responsável do clube. */
export function receivingInstructions(clubName: string, issue: ReceivingIssue, panelUrl: string): string {
  const passo: Record<ReceivingIssue, string> = {
    nao_conectado:
      'Entre em Faturamento › Recebimento e conecte a conta do Asaas do clube. Até lá, ninguém consegue assinar um plano.',
    conta_pendente:
      'A conta do clube já está conectada, mas o Asaas ainda a analisa. Se faltar algo, conclua o cadastro no Asaas e confira em Faturamento › Recebimento.',
    aviso_com_erro:
      'Entre em Faturamento › Recebimento e reconecte a conta do Asaas: o aviso de pagamento está com falha e os pagamentos podem demorar a aparecer.',
  }
  return `Olá! Para o ${clubName} receber as mensalidades dos associados, abra o painel do clube (${panelUrl}). ${passo[issue]}`
}

// ---------------------------------------------------------------------------
// Atividade recente
// ---------------------------------------------------------------------------

/** "Hoje, 14:32" · "Ontem, 16:20" · "21/10" · "21/10/2025" (outro ano). */
export function activityWhen(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const zone = 'America/Sao_Paulo'
  const key = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: zone })
  const time = date.toLocaleTimeString('pt-BR', { timeZone: zone, hour: '2-digit', minute: '2-digit' })
  const today = key(now)
  const yesterday = key(new Date(now.getTime() - 86_400_000))
  const day = key(date)
  if (day === today) return `Hoje, ${time}`
  if (day === yesterday) return `Ontem, ${time}`
  const short = date.toLocaleDateString('pt-BR', { timeZone: zone, day: '2-digit', month: '2-digit' })
  return day.slice(0, 4) === today.slice(0, 4)
    ? short
    : date.toLocaleDateString('pt-BR', { timeZone: zone, day: '2-digit', month: '2-digit', year: 'numeric' })
}

export type ActivityKind = 'access' | 'people' | 'plans' | 'billing' | 'club' | 'other'

export function activityKind(action: string): ActivityKind {
  if (action.startsWith('tenant.lifecycle.')) return 'access'
  if (action.startsWith('tenant_user.')) return 'people'
  if (action.startsWith('club_plan.')) return 'plans'
  if (action.startsWith('club_charge.') || action.startsWith('club_subscription.') || action.startsWith('billing')) {
    return 'billing'
  }
  if (action.startsWith('tenant.')) return 'club'
  return 'other'
}

/** Quem fez, em palavras: "Equipe ANNETEC" / "Equipe do clube" / "Sistema". */
export function activityActor(entry: Pick<AuditEntry, 'actorName' | 'actorScope'>): { name: string; role: string | null } {
  const role = entry.actorScope === 'platform' ? 'Equipe ANNETEC' : entry.actorScope === 'tenant' ? 'Equipe do clube' : null
  return { name: entry.actorName ?? 'Sistema', role }
}
