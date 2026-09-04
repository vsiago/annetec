'use server'

import type {
  CreateTenantInput,
  CreateTenantPlanInput,
  Tenant,
  TenantPlan,
  UpdateTenantInput,
} from '@annetec/contracts'
import { ApiError, apiFetch } from '@/lib/api/client'
import type { Tenant as LegacyTenant, TenantPlan as LegacyTenantPlan } from '@/lib/types'

/**
 * Inquilinos e planos de assinatura — fala direto com
 * `/api/v1/platform/tenants` e `/api/v1/platform/plans`. Sem mock.
 *
 * Mesma estratégia de `platform-users-api.ts`: devolve no formato de
 * `lib/types.ts` (datas como `Date`) pra tela e contexto não mudarem nada
 * além de trocar de onde os dados vêm.
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

function toLegacyPlan(plan: TenantPlan): LegacyTenantPlan {
  return plan
}

export async function listTenantsAction(): Promise<ActionResult<LegacyTenant[]>> {
  return run(async () => {
    const { data } = await apiFetch<Tenant[]>('/api/v1/platform/tenants', { query: { perPage: 100 } })
    return data.map(toLegacyTenant)
  })
}

export async function getTenantAction(id: string): Promise<ActionResult<LegacyTenant>> {
  return run(async () => toLegacyTenant(await apiFetch<Tenant>(`/api/v1/platform/tenants/${id}`).then(r => r.data)))
}

export async function createTenantAction(
  input: CreateTenantInput,
): Promise<ActionResult<{ tenant: LegacyTenant; ownerPassword: string }>> {
  return run(async () => {
    const { data } = await apiFetch<{ tenant: Tenant; ownerPassword: string }>('/api/v1/platform/tenants', {
      method: 'POST',
      body: input,
    })
    return { tenant: toLegacyTenant(data.tenant), ownerPassword: data.ownerPassword }
  })
}

export async function updateTenantAction(id: string, patch: UpdateTenantInput): Promise<ActionResult<LegacyTenant>> {
  return run(async () => {
    const tenant = await apiFetch<Tenant>(`/api/v1/platform/tenants/${id}`, { method: 'PATCH', body: patch }).then(
      r => r.data,
    )
    return toLegacyTenant(tenant)
  })
}

export async function listTenantPlansAction(): Promise<ActionResult<LegacyTenantPlan[]>> {
  return run(async () => {
    const { data } = await apiFetch<TenantPlan[]>('/api/v1/platform/plans')
    return data.map(toLegacyPlan)
  })
}

/**
 * Cria o plano de assinatura no banco. A tela de Configurações chamava o
 * `createPlan` de `lib/actions/tenant-plans.ts`, que é o mock em localStorage:
 * o plano aparecia por um instante e sumia no `refresh()` seguinte, que já
 * lia da API — sem erro nenhum na tela.
 */
export async function createTenantPlanAction(
  input: CreateTenantPlanInput,
): Promise<ActionResult<LegacyTenantPlan>> {
  return run(async () => {
    const { data } = await apiFetch<TenantPlan>('/api/v1/platform/plans', {
      method: 'POST',
      body: input,
    })
    return toLegacyPlan(data)
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
