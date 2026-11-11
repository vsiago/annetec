import {
  ERROR_CODES,
  ORIGEM_LEAD_LABELS,
  type CarteiraQuery,
  type CreateEventoLeadInput,
  type CreateVendasLeadInput,
  ETAPAS_QUADRO,
  type EstacaoLead,
  type ListLeadsQuery,
  type MensagemLeadResponse,
  type MudarEtapaLeadInput,
  type ProximoPassoInput,
  type QuadroLeadsQuery,
  type QuadroLeadsResposta,
  type TipoEventoLead,
  type UpdateVendasLeadInput,
  type VendasLead,
  type VendasLeadEvento,
} from '@annetec/contracts'
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, notInArray, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  clubPlans,
  clubSubscriptions,
  organization,
  platformOnboardingProposals,
  tenantPlans,
  user,
  vendasAgentes,
  vendasCorretoras,
  vendasEquipes,
  vendasLeadEventos,
  vendasLeads,
  type VendasAgenteRow,
  type VendasLeadEventoRow,
  type VendasLeadRow,
} from '@/db/schema'
import { webBaseUrl } from '@/config/env'
import { AppError } from '@/http/errors'
import { notify, vendasLeadAtribuidoNotification } from '@/lib/notifications'
import { atribuicaoDoAgente } from './atribuicao'
import { getOrCreateConfig } from './config.service'
import { whereEscopo, type VendasCtx } from './context'
import { whereAgentesVisiveis } from './presenca.service'
import {
  EVENTOS_DE_CONTATO,
  avaliarTemperatura,
  compararNoQuadro,
  deveVoltarAoPool,
  inicioDoMesSaoPaulo,
  jornadaDoLead,
  podeEditarLead,
  podeReatribuir,
  podeVerLead,
  proximoPassoDoLead,
  sentimentoDoEvento,
  ROTULO_ETAPA,
  transicaoPermitida,
  type AgenteRef,
  type ContextoVisibilidade,
  type EtapaLead,
  type SentimentoContato,
  type Temperatura,
} from './rules'

/**
 * Leads da Rede Comercial (`docs/rede-comercial.md`, 4.2 "Leads").
 *
 * Visibilidade (uma regra, em todo o serviço): lead visível = dono em
 * `whereAgentesVisiveis` OU (sem dono E papel ≠ balcão). O master vê tudo do
 * escopo. Lead invisível = 404 (não revela que existe). Editar exige ser o dono
 * ou estar acima dele na cadeia (`podeEditarLead`); lead em Disponíveis (sem responsável) só o master
 * edita (os demais assumem antes). No texto exibido, o "pool" do código chama-se "Disponíveis".
 */

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

const ETAPAS_ABERTAS: EtapaLead[] = ['novo', 'em_contato', 'proposta', 'negociacao']
const ETAPAS_FECHADAS: EtapaLead[] = ['ganho', 'perdido']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// Apoio: permissões e carga
// ---------------------------------------------------------------------------

export function semPermissao(mensagem = 'Seu perfil não permite esta ação. Fale com o seu supervisor ou gerente.'): AppError {
  return new AppError(ERROR_CODES.VENDAS_SEM_PERMISSAO_NA_REDE, mensagem)
}

function contextoRegras(ctx: VendasCtx): ContextoVisibilidade {
  return {
    papel: ctx.papel,
    agenteId: ctx.agente?.id ?? null,
    corretoraId: ctx.visibilidade.corretoraId ?? null,
    equipeIds: ctx.visibilidade.equipeIds ?? [],
  }
}

/** Balcão não enxerga Disponíveis (pool) nem funil: só os atendimentos dele. */
function exigeFunil(ctx: VendasCtx): void {
  if (ctx.papel === 'balcao') throw semPermissao('O balcão não acessa o funil comercial.')
}

/**
 * `where` de "lead visível" no escopo. `null` = não há nada que este usuário possa ver.
 * Os agentes visíveis são lidos antes (lista de ids): o filtro de leads vira `in (ids)`.
 */
export async function condicaoLeadsVisiveis(ctx: VendasCtx): Promise<SQL | null> {
  const escopo = whereEscopo(vendasLeads, ctx)
  if (ctx.visibilidade.todos) return escopo
  const agentes = await db.select({ id: vendasAgentes.id }).from(vendasAgentes).where(whereAgentesVisiveis(ctx))
  const partes: SQL[] = []
  if (agentes.length > 0) partes.push(inArray(vendasLeads.agenteId, agentes.map(a => a.id)))
  if (ctx.papel !== 'balcao') partes.push(isNull(vendasLeads.agenteId))
  if (partes.length === 0) return null
  return and(escopo, partes.length === 1 ? partes[0] : or(...partes))!
}

interface LeadCarregado {
  lead: VendasLeadRow
  dono: VendasAgenteRow | null
}

/** Lead do escopo + dono. Inexistente ou invisível → 404. */
async function carregarLead(ctx: VendasCtx, id: string, executor: Executor = db): Promise<LeadCarregado> {
  if (!UUID.test(id)) throw AppError.notFound('Lead')
  const [lead] = await executor
    .select()
    .from(vendasLeads)
    .where(and(eq(vendasLeads.id, id), whereEscopo(vendasLeads, ctx)))
    .limit(1)
  if (!lead) throw AppError.notFound('Lead')
  let dono: VendasAgenteRow | null = null
  if (lead.agenteId) {
    const [row] = await executor.select().from(vendasAgentes).where(eq(vendasAgentes.id, lead.agenteId)).limit(1)
    dono = row ?? null
  }
  const acesso = { agenteId: lead.agenteId, donoCorretoraId: dono?.corretoraId ?? null, donoEquipeId: dono?.equipeId ?? null }
  if (!podeVerLead(contextoRegras(ctx), acesso)) throw AppError.notFound('Lead')
  return { lead, dono }
}

/** Supervisor/gerente do dono (para `podeEditarLead`). */
async function cadeiaDoDono(dono: VendasAgenteRow | null): Promise<{ supervisorAgenteId: string | null; gerenteAgenteId: string | null } | null> {
  if (!dono) return null
  const [equipe] = dono.equipeId
    ? await db.select({ s: vendasEquipes.supervisorAgenteId }).from(vendasEquipes).where(eq(vendasEquipes.id, dono.equipeId)).limit(1)
    : []
  const [corretora] = dono.corretoraId
    ? await db.select({ g: vendasCorretoras.gerenteAgenteId }).from(vendasCorretoras).where(eq(vendasCorretoras.id, dono.corretoraId)).limit(1)
    : []
  return { supervisorAgenteId: equipe?.s ?? null, gerenteAgenteId: corretora?.g ?? null }
}

/** Carrega e exige permissão de edição (dono, superior na cadeia ou master). */
async function carregarEditavel(ctx: VendasCtx, id: string): Promise<LeadCarregado> {
  const carregado = await carregarLead(ctx, id)
  const { lead, dono } = carregado
  const acesso = { agenteId: lead.agenteId, donoCorretoraId: dono?.corretoraId ?? null, donoEquipeId: dono?.equipeId ?? null }
  if (!podeEditarLead(contextoRegras(ctx), acesso, await cadeiaDoDono(dono))) {
    throw semPermissao(
      lead.agenteId === null
        ? 'Este lead está disponível: atenda antes de alterá-lo.'
        : 'Este lead é de outro vendedor: você só pode consultá-lo.',
    )
  }
  return carregado
}

function refDeAgente(agente: VendasAgenteRow | null): AgenteRef | null {
  return agente ? { id: agente.id, papel: agente.papel, corretoraId: agente.corretoraId, equipeId: agente.equipeId } : null
}

// ---------------------------------------------------------------------------
// Apoio: eventos e apresentação
// ---------------------------------------------------------------------------

