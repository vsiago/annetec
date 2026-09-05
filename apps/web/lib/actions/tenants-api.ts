'use server'

import type {
  CreateTenantInput,
  CreateTenantPlanInput,
  IntegrationDiscovery,
  ResetTenantUserPasswordInput,
  Tenant,
  TenantIntegration,
  TenantIntegrationPublic,
  TenantPlan,
  UpdateTenantInput,
  UpdateTenantPlanInput,
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

export async function updateTenantPlanAction(
  id: string,
  patch: UpdateTenantPlanInput,
): Promise<ActionResult<LegacyTenantPlan>> {
  return run(async () => {
    const { data } = await apiFetch<TenantPlan>(`/api/v1/platform/plans/${id}`, {
      method: 'PATCH',
      body: patch,
    })
    return toLegacyPlan(data)
  })
}

/** A API recusa remover plano em uso — a mensagem dela é a que aparece na tela. */
export async function deleteTenantPlanAction(id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await apiFetch(`/api/v1/platform/plans/${id}`, { method: 'DELETE' })
    return null
  })
}

// ---------------------------------------------------------------- integração
//
// Diagnóstico da ligação com a Digital Saúde por inquilino. Existia só na API;
// sem tela, ninguém via se a credencial estava boa nem quais operações o token
// realmente podia executar.

export async function getTenantIntegrationAction(
  tenantId: string,
): Promise<ActionResult<TenantIntegrationPublic | null>> {
  return run(async () => {
    const { data } = await apiFetch<TenantIntegrationPublic | null>(
      `/api/v1/platform/tenants/${tenantId}/integration`,
    )
    return data
  })
}

export async function saveTenantIntegrationAction(
  tenantId: string,
  input: TenantIntegration,
): Promise<ActionResult<TenantIntegrationPublic>> {
  return run(async () => {
    const { data } = await apiFetch<TenantIntegrationPublic>(
      `/api/v1/platform/tenants/${tenantId}/integration`,
      { method: 'PUT', body: input },
    )
    return data
  })
}

export async function testTenantIntegrationAction(
  tenantId: string,
): Promise<ActionResult<{ ok: boolean }>> {
  return run(async () => {
    const { data } = await apiFetch<{ ok: boolean }>(
      `/api/v1/platform/tenants/${tenantId}/integration/test`,
      { method: 'POST' },
    )
    return data
  })
}

/** Lê no ERP os códigos que antes eram copiados do portal na mão. */
export async function discoverTenantIntegrationAction(
  tenantId: string,
): Promise<ActionResult<IntegrationDiscovery>> {
  return run(async () => {
    const { data } = await apiFetch<IntegrationDiscovery>(
      `/api/v1/platform/tenants/${tenantId}/integration/discovery`,
    )
    return data
  })
}

/** Apura operação a operação o que o token deste inquilino pode fazer. */
export async function probeTenantCapabilitiesAction(
  tenantId: string,
): Promise<ActionResult<Record<string, boolean>>> {
  return run(async () => {
    const { data } = await apiFetch<Record<string, boolean>>(
      `/api/v1/platform/tenants/${tenantId}/integration/capabilities`,
      { method: 'POST' },
    )
    return data
  })
}

/** Usuário de um inquilino, na visão da plataforma. */
export interface TenantMember {
  id: string
  name: string
  email: string
  phone: string | null
  role: 'admin' | 'seller' | 'client'
  active: boolean
  createdAt: string
}

export async function listTenantMembersAction(
  tenantId: string,
): Promise<ActionResult<TenantMember[]>> {
  return run(async () => {
    const { data } = await apiFetch<TenantMember[]>(`/api/v1/platform/tenants/${tenantId}/usuarios`)
    return data
  })
}

/**
 * Reset administrativo de senha. Sem `password`, a API gera uma provisória e
 * devolve UMA vez — depois disso ela não é mais legível em lugar nenhum.
 */
export async function resetTenantMemberPasswordAction(
  tenantId: string,
  userId: string,
  input: ResetTenantUserPasswordInput = {},
): Promise<ActionResult<{ password: string; email: string }>> {
  return run(async () => {
    const { data } = await apiFetch<{ password: string; email: string }>(
      `/api/v1/platform/tenants/${tenantId}/usuarios/${userId}/senha`,
      { method: 'POST', body: input },
    )
    return data
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
