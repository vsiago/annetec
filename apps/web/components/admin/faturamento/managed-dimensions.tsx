import { Check, X } from 'lucide-react'
import { MANAGED_ACCOUNT_DIMENSION_LABELS, type ClubManagedAccountInfo } from '@annetec/contracts'
import { cn } from '@/lib/utils'

const KEYS = ['commercialInfo', 'documentation', 'bankAccountInfo', 'general'] as const

type Step = { text: string; circle: string; icon: 'check' | 'dot' | 'x' | 'none' }

function stepOf(status: string | null): Step {
  if (status === 'APPROVED')
    return { text: 'Aprovado', circle: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300', icon: 'check' }
  if (status === 'AWAITING_APPROVAL')
    return { text: 'Em análise', circle: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300', icon: 'dot' }
  if (status === 'PENDING')
    return { text: 'Pendente', circle: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300', icon: 'dot' }
  if (status === 'REJECTED')
    return { text: 'Recusado', circle: 'border-red-300 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300', icon: 'x' }
  return { text: '—', circle: 'border-border bg-muted text-muted-foreground', icon: 'none' }
}

/** Andamento da aprovação da conta: quatro etapas em sequência. */
export function ManagedDimensions({ dimensions }: { dimensions: ClubManagedAccountInfo['dimensions'] }) {
  return (
    <ol
      className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-0"
      aria-label="Andamento da aprovação da conta"
    >
      {KEYS.map((key, index) => {
        const step = stepOf(dimensions[key])
        return (
          <li key={key} className="flex min-w-0 items-center gap-3 sm:flex-1">
            <span
              aria-hidden
              className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border', step.circle)}
            >
              {step.icon === 'check' && <Check className="h-3.5 w-3.5" />}
              {step.icon === 'x' && <X className="h-3.5 w-3.5" />}
              {step.icon === 'dot' && <span className="h-2 w-2 rounded-full bg-current" />}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-medium text-foreground">
                {MANAGED_ACCOUNT_DIMENSION_LABELS[key]}
              </span>
              <span className="block text-xs text-muted-foreground">{step.text}</span>
            </span>
            {index < KEYS.length - 1 && (
              <span aria-hidden className="mx-3 hidden h-px min-w-4 flex-1 bg-border sm:block" />
            )}
          </li>
        )
      })}
    </ol>
  )
}