export interface NovoEvento {
  leadId: string
  tipo: TipoEventoLead
  texto?: string | null
  dados?: Record<string, unknown> | null
  porUserId?: string | null
  porAgenteId?: string | null
  em?: Date
}

/** Grava um evento na linha do tempo (também usado pela entrada pública e pela conversão). */
export async function registrarEventoLead(executor: Pick<typeof db, 'insert'>, evento: NovoEvento): Promise<VendasLeadEventoRow | null> {
  const [row] = await executor
    .insert(vendasLeadEventos)
    .values({
    leadId: evento.leadId,
    tipo: evento.tipo,
    texto: evento.texto ?? null,
    dados: evento.dados ?? null,
    porUserId: evento.porUserId ?? null,
    porAgenteId: evento.porAgenteId ?? null,
    ...(evento.em ? { em: evento.em } : {}),
    })
    .returning()
  return row ?? null
}

function autor(ctx: VendasCtx) {
  return { porUserId: ctx.userId, porAgenteId: ctx.agente?.id ?? null }
}

function iso(data: Date | null | undefined): string | null {
  return data ? data.toISOString() : null
}

async function nomesDeAgentes(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return new Map()
  const rows = await db.select({ id: vendasAgentes.id, nome: vendasAgentes.nome }).from(vendasAgentes).where(inArray(vendasAgentes.id, unicos))
  return new Map(rows.map(row => [row.id, row.nome]))
}

async function nomesDePlanos(ctx: Pick<VendasCtx, 'scope' | 'tenantId'>, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)].filter(id => UUID.test(id))
  if (unicos.length === 0) return new Map()
  if (ctx.scope === 'tenant' && ctx.tenantId) {
    const rows = await db
      .select({ id: clubPlans.id, nome: clubPlans.name })
      .from(clubPlans)
      .where(and(inArray(clubPlans.id, unicos), eq(clubPlans.organizationId, ctx.tenantId)))
    return new Map(rows.map(row => [row.id, row.nome]))
  }
  const rows = await db.select({ id: tenantPlans.id, nome: tenantPlans.name }).from(tenantPlans).where(inArray(tenantPlans.id, unicos))
  return new Map(rows.map(row => [row.id, row.nome]))
}

/** Sinais derivados dos eventos: reação do último contato e quando entrou na etapa atual. */
export interface SinaisDoLead {
  ultimoSentimento: SentimentoContato | null
  etapaDesde: Date | null
}

const SEM_SINAIS: SinaisDoLead = { ultimoSentimento: null, etapaDesde: null }

/** Sinais de UM lead a partir dos eventos já carregados (detalhe). */
export function sinaisDosEventos(eventos: readonly Pick<VendasLeadEvento, 'tipo' | 'dados' | 'em'>[]): SinaisDoLead {
  let ultimoContato: { em: number; sentimento: SentimentoContato | null } | null = null
  let ultimaEtapa = 0
  for (const e of eventos) {
    const em = Date.parse(e.em)
    if (EVENTOS_DE_CONTATO.includes(e.tipo) && (!ultimoContato || em >= ultimoContato.em)) {
      ultimoContato = { em, sentimento: sentimentoDoEvento(e.dados) }
    }
    if (e.tipo === 'etapa' && em > ultimaEtapa) ultimaEtapa = em
  }
  return { ultimoSentimento: ultimoContato?.sentimento ?? null, etapaDesde: ultimaEtapa ? new Date(ultimaEtapa) : null }
}

/**
 * Sinais de VÁRIOS leads em 2 consultas (sem N+1): o último evento de contato e o último evento de
 * etapa por lead (`DISTINCT ON (lead_id)` ordenado por `em desc`).
 */
export async function carregarSinais(ids: string[]): Promise<Map<string, SinaisDoLead>> {
  const mapa = new Map<string, SinaisDoLead>()
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return mapa
  const [contatos, etapas] = await Promise.all([
    db
      .selectDistinctOn([vendasLeadEventos.leadId], { leadId: vendasLeadEventos.leadId, dados: vendasLeadEventos.dados })
      .from(vendasLeadEventos)
      .where(and(inArray(vendasLeadEventos.leadId, unicos), inArray(vendasLeadEventos.tipo, [...EVENTOS_DE_CONTATO])))
      .orderBy(vendasLeadEventos.leadId, desc(vendasLeadEventos.em)),
    db
      .selectDistinctOn([vendasLeadEventos.leadId], { leadId: vendasLeadEventos.leadId, em: vendasLeadEventos.em })
      .from(vendasLeadEventos)
      .where(and(inArray(vendasLeadEventos.leadId, unicos), eq(vendasLeadEventos.tipo, 'etapa')))
      .orderBy(vendasLeadEventos.leadId, desc(vendasLeadEventos.em)),
  ])
  for (const id of unicos) mapa.set(id, { ...SEM_SINAIS })
  for (const c of contatos) mapa.set(c.leadId, { ...(mapa.get(c.leadId) ?? SEM_SINAIS), ultimoSentimento: sentimentoDoEvento(c.dados) })
  for (const e of etapas) mapa.set(e.leadId, { ...(mapa.get(e.leadId) ?? SEM_SINAIS), etapaDesde: e.em })
  return mapa
}

/** Linha do banco → contrato `VendasLead` (com jornada e próximo passo; `eventos` só no detalhe). */
export function toVendasLead(
  row: VendasLeadRow,
  extras: { agenteNome: string | null; planoNome: string | null; agora: Date; eventos?: VendasLeadEvento[]; sinais?: SinaisDoLead },
): VendasLead {
  const sinais = extras.sinais ?? (extras.eventos ? sinaisDosEventos(extras.eventos) : SEM_SINAIS)
  const temperatura = avaliarTemperatura({
    etapa: row.etapa,
    ultimoContatoEm: row.ultimoContatoEm,
    ultimoSentimento: sinais.ultimoSentimento,
    proximoPassoEm: row.proximoPassoEm,
    agora: extras.agora,
  })
  const etapaDesde = sinais.etapaDesde ?? row.reivindicadoEm ?? row.createdAt
  const jornada = jornadaDoLead(
    { etapa: row.etapa, agenteId: row.agenteId, ultimoContatoEm: row.ultimoContatoEm },
    (extras.eventos ?? []).map(e => ({ tipo: e.tipo, dados: e.dados })),
  ).map(passo => ({ passo: passo.id, estado: passo.estado }))
  const proximo = proximoPassoDoLead(
    {
      etapa: row.etapa,
      agenteId: row.agenteId,
      ultimoContatoEm: row.ultimoContatoEm,
      proximoPasso: row.proximoPasso,
      proximoPassoEm: row.proximoPassoEm,
    },
    extras.agora,
  )
  return {
    id: row.id,
    scope: row.scope,
    tenantId: row.tenantId ?? null,
    tipo: row.tipo,
    nome: row.nome,
    documento: row.documento ?? null,
    email: row.email ?? null,
    telefone: row.telefone ?? null,
    cidade: row.cidade ?? null,
    uf: row.uf ?? null,
    origem: row.origem,
    origemDetalhe: row.origemDetalhe ?? null,
    etapa: row.etapa,
    agenteId: row.agenteId ?? null,
    agenteNome: extras.agenteNome,
    reivindicadoEm: iso(row.reivindicadoEm),
    poolDesde: iso(row.poolDesde),
    proximoPasso: row.proximoPasso ?? null,
    proximoPassoEm: iso(row.proximoPassoEm),
    ultimoContatoEm: iso(row.ultimoContatoEm),
    interessePlanoId: row.interessePlanoId ?? null,
    interessePlanoNome: extras.planoNome,
    valorEstimado: row.valorEstimado === null || row.valorEstimado === undefined ? null : Number(row.valorEstimado),
    vidasEstimadas: row.vidasEstimadas ?? null,
    atribuicao: row.atribuicao ?? null,
    conversao: row.conversao ?? null,
    ganhoEm: iso(row.ganhoEm),
    perdidoEm: iso(row.perdidoEm),
    motivoPerda: row.motivoPerda ?? null,
    observacoes: row.observacoes ?? null,
    dados: row.dados ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    eventos: extras.eventos,
    jornada,
    proximoPassoInfo: proximo,
    temperatura: temperatura?.nivel ?? null,
    temperaturaMotivo: temperatura?.motivo ?? null,
    ultimoSentimento: sinais.ultimoSentimento,
    etapaDesde: etapaDesde.toISOString(),
  }
}

