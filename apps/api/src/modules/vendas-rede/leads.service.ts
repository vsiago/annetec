import {
  ERROR_CODES,
  ORIGEM_LEAD_LABELS,
  type CarteiraQuery,
  type CreateEventoLeadInput,
  type CreateVendasLeadInput,
  type EstacaoLead,
  type ListLeadsQuery,
  type MensagemLeadResponse,
  type MudarEtapaLeadInput,
  type ProximoPassoInput,
  type TipoEventoLead,
  type UpdateVendasLeadInput,
  type VendasLead,
  type VendasLeadEvento,
} from '@annetec/contracts'
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, notInArray, or, sql, type SQL } from 'drizzle-orm'
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
  deveVoltarAoPool,
  jornadaDoLead,
  podeEditarLead,
  podeReatribuir,
  podeVerLead,
  proximoPassoDoLead,
  transicaoPermitida,
  type AgenteRef,
  type ContextoVisibilidade,
  type EtapaLead,
} from './rules'

/**
 * Leads da Rede Comercial (`docs/rede-comercial.md`, 4.2 "Leads").
 *
 * Visibilidade (uma regra, em todo o serviço): lead visível = dono em
 * `whereAgentesVisiveis` OU (sem dono E papel ≠ balcão). O master vê tudo do
 * escopo. Lead invisível = 404 (não revela que existe). Editar exige ser o dono
 * ou estar acima dele na cadeia (`podeEditarLead`); lead no pool só o master edita
 * (os demais reivindicam antes).
 */

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

const ETAPAS_ABERTAS: EtapaLead[] = ['novo', 'em_contato', 'proposta', 'negociacao']
const ETAPAS_FECHADAS: EtapaLead[] = ['ganho', 'perdido']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// Apoio: permissões e carga
// ---------------------------------------------------------------------------

export function semPermissao(mensagem = 'Seu papel na rede não permite esta operação.'): AppError {
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

/** Balcão não enxerga pool nem funil: só os atendimentos dele. */
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
        ? 'Este lead está no pool: assuma o atendimento antes de alterá-lo.'
        : 'Este lead pertence a outro vendedor: você só pode consultá-lo.',
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

/** Linha do banco → contrato `VendasLead` (com jornada e próximo passo; `eventos` só no detalhe). */
export function toVendasLead(
  row: VendasLeadRow,
  extras: { agenteNome: string | null; planoNome: string | null; agora: Date; eventos?: VendasLeadEvento[] },
): VendasLead {
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
  }
}

