import {
  ONBOARDING_FINAL_STATUSES,
  ONBOARDING_STATUS_LABELS,
  contractorTypeOf,
  quotePlatformPlan,
  type CreateSellerLinkInput,
  type DiscountRequestInput,
  type ListSellerProposalsQuery,
  type PlatformPlanOffer,
  type PlatformSeller,
  type SellerLinkResult,
  type SellerProposal,
} from '@annetec/contracts'
import { and, count, desc, eq, inArray, notInArray, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { platformOnboardingProposals, platformProspectInteractions, platformProspects, tenantPlans } from '@/db/schema'
import { AppError } from '@/http/errors'
import { lookupCnpj } from '@/integrations/cnpj'
import { findPlanOffer } from '@/modules/platform-onboarding/plans'
import { publicDiscount } from '@/modules/platform-onboarding/presenter'
import { getProposal, insertEvent, type ProposalRow } from '@/modules/platform-onboarding/repository'
import { assertCnpjAvailable, insertProposal } from '@/modules/platform-onboarding/service'
import { createDiscountRequest, customerNameOf, getDiscountRequest, lastRequestsByProposal } from './discounts.service'
import { sendSellerInvite } from './invite'
import { loadProspect, type Author } from './prospects.service'
import { OPEN_PROPOSAL_STATUSES, sellerLinkStatusOf } from './rules'

/**
 * Link de contratação montado pelo vendedor + "minhas propostas".
 *
 * A proposta nasce `draft`, `source = 'console'`, atribuída ao vendedor (com o
 * código dele) e PODE usar plano fora da vitrine (`publicVisible = false`).
 * Sem pedido de desconto o e-mail com o link vai na hora; com pedido, o
 * e-mail fica retido até o superadmin decidir. O vendedor nunca recebe a URL
 * com a chave (ela dá edição da proposta e o aceite do contrato).
 */

const OPEN_FOR_PROSPECT_MESSAGE =
  'Já existe uma proposta em andamento para este CNPJ. Consulte em "Minhas propostas" ou fale com a equipe ANNETEC.'

type DiscountRow = Awaited<ReturnType<typeof lastRequestsByProposal>> extends Map<string, infer R> ? R : never

/**
 * O e-mail do link leva a CHAVE da proposta (edição e aceite do contrato): ele
 * nunca pode ir para a conta do próprio vendedor.
 */
function assertApplicantIsNotSeller(applicantEmail: string, seller: Pick<PlatformSeller, 'email'>): void {
  if (applicantEmail.trim().toLowerCase() === seller.email.trim().toLowerCase()) {
    throw AppError.validation([
      {
        path: 'applicant.email',
        message: 'Informe o e-mail do responsável no cliente: o link de contratação não pode ser enviado para o seu próprio e-mail',
      },
    ])
  }
}

function toSellerProposal(
  proposal: ProposalRow,
  ctx: { offer: PlatformPlanOffer | null; planName: string | null; lastRequest: DiscountRow | null; prospectId: string | null },
): SellerProposal {
  const discount = publicDiscount(proposal.discount)
  const pending = ctx.lastRequest?.status === 'pending'
  return {
    id: proposal.id,
    code: proposal.code,
    status: proposal.status,
    source: proposal.source,
    cnpj: proposal.cnpj,
    customerName: customerNameOf(proposal),
    applicant: proposal.applicant,
    planId: proposal.planId,
    planName: ctx.offer?.name ?? ctx.planName,
    expectedLives: proposal.expectedLives,
    quote: ctx.offer ? quotePlatformPlan(ctx.offer, ctx.offer.pricing, proposal.expectedLives, { discount }) : null,
    discount,
    lastDiscountRequest: ctx.lastRequest
      ? {
          id: ctx.lastRequest.id,
          status: ctx.lastRequest.status,
          rejectionReason: ctx.lastRequest.rejectionReason,
          decidedAt: ctx.lastRequest.decidedAt?.toISOString() ?? null,
        }
      : null,
    linkStatus: sellerLinkStatusOf(proposal, pending),
    inviteSentAt: proposal.inviteSentAt?.toISOString() ?? null,
    prospectId: ctx.prospectId,
    referralCode: proposal.referralCode,
    organizationId: proposal.organizationId,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
  }
}

async function presentMany(rows: { proposal: ProposalRow; planName: string | null }[]): Promise<SellerProposal[]> {
  const ids = rows.map(r => r.proposal.id)
  const [requests, prospects] = await Promise.all([
    lastRequestsByProposal(ids),
    ids.length
      ? db
          .select({ id: platformProspects.id, proposalId: platformProspects.proposalId })
          .from(platformProspects)
          .where(inArray(platformProspects.proposalId, ids))
      : Promise.resolve([] as { id: string; proposalId: string | null }[]),
  ])
  const prospectByProposal = new Map(prospects.map(p => [p.proposalId, p.id]))
  const offers = new Map<string, PlatformPlanOffer | null>()
  const out: SellerProposal[] = []
  for (const { proposal, planName } of rows) {
    let offer: PlatformPlanOffer | null = null
    if (proposal.planId) {
      if (!offers.has(proposal.planId)) offers.set(proposal.planId, await findPlanOffer(proposal.planId))
      offer = offers.get(proposal.planId) ?? null
    }
    out.push(
      toSellerProposal(proposal, {
        offer,
        planName,
        lastRequest: requests.get(proposal.id) ?? null,
        prospectId: prospectByProposal.get(proposal.id) ?? null,
      }),
    )
  }
  return out
}

export async function listSellerProposals(
  query: ListSellerProposalsQuery,
  sellerUserId: string,
): Promise<{ items: SellerProposal[]; total: number }> {
  const t = platformOnboardingProposals
  const filters: SQL[] = [eq(t.sellerUserId, sellerUserId)]
  if (query.status) filters.push(eq(t.status, query.status))
  if (query.group === 'open') filters.push(notInArray(t.status, [...ONBOARDING_FINAL_STATUSES]))
  if (query.group === 'done') filters.push(inArray(t.status, [...ONBOARDING_FINAL_STATUSES]))
  const where = and(...filters)
  const [rows, [total]] = await Promise.all([
    db
      .select({ proposal: t, planName: tenantPlans.name })
      .from(t)
      .leftJoin(tenantPlans, eq(tenantPlans.id, t.planId))
      .where(where)
      .orderBy(desc(t.updatedAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ value: count() }).from(t).where(where),
  ])
  return { items: await presentMany(rows), total: total?.value ?? 0 }
}

/** Proposta do PRÓPRIO vendedor (de outro = 404). */
export async function ownProposal(id: string, sellerUserId: string): Promise<ProposalRow> {
  const proposal = await getProposal(id)
  if (!proposal || proposal.sellerUserId !== sellerUserId) throw AppError.notFound('Proposta')
  return proposal
}

export async function getSellerProposal(id: string, sellerUserId: string): Promise<SellerProposal> {
  const proposal = await ownProposal(id, sellerUserId)
  const [plan] = proposal.planId
    ? await db.select({ name: tenantPlans.name }).from(tenantPlans).where(eq(tenantPlans.id, proposal.planId)).limit(1)
    : []
  const [dto] = await presentMany([{ proposal, planName: plan?.name ?? null }])
  return dto!
}

/**
 * `POST /vendas/prospects/:id/link`. O prospect precisa ser do vendedor e não
 * ter outra proposta em andamento.
 */
export async function createSellerLink(
  prospectId: string,
  input: CreateSellerLinkInput,
  seller: PlatformSeller,
): Promise<SellerLinkResult> {
  const author: Author = { userId: seller.userId, name: seller.name }
  assertApplicantIsNotSeller(input.applicant.email, seller)
  const { prospect } = await loadProspect(prospectId, { kind: 'seller', userId: seller.userId })
  if (prospect.stage === 'ganho') throw AppError.businessRule('Este prospect já virou cliente.')
  if (prospect.proposalId) {
    const linked = await getProposal(prospect.proposalId)
    if (linked && OPEN_PROPOSAL_STATUSES.includes(linked.status)) {
      throw AppError.conflict(
        `Este prospect já tem a proposta ${linked.code} em andamento ("${ONBOARDING_STATUS_LABELS[linked.status]}"). Cancele-a antes de gerar outro link.`,
      )
    }
  }
  // Vendedor pode oferecer plano fora da vitrine pública.
  const offer = await findPlanOffer(input.planId)
  if (!offer) throw AppError.validation([{ path: 'planId', message: 'Plano não encontrado' }])
  await assertCnpjAvailable(input.cnpj, OPEN_FOR_PROSPECT_MESSAGE)

  const lookup = await lookupCnpj(input.cnpj)
  const receita = lookup.found ? lookup.result : null
  const now = new Date()
  const proposal = await insertProposal(
    {
      status: 'draft',
      contractorType: contractorTypeOf(input.legalForm),
      legalForm: input.legalForm,
      cnpj: input.cnpj,
      legalName: receita?.legalName ?? null,
      tradeName: receita?.tradeName ?? null,
      planId: input.planId,
      expectedLives: input.expectedLives,
      applicant: input.applicant,
      receitaSnapshot: receita,
      receitaCheckedAt: receita ? now : null,
      source: 'console',
      sellerUserId: seller.userId,
      referralCode: seller.referralCode,
      lastActivityAt: now,
    },
    now,
    OPEN_FOR_PROSPECT_MESSAGE,
  )
  await insertEvent(db, {
    proposalId: proposal.id,
    type: 'PROPOSAL_CREATED',
    visibility: 'public',
    message: `Proposta iniciada pela equipe comercial ANNETEC — protocolo ${proposal.code}.`,
    data: {
      planId: input.planId,
      expectedLives: input.expectedLives,
      sellerUserId: seller.userId,
      referralCode: seller.referralCode,
      planPublic: offer.pricing.publicVisible,
      receita: lookup.found ? 'found' : lookup.unavailable ? 'unavailable' : 'not_found',
    },
    actor: author,
  })

  // Vincula ao prospect (completa CNPJ/plano/vidas que faltavam).
  await db
    .update(platformProspects)
    .set({
      proposalId: proposal.id,
      cnpj: prospect.cnpj ?? input.cnpj,
      interestPlanId: input.planId,
      estimatedLives: prospect.estimatedLives ?? input.expectedLives,
      updatedAt: now,
    })
    .where(eq(platformProspects.id, prospectId))
  await db.insert(platformProspectInteractions).values({
    prospectId,
    kind: 'sistema',
    description: `Proposta ${proposal.code} criada: plano ${offer.name}, ${input.expectedLives} vida(s)${
      input.discount ? ' — com pedido de desconto (e-mail retido até o superadmin decidir)' : ''
    }.`,
    occurredAt: now,
    authorUserId: seller.userId,
    authorName: seller.name,
  })

  let discountRequestId: string | null = null
  let emailSent = false
  if (input.discount) {
    const request = await createDiscountRequest({ proposal, prospectId, seller: author, discount: input.discount })
    discountRequestId = request.id
  } else {
    await sendSellerInvite(proposal, { authorUserId: seller.userId, authorName: seller.name })
    emailSent = true
  }
  return {
    proposal: await getSellerProposal(proposal.id, seller.userId),
    discountRequest: discountRequestId ? await getDiscountRequest(discountRequestId) : null,
    emailSent,
  }
}

/**
 * (Re)envia o e-mail com o link ao cliente — inclusive "sem desconto" depois
 * de uma recusa. Bloqueado enquanto houver pedido pendente.
 */
export async function sendSellerLink(id: string, seller: PlatformSeller): Promise<SellerProposal> {
  const proposal = await ownProposal(id, seller.userId)
  if (proposal.source !== 'console') {
    throw AppError.businessRule('Esta proposta foi iniciada pelo próprio cliente no site: ele já recebeu o link.')
  }
  if (ONBOARDING_FINAL_STATUSES.includes(proposal.status)) {
    throw AppError.businessRule(`A proposta está "${ONBOARDING_STATUS_LABELS[proposal.status]}": não há link para enviar.`)
  }
  const requests = await lastRequestsByProposal([proposal.id])
  if (requests.get(proposal.id)?.status === 'pending') {
    throw AppError.businessRule('O pedido de desconto ainda aguarda o superadmin: o link sai assim que ele decidir.')
  }
  assertApplicantIsNotSeller(proposal.applicant.email, seller)
  await sendSellerInvite(proposal, { authorUserId: seller.userId, authorName: seller.name })
  return getSellerProposal(id, seller.userId)
}

/** Novo pedido de desconto numa proposta do vendedor (antes da aprovação do compliance). */
export async function requestDiscountForProposal(
  id: string,
  input: DiscountRequestInput,
  seller: PlatformSeller,
): Promise<SellerLinkResult> {
  const proposal = await ownProposal(id, seller.userId)
  const [prospect] = await db
    .select({ id: platformProspects.id })
    .from(platformProspects)
    .where(and(eq(platformProspects.proposalId, id), eq(platformProspects.sellerUserId, seller.userId)))
    .limit(1)
  const request = await createDiscountRequest({
    proposal,
    prospectId: prospect?.id ?? null,
    seller: { userId: seller.userId, name: seller.name },
    discount: input,
  })
  return {
    proposal: await getSellerProposal(id, seller.userId),
    discountRequest: await getDiscountRequest(request.id),
    emailSent: false,
  }
}
