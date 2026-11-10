/**
 * Tipos de apresentação do módulo Rede Comercial. São locais de propósito:
 * o kit não depende dos contratos da API (as telas convertem os dados antes).
 */

export type Etapa = 'novo' | 'em_contato' | 'proposta' | 'negociacao' | 'ganho' | 'perdido'

export type Origem =
  | 'site'
  | 'indicacao'
  | 'balcao'
  | 'prospeccao'
  | 'evento'
  | 'redes_sociais'
  | 'importacao'
  | 'link'
  | 'outro'

export type PapelComercial = 'master' | 'gerente' | 'supervisor' | 'vendedor' | 'balcao'

export type EstadoPasso = 'feito' | 'agora' | 'falta' | 'pulado'

export type PassoJornada = {
  /** Identificador estável: captado, atribuido, contato, oferta, negociacao, fechado. */
  id: string
  rotulo: string
  estado: EstadoPasso
}

/** Os 6 passos padrão, na ordem. */
export const JORNADA_ROTULOS: ReadonlyArray<{ id: string; rotulo: string }> = [
  { id: 'captado', rotulo: 'Captado' },
  { id: 'atribuido', rotulo: 'Atribuído' },
  { id: 'contato', rotulo: 'Contato' },
  { id: 'oferta', rotulo: 'Oferta' },
  { id: 'negociacao', rotulo: 'Negociação' },
  { id: 'fechado', rotulo: 'Fechado' },
]

export type ProximoPasso = {
  texto: string
  /** Data já formatada para exibição ("hoje 15h", "ontem"). */
  quando?: string
  atrasado?: boolean
  quem?: 'voce' | 'cliente' | 'sistema'
}

export type TipoEvento =
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

export type EventoLead = {
  id: string
  tipo: TipoEvento
  texto: string
  /** Data já formatada ("hoje, 14:32"). */
  quando: string
  autor?: string
}

export type StatusComissao = 'prevista' | 'a_pagar' | 'paga' | 'cancelada' | 'a_descontar'
