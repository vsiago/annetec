import {
  CLUB_PAYMENT_METHOD_LABELS,
  formatBRL,
  formatDateBR,
  type ClubPaymentMethod,
  type PaymentEventSource,
  type PaymentGatewayProvider,
} from '@annetec/contracts'
import { db } from '@/db/client'
import { clubCharges } from '@/db/schema'
import { cyclePeriod } from './automation.rules'
import { monthLabel } from './dates'
import { recordPaymentEvent } from './events.service'
import type { ChargeRow, SubscriptionRow } from './presenter'

/**
 * Geração da mensalidade do PRÓXIMO ciclo — função única usada pela automação
 * (passo "gerar ciclo") e pelo "Adiantar mensalidade" do admin. Mesmo período
 * (`cyclePeriod(nextDueDate, dueDay)`), mesmo valor (`amount` da assinatura =
 * plano + dependentes), mesma descrição. A linha nasce `kind = 'cycle'` e o
 * unique parcial `(subscription_id, period_start) WHERE kind = 'cycle'`
 * garante uma mensalidade por período: quem chegar depois (automação ou
 * clique duplo) recebe `null`, sem erro.
 */

export interface NextCycle {
  periodStart: string
  periodEnd: string
  dueDate: string
  /** numeric em texto, como na coluna. */
  amount: string
  description: string
}

export function cycleDescription(orgName: string | null | undefined, planName: string, periodStart: string): string {
  return `${orgName?.trim() || 'Clube'} · Plano ${planName} · ${monthLabel(periodStart)}`
}

/** Próximo ciclo da assinatura (`null` sem `nextDueDate`). Puro. */
export function nextCycleOf(
  sub: Pick<SubscriptionRow, 'nextDueDate' | 'dueDay' | 'amount' | 'planName'>,
  orgName: string | null | undefined,
): NextCycle | null {
  if (!sub.nextDueDate) return null
  const { periodStart, periodEnd, dueDate } = cyclePeriod(sub.nextDueDate, sub.dueDay)
  return { periodStart, periodEnd, dueDate, amount: sub.amount, description: cycleDescription(orgName, sub.planName, periodStart) }
}

export interface GenerateCycleOptions {
  orgName: string | null | undefined
  provider: PaymentGatewayProvider
  source: PaymentEventSource
  /** Padrão: a forma de pagamento da assinatura. */
  method?: ClubPaymentMethod
  actorUserId?: string | null
  idempotencyKey?: string | null
}

/**
 * Grava a mensalidade do próximo ciclo e o evento `CHARGE_GENERATED`. Não fala
 * com o gateway (quem chama decide: Pix/boleto emitem na hora; cartão é
 * cobrado pela automação no vencimento ou agora, pelo admin). `null` quando o
 * período já tem mensalidade (ou a assinatura não tem próximo vencimento).
 */
export async function generateCycleCharge(
  sub: Pick<SubscriptionRow, 'id' | 'organizationId' | 'nextDueDate' | 'dueDay' | 'amount' | 'planName' | 'paymentMethod'>,
  options: GenerateCycleOptions,
): Promise<ChargeRow | null> {
  const cycle = nextCycleOf(sub, options.orgName)
  if (!cycle) return null
  const [inserted] = await db
    .insert(clubCharges)
    .values({
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      kind: 'cycle',
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      dueDate: cycle.dueDate,
      amount: cycle.amount,
      method: options.method ?? sub.paymentMethod,
      status: 'pending',
      description: cycle.description,
      gatewayProvider: options.provider,
      idempotencyKey: options.idempotencyKey ?? null,
    })
    .onConflictDoNothing()
    .returning()
  if (!inserted) return null

  const manual = options.source === 'manual'
  await recordPaymentEvent(db, {
    organizationId: sub.organizationId,
    subscriptionId: sub.id,
    chargeId: inserted.id,
    type: 'CHARGE_GENERATED',
    source: options.source,
    gatewayProvider: options.provider,
    message: `Cobrança de ${formatBRL(Number(inserted.amount))} do período ${monthLabel(cycle.periodStart)} ${manual ? 'adiantada pelo administrador' : 'gerada'} — ${CLUB_PAYMENT_METHOD_LABELS[inserted.method]}, vence em ${formatDateBR(inserted.dueDate)}`,
    payload: manual ? { manual: true, type: 'advance' } : null,
    actorUserId: options.actorUserId ?? null,
  })
  return inserted
}
