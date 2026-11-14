import {
  MANAGED_ACCOUNT_DIMENSION_LABELS,
  MANAGED_ACCOUNT_DIMENSION_STATUS_LABELS,
  type ClubManagedAccountInfo,
  type ManagedAccountDimensionStatus,
} from '@annetec/contracts'
import { cn } from '@/lib/utils'
import { TONE } from './managed-document-card'

const KEYS = ['commercialInfo', 'bankAccountInfo', 'documentation', 'general'] as const

function dimensionTone(status: string | null): string {
  if (status === 'APPROVED') return TONE.ok
  if (status === 'AWAITING_APPROVAL' || status === 'PENDING') return TONE.warn
  if (status === 'REJECTED') return TONE.bad
  return TONE.muted
}

/** Faixa com a situação de cada etapa da aprovação da conta. */
export function ManagedDimensions({ dimensions }: { dimensions: ClubManagedAccountInfo['dimensions'] }) {
  return (
    <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Etapas da aprovação da conta">
      {KEYS.map(key => {
        const status = dimensions[key]
        const label = status
          ? (MANAGED_ACCOUNT_DIMENSION_STATUS_LABELS[status as ManagedAccountDimensionStatus] ?? status)
          : '—'
        return (
          <li key={key} className={cn('min-w-0 rounded-lg border px-3 py-2', dimensionTone(status))}>
            <p className="truncate text-xs opacity-80">{MANAGED_ACCOUNT_DIMENSION_LABELS[key]}</p>
            <p className="text-sm font-semibold">{label}</p>
          </li>
        )
      })}
    </ul>
  )
}
