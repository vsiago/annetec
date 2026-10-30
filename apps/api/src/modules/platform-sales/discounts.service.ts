import {
  ONBOARDING_STATUS_LABELS,
  quotePlatformPlan,
  type ApproveDiscountInput,
  type DiscountRequest,
  type DiscountRequestInput,
  type ListDiscountRequestsQuery,
  type ProposalDiscount,
  type ProposalDiscountRecord,
  type RejectDiscountInput,
} from '@annetec/contracts'
import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { platformDiscountRequests, platformOnboardingProposals, tenantPlans, user, type PlatformDiscountRequestRow } from '@/db/schema'
import { AppError } from '@/http/errors'
import { discountDecidedNotification, discountRequestedNotification, notify } from '@/lib/notifications'
import { findPlanOffer } from '@/modules/platform-onboarding/plans'
import { getProposal, insertEvent, type ProposalRow } from '@/modules/platform-onboarding/repository'
import { isUniqueViolation } from '@/modules/platform-onboarding/service'
import { sendSellerInvite } from './invite'
import { approvedDiscount, describeDiscount, DISCOUNT_ALLOWED_STATUSES, requestedDiscount } from './rules'

/**
 * Pedido de desconto: o vendedor pede, SÓ o superadmin decide (pode ajustar).
 *
 *  - aprovado: valores vão para `platform_onboarding_proposals.discount` (de
 *    onde cotação, cobrança de ativação e assinatura leem) e, se o link do
 *    vendedor estava retido, o e-mail sai agora;
 *  - recusado: o vendedor é avisado (sino) e pode reenviar o link sem desconto.
 * Tudo vai para a timeline interna da proposta e para `audit_logs` (controller).
 */

export interface DecisionActor {
  userId: string
  name: string
}

export function customerNameOf(p: Pick<ProposalRow, 'tradeName' | 'legalName' | 'company' | 'applicant'>): string {
  return p.tradeName || p.company?.legalName || p.legalName || p.applicant.name
}

function requestedOf(row: PlatformDiscountRequestRow): ProposalDiscount {
  return {
    setupFeePercent: Number(row.setupFeePercent),
    monthlyPercent: Number(row.monthlyPercent),
    monthlyMonths: row.monthlyMonths ?? null,
  }
}

function approvedOf(row: PlatformDiscountRequestRow): ProposalDiscount | null {
  if (row.status !== 'approved') return null
  return {
    setupFeePercent: Number(row.approvedSetupFeePercent ?? 0),
    monthlyPercent: Number(row.approvedMonthlyPercent ?? 0),
    monthlyMonths: row.approvedMonthlyMonths ?? null,
  }
}

type RequestJoin = {
  request: PlatformDiscountRequestRow
  proposal: ProposalRow
  sellerName: string | null
  planName: string | null
}

async function toDto(row: RequestJoin, offers = new Map<string, Awaited<ReturnType<typeof findPlanOffer>>>()): Promise<DiscountRequest> {
  const { request, proposal } = row
  const planId = proposal.planId
  let offer = planId ? offers.get(planId) : null
  if (planId && offer === undefined) {
    offer = await findPlanOffer(planId)
    offers.set(planId, offer)
  }
  const requested = requestedOf(request)
  const shown = approvedOf(request) ?? requested
  return {
    id: request.id,
    proposalId: proposal.id,
    proposalCode: proposal.code,
    proposalStatus: proposal.status,
    customerName: customerNameOf(proposal),
    prospectId: request.prospectId,
    sellerUserId: request.sellerUserId,
    sellerName: row.sellerName,
    status: request.status,
    requested,
    approved: approvedOf(request),
    justification: request.justification,
    decisionNote: request.decisionNote,
    rejectionReason: request.rejectionReason,
    decidedByName: request.decidedByName,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    quote: offer ? quotePlatformPlan(offer, offer.pricing, proposal.expectedLives) : null,
    quoteWithDiscount: offer ? quotePlatformPlan(offer, offer.pricing, proposal.expectedLives, { discount: shown }) : null,
    planName: offer?.name ?? row.planName,
    createdAt: request.createdAt.toISOString(),
  }
}

function requestSelect() {
  return db
    .select({ request: platformDiscountRequests, proposal: platformOnboardingProposals, sellerName: user.name, planName: tenantPlans.name })
    .from(platformDiscountRequests)
    .innerJoin(platformOnboardingProposals, eq(platformOnboardingProposals.id, platformDiscountRequests.proposalId))
    .leftJoin(user, eq(user.id, platformDiscountRequests.sellerUserId))
    .leftJoin(tenantPlans, eq(tenantPlans.id, platformOnboardingProposals.planId))
}

