import { db } from '@/db/client'
import { platformProspectInteractions, platformProspects } from '@/db/schema'
import { logger } from '@/lib/logger'
import { findActiveSellerByCode, type ActiveSellerRef } from './seller-profile'

/**
 * Código de indicação na contratação PÚBLICA (folha: importada pelo serviço da
 * contratação). Código de vendedor ativo vincula; qualquer outro caso é
 * ignorado — a contratação nunca falha por causa do código.
 */

export async function resolveReferral(code: string | null | undefined): Promise<ActiveSellerRef | null> {
  if (!code) return null
  try {
    const seller = await findActiveSellerByCode(code)
    if (!seller) logger.info({ referralCode: code.slice(0, 60) }, 'Código de indicação desconhecido ou de vendedor inativo — ignorado')
    return seller
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'Falha ao resolver o código de indicação — ignorado')
    return null
  }
}

/**
 * Proposta do site com código de vendedor: entra no funil dele já em
 * `em_contratacao`, vinculada (a etapa passa a acompanhar a proposta).
 */
export async function createReferralProspect(input: {
  seller: ActiveSellerRef
  proposalId: string
  proposalCode: string
  name: string
  cnpj: string
  applicant: { name: string; email: string; phone: string }
  expectedLives: number
  planId: string
  city?: string | null
  state?: string | null
}): Promise<void> {
  try {
    const now = new Date()
    const [prospect] = await db
      .insert(platformProspects)
      .values({
        sellerUserId: input.seller.userId,
        name: input.name.slice(0, 160),
        cnpj: input.cnpj,
        contactName: input.applicant.name,
        email: input.applicant.email,
        phone: input.applicant.phone,
        city: input.city ?? null,
        state: input.state ?? null,
        estimatedLives: input.expectedLives,
        interestPlanId: input.planId,
        origin: 'site',
        stage: 'em_contratacao',
        proposalId: input.proposalId,
        stageChangedAt: now,
      })
      .returning({ id: platformProspects.id })
    if (!prospect) return
    await db.insert(platformProspectInteractions).values({
      prospectId: prospect.id,
      kind: 'sistema',
      description: `Contratação iniciada pelo site com o código "${input.seller.referralCode}" — protocolo ${input.proposalCode}.`,
      occurredAt: now,
    })
  } catch (error) {
    logger.error(
      { proposalId: input.proposalId, err: error instanceof Error ? error.message : String(error) },
      'Proposta vinculada ao vendedor, mas o prospect não foi criado',
    )
  }
}
