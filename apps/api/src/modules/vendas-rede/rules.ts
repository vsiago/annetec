/**
 * Regras PURAS da Rede Comercial (`vendas-rede`) — sem banco, sem relógio implícito
 * (datas chegam por parâmetro) e sem dependência de contratos/schema: os tipos são
 * locais e espelham os valores de `docs/rede-comercial.md`.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type PapelComercial = 'master' | 'gerente' | 'supervisor' | 'vendedor' | 'balcao'
export type EtapaLead = 'novo' | 'em_contato' | 'proposta' | 'negociacao' | 'ganho' | 'perdido'
export type ParteComissao = 'vendedor' | 'supervisor' | 'gerente' | 'corretora'
export type TipoComissao = 'mensalidade' | 'adesao'
export type StatusComissao = 'prevista' | 'a_pagar' | 'paga' | 'cancelada' | 'a_descontar'
export type TipoEventoLead =
  | 'criado'
  | 'reivindicado'
  | 'atribuido'
  | 'devolvido_pool'
  | 'etapa'
  | 'ligacao'
  | 'whatsapp'
  | 'email'
  | 'reuniao'
  | 'visita'
  | 'nota'
  | 'atendimento_balcao'
  | 'proximo_passo'
  | 'conversao'
  | 'sistema'
export type OrigemCobranca = 'platform' | 'club'
export type EstadoPassoJornada = 'feito' | 'agora' | 'falta' | 'pulado'
export type IdPassoJornada = 'captado' | 'atribuido' | 'contato' | 'oferta' | 'negociacao' | 'fechado'

/** Snapshot da cadeia do agente no momento da conversão (base da comissão). */
export interface Atribuicao {
  agenteId: string
  papel: PapelComercial
  equipeId: string | null
  supervisorAgenteId: string | null
  unidadeId: string | null
  corretoraId: string | null
  gerenteAgenteId: string | null
}

export interface OverridesComissao {
  supervisor?: number
  gerente?: number
  corretora?: number
}

export interface ConfigComissao {
  escalaMensal: readonly number[]
  percentualAdesao: number
  overrides: OverridesComissao
  balcaoPercentual?: readonly number[] | null
}

export interface ConfigPool {
  poolRetornoHoras: number
}

export interface ContextoVisibilidade {
  papel: PapelComercial
  /** `null` = master implícito (sem linha em `vendas_agentes`). */
  agenteId: string | null
  corretoraId?: string | null
  /** Equipes que o supervisor supervisiona. */
  equipeIds?: readonly string[]
}

export interface Visibilidade {
  todos: boolean
  corretoraId?: string
  equipeIds?: string[]
  agenteId: string | null
}

/** Lead para checagem de acesso; `dono*` descrevem o agente dono (null no pool). */
export interface LeadParaAcesso {
  agenteId: string | null
  donoCorretoraId?: string | null
  donoEquipeId?: string | null
}

export interface AgenteRef {
  id: string
  papel?: PapelComercial
  corretoraId?: string | null
  equipeId?: string | null
}

export interface CandidatoAutomatico {
  id: string
  online: boolean
  cargaSemana: number
  ufs?: readonly string[] | null
  ramos?: readonly string[] | null
}

export interface LeadParaDistribuicao {
  uf?: string | null
  ramo?: string | null
}

export interface LeadParaPool {
  agenteId: string | null
  etapa: EtapaLead
  reivindicadoEm: Date | null
  ultimoContatoEm: Date | null
}

export interface AgenteParaCadeia {
  id: string
  papel: PapelComercial
  equipeId?: string | null
  unidadeId?: string | null
  corretoraId?: string | null
}

export interface CobrancaParaComissao {
  id: string
  origem: OrigemCobranca
  tipo: TipoComissao
  parcela: number
  valorPago: number
  /** `true` ou `kind === 'adjustment'` = fatura avulsa (não comissiona). */
  avulsa?: boolean
  kind?: string
}

export interface LinhaComissao {
  parte: ParteComissao
  beneficiarioAgenteId: string | null
  beneficiarioCorretoraId: string | null
  percentual: number
  base: number
  valor: number
  mesReferencia: string
}

