'use client'

import { Check, CircleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StepperItem {
  id: string
  label: string
  /** Etapa já concluída (check verde). */
  complete?: boolean
  /** Pede atenção (pendência do compliance). */
  attention?: boolean
}

interface StepperProps {
  steps: StepperItem[]
  current: number
  /** Etapas clicáveis; padrão: todas. */
  canSelect?: (index: number) => boolean
  onSelect: (index: number) => void
  label: string
}

/**
 * Progresso das etapas. Desktop: trilha numerada clicável (o rótulo quebra em
 * duas linhas quando precisa). Mobile: "Etapa 3 de 8 · Nome" + barra de
 * progresso — as etapas ficam num seletor logo abaixo, no próprio wizard.
 */
export function Stepper({ steps, current, canSelect, onSelect, label }: StepperProps) {
  const total = steps.length
  const done = steps.filter(step => step.complete).length
  const percent = Math.round((Math.max(done, current + 1) / total) * 100)
  const active = steps[current]

  return (
    <nav aria-label={label} className="w-full">
      <div className="md:hidden">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="truncate font-semibold text-foreground">{active?.label}</span>
          <span className="shrink-0 text-muted-foreground">
            Etapa {current + 1} de {total}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`Progresso: etapa ${current + 1} de ${total}`}
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ol className="hidden items-start md:flex">
        {steps.map((step, index) => {
          const isActive = index === current
          const clickable = !isActive && (canSelect ? canSelect(index) : true)
          return (
            <li key={step.id} className={cn('relative flex flex-1 flex-col items-center')}>
              {index > 0 ? (
                <span
                  className={cn(
                    'absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 rounded-full',
                    steps[index - 1]?.complete || index <= current ? 'bg-primary/70' : 'bg-border',
                  )}
                  style={{ right: 'calc(50% + 18px)', width: 'calc(100% - 36px)' }}
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                onClick={() => clickable && onSelect(index)}
                disabled={!clickable}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'group relative z-10 flex flex-col items-center gap-1.5 rounded-xl px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  clickable ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border-2 text-[13px] font-semibold transition-all',
                    step.attention && !isActive && 'border-amber-500 bg-amber-50 text-amber-700',
                    !step.attention && step.complete && !isActive && 'border-primary bg-primary text-primary-foreground',
                    isActive && 'border-primary bg-background text-primary shadow-[0_0_0_4px_rgba(232,67,100,0.14)]',
                    !step.complete && !isActive && !step.attention && 'border-border bg-background text-muted-foreground',
                    clickable && 'group-hover:border-primary/70',
                  )}
                >
                  {step.attention && !isActive ? (
                    <CircleAlert className="size-4" aria-hidden />
                  ) : step.complete && !isActive ? (
                    <Check className="size-4" strokeWidth={3} aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    'max-w-[8.5rem] text-center text-xs font-medium leading-tight',
                    isActive ? 'text-foreground' : step.complete ? 'text-foreground/80' : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                  {step.complete ? <span className="sr-only"> (concluída)</span> : null}
                  {step.attention ? <span className="sr-only"> (pendência)</span> : null}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
