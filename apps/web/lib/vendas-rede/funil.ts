import {
  ETAPA_LEAD_LABELS,
  type EtapaLead,
  type PapelComercial,
  type TemperaturaLead,
  type VendasLead,
} from '@annetec/contracts'

/**
 * Regras e textos do Funil (quadro/lista). Só funções puras: rodam no cliente e no servidor.
 * As transições espelham `transicaoPermitida` da API: o servidor continua sendo a regra de
 * verdade, aqui só adiantamos a resposta (e o motivo) para quem arrasta um card.
 */

const MIN = 60_000
const HORA = 60 * MIN
const DIA = 24 * HORA

/** Depois de quantos minutos um lead Disponível passa a pedir pressa (âmbar). */
export const ESPERA_ALERTA_MIN = 15

export type EtapaAberta = 'novo' | 'em_contato' | 'proposta' | 'negociacao'
export const ETAPAS_ABERTAS: readonly EtapaAberta[] = ['novo', 'em_contato', 'proposta', 'negociacao']

/** O que o vendedor faz para o lead chegar em cada etapa (orienta o vazio da coluna). */
export const VAZIO_DA_ETAPA: Record<EtapaAberta, { titulo: string; dica: string }> = {
  novo: { titulo: 'Nenhum lead novo', dica: 'Assuma um lead em Disponíveis ou cadastre o seu com "Novo lead".' },
  em_contato: { titulo: 'Nenhum lead em contato', dica: 'Registre o primeiro contato de um lead novo e ele vem para cá.' },
  proposta: { titulo: 'Nenhum lead em proposta', dica: 'Envie uma proposta pela aba Venda do lead.' },
  negociacao: { titulo: 'Nenhum lead em negociação', dica: 'Quando o cliente responder à proposta, mova o lead para cá.' },
}

// ---------------------------------------------------------------------------
// Cores por etapa e por temperatura (classes completas: o Tailwind precisa vê-las inteiras)
// ---------------------------------------------------------------------------

export const COR_DA_ETAPA: Record<EtapaAberta, { faixa: string; chip: string; ponto: string }> = {
  novo: { faixa: 'bg-[#1570EF]', chip: 'bg-[#E8F1FD] text-[#175CD3]', ponto: 'bg-[#1570EF]' },
  em_contato: { faixa: 'bg-[#1E2A4A]', chip: 'bg-[#E5EDF5] text-[#1E2A4A]', ponto: 'bg-[#1E2A4A]' },
  proposta: { faixa: 'bg-[#7A5AF8]', chip: 'bg-[#EFEBFD] text-[#5925DC]', ponto: 'bg-[#7A5AF8]' },
  negociacao: { faixa: 'bg-[#DC6803]', chip: 'bg-[#FEF3DC] text-[#B54708]', ponto: 'bg-[#DC6803]' },
}

export const TEMPERATURA_ESTILO: Record<TemperaturaLead, { chip: string; ring: string }> = {
  quente: { chip: 'bg-[#FFEAD5] text-[#B93815]', ring: 'ring-[#F79009]/40' },
  morna: { chip: 'bg-[#FEF0C7] text-[#93370D]', ring: 'ring-[#FDB022]/40' },
  fria: { chip: 'bg-[#E8F1FD] text-[#175CD3]', ring: 'ring-[#1570EF]/30' },
}

// ---------------------------------------------------------------------------
// Tempo e próximo passo
// ---------------------------------------------------------------------------

const hhmm = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** "18 min", "2 h", "3 dias" (sem "há"). Mínimo "1 min". */
export function duracao(ms: number): string {
  const d = Math.max(0, ms)
  if (d < HORA) return `${Math.max(1, Math.floor(d / MIN))} min`
  if (d < DIA) return plural(Math.floor(d / HORA), 'h', 'h')
  return plural(Math.floor(d / DIA), 'dia', 'dias')
}

export interface EsperaDisponivel {
  minutos: number
  /** "esperando há 18 min". */
  texto: string
  /** Passou de 15 min: pede pressa. */
  urgente: boolean
}

export function esperaDoDisponivel(lead: Pick<VendasLead, 'poolDesde' | 'createdAt'>, agora: number = Date.now()): EsperaDisponivel {
  const desde = Date.parse(lead.poolDesde ?? lead.createdAt)
  const ms = Number.isFinite(desde) ? Math.max(0, agora - desde) : 0
  const minutos = Math.floor(ms / MIN)
  return { minutos, texto: minutos < 1 ? 'chegou agora' : `esperando há ${duracao(ms)}`, urgente: minutos > ESPERA_ALERTA_MIN }
}

