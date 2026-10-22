'use server'

import type {
  ActiveStatus,
  ClubPlan,
  ClubPlanStatsReport,
  CreateClubPlanInput,
  UpdateClubPlanInput,
} from '@annetec/contracts'
import { apiFetch, tenantPath } from '@/lib/api/client'
import { normalizeClubPlan, normalizeStatsReport } from '@/lib/adapters/planos'
import { run, type ActionResult } from './_api-result'

/**
 * Produtos e Planos do painel do inquilino.
 *
 *  - planos: `/api/v1/t/:slug/rede/planos` (CRUD; o admin vê ativos e inativos);
 *  - estatísticas por plano: `/api/v1/t/:slug/faturamento/planos/estatisticas`.
 *
 * Pessoas do plano reusam `listClubSubscriptionsAction` (faturamento-api) e as
 * formas habilitadas no clube, `getBillingSettingsAction`.
 *
 * Arquivo `'use server'` só exporta função async: tipos e normalização moram
 * em `lib/adapters/planos.ts`.
 */

const planosPath = (slug: string, suffix = '') => tenantPath(slug, `/rede/planos${suffix}`)

export async function listClubPlansAction(tenantSlug: string): Promise<ActionResult<ClubPlan[]>> {
  return run(async () => {
    const { data } = await apiFetch<ClubPlan[]>(planosPath(tenantSlug))
    return (data ?? []).map(normalizeClubPlan)
  })
}

export async function getClubPlanStatsAction(tenantSlug: string): Promise<ActionResult<ClubPlanStatsReport>> {
  return run(async () => {
    const { data } = await apiFetch<ClubPlanStatsReport>(tenantPath(tenantSlug, '/faturamento/planos/estatisticas'))
    return normalizeStatsReport(data)
  })
}

export async function createClubPlanAction(
  tenantSlug: string,
  input: CreateClubPlanInput,
): Promise<ActionResult<ClubPlan>> {
  return run(async () => {
    const { data } = await apiFetch<ClubPlan>(planosPath(tenantSlug), { method: 'POST', body: input })
    return normalizeClubPlan(data)
  })
}

export async function updateClubPlanAction(
  tenantSlug: string,
  id: string,
  patch: UpdateClubPlanInput,
): Promise<ActionResult<ClubPlan>> {
  return run(async () => {
    const { data } = await apiFetch<ClubPlan>(planosPath(tenantSlug, `/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      body: patch,
    })
    return normalizeClubPlan(data)
  })
}

/** Ativar/inativar: inativo sai da vitrine e do checkout; quem já assinou segue sendo cobrado. */
export async function setClubPlanStatusAction(
  tenantSlug: string,
  id: string,
  status: ActiveStatus,
): Promise<ActionResult<ClubPlan>> {
  return run(async () => {
    const { data } = await apiFetch<ClubPlan>(planosPath(tenantSlug, `/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      body: { status },
    })
    return normalizeClubPlan(data)
  })
}

/** Plano com assinaturas responde 409 ("inative em vez de excluir"); a mensagem chega em `error`. */
export async function deleteClubPlanAction(tenantSlug: string, id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await apiFetch(planosPath(tenantSlug, `/${encodeURIComponent(id)}`), { method: 'DELETE' })
    return null
  })
}
