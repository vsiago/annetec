'use client'

import { AlertTriangle, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StepState, WizardStepView } from './use-wizard'

/**
 * Trilha de etapas. No desktop: ícone, número e nome de cada etapa, ligados
 * por uma linha que vai ficando coral conforme a pessoa avança. No celular:
 * "Etapa 2 de 4 · Nome" e uma barra de progresso.
 *
 * Etapa concluída (ou já visitada) é botão: clicar volta para ela.
 */

const STATE_LABEL: Record<StepState, string> = {
  current: 'etapa atual',
  complete: 'concluída',
  error: 'com erro',
  pending: 'pendente',
}

function circleClass(state: StepState, isCurrent: boolean) {
  if (state === 'error') {
    return cn(
      'border-[#B42318] bg-[#FEF3F2] text-[#B42318]',
      isCurrent && 'shadow-[0_0_0_4px_rgba(180,35,24,0.14)]',
    )
  }
  if (isCurrent) return 'border-primary bg-primary text-white shadow-[0_0_0_4px_rgba(232,67,100,0.16)]'
  if (state === 'complete') return 'border-secondary bg-secondary text-white'
  return 'border-[#D0D5DD] bg-white text-[#667085]'
}

export function WizardStepper({
  steps,
  current,
  onSelect,
}: {
  steps: readonly WizardStepView[]
  current: number
  onSelect: (index: number) => void
}) {
  const total = steps.length
  const active = steps[current]
  const progress = total > 0 ? ((current + 1) / total) * 100 : 0

  return (
    <nav aria-label="Etapas do cadastro">
      {/* Celular */}
      <div className="sm:hidden">
        <p className="m-0 flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="font-semibold text-foreground">
            Etapa {current + 1} de {total}
          </span>
          <span className="text-muted-foreground" aria-hidden="true">
            ·
          </span>
          <span className="font-medium text-foreground">{active?.title}</span>
          {active?.state === 'error' ? (
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#B42318]">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              com erro
            </span>
          ) : null}
        </p>
        <div
          role="progressbar"
          aria-label="Progresso do cadastro"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={current + 1}
          aria-valuetext={`Etapa ${current + 1} de ${total}`}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EAECF0]"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Desktop */}
      <ol className="m-0 hidden list-none p-0 sm:flex">
        {steps.map((step, i) => {
          const isCurrent = i === current
          const Icon = step.state === 'complete' && !isCurrent ? Check : step.state === 'error' ? AlertTriangle : step.icon
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'relative z-[1] grid size-10 place-items-center rounded-full border-2 transition-[background-color,border-color,box-shadow] duration-200 motion-reduce:transition-none',
                  circleClass(step.state, isCurrent),
                )}
              >
                <Icon className="size-[18px]" strokeWidth={step.state === 'complete' && !isCurrent ? 2.75 : 2} />
              </span>
              <span
                className={cn(
                  'max-w-[9rem] text-center text-[13px] leading-tight',
                  isCurrent ? 'font-semibold text-foreground' : 'font-medium',
                  !isCurrent && step.state === 'error' && 'text-[#B42318]',
                  !isCurrent && step.state === 'complete' && 'text-foreground',
                  !isCurrent && step.state === 'pending' && 'text-muted-foreground',
                )}
              >
                <span className="tabular-nums">{i + 1}.</span> {step.title}
                <span className="sr-only">, {isCurrent && step.state === 'error' ? 'etapa atual, com erro' : STATE_LABEL[step.state]}</span>
              </span>
            </>
          )
          return (
            <li key={step.id} className="relative flex min-w-0 flex-1 flex-col items-center" aria-current={isCurrent ? 'step' : undefined}>
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-[calc(-50%+26px)] right-[calc(50%+26px)] top-5 h-0.5 -translate-y-1/2 rounded-full transition-colors duration-300 motion-reduce:transition-none',
                    i <= current ? 'bg-primary' : 'bg-[#EAECF0]',
                  )}
                />
              ) : null}
              {step.selectable ? (
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  title={`Ir para a etapa ${i + 1}: ${step.title}`}
                  className="group flex min-h-10 flex-col items-center gap-1.5 rounded-xl px-1.5 pb-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-secondary/30 [&>span:last-child]:group-hover:underline"
                >
                  {content}
                </button>
              ) : (
                <div className="flex flex-col items-center gap-1.5 px-1.5 pb-0.5">{content}</div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
