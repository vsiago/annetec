import type { EtapaLead, VendasLead } from '@annetec/contracts'
import type { LeadCardMenuItem } from '../ui/lead-card'
import type { AbaLead, DialogoLead } from '../lead/lead-detalhe'

/** O que as peças do Funil (quadro, lista, celular) pedem à página. */
export interface AcoesDoFunil {
  agora: Date
  /** Quem enxerga a equipe vê o avatar do responsável no card. */
  mostrarAgente: boolean
  /** Perfil ativo: pode arrastar, registrar contato, mover. */
  podeEscrever: boolean
  abrir: (lead: VendasLead, extra?: { aba?: AbaLead; dialogo?: DialogoLead }) => void
  menu: (lead: VendasLead) => LeadCardMenuItem[]
  /** Soltou (ou escolheu no menu) o lead numa etapa: a página decide mover, pedir motivo/confirmação ou recusar. */
  pedirMover: (lead: VendasLead, para: EtapaLead, origem: 'arrasto' | 'menu') => void
  aoLigouOuChamou: (lead: VendasLead, canal: 'ligacao' | 'whatsapp') => void
  /** Disponíveis: "Atender" (ou "Atribuir" para quem não tem perfil de agente). */
  atender: (lead: VendasLead) => void
  atendendoId: string | null
  /** Master sem perfil de agente não assume leads: a ação vira "Atribuir". */
  podeAtender: boolean
}
