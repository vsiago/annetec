import type { PageMeta, TotaisComissao } from '@annetec/contracts'

/** Onde a Rede Comercial está rodando: console/área da plataforma ou um clube. */
export type EscopoRede = { kind: 'platform' } | { kind: 'tenant'; slug: string }

export type PaginaRede<T> = { items: T[]; meta: PageMeta }

/** Resultado do envio do acesso ao agente. `senhaProvisoria` só vem se a API a devolver. */
export type ConviteResultado = {
  enviado: boolean
  status: string
  contaNova?: boolean
  senhaProvisoria?: string | null
}

export type DesempenhoAgente = {
  agenteId: string
  periodo: '30d' | 'mes' | 'trimestre'
  desde: string
  ate: string
  kpis: {
    leadsRecebidos: number
    contatos: number
    propostas: number
    ganhos: number
    taxaConversao: number
    valorGanho: number
    comissaoPrevista: number
    comissaoAPagar: number
    comissaoPaga: number
  }
}

export type ResumoBeneficiario = {
  beneficiarioAgenteId: string | null
  beneficiarioCorretoraId: string | null
  nome: string
  totais: TotaisComissao
  liquido: number
}

export type ResumoComissoes = { mes: string; beneficiarios: ResumoBeneficiario[]; totais: TotaisComissao }

export type ResultadoRemocao = { resultado: 'removida' | 'inativada' }
