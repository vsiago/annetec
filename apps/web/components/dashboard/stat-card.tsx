import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Tone = 'up' | 'down' | 'neutral'

/** Família de cor do indicador — tinge o card e o ícone. */
type Accent = 'primary' | 'success' | 'info' | 'warning'

const toneClasses: Record<Tone, string> = {
  up: 'text-emerald-600',
  down: 'text-red-600',
  neutral: 'text-muted-foreground',
}

const accentClasses: Record<Accent, { card: string; chip: string }> = {
  primary: { card: 'border-primary/15 bg-primary/5', chip: 'bg-primary/10 text-primary' },
  success: { card: 'border-emerald-100 bg-emerald-50/60', chip: 'bg-emerald-100 text-emerald-600' },
  info: { card: 'border-sky-100 bg-sky-50/60', chip: 'bg-sky-100 text-sky-600' },
  warning: { card: 'border-amber-100 bg-amber-50/60', chip: 'bg-amber-100 text-amber-600' },
}

/**
 * O bloco de indicador usado em todo painel. Uma implementação só mantém o
 * ritmo valor/rótulo/variação e o tratamento do ícone idênticos entre os
 * painéis da administradora, do vendedor e da plataforma.
 *
 * `delta` + `comparison` desenham a variação em duas linhas ("↑ 12%" sobre
 * "vs. mês anterior"); `hint` continua servindo quem só precisa de uma
 * legenda solta embaixo do valor.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  accent = 'primary',
  icon: Icon,
  delta,
  comparison,
  className,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: Tone
  accent?: Accent
  icon?: LucideIcon
  delta?: { value: string; direction: Tone }
  comparison?: string
  className?: string
}) {
  const DeltaIcon = delta?.direction === 'down' ? ArrowDownRight : ArrowUpRight

  return (
    <Card className={cn('relative gap-0 py-0 shadow-none', accentClasses[accent].card, className)}>
      <CardContent className="flex items-start gap-4 p-5">
        {Icon && (
          <div className={cn('shrink-0 rounded-xl p-3', accentClasses[accent].chip)}>
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xl font-bold leading-tight text-foreground">{value}</p>
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          {delta && (
            <p className={cn('mt-2 flex items-center gap-1 text-sm font-semibold', toneClasses[delta.direction])}>
              {delta.direction !== 'neutral' && <DeltaIcon className="h-4 w-4" />}
              {delta.value}
            </p>
          )}
          {comparison && <p className="text-xs text-muted-foreground">{comparison}</p>}
          {hint && !delta && <p className={cn('mt-2 text-sm', toneClasses[tone])}>{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
