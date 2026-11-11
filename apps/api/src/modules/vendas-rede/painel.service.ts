import {
  ETAPAS_LEAD,
  type EtapaLead,
  type ResultadosQuery,
  type VendasLead,
  type VendasLinhaDaVez,
  type VendasPainelHoje,
  type VendasPainelResultados,
} from '@annetec/contracts'
import { and, eq, gte, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  vendasAgentes,
  vendasComissoes,
  vendasCorretoras,
  vendasEquipes,
  vendasLeadEventos,
  vendasLeads,
  vendasUnidades,
  type VendasAgenteRow,
  type VendasLeadRow,
} from '@/db/schema'
import { toDateSP } from '@/modules/club-billing/dates'
import { idsAgentesVisiveis, whereComissoesVisiveis } from './comissoes.service'
import { getOrCreateConfig } from './config.service'
import { whereEscopo, type VendasCtx } from './context'
import { whereAgentesVisiveis } from './presenca.service'
import {
  arredondarCentavos,
  estaOnline,
  EVENTOS_DE_CONTATO,
  mesReferenciaSaoPaulo,
  numerosDaSemana,
  proximoPassoDoLead,
  resumirFunil,
  type EventoLeadRegra,
} from './rules'

/**
 * Painel/BI da Rede Comercial (`docs/rede-comercial.md` 4.2).
 *
 *  - `hoje`: tela "Hoje" do agente (presença, contadores, "Sua vez agora",
 *    números da semana, funil, meta do mês e equipe online);
 *  - `resultados`: KPIs, série diária, funil, ranking e origens por período,
 *    sempre limitados ao que o papel enxerga.
 *
 * Os números são calculados em memória a partir de consultas simples (por
 * escopo e visibilidade): o volume de leads por escopo é pequeno e as regras
 * (`rules.ts`) ficam testáveis sem SQL específico.
 */

const MS_MIN = 60_000
const MS_DIA = 24 * 60 * MS_MIN
const POOL_PARADO_MIN = 15
const LIMITE_SUA_VEZ = 10

// ---------------------------------------------------------------------------
// Datas em America/Sao_Paulo (UTC−3 fixo desde 2019)
// ---------------------------------------------------------------------------

const inicioDoDia = (dia: string) => new Date(`${dia}T00:00:00-03:00`)

function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(a!, m! - 1, d! + n)).toISOString().slice(0, 10)
}

/** Início do período e a lista de dias (`yyyy-MM-dd`) até hoje. `30d` = 30 dias corridos; `mes` e `trimestre` = do começo do mês/trimestre até hoje. */
export function janelaDoPeriodo(periodo: ResultadosQuery['periodo'], agora: Date): { inicio: Date; dias: string[] } {
  const hoje = toDateSP(agora)
  let primeiroDia: string
  if (periodo === '30d') primeiroDia = somarDias(hoje, -29)
  else if (periodo === 'mes') primeiroDia = `${hoje.slice(0, 7)}-01`
  else {
    const mes = Number(hoje.slice(5, 7))
    const inicioTrimestre = Math.floor((mes - 1) / 3) * 3 + 1
    primeiroDia = `${hoje.slice(0, 4)}-${String(inicioTrimestre).padStart(2, '0')}-01`
  }
  const dias: string[] = []
  for (let dia = primeiroDia; dia <= hoje; dia = somarDias(dia, 1)) dias.push(dia)
  return { inicio: inicioDoDia(primeiroDia), dias }
}

function saudacaoDe(nome: string, agora: Date): string {
  const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(agora)) % 24
  const base = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiroNome = nome.trim().split(/\s+/)[0]
  return primeiroNome ? `${base}, ${primeiroNome}` : base
}

// ---------------------------------------------------------------------------
// Carga de dados
// ---------------------------------------------------------------------------

const aberto = (l: Pick<VendasLeadRow, 'etapa'>) => l.etapa !== 'ganho' && l.etapa !== 'perdido'
const numero = (valor: string | null | undefined) => (valor === null || valor === undefined ? null : Number(valor))

/** Leads do escopo na visão do usuário: donos visíveis (+ pool quando pedido); master vê tudo. */
function condicaoLeads(ctx: VendasCtx, ids: string[] | null, incluirPool: boolean): SQL {
  const escopo = whereEscopo(vendasLeads, ctx)
  if (ids === null) return escopo
  const partes: SQL[] = []
  if (ids.length > 0) partes.push(inArray(vendasLeads.agenteId, ids))
  if (incluirPool) partes.push(isNull(vendasLeads.agenteId))
  if (partes.length === 0) return and(escopo, isNull(vendasLeads.agenteId), eq(vendasLeads.id, '00000000-0000-0000-0000-000000000000'))!
  return and(escopo, or(...partes))!
}

