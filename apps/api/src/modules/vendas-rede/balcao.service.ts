import {
  ERROR_CODES,
  RESULTADO_BALCAO_LABELS,
  type AtendimentoBalcaoInput,
  type CheckoutResult,
  type ListAtendimentosBalcaoQuery,
  type PessoaBalcaoQuery,
  type SimulacaoBalcao,
  type VendasAtendimentoBalcao,
  type VendasBalcaoHoje,
  type VendasLead,
  type VendasPessoaBalcao,
  type VendasPlanoBalcao,
} from '@annetec/contracts'
import { and, desc, eq, gte, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  clubPlans,
  clubSubscriptions,
  vendasAgentes,
  vendasAtendimentosBalcao,
  vendasLeads,
  vendasUnidades,
  type VendasAgenteRow,
  type VendasAtendimentoBalcaoRow,
  type VendasLeadRow,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import type { ResolvedTenant } from '@/http/types'
import { getOrCreateConfig } from './config.service'
import type { VendasCtx } from './context'
import { assinar } from './conversao.service'
import { atualizar, criar, obter, registrarEventoLead, toVendasLead } from './leads.service'
import { ROTULO_ETAPA, simularEconomiaBalcao, transicaoPermitida, type EtapaLead } from './rules'

/**
 * Balcão (`docs/rede-comercial.md`, 4.2 "Balcão"). Só escopo tenant; papel `balcao` ou master
 * (a rota barra os demais). Tudo filtrado por `tenant_id`; o balcão só vê os próprios atendimentos,
 * o master vê todos do clube. O lead do balcão é privado do atendente, mas a busca por pessoa
 * enxerga o lead aberto de qualquer dono para não duplicar cadastro.
 */

const DIAS_UTEIS_MES = 22
const DIAS_PARA_RETOMAR = 2
const FUSO_BR = '-03:00'
const ID_NULO = '00000000-0000-0000-0000-000000000000'

function exigeTenant(ctx: VendasCtx): string {
  if (ctx.scope !== 'tenant' || !ctx.tenantId) throw AppError.notFound('Rota')
  return ctx.tenantId
}

function exigeAgente(ctx: VendasCtx) {
  if (!ctx.agente) {
    throw new AppError(
      ERROR_CODES.VENDAS_SEM_PERFIL,
      'Para registrar atendimentos é preciso ter perfil de atendente. Peça ao administrador para cadastrar você.',
    )
  }
  return ctx.agente
}

const somenteDigitos = (valor: string | null | undefined): string => (valor ?? '').replace(/\D/g, '')
const arredondar = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100
const numero = (valor: string | number | null | undefined): number => Number(valor ?? 0)

/** `yyyy-MM-dd` em America/Sao_Paulo. */
export function diaDeSaoPaulo(data: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data)
}

/** Intervalo `[início, fim)` UTC do dia de São Paulo (sem horário de verão desde 2019). */
export function intervaloDoDia(dia: string): { inicio: Date; fim: Date } {
  const inicio = new Date(`${dia}T00:00:00${FUSO_BR}`)
  return { inicio, fim: new Date(inicio.getTime() + 86_400_000) }
}

// ---------------------------------------------------------------------------
// Planos e simulação
// ---------------------------------------------------------------------------

type PlanoRow = typeof clubPlans.$inferSelect