export async function listDiscountRequests(
  query: ListDiscountRequestsQuery,
  scope: { sellerUserId?: string } = {},
): Promise<{ items: DiscountRequest[]; total: number }> {
  const filters: SQL[] = []
  if (query.status) filters.push(eq(platformDiscountRequests.status, query.status))
  const sellerUserId = scope.sellerUserId ?? query.sellerUserId
  if (sellerUserId) filters.push(eq(platformDiscountRequests.sellerUserId, sellerUserId))
  const where = filters.length ? and(...filters) : undefined
  const [rows, [total]] = await Promise.all([
    requestSelect()
      .where(where)
      .orderBy(desc(platformDiscountRequests.createdAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ value: count() }).from(platformDiscountRequests).where(where),
  ])
  const offers = new Map()
  const items: DiscountRequest[] = []
  for (const row of rows) items.push(await toDto(row, offers))
  return { items, total: total?.value ?? 0 }
}

export async function getDiscountRequest(id: string): Promise<DiscountRequest> {
  const [row] = await requestSelect().where(eq(platformDiscountRequests.id, id)).limit(1)
  if (!row) throw AppError.notFound('Pedido de desconto')
  return toDto(row)
}

/** Último pedido de cada proposta (qualquer status). */
export async function lastRequestsByProposal(proposalIds: string[]): Promise<Map<string, PlatformDiscountRequestRow>> {
  const map = new Map<string, PlatformDiscountRequestRow>()
  if (proposalIds.length === 0) return map
  const rows = await db
    .select()
    .from(platformDiscountRequests)
    .where(inArray(platformDiscountRequests.proposalId, proposalIds))
    .orderBy(desc(platformDiscountRequests.createdAt))
  for (const row of rows) if (!map.has(row.proposalId)) map.set(row.proposalId, row)
  return map
}

function noticeFacts(request: PlatformDiscountRequestRow, proposal: ProposalRow, sellerName: string, discount: ProposalDiscount) {
  return {
    requestId: request.id,
    proposalId: proposal.id,
    proposalCode: proposal.code,
    customerName: customerNameOf(proposal),
    sellerUserId: request.sellerUserId,
    sellerName,
    summary: describeDiscount(discount),
  }
}

/** Grava o pedido (vendedor). Um pendente por proposta; só antes da aprovação da proposta. */
export async function createDiscountRequest(input: {
  proposal: ProposalRow
  prospectId: string | null
  seller: { userId: string; name: string }
  discount: DiscountRequestInput
}): Promise<PlatformDiscountRequestRow> {
  const { proposal } = input
  if (!DISCOUNT_ALLOWED_STATUSES.includes(proposal.status)) {
    throw AppError.businessRule(
      `Desconto só pode ser pedido antes da aprovação da proposta (status atual: "${ONBOARDING_STATUS_LABELS[proposal.status]}").`,
    )
  }
  if (proposal.discount) throw AppError.businessRule('Esta proposta já tem desconto aprovado.')
  const requested = requestedDiscount(input.discount)
  let row: PlatformDiscountRequestRow | undefined
  try {
    ;[row] = await db
      .insert(platformDiscountRequests)
      .values({
        proposalId: proposal.id,
        prospectId: input.prospectId,
        sellerUserId: input.seller.userId,
        setupFeePercent: String(requested.setupFeePercent),
        monthlyPercent: String(requested.monthlyPercent),
        monthlyMonths: requested.monthlyMonths,
        justification: input.discount.justification,
      })
      .returning()
  } catch (error) {
    if (isUniqueViolation(error, 'platform_discount_requests_pending_key') || isUniqueViolation(error)) {
      throw AppError.conflict('Já existe um pedido de desconto aguardando o superadmin para esta proposta.')
    }
    throw error
  }
  if (!row) throw new Error('Falha ao gravar o pedido de desconto')
  await insertEvent(db, {
    proposalId: proposal.id,
    type: 'NOTE_ADDED',
    visibility: 'internal',
    message: `Pedido de desconto de ${input.seller.name}: ${describeDiscount(requested)} — ${input.discount.justification}`,
    data: { discountRequestId: row.id },
    actor: input.seller,
  })
  await notify(discountRequestedNotification(noticeFacts(row, proposal, input.seller.name, requested)))
  return row
}

async function pendingRequest(id: string): Promise<{ request: PlatformDiscountRequestRow; proposal: ProposalRow; sellerName: string }> {
  const [row] = await requestSelect().where(eq(platformDiscountRequests.id, id)).limit(1)
  if (!row) throw AppError.notFound('Pedido de desconto')
  if (row.request.status !== 'pending') throw AppError.businessRule('Este pedido de desconto já foi decidido.')
  return { request: row.request, proposal: row.proposal, sellerName: row.sellerName ?? 'Vendedor' }
}

/**
 * Aprova (com ajuste opcional). A proposta precisa ainda estar antes da
 * aprovação do compliance (a ativação ainda não foi emitida).
 */
