import type { EstacaoLead, EtapaLead, OrigemLead, VendasLead } from '@annetec/contracts'

/** Plano que o agente pode oferecer (plataforma: plano ANNETEC; clube: plano do clube). */
export interface PlanoVendavel {
  id: string
  nome: string
  precoMensal: number
  adesao: number
  descricao?: string | null
}

export type SituacaoCarteira = 'ativa' | 'atrasada' | 'cancelada' | 'pendente'

export interface ItemCarteira {
  lead: VendasLead
  situacao: SituacaoCarteira
  /** Frase pronta ("Ativa · vence em 12 dias"). */
  resumo: string
  assinatura: {
    id: string
    status: string
    planoNome: string
    valorMensal: number
    proximoVencimento: string | null
  } | null
  clube: {
    propostaId: string
    propostaStatus: string
    organizacaoId: string | null
    nome: string | null
    planoNome: string | null
  } | null
}

export interface CarteiraResposta {
  items: ItemCarteira[]
  totais: Record<SituacaoCarteira, number>
  total: number
}

export interface ContadoresLeads {
  pool: number
  novos: number
  andamento: number
  fechados: number
}

export interface LinkAdesao {
  url: string
  planoId: string
  planoNome: string
  ref: string | null
}

export interface FiltrosLeads {
  estacao?: EstacaoLead
  etapa?: EtapaLead
  agente?: string
  origem?: OrigemLead
  busca?: string
  page?: number
  perPage?: number
}