async function planosAtivos(tenantId: string, planoId?: string): Promise<PlanoRow[]> {
  const rows = await db
    .select()
    .from(clubPlans)
    .where(and(eq(clubPlans.organizationId, tenantId), eq(clubPlans.status, 'active')))
  const lista = planoId ? rows.filter(p => p.id === planoId) : rows
  return lista.sort((a, b) => {
    if (a.highlight !== b.highlight) return a.highlight ? -1 : 1
    const ordem = (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
    return ordem !== 0 ? ordem : numero(a.priceMonthly) - numero(b.priceMonthly)
  })
}

function adesaoDoPlano(plano: PlanoRow): number {
  return plano.enrollmentFeeWaived ? 0 : numero(plano.enrollmentFee)
}

function descontoDoPlano(plano: PlanoRow, padrao: number): number {
  return plano.balcaoDescontoPercentual ?? padrao
}

function resumoDoPlano(plano: PlanoRow): string[] {
  const coberturas = (plano.coverages ?? []).map(c => c.title).filter(Boolean)
  const base = coberturas.length > 0 ? coberturas : (plano.features ?? [])
  return base.slice(0, 4)
}

export async function listarPlanos(ctx: VendasCtx): Promise<VendasPlanoBalcao[]> {
  const tenantId = exigeTenant(ctx)
  const [config, planos] = await Promise.all([getOrCreateConfig('tenant', tenantId), planosAtivos(tenantId)])
  return planos.map(plano => ({
    id: plano.id,
    nome: plano.name,
    precoMensal: numero(plano.priceMonthly),
    adesao: adesaoDoPlano(plano),
    descontoPercentual: descontoDoPlano(plano, config.balcaoDescontoPadrao),
    destaque: plano.highlight,
    resumo: resumoDoPlano(plano),
    vendavel: plano.status === 'active',
  }))
}

export async function simular(ctx: VendasCtx, input: { valorTabela: number; planoId?: string }): Promise<SimulacaoBalcao[]> {
  const tenantId = exigeTenant(ctx)
  const config = await getOrCreateConfig('tenant', tenantId)
  const planos = await planosAtivos(tenantId, input.planoId)
  if (input.planoId && planos.length === 0) throw AppError.notFound('Plano')
  return planos.map(plano => {
    const descontoPercentual = descontoDoPlano(plano, config.balcaoDescontoPadrao)
    const precoMensal = numero(plano.priceMonthly)
    const adesao = adesaoDoPlano(plano)
    const r = simularEconomiaBalcao({ valorTabela: input.valorTabela, descontoPercentual, precoMensal, adesao })
    return {
      planoId: plano.id,
      planoNome: plano.name,
      descontoPercentual,
      precoMensal,
      adesao,
      valorComPlano: r.valorComPlano,
      economiaNaConsulta: r.economiaNaConsulta,
      economiaAnual12: r.economiaAnual12,
      consultasParaCompensar: r.consultasParaCompensar,
    }
  })
}

// ---------------------------------------------------------------------------
// Apresentação
// ---------------------------------------------------------------------------

async function apresentarAtendimentos(rows: VendasAtendimentoBalcaoRow[]): Promise<VendasAtendimentoBalcao[]> {
  const ids = [...new Set(rows.map(r => r.agenteId))]
  const nomes = new Map<string, string>()
  if (ids.length > 0) {
    const agentes = await db.select({ id: vendasAgentes.id, nome: vendasAgentes.nome }).from(vendasAgentes).where(inArray(vendasAgentes.id, ids))
    for (const a of agentes) nomes.set(a.id, a.nome)
  }
  return rows.map(r => ({
    id: r.id,
    agenteId: r.agenteId,
    agenteNome: nomes.get(r.agenteId) ?? null,
    unidadeId: r.unidadeId ?? null,
    leadId: r.leadId ?? null,
    nome: r.nome,
    documento: r.documento ?? null,
    telefone: r.telefone ?? null,
    servico: r.servico,
    valorTabela: numero(r.valorTabela),
    descontoPercentual: r.descontoPercentual,
    valorComPlano: numero(r.valorComPlano),
    planoId: r.planoId ?? null,
    resultado: r.resultado,
    resultadoLabel: RESULTADO_BALCAO_LABELS[r.resultado],
    observacoes: r.observacoes ?? null,
    assinaturaId: r.assinaturaId ?? null,
    createdAt: r.createdAt.toISOString(),
  }))
}

function condicaoAtendimentos(
  ctx: VendasCtx,
  tenantId: string,
  extra: { agenteId?: string | null; inicio?: Date; fim?: Date; resultado?: VendasAtendimentoBalcaoRow['resultado'] },
): SQL {
  const partes: SQL[] = [eq(vendasAtendimentosBalcao.tenantId, tenantId)]
  // O balcão só enxerga os próprios; o master vê o clube todo (e pode filtrar por atendente).
  if (ctx.papel !== 'master') partes.push(eq(vendasAtendimentosBalcao.agenteId, ctx.agente?.id ?? ID_NULO))
  else if (extra.agenteId) partes.push(eq(vendasAtendimentosBalcao.agenteId, extra.agenteId))
  if (extra.inicio) partes.push(gte(vendasAtendimentosBalcao.createdAt, extra.inicio))
  if (extra.fim) partes.push(lt(vendasAtendimentosBalcao.createdAt, extra.fim))
  if (extra.resultado) partes.push(eq(vendasAtendimentosBalcao.resultado, extra.resultado))
  return and(...partes)!
}

// ---------------------------------------------------------------------------
// Hoje e histórico
// ---------------------------------------------------------------------------

export async function hoje(ctx: VendasCtx, agora: Date = new Date()): Promise<VendasBalcaoHoje> {
  const tenantId = exigeTenant(ctx)
  const dia = diaDeSaoPaulo(agora)
  const { inicio, fim } = intervaloDoDia(dia)
  const rows = await db
    .select()
    .from(vendasAtendimentosBalcao)
    .where(condicaoAtendimentos(ctx, tenantId, { inicio, fim }))
    .orderBy(desc(vendasAtendimentosBalcao.createdAt))

  const ofertas = rows.filter(r => r.planoId)
  const economias = ofertas.map(r => numero(r.valorTabela) - numero(r.valorComPlano))
  const economiaMedia = economias.length > 0 ? arredondar(economias.reduce((a, b) => a + b, 0) / economias.length) : 0

  let agente: VendasBalcaoHoje['agente'] = null
  if (ctx.agente) {
    let unidade: { id: string; nome: string; tipo: string } | null = null
    if (ctx.agente.unidadeId) {
      const [u] = await db.select().from(vendasUnidades).where(eq(vendasUnidades.id, ctx.agente.unidadeId)).limit(1)
      if (u) unidade = { id: u.id, nome: u.nome, tipo: u.tipo }
    }
    agente = { id: ctx.agente.id, nome: ctx.agente.nome, unidade }
  }

  return {
    dia,
    agente,
    atendimentos: await apresentarAtendimentos(rows),
    totais: {
      atendimentos: rows.length,
      ofertas: ofertas.length,
      adesoes: rows.filter(r => r.resultado === 'assinou').length,
      vaiPensar: rows.filter(r => r.resultado === 'vai_pensar').length,
      economiaMedia,
      ticketMedioEconomia: economiaMedia,
    },
    metaDia: ctx.agente?.metaMensal ? Number((ctx.agente.metaMensal / DIAS_UTEIS_MES).toFixed(1)) : null,
  }
}

export async function listarAtendimentos(
  ctx: VendasCtx,
  query: ListAtendimentosBalcaoQuery,
): Promise<{ items: VendasAtendimentoBalcao[]; total: number }> {
  const tenantId = exigeTenant(ctx)
  const intervalo = query.dia ? intervaloDoDia(query.dia) : {}
  const where = condicaoAtendimentos(ctx, tenantId, { ...intervalo, resultado: query.resultado, agenteId: query.agente })
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(vendasAtendimentosBalcao)
      .where(where)
      .orderBy(desc(vendasAtendimentosBalcao.createdAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ total: sql<number>`count(*)::int` }).from(vendasAtendimentosBalcao).where(where),
  ])
  return { items: await apresentarAtendimentos(rows), total: Number(totalRow?.total ?? 0) }
}

