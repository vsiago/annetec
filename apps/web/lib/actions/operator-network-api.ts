'use server'

import type {
  Benefit,
  ClubPlan,
  CreateBenefitInput,
  CreateClubPlanInput,
  CreatePartnerInput,
  Partner,
  UpdateBenefitInput,
  UpdateClubPlanInput,
} from '@annetec/contracts'
import { apiFetch, apiFetchAll, tenantPath } from '@/lib/api/client'
import { run, type ActionResult } from './_api-result'

/**
 * Rede de parceiros e clube de benefícios da Annetec-operadora —
 * `/api/v1/t/:tenantSlug/rede`, mesmo padrão dos outros `operator-*-api.ts`.
 * Conteúdo 100% Annetec, sem contrapartida na Digital Saúde.
 */
export type { ActionResult }

export async function listOperatorPartnersAction(
  tenantSlug: string,
  params?: { categoria?: string; q?: string },
): Promise<ActionResult<Partner[]>> {
  return run(async () => {
    return apiFetchAll<Partner>(tenantPath(tenantSlug, '/rede/parceiros'), {
      query: { categoria: params?.categoria, q: params?.q },
    })
  })
}

export async function createOperatorPartnerAction(
  tenantSlug: string,
  input: CreatePartnerInput,
): Promise<ActionResult<Partner>> {
  return run(async () => {
    const { data } = await apiFetch<Partner>(tenantPath(tenantSlug, '/rede/parceiros'), {
      method: 'POST',
      body: input,
    })
    return data
  })
}

export async function updateOperatorPartnerAction(
  tenantSlug: string,
  id: string,
  patch: Partial<CreatePartnerInput>,
): Promise<ActionResult<Partner>> {
  return run(async () => {
    const { data } = await apiFetch<Partner>(tenantPath(tenantSlug, `/rede/parceiros/${id}`), {
      method: 'PATCH',
      body: patch,
    })
    return data
  })
}

export async function deleteOperatorPartnerAction(tenantSlug: string, id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await apiFetch(tenantPath(tenantSlug, `/rede/parceiros/${id}`), { method: 'DELETE' })
    return null
  })
}

export async function listOperatorBenefitsAction(tenantSlug: string): Promise<ActionResult<Benefit[]>> {
  return run(async () => {
    const { data } = await apiFetch<Benefit[]>(tenantPath(tenantSlug, '/rede/beneficios'))
    return data
  })
}

export async function createOperatorBenefitAction(
  tenantSlug: string,
  input: CreateBenefitInput,
): Promise<ActionResult<Benefit>> {
  return run(async () => {
    const { data } = await apiFetch<Benefit>(tenantPath(tenantSlug, '/rede/beneficios'), {
      method: 'POST',
      body: input,
    })
    return data
  })
}

export async function updateOperatorBenefitAction(
  tenantSlug: string,
  id: string,
  patch: UpdateBenefitInput,
): Promise<ActionResult<Benefit>> {
  return run(async () => {
    const { data } = await apiFetch<Benefit>(tenantPath(tenantSlug, `/rede/beneficios/${id}`), {
      method: 'PATCH',
      body: patch,
    })
    return data
  })
}

export async function deleteOperatorBenefitAction(tenantSlug: string, id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await apiFetch(tenantPath(tenantSlug, `/rede/beneficios/${id}`), { method: 'DELETE' })
    return null
  })
}
/**
 * Planos que o inquilino vende ao associado. É a vitrine comercial do clube,
 * não o catálogo da Digital Saúde — esse fica em `/catalogo/planos`, é
 * read-only e indexado por `codigo`. Ver `clubPlan` em @annetec/contracts.
 */
export async function listOperatorClubPlansAction(tenantSlug: string): Promise<ActionResult<ClubPlan[]>> {
  return run(async () => {
    const { data } = await apiFetch<ClubPlan[]>(tenantPath(tenantSlug, '/rede/planos'))
    return data
  })
}

export async function createOperatorClubPlanAction(
  tenantSlug: string,
  input: CreateClubPlanInput,
): Promise<ActionResult<ClubPlan>> {
  return run(async () => {
    const { data } = await apiFetch<ClubPlan>(tenantPath(tenantSlug, '/rede/planos'), {
      method: 'POST',
      body: input,
    })
    return data
  })
}

export async function updateOperatorClubPlanAction(
  tenantSlug: string,
  id: string,
  patch: UpdateClubPlanInput,
): Promise<ActionResult<ClubPlan>> {
  return run(async () => {
    const { data } = await apiFetch<ClubPlan>(tenantPath(tenantSlug, `/rede/planos/${id}`), {
      method: 'PATCH',
      body: patch,
    })
    return data
  })
}

export async function deleteOperatorClubPlanAction(
  tenantSlug: string,
  id: string,
): Promise<ActionResult<null>> {
  return run(async () => {
    await apiFetch(tenantPath(tenantSlug, `/rede/planos/${id}`), { method: 'DELETE' })
    return null
  })
}
