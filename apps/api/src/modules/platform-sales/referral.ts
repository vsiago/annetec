import { and, eq, notInArray } from 'drizzle-orm'
import { db } from '@/db/client'
import { platformOnboardingProposals, platformProspectInteractions, platformProspects, user, vendasLeadEventos, vendasLeads } from '@/db/schema'
import { logger } from '@/lib/logger'
import { atribuicaoDoAgente, buscarAgentePorCodigo } from '@/modules/vendas-rede/atribuicao'
import { findActiveSellerByCode, type ActiveSellerRef } from './seller-profile'

/**
 * Código de indicação na contratação PÚBLICA (folha: importada pelo serviço da
 * contratação). Código de agente ativo da Rede Comercial (ou, na transição, de vendedor
 * antigo ativo) vincula; qualquer outro caso é ignorado — a contratação nunca falha por
 * causa do código.
 */

/** Quem recebeu a indicação. `agenteId` preenchido = agente da Rede Comercial (funil novo). */
export interface ReferralRef extends ActiveSellerRef {
  agenteId?: string | null
}

export async function resolveReferral(code: string | null | undefined): Promise<ReferralRef | null> {
  if (!code) return null
  try {
    const agente = await buscarAgentePorCodigo(code, { scope: 'platform', tenantId: null })
    if (agente) {
      const [conta] = await db.select({ banned: user.banned }).from(user).where(eq(user.id, agente.userId)).limit(1)
      if (conta?.banned !== true) {
        return { userId: agente.userId, name: agente.nome, referralCode: agente.codigoIndicacao, agenteId: agente.id }
      }
    }
    const seller = await findActiveSellerByCode(code)
    if (!seller) logger.info({ referralCode: code.slice(0, 60) }, 'Código de indicação desconhecido ou de vendedor inativo — ignorado')
    return seller
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'Falha ao resolver o código de indicação — ignorado')
    return null
  }
}

interface ReferralInput {
  seller: ReferralRef
  proposalId: string
  proposalCode: string
  name: string
  cnpj: string
  applicant: { name: string; email: string; phone: string }
  expectedLives: number
  planId: string
  city?: string | null
  state?: string | null
}

/**
 * Lead no funil do agente (`vendas_leads`: origem `link`, etapa `negociacao`, dono = agente) e a
 * proposta aponta para ele. Reaproveita lead aberto do mesmo agente e CNPJ.
 */
async function createReferralLead(input: ReferralInput & { agenteId: string }): Promise<void> {
  const now = new Date()
  const conversao = { tipo: 'proposta' as const, id: input.proposalId, status: 'draft', atualizadoEm: now.toISOString() }
  const [aberto] = await db
    .select({ id: vendasLeads.id, etapa: vendasLeads.etapa })
    .from(vendasLeads)
    .where(
      and(
        eq(vendasLeads.scope, 'platform'),
        eq(vendasLeads.documento, input.cnpj),
        eq(vendasLeads.agenteId, input.agenteId),
        notInArray(vendasLeads.etapa, ['ganho', 'perdido']),
      ),
    )
    .limit(1)
  let leadId = aberto?.id ?? null
  if (aberto) {
    await db
      .update(vendasLeads)
      .set({ conversao, etapa: 'negociacao', updatedAt: now })
      .where(eq(vendasLeads.id, aberto.id))
  } else {
    const [lead] = await db
      .insert(vendasLeads)
      .values({
        scope: 'platform',
        tenantId: null,
        tipo: 'empresa',
        nome: input.name.slice(0, 160),
        documento: input.cnpj,
        email: input.applicant.email.toLowerCase(),
        telefone: input.applicant.phone,
        cidade: input.city ?? null,
        uf: input.state ?? null,
        origem: 'link',
        origemDetalhe: 'contratacao',
        etapa: 'negociacao',
        agenteId: input.agenteId,
        vidasEstimadas: input.expectedLives,
        interessePlanoId: input.planId,
        atribuicao: await atribuicaoDoAgente(input.agenteId),
        conversao,
        dados: { contato: input.applicant.name, protocolo: input.proposalCode, codigoIndicacao: input.seller.referralCode },
      })
      .returning({ id: vendasLeads.id })
    leadId = lead?.id ?? null
  }
  if (!leadId) return
  await db.insert(vendasLeadEventos).values({
    leadId,
    tipo: aberto ? 'conversao' : 'criado',
    texto: `Contratação iniciada pelo site com o código "${input.seller.referralCode}" — protocolo ${input.proposalCode}.`,
    dados: { propostaId: input.proposalId, protocolo: input.proposalCode },
    em: now,
  })
  await db
    .update(platformOnboardingProposals)
    .set({ vendasLeadId: leadId, vendasAgenteId: input.agenteId })
    .where(eq(platformOnboardingProposals.id, input.proposalId))
}

/**
 * Proposta do site com código de vendedor: entra no funil dele já em negociação,
 * vinculada (a etapa passa a acompanhar a proposta). Agente da Rede Comercial → `vendas_leads`;
 * vendedor antigo ainda sem perfil de agente → `platform_prospects` (fluxo legado).
 */
export async function createReferralProspect(input: ReferralInput): Promise<void> {
  try {
    if (input.seller.agenteId) {
      await createReferralLead({ ...input, agenteId: input.seller.agenteId })
      return
    }
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
      'Proposta vinculada ao vendedor, mas o lead/prospect não foi criado',
    )
  }
}