// ---------------------------------------------------------------------------
// Pessoa
// ---------------------------------------------------------------------------

const ETAPAS_ABERTAS = ['novo', 'em_contato', 'proposta', 'negociacao'] as const
const LIMITE_BUSCA = 20

/**
 * Lead aberto (qualquer dono) do clube com o mesmo CPF ou celular. Filtro em SQL com `limit`:
 * `documento` e `telefone` são gravados só com dígitos (contrato `numeroDocumento`/`telefone` e
 * `somenteDigitos` aqui), então a igualdade direta usa os índices. CPF tem prioridade sobre o celular.
 */
async function acharLeadAberto(tenantId: string, documento: string, telefone: string): Promise<VendasLeadRow | null> {
  if (!documento && !telefone) return null
  const rows = await db
    .select()
    .from(vendasLeads)
    .where(
      and(
        eq(vendasLeads.scope, 'tenant'),
        eq(vendasLeads.tenantId, tenantId),
        inArray(vendasLeads.etapa, [...ETAPAS_ABERTAS]),
        or(documento ? eq(vendasLeads.documento, documento) : undefined, telefone ? eq(vendasLeads.telefone, telefone) : undefined),
      ),
    )
    .orderBy(desc(vendasLeads.createdAt))
    .limit(LIMITE_BUSCA)
  return (
    (documento ? rows.find(l => l.documento === documento) : undefined) ??
    (telefone ? rows.find(l => l.telefone === telefone) : undefined) ??
    null
  )
}