async function apresentarLeads(
  ctx: VendasCtx,
  rows: VendasLeadRow[],
  agora: Date,
  sinaisProntos?: Map<string, SinaisDoLead>,
): Promise<VendasLead[]> {
  const [agentes, planos, sinais] = await Promise.all([
    nomesDeAgentes(rows.flatMap(row => (row.agenteId ? [row.agenteId] : []))),
    nomesDePlanos(ctx, rows.flatMap(row => (row.interessePlanoId ? [row.interessePlanoId] : []))),
    sinaisProntos ?? carregarSinais(rows.map(row => row.id)),
  ])
  return rows.map(row =>
    toVendasLead(row, {
      agenteNome: row.agenteId ? (agentes.get(row.agenteId) ?? null) : null,
      planoNome: row.interessePlanoId ? (planos.get(row.interessePlanoId) ?? null) : null,
      agora,
      sinais: sinais.get(row.id) ?? SEM_SINAIS,
    }),
  )
}

async function apresentarEventos(rows: VendasLeadEventoRow[]): Promise<VendasLeadEvento[]> {
  const agentes = await nomesDeAgentes(rows.flatMap(row => (row.porAgenteId ? [row.porAgenteId] : [])))
  const semAgente = [...new Set(rows.filter(row => !row.porAgenteId && row.porUserId).map(row => row.porUserId as string))]
  const usuarios = semAgente.length
    ? new Map((await db.select({ id: user.id, nome: user.name }).from(user).where(inArray(user.id, semAgente))).map(row => [row.id, row.nome]))
    : new Map<string, string>()
  return rows.map(row => ({
    id: row.id,
    leadId: row.leadId,
    tipo: row.tipo,
    texto: row.texto ?? null,
    dados: row.dados ?? null,
    porUserId: row.porUserId ?? null,
    porAgenteId: row.porAgenteId ?? null,
    porNome: row.porAgenteId ? (agentes.get(row.porAgenteId) ?? null) : row.porUserId ? (usuarios.get(row.porUserId) ?? null) : null,
    em: row.em.toISOString(),
  }))
}

async function recarregar(ctx: VendasCtx, id: string, agora: Date): Promise<VendasLead> {
  const { lead } = await carregarLead(ctx, id)
  const [item] = await apresentarLeads(ctx, [lead], agora)
  return item!
}

function refInquilino(ctx: VendasCtx) {
  return ctx.tenantId && ctx.tenantSlug ? { id: ctx.tenantId, slug: ctx.tenantSlug, name: ctx.tenantSlug } : null
}

async function avisarAtribuicao(ctx: VendasCtx, lead: Pick<VendasLeadRow, 'id' | 'nome'>, agente: VendasAgenteRow, em: Date): Promise<void> {
  if (agente.userId === ctx.userId) return
  await notify(
    vendasLeadAtribuidoNotification({
      tenant: refInquilino(ctx),
      leadId: lead.id,
      leadNome: lead.nome,
      recipientUserId: agente.userId,
      porNome: ctx.agente?.nome ?? ctx.userName,
      em,
    }),
  )
}

// ---------------------------------------------------------------------------
// Listagem
// ---------------------------------------------------------------------------

/**
 * Retorno preguiçoso ao pool: lead reivindicado visível, ainda `novo`, sem contato
 * dentro de `pool_retorno_horas` volta para ninguém (UPDATE em lote + evento).
 */
export async function devolverVencidosAoPool(ctx: VendasCtx, agora: Date = new Date()): Promise<number> {
  if (ctx.papel === 'balcao') return 0
  const visivel = await condicaoLeadsVisiveis(ctx)
  if (!visivel) return 0
  const config = await getOrCreateConfig(ctx.scope, ctx.tenantId)
  const limite = new Date(agora.getTime() - config.poolRetornoHoras * 3_600_000)
  const candidatos = await db
    .select({
      id: vendasLeads.id,
      agenteId: vendasLeads.agenteId,
      etapa: vendasLeads.etapa,
      reivindicadoEm: vendasLeads.reivindicadoEm,
      ultimoContatoEm: vendasLeads.ultimoContatoEm,
    })
    .from(vendasLeads)
    .where(and(visivel, isNotNull(vendasLeads.agenteId), eq(vendasLeads.etapa, 'novo'), isNotNull(vendasLeads.reivindicadoEm), lt(vendasLeads.reivindicadoEm, limite)))
  const vencidos = candidatos.filter(c => deveVoltarAoPool(c, { poolRetornoHoras: config.poolRetornoHoras }, agora))
  if (vencidos.length === 0) return 0
  const donoAnterior = new Map(vencidos.map(v => [v.id, v.agenteId]))
  const devolvidos = await db
    .update(vendasLeads)
    .set({ agenteId: null, reivindicadoEm: null, poolDesde: agora, updatedAt: agora })
    .where(and(inArray(vendasLeads.id, vencidos.map(v => v.id)), eq(vendasLeads.etapa, 'novo'), isNotNull(vendasLeads.agenteId)))
    .returning({ id: vendasLeads.id })
  for (const row of devolvidos) {
    await registrarEventoLead(db, {
      leadId: row.id,
      tipo: 'devolvido_pool',
      texto: `Voltou para Disponíveis: sem contato em ${config.poolRetornoHoras} h.`,
      dados: { motivo: 'sem_contato', agenteAnteriorId: donoAnterior.get(row.id) ?? null, horas: config.poolRetornoHoras },
      em: agora,
    })
  }
  return devolvidos.length
}

function condicaoEstacao(estacao: EstacaoLead): SQL {
  switch (estacao) {
    case 'pool':
      return and(isNull(vendasLeads.agenteId), notInArray(vendasLeads.etapa, ETAPAS_FECHADAS))!
    case 'novos':
      return and(isNotNull(vendasLeads.agenteId), eq(vendasLeads.etapa, 'novo'))!
    case 'andamento':
      return and(isNotNull(vendasLeads.agenteId), inArray(vendasLeads.etapa, ['em_contato', 'proposta', 'negociacao']))!
    case 'fechados':
      return inArray(vendasLeads.etapa, ETAPAS_FECHADAS)
  }
}

function condicaoBusca(busca: string): SQL {
  const texto = `%${busca.replace(/[%_\\]/g, ch => `\\${ch}`)}%`
  const digitos = busca.replace(/\D/g, '')
  const partes: SQL[] = [sql`${vendasLeads.nome} ilike ${texto}`, sql`${vendasLeads.email} ilike ${texto}`]
  if (digitos.length >= 3) {
    partes.push(sql`${vendasLeads.telefone} like ${`%${digitos}%`}`, sql`${vendasLeads.documento} like ${`%${digitos}%`}`)
  }
  return or(...partes)!
}

export interface ListaDeLeads {
  items: VendasLead[]
  total: number
}

