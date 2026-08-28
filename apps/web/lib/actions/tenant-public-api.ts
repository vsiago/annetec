'use server'

import type { Tenant } from '@annetec/contracts'
import { ApiError, apiFetch } from '@/lib/api/client'
import type { Tenant as LegacyTenant } from '@/lib/types'

/**
 * Info pública do inquilino — fala com `/api/v1/t/:tenantSlug/public`, sem
 * sessão. É o que resolve `/[tenant]/...` antes de qualquer login existir
 * (branding, contato). Sem mock.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

function toLegacyTenant(tenant: Tenant): LegacyTenant {
  return {
    ...tenant,
    branding: {
      primaryColor: tenant.branding.primaryColor,
      secondaryColor: tenant.branding.secondaryColor,
      logoUrl: tenant.branding.logoUrl,
    },
    createdAt: new Date(tenant.createdAt),
    trialEndsAt: tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : undefined,
  }
}

export async function getTenantPublicAction(slug: string): Promise<ActionResult<LegacyTenant>> {
  return run(async () => {
    const { data } = await apiFetch<Tenant>(`/api/v1/t/${encodeURIComponent(slug)}/public`, { token: null })
    return toLegacyTenant(data)
  })
}

async function run<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await operation() }
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        ...(error.issues ? { fieldErrors: error.toFieldErrors() } : {}),
      }
    }
    return { success: false, error: 'Não foi possível concluir a operação. Tente novamente.' }
  }
}
