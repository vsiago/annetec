import type { ReactNode } from 'react'

// Bloco de título padrão de toda tela do backoffice (painel do inquilino,
// vendedor, associado e plataforma Annetec), para título, espaçamento e
// posição das ações não variarem de página para página.
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground xl:text-3xl">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  )
}