export interface ResultadoComissoes {
  linhas: LinhaComissao[]
  /** Preenchido quando a cobrança não gera comissão por natureza (avulsa / valor 0). */
  motivoNaoComissionavel: string | null
}

export interface EntradaSimulador {
  valorTabela: number
  descontoPercentual: number
  precoMensal: number
  adesao: number
}

export interface ResultadoSimulador {
  valorComPlano: number
  economiaNaConsulta: number
  economiaAnual12: number
  /** `null` quando não há economia por consulta (nunca compensa). */
  consultasParaCompensar: number | null
}

export interface EventoLeadRegra {
  tipo: TipoEventoLead
  em: Date
  leadId?: string
  dados?: Record<string, unknown> | null
}

export interface LeadParaJornada {
  etapa: EtapaLead
  agenteId: string | null
  ultimoContatoEm: Date | null
}

export interface PassoJornada {
  id: IdPassoJornada
  rotulo: string
  estado: EstadoPassoJornada
  /** Só no passo `fechado`. */
  resultado?: 'ganho' | 'perdido'
}

export interface LeadParaProximoPasso {
  etapa: EtapaLead
  agenteId: string | null
  ultimoContatoEm: Date | null
  proximoPasso?: string | null
  proximoPassoEm?: Date | null
}

export interface ProximoPasso {
  quem: 'voce' | 'cliente' | 'sistema'
  texto: string
  atrasado: boolean
}

export interface LeadParaSemana {
  ganhoEm?: Date | null
}

export interface NumeroComVariacao {
  atual: number
  anterior: number
  /** Variação percentual (1 casa); anterior 0 → 100 se houve algo, senão 0. */
  variacao: number
}

export interface NumerosDaSemana {
  contatos: NumeroComVariacao
  reunioes: NumeroComVariacao
  propostas: NumeroComVariacao
  vendas: NumeroComVariacao
}

export interface LeadParaFunil {
  etapa: EtapaLead
  valorEstimado?: number | null
}

export interface ResumoFunil {
  porEtapa: Record<EtapaLead, number>
  total: number
  ganhos: number
  perdidos: number
  /** ganhos / total × 100 (1 casa); 0 sem leads. */
  taxaConversao: number
  /** Soma de `valorEstimado` dos leads em `negociacao`. */
  valorEmNegociacao: number
}

export interface LeadParaRanking {
  agenteId: string | null
  etapa: EtapaLead
  valorEstimado?: number | null
}

export interface ComissaoParaRanking {
  beneficiarioAgenteId: string | null
  valor: number
  status: StatusComissao
}

export interface LinhaRanking {
  posicao: number
  agenteId: string
  nome: string
  fechamentos: number
  valor: number
  comissao: number
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MS_HORA = 3_600_000
const MS_DIA = 24 * MS_HORA
const FUSO = 'America/Sao_Paulo'

export const EVENTOS_DE_CONTATO: readonly TipoEventoLead[] = [
  'ligacao',
  'whatsapp',
  'email',
  'reuniao',
  'visita',
  'atendimento_balcao',
]

/** Arredonda a centavos (0,005 sobe). Corrige o erro binário de 1.005 etc. */
export function arredondarCentavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

function arredondar1(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 10) / 10
}

// ---------------------------------------------------------------------------
// Código de indicação e presença
// ---------------------------------------------------------------------------

/** 7 caracteres de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sem ambíguos). */
export function gerarCodigoIndicacao(rand: () => number = Math.random): string {
  let codigo = ''
  for (let i = 0; i < 7; i++) {
    const indice = Math.min(ALFABETO_CODIGO.length - 1, Math.max(0, Math.floor(rand() * ALFABETO_CODIGO.length)))
    codigo += ALFABETO_CODIGO[indice]
  }
  return codigo
}

/** Online = última presença dentro da janela (inclusive). Sem presença → offline. */
export function estaOnline(ultimaPresencaEm: Date | null | undefined, agora: Date, minutos: number): boolean {
  if (!ultimaPresencaEm) return false
  return agora.getTime() - ultimaPresencaEm.getTime() <= minutos * 60_000
}

// ---------------------------------------------------------------------------
// Visibilidade e permissões
// ---------------------------------------------------------------------------