/** Lead do próprio atendente (ou qualquer um, para o master, que enxerga todo o funil do clube). */
function leadEhDoAtendente(ctx: VendasCtx, lead: Pick<VendasLeadRow, 'agenteId'>): boolean {
  return ctx.papel === 'master' || (lead.agenteId !== null && lead.agenteId === ctx.agente?.id)
}

async function apresentarLeadProprio(row: VendasLeadRow, agora: Date): Promise<VendasLead> {
  let agenteNome: string | null = null
  if (row.agenteId) {
    const [a] = await db.select({ nome: vendasAgentes.nome }).from(vendasAgentes).where(eq(vendasAgentes.id, row.agenteId)).limit(1)
    agenteNome = a?.nome ?? null
  }
  return toVendasLead(row, { agenteNome, planoNome: null, agora })
}

/**
 * Busca por CPF ou celular, devolvendo o MÍNIMO (um atendente de clínica parceira não pode virar
 * oráculo de dados do clube):
 *  - associado: só `jaAssociado` e `{ status, planoNome }`; o nome só quando a busca foi pelo CPF
 *    do próprio titular (celular pode ser de um familiar);
 *  - lead aberto de OUTRO atendente: só `leadAberto: { existe, etapa, proprio: false }` (sem nome,
 *    observações, atribuição ou conversão);
 *  - lead do próprio atendente: o lead completo, que a tela usa para pré-preencher.
 */
export async function buscarPessoa(ctx: VendasCtx, query: PessoaBalcaoQuery, agora: Date = new Date()): Promise<VendasPessoaBalcao> {
  const tenantId = exigeTenant(ctx)
  const documento = somenteDigitos(query.documento)
  const telefone = somenteDigitos(query.telefone)
  if (!documento && !telefone) return { jaAssociado: false, assinatura: null, lead: null, leadAberto: null, nome: null }

  const encontradas = await db
    .select({
      status: clubSubscriptions.status,
      planName: clubSubscriptions.planName,
      holderName: clubSubscriptions.holderName,
      holderCpf: clubSubscriptions.holderCpf,
    })
    .from(clubSubscriptions)
    .where(
      and(
        eq(clubSubscriptions.organizationId, tenantId),
        ne(clubSubscriptions.status, 'canceled'),
        or(documento ? eq(clubSubscriptions.holderCpf, documento) : undefined, telefone ? eq(clubSubscriptions.holderPhone, telefone) : undefined),
      ),
    )
    .limit(LIMITE_BUSCA)
  const assinatura = encontradas.find(s => s.status === 'active' || s.status === 'past_due') ?? encontradas[0] ?? null
  const leadRow = await acharLeadAberto(tenantId, documento, telefone)
  const proprio = leadRow ? leadEhDoAtendente(ctx, leadRow) : false

  return {
    jaAssociado: Boolean(assinatura && ['active', 'past_due', 'suspended'].includes(assinatura.status)),
    assinatura: assinatura ? { status: assinatura.status, planoNome: assinatura.planName } : null,
    lead: leadRow && proprio ? await apresentarLeadProprio(leadRow, agora) : null,
    leadAberto: leadRow ? { existe: true, etapa: leadRow.etapa, proprio } : null,
    nome: assinatura ? (documento && assinatura.holderCpf === documento ? assinatura.holderName : null) : proprio ? (leadRow?.nome ?? null) : null,
  }
}

// ---------------------------------------------------------------------------
// Atendimento
// ---------------------------------------------------------------------------

export interface AtendimentoRegistrado {
  atendimento: VendasAtendimentoBalcao
  lead: VendasLead | null
  checkout: CheckoutResult | null
}

type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>

/** Janela em que o mesmo atendimento repetido (duplo clique, reenvio) devolve o já gravado. */
const JANELA_IDEMPOTENCIA_MS = 60_000

