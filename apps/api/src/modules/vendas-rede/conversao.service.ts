import {
  contractorTypeOf,
  isValidCnpj,
  legalForm as legalFormSchema,
  type AssinarLeadInput,
  type CheckoutResult,
  type DiscountRequestInput,
  type PropostaLeadInput,
  type SellerLinkResult,
  type SellerProposal,
} from '@annetec/contracts'
import { and, eq } from 'drizzle-orm'
import { webBaseUrl } from '@/config/env'
import { db } from '@/db/client'
import { clubPlans, user, vendasAgentes, vendasLeads, type VendasAgenteRow, type VendasLeadRow } from '@/db/schema'
import { AppError } from '@/http/errors'
import { lookupCnpj } from '@/integrations/cnpj'
import type { ResolvedTenant } from '@/http/types'
import { checkoutService } from '@/modules/club-billing/checkout.service'
import { findPlanOffer } from '@/modules/platform-onboarding/plans'
import { getProposal, insertEvent } from '@/modules/platform-onboarding/repository'
import { assertCnpjAvailable, insertProposal } from '@/modules/platform-onboarding/service'
import { createDiscountRequest, getDiscountRequest } from '@/modules/platform-sales/discounts.service'
import { sendSellerInvite } from '@/modules/platform-sales/invite'
import { getSellerProposal } from '@/modules/platform-sales/links.service'
import { OPEN_PROPOSAL_STATUSES } from '@/modules/platform-sales/rules'
import { atribuicaoDoAgente, compradorEhOAgenteNoBanco } from './atribuicao'
import { whereEscopo, type VendasCtx } from './context'
import { carregarEditavel, carregarLead, registrarEventoLead } from './leads.service'
import { compradorEhOAgente, MOTIVO_AUTO_COMPRA, ROTULO_ETAPA, type EtapaLead } from './rules'

/**
 * Conversão do lead em venda (ponte com a contratação e o checkout) —
 * `docs/rede-comercial.md`, 4.2 "Conversão".
 *
 *  - platform: `proposta` cria/reaproveita a proposta (link de contratação) atribuída ao agente
 *    dono do lead (`vendas_agente_id`/`vendas_lead_id` + `seller_user_id` antigo por compatibilidade);
 *    `obterProposta`; `pedirDesconto` (fluxo de aprovação do superadmin, igual ao do vendedor antigo);
 *  - tenant: `linkAdesao` (URL pública do checkout com `ref`/`lead`) e `assinar` (assinatura presencial
 *    pelo MESMO serviço do checkout público, sem devolver a sessão do associado ao vendedor).
 */

const ETAPAS_ANTES_DA_NEGOCIACAO = ['novo', 'em_contato', 'proposta'] as const

function exigePlatform(ctx: VendasCtx): void {
  if (ctx.scope !== 'platform') throw AppError.notFound('Rota')
}

function exigeTenant(ctx: VendasCtx): void {
  if (ctx.scope !== 'tenant') throw AppError.notFound('Rota')
}

async function agenteDoLead(lead: VendasLeadRow): Promise<VendasAgenteRow | null> {
  if (!lead.agenteId) return null
  const [row] = await db.select().from(vendasAgentes).where(eq(vendasAgentes.id, lead.agenteId)).limit(1)
  return row ?? null
}

// ---------------------------------------------------------------------------
// Platform: proposta
// ---------------------------------------------------------------------------

function faltando(campos: { path: string; message: string }[]): never {
  throw AppError.validation(campos, 'Complete o cadastro do lead antes de gerar a proposta')
}

/** Forma jurídica guardada em `dados.formaJuridica` (padrão: `ltda`). */
function formaJuridicaDoLead(lead: VendasLeadRow) {
  const parsed = legalFormSchema.safeParse(lead.dados?.formaJuridica)
  return parsed.success ? parsed.data : ('ltda' as const)
}

async function propostaDoLead(lead: VendasLeadRow) {
  if (lead.conversao?.tipo !== 'proposta') return null
  return (await getProposal(lead.conversao.id)) ?? null
}

