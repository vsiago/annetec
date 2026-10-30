import {
  CLUB_PAYMENT_METHOD_LABELS,
  activationChargeItems,
  discountAmount,
  formatBRL,
  formatDateBR,
  onlyDigits,
  sumChargeItems,
  type ClubPaymentMethod,
  type PlatformCharge,
  type ProposalDiscount,
} from '@annetec/contracts'
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { db } from '@/db/client'
import { platformBillingEvents, platformCharges, platformSubscriptions } from '@/db/schema'
import { AppError } from '@/http/errors'
import { invalidatePlatformAccessCache } from '@/http/middleware/platform-access'
import { logger } from '@/lib/logger'
import { addDays, addMonthsOnDueDay, dueDayOf, noonSP, todaySP } from '@/modules/club-billing/dates'
import { invalidateHoldingCache } from '@/modules/holding/cache'
import { cancelPlatformAtGateway, submitPlatformChargeToGateway, syncPlatformChargeIfStale } from './charges.service'
import { recordPlatformEvent, takeActivationCard } from './events.service'
import { OPEN_PLATFORM_CHARGE_STATUSES, toPlatformCharge, type PlatformChargeRow } from './presenter'
import { monthlyDiscountUntilFor } from './automation.rules'
import { getPlanOffer, planSnapshot } from './pricing.service'
import { proposalBasics, proposalDisplayName, tenantRefOf } from './queries'
import { currentPlatformProvider, loadPlatformSettings } from './settings.service'

/**
 * Interfaces da §0.10 usadas pelo Q1 (contratação/provisionamento).
 *
 * A cobrança de ATIVAÇÃO (adesão + 1ª mensalidade) nasce na APROVAÇÃO da
 * proposta e pertence a ela (`organizationId = null`) até o provisionamento,
 * que cria a assinatura de plataforma e vincula a ativação ao 1º período.
 */

const ACTIVATION_SYNC_INTERVAL_MS = 3_000

async function activationRows(proposalId: string): Promise<PlatformChargeRow[]> {
  return db
    .select()
    .from(platformCharges)
    .where(and(eq(platformCharges.proposalId, proposalId), eq(platformCharges.kind, 'activation')))
    .orderBy(desc(platformCharges.createdAt))
}

/** Mais relevante: aberta → paga → a mais recente. */
function pickActivation(rows: PlatformChargeRow[]): PlatformChargeRow | null {
  return (
    rows.find(row => OPEN_PLATFORM_CHARGE_STATUSES.includes(row.status)) ??
    rows.find(row => row.status === 'paid') ??
    rows[0] ??
    null
  )
}

async function present(row: PlatformChargeRow): Promise<PlatformCharge> {
  return toPlatformCharge(row, await tenantRefOf(row.organizationId))
}

/**
 * Emite a cobrança de ativação da proposta aprovada. Idempotente: devolve a
 * ativação aberta (ou já paga). Se a aberta ficou sem pagamento no gateway
 * (gateway fora na 1ª tentativa), tenta registrar de novo.
 */
