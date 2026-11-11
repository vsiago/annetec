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
import { and, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  clubPlans,
  clubSubscriptions,
  vendasAgentes,
  vendasAtendimentosBalcao,
  vendasLeads,
  vendasUnidades,
  type VendasAtendimentoBalcaoRow,
  type VendasLeadRow,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import type { ResolvedTenant } from '@/http/types'
import { getOrCreateConfig } from './config.service'
import type { VendasCtx } from './context'
import { assinar } from './conversao.service'
import { atualizar, criar, mudarEtapa, obter, proximoPasso, registrarEventoLead, toVendasLead } from './leads.service'
import { simularEconomiaBalcao } from './rules'

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
      'Para registrar atendimentos no balcão é preciso ter perfil de agente. Peça ao responsável para cadastrar o seu perfil.',
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

const ETAPAS_ABERTAS = new Set(['novo', 'em_contato', 'proposta', 'negociacao'])

async function acharLeadAberto(tenantId: string, documento: string, telefone: string): Promise<VendasLeadRow | null> {
  if (!documento && !telefone) return null
  const rows = await db
    .select()
    .from(vendasLeads)
    .where(and(eq(vendasLeads.scope, 'tenant'), eq(vendasLeads.tenantId, tenantId)))
    .orderBy(desc(vendasLeads.createdAt))
  const abertos = rows.filter(l => ETAPAS_ABERTAS.has(l.etapa))
  return (
    (documento ? abertos.find(l => somenteDigitos(l.documento) === documento) : undefined) ??
    (telefone ? abertos.find(l => somenteDigitos(l.telefone) === telefone) : undefined) ??
    null
  )
}

async function apresentarLeadDeOutro(row: VendasLeadRow, agora: Date): Promise<VendasLead> {
  let agenteNome: string | null = null
  if (row.agenteId) {
    const [a] = await db.select({ nome: vendasAgentes.nome }).from(vendasAgentes).where(eq(vendasAgentes.id, row.agenteId)).limit(1)
    agenteNome = a?.nome ?? null
  }
  return toVendasLead(row, { agenteNome, planoNome: null, agora })
}

export async function buscarPessoa(ctx: VendasCtx, query: PessoaBalcaoQuery, agora: Date = new Date()): Promise<VendasPessoaBalcao> {
  const tenantId = exigeTenant(ctx)
  const documento = somenteDigitos(query.documento)
  const telefone = somenteDigitos(query.telefone)

  const assinaturas = await db.select().from(clubSubscriptions).where(eq(clubSubscriptions.organizationId, tenantId))
  const encontradas = assinaturas.filter(
    s =>
      s.status !== 'canceled' &&
      ((documento && somenteDigitos(s.holderCpf) === documento) || (telefone && somenteDigitos(s.holderPhone) === telefone)),
  )
  const assinatura = encontradas.find(s => s.status === 'active' || s.status === 'past_due') ?? encontradas[0] ?? null
  const leadRow = await acharLeadAberto(tenantId, documento, telefone)

  return {
    jaAssociado: Boolean(assinatura && ['active', 'past_due', 'suspended'].includes(assinatura.status)),
    assinatura: assinatura
      ? {
          id: assinatura.id,
          status: assinatura.status,
          planoNome: assinatura.planName,
          proximoVencimento: assinatura.nextDueDate ?? null,
        }
      : null,
    lead: leadRow ? await apresentarLeadDeOutro(leadRow, agora) : null,
    nome: assinatura?.holderName ?? leadRow?.nome ?? null,
    telefone: assinatura?.holderPhone ?? leadRow?.telefone ?? null,
    email: assinatura?.holderEmail ?? leadRow?.email ?? null,
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

function invalido(issues: { path: string; message: string }[], mensagem: string): AppError {
  return new AppError(ERROR_CODES.VENDAS_ATENDIMENTO_INVALIDO, mensagem, { issues })
}

/** Contato no balcão: evento `atendimento_balcao` + `ultimo_contato_em` (+ `novo → em_contato` no lead do próprio atendente). */
async function registrarContatoBalcao(
  ctx: VendasCtx,
  lead: VendasLeadRow,
  texto: string,
  dados: Record<string, unknown>,
  agora: Date,
): Promise<void> {
  const proprio = lead.agenteId !== null && lead.agenteId === ctx.agente?.id
  await registrarEventoLead(db, {
    leadId: lead.id,
    tipo: 'atendimento_balcao',
    texto,
    dados,
    porUserId: ctx.userId,
    porAgenteId: ctx.agente?.id ?? null,
    em: agora,
  })
  const avanca = proprio && lead.etapa === 'novo'
  await db
    .update(vendasLeads)
    .set({ ultimoContatoEm: agora, updatedAt: agora, ...(avanca ? { etapa: 'em_contato' as const } : {}) })
    .where(and(eq(vendasLeads.id, lead.id), eq(vendasLeads.tenantId, ctx.tenantId!)))
  if (avanca) {
    await registrarEventoLead(db, {
      leadId: lead.id,
      tipo: 'etapa',
      texto: 'Etapa: novo → em_contato (atendimento no balcão).',
      dados: { de: 'novo', para: 'em_contato', automatico: true },
      porUserId: ctx.userId,
      porAgenteId: ctx.agente?.id ?? null,
      em: agora,
    })
  }
}

async function lerLead(id: string): Promise<VendasLeadRow> {
  const [row] = await db.select().from(vendasLeads).where(eq(vendasLeads.id, id)).limit(1)
  if (!row) throw AppError.notFound('Lead')
  return row
}

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
    if (problemas.length > 0) throw invalido(problemas, 'Faltam dados para registrar a adesão no balcão')
  }
  if (resultado === 'vai_pensar' && !telefone) {
    throw invalido([{ path: 'telefone', message: 'Informe o celular para retomar o contato' }], 'Informe o celular para retomar o contato')
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

  const proprio = existente !== null && existente.agenteId === agente.id
  let leadId: string | null = existente?.id ?? null
  let checkout: CheckoutResult | null = null

  /** Para mexer em lead de outro dono quando a venda fecha no balcão (o dono não muda). */
  const ctxMaster: VendasCtx = { ...ctx, papel: 'master', visibilidade: { agenteId: agente.id, todos: true } }

  const novoLead = async (): Promise<VendasLeadRow> => {
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
    return lerLead(criado.id)
  }

  if (resultado === 'assinou') {
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
      lead = await novoLead()
    }
    leadId = lead.id
    checkout = await assinar(alvoCtx, tenant, lead.id, { planoId: planoId!, metodoPagamento: input.formaPagamento ?? 'pix' }, remoteIp)
  } else if (resultado === 'vai_pensar' || resultado === 'recusou') {
    const lead = existente ?? (await novoLead())
    leadId = lead.id
    const texto = `Atendimento no balcão: ${input.servico} (${RESULTADO_BALCAO_LABELS[resultado].toLowerCase()}).`
    await registrarContatoBalcao(ctx, lead, texto, dadosEvento, agora)
    // Lead de outro dono: só o registro no histórico; etapa, dono e próximo passo ficam como estão.
    if (!existente || proprio) {
      if (resultado === 'vai_pensar') {
        await proximoPasso(
          ctx,
          lead.id,
          { texto: 'Retomar contato do balcão', em: new Date(agora.getTime() + DIAS_PARA_RETOMAR * 86_400_000).toISOString() },
          agora,
        )
      } else {
        await mudarEtapa(ctx, lead.id, { etapa: 'perdido', motivoPerda: input.observacoes?.trim() || 'Não quis no balcão' }, agora)
      }
    }
  }

  const [atendimento] = await db
    .insert(vendasAtendimentosBalcao)
    .values({
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
    .returning()
  if (!atendimento) throw new Error('Falha ao registrar o atendimento')

  if (resultado === 'assinou' && leadId) {
    await registrarEventoLead(db, {
      leadId,
      tipo: 'atendimento_balcao',
      texto: `Atendimento no balcão: ${input.servico} (adesão).`,
      dados: { ...dadosEvento, atendimentoId: atendimento.id, assinaturaId: checkout?.subscriptionId ?? null },
      porUserId: ctx.userId,
      porAgenteId: agente.id,
      em: agora,
    })
  }

  let leadFinal: VendasLead | null = null
  if (leadId) {
    const row = await lerLead(leadId)
    leadFinal = row.agenteId === agente.id ? await obter(ctx, leadId, agora) : await apresentarLeadDeOutro(row, agora)
  }
  const [apresentado] = await apresentarAtendimentos([atendimento])
  return { atendimento: apresentado!, lead: leadFinal, checkout }
}