/** `GET /leads` e `GET /leads/pool`. */
export async function listar(ctx: VendasCtx, query: ListLeadsQuery, agora: Date = new Date()): Promise<ListaDeLeads> {
  exigeFunil(ctx)
  await devolverVencidosAoPool(ctx, agora)
  const visivel = await condicaoLeadsVisiveis(ctx)
  if (!visivel) return { items: [], total: 0 }

  const filtros: SQL[] = [visivel]
  if (query.estacao) filtros.push(condicaoEstacao(query.estacao))
  if (query.etapa) filtros.push(eq(vendasLeads.etapa, query.etapa))
  if (query.origem) filtros.push(eq(vendasLeads.origem, query.origem))
  if (query.agente) filtros.push(eq(vendasLeads.agenteId, query.agente))
  const busca = query.busca ?? query.q
  if (busca) filtros.push(condicaoBusca(busca))
  const where = and(...filtros)

  const ordem = query.estacao === 'pool' ? asc(vendasLeads.poolDesde) : desc(vendasLeads.updatedAt)
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(vendasLeads)
      .where(where)
      .orderBy(ordem)
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ total: sql<number>`count(*)::int` }).from(vendasLeads).where(where),
  ])
  return { items: await apresentarLeads(ctx, rows, agora), total: Number(totalRow?.total ?? 0) }
}

/** `GET /leads/contadores` — números das abas-estação. */
export async function contarPorEstacao(ctx: VendasCtx, agora: Date = new Date()): Promise<Record<EstacaoLead, number>> {
  exigeFunil(ctx)
  await devolverVencidosAoPool(ctx, agora)
  const vazio = { pool: 0, novos: 0, andamento: 0, fechados: 0 }
  const visivel = await condicaoLeadsVisiveis(ctx)
  if (!visivel) return vazio
  const estacoes = ['pool', 'novos', 'andamento', 'fechados'] as const
  const totais = await Promise.all(
    estacoes.map(async estacao => {
      const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(vendasLeads)
        .where(and(visivel, condicaoEstacao(estacao)))
      return Number(row?.total ?? 0)
    }),
  )
  return { pool: totais[0]!, novos: totais[1]!, andamento: totais[2]!, fechados: totais[3]! }
}

// ---------------------------------------------------------------------------
// Quadro (Funil em colunas)
// ---------------------------------------------------------------------------

/** Teto de leads abertos lidos (colunas leves) para ordenar e somar o quadro. */
const LIMITE_CANDIDATOS_QUADRO = 5000
const MAX_DISPONIVEIS = 30
const MAX_FECHADOS_MES = 20