function invalido(issues: { path: string; message: string }[], mensagem: string): AppError {
  return new AppError(ERROR_CODES.VENDAS_ATENDIMENTO_INVALIDO, mensagem, { issues })
}

function transicaoInvalida(de: string, para: string): AppError {
  return new AppError(ERROR_CODES.VENDAS_TRANSICAO_INVALIDA, `Este lead não pode ir de ${ROTULO_ETAPA[de as EtapaLead] ?? de} para ${ROTULO_ETAPA[para as EtapaLead] ?? para}.`)
}

/** Lead do balcão (dono = o atendente, etapa `novo`) + evento `criado`, no executor recebido. */
async function inserirLeadBalcao(
  executor: Executor,
  ctx: VendasCtx,
  agente: VendasAgenteRow,
  tenantId: string,
  dados: {
    nome: string
    documento: string | null
    email: string | null
    telefone: string | null
    planoId: string | null
    observacoes: string | null
    nascimento: string | null
  },
  agora: Date,
): Promise<VendasLeadRow> {
  const [row] = await executor
    .insert(vendasLeads)
    .values({
      scope: 'tenant',
      tenantId,
      tipo: 'pessoa',
      nome: dados.nome,
      documento: dados.documento,
      email: dados.email,
      telefone: dados.telefone,
      origem: 'balcao',
      interessePlanoId: dados.planoId,
      observacoes: dados.observacoes,
      etapa: 'novo',
      agenteId: agente.id,
      poolDesde: null,
      reivindicadoEm: null,
      dados: dados.nascimento ? { dataNascimento: dados.nascimento } : {},
      createdByUserId: ctx.userId,
    })
    .returning()
  if (!row) throw new Error('Falha ao criar o lead')
  await registrarEventoLead(executor, {
    leadId: row.id,
    tipo: 'criado',
    texto: `Lead cadastrado por ${agente.nome}.`,
    dados: { origem: row.origem },
    porUserId: ctx.userId,
    porAgenteId: agente.id,
    em: agora,
  })
  return row
}

/**
 * Contato no balcão: evento `atendimento_balcao` + `ultimo_contato_em` (+ `novo → em_contato` no lead
 * do próprio atendente). Devolve a etapa em que o lead ficou.
 */
async function registrarContatoBalcao(
  executor: Executor,
  ctx: VendasCtx,
  lead: VendasLeadRow,
  texto: string,
  dados: Record<string, unknown>,
  agora: Date,
): Promise<VendasLeadRow['etapa']> {
  const proprio = lead.agenteId !== null && lead.agenteId === ctx.agente?.id
  await registrarEventoLead(executor, {
    leadId: lead.id,
    tipo: 'atendimento_balcao',
    texto,
    dados,
    porUserId: ctx.userId,
    porAgenteId: ctx.agente?.id ?? null,
    em: agora,
  })
  const avanca = proprio && lead.etapa === 'novo'
  await executor
    .update(vendasLeads)
    .set({ ultimoContatoEm: agora, updatedAt: agora, ...(avanca ? { etapa: 'em_contato' as const } : {}) })
    .where(and(eq(vendasLeads.id, lead.id), eq(vendasLeads.tenantId, ctx.tenantId!)))
  if (avanca) {
    await registrarEventoLead(executor, {
      leadId: lead.id,
      tipo: 'etapa',
      texto: 'Etapa: Novo → Em contato (atendimento no balcão).',
      dados: { de: 'novo', para: 'em_contato', automatico: true },
      porUserId: ctx.userId,
      porAgenteId: ctx.agente?.id ?? null,
      em: agora,
    })
    return 'em_contato'
  }
  return lead.etapa
}

/** `vai_pensar`: próximo passo "retomar contato" (mesmo efeito de `POST /leads/:id/proximo-passo`). */
async function agendarRetomada(executor: Executor, ctx: VendasCtx, leadId: string, agora: Date): Promise<void> {
  const em = new Date(agora.getTime() + DIAS_PARA_RETOMAR * 86_400_000)
  const texto = 'Retomar contato do balcão'
  await executor
    .update(vendasLeads)
    .set({ proximoPasso: texto, proximoPassoEm: em, updatedAt: agora })
    .where(and(eq(vendasLeads.id, leadId), eq(vendasLeads.tenantId, ctx.tenantId!)))
  await registrarEventoLead(executor, {
    leadId,
    tipo: 'proximo_passo',
    texto,
    dados: { em: em.toISOString() },
    porUserId: ctx.userId,
    porAgenteId: ctx.agente?.id ?? null,
    em: agora,
  })
}