export async function approveDiscount(
  id: string,
  input: ApproveDiscountInput,
  actor: DecisionActor,
): Promise<{ request: DiscountRequest; inviteSent: boolean; discount: ProposalDiscount }> {
  const { request, proposal, sellerName } = await pendingRequest(id)
  if (!DISCOUNT_ALLOWED_STATUSES.includes(proposal.status)) {
    throw AppError.businessRule(
      `A proposta já está "${ONBOARDING_STATUS_LABELS[proposal.status]}": o desconto não pode mais ser aplicado. Recuse o pedido.`,
    )
  }
  const requested = requestedOf(request)
  // Desconto na mensalidade que o vendedor não pediu: o prazo precisa vir junto.
  if ((input.monthlyPercent ?? 0) > 0 && requested.monthlyPercent <= 0 && input.monthlyMonths === undefined) {
    throw AppError.validation([{ path: 'monthlyMonths', message: 'Informe por quantas mensalidades (ou permanente)' }])
  }
  const discount = approvedDiscount(requested, input)
  if (!discount) throw AppError.businessRule('Desconto zerado não é aprovação: recuse o pedido.')
  const now = new Date()
  const record: ProposalDiscountRecord = {
    ...discount,
    requestId: request.id,
    approvedAt: now.toISOString(),
    approvedByUserId: actor.userId,
    approvedByName: actor.name,
  }
  const updated = await db.transaction(async tx => {
    const [decided] = await tx
      .update(platformDiscountRequests)
      .set({
        status: 'approved',
        approvedSetupFeePercent: String(discount.setupFeePercent),
        approvedMonthlyPercent: String(discount.monthlyPercent),
        approvedMonthlyMonths: discount.monthlyMonths,
        decisionNote: input.note ?? null,
        decidedByUserId: actor.userId,
        decidedByName: actor.name,
        decidedAt: now,
        updatedAt: now,
      })
      .where(and(eq(platformDiscountRequests.id, id), eq(platformDiscountRequests.status, 'pending')))
      .returning({ id: platformDiscountRequests.id })
    if (!decided) throw AppError.conflict('O pedido foi decidido por outra pessoa. Recarregue a página.')
    const [row] = await tx
      .update(platformOnboardingProposals)
      .set({ discount: record, updatedAt: now })
      .where(and(eq(platformOnboardingProposals.id, proposal.id), inArray(platformOnboardingProposals.status, [...DISCOUNT_ALLOWED_STATUSES])))
      .returning()
    if (!row) throw AppError.conflict('A proposta mudou de estado enquanto o desconto era aprovado. Recarregue a página.')
    return row
  })
  const adjusted = describeDiscount(discount) !== describeDiscount(requested)
  await insertEvent(db, {
    proposalId: proposal.id,
    type: 'NOTE_ADDED',
    visibility: 'internal',
    message: `Desconto aprovado por ${actor.name}: ${describeDiscount(discount)}${adjusted ? ` (pedido: ${describeDiscount(requested)})` : ''}${input.note ? ` — ${input.note}` : ''}`,
    data: { discountRequestId: id },
    actor,
  })

  // Link retido aguardando esta decisão: sai agora, já com o preço aprovado.
  let inviteSent = false
  if (updated.source === 'console' && !updated.inviteSentAt && updated.status === 'draft') {
    await sendSellerInvite(updated, { authorUserId: actor.userId, authorName: actor.name })
    inviteSent = true
  }
  await notify(discountDecidedNotification(noticeFacts(request, proposal, sellerName, discount), { approved: true }))
  return { request: await getDiscountRequest(id), inviteSent, discount }
}

export async function rejectDiscount(id: string, input: RejectDiscountInput, actor: DecisionActor): Promise<DiscountRequest> {
  const { request, proposal, sellerName } = await pendingRequest(id)
  const now = new Date()
  const [decided] = await db
    .update(platformDiscountRequests)
    .set({
      status: 'rejected',
      rejectionReason: input.reason,
      decidedByUserId: actor.userId,
      decidedByName: actor.name,
      decidedAt: now,
      updatedAt: now,
    })
    .where(and(eq(platformDiscountRequests.id, id), eq(platformDiscountRequests.status, 'pending')))
    .returning({ id: platformDiscountRequests.id })
  if (!decided) throw AppError.conflict('O pedido foi decidido por outra pessoa. Recarregue a página.')
  await insertEvent(db, {
    proposalId: proposal.id,
    type: 'NOTE_ADDED',
    visibility: 'internal',
    message: `Desconto recusado por ${actor.name}: ${input.reason}`,
    data: { discountRequestId: id },
    actor,
  })
  await notify(
    discountDecidedNotification(noticeFacts(request, proposal, sellerName, requestedOf(request)), { approved: false, reason: input.reason }),
  )
  return getDiscountRequest(id)
}

/** Proposta do pedido (para o controller conferir/auditar). */
export async function proposalOfRequest(id: string): Promise<ProposalRow | null> {
  const [row] = await db
    .select({ proposalId: platformDiscountRequests.proposalId })
    .from(platformDiscountRequests)
    .where(eq(platformDiscountRequests.id, id))
    .limit(1)
  return row ? getProposal(row.proposalId) : null
}
