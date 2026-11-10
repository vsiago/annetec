import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { KpiCard, type KpiDelta } from '@/components/admin-platform/ui/kpi-card'
import type { ConsoleTone } from '@/components/admin-platform/ui/tone'
import { cn } from '@/lib/utils'

export type KpiItem = {
  rotulo: string
  valor: ReactNode
  dica?: ReactNode
  variacao?: KpiDelta
  icone?: LucideIcon
  tom?: ConsoleTone
  serie?: number[]
  href?: string
}

const COLUNAS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
} as const

/**
 * Grade responsiva de `KpiCard` do console (1 coluna no celular, 2 em tablet,
 * até `colunas` no desktop). Passe `itens` (monta os cartões) ou `children`
 * (seus próprios `KpiCard`).
 */
export function KpiGrid({
  itens,
  colunas = 4,
  children,
  className,
}: {
  itens?: KpiItem[]
  colunas?: keyof typeof COLUNAS
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-4', COLUNAS[colunas], className)}>
      {itens?.map(item => {
        const Icone = item.icone
        return (
          <KpiCard
            key={item.rotulo}
            label={item.rotulo}
            value={item.valor}
            hint={item.dica}
            delta={item.variacao}
            icon={Icone ? <Icone /> : undefined}
            accent={item.tom}
            trend={item.serie}
            href={item.href}
          />
        )
      })}
      {children}
    </div>
  )
}