async function apresentarProposta(proposalId: string): Promise<SellerProposal> {
  const proposal = await getProposal(proposalId)
  if (!proposal) throw AppError.notFound('Proposta')
  return getSellerProposal(proposal.id, proposal.sellerUserId ?? '')
}

/**
 * `POST /leads/:id/proposta {planoId, enviarEmail}`. Cria a proposta/link (plataforma) para o CNPJ do lead,
 * atribuída ao dono do lead; se já houver proposta em andamento, reaproveita (e reenvia o e-mail quando
 * `enviarEmail`). Grava `conversao {tipo:'proposta'}` e leva o lead à etapa `negociacao`.
 */
export async function criarProposta(ctx: VendasCtx, leadId: string, input: PropostaLeadInput, agora: Date = new Date()): Promise<SellerLinkResult> {
  exigePlatform(ctx)
  const { lead } = await carregarEditavel(ctx, leadId)
  const dono = await agenteDoLead(lead)
  if (!dono) throw AppError.businessRule('Atenda o lead antes de gerar a proposta.')
  if (!dono.ativo) throw AppError.businessRule('O responsável por este lead está inativo. Passe o lead para outra pessoa antes de gerar a proposta.')
  const [conta] = await db.select({ email: user.email }).from(user).where(eq(user.id, dono.userId)).limit(1)

  // Proposta em andamento: reaproveita.
  const existente = await propostaDoLead(lead)
  if (existente && OPEN_PROPOSAL_STATUSES.includes(existente.status)) {
    let emailEnviado = false
    if (input.enviarEmail) {
      if (existente.source !== 'console') {
        throw AppError.businessRule('Esta proposta foi iniciada pelo próprio cliente no site: ele já recebeu o link.')
      }
      await sendSellerInvite(existente, { authorUserId: ctx.userId, authorName: ctx.agente?.nome ?? ctx.userName })
      emailEnviado = true
    }
    return { proposal: await apresentarProposta(existente.id), discountRequest: null, emailSent: emailEnviado }
  }

  const problemas: { path: string; message: string }[] = []
  const cnpj = (lead.documento ?? '').replace(/\D/g, '')
  if (!isValidCnpj(cnpj)) problemas.push({ path: 'documento', message: 'Informe o CNPJ da empresa no cadastro do lead' })
  if (!lead.email) problemas.push({ path: 'email', message: 'Informe o e-mail do responsável: o link de contratação vai para ele' })
  if (!lead.telefone) problemas.push({ path: 'telefone', message: 'Informe o telefone do responsável' })
  if (!lead.vidasEstimadas || lead.vidasEstimadas < 1) problemas.push({ path: 'vidasEstimadas', message: 'Informe as vidas estimadas' })
  if (problemas.length > 0) faltando(problemas)
  const email = lead.email!.trim().toLowerCase()
  // Auto-compra: e-mail ou telefone do responsável iguais aos do vendedor dono (o CPF não entra: o cliente é CNPJ).
  const mesmoEmail = Boolean(conta) && email === conta!.email.trim().toLowerCase()
  if (mesmoEmail || compradorEhOAgente({ telefone: dono.telefone }, { telefone: lead.telefone })) {
    await registrarEventoLead(db, {
      leadId: lead.id,
      tipo: 'sistema',
      texto: 'Atribuição bloqueada: comprador é o próprio agente.',
      dados: { motivoNaoComissionavel: MOTIVO_AUTO_COMPRA, agenteId: dono.id },
      porUserId: ctx.userId,
      porAgenteId: ctx.agente?.id ?? null,
      em: agora,
    })
    throw AppError.validation([
      mesmoEmail
        ? {
            path: 'email',
            message: 'Informe o e-mail do responsável no cliente: o link de contratação não pode ser enviado para o e-mail do vendedor',
          }
        : { path: 'telefone', message: 'Informe o telefone do responsável no cliente: o contato não pode ser o do próprio vendedor' },
    ])
  }

  const offer = await findPlanOffer(input.planoId)
  if (!offer) throw AppError.validation([{ path: 'planoId', message: 'Plano não encontrado' }])
  const mensagemAberta = 'Já existe uma proposta em andamento para este CNPJ. Consulte a proposta do lead ou fale com a equipe ANNETEC.'
  await assertCnpjAvailable(cnpj, mensagemAberta)

  const lookup = await lookupCnpj(cnpj)
  const receita = lookup.found ? lookup.result : null
  const legalForm = formaJuridicaDoLead(lead)
  const proposal = await insertProposal(
    {
      status: 'draft',
      contractorType: contractorTypeOf(legalForm),
      legalForm,
      cnpj,
      legalName: receita?.legalName ?? null,
      tradeName: receita?.tradeName ?? null,
      planId: input.planoId,
      expectedLives: lead.vidasEstimadas!,
      applicant: { name: lead.nome, email, phone: lead.telefone! },
      receitaSnapshot: receita,
      receitaCheckedAt: receita ? agora : null,
      source: 'console',
      sellerUserId: dono.userId,
      referralCode: dono.codigoIndicacao,
      vendasAgenteId: dono.id,
      vendasLeadId: lead.id,
      lastActivityAt: agora,
    },
    agora,
    mensagemAberta,
  )
  const autor = { userId: ctx.userId, name: ctx.agente?.nome ?? ctx.userName }
  await insertEvent(db, {
    proposalId: proposal.id,
    type: 'PROPOSAL_CREATED',
    visibility: 'public',
    message: `Proposta iniciada pela equipe comercial ANNETEC — protocolo ${proposal.code}.`,
    data: {
      planId: input.planoId,
      expectedLives: lead.vidasEstimadas,
      sellerUserId: dono.userId,
      vendasAgenteId: dono.id,
      vendasLeadId: lead.id,
      referralCode: dono.codigoIndicacao,
      planPublic: offer.pricing.publicVisible,
      receita: lookup.found ? 'found' : lookup.unavailable ? 'unavailable' : 'not_found',
    },
    actor: autor,
  })

  let emailEnviado = false
  if (input.enviarEmail) {
    await sendSellerInvite(proposal, { authorUserId: ctx.userId, authorName: autor.name })
    emailEnviado = true
  }

  // O lead aponta para a proposta e vai para a negociação (snapshot da cadeia para a comissão).
  const avanca = (ETAPAS_ANTES_DA_NEGOCIACAO as readonly string[]).includes(lead.etapa) || lead.etapa === 'perdido'
  const [atualizado] = await db
    .update(vendasLeads)
    .set({
      conversao: { tipo: 'proposta', id: proposal.id, status: proposal.status, atualizadoEm: agora.toISOString() },
      interessePlanoId: input.planoId,
      ...(avanca ? { etapa: 'negociacao' as const, perdidoEm: null, motivoPerda: null } : {}),
      ...(!lead.atribuicao ? { atribuicao: await atribuicaoDoAgente(dono.id) } : {}),
      updatedAt: agora,
    })
    .where(and(eq(vendasLeads.id, lead.id), eq(vendasLeads.etapa, lead.etapa), whereEscopo(vendasLeads, ctx)))
    .returning({ id: vendasLeads.id })
  if (atualizado && avanca) {
    await registrarEventoLead(db, {
      leadId: lead.id,
      tipo: 'etapa',
      texto: `Etapa: ${ROTULO_ETAPA[lead.etapa as EtapaLead] ?? lead.etapa} → Negociação (proposta ${proposal.code} gerada).`,
      dados: { de: lead.etapa, para: 'negociacao', automatico: true },
      porUserId: ctx.userId,
      porAgenteId: ctx.agente?.id ?? null,
      em: agora,
    })
  }
  await registrarEventoLead(db, {
    leadId: lead.id,
    tipo: 'conversao',
    texto: `Proposta ${proposal.code} criada${emailEnviado ? ' e link enviado ao cliente' : ''}.`,
    dados: { propostaId: proposal.id, protocolo: proposal.code, planoId: input.planoId, emailEnviado },
    porUserId: ctx.userId,
    porAgenteId: ctx.agente?.id ?? null,
    em: agora,
  })
  return { proposal: await apresentarProposta(proposal.id), discountRequest: null, emailSent: emailEnviado }
}

