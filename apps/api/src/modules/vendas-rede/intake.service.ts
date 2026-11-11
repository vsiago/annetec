import { ERROR_CODES, ORIGEM_LEAD_LABELS, type EscopoVendas, type LeadPublicoInput, type OrigemLead, type TipoLead } from '@annetec/contracts'
import { and, eq, gt, gte, inArray, isNull, notInArray, ne, or } from 'drizzle-orm'
import { db } from '@/db/client'
import { organization, vendasAgentes, vendasLeads, type VendasLeadRow } from '@/db/schema'
import { AppError } from '@/http/errors'
import { notify, vendasLeadAtribuidoNotification, vendasLeadNoPoolNotifications, type TenantRef } from '@/lib/notifications'
import { logger } from '@/lib/logger'
import { findActiveSellerByCode } from '@/modules/platform-sales/seller-profile'
import { buscarAgentePorCodigo } from './atribuicao'
import { getOrCreateConfig } from './config.service'
import { registrarEventoLead } from './leads.service'
import { estaOnline, escolherAgenteAutomatico, type CandidatoAutomatico } from './rules'

/**
 * Entrada de leads pela porta pública (site ANNETEC e vitrine do clube).
 * `docs/rede-comercial.md`, 4.2 "Público":
 *
 *  - o lead nasce `novo` no POOL (`pool_desde = agora`, evento `criado`);
 *  - `vendas_config.distribuicao = 'automatica'` tenta entregar a um agente
 *    ONLINE (vendedor/supervisor, ativo) de menor carga nos últimos 7 dias; sem
 *    ninguém online fica no pool;
 *  - mesmo telefone/e-mail no escopo com lead aberto nas últimas 24 h não duplica:
 *    acrescenta o evento `sistema` "Novo pedido pelo site";
 *  - avisa (`sales`) os agentes online e os masters explícitos e o sino da gerência.
 *
 * Nada aqui derruba o pedido por causa de notificação: falha vira log.
 */

const JANELA_DEDUPE_MS = 24 * 3_600_000
const JANELA_CARGA_MS = 7 * 24 * 3_600_000
const ETAPAS_FECHADAS = ['ganho', 'perdido'] as const

export interface EntradaLead {
  scope: EscopoVendas
  /** `organization.id` no escopo tenant. */
  tenantId: string | null
  tipo: TipoLead
  nome: string
  email?: string | null
  telefone?: string | null
  documento?: string | null
  cidade?: string | null
  uf?: string | null
  origem?: OrigemLead
  origemDetalhe?: string | null
  interessePlanoId?: string | null
  valorEstimado?: number | null
  vidasEstimadas?: number | null
  observacoes?: string | null
  dados?: Record<string, unknown>
  /** Texto do evento do pedido repetido (padrão: "Novo pedido pelo site"). */
  textoPedidoRepetido?: string
}

export interface ResultadoEntrada {
  leadId: string
  /** `true` = já havia lead aberto das últimas 24 h; só entrou um evento. */
  duplicado: boolean
  /** Dono depois da distribuição (`null` = pool). */
  agenteId: string | null
}

async function carregarInquilino(tenantId: string): Promise<TenantRef | null> {
  const [row] = await db
    .select({ id: organization.id, slug: organization.slug, name: organization.name })
    .from(organization)
    .where(eq(organization.id, tenantId))
    .limit(1)
  return row ?? null
}

function filtroEscopo(entrada: Pick<EntradaLead, 'scope' | 'tenantId'>) {
  return and(eq(vendasLeads.scope, entrada.scope), entrada.tenantId ? eq(vendasLeads.tenantId, entrada.tenantId) : isNull(vendasLeads.tenantId))!
}

/** Lead aberto das últimas 24 h com o mesmo telefone ou e-mail no escopo. */
async function procurarDuplicado(entrada: EntradaLead, agora: Date): Promise<VendasLeadRow | null> {
  const chaves = []
  if (entrada.telefone) chaves.push(eq(vendasLeads.telefone, entrada.telefone))
  if (entrada.email) chaves.push(eq(vendasLeads.email, entrada.email.toLowerCase()))
  if (chaves.length === 0) return null
  const desde = new Date(agora.getTime() - JANELA_DEDUPE_MS)
  const [row] = await db
    .select()
    .from(vendasLeads)
    .where(and(filtroEscopo(entrada), or(...chaves), notInArray(vendasLeads.etapa, [...ETAPAS_FECHADAS]), gt(vendasLeads.createdAt, desde)))
    .limit(1)
  return row ?? null
}

/**
 * Agentes que devem ser avisados de um lead no pool: online (papel ≠ balcão) e os
 * masters explícitos. Devolve os `user_id`.
 */
