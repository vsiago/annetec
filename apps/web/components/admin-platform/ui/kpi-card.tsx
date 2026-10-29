import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export type KpiDelta = { text: string; tone: 'up' | 'down' | 'neutral' }

const DELTA_TONES: Record<KpiDelta['tone'], string> = {
  up: 'bg-[#ECFDF3] text-[#067647]',
  down: 'bg-[#FEF3F2] text-[#B42318]',
  neutral: 'bg-[#F2F4F7] text-[#344054]',
}

const VALUE_TONES = {
  default: 'text-foreground',
  danger: 'text-[#B42318]',
  success: 'text-[#067647]',
} as const

/**
 * Cartão de número do console: rótulo, valor grande e uma linha de contexto
 * (variação em chip + dica). Com `href`, o cartão inteiro é um link.
 */
export function KpiCard({
  label,
  value,
  hint,
  delta,
  tone = 'default',
  href,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  delta?: KpiDelta
  tone?: 'default' | 'danger' | 'success'
  href?: string
}) {
  const body = (
    <>
      <p className="m-0 text-[13px] font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          'm-0 text-[28px] font-bold leading-tight tracking-tight tabular-nums sm:text-[32px]',
          VALUE_TONES[tone],
        )}
      >
        {value}
      </p>
      {delta || hint ? (
        <div className="flex flex-wrap items-center gap-2">
          {delta ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                DELTA_TONES[delta.tone],
              )}
            >
              {delta.tone === 'up' ? <ArrowUp className="size-3" aria-hidden="true" /> : null}
              {delta.tone === 'down' ? <ArrowDown className="size-3" aria-hidden="true" /> : null}
              {delta.text}
            </span>
          ) : null}
          {hint ? <span className="text-[13px] text-muted-foreground">{hint}</span> : null}
        </div>
      ) : null}
    </>
  )

  const base =
    'flex flex-col gap-2.5 rounded-2xl border border-border bg-white px-6 py-[22px]'

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          'transition-colors hover:border-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2',
        )}
      >
        {body}
      </Link>
    )
  }

  return <div className={base}>{body}</div>
}