/** `GET /leads/:id/proposta` — estado da proposta do lead (404 quando não há). */
export async function obterProposta(ctx: VendasCtx, leadId: string): Promise<SellerProposal> {
  exigePlatform(ctx)
  const { lead } = await carregarLead(ctx, leadId)
  const proposal = await propostaDoLead(lead)
  if (!proposal) throw AppError.notFound('Proposta')
  return apresentarProposta(proposal.id)
}

/** `POST /leads/:id/desconto` — pedido de desconto na proposta do lead (decide o superadmin; mesmo corpo do fluxo atual). */
export async function pedirDesconto(ctx: VendasCtx, leadId: string, input: DiscountRequestInput): Promise<SellerLinkResult> {
  exigePlatform(ctx)
  const { lead } = await carregarEditavel(ctx, leadId)
  const proposal = await propostaDoLead(lead)
  if (!proposal) throw AppError.notFound('Proposta')
  const dono = await agenteDoLead(lead)
  const pedido = await createDiscountRequest({
    proposal,
    prospectId: null,
    seller: { userId: proposal.sellerUserId ?? dono?.userId ?? ctx.userId, name: dono?.nome ?? ctx.agente?.nome ?? ctx.userName },
    discount: input,
  })
  return {
    proposal: await apresentarProposta(proposal.id),
    discountRequest: await getDiscountRequest(pedido.id),
    emailSent: false,
  }
}

