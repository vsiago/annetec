import { PROSPECT_STAGE_LABELS, quotePlatformPlan, type ProspectStage } from '@annetec/contracts'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { platformOnboardingProposals, platformProspectInteractions, platformProspects, user } from '@/db/schema'
import { notifyApplicant } from '@/modules/platform-onboarding/notify'
import { findPlanOffer } from '@/modules/platform-onboarding/plans'
import { publicDiscount } from '@/modules/platform-onboarding/presenter'
import type { ProposalRow } from '@/modules/platform-onboarding/repository'
import { describeDiscount } from './rules'

/**
 * Envio do link de contratação montado pelo vendedor: o e-mail
 * `onboarding_started` (variante "convite do vendedor", com plano e preço já
 * com o desconto aprovado) vai ao CLIENTE; a URL com a chave nunca volta para
 * o vendedor. Marca `invite_sent_at` e leva o prospect a `em_contratacao`.
 */

/**
 * Etapas que o envio do link leva a `em_contratacao`: as anteriores e o
 * `perdido` (novo link = prospect retomado). Nunca volta etapa adiante nem mexe em `ganho`.
 */
const MOVED_BY_LINK: readonly ProspectStage[] = ['novo', 'em_contato', 'proposta_enviada', 'perdido']

export async function sendSellerInvite(proposal: ProposalRow, options: { authorUserId?: string | null; authorName?: string | null } = {}) {
  const [seller] = proposal.sellerUserId
    ? await db.select({ name: user.name }).from(user).where(eq(user.id, proposal.sellerUserId)).limit(1)
    : []
  const offer = proposal.planId ? await findPlanOffer(proposal.planId) : null
  const discount = publicDiscount(proposal.discount)
  const quote = offer ? quotePlatformPlan(offer, offer.pricing, proposal.expectedLives, { discount }) : null

  await notifyApplicant(proposal, 'onboarding_started', {
    sellerName: seller?.name ?? 'Equipe comercial',
    planName: offer?.name ?? null,
    monthlyAmount: quote?.monthlyTotal ?? null,
    setupFee: quote ? quote.setupFee - quote.setupFeeDiscount : null,
    discountSummary: discount ? describeDiscount(discount) : null,
  })

  const now = new Date()
  // 1ª vez: carimba o envio (reenvio mantém a data original).
  await db
    .update(platformOnboardingProposals)
    .set({ inviteSentAt: now, updatedAt: now, lastActivityAt: now })
    .where(and(eq(platformOnboardingProposals.id, proposal.id), isNull(platformOnboardingProposals.inviteSentAt)))

  const prospects = await db
    .select({ id: platformProspects.id, stage: platformProspects.stage })
    .from(platformProspects)
    .where(eq(platformProspects.proposalId, proposal.id))
  for (const prospect of prospects) {
    const advance = proposal.status === 'draft' && MOVED_BY_LINK.includes(prospect.stage)
    if (advance) {
      await db
        .update(platformProspects)
        .set({ stage: 'em_contratacao', stageChangedAt: now, lostAt: null, lostReason: null, updatedAt: now })
        .where(and(eq(platformProspects.id, prospect.id), eq(platformProspects.stage, prospect.stage)))
    }
    await db.insert(platformProspectInteractions).values({
      prospectId: prospect.id,
      kind: 'sistema',
      description: `Link de contratação (protocolo ${proposal.code}) enviado para ${proposal.applicant.email}${
        advance ? ` — etapa ${PROSPECT_STAGE_LABELS[prospect.stage]} → ${PROSPECT_STAGE_LABELS.em_contratacao}` : ''
      }${discount ? ` — com desconto aprovado (${describeDiscount(discount)})` : ''}.`,
      occurredAt: now,
      authorUserId: options.authorUserId ?? null,
      authorName: options.authorName ?? null,
    })
  }
  return { sentAt: now }
}
