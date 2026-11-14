import type { CandidaturaPublica } from '@annetec/contracts'
import type { Escopo } from './escopo'

/** O que cada etapa do wizard recebe. */
export interface StepContext {
  escopo: Escopo
  view: CandidaturaPublica
  chave: string
  /** Atualiza a candidatura (resposta da API) no estado da tela. */
  onViewChange: (view: CandidaturaPublica) => void
  goBack: (() => void) | null
  goNext: () => void
}

export const WIZARD_STEPS = [
  { id: 'dados', label: 'Seus dados' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'revisao', label: 'Revisão e envio' },
] as const

export const FALHA_SERVIDOR = 'Não foi possível falar com o servidor. Verifique a conexão e tente novamente.'