// ---------------------------------------------------------------------------
// Tenant: adesão e assinatura
// ---------------------------------------------------------------------------

async function planoDoClube(tenantId: string, planoId: string) {
  const [plano] = await db
    .select()
    .from(clubPlans)
    .where(and(eq(clubPlans.id, planoId), eq(clubPlans.organizationId, tenantId), eq(clubPlans.status, 'active')))
    .limit(1)
  if (!plano) throw AppError.notFound('Plano')
  return plano
}

export interface LinkAdesao {
  url: string
  planoId: string
  planoNome: string
  /** Código do agente embutido no link (`null` = lead sem dono). */
  ref: string | null
}

/**
 * `POST /leads/:id/link-adesao {planoId}` — URL pública do checkout do clube com `?ref=<código>&lead=<id>`.
 * Guarda o plano de interesse no lead.
 */
export async function linkAdesao(ctx: VendasCtx, leadId: string, planoId: string, agora: Date = new Date()): Promise<LinkAdesao> {
  exigeTenant(ctx)
  const { lead } = await carregarEditavel(ctx, leadId)
  const plano = await planoDoClube(ctx.tenantId!, planoId)
  const dono = (await agenteDoLead(lead)) ?? ctx.agente
  if (dono && !dono.ativo) throw AppError.businessRule('O responsável por este lead está inativo. Passe o lead para outra pessoa antes de gerar o link de adesão.')
  const params = new URLSearchParams({ plano: plano.id })
  if (dono?.codigoIndicacao) params.set('ref', dono.codigoIndicacao)
  params.set('lead', lead.id)
  const url = `${webBaseUrl}/${ctx.tenantSlug}/assinar?${params.toString()}`

  await db
    .update(vendasLeads)
    .set({ interessePlanoId: plano.id, updatedAt: agora })
    .where(and(eq(vendasLeads.id, lead.id), whereEscopo(vendasLeads, ctx)))
  await registrarEventoLead(db, {
    leadId: lead.id,
    tipo: 'sistema',
    texto: `Link de adesão do plano ${plano.name} gerado.`,
    dados: { planoId: plano.id },
    porUserId: ctx.userId,
    porAgenteId: ctx.agente?.id ?? null,
    em: agora,
  })
  return { url, planoId: plano.id, planoNome: plano.name, ref: dono?.codigoIndicacao ?? null }
}