export function visibilidade(ctx: ContextoVisibilidade): Visibilidade {
  const base = { agenteId: ctx.agenteId }
  if (ctx.papel === 'master') return { ...base, todos: true }
  if (ctx.papel === 'gerente' && ctx.corretoraId) return { ...base, todos: false, corretoraId: ctx.corretoraId }
  if (ctx.papel === 'supervisor') return { ...base, todos: false, equipeIds: [...(ctx.equipeIds ?? [])] }
  return { ...base, todos: false }
}

/** Visível = dono na hierarquia visível OU (sem dono e papel ≠ balcão). */
export function podeVerLead(ctx: ContextoVisibilidade, lead: LeadParaAcesso): boolean {
  if (lead.agenteId === null) return ctx.papel !== 'balcao'
  const v = visibilidade(ctx)
  if (v.todos) return true
  if (v.agenteId !== null && lead.agenteId === v.agenteId) return true
  if (v.corretoraId && lead.donoCorretoraId === v.corretoraId) return true
  if (v.equipeIds && lead.donoEquipeId && v.equipeIds.includes(lead.donoEquipeId)) return true
  return false
}

/**
 * Editável = visível E (master, dono ou superior do dono na cadeia). Lead no pool
 * só é editado pelo master (os demais reivindicam antes).
 */
export function podeEditarLead(
  ctx: ContextoVisibilidade,
  lead: LeadParaAcesso,
  cadeiaDoDono?: Pick<Atribuicao, 'supervisorAgenteId' | 'gerenteAgenteId'> | null,
): boolean {
  if (!podeVerLead(ctx, lead)) return false
  if (ctx.papel === 'master') return true
  if (lead.agenteId === null || ctx.agenteId === null) return false
  if (lead.agenteId === ctx.agenteId) return true
  if (!cadeiaDoDono) return false
  if (ctx.papel === 'supervisor') return cadeiaDoDono.supervisorAgenteId === ctx.agenteId
  if (ctx.papel === 'gerente') return cadeiaDoDono.gerenteAgenteId === ctx.agenteId
  return false
}

/**
 * Master: qualquer agente (e devolver ao pool). Gerente: só dentro da corretora.
 * Supervisor: só dentro das suas equipes. `deAgente`/`paraAgente` nulos = pool.
 */
export function podeReatribuir(
  ctx: ContextoVisibilidade,
  deAgente: AgenteRef | null,
  paraAgente: AgenteRef | null,
): boolean {
  if (ctx.papel === 'master') return true
  if (ctx.papel !== 'gerente' && ctx.papel !== 'supervisor') return false
  const dentro = (a: AgenteRef): boolean => {
    if (ctx.papel === 'gerente') return !!ctx.corretoraId && a.corretoraId === ctx.corretoraId
    return !!a.equipeId && (ctx.equipeIds ?? []).includes(a.equipeId)
  }
  if (deAgente === null && paraAgente === null) return false
  if (deAgente !== null && !dentro(deAgente)) return false
  if (paraAgente !== null && !dentro(paraAgente)) return false
  return true
}

// ---------------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------------

const TRANSICOES: Record<EtapaLead, readonly EtapaLead[]> = {
  novo: ['em_contato', 'perdido'],
  em_contato: ['proposta', 'negociacao', 'perdido', 'novo'],
  proposta: ['negociacao', 'ganho', 'perdido', 'em_contato'],
  negociacao: ['ganho', 'perdido', 'proposta'],
  perdido: ['novo'],
  ganho: [],
}

/** `ganho` é final: só o master reabre (para qualquer etapa). */
export function transicaoPermitida(de: EtapaLead, para: EtapaLead, papel?: PapelComercial): boolean {
  if (de === para) return false
  if (de === 'ganho') return papel === 'master'
  return TRANSICOES[de].includes(para)
}

// ---------------------------------------------------------------------------
// Distribuição e pool
// ---------------------------------------------------------------------------

function aceitaFiltro(filtro: readonly string[] | null | undefined, valor: string | null | undefined): boolean {
  if (!filtro || filtro.length === 0) return true
  if (!valor) return false
  const v = valor.trim().toLowerCase()
  return filtro.some(f => f.trim().toLowerCase() === v)
}

