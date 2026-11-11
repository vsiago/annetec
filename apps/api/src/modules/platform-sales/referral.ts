import { and, eq, isNull, notInArray } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  platformOnboardingProposals,
  platformProspectInteractions,
  platformProspects,
  user,
  vendasAgentes,
  vendasLeadEventos,
  vendasLeads,
  type VendasAgenteRow,
} from '@/db/schema'
import { logger } from '@/lib/logger'
import { atribuicaoDoAgente, buscarAgentePorCodigo } from '@/modules/vendas-rede/atribuicao'
import { compradorEhOAgente, MOTIVO_AUTO_COMPRA, type DadosDePessoa } from '@/modules/vendas-rede/rules'
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

/**
 * Resolve o código de indicação da contratação pública.
 *
 * Regra de precedência: se o código (qualquer caixa) ou o usuário dono do código antigo tem linha em
 * `vendas_agentes`, vale SÓ ela — agente inativo (ou conta banida) = sem atribuição, nunca cai no
 * cadastro antigo (`platform_sellers`), que ainda marca o vendedor como ativo. O legado só vale quando
 * NÃO existe agente da Rede Comercial.
 *
 * `comprador` (contato do responsável pela contratação): igual ao agente (e-mail/telefone) = auto-compra,
 * sem atribuição. A contratação nunca falha por causa do código.
 */
export async function resolveReferral(code: string | null | undefined, comprador?: DadosDePessoa): Promise<ReferralRef | null> {
  if (!code) return null
  try {
    let agente: VendasAgenteRow | null = await buscarAgentePorCodigo(code, { scope: 'platform', tenantId: null }, db, { incluirInativos: true })
    let legado: ActiveSellerRef | null = null
    if (!agente) {
      legado = await findActiveSellerByCode(code)
      if (legado) {
        // O mesmo usuário pode ter agente novo sob outro código: a linha nova prevalece sobre o legado.
        const [doUsuario] = await db
          .select()
          .from(vendasAgentes)
          .where(and(eq(vendasAgentes.userId, legado.userId), eq(vendasAgentes.scope, 'platform'), isNull(vendasAgentes.tenantId)))
          .limit(1)
        agente = doUsuario ?? null
      }
    }
    if (agente) {
      const [conta] = await db.select({ banned: user.banned, email: user.email }).from(user).where(eq(user.id, agente.userId)).limit(1)
      if (!agente.ativo || conta?.banned === true) {
        logger.info({ referralCode: code.slice(0, 60) }, 'Código de indicação de agente inativo — ignorado')
        return null
      }
      if (comprador && compradorEhOAgente({ cpf: agente.cpf, telefone: agente.telefone, email: conta?.email ?? null }, comprador)) {
        logger.warn({ agenteId: agente.id, motivo: MOTIVO_AUTO_COMPRA }, 'Indicação ignorada: o comprador é o próprio agente')
        return null
      }
      return { userId: agente.userId, name: agente.nome, referralCode: agente.codigoIndicacao, agenteId: agente.id }
    }
    if (!legado) logger.info({ referralCode: code.slice(0, 60) }, 'Código de indicação desconhecido ou de vendedor inativo — ignorado')
    return legado
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
