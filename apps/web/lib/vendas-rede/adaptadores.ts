import type { PapelComercial, VendasLead, VendasLeadEvento } from '@annetec/contracts'
import { JORNADA_ROTULOS, type EventoLead, type LeadCardDados, type PassoJornada, type ProximoPasso, type TipoEvento } from '@/components/vendas-rede'

/**
 * Converte os contratos da API nos formatos de apresentação do kit
 * (`components/vendas-rede/ui`). Só funções puras: roda no cliente e no servidor.
 */

const MIN = 60_000
const HORA = 60 * MIN
const DIA = 24 * HORA

/** "agora", "há 20 min", "há 3 h", "há 2 dias". */
export function tempoDecorrido(iso: string | null | undefined, agora: number = Date.now()): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const dif = Math.max(0, agora - t)
  if (dif < MIN) return 'agora'
  if (dif < HORA) return `há ${Math.floor(dif / MIN)} min`
  if (dif < DIA) return `há ${Math.floor(dif / HORA)} h`
  const dias = Math.floor(dif / DIA)
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`
}

function hora(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

/** "hoje 15h", "amanhã 9h30", "ontem", "12/11". Para datas já passadas, usa o dia. */
export function quandoPasso(iso: string | null | undefined, agora: Date = new Date()): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return undefined
  const amanha = new Date(agora.getTime() + DIA)
  const ontem = new Date(agora.getTime() - DIA)
  if (mesmoDia(d, agora)) return `hoje ${hora(d)}`
  if (mesmoDia(d, amanha)) return `amanhã ${hora(d)}`
  if (mesmoDia(d, ontem)) return 'ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

/** "hoje, 14:32", "ontem, 09:10", "12/11, 16:00". */
export function quandoEvento(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (mesmoDia(d, agora)) return `hoje, ${h}`
  if (mesmoDia(d, new Date(agora.getTime() - DIA))) return `ontem, ${h}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${h}`
}

export function jornadaDoLead(lead: Pick<VendasLead, 'jornada'>): PassoJornada[] {
  const porPasso = new Map((lead.jornada ?? []).map(p => [p.passo as string, p.estado]))
  return JORNADA_ROTULOS.map(p => ({ id: p.id, rotulo: p.rotulo, estado: porPasso.get(p.id) ?? 'falta' }))
}

export function proximoPassoDoCard(lead: VendasLead, agora: Date = new Date()): ProximoPasso | null {
  if (lead.proximoPassoInfo) {
    return {
      texto: lead.proximoPassoInfo.texto,
      quando: quandoPasso(lead.proximoPassoEm, agora),
      atrasado: lead.proximoPassoInfo.atrasado,
      quem: lead.proximoPassoInfo.quem,
    }
  }
  if (lead.proximoPasso) {
    const atrasado = lead.proximoPassoEm ? Date.parse(lead.proximoPassoEm) < agora.getTime() : false
    return { texto: lead.proximoPasso, quando: quandoPasso(lead.proximoPassoEm, agora), atrasado, quem: 'voce' }
  }
  return null
}

/** Dados do `LeadCard`. `mostrarAgente`: quem enxerga a equipe vê com quem o lead está. */
export function leadParaCard(lead: VendasLead, opcoes: { mostrarAgente?: boolean; agora?: Date } = {}): LeadCardDados {
  const agora = opcoes.agora ?? new Date()
  const noPool = lead.agenteId === null && lead.etapa === 'novo'
  let proximo = proximoPassoDoCard(lead, agora)
  if (noPool && lead.poolDesde) {
    const espera = agora.getTime() - Date.parse(lead.poolDesde)
    proximo = { texto: `Esperando atendimento ${tempoDecorrido(lead.poolDesde, agora.getTime())}`, atrasado: espera > 15 * MIN, quem: 'sistema' }
  }
  const dias = !noPool ? Math.max(0, Math.floor((agora.getTime() - Date.parse(lead.updatedAt)) / DIA)) : undefined
  return {
    id: lead.id,
    nome: lead.nome,
    origem: lead.origem,
    origemDetalhe: lead.origemDetalhe,
    cidade: lead.cidade,
    uf: lead.uf,
    planoInteresse: lead.interessePlanoNome,
    etapa: lead.etapa,
    jornada: jornadaDoLead(lead),
    proximoPasso: proximo,
    diasNaEtapa: Number.isFinite(dias) ? dias : undefined,
    agenteNome: opcoes.mostrarAgente ? (lead.agenteNome ?? null) : null,
  }
}

const TIPOS_EVENTO_KIT: ReadonlySet<string> = new Set<TipoEvento>([
  'criado',
  'reivindicado',
  'atribuido',
  'devolvido_pool',
  'etapa',
  'ligacao',
  'whatsapp',
  'email',
  'reuniao',
  'visita',
  'nota',
  'atendimento_balcao',
  'proximo_passo',
  'conversao',
  'sistema',
])

export function eventosParaTimeline(eventos: VendasLeadEvento[] | undefined, agora: Date = new Date()): EventoLead[] {
  return (eventos ?? []).map(e => ({
    id: e.id,
    tipo: (TIPOS_EVENTO_KIT.has(e.tipo) ? e.tipo : 'sistema') as TipoEvento,
    texto: e.texto ?? '',
    quando: quandoEvento(e.em, agora),
    autor: e.porNome ?? undefined,
  }))
}

/** Quem enxerga mais do que o próprio funil (filtro por agente, coluna "Com …"). */
export function veEquipe(papel: PapelComercial): boolean {
  return papel === 'master' || papel === 'gerente' || papel === 'supervisor'
}

/** Menor ISO local de "amanhã às 9h" etc. para o seletor de próximo passo (`datetime-local`). */
export function paraDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