/** Só online (e que aceitem uf/ramo do lead); menor carga; desempate por id; ninguém → `null` (pool). */
export function escolherAgenteAutomatico(
  lead: LeadParaDistribuicao,
  candidatos: readonly CandidatoAutomatico[],
): string | null {
  const elegiveis = candidatos
    .filter(c => c.online && aceitaFiltro(c.ufs, lead.uf) && aceitaFiltro(c.ramos, lead.ramo))
    .sort((a, b) => a.cargaSemana - b.cargaSemana || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return elegiveis[0]?.id ?? null
}

/**
 * Volta ao pool: tem dono, etapa `novo`, `reivindicadoEm + horas < agora` (estrito) e
 * nenhum contato desde a reivindicação.
 */
export function deveVoltarAoPool(lead: LeadParaPool, config: ConfigPool, agora: Date): boolean {
  if (lead.agenteId === null || lead.etapa !== 'novo' || !lead.reivindicadoEm) return false
  const limite = lead.reivindicadoEm.getTime() + config.poolRetornoHoras * MS_HORA
  if (!(limite < agora.getTime())) return false
  return lead.ultimoContatoEm === null || lead.ultimoContatoEm.getTime() < lead.reivindicadoEm.getTime()
}

// ---------------------------------------------------------------------------
// Cadeia e comissões
// ---------------------------------------------------------------------------

/**
 * Snapshot da cadeia. Quem já é o supervisor/gerente da própria venda não recebe
 * override de si mesmo (o ponteiro correspondente fica `null`).
 */
export function cadeiaDoAgente(
  agente: AgenteParaCadeia,
  equipe?: { id: string; supervisorAgenteId?: string | null } | null,
  corretora?: { id: string; gerenteAgenteId?: string | null } | null,
): Atribuicao {
  const supervisor = equipe?.supervisorAgenteId ?? null
  const gerente = corretora?.gerenteAgenteId ?? null
  return {
    agenteId: agente.id,
    papel: agente.papel,
    equipeId: equipe?.id ?? agente.equipeId ?? null,
    supervisorAgenteId: supervisor && supervisor !== agente.id ? supervisor : null,
    unidadeId: agente.unidadeId ?? null,
    corretoraId: corretora?.id ?? agente.corretoraId ?? null,
    gerenteAgenteId: gerente && gerente !== agente.id ? gerente : null,
  }
}

/** `YYYY-MM` em America/Sao_Paulo. */
export function mesReferenciaSaoPaulo(data: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit' }).formatToParts(data)
  const ano = partes.find(p => p.type === 'year')?.value
  const mes = partes.find(p => p.type === 'month')?.value
  return `${ano}-${mes}`
}

function percentualDoVendedor(config: ConfigComissao, atribuicao: Atribuicao, cobranca: CobrancaParaComissao): number {
  if (cobranca.tipo === 'adesao') return config.percentualAdesao
  const escala =
    atribuicao.papel === 'balcao' && config.balcaoPercentual && config.balcaoPercentual.length > 0
      ? config.balcaoPercentual
      : config.escalaMensal
  const percentual = Number.isInteger(cobranca.parcela) && cobranca.parcela >= 1 ? escala[cobranca.parcela - 1] : undefined
  return percentual ?? 0
}

/**
 * Linhas de comissão de UMA cobrança paga. Overrides incidem sobre o valor da
 * comissão do vendedor da mesma parcela; `overridesCorretora` sobrescreve (chave a
 * chave) os da config; solo não gera override; nunca há linha de valor 0.
 */
export function comissoesDaCobranca(input: {
  config: ConfigComissao
  overridesCorretora?: OverridesComissao | null
  atribuicao: Atribuicao
  cobranca: CobrancaParaComissao
  agora: Date
}): ResultadoComissoes {
  const { config, overridesCorretora, atribuicao, cobranca, agora } = input
  const vazio = (motivo: string | null): ResultadoComissoes => ({ linhas: [], motivoNaoComissionavel: motivo })

  if (cobranca.avulsa || cobranca.kind === 'adjustment') {
    return vazio('Fatura avulsa (ajuste) não gera comissão')
  }
  if (!(cobranca.valorPago > 0)) return vazio('Valor pago zerado: sem base para comissão')

  const percentual = percentualDoVendedor(config, atribuicao, cobranca)
  const valorVendedor = arredondarCentavos((cobranca.valorPago * percentual) / 100)
  if (!(percentual > 0) || !(valorVendedor > 0)) return vazio(null)

  const mesReferencia = mesReferenciaSaoPaulo(agora)
  const linhas: LinhaComissao[] = [
    {
      parte: 'vendedor',
      beneficiarioAgenteId: atribuicao.agenteId,
      beneficiarioCorretoraId: null,
      percentual,
      base: arredondarCentavos(cobranca.valorPago),
      valor: valorVendedor,
      mesReferencia,
    },
  ]

  const overrides: OverridesComissao = { ...config.overrides, ...(overridesCorretora ?? {}) }
  const beneficiarios: { parte: Exclude<ParteComissao, 'vendedor'>; agenteId: string | null; corretoraId: string | null }[] = [
    { parte: 'supervisor', agenteId: atribuicao.supervisorAgenteId, corretoraId: null },
    { parte: 'gerente', agenteId: atribuicao.gerenteAgenteId, corretoraId: null },
    { parte: 'corretora', agenteId: null, corretoraId: atribuicao.corretoraId },
  ]
  for (const b of beneficiarios) {
    if (!b.agenteId && !b.corretoraId) continue
    const pct = overrides[b.parte] ?? 0
    const valor = arredondarCentavos((valorVendedor * pct) / 100)
    if (!(pct > 0) || !(valor > 0)) continue
    linhas.push({
      parte: b.parte,
      beneficiarioAgenteId: b.agenteId,
      beneficiarioCorretoraId: b.corretoraId,
      percentual: pct,
      base: valorVendedor,
      valor,
      mesReferencia,
    })
  }
  return { linhas, motivoNaoComissionavel: null }
}

/** `prevista|a_pagar → cancelada`, `paga → a_descontar`; demais não mudam (`null`). */
export function estornarComissao(status: StatusComissao): 'cancelada' | 'a_descontar' | null {
  if (status === 'prevista' || status === 'a_pagar') return 'cancelada'
  if (status === 'paga') return 'a_descontar'
  return null
}

// ---------------------------------------------------------------------------
// Balcão
// ---------------------------------------------------------------------------

export function simularEconomiaBalcao(input: EntradaSimulador): ResultadoSimulador {
  const valorComPlano = arredondarCentavos(input.valorTabela * (1 - input.descontoPercentual / 100))
  const economiaNaConsulta = arredondarCentavos(input.valorTabela - valorComPlano)
  const custoInicial = input.precoMensal + input.adesao
  return {
    valorComPlano,
    economiaNaConsulta,
    economiaAnual12: arredondarCentavos(economiaNaConsulta * 12),
    consultasParaCompensar:
      economiaNaConsulta > 0 ? Math.max(0, Math.ceil(Number((custoInicial / economiaNaConsulta).toFixed(9)))) : null,
  }
}

// ---------------------------------------------------------------------------
// Jornada e próximo passo
// ---------------------------------------------------------------------------

const ROTULOS_JORNADA: readonly [IdPassoJornada, string][] = [
  ['captado', 'Captado'],
  ['atribuido', 'Atribuído'],
  ['contato', 'Contato'],
  ['oferta', 'Oferta'],
  ['negociacao', 'Negociação'],
  ['fechado', 'Fechado'],
]

const NIVEL_ETAPA: Record<EtapaLead, number> = { novo: 0, em_contato: 1, proposta: 2, negociacao: 3, ganho: 4, perdido: -1 }

/**
 * 6 passos. "Alcançou" = etapa atual (exceto perdido) ou etapa de algum evento
 * `etapa` (`dados.para`). Passo anterior a um passo feito sem evidência → `pulado`;
 * o primeiro passo pendente é `agora`; lead encerrado nunca tem `agora`/`falta`.
 */
export function jornadaDoLead(
  lead: LeadParaJornada,
  eventos: readonly Pick<EventoLeadRegra, 'tipo' | 'dados'>[],
): PassoJornada[] {
  let nivel = NIVEL_ETAPA[lead.etapa]
  for (const e of eventos) {
    if (e.tipo !== 'etapa') continue
    const para = e.dados?.para
    if (typeof para === 'string' && para in NIVEL_ETAPA) nivel = Math.max(nivel, NIVEL_ETAPA[para as EtapaLead])
  }
  const teveContato = lead.ultimoContatoEm !== null || eventos.some(e => EVENTOS_DE_CONTATO.includes(e.tipo))
  const encerrado = lead.etapa === 'ganho' || lead.etapa === 'perdido'

  const feitos: boolean[] = [true, lead.agenteId !== null, teveContato || nivel >= 1, nivel >= 2, nivel >= 3, encerrado]
  const ultimoFeito = feitos.lastIndexOf(true)
  let agoraMarcado = false
  return ROTULOS_JORNADA.map(([id, rotulo], i) => {
    let estado: EstadoPassoJornada
    if (feitos[i]) estado = 'feito'
    else if (i < ultimoFeito || encerrado) estado = 'pulado'
    else if (!agoraMarcado) {
      estado = 'agora'
      agoraMarcado = true
    } else estado = 'falta'
    const passo: PassoJornada = { id, rotulo, estado }
    if (id === 'fechado' && encerrado) passo.resultado = lead.etapa === 'ganho' ? 'ganho' : 'perdido'
    return passo
  })
}

/**
 * Ordem: encerrado → sistema; sem dono → você (atender); com próximo passo
 * agendado → ele (atrasado se `em < agora`); proposta sem passo → cliente; sem
 * contato → primeiro contato; senão → definir próximo passo.
 */
export function proximoPassoDoLead(lead: LeadParaProximoPasso, agora: Date): ProximoPasso {
  if (lead.etapa === 'ganho' || lead.etapa === 'perdido') return { quem: 'sistema', texto: 'Encerrado', atrasado: false }
  if (lead.agenteId === null) return { quem: 'voce', texto: 'Atender este lead', atrasado: false }
  const texto = lead.proximoPasso?.trim()
  if (lead.proximoPassoEm) {
    return {
      quem: 'voce',
      texto: texto || 'Retomar o contato',
      atrasado: lead.proximoPassoEm.getTime() < agora.getTime(),
    }
  }
  if (texto) return { quem: 'voce', texto, atrasado: false }
  if (lead.etapa === 'proposta') return { quem: 'cliente', texto: 'Aguardando resposta à proposta', atrasado: false }
  if (lead.ultimoContatoEm === null) return { quem: 'voce', texto: 'Fazer o primeiro contato', atrasado: false }
  return { quem: 'voce', texto: 'Definir o próximo passo', atrasado: false }
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

function comVariacao(atual: number, anterior: number): NumeroComVariacao {
  const variacao = anterior === 0 ? (atual > 0 ? 100 : 0) : arredondar1(((atual - anterior) / anterior) * 100)
  return { atual, anterior, variacao }
}

/**
 * Janelas de 7 dias: atual = (agora−7d, agora]; anterior = (agora−14d, agora−7d].
 * Contatos = eventos de contato; reuniões = `reuniao`; propostas = eventos `etapa`
 * com `dados.para === 'proposta'`; vendas = leads com `ganhoEm` na janela.
 */
export function numerosDaSemana(
  eventos: readonly EventoLeadRegra[],
  leads: readonly LeadParaSemana[],
  agora: Date,
): NumerosDaSemana {
  const t = agora.getTime()
  const naJanela = (d: Date, k: 0 | 1) => {
    const x = d.getTime()
    return x > t - (k + 1) * 7 * MS_DIA && x <= t - k * 7 * MS_DIA
  }
  const conta = (pred: (e: EventoLeadRegra) => boolean, k: 0 | 1) => eventos.filter(e => pred(e) && naJanela(e.em, k)).length
  const contato = (e: EventoLeadRegra) => EVENTOS_DE_CONTATO.includes(e.tipo)
  const reuniao = (e: EventoLeadRegra) => e.tipo === 'reuniao'
  const proposta = (e: EventoLeadRegra) => e.tipo === 'etapa' && e.dados?.para === 'proposta'
  const vendas = (k: 0 | 1) => leads.filter(l => l.ganhoEm && naJanela(l.ganhoEm, k)).length
  return {
    contatos: comVariacao(conta(contato, 0), conta(contato, 1)),
    reunioes: comVariacao(conta(reuniao, 0), conta(reuniao, 1)),
    propostas: comVariacao(conta(proposta, 0), conta(proposta, 1)),
    vendas: comVariacao(vendas(0), vendas(1)),
  }
}

export function resumirFunil(leads: readonly LeadParaFunil[]): ResumoFunil {
  const porEtapa: Record<EtapaLead, number> = { novo: 0, em_contato: 0, proposta: 0, negociacao: 0, ganho: 0, perdido: 0 }
  let valorEmNegociacao = 0
  for (const l of leads) {
    porEtapa[l.etapa]++
    if (l.etapa === 'negociacao') valorEmNegociacao += l.valorEstimado ?? 0
  }
  const total = leads.length
  return {
    porEtapa,
    total,
    ganhos: porEtapa.ganho,
    perdidos: porEtapa.perdido,
    taxaConversao: total === 0 ? 0 : arredondar1((porEtapa.ganho / total) * 100),
    valorEmNegociacao: arredondarCentavos(valorEmNegociacao),
  }
}

/**
 * Todos os agentes informados entram (mesmo com zero). Ordena por fechamentos desc,
 * valor desc, nome, id. Comissão = soma das não canceladas do beneficiário.
 */
export function rankingDeAgentes(
  leads: readonly LeadParaRanking[],
  comissoes: readonly ComissaoParaRanking[],
  agentes: readonly { id: string; nome: string }[],
): LinhaRanking[] {
  const linhas = agentes.map(a => {
    const ganhos = leads.filter(l => l.agenteId === a.id && l.etapa === 'ganho')
    const comissao = comissoes
      .filter(c => c.beneficiarioAgenteId === a.id && c.status !== 'cancelada')
      .reduce((s, c) => s + c.valor, 0)
    return {
      agenteId: a.id,
      nome: a.nome,
      fechamentos: ganhos.length,
      valor: arredondarCentavos(ganhos.reduce((s, l) => s + (l.valorEstimado ?? 0), 0)),
      comissao: arredondarCentavos(comissao),
    }
  })
  linhas.sort(
    (x, y) =>
      y.fechamentos - x.fechamentos ||
      y.valor - x.valor ||
      x.nome.localeCompare(y.nome, 'pt-BR') ||
      (x.agenteId < y.agenteId ? -1 : x.agenteId > y.agenteId ? 1 : 0),
  )
  return linhas.map((l, i) => ({ posicao: i + 1, ...l }))
}

// ---------------------------------------------------------------------------
// Auto-compra (o agente comprando de si mesmo)
// ---------------------------------------------------------------------------

/** Motivo gravado quando a venda não comissiona porque o comprador é o próprio agente. */
export const MOTIVO_AUTO_COMPRA = 'auto_compra'

export interface DadosDePessoa {
  cpf?: string | null
  email?: string | null
  telefone?: string | null
}

const soDigitos = (valor: string | null | undefined): string => (valor ?? '').replace(/\D/g, '')

/** Telefone só com dígitos e sem o DDI 55 (13/12 dígitos com 55 na frente viram 11/10). */
function telefoneNormalizado(valor: string | null | undefined): string {
  const digitos = soDigitos(valor)
  return digitos.length > 11 && digitos.startsWith('55') ? digitos.slice(2) : digitos
}

/**
 * O comprador é o próprio agente? CPF (só dígitos, 11), e-mail (sem diferenciar maiúsculas) ou
 * telefone (só dígitos, mínimo 8) iguais. Campo vazio de qualquer lado nunca casa.
 */
export function compradorEhOAgente(agente: DadosDePessoa, comprador: DadosDePessoa): boolean {
  const cpfAgente = soDigitos(agente.cpf)
  const cpfComprador = soDigitos(comprador.cpf)
  if (cpfAgente.length === 11 && cpfAgente === cpfComprador) return true
  const emailAgente = (agente.email ?? '').trim().toLowerCase()
  const emailComprador = (comprador.email ?? '').trim().toLowerCase()
  if (emailAgente && emailAgente === emailComprador) return true
  const telAgente = telefoneNormalizado(agente.telefone)
  const telComprador = telefoneNormalizado(comprador.telefone)
  return telAgente.length >= 8 && telAgente === telComprador
}
