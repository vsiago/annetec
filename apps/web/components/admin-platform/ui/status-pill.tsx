import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type StatusPillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TONES: Record<StatusPillTone, { pill: string; dot: string }> = {
  success: { pill: 'bg-[#ECFDF3] text-[#067647] ring-[#ABEFC6]', dot: 'bg-[#17B26A]' },
  warning: { pill: 'bg-[#FFFAEB] text-[#B54708] ring-[#FEDF89]', dot: 'bg-[#F79009]' },
  danger: { pill: 'bg-[#FEF3F2] text-[#B42318] ring-[#FECDCA]', dot: 'bg-[#F04438]' },
  info: { pill: 'bg-[#EFF8FF] text-[#175CD3] ring-[#B2DDFF]', dot: 'bg-[#2E90FA]' },
  neutral: { pill: 'bg-[#F2F4F7] text-[#344054] ring-[#E4E7EC]', dot: 'bg-[#667085]' },
}

/**
 * Pill de situação do console. A cor nunca é o único sinal: o texto (e, se
 * quiser, um ícone) diz a mesma coisa. Sem `icon`, leva um ponto colorido à
 * esquerda do texto; `dot={false}` tira o ponto.
 */
export function StatusPill({
  tone,
  children,
  icon,
  dot,
}: {
  tone: StatusPillTone
  children: ReactNode
  icon?: ReactNode
  /** Ponto colorido antes do texto (padrão: só quando não há `icon`). */
  dot?: boolean
}) {
  const showDot = dot ?? !icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 ring-1 ring-inset',
        TONES[tone].pill,
      )}
    >
      {icon ? (
        <span className="-ml-0.5 inline-flex shrink-0 items-center [&>svg]:size-3" aria-hidden="true">
          {icon}
        </span>
      ) : showDot ? (
        <span className={cn('-ml-0.5 size-1.5 shrink-0 rounded-full', TONES[tone].dot)} aria-hidden="true" />
      ) : null}
      {children}
    </span>
  )
}
