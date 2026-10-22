import { inArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { platformOnboardingProposals } from '@/db/schema'
import { logger } from '@/lib/logger'
import { cancelActivationCharge } from '@/modules/platform-billing/activation'
import { notifyApplicant } from './notify'
import { insertEvent, transitionProposal } from './repository'
import { expiryDecision } from './rules'

/**
 * Manutenção das propostas (blueprint da plataforma §0.2), chamada pela
 * automação da cobrança da plataforma (Q2, passo 8):
 *  - rascunho sem atividade há mais de `draftExpiryDays` → `canceled`;
 *  - `awaiting_payment` há mais de `activationExpiryDays` → cancela a
 *    cobrança de ativação e a proposta.
 * Cada expiração é um `UPDATE … WHERE status = …`: corrida com o candidato
 * (ou com o pagamento) não sobrescreve nada.
 */
export async function runOnboardingMaintenance(
  now: Date,
  policy: { draftExpiryDays: number; activationExpiryDays: number },
): Promise<{ expired: number; errors: string[] }> {
  const errors: string[] = []
  let expired = 0

  const candidates = await db
    .select({
      id: platformOnboardingProposals.id,
      status: platformOnboardingProposals.status,
      lastActivityAt: platformOnboardingProposals.lastActivityAt,
      approvedAt: platformOnboardingProposals.approvedAt,
    })
    .from(platformOnboardingProposals)
    .where(inArray(platformOnboardingProposals.status, ['draft', 'awaiting_payment']))

  for (const candidate of candidates) {
    const decision = expiryDecision(candidate, now, policy)
    if (!decision) continue
    try {
      const reason =
        decision === 'draft'
          ? `Rascunho sem atividade há mais de ${policy.draftExpiryDays} dias.`
          : `Ativação não paga em ${policy.activationExpiryDays} dias após a aprovação.`
      if (decision === 'activation') {
        await cancelActivationCharge(candidate.id, reason)
      }
      const row = await transitionProposal(db, candidate.id, [candidate.status], {
        status: 'canceled',
        canceledAt: now,
        cancelReason: reason,
      })
      if (!row) continue
      expired++
      await insertEvent(db, {
        proposalId: candidate.id,
        type: 'EXPIRED',
        visibility: 'public',
        message: `Proposta expirada: ${reason}`,
      })
      await notifyApplicant(row, 'onboarding_canceled', { reason })
    } catch (error) {
      const message = `Proposta ${candidate.id}: ${error instanceof Error ? error.message : String(error)}`
      errors.push(message)
      logger.warn({ proposalId: candidate.id, err: error }, 'Falha ao expirar proposta')
    }
  }
  return { expired, errors }
}