const numero = (valor: unknown): number => {
  const n = Number(valor ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * `GET /leads/quadro` — o Funil em colunas numa chamada: por etapa aberta (novo → negociação) o
 * total, a soma do valor estimado, quantos estão atrasados e até `limite` cards ordenados
 * (atrasados, depois quente → morna → fria, depois os mais antigos na etapa); os leads
 * Disponíveis (sem responsável, mais antigos primeiro); e o resumo dos fechados do mês.
 *
 * Respeita a visibilidade por papel (`condicaoLeadsVisiveis`). Duas fases: (1) colunas leves de
 * todos os abertos visíveis + sinais dos eventos (2 consultas `DISTINCT ON`) para calcular a
 * temperatura, somar e ordenar; (2) só os leads que viram card são lidos por inteiro.
 */
export async function quadro(ctx: VendasCtx, query: QuadroLeadsQuery, agora: Date = new Date()): Promise<QuadroLeadsResposta> {
  exigeFunil(ctx)
  await devolverVencidosAoPool(ctx, agora)
  const colunasVazias = ETAPAS_QUADRO.map(etapa => ({ etapa, total: 0, valor: 0, atrasados: 0, itens: [] as VendasLead[] }))
  const vazio: QuadroLeadsResposta = {
    etapas: colunasVazias,
    disponiveis: { total: 0, itens: [] },
    fechados: { ganhos: { total: 0, valor: 0 }, perdidos: { total: 0, valor: 0 }, itens: [] },
    resumo: { emAndamento: 0, valorNegociacao: 0, valorAberto: 0, atrasados: 0 },
    geradoEm: agora.toISOString(),
  }
  const visivel = await condicaoLeadsVisiveis(ctx)
  if (!visivel) return vazio

  const filtrosComuns: SQL[] = [visivel]
  if (query.origem) filtrosComuns.push(eq(vendasLeads.origem, query.origem))
  if (query.busca) filtrosComuns.push(condicaoBusca(query.busca))

  // -- Etapas abertas (só leads com responsável; sem responsável = Disponíveis).
  const filtrosAbertos = [...filtrosComuns, isNotNull(vendasLeads.agenteId), inArray(vendasLeads.etapa, [...ETAPAS_QUADRO])]
  if (query.agente) filtrosAbertos.push(eq(vendasLeads.agenteId, query.agente))
  if (query.atrasados) filtrosAbertos.push(lt(vendasLeads.proximoPassoEm, agora))
  const leves = await db
    .select({
      id: vendasLeads.id,
      etapa: vendasLeads.etapa,
      valorEstimado: vendasLeads.valorEstimado,
      proximoPassoEm: vendasLeads.proximoPassoEm,
      ultimoContatoEm: vendasLeads.ultimoContatoEm,
      reivindicadoEm: vendasLeads.reivindicadoEm,
      createdAt: vendasLeads.createdAt,
    })
    .from(vendasLeads)
    .where(and(...filtrosAbertos))
    .orderBy(desc(vendasLeads.updatedAt))
    .limit(LIMITE_CANDIDATOS_QUADRO)
  const sinais = await carregarSinais(leves.map(l => l.id))

  const avaliados = leves
    .map(l => {
      const s = sinais.get(l.id) ?? SEM_SINAIS
      const temperatura: Temperatura | null =
        avaliarTemperatura({
          etapa: l.etapa,
          ultimoContatoEm: l.ultimoContatoEm,
          ultimoSentimento: s.ultimoSentimento,
          proximoPassoEm: l.proximoPassoEm,
          agora,
        })?.nivel ?? null
      return {
        id: l.id,
        etapa: l.etapa as (typeof ETAPAS_QUADRO)[number],
        valor: numero(l.valorEstimado),
        atrasado: l.proximoPassoEm !== null && l.proximoPassoEm.getTime() < agora.getTime(),
        temperatura,
        etapaDesde: s.etapaDesde ?? l.reivindicadoEm ?? l.createdAt,
      }
    })
    .filter(l => !query.temperatura || l.temperatura === query.temperatura)

  const escolhidos: string[] = []
  const colunas = ETAPAS_QUADRO.map(etapa => {
    const doEtapa = avaliados.filter(l => l.etapa === etapa).sort(compararNoQuadro)
    escolhidos.push(...doEtapa.slice(0, query.limite).map(l => l.id))
    return {
      etapa,
      total: doEtapa.length,
      valor: doEtapa.reduce((soma, l) => soma + l.valor, 0),
      atrasados: doEtapa.filter(l => l.atrasado).length,
      ids: doEtapa.slice(0, query.limite).map(l => l.id),
    }
  })

  // -- Disponíveis (sem responsável, ainda abertos).
  const filtrosDisponiveis = [...filtrosComuns, condicaoEstacao('pool')]
  const [totalDisponiveis] = await db.select({ total: sql<number>`count(*)::int` }).from(vendasLeads).where(and(...filtrosDisponiveis))
  const rowsDisponiveis = await db
    .select()
    .from(vendasLeads)
    .where(and(...filtrosDisponiveis))
    .orderBy(asc(vendasLeads.poolDesde))
    .limit(MAX_DISPONIVEIS)

  // -- Fechados do mês (ganhos por `ganhoEm`, perdidos por `perdidoEm`; fuso de Brasília).
  const inicioMes = inicioDoMesSaoPaulo(agora)
  const filtrosFechados: SQL[] = [
    ...filtrosComuns,
    or(and(eq(vendasLeads.etapa, 'ganho'), gte(vendasLeads.ganhoEm, inicioMes)), and(eq(vendasLeads.etapa, 'perdido'), gte(vendasLeads.perdidoEm, inicioMes)))!,
  ]
  if (query.agente) filtrosFechados.push(eq(vendasLeads.agenteId, query.agente))
  const fechadosLeves = await db
    .select({
      id: vendasLeads.id,
      etapa: vendasLeads.etapa,
      valorEstimado: vendasLeads.valorEstimado,
      ganhoEm: vendasLeads.ganhoEm,
      perdidoEm: vendasLeads.perdidoEm,
    })
    .from(vendasLeads)
    .where(and(...filtrosFechados))
    .limit(LIMITE_CANDIDATOS_QUADRO)
  const ganhosMes = fechadosLeves.filter(l => l.etapa === 'ganho')
  const perdidosMes = fechadosLeves.filter(l => l.etapa === 'perdido')
  const recentesFechados = [...fechadosLeves]
    .sort((a, b) => (b.ganhoEm ?? b.perdidoEm ?? new Date(0)).getTime() - (a.ganhoEm ?? a.perdidoEm ?? new Date(0)).getTime())
    .slice(0, MAX_FECHADOS_MES)
    .map(l => l.id)

  // -- Fase 2: lê por inteiro só quem vira card.
  const idsCards = [...escolhidos, ...recentesFechados]
  const rowsCards = idsCards.length
    ? await db
        .select()
        .from(vendasLeads)
        .where(and(inArray(vendasLeads.id, idsCards), whereEscopo(vendasLeads, ctx)))
    : []
  const sinaisCards = new Map(sinais)
  const faltam = [...rowsDisponiveis.map(r => r.id), ...recentesFechados].filter(id => !sinaisCards.has(id))
  for (const [id, s] of await carregarSinais(faltam)) sinaisCards.set(id, s)
  const apresentados = new Map((await apresentarLeads(ctx, [...rowsCards, ...rowsDisponiveis], agora, sinaisCards)).map(l => [l.id, l]))
  const doMapa = (ids: string[]) => ids.flatMap(id => (apresentados.has(id) ? [apresentados.get(id)!] : []))

  const etapas = colunas.map(({ ids, ...coluna }) => ({ ...coluna, itens: doMapa(ids) }))
  const abertos = etapas.reduce((soma, c) => soma + c.total, 0)
  return {
    etapas,
    disponiveis: { total: Number(totalDisponiveis?.total ?? 0), itens: rowsDisponiveis.map(r => apresentados.get(r.id)!).filter(Boolean) },
    fechados: {
      ganhos: { total: ganhosMes.length, valor: ganhosMes.reduce((soma, l) => soma + numero(l.valorEstimado), 0) },
      perdidos: { total: perdidosMes.length, valor: perdidosMes.reduce((soma, l) => soma + numero(l.valorEstimado), 0) },
      itens: doMapa(recentesFechados),
    },
    resumo: {
      emAndamento: abertos,
      valorNegociacao: etapas.find(c => c.etapa === 'negociacao')?.valor ?? 0,
      valorAberto: etapas.reduce((soma, c) => soma + c.valor, 0),
      atrasados: etapas.reduce((soma, c) => soma + c.atrasados, 0),
    },
    geradoEm: agora.toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/** `GET /leads/:id` — lead + eventos + jornada + próximo passo (+ `conversao` no próprio lead). */
export async function obter(ctx: VendasCtx, id: string, agora: Date = new Date()): Promise<VendasLead> {
  const { lead } = await carregarLead(ctx, id)
  const eventos = await apresentarEventos(
    await db.select().from(vendasLeadEventos).where(eq(vendasLeadEventos.leadId, lead.id)).orderBy(asc(vendasLeadEventos.em)),
  )
  const [agentes, planos] = await Promise.all([
    nomesDeAgentes(lead.agenteId ? [lead.agenteId] : []),
    nomesDePlanos(ctx, lead.interessePlanoId ? [lead.interessePlanoId] : []),
  ])
  return toVendasLead(lead, {
    agenteNome: lead.agenteId ? (agentes.get(lead.agenteId) ?? null) : null,
    planoNome: lead.interessePlanoId ? (planos.get(lead.interessePlanoId) ?? null) : null,
    agora,
    eventos,
  })
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

async function agenteDoEscopo(ctx: VendasCtx, agenteId: string): Promise<VendasAgenteRow> {
  const [agente] = await db
    .select()
    .from(vendasAgentes)
    .where(and(eq(vendasAgentes.id, agenteId), whereEscopo(vendasAgentes, ctx)))
    .limit(1)
  if (!agente) throw AppError.notFound('Agente')
  if (!agente.ativo) throw AppError.businessRule('Esta pessoa está inativa e não pode receber leads.')
  return agente
}

function camposDoLead(input: UpdateVendasLeadInput) {
  const campos: Partial<typeof vendasLeads.$inferInsert> = {}
  if (input.tipo !== undefined) campos.tipo = input.tipo
  if (input.nome !== undefined) campos.nome = input.nome
  if (input.documento !== undefined) campos.documento = input.documento
  if (input.email !== undefined) campos.email = input.email
  if (input.telefone !== undefined) campos.telefone = input.telefone
  if (input.cidade !== undefined) campos.cidade = input.cidade
  if (input.uf !== undefined) campos.uf = input.uf
  if (input.origem !== undefined) campos.origem = input.origem
  if (input.origemDetalhe !== undefined) campos.origemDetalhe = input.origemDetalhe
  if (input.interessePlanoId !== undefined) campos.interessePlanoId = input.interessePlanoId
  if (input.valorEstimado !== undefined) campos.valorEstimado = input.valorEstimado === null ? null : String(input.valorEstimado)
  if (input.vidasEstimadas !== undefined) campos.vidasEstimadas = input.vidasEstimadas
  if (input.observacoes !== undefined) campos.observacoes = input.observacoes
  if (input.dados !== undefined) campos.dados = input.dados
  return campos
}

/**
 * `POST /leads` (manual). Dono = quem cria; `agenteId` (master/gerente/supervisor, conforme
 * `podeReatribuir`) escolhe outro; `agenteId: null` (master) cria direto no pool. Master sem
 * perfil de agente e sem `agenteId` cria no pool. Platform = sempre `empresa`.
 */
export async function criar(ctx: VendasCtx, input: CreateVendasLeadInput, agora: Date = new Date()): Promise<VendasLead> {
  let dono: VendasAgenteRow | null = ctx.agente
  if (input.agenteId !== undefined) {
    if (input.agenteId === null) {
      if (ctx.papel !== 'master') throw semPermissao('Só o administrador cria um lead direto em Disponíveis.')
      dono = null
    } else if (input.agenteId !== ctx.agente?.id) {
      const alvo = await agenteDoEscopo(ctx, input.agenteId)
      if (!podeReatribuir(contextoRegras(ctx), null, refDeAgente(alvo))) {
        throw semPermissao('Você só pode criar leads para pessoas da sua equipe ou corretora.')
      }
      dono = alvo
    }
  }

  const campos = camposDoLead(input)
  const atribuidoPorOutro = Boolean(dono && dono.id !== ctx.agente?.id)
  const [row] = await db
    .insert(vendasLeads)
    .values({
      ...campos,
      scope: ctx.scope,
      tenantId: ctx.tenantId,
      tipo: ctx.scope === 'platform' ? 'empresa' : (input.tipo ?? 'pessoa'),
      nome: input.nome,
      origem: input.origem ?? 'prospeccao',
      etapa: 'novo',
      agenteId: dono?.id ?? null,
      poolDesde: dono ? null : agora,
      reivindicadoEm: null,
      proximoPasso: input.proximoPasso ?? null,
      proximoPassoEm: input.proximoPassoEm ? new Date(input.proximoPassoEm) : null,
      dados: input.dados ?? {},
      createdByUserId: ctx.userId,
    })
    .returning()
  if (!row) throw new Error('Falha ao criar o lead')
  await registrarEventoLead(db, {
    leadId: row.id,
    tipo: 'criado',
    texto: `Lead cadastrado por ${ctx.agente?.nome ?? ctx.userName}.`,
    dados: { origem: row.origem },
    ...autor(ctx),
    em: agora,
  })
  if (dono && atribuidoPorOutro) {
    await registrarEventoLead(db, {
      leadId: row.id,
      tipo: 'atribuido',
      texto: `Atribuído a ${dono.nome}.`,
      dados: { de: null, para: dono.id },
      ...autor(ctx),
      em: agora,
    })
    await avisarAtribuicao(ctx, row, dono, agora)
  }
  return recarregar(ctx, row.id, agora)
}

/** `PATCH /leads/:id` — cadastro (etapa e dono têm rotas próprias). */
export async function atualizar(ctx: VendasCtx, id: string, input: UpdateVendasLeadInput, agora: Date = new Date()): Promise<VendasLead> {
  const { lead } = await carregarEditavel(ctx, id)
  const campos = camposDoLead(input)
  // O tipo do platform é sempre `empresa`.
  if (ctx.scope === 'platform') delete campos.tipo
  if (Object.keys(campos).length === 0) return recarregar(ctx, lead.id, agora)
  await db
    .update(vendasLeads)
    .set({ ...campos, updatedAt: agora })
    .where(and(eq(vendasLeads.id, lead.id), whereEscopo(vendasLeads, ctx)))
  return recarregar(ctx, lead.id, agora)
}

/** `POST /leads/:id/etapa`. */
export async function mudarEtapa(ctx: VendasCtx, id: string, input: MudarEtapaLeadInput, agora: Date = new Date()): Promise<VendasLead> {
  const { lead } = await carregarEditavel(ctx, id)
  const de = lead.etapa
  const para = input.etapa
  if (!transicaoPermitida(de, para, ctx.papel)) {
    throw new AppError(ERROR_CODES.VENDAS_TRANSICAO_INVALIDA, `Este lead não pode ir de ${ROTULO_ETAPA[de]} para ${ROTULO_ETAPA[para]}.`)
  }
  if (para === 'perdido' && !input.motivoPerda?.trim()) {
    throw AppError.validation([{ path: 'motivoPerda', message: 'Informe o motivo da perda' }])
  }
  const confirmado = para === 'ganho' && !lead.conversao
  // Ganho manual (sem venda) infla ranking e metas: só master e gerente. O ganho automático pelo pagamento vale para todos.
  if (confirmado && ctx.papel !== 'master' && ctx.papel !== 'gerente') {
    throw new AppError(ERROR_CODES.VENDAS_TRANSICAO_INVALIDA, 'A venda fecha pela proposta ou pelo link de adesão. Só o administrador e o gerente marcam como fechada sem venda registrada.')
  }
  if (confirmado && !input.confirmar) {
    throw AppError.businessRule(
      'A venda fecha pela proposta ou pela assinatura. Para marcar como fechada manualmente, confirme.',
    )
  }

  const campos: Partial<typeof vendasLeads.$inferInsert> = { etapa: para, updatedAt: agora }
  if (para === 'ganho') {
    campos.ganhoEm = agora
    campos.perdidoEm = null
    campos.motivoPerda = null
  } else if (para === 'perdido') {
    campos.perdidoEm = agora
    campos.motivoPerda = input.motivoPerda!.trim()
    campos.ganhoEm = null
  } else {
    campos.ganhoEm = null
    campos.perdidoEm = null
    campos.motivoPerda = null
  }
  if ((para === 'ganho' || para === 'proposta') && !lead.atribuicao && lead.agenteId) {
    campos.atribuicao = await atribuicaoDoAgente(lead.agenteId)
  }

  const [atualizado] = await db
    .update(vendasLeads)
    .set(campos)
    .where(and(eq(vendasLeads.id, lead.id), eq(vendasLeads.etapa, de), whereEscopo(vendasLeads, ctx)))
    .returning({ id: vendasLeads.id })
  if (!atualizado) throw AppError.conflict('O lead mudou de etapa enquanto você editava. Atualize a página e tente de novo.')

  await registrarEventoLead(db, {
    leadId: lead.id,
    tipo: 'etapa',
    texto:
      para === 'perdido'
        ? `Etapa: ${ROTULO_ETAPA[de]} → ${ROTULO_ETAPA[para]}. Motivo: ${input.motivoPerda!.trim()}`
        : `Etapa: ${ROTULO_ETAPA[de]} → ${ROTULO_ETAPA[para]}.`,
    dados: { de, para, ...(para === 'perdido' ? { motivoPerda: input.motivoPerda!.trim() } : {}), ...(confirmado ? { confirmado: true } : {}) },
    ...autor(ctx),
    em: agora,
  })
  return recarregar(ctx, lead.id, agora)
}

/**
 * `POST /leads/:id/eventos`. Evento de contato atualiza `ultimo_contato_em`; lead `novo`
 * com contato vai sozinho para `em_contato` (com evento `etapa` automático). `sentimento` (como a
 * pessoa reagiu) fica em `dados.sentimento` e alimenta a temperatura do lead.
 */
export async function registrarEvento(
  ctx: VendasCtx,
  id: string,
  input: CreateEventoLeadInput,
  agora: Date = new Date(),
): Promise<VendasLeadEvento> {
  const { lead } = await carregarEditavel(ctx, id)
  const contato = EVENTOS_DE_CONTATO.includes(input.tipo)
  if (input.sentimento && !contato) {
    throw AppError.validation([{ path: 'sentimento', message: 'A reação da pessoa só vale para contatos, não para anotações' }])
  }
  // O sentimento vai em `dados.sentimento` do evento (jsonb já existente: sem migração).
  const dados = { ...(input.dados ?? {}), ...(input.sentimento ? { sentimento: input.sentimento } : {}) }
  const evento = await registrarEventoLead(db, {
    leadId: lead.id,
    tipo: input.tipo,
    texto: input.texto,
    dados: Object.keys(dados).length > 0 ? dados : null,
    ...autor(ctx),
    em: agora,
  })
  if (contato) {
    const avanca = lead.etapa === 'novo' && lead.agenteId !== null
    await db
      .update(vendasLeads)
      .set({ ultimoContatoEm: agora, updatedAt: agora, ...(avanca ? { etapa: 'em_contato' as const } : {}) })
      .where(and(eq(vendasLeads.id, lead.id), whereEscopo(vendasLeads, ctx)))
    if (avanca) {
      await registrarEventoLead(db, {
        leadId: lead.id,
        tipo: 'etapa',
        texto: 'Etapa: Novo → Em contato (primeiro contato registrado).',
        dados: { de: 'novo', para: 'em_contato', automatico: true },
        ...autor(ctx),
        em: agora,
      })
    }
  } else {
    await db.update(vendasLeads).set({ updatedAt: agora }).where(and(eq(vendasLeads.id, lead.id), whereEscopo(vendasLeads, ctx)))
  }
  const [apresentado] = await apresentarEventos(evento ? [evento] : [])
  return apresentado!
}

/** `POST /leads/:id/proximo-passo`. */
export async function proximoPasso(ctx: VendasCtx, id: string, input: ProximoPassoInput, agora: Date = new Date()): Promise<VendasLead> {
  const { lead } = await carregarEditavel(ctx, id)
  const em = new Date(input.em)
  await db
    .update(vendasLeads)
    .set({ proximoPasso: input.texto, proximoPassoEm: em, updatedAt: agora })
    .where(and(eq(vendasLeads.id, lead.id), whereEscopo(vendasLeads, ctx)))
  await registrarEventoLead(db, {
    leadId: lead.id,
    tipo: 'proximo_passo',
    texto: input.texto,
    dados: { em: em.toISOString() },
    ...autor(ctx),
    em: agora,
  })
  return recarregar(ctx, lead.id, agora)
}

/**
 * `POST /leads/:id/reatribuir`. `agenteId: null` devolve ao pool. Master qualquer agente;
 * gerente só na corretora; supervisor só nas equipes dele (`podeReatribuir`). Notifica o novo dono.
 */
export async function reatribuir(ctx: VendasCtx, id: string, agenteId: string | null, agora: Date = new Date()): Promise<VendasLead> {
  const { lead, dono } = await carregarLead(ctx, id)
  const alvo = agenteId ? await agenteDoEscopo(ctx, agenteId) : null
  if (!podeReatribuir(contextoRegras(ctx), refDeAgente(dono), refDeAgente(alvo))) {
    throw semPermissao('Você não pode passar este lead para essa pessoa.')
  }
  if ((lead.agenteId ?? null) === (alvo?.id ?? null)) return recarregar(ctx, lead.id, agora)
  if (ETAPAS_FECHADAS.includes(lead.etapa) && !alvo) throw AppError.businessRule('Lead encerrado não pode ser liberado.')

  const donoAtual = lead.agenteId ? eq(vendasLeads.agenteId, lead.agenteId) : isNull(vendasLeads.agenteId)
  // Reatribuir muda o beneficiário das comissões AINDA NÃO geradas; as já registradas não mudam.
  // Por isso o snapshot da cadeia é zerado (recalculado na 1ª cobrança paga) e as vendas em andamento
  // do lead passam a apontar para o novo agente (o vendedor antigo só mantém o que já vendeu/gerou).
  const atualizado = await db.transaction(async tx => {
    const [linha] = await tx
      .update(vendasLeads)
      .set(
        alvo
          ? { agenteId: alvo.id, reivindicadoEm: agora, poolDesde: null, atribuicao: null, updatedAt: agora }
          : { agenteId: null, reivindicadoEm: null, poolDesde: agora, atribuicao: null, updatedAt: agora },
      )
      .where(and(eq(vendasLeads.id, lead.id), donoAtual, whereEscopo(vendasLeads, ctx)))
      .returning({ id: vendasLeads.id })
    if (!linha) return null
    await tx
      .update(clubSubscriptions)
      .set({ vendasAgenteId: alvo?.id ?? null })
      .where(eq(clubSubscriptions.vendasLeadId, lead.id))
    await tx
      .update(platformOnboardingProposals)
      .set(alvo ? { vendasAgenteId: alvo.id, sellerUserId: alvo.userId } : { vendasAgenteId: null })
      .where(eq(platformOnboardingProposals.vendasLeadId, lead.id))
    return linha
  })
  if (!atualizado) throw AppError.conflict('O lead mudou de responsável enquanto você editava. Atualize a página e tente de novo.')

  if (alvo) {
    await registrarEventoLead(db, {
      leadId: lead.id,
      tipo: 'atribuido',
      texto: `Atribuído a ${alvo.nome}.`,
      dados: { de: lead.agenteId, para: alvo.id },
      ...autor(ctx),
      em: agora,
    })
    await avisarAtribuicao(ctx, lead, alvo, agora)
  } else {
    await registrarEventoLead(db, {
      leadId: lead.id,
      tipo: 'devolvido_pool',
      texto: 'Lead liberado: voltou para Disponíveis.',
      dados: { motivo: 'manual', agenteAnteriorId: lead.agenteId },
      ...autor(ctx),
      em: agora,
    })
  }
  return recarregar(ctx, lead.id, agora)
}

/**
 * `POST /leads/:id/reivindicar` — claim atômico: `UPDATE … WHERE agente_id IS NULL`. Quem
 * perde a corrida (0 linhas) recebe `409 VENDAS_LEAD_JA_REIVINDICADO`. Balcão e master sem
 * perfil de agente não reivindicam.
 */
export async function reivindicar(ctx: VendasCtx, id: string, agora: Date = new Date()): Promise<VendasLead> {
  exigeFunil(ctx)
  if (!ctx.agente) throw semPermissao('Só quem tem perfil de vendedor atende leads. Use “Passar para outra pessoa” para escolher o responsável.')
  if (!UUID.test(id)) throw AppError.notFound('Lead')
  const [reivindicado] = await db
    .update(vendasLeads)
    .set({ agenteId: ctx.agente.id, reivindicadoEm: agora, poolDesde: null, updatedAt: agora })
    .where(and(eq(vendasLeads.id, id), isNull(vendasLeads.agenteId), notInArray(vendasLeads.etapa, ETAPAS_FECHADAS), whereEscopo(vendasLeads, ctx)))
    .returning({ id: vendasLeads.id })
  if (!reivindicado) {
    const [existe] = await db
      .select({ id: vendasLeads.id })
      .from(vendasLeads)
      .where(and(eq(vendasLeads.id, id), whereEscopo(vendasLeads, ctx)))
      .limit(1)
    if (!existe) throw AppError.notFound('Lead')
    throw new AppError(ERROR_CODES.VENDAS_LEAD_JA_REIVINDICADO, 'Outra pessoa já atendeu este lead.')
  }
  await registrarEventoLead(db, {
    leadId: id,
    tipo: 'reivindicado',
    texto: `${ctx.agente.nome} passou a atender este lead.`,
    dados: { agenteId: ctx.agente.id },
    ...autor(ctx),
    em: agora,
  })
  return recarregar(ctx, id, agora)
}

// ---------------------------------------------------------------------------
// Mensagem pronta
// ---------------------------------------------------------------------------

/** Telefone BR em dígitos (DDD + número) → `55…`; fora do padrão → `null`. */
export function telefoneParaWhatsapp(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return digitos
  return null
}

/** Link público que o modelo usa em `{{link}}`: adesão do clube (tenant) ou contratação (platform), com o código do agente. */
function linkDaMensagem(ctx: VendasCtx, lead: Pick<VendasLeadRow, 'id' | 'interessePlanoId'>): string {
  const codigo = ctx.agente?.codigoIndicacao
  if (ctx.scope === 'tenant' && ctx.tenantSlug) {
    const params = new URLSearchParams()
    if (lead.interessePlanoId) params.set('plano', lead.interessePlanoId)
    if (codigo) params.set('ref', codigo)
    params.set('lead', lead.id)
    return `${webBaseUrl}/${ctx.tenantSlug}/assinar?${params.toString()}`
  }
  return `${webBaseUrl}/contratar${codigo ? `?ref=${encodeURIComponent(codigo)}` : ''}`
}

/** Troca "(n)o/do plano {{plano}}" por "(n)os/dos nossos planos" quando o lead não tem plano de interesse. */
function semPlanoNoTexto(texto: string): string {
  return texto
    .replace(/\bno plano\s*\{\{\s*plano\s*\}\}/gi, 'nos nossos planos')
    .replace(/\bdo plano\s*\{\{\s*plano\s*\}\}/gi, 'dos nossos planos')
    .replace(/\bo plano\s*\{\{\s*plano\s*\}\}/gi, 'os nossos planos')
    .replace(/\bplano\s*\{\{\s*plano\s*\}\}/gi, 'nossos planos')
}

/** `GET /leads/:id/mensagem?modelo=` — modelo de `vendas_config.modelos_mensagem` com placeholders preenchidos. */
export async function mensagem(ctx: VendasCtx, id: string, modeloId: string): Promise<MensagemLeadResponse> {
  const { lead } = await carregarLead(ctx, id)
  const config = await getOrCreateConfig(ctx.scope, ctx.tenantId)
  const modelo = config.modelosMensagem.find(m => m.id === modeloId)
  if (!modelo) throw AppError.notFound('Modelo de mensagem')
  const planos = await nomesDePlanos(ctx, lead.interessePlanoId ? [lead.interessePlanoId] : [])
  const valores: Record<string, string> = {
    nome: lead.nome,
    plano: (lead.interessePlanoId ? planos.get(lead.interessePlanoId) : null) ?? 'nossos planos',
    vendedor: ctx.agente?.nome ?? ctx.userName,
    link: linkDaMensagem(ctx, lead),
  }
  // Sem plano de interesse, "no plano {{plano}}" viraria "no plano nossos planos": ajusta a frase inteira.
  const base = lead.interessePlanoId ? modelo.texto : semPlanoNoTexto(modelo.texto)
  const texto = base.replace(/\{\{\s*(nome|plano|vendedor|link)\s*\}\}/g, (_, chave: string) => valores[chave] ?? '')
  const telefone = modelo.canal === 'whatsapp' ? telefoneParaWhatsapp(lead.telefone) : null
  return {
    modeloId: modelo.id,
    canal: modelo.canal,
    texto,
    linkWhatsapp: telefone ? `https://wa.me/${telefone}?text=${encodeURIComponent(texto)}` : null,
  }
}

// ---------------------------------------------------------------------------
// Carteira
// ---------------------------------------------------------------------------

export type SituacaoCarteira = 'ativa' | 'atrasada' | 'cancelada' | 'pendente'

export interface ItemCarteira {
  lead: VendasLead
  situacao: SituacaoCarteira
  /** Frase pronta ("Ativa · vence em 12 dias", "Atrasada", "Cancelada"). */
  resumo: string
  /** Tenant: assinatura do associado. */
  assinatura: {
    id: string
    status: string
    planoNome: string
    valorMensal: number
    proximoVencimento: string | null
  } | null
  /** Platform: proposta e clube resultante. */
  clube: { propostaId: string; propostaStatus: string; organizacaoId: string | null; nome: string | null; planoNome: string | null } | null
}

export interface Carteira {
  items: ItemCarteira[]
  total: number
  /** Contagem por situação (chips do topo), antes do filtro `situacao`. */
  totais: Record<SituacaoCarteira, number>
}

const diaDeSaoPaulo = (d: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)

function diasAte(data: string | null, agora: Date): number | null {
  if (!data) return null
  // Diferença em dias de calendário de Brasília (determinística, independe da hora do dia).
  const hoje = diaDeSaoPaulo(agora)
  return Math.round((Date.parse(`${data}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000)
}

function situacaoDaAssinatura(status: string): SituacaoCarteira {
  if (status === 'active') return 'ativa'
  if (status === 'past_due' || status === 'suspended') return 'atrasada'
  if (status === 'canceled') return 'cancelada'
  return 'pendente'
}

function resumoDaAssinatura(status: string, proximoVencimento: string | null, agora: Date): string {
  if (status === 'active') {
    const dias = diasAte(proximoVencimento, agora)
    if (dias === null) return 'Ativa'
    if (dias < 0) return 'Ativa · vencimento já passou'
    if (dias === 0) return 'Ativa · vence hoje'
    return `Ativa · vence em ${dias} dia${dias === 1 ? '' : 's'}`
  }
  if (status === 'past_due') return 'Atrasada'
  if (status === 'suspended') return 'Suspensa por atraso'
  if (status === 'canceled') return 'Cancelada'
  return 'Aguardando pagamento'
}

/** `GET /carteira` — leads `ganho` visíveis com o estado da assinatura (tenant) ou do clube (platform). */
export async function carteira(ctx: VendasCtx, query: CarteiraQuery, agora: Date = new Date()): Promise<Carteira> {
  exigeFunil(ctx)
  const visivel = await condicaoLeadsVisiveis(ctx)
  const vazio: Carteira = { items: [], total: 0, totais: { ativa: 0, atrasada: 0, cancelada: 0, pendente: 0 } }
  if (!visivel) return vazio
  const busca = query.q
  const filtros: SQL[] = [visivel, eq(vendasLeads.etapa, 'ganho')]
  if (busca) filtros.push(condicaoBusca(busca))
  const leads = await db
    .select()
    .from(vendasLeads)
    .where(and(...filtros))
    .orderBy(desc(vendasLeads.ganhoEm))
    .limit(1000)
  if (leads.length === 0) return vazio
  const apresentados = await apresentarLeads(ctx, leads, agora)
  const porId = new Map(apresentados.map(item => [item.id, item]))
  const itens: ItemCarteira[] = []

  if (ctx.scope === 'tenant') {
    const subs = await db
      .select()
      .from(clubSubscriptions)
      .where(and(inArray(clubSubscriptions.vendasLeadId, leads.map(l => l.id)), eq(clubSubscriptions.organizationId, ctx.tenantId!)))
      .orderBy(desc(clubSubscriptions.createdAt))
    const ultima = new Map<string, (typeof subs)[number]>()
    for (const sub of subs) if (sub.vendasLeadId && !ultima.has(sub.vendasLeadId)) ultima.set(sub.vendasLeadId, sub)
    for (const lead of leads) {
      const sub = ultima.get(lead.id) ?? null
      const status = sub?.status ?? 'pending_payment'
      itens.push({
        lead: porId.get(lead.id)!,
        situacao: sub ? situacaoDaAssinatura(status) : 'pendente',
        resumo: sub ? resumoDaAssinatura(status, sub.nextDueDate ?? null, agora) : 'Sem assinatura vinculada',
        assinatura: sub
          ? { id: sub.id, status, planoNome: sub.planName, valorMensal: Number(sub.amount), proximoVencimento: sub.nextDueDate ?? null }
          : null,
        clube: null,
      })
    }
  } else {
    const propostaIds = leads.flatMap(l => (l.conversao?.tipo === 'proposta' ? [l.conversao.id] : []))
    const propostas = propostaIds.length
      ? await db.select().from(platformOnboardingProposals).where(inArray(platformOnboardingProposals.id, propostaIds))
      : []
    const porProposta = new Map(propostas.map(p => [p.id, p]))
    const orgIds = [...new Set(propostas.flatMap(p => (p.organizationId ? [p.organizationId] : [])))]
    const orgs = orgIds.length ? await db.select({ id: organization.id, nome: organization.name }).from(organization).where(inArray(organization.id, orgIds)) : []
    const nomeOrg = new Map(orgs.map(o => [o.id, o.nome]))
    const planoIds = [...new Set(propostas.flatMap(p => (p.planId ? [p.planId] : [])))]
    const planos = await nomesDePlanos(ctx, planoIds)
    for (const lead of leads) {
      const proposta = lead.conversao?.tipo === 'proposta' ? (porProposta.get(lead.conversao.id) ?? null) : null
      const status = proposta?.status ?? lead.conversao?.status ?? null
      const situacao: SituacaoCarteira =
        status === 'active' ? 'ativa' : status === 'canceled' || status === 'rejected' ? 'cancelada' : 'pendente'
      itens.push({
        lead: porId.get(lead.id)!,
        situacao,
        resumo:
          situacao === 'ativa' ? 'Clube ativo' : situacao === 'cancelada' ? 'Contratação cancelada' : status ? 'Contratação em andamento' : 'Sem proposta vinculada',
        assinatura: null,
        clube: proposta
          ? {
              propostaId: proposta.id,
              propostaStatus: proposta.status,
              organizacaoId: proposta.organizationId ?? null,
              nome: proposta.organizationId ? (nomeOrg.get(proposta.organizationId) ?? null) : null,
              planoNome: proposta.planId ? (planos.get(proposta.planId) ?? null) : null,
            }
          : null,
      })
    }
  }

  const totais: Record<SituacaoCarteira, number> = { ativa: 0, atrasada: 0, cancelada: 0, pendente: 0 }
  for (const item of itens) totais[item.situacao] += 1
  const filtrados = query.situacao ? itens.filter(item => item.situacao === query.situacao) : itens
  const inicio = (query.page - 1) * query.perPage
  return { items: filtrados.slice(inicio, inicio + query.perPage), total: filtrados.length, totais }
}

/** Rótulo da origem para textos (notificações, eventos). */
export function rotuloOrigem(origem: keyof typeof ORIGEM_LEAD_LABELS): string {
  return ORIGEM_LEAD_LABELS[origem]
}

export { carregarLead, carregarEditavel, apresentarLeads, nomesDePlanos, refInquilino }