export async function destinatariosDoPool(
  escopo: { scope: EscopoVendas; tenantId: string | null },
  agora: Date = new Date(),
): Promise<string[]> {
  const config = await getOrCreateConfig(escopo.scope, escopo.tenantId)
  const limite = new Date(agora.getTime() - config.presencaMinutos * 60_000)
  const rows = await db
    .select({ userId: vendasAgentes.userId })
    .from(vendasAgentes)
    .where(
      and(
        eq(vendasAgentes.scope, escopo.scope),
        escopo.tenantId ? eq(vendasAgentes.tenantId, escopo.tenantId) : isNull(vendasAgentes.tenantId),
        eq(vendasAgentes.ativo, true),
        ne(vendasAgentes.papel, 'balcao'),
        or(eq(vendasAgentes.papel, 'master'), gte(vendasAgentes.ultimaPresencaEm, limite)),
      ),
    )
  return [...new Set(rows.map(row => row.userId))]
}

/** Tenta a distribuição automática; devolve o agente escolhido (ou `null` = pool). */
async function distribuirAutomaticamente(
  lead: VendasLeadRow,
  entrada: EntradaLead,
  presencaMinutos: number,
  agora: Date,
) {
  const candidatos = await db
    .select()
    .from(vendasAgentes)
    .where(
      and(
        eq(vendasAgentes.scope, entrada.scope),
        entrada.tenantId ? eq(vendasAgentes.tenantId, entrada.tenantId) : isNull(vendasAgentes.tenantId),
        eq(vendasAgentes.ativo, true),
        inArray(vendasAgentes.papel, ['vendedor', 'supervisor']),
      ),
    )
  if (candidatos.length === 0) return null
  const desde = new Date(agora.getTime() - JANELA_CARGA_MS)
  const recebidos = await db
    .select({ agenteId: vendasLeads.agenteId })
    .from(vendasLeads)
    .where(and(inArray(vendasLeads.agenteId, candidatos.map(c => c.id)), gte(vendasLeads.reivindicadoEm, desde)))
  const carga = new Map<string, number>()
  for (const row of recebidos) if (row.agenteId) carga.set(row.agenteId, (carga.get(row.agenteId) ?? 0) + 1)
  const lista: CandidatoAutomatico[] = candidatos.map(c => ({
    id: c.id,
    online: estaOnline(c.ultimaPresencaEm, agora, presencaMinutos),
    cargaSemana: carga.get(c.id) ?? 0,
  }))
  const escolhido = escolherAgenteAutomatico({ uf: lead.uf }, lista)
  return candidatos.find(c => c.id === escolhido) ?? null
}

/**
 * Porta única de entrada: dedupe de 24 h, criação no pool, evento `criado`,
 * distribuição (`automatica`) e avisos. Nunca lança por falha de notificação.
 */