export async function createActivationCharge(
  proposalId: string,
  opts: { actorUserId?: string | null } = {},
): Promise<PlatformCharge> {
  const existing = pickActivation(await activationRows(proposalId))
  if (existing && existing.status === 'paid') return present(existing)
  if (existing && OPEN_PLATFORM_CHARGE_STATUSES.includes(existing.status)) {
    if (!existing.gatewayChargeId && existing.method !== 'credit_card') {
      return present(
        await submitPlatformChargeToGateway(existing.id, {
          method: existing.method,
          source: 'onboarding',
          actorUserId: opts.actorUserId ?? null,
          mode: 'interactive',
        }),
      )
    }
    return present(existing)
  }

  const proposal = await proposalBasics(proposalId)
  if (!proposal) throw AppError.notFound('Proposta')
  if (!proposal.planId) throw AppError.businessRule('A proposta não tem plano escolhido')
  const offer = await getPlanOffer(proposal.planId)
  const settings = await loadPlatformSettings()
  const provider = currentPlatformProvider(settings)
  const method: ClubPaymentMethod = proposal.paymentMethod ?? 'pix'
  // Desconto aprovado pelo superadmin entra como linhas `discount` (adesão e/ou 1ª mensalidade).
  const items = activationChargeItems(offer, offer.pricing, proposal.discount)
  const amount = sumChargeItems(items)
  const dueDate = addDays(todaySP(), settings.boletoDueDays)

  const [inserted] = await db
    .insert(platformCharges)
    .values({
      organizationId: proposal.organizationId,
      subscriptionId: null,
      proposalId,
      kind: 'activation',
      periodStart: null,
      periodEnd: null,
      dueDate,
      amount: String(amount),
      items,
      method,
      status: 'pending',
      description: `ANNETEC · Ativação do plano ${offer.name} · ${proposal.code}`,
      gatewayProvider: provider,
    })
    .returning()
  if (!inserted) throw new Error('Falha ao gravar a cobrança de ativação')

  await recordPlatformEvent(db, {
    organizationId: proposal.organizationId,
    chargeId: inserted.id,
    proposalId,
    type: 'ACTIVATION_CHARGE_CREATED',
    source: 'onboarding',
    gatewayProvider: provider,
    message: `Cobrança de ativação de ${formatBRL(amount)} emitida para ${proposalDisplayName(proposal)} — ${CLUB_PAYMENT_METHOD_LABELS[method]}, vence em ${formatDateBR(dueDate)}`,
    payload: {
      planId: offer.id,
      items: items.map(item => ({ kind: item.kind, amount: item.amount })),
      ...(proposal.discount ? { discountRequestId: proposal.discount.requestId } : {}),
    },
    actorUserId: opts.actorUserId ?? null,
  })
  invalidateHoldingCache()

  // Cartão: nada no gateway até a página pública receber o cartão.
  if (method === 'credit_card') return present(inserted)
  return present(
    await submitPlatformChargeToGateway(inserted.id, {
      method,
      source: 'onboarding',
      actorUserId: opts.actorUserId ?? null,
      mode: 'interactive',
    }),
  )
}

/** Ativação da proposta (aberta → paga → a mais recente). `sync` consulta o gateway antes (no máx. a cada 3 s). */
export async function getActivationCharge(proposalId: string, opts: { sync?: boolean } = {}): Promise<PlatformCharge | null> {
  let row = pickActivation(await activationRows(proposalId))
  if (!row) return null
  if (opts.sync && OPEN_PLATFORM_CHARGE_STATUSES.includes(row.status) && row.gatewayChargeId) {
    if (await syncPlatformChargeIfStale(row, ACTIVATION_SYNC_INTERVAL_MS, 'onboarding')) {
      row = pickActivation(await activationRows(proposalId)) ?? row
    }
  }
  return present(row)
}

/** Cancela as ativações em aberto da proposta (expiração, cancelamento, reprovação). */
export async function cancelActivationCharge(proposalId: string, reason: string): Promise<void> {
  const rows = (await activationRows(proposalId)).filter(row => OPEN_PLATFORM_CHARGE_STATUSES.includes(row.status))
  for (const row of rows) {
    await cancelPlatformAtGateway(row)
    const now = new Date()
    const [updated] = await db
      .update(platformCharges)
      .set({ status: 'canceled', canceledAt: now, updatedAt: now })
      .where(and(eq(platformCharges.id, row.id), inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES)))
      .returning({ id: platformCharges.id })
    if (!updated) continue
    await recordPlatformEvent(db, {
      organizationId: row.organizationId,
      chargeId: row.id,
      proposalId,
      type: 'CHARGE_CANCELED',
      source: 'onboarding',
      gatewayProvider: row.gatewayProvider,
      message: `Cobrança de ativação de ${formatBRL(Number(row.amount))} cancelada${reason ? `: ${reason}` : ''}`,
    })
  }
  if (rows.length > 0) invalidateHoldingCache()
}

/**
 * Cria a assinatura de plataforma no provisionamento. Idempotente por
 * inquilino (devolve a existente) e SEMPRE vincula a ativação da proposta ao
 * 1º período (`organizationId`, `subscriptionId`, `periodStart/End`).
 */