export type EstadoPasso = 'atrasado' | 'hoje' | 'futuro' | 'sem'

export interface LinhaProximoPasso {
  estado: EstadoPasso
  /** "Hoje, 14:00", "Amanhã, 09:00", "12/11, 10:00", "Atrasado há 2 dias", "Sem próximo passo". */
  texto: string
  /** O que fazer ("Ligar de novo"), quando há. */
  acao: string | null
}

/** Linha do próximo passo com estado (cor + ícone ficam por conta de quem desenha). */
export function linhaDoProximoPasso(
  lead: Pick<VendasLead, 'proximoPasso' | 'proximoPassoEm'>,
  agora: Date = new Date(),
): LinhaProximoPasso {
  const acao = lead.proximoPasso?.trim() || null
  if (!lead.proximoPassoEm) return { estado: 'sem', texto: 'Sem próximo passo', acao: null }
  const quando = new Date(lead.proximoPassoEm)
  if (Number.isNaN(quando.getTime())) return { estado: 'sem', texto: 'Sem próximo passo', acao: null }
  if (quando.getTime() < agora.getTime()) {
    const atraso = agora.getTime() - quando.getTime()
    const texto = atraso < DIA ? (mesmoDia(quando, agora) ? `Atrasado há ${duracao(atraso)}` : 'Atrasado desde ontem') : `Atrasado há ${duracao(atraso)}`
    return { estado: 'atrasado', texto, acao }
  }
  if (mesmoDia(quando, agora)) return { estado: 'hoje', texto: `Hoje, ${hhmm(quando)}`, acao }
  if (mesmoDia(quando, new Date(agora.getTime() + DIA))) return { estado: 'futuro', texto: `Amanhã, ${hhmm(quando)}`, acao }
  const data = quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return { estado: 'futuro', texto: `${data}, ${hhmm(quando)}`, acao }
}

/** "Chegou hoje", "há 1 dia nesta etapa", "há 3 dias nesta etapa". */
export function textoDiasNaEtapa(lead: Pick<VendasLead, 'etapaDesde' | 'updatedAt'>, agora: number = Date.now()): string | null {
  const desde = Date.parse(lead.etapaDesde ?? lead.updatedAt)
  if (!Number.isFinite(desde)) return null
  const dias = Math.max(0, Math.floor((agora - desde) / DIA))
  if (dias === 0) return 'Chegou hoje'
  return `há ${plural(dias, 'dia', 'dias')} nesta etapa`
}

/** Link `tel:` com o telefone só em dígitos (null se não houver). */
export function linkTelefone(telefone: string | null | undefined): string | null {
  const d = (telefone ?? '').replace(/\D/g, '')
  return d.length >= 8 ? `tel:+${d.length <= 11 ? `55${d}` : d}` : null
}

// ---------------------------------------------------------------------------
// Resumo do cabeçalho
// ---------------------------------------------------------------------------

export interface ResumoFunilTexto {
  andamento: string
  negociacao: string | null
  atrasados: { texto: string; ok: boolean }
}

export function textoDoResumo(
  resumo: { emAndamento: number; valorNegociacao: number; atrasados: number },
  moedaCompacta: (v: number) => string,
): ResumoFunilTexto {
  return {
    andamento: `${resumo.emAndamento.toLocaleString('pt-BR')} em andamento`,
    negociacao: resumo.valorNegociacao > 0 ? `${moedaCompacta(resumo.valorNegociacao)} em negociação` : null,
    atrasados:
      resumo.atrasados === 0
        ? { texto: 'nenhum atrasado', ok: true }
        : { texto: `${resumo.atrasados.toLocaleString('pt-BR')} ${resumo.atrasados === 1 ? 'atrasado' : 'atrasados'}`, ok: false },
  }
}

// ---------------------------------------------------------------------------
// Mover de etapa (arrastar ou menu)
// ---------------------------------------------------------------------------

const TRANSICOES: Record<EtapaLead, readonly EtapaLead[]> = {
  novo: ['em_contato', 'perdido'],
  em_contato: ['proposta', 'negociacao', 'perdido', 'novo'],
  proposta: ['negociacao', 'ganho', 'perdido', 'em_contato'],
  negociacao: ['ganho', 'perdido', 'proposta'],
  perdido: ['novo'],
  ganho: [],
}

/** Espelho de `transicaoPermitida` da API (`ganho` só o master reabre). */
export function transicaoPermitida(de: EtapaLead, para: EtapaLead, papel: PapelComercial): boolean {
  if (de === para) return false
  if (de === 'ganho') return papel === 'master'
  return TRANSICOES[de].includes(para)
}

