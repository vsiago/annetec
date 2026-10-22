'use client'

import { Check } from 'lucide-react'
import type { CheckoutStep } from '@/lib/adapters/checkout'
import { cn } from '@/lib/utils'

interface CheckoutStepperProps {
  /** Só os passos reais deste pedido (2 com o plano na URL; 3 sem). */
  steps: readonly CheckoutStep[]
  current: number
  /** Maior passo já alcançado — até ele a pessoa pode voltar/avançar clicando. */
  reachable: number
  onSelect: (index: number) => void
}

/**
 * Progresso do checkout: trilha compacta com os passos clicáveis (mobile e
 * desktop). O resultado do pagamento não é um passo — é a tela seguinte.
 */
export function CheckoutStepper({ steps, current, reachable, onSelect }: CheckoutStepperProps) {
  const total = steps.length

  return (
    <nav aria-label="Etapas da assinatura" className="w-full">
      <p className="sr-only" aria-live="polite">
        Passo {current + 1} de {total}: {steps[current]?.label}
      </p>
      {/* Mobile: texto compacto com barra de progresso; os círculos ficam do sm para cima. */}
      <div className="sm:hidden" aria-hidden>
        <p className="text-sm text-muted-foreground">
          Etapa {current + 1} de {total} · <span className="font-semibold text-foreground">{steps[current]?.label}</span>
        </p>
        <div className="mt-2 flex gap-1">
          {steps.map((item, index) => (
            <span key={item.id} className={cn('h-1 flex-1 rounded-full', index <= current ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>
      </div>
      <ol className="hidden items-center sm:flex">
        {steps.map((item, index) => {
          const done = index < current
          const active = index === current
          const clickable = index !== current && index <= reachable
          return (
            <li key={item.id} className={cn('flex min-w-0 items-center', index < total - 1 && 'flex-1')}>
              <button
                type="button"
                onClick={() => clickable && onSelect(index)}
                disabled={!clickable}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'group flex min-w-0 items-center gap-2 rounded-full py-1 pr-1.5 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring',
                  clickable ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-semibold transition-colors duration-150',
                    done && 'border-primary bg-primary text-primary-foreground',
                    active && 'border-primary bg-background text-primary',
                    !done && !active && 'border-border bg-background text-muted-foreground',
                    clickable && !active && 'group-hover:border-primary/70',
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : index + 1}
                </span>
                <span
                  className={cn(
                    'truncate font-medium',
                    active ? 'text-foreground' : done ? 'text-foreground/80' : 'text-muted-foreground',
                  )}
                >
                  {item.label}
                  {done ? <span className="sr-only"> (concluído)</span> : null}
                </span>
              </button>
              {index < total - 1 ? (
                <span className="mx-2 h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-border sm:mx-3" aria-hidden>
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-200 ease-out motion-reduce:transition-none"
                    style={{ width: done ? '100%' : '0%' }}
                  />
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
