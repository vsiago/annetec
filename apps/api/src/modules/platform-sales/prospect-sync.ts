import { ONBOARDING_FINAL_STATUSES, ONBOARDING_STATUS_LABELS, PROSPECT_STAGE_LABELS, type OnboardingStatus } from '@annetec/contracts'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { platformDiscountRequests, platformProspectInteractions, platformProspects } from '@/db/schema'
import { logger } from '@/lib/logger'
import { prospectSyncPatch } from './rules'

/**
 * Sincronização automática prospect ← proposta (folha: importada pelo
 * `transitionProposal` da contratação sem ciclo de import). Roda só quando a
 * proposta tem vendedor; nunca derruba a transição (falha vira log).
 */

type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface SyncedProposal {
  id: string
  status: OnboardingStatus
  sellerUserId: string | null
  rejectionReason?: string | null
  cancelReason?: string | null
}

export async function syncProspectsWithProposal(executor: Executor, proposal: SyncedProposal, now = new Date()): Promise<void> {
  if (!proposal.sellerUserId) return
  try {
    const prospects = await executor
      .select({ id: platformProspects.id, stage: platformProspects.stage })
      .from(platformProspects)
      .where(eq(platformProspects.proposalId, proposal.id))
    for (const row of prospects) {
      const patch = prospectSyncPatch({ stage: row.stage }, proposal, now)
      if (!patch) continue
      const [updated] = await executor
        .update(platformProspects)
        .set(patch)
        .where(and(eq(platformProspects.id, row.id), eq(platformProspects.stage, row.stage)))
        .returning({ id: platformProspects.id })
      if (!updated) continue
      await executor.insert(platformProspectInteractions).values({
        prospectId: row.id,
        kind: 'sistema',
        description: `Etapa atualizada automaticamente: ${PROSPECT_STAGE_LABELS[row.stage]} → ${PROSPECT_STAGE_LABELS[patch.stage]} (proposta "${ONBOARDING_STATUS_LABELS[proposal.status]}").`,
        occurredAt: now,
      })
    }
    // Proposta encerrada: pedido de desconto em aberto perde o sentido.
    if (ONBOARDING_FINAL_STATUSES.includes(proposal.status)) {
      await executor
        .update(platformDiscountRequests)
        .set({ status: 'canceled', decisionNote: `Proposta ${ONBOARDING_STATUS_LABELS[proposal.status].toLowerCase()}`, decidedAt: now, updatedAt: now })
        .where(and(eq(platformDiscountRequests.proposalId, proposal.id), eq(platformDiscountRequests.status, 'pending')))
    }
  } catch (error) {
    logger.error(
      { proposalId: proposal.id, err: error instanceof Error ? error.message : String(error) },
      'Falha ao sincronizar a etapa do prospect com a proposta (transição segue)',
    )
  }
}

/** Há pedido de desconto aguardando o superadmin nesta proposta. */
export async function hasPendingDiscount(proposalId: string, executor: Pick<typeof db, 'select'> = db): Promise<boolean> {
  const [row] = await executor
    .select({ id: platformDiscountRequests.id })
    .from(platformDiscountRequests)
    .where(and(eq(platformDiscountRequests.proposalId, proposalId), eq(platformDiscountRequests.status, 'pending')))
    .limit(1)
  return Boolean(row)
}
