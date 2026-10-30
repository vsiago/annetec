import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpRight } from 'lucide-react'
import { Sparkline } from '@/components/admin-platform/ui/sparkline'
import { CARD_SHADOW, CARD_SHADOW_HOVER, TONES, type ConsoleTone } from '@/components/admin-platform/ui/tone'
import { cn } from '@/lib/utils'

export type KpiDelta = { text: string; tone: 'up' | 'down' | 'neutral' }

const DELTA_TONES: Record<KpiDelta['tone'], string> = {
  up: 'bg-[#ECFDF3] text-[#067647] ring-[#ABEFC6]',
  down: 'bg-[#FEF3F2] text-[#B42318] ring-[#FECDCA]',
  neutral: 'bg-[#F2F4F7] text-[#344054] ring-[#E4E7EC]',
}

const VALUE_TONES = {
  default: 'text-foreground',
  danger: 'text-[#B42318]',
  success: 'text-[#067647]',
} as const

/**
 * Cartão de número do console: selo do assunto + rótulo, valor grande e uma
 * linha de contexto (variação em chip + dica). Com `href`, o cartão inteiro é
 * um link (ganha uma seta discreta e sobe a sombra ao passar o mouse).
 *
 * - `icon` (opcional): ícone do lucide num selo de 40px ao lado do rótulo. É
 *   decorativo — o rótulo já diz tudo.
 * - `accent` (opcional): cor do selo pelo assunto (`ui/tone`): receita =
 *   `green`, a receber = `blue`, atraso = `red`, clubes = `navy`, vidas =
 *   `coral`. Padrão: `navy` (o chip azul-claro de antes).
 * - `trend` (opcional): série histórica (ex.: receita dos 6 meses, do mais
 *   antigo para o atual). Com 2 pontos ou mais, desenha um mini-gráfico na cor
 *   do assunto ao lado do valor. Sem série, o cartão fica como antes.
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
  accent = 'navy',
  trend,
  children,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  delta?: KpiDelta
  tone?: 'default' | 'danger' | 'success'
  href?: string
  icon?: ReactNode
  accent?: ConsoleTone
  trend?: number[]
  /** Conteúdo extra abaixo da dica (ex.: uma barra de uso). */
  children?: ReactNode
}) {
  const colors = TONES[accent]
  const hasTrend =
    Array.isArray(trend) && trend.filter(Number.isFinite).length >= 2 && trend.some(value => value !== 0)

  const body = (
    <>
      <div className="flex items-center gap-3">
        {icon ? (
          <span
            className={cn(
              'inline-flex size-10 shrink-0 items-center justify-center rounded-xl [&>svg]:size-5',
              colors.chip,
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <p className="m-0 min-w-0 flex-1 text-[13px] font-medium leading-snug text-muted-foreground">{label}</p>
        {href ? (
          <ArrowUpRight
            className="size-4 shrink-0 self-start text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden="true"
          />
        ) : null}
      </div>
      {/* O mini-gráfico fica ao lado do valor; se não couber (cartão estreito,
          valor longo), desce para a linha de baixo, à direita — nunca por cima do número. */}
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <p
          className={cn(
            'm-0 min-w-0 text-[28px] font-bold leading-tight tracking-tight tabular-nums sm:text-[30px]',
            VALUE_TONES[tone],
          )}
        >
          {value}
        </p>
        {hasTrend ? (
          <Sparkline values={trend!} color={colors.stroke} height={30} className="mb-1.5 ml-auto w-[72px] shrink-0" />
        ) : null}
      </div>
      {delta || hint ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {delta ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset',
                DELTA_TONES[delta.tone],
              )}
            >
              {delta.tone === 'up' ? <ArrowUp className="size-3" aria-hidden="true" /> : null}
              {delta.tone === 'down' ? <ArrowDown className="size-3" aria-hidden="true" /> : null}
              {delta.text}
            </span>
          ) : null}
          {hint ? <span className="text-[13px] leading-snug text-muted-foreground">{hint}</span> : null}
        </div>
      ) : null}
      {children}
    </>
  )

  const base = cn(
    'group relative flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-5 sm:px-6',
    CARD_SHADOW,
  )

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          'transition-[box-shadow,border-color] duration-200 hover:border-[#C3D2E4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2',
          CARD_SHADOW_HOVER,
        )}
      >
        {body}
      </Link>
    )
  }

  return <div className={base}>{body}</div>
}