async function carregarEventos(ctx: VendasCtx, ids: string[] | null, incluirPool: boolean, desde: Date): Promise<EventoLeadRegra[]> {
  const rows = await db
    .select({ tipo: vendasLeadEventos.tipo, em: vendasLeadEventos.em, dados: vendasLeadEventos.dados, leadId: vendasLeadEventos.leadId })
    .from(vendasLeadEventos)
    .innerJoin(vendasLeads, eq(vendasLeads.id, vendasLeadEventos.leadId))
    .where(and(condicaoLeads(ctx, ids, incluirPool), gte(vendasLeadEventos.em, desde)))
  return rows.map(row => ({ tipo: row.tipo, em: row.em, leadId: row.leadId, dados: row.dados ?? null }))
}

function paraLead(row: VendasLeadRow, agentes: Map<string, VendasAgenteRow>, agora: Date): VendasLead {
  const info = proximoPassoDoLead(
    {
      etapa: row.etapa,
      agenteId: row.agenteId,
      ultimoContatoEm: row.ultimoContatoEm,
      proximoPasso: row.proximoPasso,
      proximoPassoEm: row.proximoPassoEm,
    },
    agora,
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
    agenteNome: row.agenteId ? (agentes.get(row.agenteId)?.nome ?? null) : null,
    reivindicadoEm: row.reivindicadoEm ? row.reivindicadoEm.toISOString() : null,
    poolDesde: row.poolDesde ? row.poolDesde.toISOString() : null,
    proximoPasso: row.proximoPasso ?? null,
    proximoPassoEm: row.proximoPassoEm ? row.proximoPassoEm.toISOString() : null,
    ultimoContatoEm: row.ultimoContatoEm ? row.ultimoContatoEm.toISOString() : null,
    interessePlanoId: row.interessePlanoId ?? null,
    interessePlanoNome: null,
    valorEstimado: numero(row.valorEstimado),
    vidasEstimadas: row.vidasEstimadas ?? null,
    atribuicao: row.atribuicao ?? null,
    conversao: row.conversao ?? null,
    ganhoEm: row.ganhoEm ? row.ganhoEm.toISOString() : null,
    perdidoEm: row.perdidoEm ? row.perdidoEm.toISOString() : null,
    motivoPerda: row.motivoPerda ?? null,
    observacoes: row.observacoes ?? null,
    dados: row.dados ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    proximoPassoInfo: info,
  }
}

// ---------------------------------------------------------------------------
// Hoje
// ---------------------------------------------------------------------------

type MotivoDaVez = 'atrasado' | 'novo' | 'proposta'

function classificarDaVez(l: VendasLeadRow, agora: Date): MotivoDaVez | null {
  const atrasado = Boolean(l.agenteId && l.proximoPassoEm && l.proximoPassoEm.getTime() < agora.getTime())
  if (atrasado) return 'atrasado'
  if (l.etapa === 'novo' && l.ultimoContatoEm === null) return 'novo'
  if (l.etapa === 'proposta' && l.agenteId) return 'proposta'
  return null
}

function acaoDaVez(l: VendasLeadRow, motivo: MotivoDaVez): VendasLinhaDaVez['acao'] {
  if (!l.agenteId) return 'atender'
  if (motivo === 'novo') return 'ligar'
  if (motivo === 'proposta') return 'registrar'
  if (l.etapa === 'novo') return 'ligar'
  if (l.etapa === 'em_contato') return 'enviar_proposta'
  return 'registrar'
}

function textoDaVez(l: VendasLeadRow, motivo: MotivoDaVez, passo: string): string {
  if (!l.agenteId) return 'Disponível: ninguém atendeu ainda'
  if (motivo === 'atrasado') return `Próximo passo atrasado: ${passo}`
  if (motivo === 'novo') return 'Lead novo sem nenhum contato'
  return 'Proposta enviada aguardando resposta'
}