async function apresentarLeads(ctx: VendasCtx, rows: VendasLeadRow[], agora: Date): Promise<VendasLead[]> {
  const [agentes, planos] = await Promise.all([
    nomesDeAgentes(rows.flatMap(row => (row.agenteId ? [row.agenteId] : []))),
    nomesDePlanos(ctx, rows.flatMap(row => (row.interessePlanoId ? [row.interessePlanoId] : []))),
  ])
  return rows.map(row =>
    toVendasLead(row, {
      agenteNome: row.agenteId ? (agentes.get(row.agenteId) ?? null) : null,
      planoNome: row.interessePlanoId ? (planos.get(row.interessePlanoId) ?? null) : null,
      agora,
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
      texto: `Voltou ao pool: sem contato em ${config.poolRetornoHoras} h.`,
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
  if (!agente.ativo) throw AppError.businessRule('Este agente está inativo e não pode receber leads.')
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
      if (ctx.papel !== 'master') throw semPermissao('Só o master cria um lead direto no pool.')
      dono = null
    } else if (input.agenteId !== ctx.agente?.id) {
      const alvo = await agenteDoEscopo(ctx, input.agenteId)
      if (!podeReatribuir(contextoRegras(ctx), null, refDeAgente(alvo))) {
        throw semPermissao('Você só pode criar leads para agentes da sua equipe ou corretora.')
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
    throw new AppError(ERROR_CODES.VENDAS_TRANSICAO_INVALIDA, `Não é possível mover o lead de "${de}" para "${para}".`)
  }
  if (para === 'perdido' && !input.motivoPerda?.trim()) {
    throw AppError.validation([{ path: 'motivoPerda', message: 'Informe o motivo da perda' }])
  }
  const confirmado = para === 'ganho' && !lead.conversao
  if (confirmado && !input.confirmar) {
    throw AppError.businessRule(
      'O fechamento acontece pela proposta ou pela assinatura. Para marcar como ganho manualmente, confirme o fechamento.',
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
  if (!atualizado) throw AppError.conflict('O lead mudou de etapa enquanto você editava. Atualize a tela e tente de novo.')

  await registrarEventoLead(db, {
    leadId: lead.id,
    tipo: 'etapa',
    texto: para === 'perdido' ? `Etapa: ${de} → ${para}. Motivo: ${input.motivoPerda!.trim()}` : `Etapa: ${de} → ${para}.`,
    dados: { de, para, ...(para === 'perdido' ? { motivoPerda: input.motivoPerda!.trim() } : {}), ...(confirmado ? { confirmado: true } : {}) },
    ...autor(ctx),
    em: agora,
  })
  return recarregar(ctx, lead.id, agora)
}

/**
 * `POST /leads/:id/eventos`. Evento de contato atualiza `ultimo_contato_em`; lead `novo`
 * com contato vai sozinho para `em_contato` (com evento `etapa` automático).
 */
export async function registrarEvento(
  ctx: VendasCtx,
  id: string,
  input: CreateEventoLeadInput,
  agora: Date = new Date(),
): Promise<VendasLeadEvento> {
  const { lead } = await carregarEditavel(ctx, id)
  const contato = EVENTOS_DE_CONTATO.includes(input.tipo)
  const evento = await registrarEventoLead(db, {
    leadId: lead.id,
    tipo: input.tipo,
    texto: input.texto,
    dados: input.dados ?? null,
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
        texto: 'Etapa: novo → em_contato (primeiro contato registrado).',
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
    throw semPermissao('Você não pode reatribuir este lead para este destino.')
  }
  if ((lead.agenteId ?? null) === (alvo?.id ?? null)) return recarregar(ctx, lead.id, agora)
  if (ETAPAS_FECHADAS.includes(lead.etapa) && !alvo) throw AppError.businessRule('Lead encerrado não volta ao pool.')

  const donoAtual = lead.agenteId ? eq(vendasLeads.agenteId, lead.agenteId) : isNull(vendasLeads.agenteId)
  const [atualizado] = await db
    .update(vendasLeads)
    .set(
      alvo
        ? { agenteId: alvo.id, reivindicadoEm: agora, poolDesde: null, updatedAt: agora }
        : { agenteId: null, reivindicadoEm: null, poolDesde: agora, updatedAt: agora },
    )
    .where(and(eq(vendasLeads.id, lead.id), donoAtual, whereEscopo(vendasLeads, ctx)))
    .returning({ id: vendasLeads.id })
  if (!atualizado) throw AppError.conflict('O lead mudou de dono enquanto você editava. Atualize a tela e tente de novo.')

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
      texto: 'Devolvido ao pool.',
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
  if (!ctx.agente) throw semPermissao('Só quem tem perfil de agente assume leads. Use "Atribuir" para escolher o responsável.')
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
    throw new AppError(ERROR_CODES.VENDAS_LEAD_JA_REIVINDICADO, 'Outra pessoa já assumiu este lead.')
  }
  await registrarEventoLead(db, {
    leadId: id,
    tipo: 'reivindicado',
    texto: `${ctx.agente.nome} assumiu o atendimento.`,
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

/** `GET /leads/:id/mensagem?modelo=` — modelo de `vendas_config.modelos_mensagem` com placeholders preenchidos. */
export async function mensagem(ctx: VendasCtx, id: string, modeloId: string): Promise<MensagemLeadResponse> {
  const { lead } = await carregarLead(ctx, id)
  const config = await getOrCreateConfig(ctx.scope, ctx.tenantId)
  const modelo = config.modelosMensagem.find(m => m.id === modeloId)
  if (!modelo) throw AppError.notFound('Modelo de mensagem')
  const planos = await nomesDePlanos(ctx, lead.interessePlanoId ? [lead.interessePlanoId] : [])
  const valores: Record<string, string> = {
    nome: lead.nome,
    plano: (lead.interessePlanoId ? planos.get(lead.interessePlanoId) : null) ?? 'um dos nossos planos',
    vendedor: ctx.agente?.nome ?? ctx.userName,
    link: linkDaMensagem(ctx, lead),
  }
  const texto = modelo.texto.replace(/\{\{\s*(nome|plano|vendedor|link)\s*\}\}/g, (_, chave: string) => valores[chave] ?? '')
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