/**
 * `POST /leads/:id/assinar` — assinatura presencial (balcão/vendedor) pelo MESMO serviço do checkout
 * público, atribuída ao lead e ao agente dono. O titular sai do cadastro do lead (nome e sobrenome, CPF,
 * e-mail, telefone e `dados.dataNascimento`). Cartão exige o link de adesão (o cliente digita o cartão).
 * A sessão do associado criada pelo checkout NÃO volta para o vendedor.
 */
export async function assinar(
  ctx: VendasCtx,
  tenant: ResolvedTenant,
  leadId: string,
  input: AssinarLeadInput,
  remoteIp?: string,
): Promise<CheckoutResult> {
  exigeTenant(ctx)
  const { lead } = await carregarEditavel(ctx, leadId)
  if (input.metodoPagamento === 'credit_card') {
    throw AppError.validation(
      [{ path: 'metodoPagamento', message: 'Cartão exige que o cliente digite os dados: envie o link de adesão' }],
      'Forma de pagamento indisponível para assinatura presencial',
    )
  }
  const plano = await planoDoClube(ctx.tenantId!, input.planoId)
  const problemas: { path: string; message: string }[] = []
  const cpf = (lead.documento ?? '').replace(/\D/g, '')
  if (cpf.length !== 11) problemas.push({ path: 'documento', message: 'Informe o CPF do titular no cadastro do lead' })
  if (!lead.email) problemas.push({ path: 'email', message: 'Informe o e-mail do titular' })
  if (!lead.telefone) problemas.push({ path: 'telefone', message: 'Informe o telefone do titular' })
  const nascimento = typeof lead.dados?.dataNascimento === 'string' ? lead.dados.dataNascimento : null
  if (!nascimento) problemas.push({ path: 'dados.dataNascimento', message: 'Informe a data de nascimento do titular' })
  if (problemas.length > 0) throw AppError.validation(problemas, 'Complete o cadastro do lead antes de assinar')

  let dono = (await agenteDoLead(lead)) ?? ctx.agente
  if (dono && !dono.ativo) throw AppError.businessRule('O responsável por este lead está inativo. Passe o lead para outra pessoa antes de assinar.')
  // Auto-compra: o titular é o próprio agente → a venda segue, mas sem atribuição nem comissão.
  const autoCompra = dono ? await compradorEhOAgenteNoBanco(dono, { cpf, email: lead.email, telefone: lead.telefone }) : false
  if (autoCompra) {
    await registrarEventoLead(db, {
      leadId: lead.id,
      tipo: 'sistema',
      texto: 'Atribuição bloqueada: comprador é o próprio agente.',
      dados: { motivoNaoComissionavel: MOTIVO_AUTO_COMPRA, agenteId: dono!.id },
      porUserId: ctx.userId,
      porAgenteId: ctx.agente?.id ?? null,
    })
    dono = null
  }
  const resultado = await checkoutService.checkout(
    tenant,
    {
      planId: plano.id,
      holder: { name: lead.nome, cpf, email: lead.email!, phone: lead.telefone!, birthDate: nascimento! },
      dependents: [],
      payment: { method: input.metodoPagamento },
      acceptTerms: true,
    },
    remoteIp,
    null,
    autoCompra ? { ref: null, lead: null } : { ref: dono?.codigoIndicacao ?? null, lead: lead.id },
  )
  await registrarEventoLead(db, {
    leadId: lead.id,
    tipo: 'sistema',
    texto: `Assinatura presencial do plano ${plano.name} iniciada (${input.metodoPagamento}).`,
    dados: { assinaturaId: resultado.subscriptionId, metodo: input.metodoPagamento },
    porUserId: ctx.userId,
    porAgenteId: ctx.agente?.id ?? null,
  })
  // O checkout abre a sessão do associado quando a conta nasce: isso nunca é entregue a quem vende.
  return { ...resultado, session: null }
}
