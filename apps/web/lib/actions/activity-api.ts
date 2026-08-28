'use server'

import type { ActivityOverview, Visitor } from '@annetec/contracts'
import { ApiError, apiFetch } from '@/lib/api/client'

/**
 * Rastreabilidade — `/admin/logs`. Fala direto com
 * `/api/v1/platform/activity`. Sem mock.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function getActivityOverviewAction(): Promise<ActionResult<ActivityOverview>> {
  return run(async () => (await apiFetch<ActivityOverview>('/api/v1/platform/activity/overview')).data)
}

export async function listVisitorsAction(q?: string): Promise<ActionResult<Visitor[]>> {
  return run(async () => (await apiFetch<Visitor[]>('/api/v1/platform/activity/visitors', { query: { q } })).data)
}

async function run<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await operation() }
  } catch (error) {
    if (error instanceof ApiError) return { success: false, error: error.message }
    return { success: false, error: 'Não foi possível carregar os dados de atividade.' }
  }
}
