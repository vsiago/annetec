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
 *
 * `icon` (opcional): ícone do lucide num chip suave de 40px no canto do cartão
 * (fundo `bg-accent`, ícone marinho). É decorativo — o rótulo já diz tudo. Para
 * um destaque pontual em coral, passe a cor no próprio ícone
 * (`<Wallet className="text-primary" />`).
 * Quando o valor é zero porque ainda não há dados, mantenha o valor e troque a
 * `hint` por uma frase útil ("Cadastre o primeiro clube").
 */
export function KpiCard({
  label,
  value,
  hint,
  delta,
  tone = 'default',
  href,
  icon,
  children,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  delta?: KpiDelta
  tone?: 'default' | 'danger' | 'success'
  href?: string
  icon?: ReactNode
  /** Conteúdo extra abaixo da dica (ex.: uma barra de uso). */
  children?: ReactNode
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 pt-0.5 text-[13px] font-medium text-muted-foreground">{label}</p>
        {icon ? (
          <span
            className="-mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-secondary [&>svg]:size-5"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </div>
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
      {children}
    </>
  )

  const base = 'flex min-w-0 flex-col gap-2.5 rounded-2xl border border-border bg-card px-6 py-[22px] shadow-sm'

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
