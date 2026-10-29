'use server'

import type {
  AddTenantResponsibleInput,
  AddTenantResponsibleResult,
  CreateTenantInput,
  CreateTenantPlanInput,
  HoldingTenantRow,
  IntegrationDiscovery,
  RemoveTenantMemberResult,
  ResetTenantUserPasswordInput,
  SetTenantMemberAccessResult,
  Tenant,
  TenantIntegration,
  TenantIntegrationPublic,
  TenantMemberList,
  TenantMemberSummary,
  TenantPlan,
  UpdateTenantInput,
  UpdateTenantPlanInput,
} from '@annetec/contracts'
import { apiFetch, apiFetchAll } from '@/lib/api/client'
import type { ClubListRow } from '@/components/admin-platform/clubs/club-list-model'
import type { Tenant as LegacyTenant, TenantPlan as LegacyTenantPlan } from '@/lib/types'
import { run, type ActionResult } from './_api-result'

/**
 * Inquilinos e planos de assinatura — fala direto com
 * `/api/v1/platform/tenants` e `/api/v1/platform/plans`. Sem mock.
 *
 * Mesma estratégia de `platform-users-api.ts`: devolve no formato de
 * `lib/types.ts` (datas como `Date`) pra tela e contexto não mudarem nada
 * além de trocar de onde os dados vêm.
 */

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
    // Todas as páginas: o detalhe do clube (/admin/inquilinos/<id>) procura o
    // clube nesta lista, e a lista de Clubes já mostra além dos 100 primeiros.
    const data = await apiFetchAll<Tenant>('/api/v1/platform/tenants')
    return data.map(toLegacyTenant)
  })
}

/**
 * Lista de Clubes (/admin/inquilinos): cadastro + ranking da holding, juntos
 * por id (o `organizationId` do ranking é o `id` do clube — ambos vêm de
 * `organization.id`, só clubes `operator`).
 *
 * Segue as páginas das duas listas até o fim (`apiFetchAll`, 200 por página):
 * nenhum clube some por passar de 100. Quem pagina é a tela, depois de
 * ordenar por "pede atenção", que só dá para calcular com a lista inteira.
 */
export async function listClubsOverviewAction(): Promise<ActionResult<ClubListRow[]>> {
  return run(async () => {
    const rankingPath = '/api/v1/platform/holding/inquilinos'
    const [tenants, firstRanking] = await Promise.all([
      apiFetchAll<Tenant>('/api/v1/platform/tenants'),
      apiFetchAll<HoldingTenantRow>(rankingPath, { query: { sort: 'name' } }),
    ])

    // O ranking fica em cache por 60 s: um clube recém-cadastrado pode ainda
    // não estar nele. Nesse caso pede uma vez o recálculo, em vez de mostrar o
    // clube sem números. Clube encerrado nunca entra no ranking (a holding o
    // deixa de fora), então não conta — senão toda abertura da lista forçaria
    // o recálculo assim que existisse um clube encerrado.
    let ranking = firstRanking
    const known = new Set(ranking.map(row => row.organizationId))
    if (tenants.some(tenant => tenant.status !== 'cancelled' && !known.has(tenant.id))) {
      ranking = await apiFetchAll<HoldingTenantRow>(rankingPath, { query: { sort: 'name', fresh: '1' } })
    }
    const byOrg = new Map(ranking.map(row => [row.organizationId, row]))

    return tenants.map((tenant): ClubListRow => {
      const row = byOrg.get(tenant.id)
      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        email: tenant.email,
        document: tenant.document.replace(/\D/g, ''),
        status: tenant.status,
        trialEndsAt: tenant.trialEndsAt,
        createdAt: tenant.createdAt,
        metrics: row
          ? {
              activeLives: row.activeLives,
              activeMembersDelta30: row.activeMembersDelta30,
              receivingIssue: row.receivingIssue,
              managed: row.managed,
              platformStatus: row.platformStatus,
              platformDaysLate: row.platformDaysLate,
              healthBand: row.healthBand,
              healthScore: row.healthScore,
            }
          : null,
      }
    })
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
export type TenantMember = TenantMemberSummary

/** Contas do inquilino + quantos responsáveis (admins) ativos ele tem. */
export async function listTenantMembersAction(
  tenantId: string,
): Promise<ActionResult<TenantMemberList>> {
  return run(async () => {
    const { data } = await apiFetch<TenantMemberList>(`/api/v1/platform/tenants/${tenantId}/usuarios`)
    return data
  })
}

/**
 * Adiciona um responsável (admin). A senha, quando a conta é nova, é gerada
 * na API e vai só no convite por e-mail — nunca volta para esta tela.
 */
export async function addTenantResponsibleAction(
  tenantId: string,
  input: AddTenantResponsibleInput,
): Promise<ActionResult<AddTenantResponsibleResult>> {
  return run(async () => {
    const { data } = await apiFetch<AddTenantResponsibleResult>(
      `/api/v1/platform/tenants/${tenantId}/responsaveis`,
      { method: 'POST', body: input },
    )
    return data
  })
}

/** Desativa/reativa o vínculo. Desativar derruba as sessões ligadas ao clube. */
export async function setTenantMemberAccessAction(
  tenantId: string,
  userId: string,
  active: boolean,
): Promise<ActionResult<SetTenantMemberAccessResult>> {
  return run(async () => {
    const { data } = await apiFetch<SetTenantMemberAccessResult>(
      `/api/v1/platform/tenants/${tenantId}/usuarios/${userId}/acesso`,
      { method: 'PATCH', body: { active } },
    )
    return data
  })
}

/**
 * Remove a pessoa do clube (e exclui a conta quando era o último vínculo).
 * Bloqueada por histórico, a API só desativa e devolve o motivo como erro.
 */
export async function removeTenantMemberAction(
  tenantId: string,
  userId: string,
): Promise<ActionResult<RemoveTenantMemberResult>> {
  return run(async () => {
    const { data } = await apiFetch<RemoveTenantMemberResult>(
      `/api/v1/platform/tenants/${tenantId}/usuarios/${userId}`,
      { method: 'DELETE' },
    )
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