export async function createPlatformSubscription(input: {
  organizationId: string
  proposalId: string
  planId: string
  paymentMethod: ClubPaymentMethod
  billing: { name: string; document: string; email: string; phone?: string | null }
  startDate: string
  activationWaived: boolean
  /** Desconto aprovado na venda: adesão líquida no retrato + desconto da mensalidade com data de fim. */
  discount?: ProposalDiscount | null
}): Promise<{ subscriptionId: string }> {
  const offer = await getPlanOffer(input.planId)
  const settings = await loadPlatformSettings()
  const dueDay = dueDayOf(input.startDate)
  const periodEnd = addMonthsOnDueDay(input.startDate, 1, dueDay)
  const discount = discountColumns(offer.pricing.setupFee, input.discount ?? null, input.startDate, dueDay)
  const card = input.paymentMethod === 'credit_card' ? takeActivationCard(input.proposalId) : null
  const now = new Date()

  const subscriptionId = await db.transaction(async tx => {
    const [created] = await tx
      .insert(platformSubscriptions)
      .values({
        organizationId: input.organizationId,
        proposalId: input.proposalId,
        ...planSnapshot(offer),
        ...discount,
        status: 'active',
        paymentMethod: input.paymentMethod,
        dueDay,
        startedAt: input.startDate === todaySP(now) ? now : noonSP(input.startDate),
        currentPeriodStart: input.startDate,
        currentPeriodEnd: periodEnd,
        nextDueDate: periodEnd,
        gatewayProvider: currentPlatformProvider(settings),
        ...(card ? { cardToken: card.token, cardBrand: card.brand, cardLast4: card.last4, cardExpiry: card.expiry } : {}),
        billingName: input.billing.name,
        billingDocument: onlyDigits(input.billing.document),
        billingEmail: input.billing.email,
        source: 'onboarding',
      })
      .onConflictDoNothing({ target: platformSubscriptions.organizationId })
      .returning({ id: platformSubscriptions.id })

    let id = created?.id
    if (!id) {
      const [existing] = await tx
        .select({ id: platformSubscriptions.id })
        .from(platformSubscriptions)
        .where(eq(platformSubscriptions.organizationId, input.organizationId))
        .limit(1)
      if (!existing) throw new Error('Assinatura de plataforma não encontrada após conflito')
      id = existing.id
    } else {
      await recordPlatformEvent(tx, {
        organizationId: input.organizationId,
        subscriptionId: id,
        proposalId: input.proposalId,
        type: 'SUBSCRIPTION_CREATED',
        source: 'onboarding',
        message: `Assinatura da plataforma criada — plano ${offer.name} (${formatBRL(offer.priceMonthly)}/mês, até ${offer.memberLimit} vidas), vencimento todo dia ${dueDay}${input.activationWaived ? ' — ativação isentada' : ''}${discountNote(discount)}`,
      })
    }

    // Vincula a ativação (paga ou aberta) ao 1º período da assinatura.
    await tx
      .update(platformCharges)
      .set({
        organizationId: input.organizationId,
        subscriptionId: id,
        periodStart: input.startDate,
        periodEnd,
        updatedAt: now,
      })
      .where(
        and(
          eq(platformCharges.proposalId, input.proposalId),
          eq(platformCharges.kind, 'activation'),
          ne(platformCharges.status, 'canceled'),
          isNull(platformCharges.subscriptionId),
        ),
      )
    await tx
      .update(platformBillingEvents)
      .set({ organizationId: input.organizationId, subscriptionId: id })
      .where(and(eq(platformBillingEvents.proposalId, input.proposalId), isNull(platformBillingEvents.subscriptionId)))
    return id
  })

  if (input.activationWaived) {
    try {
      await cancelActivationCharge(input.proposalId, 'ativação isentada no provisionamento')
    } catch (error) {
      logger.warn({ proposalId: input.proposalId, err: error instanceof Error ? error.message : String(error) }, 'Falha ao cancelar a ativação isentada')
    }
  }

  invalidatePlatformAccessCache(input.organizationId)
  invalidateHoldingCache()
  return { subscriptionId }
}

/**
 * Colunas do desconto da venda na assinatura: adesão do retrato JÁ líquida e
 * o desconto da mensalidade com a data de fim (`monthlyDiscountUntilFor`).
 * Sem desconto = colunas no padrão (retrato cheio, 0%).
 */
export function discountColumns(setupFee: number, discount: ProposalDiscount | null, startDate: string, dueDay: number) {
  if (!discount) return {}
  const netSetupFee = Math.max(0, setupFee - discountAmount(setupFee, discount.setupFeePercent))
  const monthly = discount.monthlyPercent > 0
  return {
    setupFee: String(netSetupFee),
    monthlyDiscountPercent: String(monthly ? discount.monthlyPercent : 0),
    monthlyDiscountUntil: monthly ? monthlyDiscountUntilFor(startDate, discount.monthlyMonths, dueDay) : null,
  }
}

function discountNote(columns: ReturnType<typeof discountColumns>): string {
  if (!('monthlyDiscountPercent' in columns) || Number(columns.monthlyDiscountPercent) <= 0) return ''
  return ` — desconto de ${columns.monthlyDiscountPercent}% na mensalidade ${columns.monthlyDiscountUntil ? `até ${formatDateBR(columns.monthlyDiscountUntil)}` : 'permanente'}`
}