export async function receberLead(entrada: EntradaLead, agora: Date = new Date()): Promise<ResultadoEntrada> {
  const existente = await procurarDuplicado(entrada, agora)
  if (existente) {
    await registrarEventoLead(db, {
      leadId: existente.id,
      tipo: 'sistema',
      texto: entrada.textoPedidoRepetido ?? 'Novo pedido pelo site',
      dados: { origemDetalhe: entrada.origemDetalhe ?? null, ...(entrada.observacoes ? { mensagem: entrada.observacoes } : {}) },
      em: agora,
    })
    await db.update(vendasLeads).set({ updatedAt: agora }).where(eq(vendasLeads.id, existente.id))
    return { leadId: existente.id, duplicado: true, agenteId: existente.agenteId ?? null }
  }

  const origem = entrada.origem ?? 'site'
  const [criado] = await db
    .insert(vendasLeads)
    .values({
      scope: entrada.scope,
      tenantId: entrada.tenantId,
      tipo: entrada.tipo,
      nome: entrada.nome,
      documento: entrada.documento ?? null,
      email: entrada.email ? entrada.email.toLowerCase() : null,
      telefone: entrada.telefone ?? null,
      cidade: entrada.cidade ?? null,
      uf: entrada.uf ?? null,
      origem,
      origemDetalhe: entrada.origemDetalhe ?? null,
      etapa: 'novo',
      agenteId: null,
      poolDesde: agora,
      interessePlanoId: entrada.interessePlanoId ?? null,
      valorEstimado: entrada.valorEstimado === null || entrada.valorEstimado === undefined ? null : String(entrada.valorEstimado),
      vidasEstimadas: entrada.vidasEstimadas ?? null,
      observacoes: entrada.observacoes ?? null,
      dados: entrada.dados ?? {},
    })
    .returning()
  if (!criado) throw new Error('Falha ao registrar o lead')
  await registrarEventoLead(db, {
    leadId: criado.id,
    tipo: 'criado',
    texto: entrada.origemDetalhe ? `Pedido recebido pelo site (${entrada.origemDetalhe}).` : 'Pedido recebido pelo site.',
    dados: { origem, origemDetalhe: entrada.origemDetalhe ?? null },
    em: agora,
  })

  let agenteId: string | null = null
  try {
    const tenant = entrada.tenantId ? await carregarInquilino(entrada.tenantId) : null
    const config = await getOrCreateConfig(entrada.scope, entrada.tenantId)
    const escolhido = config.distribuicao === 'automatica' ? await distribuirAutomaticamente(criado, entrada, config.presencaMinutos, agora) : null
    if (escolhido) {
      const [atribuido] = await db
        .update(vendasLeads)
        .set({ agenteId: escolhido.id, reivindicadoEm: agora, poolDesde: null, updatedAt: agora })
        .where(and(eq(vendasLeads.id, criado.id), isNull(vendasLeads.agenteId)))
        .returning({ id: vendasLeads.id })
      if (atribuido) {
        agenteId = escolhido.id
        await registrarEventoLead(db, {
          leadId: criado.id,
          tipo: 'atribuido',
          texto: `Distribuído automaticamente a ${escolhido.nome}.`,
          dados: { de: null, para: escolhido.id, automatico: true },
          em: agora,
        })
        await notify(
          vendasLeadAtribuidoNotification({
            tenant,
            leadId: criado.id,
            leadNome: criado.nome,
            recipientUserId: escolhido.userId,
            porNome: 'distribuição automática',
            em: agora,
          }),
        )
      }
    }
    if (!agenteId) {
      const destinatarios = await destinatariosDoPool({ scope: entrada.scope, tenantId: entrada.tenantId }, agora)
      await notify(
        vendasLeadNoPoolNotifications(
          { tenant, leadId: criado.id, leadNome: criado.nome, origemLabel: ORIGEM_LEAD_LABELS[origem], poolDesde: agora },
          destinatarios,
        ),
      )
    }
  } catch (error) {
    logger.error({ leadId: criado.id, err: error instanceof Error ? error.message : String(error) }, 'Lead gravado, mas a distribuição/aviso falhou')
  }
  return { leadId: criado.id, duplicado: false, agenteId }
}

/**
 * `POST /api/v1/public/vendas/leads` (platform). Honeypot (`website` preenchido) → descarta
 * em silêncio (`leadId: null`); o controller responde igual nos dois casos.
 */
export async function receberLeadPublicoPlatform(input: LeadPublicoInput, agora: Date = new Date()): Promise<{ leadId: string | null }> {
  if (input.website && input.website.trim() !== '') {
    logger.warn({ origemDetalhe: input.origemDetalhe }, 'Lead público (platform) descartado pelo honeypot')
    return { leadId: null }
  }
  const dados: Record<string, unknown> = {}
  if (input.empresa) dados.empresa = input.empresa
  const resultado = await receberLead(
    {
      scope: 'platform',
      tenantId: null,
      tipo: 'empresa',
      nome: input.nome,
      email: input.email,
      telefone: input.telefone,
      documento: input.documento ?? null,
      cidade: input.cidade ?? null,
      uf: input.uf ?? null,
      origem: 'site',
      origemDetalhe: input.origemDetalhe,
      observacoes: input.mensagem ?? null,
      dados,
    },
    agora,
  )
  return { leadId: resultado.leadId }
}

/** `GET /public/vendas/ref/:codigo` → nome do vendedor. 404 `VENDAS_CODIGO_INVALIDO` quando o código não é de agente ativo. */
export async function nomeDoVendedorPorCodigo(codigo: string): Promise<{ nomeVendedor: string }> {
  const agente = await buscarAgentePorCodigo(codigo, undefined, db, { incluirInativos: true })
  // Código de agente da Rede Comercial: vale só a linha nova (inativo = inválido, sem cair no cadastro antigo).
  if (agente) {
    if (agente.ativo) return { nomeVendedor: agente.nome }
    throw new AppError(ERROR_CODES.VENDAS_CODIGO_INVALIDO, 'Código de indicação inválido ou inativo.')
  }
  // Transição: vendedor antigo (platform_sellers) ainda não migrado para a rede.
  try {
    const legado = await findActiveSellerByCode(codigo)
    if (legado) return { nomeVendedor: legado.name }
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'Falha ao consultar o código no cadastro antigo de vendedores')
  }
  throw new AppError(ERROR_CODES.VENDAS_CODIGO_INVALIDO, 'Código de indicação inválido ou inativo.')
}
