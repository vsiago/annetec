'use client'

import type { Tenant } from '@/lib/types'
import { cn } from '@/lib/utils'
import { wordmarkDataUri } from './format'

/**
 * Logo do inquilino; sem logo cadastrado, um monograma com a inicial na cor
 * primária e o nome ao lado — nunca a marca de outro clube.
 */
export function TenantLogo({
  tenant,
  variant = 'default',
  className,
}: {
  tenant: Tenant
  /** `light` para fundos escuros: usa o logo claro quando existir. */
  variant?: 'default' | 'light'
  className?: string
}) {
  const src =
    variant === 'light'
      ? tenant.branding.logoLightUrl || tenant.branding.logoUrl
      : tenant.branding.logoUrl || tenant.branding.logoLightUrl

  if (src) {
    return <img src={src} alt={tenant.name} className={cn('h-9 w-auto max-w-[180px] object-contain', className)} />
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden="true"
        className="inline-flex size-9 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-sm"
      >
        {tenant.name.trim().charAt(0).toUpperCase()}
      </span>
      <span
        className={cn(
          'text-lg font-bold tracking-tight',
          variant === 'light' ? 'text-secondary-foreground' : 'text-foreground',
        )}
      >
        {tenant.name}
      </span>
    </span>
  )
}

/**
 * Inquilino como a carteirinha de demonstração deve recebê-lo. O
 * `DigitalCardMockup` cai no logo da MepCard quando não há logo — aqui entra
 * o nome do próprio clube desenhado como imagem.
 */
export function tenantForCard(tenant: Tenant): Tenant {
  if (tenant.branding.logoLightUrl || tenant.branding.logoUrl) return tenant
  return { ...tenant, branding: { ...tenant.branding, logoLightUrl: wordmarkDataUri(tenant.name) } }
}
