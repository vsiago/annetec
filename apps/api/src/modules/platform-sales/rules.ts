import {
  chargeSetupFeeTotal,
  commissionPercentForInstallment,
  prospectStageForProposalStatus,
  roundCents,
  type DiscountRequestInput,
  type OnboardingStatus,
  type PlatformChargeItem,
  type PlatformChargeKind,
  type ProposalDiscount,
  type ProspectStage,
  type SalesCommissionKind,
  type SellerLinkStatus,
} from '@annetec/contracts'

/**
 * Regras PURAS das vendas da plataforma — sem banco nem relógio implícito
 * (datas chegam por parâmetro), para os testes rodarem com valores fixos.
 */

// ---------------------------------------------------------------------------
// Etapa do prospect × status da proposta
// ---------------------------------------------------------------------------

export interface ProspectStageState {
  stage: ProspectStage
}

export interface ProposalStateForSync {
  status: OnboardingStatus
  rejectionReason?: string | null
  cancelReason?: string | null
}

/**
 * Patch da sincronização automática (prospect acompanha a proposta vinculada).
 * `null` = nada muda (já está na etapa certa).
 */
export function prospectSyncPatch(current: ProspectStageState, proposal: ProposalStateForSync, now: Date) {
  const stage = prospectStageForProposalStatus(proposal.status)
  if (stage === current.stage) return null
  const base = { stage, stageChangedAt: now, updatedAt: now }
  if (stage === 'ganho') return { ...base, wonAt: now, lostAt: null, lostReason: null }
  if (stage === 'perdido') {
    const why =
      proposal.status === 'rejected'
        ? `Proposta reprovada na análise${proposal.rejectionReason ? `: ${proposal.rejectionReason}` : ''}`
        : `Proposta cancelada${proposal.cancelReason ? `: ${proposal.cancelReason}` : ''}`
    return { ...base, lostAt: now, lostReason: why.slice(0, 500) }
  }
  return { ...base, lostAt: null, lostReason: null }
}

// ---------------------------------------------------------------------------
// Link e desconto
// ---------------------------------------------------------------------------

/** Status em que ainda dá para pedir/aplicar desconto: antes da aprovação (que emite a ativação). */
export const DISCOUNT_ALLOWED_STATUSES: readonly OnboardingStatus[] = ['draft', 'submitted', 'in_review', 'pending_info']

/** Status em que a proposta segue "em andamento" para o vendedor. */
export const OPEN_PROPOSAL_STATUSES: readonly OnboardingStatus[] = [
  'draft',
  'submitted',
  'in_review',
  'pending_info',
  'approved',
  'awaiting_payment',
  'provisioning',
]

export function sellerLinkStatusOf(
  proposal: { source: 'site' | 'console' | 'seed'; inviteSentAt: Date | null },
  pendingDiscount: boolean,
): SellerLinkStatus {
  if (proposal.source !== 'console') return 'site'
  if (proposal.inviteSentAt) return 'sent'
  return pendingDiscount ? 'awaiting_discount_approval' : 'not_sent'
}

/** Pedido do vendedor → percentuais normalizados (mensalidade 0 = sem prazo). */
export function requestedDiscount(input: Pick<DiscountRequestInput, 'setupFeePercent' | 'monthlyPercent' | 'monthlyMonths'>): ProposalDiscount {
  const monthlyPercent = roundCents(input.monthlyPercent ?? 0)
  return {
    setupFeePercent: roundCents(input.setupFeePercent ?? 0),
    monthlyPercent,
    monthlyMonths: monthlyPercent > 0 ? (input.monthlyMonths ?? null) : null,
  }
}

/**
 * Valores que valem na aprovação: o que o superadmin informou (ajuste) ou, na
 * falta, o pedido. Tudo zerado não é aprovação — é recusa (`null`).
 */
export function approvedDiscount(
  requested: ProposalDiscount,
  adjust: { setupFeePercent?: number; monthlyPercent?: number; monthlyMonths?: number | null },
): ProposalDiscount | null {
  const setupFeePercent = roundCents(adjust.setupFeePercent ?? requested.setupFeePercent)
  const monthlyPercent = roundCents(adjust.monthlyPercent ?? requested.monthlyPercent)
  if (setupFeePercent <= 0 && monthlyPercent <= 0) return null
  const months = adjust.monthlyMonths !== undefined ? adjust.monthlyMonths : requested.monthlyMonths
  return { setupFeePercent, monthlyPercent, monthlyMonths: monthlyPercent > 0 ? months : null }
}

