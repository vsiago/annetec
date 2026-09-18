import type { ReactNode } from 'react'
import { MockBadge } from './mock-badge'

// Bloco de título padrão de toda tela do backoffice (painel do inquilino,
// vendedor, associado e plataforma Annetec), para título, espaçamento e
// posição das ações não variarem de página para página.
export function PageHeader({
  title,
  description,
  /** Marca a tela inteira como desenhada mas ainda sem backend. */
  mock = false,
  children,
}: {
  title: string
  description?: string
  mock?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground xl:text-3xl">{title}</h1>
          {mock && <MockBadge />}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  )
}
