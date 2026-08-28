import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Tone = 'up' | 'down' | 'neutral'

const toneClasses: Record<Tone, string> = {
  up: 'text-green-600',
  down: 'text-red-600',
  neutral: 'text-muted-foreground',
}

// The single KPI tile used across every dashboard. Keeping one implementation
// means the label/value/delta rhythm and the icon treatment never drift
// between the admin, seller and platform panels.
export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  className,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: Tone
  icon?: LucideIcon
  className?: string
}) {
  return (
    <Card className={cn('border-0 shadow-sm', className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="truncate text-2xl font-bold text-foreground">{value}</p>
            {hint && <p className={cn('text-sm', toneClasses[tone])}>{hint}</p>}
          </div>
          {Icon && (
            <div className="shrink-0 rounded-lg bg-primary/10 p-2.5">
              <Icon className="h-5 w-5 text-primary" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