/** Frase curta do desconto ("adesão 50% · mensalidade 20% por 3 meses"). */
export function describeDiscount(d: ProposalDiscount): string {
  const parts: string[] = []
  if (d.setupFeePercent > 0) parts.push(d.setupFeePercent >= 100 ? 'isenção da adesão' : `adesão ${d.setupFeePercent}%`)
  if (d.monthlyPercent > 0) {
    parts.push(
      `mensalidade ${d.monthlyPercent}% ${d.monthlyMonths === null ? 'permanente' : `por ${d.monthlyMonths} ${d.monthlyMonths === 1 ? 'mês' : 'meses'}`}`,
    )
  }
  return parts.join(' · ') || 'sem desconto'
}

// ---------------------------------------------------------------------------
// Comissão
// ---------------------------------------------------------------------------

export interface CommissionCharge {
  kind: PlatformChargeKind
  /** Total da fatura (já com descontos). */
  amount: number
  /** Valor efetivamente pago (`null` = o total). */
  paidAmount: number | null
  items: Pick<PlatformChargeItem, 'kind' | 'amount' | 'appliesTo'>[]
}

/**
 * Partes PAGAS da fatura: adesão (só na ativação: `setup_fee` + descontos da
 * adesão) e mensalidade (o resto). Pago diferente do total (multa/juros ou
 * pagamento a menor) reparte na proporção, limitado ao total — comissão nunca
 * incide sobre multa/juros. Avulsa (`adjustment`) não gera comissão.
 */
export function commissionParts(charge: CommissionCharge): { setupFee: number; monthly: number } {
  if (charge.kind === 'adjustment' || charge.amount <= 0) return { setupFee: 0, monthly: 0 }
  const setup = charge.kind === 'activation' ? Math.min(charge.amount, Math.max(0, chargeSetupFeeTotal(charge.items))) : 0
  const monthly = Math.max(0, charge.amount - setup)
  const paid = charge.paidAmount === null ? charge.amount : Math.max(0, charge.paidAmount)
  const factor = Math.min(1, paid / charge.amount)
  return { setupFee: roundCents(setup * factor), monthly: roundCents(monthly * factor) }
}

export interface CommissionSettingsShape {
  monthlySchedule: readonly number[]
  setupFeePercent: number
}

export interface CommissionDraft {
  kind: SalesCommissionKind
  installment: number | null
  baseAmount: number
  percent: number
  amount: number
}

/**
 * Lançamentos de UMA fatura paga. `installment` = nº desta mensalidade paga
 * (a ativação traz a 1ª). Acima da escala não gera; valor 0 não gera.
 */
export function buildCommissionDrafts(
  charge: CommissionCharge,
  installment: number,
  settings: CommissionSettingsShape,
): CommissionDraft[] {
  const parts = commissionParts(charge)
  const drafts: CommissionDraft[] = []
  if (parts.setupFee > 0 && settings.setupFeePercent > 0) {
    drafts.push({
      kind: 'setup_fee',
      installment: null,
      baseAmount: parts.setupFee,
      percent: settings.setupFeePercent,
      amount: roundCents((parts.setupFee * settings.setupFeePercent) / 100),
    })
  }
  const percent = commissionPercentForInstallment(settings.monthlySchedule, installment)
  if (parts.monthly > 0 && percent !== null) {
    drafts.push({
      kind: 'monthly',
      installment,
      baseAmount: parts.monthly,
      percent,
      amount: roundCents((parts.monthly * percent) / 100),
    })
  }
  return drafts.filter(draft => draft.amount > 0)
}

/** Estorno/chargeback: não repassada → `cancelada`; já repassada → `a_descontar`. */
export function reversedCommissionStatus(status: 'prevista' | 'a_pagar' | 'paga' | 'cancelada' | 'a_descontar') {
  if (status === 'prevista' || status === 'a_pagar') return 'cancelada' as const
  if (status === 'paga') return 'a_descontar' as const
  return null
}