export type VeredictoMover =
  | { tipo: 'mesma-etapa' }
  | { tipo: 'mover' }
  | { tipo: 'perdido' }
  | { tipo: 'ganho-confirmar' }
  | { tipo: 'ganho-bloqueado'; motivo: string }
  | { tipo: 'invalido'; motivo: string }

/** Dica do que fazer quando o salto não é permitido. */
function dicaDoSalto(de: EtapaLead, para: EtapaLead): string {
  if (de === 'novo' && (para === 'proposta' || para === 'negociacao' || para === 'ganho')) {
    return 'Registre o primeiro contato antes: o lead precisa passar por Em contato.'
  }
  if (de === 'em_contato' && para === 'ganho') return 'Envie a proposta primeiro: o lead precisa passar por Proposta.'
  if (de === 'negociacao' && (para === 'novo' || para === 'em_contato')) return 'De Negociação o lead só volta um passo, para Proposta.'
  if (de === 'proposta' && para === 'novo') return 'De Proposta o lead só volta para Em contato.'
  if (de === 'ganho') return 'Venda ganha é final: só o master pode reabrir.'
  if (de === 'perdido') return 'Lead perdido só volta para Novo (reabrir).'
  return 'Siga o caminho do funil: Novo, Em contato, Proposta e Negociação.'
}

/**
 * O que acontece ao soltar o card de `de` em `para`: mover direto, pedir motivo (perdido),
 * pedir confirmação (ganho manual, só master e gerente) ou recusar com o motivo.
 * `comVenda`: o lead já tem proposta/adesão vinculada (o ganho dispensa a confirmação).
 */
export function avaliarMovimento(
  lead: Pick<VendasLead, 'etapa' | 'conversao'>,
  para: EtapaLead,
  papel: PapelComercial,
): VeredictoMover {
  const de = lead.etapa
  if (de === para) return { tipo: 'mesma-etapa' }
  if (!transicaoPermitida(de, para, papel)) {
    return {
      tipo: 'invalido',
      motivo: `Não dá para mover de ${ETAPA_LEAD_LABELS[de]} para ${ETAPA_LEAD_LABELS[para]}. ${dicaDoSalto(de, para)}`,
    }
  }
  if (para === 'perdido') return { tipo: 'perdido' }
  if (para === 'ganho' && !lead.conversao) {
    if (papel !== 'master' && papel !== 'gerente') {
      return {
        tipo: 'ganho-bloqueado',
        motivo: 'A venda fecha quando o cliente paga. Envie a proposta ou o link de adesão.',
      }
    }
    return { tipo: 'ganho-confirmar' }
  }
  return { tipo: 'mover' }
}

/** Etapas para onde o lead pode ir pelo menu do card (já filtradas pelo que o papel pode fazer). */
export function destinosDoMenu(lead: Pick<VendasLead, 'etapa' | 'conversao'>, papel: PapelComercial): EtapaLead[] {
  const todas: EtapaLead[] = ['novo', 'em_contato', 'proposta', 'negociacao', 'ganho', 'perdido']
  return todas.filter(para => {
    const v = avaliarMovimento(lead, para, papel)
    return v.tipo === 'mover' || v.tipo === 'perdido' || v.tipo === 'ganho-confirmar' || v.tipo === 'ganho-bloqueado'
  })
}

export const MOTIVOS_DE_PERDA = [
  'Sem interesse',
  'Preço',
  'Sem resposta',
  'Escolheu outra opção',
  'Outro',
] as const

/** Ordem de exibição usada em listas planas: atrasados, temperatura, mais antigos na etapa (espelho da API). */
const PESO_TEMP: Record<TemperaturaLead, number> = { quente: 0, morna: 1, fria: 2 }
export function compararLeads(a: VendasLead, b: VendasLead): number {
  const atrasadoA = Boolean(a.proximoPassoInfo?.atrasado)
  const atrasadoB = Boolean(b.proximoPassoInfo?.atrasado)
  if (atrasadoA !== atrasadoB) return atrasadoA ? -1 : 1
  const pa = a.temperatura ? PESO_TEMP[a.temperatura] : 3
  const pb = b.temperatura ? PESO_TEMP[b.temperatura] : 3
  if (pa !== pb) return pa - pb
  return Date.parse(a.etapaDesde ?? a.updatedAt) - Date.parse(b.etapaDesde ?? b.updatedAt)
}

/** Iniciais para o avatar do responsável ("Maria Souza" vira "MS"). */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  const primeira = partes[0]!.charAt(0)
  const ultima = partes.length > 1 ? partes[partes.length - 1]!.charAt(0) : ''
  return (primeira + ultima).toLocaleUpperCase('pt-BR')
}