/** `recusou`: lead → `perdido` com compare-and-swap na etapa; se mudou no meio, 422 e a transação desfaz tudo. */
async function perderLead(
  executor: Executor,
  ctx: VendasCtx,
  leadId: string,
  de: VendasLeadRow['etapa'],
  motivo: string,
  agora: Date,
): Promise<void> {
  if (!transicaoPermitida(de, 'perdido', ctx.papel)) throw transicaoInvalida(de, 'perdido')
  const [atualizado] = await executor
    .update(vendasLeads)
    .set({ etapa: 'perdido', perdidoEm: agora, motivoPerda: motivo, ganhoEm: null, updatedAt: agora })
    .where(and(eq(vendasLeads.id, leadId), eq(vendasLeads.etapa, de), eq(vendasLeads.tenantId, ctx.tenantId!)))
    .returning({ id: vendasLeads.id })
  if (!atualizado) throw transicaoInvalida(de, 'perdido')
  await registrarEventoLead(executor, {
    leadId,
    tipo: 'etapa',
    texto: `Etapa: ${ROTULO_ETAPA[de as EtapaLead] ?? de} → Perdido. Motivo: ${motivo}`,
    dados: { de, para: 'perdido', motivoPerda: motivo },
    porUserId: ctx.userId,
    porAgenteId: ctx.agente?.id ?? null,
    em: agora,
  })
}

async function lerLead(id: string): Promise<VendasLeadRow> {
  const [row] = await db.select().from(vendasLeads).where(eq(vendasLeads.id, id)).limit(1)
  if (!row) throw AppError.notFound('Lead')
  return row
}

/** Atendimento igual (mesmo atendente, resultado e CPF/celular/lead) gravado há menos de 60 s. */
async function atendimentoRecente(
  executor: Executor,
  tenantId: string,
  agenteId: string,
  resultado: VendasAtendimentoBalcaoRow['resultado'],
  chaves: { documento: string; telefone: string; leadId: string | null },
  agora: Date,
): Promise<VendasAtendimentoBalcaoRow | null> {
  const identidade = chaves.documento
    ? [eq(vendasAtendimentosBalcao.documento, chaves.documento)]
    : [
        ...(chaves.telefone ? [eq(vendasAtendimentosBalcao.telefone, chaves.telefone)] : []),
        ...(chaves.leadId ? [eq(vendasAtendimentosBalcao.leadId, chaves.leadId)] : []),
      ]
  if (identidade.length === 0) return null
  const [row] = await executor
    .select()
    .from(vendasAtendimentosBalcao)
    .where(
      and(
        eq(vendasAtendimentosBalcao.tenantId, tenantId),
        eq(vendasAtendimentosBalcao.agenteId, agenteId),
        eq(vendasAtendimentosBalcao.resultado, resultado),
        gte(vendasAtendimentosBalcao.createdAt, new Date(agora.getTime() - JANELA_IDEMPOTENCIA_MS)),
        or(...identidade),
      ),
    )
    .orderBy(desc(vendasAtendimentosBalcao.createdAt))
    .limit(1)
  return row ?? null
}

/** Resposta do atendimento: o lead só volta quando é do próprio atendente (lead de outro dono não é exposto). */
async function montarResposta(
  ctx: VendasCtx,
  atendimento: VendasAtendimentoBalcaoRow,
  checkout: CheckoutResult | null,
  agora: Date,
): Promise<AtendimentoRegistrado> {
  let lead: VendasLead | null = null
  if (atendimento.leadId) {
    const row = await lerLead(atendimento.leadId)
    if (row.agenteId === atendimento.agenteId) lead = await obter(ctx, atendimento.leadId, agora)
  }
  const [apresentado] = await apresentarAtendimentos([atendimento])
  return { atendimento: apresentado!, lead, checkout }
}