/** `GET /painel/hoje`. */
export async function hoje(ctx: VendasCtx, agora: Date = new Date()): Promise<VendasPainelHoje> {
  const config = await getOrCreateConfig(ctx.scope, ctx.tenantId)
  const agentes = await db.select().from(vendasAgentes).where(whereAgentesVisiveis(ctx))
  const mapa = new Map(agentes.map(a => [a.id, a]))
  const ids = await idsAgentesVisiveis(ctx)
  const leads = await db.select().from(vendasLeads).where(condicaoLeads(ctx, ids, true))

  const meId = ctx.agente?.id ?? null
  const abertos = leads.filter(aberto)
  const pool = abertos.filter(l => !l.agenteId)
  const proprios = abertos.filter(l => meId !== null && l.agenteId === meId)
  const atrasado = (l: VendasLeadRow) => Boolean(l.agenteId && l.proximoPassoEm && l.proximoPassoEm.getTime() < agora.getTime())
  const limiteParado = agora.getTime() - POOL_PARADO_MIN * MS_MIN

  const minhaVez = proprios.filter(l => atrasado(l) || (l.etapa === 'novo' && l.ultimoContatoEm === null))
  const emAndamento = proprios.filter(l => l.etapa === 'em_contato' || l.etapa === 'proposta' || l.etapa === 'negociacao')

  // "Sua vez agora": os do agente; papéis acima do vendedor também veem o pool.
  const veOPool = ctx.papel === 'master' || ctx.papel === 'gerente' || ctx.papel === 'supervisor'
  const candidatos = [...proprios, ...(veOPool ? pool : [])]
  const ordemMotivo: Record<MotivoDaVez, number> = { atrasado: 0, novo: 1, proposta: 2 }
  const dataDe = (l: VendasLeadRow, motivo: MotivoDaVez) =>
    (motivo === 'atrasado' ? l.proximoPassoEm : l.poolDesde ?? l.createdAt)?.getTime() ?? 0
  const suaVez: VendasLinhaDaVez[] = candidatos
    .flatMap(l => {
      const motivo = classificarDaVez(l, agora)
      return motivo ? [{ l, motivo }] : []
    })
    .sort((a, b) => ordemMotivo[a.motivo] - ordemMotivo[b.motivo] || dataDe(a.l, a.motivo) - dataDe(b.l, b.motivo))
    .slice(0, LIMITE_SUA_VEZ)
    .map(({ l, motivo }) => {
      const lead = paraLead(l, mapa, agora)
      return { lead, acao: acaoDaVez(l, motivo), motivo: textoDaVez(l, motivo, lead.proximoPassoInfo?.texto ?? 'retomar o contato') }
    })

  // Semana: eventos das últimas duas semanas dos leads visíveis.
  const eventos = await carregarEventos(ctx, ids, true, new Date(agora.getTime() - 14 * MS_DIA))
  const semana = numerosDaSemana(eventos, leads, agora)

  const doFunil = ctx.papel === 'master' ? leads : leads.filter(l => l.agenteId)
  const funil = resumirFunil(doFunil.map(l => ({ etapa: l.etapa, valorEstimado: numero(l.valorEstimado) })))

  const inicioMes = inicioDoDia(`${mesReferenciaSaoPaulo(agora)}-01`)
  const ganhosDoMes = leads.filter(l => l.etapa === 'ganho' && l.ganhoEm && l.ganhoEm >= inicioMes && (meId === null || l.agenteId === meId))
  const agente = ctx.agente
  const nome = agente?.nome ?? ctx.userName

  const mostraEquipe = ctx.papel === 'master' || ctx.papel === 'gerente' || ctx.papel === 'supervisor'
  const equipeOnline = mostraEquipe
    ? agentes
        .filter(a => a.id !== meId && a.ativo && estaOnline(a.ultimaPresencaEm, agora, config.presencaMinutos))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        .map(a => ({ id: a.id, nome: a.nome, papel: a.papel }))
    : []

  return {
    saudacao: saudacaoDe(nome, agora),
    agente: {
      id: agente?.id ?? null,
      nome,
      papel: ctx.papel,
      // Master implícito não manda heartbeat: quem está vendo o painel está presente.
      online: agente ? agente.ativo && estaOnline(agente.ultimaPresencaEm, agora, config.presencaMinutos) : true,
    },
    contadores: {
      pool: ctx.papel === 'balcao' ? 0 : pool.length,
      minhaVez: minhaVez.length,
      emAndamento: emAndamento.length,
      proximosPassosAtrasados: abertos.filter(atrasado).length,
      poolParadoMais15min: pool.filter(l => (l.poolDesde ?? l.createdAt).getTime() < limiteParado).length,
    },
    suaVez,
    semana: {
      contatos: { atual: semana.contatos.atual, anterior: semana.contatos.anterior },
      // Sem evento próprio de "resposta": a coluna acompanha as propostas enviadas.
      respostas: { atual: semana.propostas.atual, anterior: semana.propostas.anterior },
      reunioes: { atual: semana.reunioes.atual, anterior: semana.reunioes.anterior },
      vendas: { atual: semana.vendas.atual, anterior: semana.vendas.anterior },
    },
    funil: { contagem: funil.porEtapa, taxaConversao: funil.taxaConversao, valorEmNegociacao: funil.valorEmNegociacao },
    meta: { metaMensal: agente ? (agente.metaMensal ?? config.metaMensalPadrao) : null, realizado: ganhosDoMes.length },
    equipeOnline,
  }
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

type Agrupamento = ResultadosQuery['agrupar']

interface Grupo {
  chave: string
  nome: string
  leads: number
  ganhos: number
  valor: number
}

/** Quanto cada papel pode agrupar: vendedor/balcão só ele; supervisor só vendedores; gerente tudo da corretora; master tudo. */
function agrupamentoEfetivo(ctx: VendasCtx, pedido: Agrupamento): Agrupamento {
  return ctx.papel === 'master' || ctx.papel === 'gerente' ? pedido : 'agente'
}

async function gruposIniciais(ctx: VendasCtx, agrupar: Agrupamento, agentes: VendasAgenteRow[]): Promise<Map<string, Grupo>> {
  const grupos = new Map<string, Grupo>()
  const novo = (chave: string, nome: string) => grupos.set(chave, { chave, nome, leads: 0, ganhos: 0, valor: 0 })
  const corretoraDoGerente = ctx.papel === 'gerente' ? ctx.visibilidade.corretoraId : undefined
  if (agrupar === 'agente') {
    const alvo = ctx.papel === 'vendedor' || ctx.papel === 'balcao' ? agentes.filter(a => a.id === ctx.agente?.id) : agentes
    for (const a of alvo) novo(a.id, a.nome)
  } else if (agrupar === 'equipe') {
    const rows = await db
      .select({ id: vendasEquipes.id, nome: vendasEquipes.nome })
      .from(vendasEquipes)
      .where(corretoraDoGerente ? and(whereEscopo(vendasEquipes, ctx), eq(vendasEquipes.corretoraId, corretoraDoGerente)) : whereEscopo(vendasEquipes, ctx))
    for (const r of rows) novo(r.id, r.nome)
  } else if (agrupar === 'unidade') {
    const rows = await db
      .select({ id: vendasUnidades.id, nome: vendasUnidades.nome })
      .from(vendasUnidades)
      .where(corretoraDoGerente ? and(whereEscopo(vendasUnidades, ctx), eq(vendasUnidades.corretoraId, corretoraDoGerente)) : whereEscopo(vendasUnidades, ctx))
    for (const r of rows) novo(r.id, r.nome)
  } else {
    const rows = await db
      .select({ id: vendasCorretoras.id, nome: vendasCorretoras.nomeFantasia })
      .from(vendasCorretoras)
      .where(corretoraDoGerente ? and(whereEscopo(vendasCorretoras, ctx), eq(vendasCorretoras.id, corretoraDoGerente)) : whereEscopo(vendasCorretoras, ctx))
    for (const r of rows) novo(r.id, r.nome)
  }
  return grupos
}

const SEM_GRUPO: Record<Exclude<Agrupamento, 'agente'>, [string, string]> = {
  equipe: ['sem-equipe', 'Sem equipe (solo)'],
  unidade: ['sem-unidade', 'Sem unidade'],
  corretora: ['sem-corretora', 'Sem corretora (solo)'],
}

function chaveDoGrupo(agrupar: Agrupamento, agente: VendasAgenteRow): string {
  if (agrupar === 'agente') return agente.id
  const valor = agrupar === 'equipe' ? agente.equipeId : agrupar === 'unidade' ? agente.unidadeId : agente.corretoraId
  return valor ?? SEM_GRUPO[agrupar][0]
}

/** `GET /painel/resultados`. */
export async function resultados(ctx: VendasCtx, query: ResultadosQuery, agora: Date = new Date()): Promise<VendasPainelResultados> {
  const { inicio, dias } = janelaDoPeriodo(query.periodo, agora)
  const agrupar = agrupamentoEfetivo(ctx, query.agrupar)
  const agentes = await db.select().from(vendasAgentes).where(whereAgentesVisiveis(ctx))
  const mapa = new Map(agentes.map(a => [a.id, a]))
  const ids = await idsAgentesVisiveis(ctx)
  // Só o master enxerga também os leads sem dono (entrada do site) nos números.
  const leads = await db.select().from(vendasLeads).where(condicaoLeads(ctx, ids, ctx.papel === 'master'))

  const noPeriodo = (data: Date | null) => Boolean(data && data >= inicio && data <= agora)
  const criados = leads.filter(l => noPeriodo(l.createdAt))
  const ganhos = leads.filter(l => l.etapa === 'ganho' && noPeriodo(l.ganhoEm))

  const eventos = await carregarEventos(ctx, ids, ctx.papel === 'master', inicio)
  const contatos = eventos.filter(e => EVENTOS_DE_CONTATO.includes(e.tipo)).length
  const propostas = eventos.filter(e => e.tipo === 'etapa' && e.dados?.para === 'proposta').length

  // Valor real: base da 1ª mensalidade paga do vendedor; sem ela, o valor estimado do lead.
  const reais = new Map<string, number>()
  if (ganhos.length > 0) {
    const linhas = await db
      .select({ leadId: vendasComissoes.leadId, base: vendasComissoes.base, status: vendasComissoes.status })
      .from(vendasComissoes)
      .where(
        and(
          whereEscopo(vendasComissoes, ctx),
          inArray(
            vendasComissoes.leadId,
            ganhos.map(l => l.id),
          ),
          eq(vendasComissoes.parte, 'vendedor'),
          eq(vendasComissoes.tipo, 'mensalidade'),
          eq(vendasComissoes.parcela, 1),
        ),
      )
    for (const l of linhas) if (l.leadId && l.status !== 'cancelada') reais.set(l.leadId, Number(l.base))
  }
  const valorDe = (l: VendasLeadRow) => reais.get(l.id) ?? numero(l.valorEstimado) ?? 0

  const comissoes = await db
    .select({ valor: vendasComissoes.valor, status: vendasComissoes.status })
    .from(vendasComissoes)
    .where(and(whereComissoesVisiveis(ctx, ids), gte(vendasComissoes.createdAt, inicio)))
  const somaComissao = (status: string) => arredondarCentavos(comissoes.filter(c => c.status === status).reduce((s, c) => s + Number(c.valor), 0))

  const serieDiaria = dias.map(dia => ({
    dia,
    leads: criados.filter(l => toDateSP(l.createdAt) === dia).length,
    ganhos: ganhos.filter(l => l.ganhoEm && toDateSP(l.ganhoEm) === dia).length,
  }))

  const porEtapa = new Map<EtapaLead, number>(ETAPAS_LEAD.map(etapa => [etapa, 0]))
  for (const l of criados) porEtapa.set(l.etapa, (porEtapa.get(l.etapa) ?? 0) + 1)

  const origens = new Map<VendasLead['origem'], number>()
  for (const l of criados) origens.set(l.origem, (origens.get(l.origem) ?? 0) + 1)

  const grupos = await gruposIniciais(ctx, agrupar, agentes)
  const somar = (l: VendasLeadRow, campo: 'leads' | 'ganhos') => {
    const dono = l.agenteId ? mapa.get(l.agenteId) : undefined
    if (!dono) return
    const chave = chaveDoGrupo(agrupar, dono)
    if (!grupos.has(chave)) {
      if (agrupar === 'agente' || ctx.papel !== 'master') return
      grupos.set(chave, { chave, nome: SEM_GRUPO[agrupar][1], leads: 0, ganhos: 0, valor: 0 })
    }
    const grupo = grupos.get(chave)!
    grupo[campo] += 1
    if (campo === 'ganhos') grupo.valor = arredondarCentavos(grupo.valor + valorDe(l))
  }
  for (const l of criados) somar(l, 'leads')
  for (const l of ganhos) somar(l, 'ganhos')

  return {
    periodo: query.periodo,
    agrupar,
    kpis: {
      leads: criados.length,
      contatos,
      propostas,
      ganhos: ganhos.length,
      taxaConversao: criados.length === 0 ? 0 : Math.round((ganhos.length / criados.length) * 1000) / 10,
      valorGanho: arredondarCentavos(ganhos.reduce((s, l) => s + valorDe(l), 0)),
      comissaoPrevista: somaComissao('prevista'),
      comissaoAPagar: somaComissao('a_pagar'),
      comissaoPaga: somaComissao('paga'),
    },
    serieDiaria,
    funil: ETAPAS_LEAD.map(etapa => ({ etapa, total: porEtapa.get(etapa) ?? 0 })),
    ranking: [...grupos.values()].sort(
      (a, b) => b.ganhos - a.ganhos || b.valor - a.valor || b.leads - a.leads || a.nome.localeCompare(b.nome, 'pt-BR'),
    ),
    origens: [...origens.entries()].map(([origem, total]) => ({ origem, total })).sort((a, b) => b.total - a.total),
  }
}
