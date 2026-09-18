import type { ReactNode } from 'react'
import { BarChart3 } from 'lucide-react'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from './empty-state'
import { cn } from '@/lib/utils'

// Chart shell with a built-in empty state. `hasData` is required so no chart
// can be added that silently renders an empty axis grid for a new tenant.
export function ChartCard({
  title,
  description,
  hasData,
  emptyMessage = 'Os gráficos aparecem assim que houver movimentação registrada.',
  height = 300,
  action,
  className,
  children,
}: {
  title: string
  description?: string
  hasData: boolean
  emptyMessage?: string
  height?: number
  /** Controle à direita do título — seletor de período, "ver todos", selo. */
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Card className={cn('shadow-sm', className)}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && (
          <CardAction className="flex items-center gap-2 self-center">{action}</CardAction>
        )}
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          {hasData ? (
            children
          ) : (
            <EmptyState
              icon={BarChart3}
              title="Ainda sem dados"
              description={emptyMessage}
              className="h-full py-0"
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Shared Recharts tooltip styling, so every tooltip matches the card surface. */
export const chartTooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--card-foreground)',
} as const