/**
 * Registra o atendimento. Ordem:
 *  1. valida TUDO antes de gravar (campos, plano, transição de etapa do lead próprio);
 *  2. idempotência: mesmo atendente + resultado + CPF/celular/lead nos últimos 60 s devolve o atendimento
 *     já gravado (duplo clique em "Vai pensar" não cria dois registros);
 *  3. `vai_pensar`/`recusou`/`ja_associado`: lead + evento + próximo passo/perda + atendimento em UMA
 *     transação (erro no meio desfaz tudo);
 *  4. `assinou`: o lead e a assinatura nascem nos serviços de conversão (checkout externo, não cabe em
 *     transação); o atendimento e o evento do lead são gravados juntos em seguida.
 */
export async function registrarAtendimento(
  ctx: VendasCtx,
  tenant: ResolvedTenant,
  input: AtendimentoBalcaoInput,
  remoteIp?: string,
  agora: Date = new Date(),
): Promise<AtendimentoRegistrado> {
  const tenantId = exigeTenant(ctx)
  const agente = exigeAgente(ctx)
  const documento = somenteDigitos(input.documento)
  const telefone = somenteDigitos(input.telefone)
  const email = input.email?.trim() || null
  const nascimento = input.dataNascimento ?? null
  const planoId = input.planoId ?? null
  const { resultado } = input

  const existente = await acharLeadAberto(tenantId, documento, telefone)
  const dadosExistentes = (existente?.dados ?? {}) as Record<string, unknown>
  const proprio = existente !== null && existente.agenteId === agente.id

  // 1. Validação, antes de qualquer escrita.
  if (resultado === 'assinou') {
    const problemas: { path: string; message: string }[] = []
    if (!planoId) problemas.push({ path: 'planoId', message: 'Escolha o plano para registrar a adesão' })
    const cpf = documento || somenteDigitos(existente?.documento)
    if (cpf.length !== 11) problemas.push({ path: 'documento', message: 'Informe o CPF do titular' })
    if (!telefone && !existente?.telefone) problemas.push({ path: 'telefone', message: 'Informe o celular do titular' })
    if (!email && !existente?.email) problemas.push({ path: 'email', message: 'Informe o e-mail do titular' })
    if (!nascimento && typeof dadosExistentes.dataNascimento !== 'string') {
      problemas.push({ path: 'dataNascimento', message: 'Informe a data de nascimento do titular' })
    }
    if (problemas.length > 0) throw invalido(problemas, 'Faltam dados para registrar a adesão')
  }
  if (resultado === 'vai_pensar' && !telefone) {
    throw invalido([{ path: 'telefone', message: 'Informe o celular para anotar o retorno.' }], 'Informe o celular para anotar o retorno.')
  }
  // `recusou` perde o lead próprio: a etapa dele precisa permitir (ganho é final e só o master reabre).
  if (resultado === 'recusou' && existente && proprio && !transicaoPermitida(existente.etapa, 'perdido', ctx.papel)) {
    throw transicaoInvalida(existente.etapa, 'perdido')
  }

  // Plano e desconto.
  let descontoPercentual = 0
  if (planoId) {
    const [plano] = await db
      .select()
      .from(clubPlans)
      .where(and(eq(clubPlans.id, planoId), eq(clubPlans.organizationId, tenantId), eq(clubPlans.status, 'active')))
      .limit(1)
    if (!plano) throw AppError.notFound('Plano')
    const config = await getOrCreateConfig('tenant', tenantId)
    descontoPercentual = descontoDoPlano(plano, config.balcaoDescontoPadrao)
  }
  const valorComPlano = planoId ? arredondar(input.valorTabela * (1 - descontoPercentual / 100)) : input.valorTabela
  const dadosEvento = { servico: input.servico, valorTabela: input.valorTabela, desconto: descontoPercentual, planoId }

  // 2. Idempotência.
  const repetido = await atendimentoRecente(db, tenantId, agente.id, resultado, { documento, telefone, leadId: existente?.id ?? null }, agora)
  if (repetido) return montarResposta(ctx, repetido, null, agora)

  const valoresAtendimento = (leadId: string | null, checkout: CheckoutResult | null) => ({
    tenantId,
    agenteId: agente.id,
    unidadeId: agente.unidadeId ?? null,
    leadId,
    nome: input.nome,
    documento: documento || null,
    telefone: telefone || null,
    servico: input.servico,
    valorTabela: String(input.valorTabela),
    descontoPercentual,
    valorComPlano: String(valorComPlano),
    planoId,
    resultado,
    observacoes: input.observacoes ?? null,
    assinaturaId: checkout?.subscriptionId ?? null,
  })

  // 4. Adesão: conversão fora da transação; atendimento + evento juntos depois.
  if (resultado === 'assinou') {
    /** Para mexer em lead de outro dono quando a venda fecha no balcão (o dono não muda). */
    const ctxMaster: VendasCtx = { ...ctx, papel: 'master', visibilidade: { agenteId: agente.id, todos: true } }
    const alvoCtx = existente && !proprio ? ctxMaster : ctx
    let lead: VendasLeadRow
    if (existente) {
      lead = existente
      const complemento: Record<string, unknown> = {}
      if (!existente.documento && documento) complemento.documento = documento
      if (!existente.email && email) complemento.email = email
      if (!existente.telefone && telefone) complemento.telefone = telefone
      if (typeof dadosExistentes.dataNascimento !== 'string' && nascimento) {
        complemento.dados = { ...dadosExistentes, dataNascimento: nascimento }
      }
      if (Object.keys(complemento).length > 0) await atualizar(alvoCtx, existente.id, complemento, agora)
    } else {
      const criado = await criar(
        ctx,
        {
          tipo: 'pessoa',
          nome: input.nome,
          documento: documento || null,
          email,
          telefone: telefone || null,
          origem: 'balcao',
          interessePlanoId: planoId,
          observacoes: input.observacoes ?? null,
          dados: nascimento ? { dataNascimento: nascimento } : {},
        },
        agora,
      )
      lead = await lerLead(criado.id)
    }
    const checkout = await assinar(alvoCtx, tenant, lead.id, { planoId: planoId!, metodoPagamento: input.formaPagamento ?? 'pix' }, remoteIp)
    const atendimento = await db.transaction(async tx => {
      const [row] = await tx.insert(vendasAtendimentosBalcao).values(valoresAtendimento(lead.id, checkout)).returning()
      if (!row) throw new Error('Falha ao registrar o atendimento')
      await registrarEventoLead(tx, {
        leadId: lead.id,
        tipo: 'atendimento_balcao',
        texto: `Atendimento no balcão: ${input.servico} (adesão).`,
        dados: { ...dadosEvento, atendimentoId: row.id, assinaturaId: checkout.subscriptionId ?? null },
        porUserId: ctx.userId,
        porAgenteId: agente.id,
        em: agora,
      })
      return row
    })
    return montarResposta(ctx, atendimento, checkout, agora)
  }

  // 3. Demais resultados: tudo na mesma transação.
  const atendimento = await db.transaction(async tx => {
    let leadId: string | null = existente?.id ?? null
    if (resultado === 'vai_pensar' || resultado === 'recusou') {
      const lead =
        existente ??
        (await inserirLeadBalcao(
          tx,
          ctx,
          agente,
          tenantId,
          { nome: input.nome, documento: documento || null, email, telefone: telefone || null, planoId, observacoes: input.observacoes ?? null, nascimento },
          agora,
        ))
      leadId = lead.id
      const texto = `Atendimento no balcão: ${input.servico} (${RESULTADO_BALCAO_LABELS[resultado].toLowerCase()}).`
      const etapa = await registrarContatoBalcao(tx, ctx, lead, texto, dadosEvento, agora)
      // Lead de outro dono: só o registro no histórico; etapa, dono e próximo passo ficam como estão.
      if (!existente || proprio) {
        if (resultado === 'vai_pensar') await agendarRetomada(tx, ctx, lead.id, agora)
        else await perderLead(tx, ctx, lead.id, etapa, input.observacoes?.trim() || 'Não quis no balcão', agora)
      }
    }
    const [row] = await tx.insert(vendasAtendimentosBalcao).values(valoresAtendimento(leadId, null)).returning()
    if (!row) throw new Error('Falha ao registrar o atendimento')
    return row
  })
  return montarResposta(ctx, atendimento, null, agora)
}
