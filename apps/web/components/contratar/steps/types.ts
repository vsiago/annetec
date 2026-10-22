import type { OnboardingApplicantView } from '@annetec/contracts'
import type { WizardStep } from '@/lib/adapters/contratacao'

/** O que toda etapa do wizard recebe. */
export interface StepContext {
  view: OnboardingApplicantView
  proposalId: string
  chave: string
  /** Aplica a visão devolvida pela API (e, se pedido, avança). */
  onSaved: (view: OnboardingApplicantView, options?: { advance?: boolean; message?: string }) => void
  goTo: (step: WizardStep) => void
  goNext: () => void
  goBack: (() => void) | null
  /**
   * CPFs completos digitados NESTA sessão (id da pessoa → 11 dígitos). A API
   * devolve o CPF mascarado na visão do candidato; para regravar a lista de
   * pessoas sem pedir o CPF de novo, a tela lembra o que acabou de enviar.
   * Só em memória: some ao fechar a aba.
   */
  cpfCache: Map<string, string>
}
