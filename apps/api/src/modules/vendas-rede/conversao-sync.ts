import type { OnboardingStatus } from '@annetec/contracts'
import { and, eq, notInArray, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { vendasAgentes, vendasLeadEventos, vendasLeads, type VendasAgenteRow, type VendasLeadRow } from '@/db/schema'
import { logger } from '@/lib/logger'
import { atribuicaoDoAgente, buscarAgentePorCodigo, compradorEhOAgenteNoBanco } from './atribuicao'
import { MOTIVO_AUTO_COMPRA, type DadosDePessoa, type EtapaLead } from './rules'
import { safely } from './savepoint'

/**
 * Ponte entre as conversões (proposta da plataforma / assinatura do clube) e o lead.
 * FOLHA: só banco e regras puras — é importada pela contratação (`prospect-sync`) e pelo
 * checkout público sem criar ciclo de import.
 *
 *  - `sincronizarLeadComProposta`: a proposta mudou de status → `conversao.status` e etapa do lead;
 *  - `prepararAtribuicaoDoCheckout` / `vincularAssinaturaAoLead`: `?ref=` e `?lead=` do checkout
 *    público viram `vendas_agente_id`/`vendas_lead_id` em `club_subscriptions`.
 *
 * Nunca derrubam a operação principal: quem chama trata o erro como log.
 */

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ETAPAS_ABERTAS_PARA_NEGOCIACAO: EtapaLead[] = ['novo', 'em_contato', 'proposta']

async function evento(
  executor: Pick<typeof db, 'insert'>,
  leadId: string,
  tipo: 'etapa' | 'conversao' | 'criado' | 'sistema',
  texto: string,
  dados: Record<string, unknown>,
  em: Date,
) {
  await executor.insert(vendasLeadEventos).values({ leadId, tipo, texto, dados, em })
}

// ---------------------------------------------------------------------------
// Proposta da plataforma → lead
// ---------------------------------------------------------------------------

export interface PropostaParaSync {
  id: string
  status: OnboardingStatus
  vendasLeadId?: string | null
  rejectionReason?: string | null
  cancelReason?: string | null
}

/** Etapa para a qual o status da proposta leva o lead (`null` = mantém). */
export function etapaDoLeadParaProposta(status: OnboardingStatus): 'negociacao' | 'ganho' | 'perdido' {
  if (status === 'active' || status === 'provisioning') return 'ganho'
  if (status === 'rejected' || status === 'canceled') return 'perdido'
  return 'negociacao'
}

async function leadsDaProposta(executor: Executor, proposta: PropostaParaSync): Promise<VendasLeadRow[]> {
  if (proposta.vendasLeadId) return executor.select().from(vendasLeads).where(eq(vendasLeads.id, proposta.vendasLeadId))
  // Lead migrado de `platform_prospects`: só a conversão aponta para a proposta.
  const porConversao: SQL = sql`${vendasLeads.conversao}->>'id' = ${proposta.id}`
  return executor.select().from(vendasLeads).where(and(eq(vendasLeads.scope, 'platform'), porConversao))
}

/**
 * Proposta mudou de status: atualiza `conversao.status` e a etapa do lead
 * (`em_contratacao|em_aprovacao|awaiting_discount_approval → negociacao`; ativação/provisionamento →
 * `ganho` com `ganho_em` + evento `conversao`; cancelada/reprovada → `perdido` com motivo).
 * `ganho` nunca é rebaixado por uma proposta posterior.
 */
export async function sincronizarLeadComProposta(executor: Executor, proposta: PropostaParaSync, agora: Date = new Date()): Promise<void> {
  // Savepoint: o `executor` costuma ser a transação da proposta; um erro SQL aqui, sem savepoint, a deixaria
  // "aborted" e a própria transição falharia em seguida. Erro vira log; a transição segue.
  await safely(executor, `lead.sincronizar-proposta:${proposta.id}`, sp => sincronizar(sp, proposta, agora))
}

async function sincronizar(executor: Executor, proposta: PropostaParaSync, agora: Date): Promise<void> {
  const leads = await leadsDaProposta(executor, proposta)
  const alvo = etapaDoLeadParaProposta(proposta.status)
  for (const lead of leads) {
    const campos: Partial<typeof vendasLeads.$inferInsert> = {
      conversao: { tipo: 'proposta', id: proposta.id, status: proposta.status, atualizadoEm: agora.toISOString() },
      updatedAt: agora,
    }
    let novaEtapa: EtapaLead | null = null
    if (alvo === 'ganho' && lead.etapa !== 'ganho') {
      novaEtapa = 'ganho'
      campos.etapa = 'ganho'
      campos.ganhoEm = agora
      campos.perdidoEm = null
      campos.motivoPerda = null
      if (!lead.atribuicao && lead.agenteId) campos.atribuicao = await atribuicaoDoAgente(lead.agenteId, executor)
    } else if (alvo === 'perdido' && lead.etapa !== 'ganho' && lead.etapa !== 'perdido') {
      novaEtapa = 'perdido'
      const motivo =
        proposta.status === 'rejected'
          ? `Proposta reprovada na análise${proposta.rejectionReason ? `: ${proposta.rejectionReason}` : ''}`
          : `Proposta cancelada${proposta.cancelReason ? `: ${proposta.cancelReason}` : ''}`
      campos.etapa = 'perdido'
      campos.perdidoEm = agora
      campos.motivoPerda = motivo.slice(0, 500)
    } else if (alvo === 'negociacao' && ETAPAS_ABERTAS_PARA_NEGOCIACAO.includes(lead.etapa)) {
      novaEtapa = 'negociacao'
      campos.etapa = 'negociacao'
      if (!lead.atribuicao && lead.agenteId) campos.atribuicao = await atribuicaoDoAgente(lead.agenteId, executor)
    }
    const mesmaConversao = lead.conversao?.id === proposta.id && lead.conversao.status === proposta.status
    if (!novaEtapa && mesmaConversao) continue

    const [atualizado] = await executor
      .update(vendasLeads)
      .set(campos)
      .where(and(eq(vendasLeads.id, lead.id), eq(vendasLeads.etapa, lead.etapa)))
      .returning({ id: vendasLeads.id })
    if (!atualizado) continue
    if (novaEtapa) {
      await evento(
        executor,
        lead.id,
        'etapa',
        `Etapa atualizada automaticamente: ${lead.etapa} → ${novaEtapa} (proposta ${proposta.status}).`,
        { de: lead.etapa, para: novaEtapa, automatico: true, propostaStatus: proposta.status },
        agora,
      )
    }
    if (novaEtapa === 'ganho') {
      await evento(executor, lead.id, 'conversao', 'Contratação concluída: o clube foi ativado.', { propostaId: proposta.id }, agora)
    }
  }
}

// ---------------------------------------------------------------------------
// Checkout público do clube → lead
// ---------------------------------------------------------------------------

export interface PedidoAtribuicao {
  /** Código de indicação do agente (sem diferenciar maiúsculas). */
  ref?: string | null
  /** `vendas_leads.id` do lead que originou o link. */
  lead?: string | null
}

export interface AtribuicaoDoCheckout {
  agenteId: string | null
  leadId: string | null
}

export interface TitularDoCheckout {
  name: string
  email: string
  phone: string | null
  cpf: string
}

/** Digitos de um documento (CPF) para comparar titular × lead. */
const digitos = (valor: string | null | undefined): string => (valor ?? '').replace(/\D/g, '')

async function agenteDoClube(executor: Executor, tenantId: string, agenteId: string): Promise<VendasAgenteRow | null> {
  const [row] = await executor
    .select()
    .from(vendasAgentes)
    .where(and(eq(vendasAgentes.id, agenteId), eq(vendasAgentes.scope, 'tenant'), eq(vendasAgentes.tenantId, tenantId)))
    .limit(1)
  return row ?? null
}

/** Evento no lead quando a atribuição é barrada por auto-compra. */
async function registrarAutoCompraBarrada(executor: Executor, leadId: string | null, agente: VendasAgenteRow, agora: Date): Promise<void> {
  logger.warn({ agenteId: agente.id, motivo: MOTIVO_AUTO_COMPRA }, 'Atribuição bloqueada: o comprador é o próprio agente')
  if (!leadId) return
  await evento(
    executor,
    leadId,
    'sistema',
    'Atribuição bloqueada: comprador é o próprio agente.',
    { motivoNaoComissionavel: MOTIVO_AUTO_COMPRA, agenteId: agente.id },
    agora,
  )
}

/**
 * Resolve `ref`/`lead` do checkout em (agente, lead) do PRÓPRIO clube — código ou lead de
 * outro clube é ignorado. Só `ref`: cria lead `negociacao` origem `link` com dono = agente
 * (reaproveita lead aberto do mesmo agente e CPF). Só `lead`: o dono do lead é o agente.
 * Sem nada válido → `null` (venda sem atribuição).
 *
 * O link é público e reaproveitável por quem receber o WhatsApp, então o `lead` só vale se:
 *  - com `ref` junto, o `ref` for do dono do lead (senão ignora o `lead` e usa o `ref`);
 *  - o lead tiver `documento` e ele bater com o CPF do titular (lead de outra pessoa é ignorado);
 *  - o dono estiver ATIVO (agente desativado não recebe atribuição nova).
 * E nunca há atribuição quando o titular é o próprio agente (auto-compra).
 */
export async function prepararAtribuicaoDoCheckout(
  tenantId: string,
  pedido: PedidoAtribuicao,
  titular: TitularDoCheckout,
  plano: { id: string; name: string },
  agora: Date = new Date(),
  executor: Executor = db,
): Promise<AtribuicaoDoCheckout | null> {
  const agente = await buscarAgentePorCodigo(pedido.ref, { scope: 'tenant', tenantId }, executor)
  let lead: VendasLeadRow | null = null
  if (pedido.lead && UUID.test(pedido.lead)) {
    const [row] = await executor
      .select()
      .from(vendasLeads)
      .where(and(eq(vendasLeads.id, pedido.lead), eq(vendasLeads.scope, 'tenant'), eq(vendasLeads.tenantId, tenantId)))
      .limit(1)
    lead = row ?? null
  }
  let dono: VendasAgenteRow | null = null
  if (lead?.agenteId) {
    dono = await agenteDoClube(executor, tenantId, lead.agenteId)
    const refInformado = Boolean(pedido.ref?.trim())
    if (!dono?.ativo) lead = null
    else if (refInformado && agente?.id !== dono.id) lead = null
    else if (digitos(lead.documento) && digitos(lead.documento) !== digitos(titular.cpf)) lead = null
    if (!lead) dono = null
  } else if (lead && digitos(lead.documento) && digitos(lead.documento) !== digitos(titular.cpf)) {
    lead = null
  }
  const responsavel = lead ? (dono ?? agente) : agente
  if (responsavel && (await compradorEhOAgenteNoBanco(responsavel, { cpf: titular.cpf, email: titular.email, telefone: titular.phone }, executor))) {
    await registrarAutoCompraBarrada(executor, lead?.id ?? null, responsavel, agora)
    return null
  }
  if (lead) return { agenteId: lead.agenteId ?? agente?.id ?? null, leadId: lead.id }
  if (!agente) return null

  const [aberto] = await executor
    .select()
    .from(vendasLeads)
    .where(
      and(
        eq(vendasLeads.scope, 'tenant'),
        eq(vendasLeads.tenantId, tenantId),
        eq(vendasLeads.agenteId, agente.id),
        eq(vendasLeads.documento, titular.cpf),
        notInArray(vendasLeads.etapa, ['ganho', 'perdido']),
      ),
    )
    .limit(1)
  if (aberto) return { agenteId: agente.id, leadId: aberto.id }

  const atribuicao = await atribuicaoDoAgente(agente.id, executor)
  const [criado] = await executor
    .insert(vendasLeads)
    .values({
      scope: 'tenant',
      tenantId,
      tipo: 'pessoa',
      nome: titular.name,
      documento: titular.cpf,
      email: titular.email.toLowerCase(),
      telefone: titular.phone,
      origem: 'link',
      origemDetalhe: 'checkout',
      etapa: 'negociacao',
      agenteId: agente.id,
      interessePlanoId: plano.id,
      atribuicao,
      dados: { codigoIndicacao: agente.codigoIndicacao },
    })
    .returning({ id: vendasLeads.id })
  if (!criado) return { agenteId: agente.id, leadId: null }
  await evento(
    executor,
    criado.id,
    'criado',
    `Lead criado pelo link de indicação de ${agente.nome} (checkout do plano ${plano.name}).`,
    { origem: 'link', codigo: agente.codigoIndicacao },
    agora,
  )
  return { agenteId: agente.id, leadId: criado.id }
}

/** Assinatura criada: o lead passa a apontar para ela (`conversao`), vai a `negociacao` e ganha snapshot da cadeia. */
export async function vincularAssinaturaAoLead(
  leadId: string,
  assinatura: { id: string; status: string; planoId: string; planoNome: string; titular?: DadosDePessoa },
  agora: Date = new Date(),
  executor: Executor = db,
): Promise<void> {
  try {
    const [lead] = await executor.select().from(vendasLeads).where(eq(vendasLeads.id, leadId)).limit(1)
    if (!lead) return
    // Auto-compra: o titular da assinatura é o agente dono do lead → sem snapshot de cadeia nem vínculo.
    if (assinatura.titular && lead.agenteId) {
      const dono = await agenteDoClube(executor, lead.tenantId ?? '', lead.agenteId)
      if (dono && (await compradorEhOAgenteNoBanco(dono, assinatura.titular, executor))) {
        await registrarAutoCompraBarrada(executor, lead.id, dono, agora)
        return
      }
    }
    const campos: Partial<typeof vendasLeads.$inferInsert> = {
      conversao: { tipo: 'assinatura', id: assinatura.id, status: assinatura.status, atualizadoEm: agora.toISOString() },
      updatedAt: agora,
    }
    if (!lead.interessePlanoId) campos.interessePlanoId = assinatura.planoId
    if (!lead.atribuicao && lead.agenteId) campos.atribuicao = await atribuicaoDoAgente(lead.agenteId, executor)
    const avanca = ETAPAS_ABERTAS_PARA_NEGOCIACAO.includes(lead.etapa)
    if (avanca) campos.etapa = 'negociacao'
    await executor.update(vendasLeads).set(campos).where(and(eq(vendasLeads.id, lead.id), eq(vendasLeads.etapa, lead.etapa)))
    if (avanca) {
      await evento(
        executor,
        lead.id,
        'etapa',
        `Etapa atualizada automaticamente: ${lead.etapa} → negociacao (assinatura iniciada).`,
        { de: lead.etapa, para: 'negociacao', automatico: true },
        agora,
      )
    }
    await evento(
      executor,
      lead.id,
      'conversao',
      `Assinatura do plano ${assinatura.planoNome} iniciada (aguardando pagamento).`,
      { assinaturaId: assinatura.id, planoId: assinatura.planoId },
      agora,
    )
  } catch (error) {
    logger.error({ leadId, err: error instanceof Error ? error.message : String(error) }, 'Assinatura criada, mas o lead não foi atualizado')
  }
}
