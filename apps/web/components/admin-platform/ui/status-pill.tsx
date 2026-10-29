import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type StatusPillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TONES: Record<StatusPillTone, string> = {
  success: 'bg-[#ECFDF3] text-[#067647]',
  warning: 'bg-[#FFFAEB] text-[#B54708]',
  danger: 'bg-[#FEF3F2] text-[#B42318]',
  info: 'bg-[#EFF8FF] text-[#175CD3]',
  neutral: 'bg-[#F2F4F7] text-[#344054]',
}

/**
 * Pill de situação do console. A cor nunca é o único sinal: o texto (e, se
 * quiser, um ícone) diz a mesma coisa.
 */
export function StatusPill({
  tone,
  children,
  icon,
}: {
  tone: StatusPillTone
  children: ReactNode
  icon?: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONES[tone],
      )}
    >
      {icon ? (
        <span className="inline-flex shrink-0 items-center [&>svg]:size-3" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}
