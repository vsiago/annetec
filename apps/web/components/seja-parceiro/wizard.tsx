'use client'

import { useEffect, useRef, useState } from 'react'
import { CANDIDATURA_DOCUMENTOS_OBRIGATORIOS, type CandidaturaPublica } from '@annetec/contracts'
import { Stepper } from '@/components/contratar/stepper'
import { Panel } from '@/components/contratar/ui'
import type { Escopo } from './escopo'
import { DadosStep } from './dados-step'
import { DocumentosStep } from './documentos-step'
import { RevisaoStep } from './revisao-step'
import { WIZARD_STEPS, type StepContext } from './steps'

function firstIncomplete(view: CandidaturaPublica): number {
  if (!view.endereco) return 0
  const obrigatorios = CANDIDATURA_DOCUMENTOS_OBRIGATORIOS[view.tipoPessoa]
  if (obrigatorios.some(kind => !view.documentos.some(doc => doc.kind === kind))) return 1
  return 2
}

/** Wizard de 3 etapas do rascunho: dados → documentos → revisão e envio. */
export function Wizard({
  escopo,
  view,
  chave,
  onViewChange,
}: {
  escopo: Escopo
  view: CandidaturaPublica
  chave: string
  onViewChange: (view: CandidaturaPublica) => void
}) {
  const [step, setStep] = useState(() => firstIncomplete(view))
  const container = useRef<HTMLDivElement>(null)
  const first = useRef(true)

  const dadosOk = Boolean(view.endereco)
  const docsOk = CANDIDATURA_DOCUMENTOS_OBRIGATORIOS[view.tipoPessoa].every(kind => view.documentos.some(doc => doc.kind === kind))

  // Ao trocar de etapa, leva o foco ao título dela (leitor de tela e teclado).
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    container.current?.querySelector<HTMLElement>('h2')?.focus()
    container.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [step])

  const ctx: StepContext = {
    escopo,
    view,
    chave,
    onViewChange,
    goBack: step > 0 ? () => setStep(step - 1) : null,
    goNext: () => setStep(current => Math.min(current + 1, WIZARD_STEPS.length - 1)),
  }

  return (
    <div className="space-y-6">
      <Stepper
        label="Etapas da candidatura"
        current={step}
        onSelect={setStep}
        canSelect={index => index === 0 || dadosOk}
        steps={WIZARD_STEPS.map((item, index) => ({
          id: item.id,
          label: item.label,
          complete: index === 0 ? dadosOk : index === 1 ? dadosOk && docsOk : false,
        }))}
      />
      <div ref={container} className="scroll-mt-24">
        <Panel>
          {step === 0 ? <DadosStep ctx={ctx} /> : step === 1 ? <DocumentosStep ctx={ctx} /> : <RevisaoStep ctx={ctx} />}
        </Panel>
      </div>
    </div>
  )
}
