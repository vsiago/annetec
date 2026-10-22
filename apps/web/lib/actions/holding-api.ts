'use server'

import type {
  AuditEntry,
  HoldingAlert,
  HoldingCohortLevel,
  HoldingCohorts,
  HoldingOverview,
  HoldingTenantDetail,
  HoldingTenantRow,
  ListAuditQuery,
  TenantLifecycleInput,
} from '@annetec/contracts'
import { apiFetch, apiFetchAll } from '@/lib/api/client'
import type { HoldingAuditPage, HoldingFetchOptions } from '@/lib/adapters/holding'
import { run, type ActionResult } from './_api-result'

/**
 * Camada HOLDING (blueprint §0.3/§0.5, Q2) — leitura consolidada de todos os
 * inquilinos e controle do ciclo de vida. Leituras exigem sessão de equipe da
 * plataforma; o comando de ciclo de vida exige superadmin (a API responde 403
 * para os demais e 422 para inquilino fora da cobrança automática).
 *
 * A API guarda as leituras em cache por 60 s; `fresh: true` manda `?fresh=1`
 * e força o recálculo ("Atualizar agora").
 */

const BASE = '/api/v1/platform/holding'

function periodQuery(options: HoldingFetchOptions = {}) {
  return {
    meses: options.meses,
    fresh: options.fresh ? '1' : undefined,
  }
}

export async function getHoldingOverviewAction(
  options: HoldingFetchOptions = {},
): Promise<ActionResult<HoldingOverview>> {
  return run(async () => {
    const { data } = await apiFetch<HoldingOverview>(`${BASE}/visao-geral`, { query: periodQuery(options) })
    return data
  })
}

/**
 * Todos os inquilinos (segue as páginas até o fim): a carteira é pequena e a
 * tela filtra e ordena sem voltar à API — o ranking inteiro precisa fechar.
 */
export async function listHoldingTenantsAction(
  options: Pick<HoldingFetchOptions, 'fresh'> = {},
): Promise<ActionResult<HoldingTenantRow[]>> {
  return run(() =>
    apiFetchAll<HoldingTenantRow>(`${BASE}/inquilinos`, {
      query: { sort: 'health', fresh: options.fresh ? '1' : undefined },
    }),
  )
}

export async function getHoldingTenantAction(
  organizationId: string,
  options: HoldingFetchOptions = {},
): Promise<ActionResult<HoldingTenantDetail>> {
  return run(async () => {
    const { data } = await apiFetch<HoldingTenantDetail>(`${BASE}/inquilinos/${encodeURIComponent(organizationId)}`, {
      query: periodQuery(options),
    })
    return data
  })
}

export async function listHoldingAlertsAction(
  options: Pick<HoldingFetchOptions, 'fresh'> = {},
): Promise<ActionResult<HoldingAlert[]>> {
  return run(async () => {
    const { data } = await apiFetch<HoldingAlert[]>(`${BASE}/alertas`, {
      query: { fresh: options.fresh ? '1' : undefined },
    })
    return data
  })
}

export async function getHoldingCohortsAction(
  level: HoldingCohortLevel,
  options: HoldingFetchOptions = {},
): Promise<ActionResult<HoldingCohorts>> {
  return run(async () => {
    const { data } = await apiFetch<HoldingCohorts>(`${BASE}/coortes`, {
      query: { nivel: level, ...periodQuery(options) },
    })
    return data
  })
}

export async function listHoldingAuditAction(query: Partial<ListAuditQuery> = {}): Promise<ActionResult<HoldingAuditPage>> {
  return run(async () => {
    const { data, meta } = await apiFetch<AuditEntry[]>(`${BASE}/auditoria`, {
      query: {
        page: query.page,
        perPage: query.perPage,
        q: query.q,
        organizationId: query.organizationId,
        resource: query.resource,
        action: query.action,
        from: query.from,
        to: query.to,
      },
    })
    return { rows: data, meta: meta ?? null }
  })
}

/** Restringir / suspender / reativar / voltar à régua. Superadmin; grava auditoria. */
export async function applyTenantLifecycleAction(
  organizationId: string,
  input: TenantLifecycleInput,
): Promise<ActionResult<HoldingTenantDetail>> {
  return run(async () => {
    const { data } = await apiFetch<HoldingTenantDetail>(
      `${BASE}/inquilinos/${encodeURIComponent(organizationId)}/ciclo-de-vida`,
      { method: 'POST', body: input },
    )
    return data
  })
}
