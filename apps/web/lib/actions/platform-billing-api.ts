'use server'

import type {
  CancelPlatformChargeInput,
  CancelPlatformSubscriptionInput,
  ChangePlatformPlanInput,
  DemoTimeTravelInput,
  HoldingTenantDetail,
  ListPlatformBillingEventsQuery,
  ListPlatformChargesQuery,
  ListPlatformSubscriptionsQuery,
  PlatformBillingAutomationReport,
  PlatformBillingEvent,
  PlatformBillingSettings,
  PlatformBillingSummary,
  PlatformCharge,
  PlatformChargeDetail,
  PlatformManualPaymentInput,
  PlatformPlanOffer,
  PlatformSubscription,
  PlatformSubscriptionDetail,
  ReissuePlatformChargeInput,
  UpdatePlatformBillingSettingsInput,
  UpdateTenantPlanPricingInput,
} from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import {
  lightPlatformCharge,
  normalizePlanOffer,
  normalizePlatformCharge,
  normalizePlatformSubscription,
  normalizePlatformSummary,
  pagedOf,
  type Paged,
} from '@/lib/adapters/platform-console'
import { run, type ActionResult } from './_api-result'

/**
 * Faturamento da plataforma (ANNETEC → inquilinos) — `/api/v1/platform/billing`
 * (blueprint §0.3/§0.4, Q2). Uma action por endpoint do console: resumo,
 * assinaturas, faturas, eventos, régua, automação e preços.
 *
 * Os comandos devolvem o detalhe atualizado (assinatura ou fatura) — a tela
 * troca o estado sem refazer a lista inteira.
 *
 * Arquivo `'use server'` só exporta função async: tipos (`Paged`) moram em
 * `lib/adapters/platform-console.ts`.
 */

const BASE = '/api/v1/platform/billing'

function searchTerm(value: string | undefined): string | undefined {
  const term = value?.trim().slice(0, 100)
  return term ? term : undefined
}

function fullSubscription(detail: PlatformSubscriptionDetail): PlatformSubscriptionDetail {
  return {
    ...normalizePlatformSubscription(detail),
    charges: (detail.charges ?? []).map(normalizePlatformCharge),
    events: detail.events ?? [],
  }
}

function fullCharge(detail: PlatformChargeDetail): PlatformChargeDetail {
  return {
    ...normalizePlatformCharge(detail),
    subscription: detail.subscription ? normalizePlatformSubscription(detail.subscription) : null,
    events: detail.events ?? [],
  }
}

const id$ = (value: string) => encodeURIComponent(value)

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------

export async function getPlatformBillingSummaryAction(): Promise<ActionResult<PlatformBillingSummary>> {
  return run(async () => {
    const { data } = await apiFetch<PlatformBillingSummary>(`${BASE}/resumo`)
    return normalizePlatformSummary(data)
  })
}

// ---------------------------------------------------------------------------
// Assinaturas de plataforma
// ---------------------------------------------------------------------------

export async function listPlatformSubscriptionsAction(
  query: Partial<ListPlatformSubscriptionsQuery> = {},
): Promise<ActionResult<Paged<PlatformSubscription>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<PlatformSubscription[]>(`${BASE}/assinaturas`, {
      query: {
        page: query.page,
        perPage: query.perPage,
        sort: query.sort,
        q: searchTerm(query.q),
        status: query.status,
        access: query.access,
        planId: query.planId,
      },
    })
    return pagedOf((data ?? []).map(normalizePlatformSubscription), meta, query.page, query.perPage)
  })
}

export async function getPlatformSubscriptionAction(id: string): Promise<ActionResult<PlatformSubscriptionDetail>> {
  return run(async () => {
    const { data } = await apiFetch<PlatformSubscriptionDetail>(`${BASE}/assinaturas/${id$(id)}`)
    return fullSubscription(data)
  })
}

/**
 * Assinatura de plataforma de um inquilino (aba "Assinatura ANNETEC"). A lista
 * não filtra por organização: busca pelo slug e confere o `organizationId`.
 * `null` = inquilino não gerenciado (contrato fora da cobrança automática).
 */
export async function findPlatformSubscriptionByTenantAction(
  organizationId: string,
  slug: string,
): Promise<ActionResult<PlatformSubscriptionDetail | null>> {
  return run(async () => {
    const { data } = await apiFetch<PlatformSubscription[]>(`${BASE}/assinaturas`, {
      query: { q: searchTerm(slug), page: 1, perPage: 50 },
    })
    const match = (data ?? []).find(sub => sub.organizationId === organizationId || sub.tenantSlug === slug)
    if (!match) return null
    const detail = await apiFetch<PlatformSubscriptionDetail>(`${BASE}/assinaturas/${id$(match.id)}`)
    return fullSubscription(detail.data)
  })
}

async function subscriptionCommand(id: string, path: string, body: unknown = {}): Promise<PlatformSubscriptionDetail> {
  const { data } = await apiFetch<PlatformSubscriptionDetail>(`${BASE}/assinaturas/${id$(id)}${path}`, {
    method: 'POST',
    body,
  })
  return fullSubscription(data)
}

export async function changePlatformPlanAction(
  id: string,
  input: ChangePlatformPlanInput,
): Promise<ActionResult<PlatformSubscriptionDetail>> {
  return run(() => subscriptionCommand(id, '/plano', input))
}

export async function reactivatePlatformSubscriptionAction(id: string): Promise<ActionResult<PlatformSubscriptionDetail>> {
  return run(() => subscriptionCommand(id, '/reativar'))
}

/** Superadmin. */
export async function cancelPlatformSubscriptionAction(
  id: string,
  input: CancelPlatformSubscriptionInput,
): Promise<ActionResult<PlatformSubscriptionDetail>> {
  return run(() => subscriptionCommand(id, '/cancelar', input))
}

/** Superadmin, só com as ferramentas de demonstração ligadas: recua as datas e roda a automação. */
export async function demoTimeTravelAction(
  id: string,
  input: DemoTimeTravelInput,
): Promise<ActionResult<PlatformSubscriptionDetail>> {
  return run(() => subscriptionCommand(id, '/demo/avancar-dias', input))
}

// ---------------------------------------------------------------------------
// Faturas
// ---------------------------------------------------------------------------

export async function listPlatformChargesAction(
  query: Partial<ListPlatformChargesQuery> = {},
): Promise<ActionResult<Paged<PlatformCharge>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<PlatformCharge[]>(`${BASE}/faturas`, {
      query: {
        page: query.page,
        perPage: query.perPage,
        sort: query.sort,
        q: searchTerm(query.q),
        status: query.status,
        kind: query.kind,
        method: query.method,
        from: query.from,
        to: query.to,
        organizationId: query.organizationId,
        subscriptionId: query.subscriptionId,
      },
    })
    return pagedOf((data ?? []).map(lightPlatformCharge), meta, query.page, query.perPage)
  })
}

export async function getPlatformChargeAction(id: string): Promise<ActionResult<PlatformChargeDetail>> {
  return run(async () => {
    const { data } = await apiFetch<PlatformChargeDetail>(`${BASE}/faturas/${id$(id)}`)
    return fullCharge(data)
  })
}

async function chargeCommand(id: string, path: string, body: unknown = {}): Promise<PlatformChargeDetail> {
  const { data } = await apiFetch<PlatformChargeDetail>(`${BASE}/faturas/${id$(id)}${path}`, {
    method: 'POST',
    body,
  })
  return fullCharge(data)
}

export async function reissuePlatformChargeAction(
  id: string,
  input: ReissuePlatformChargeInput = {},
): Promise<ActionResult<PlatformChargeDetail>> {
  return run(() => chargeCommand(id, '/segunda-via', input))
}

export async function manualPaymentPlatformChargeAction(
  id: string,
  input: PlatformManualPaymentInput = {},
): Promise<ActionResult<PlatformChargeDetail>> {
  return run(() => chargeCommand(id, '/baixa-manual', input))
}

export async function cancelPlatformChargeAction(
  id: string,
  input: CancelPlatformChargeInput = {},
): Promise<ActionResult<PlatformChargeDetail>> {
  return run(() => chargeCommand(id, '/cancelar', input))
}

/** Confirma o pagamento no gateway simulado (ou sandbox) — demonstração. */
export async function simulatePlatformChargePaymentAction(id: string): Promise<ActionResult<PlatformChargeDetail>> {
  return run(() => chargeCommand(id, '/simular-pagamento'))
}

// ---------------------------------------------------------------------------
// Eventos, régua e automação
// ---------------------------------------------------------------------------

export async function listPlatformBillingEventsAction(
  query: Partial<ListPlatformBillingEventsQuery> = {},
): Promise<ActionResult<Paged<PlatformBillingEvent>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<PlatformBillingEvent[]>(`${BASE}/eventos`, {
      query: {
        page: query.page,
        perPage: query.perPage,
        sort: query.sort,
        q: searchTerm(query.q),
        organizationId: query.organizationId,
        subscriptionId: query.subscriptionId,
        chargeId: query.chargeId,
        proposalId: query.proposalId,
        source: query.source,
      },
    })
    return pagedOf(data ?? [], meta, query.page, query.perPage)
  })
}

export async function getPlatformBillingSettingsAction(): Promise<ActionResult<PlatformBillingSettings>> {
  return run(async () => {
    const { data } = await apiFetch<PlatformBillingSettings>(`${BASE}/configuracoes`)
    return data
  })
}

/** Superadmin. A API valida restrição < suspensão < cancelamento no merge com o gravado. */
export async function updatePlatformBillingSettingsAction(
  input: UpdatePlatformBillingSettingsInput,
): Promise<ActionResult<PlatformBillingSettings>> {
  return run(async () => {
    const { data } = await apiFetch<PlatformBillingSettings>(`${BASE}/configuracoes`, {
      method: 'PATCH',
      body: input,
    })
    return data
  })
}

export async function runPlatformBillingAutomationAction(): Promise<ActionResult<PlatformBillingAutomationReport>> {
  return run(async () => {
    const { data } = await apiFetch<PlatformBillingAutomationReport>(`${BASE}/automacao/executar`, {
      method: 'POST',
      body: {},
    })
    return data
  })
}

// ---------------------------------------------------------------------------
// Preços dos planos ANNETEC
// ---------------------------------------------------------------------------

export async function listPlatformPlanPricingAction(): Promise<ActionResult<PlatformPlanOffer[]>> {
  return run(async () => {
    const { data } = await apiFetch<PlatformPlanOffer[]>(`${BASE}/precos`)
    return (data ?? []).map(normalizePlanOffer)
  })
}

/** Superadmin. */
export async function updatePlatformPlanPricingAction(
  planId: string,
  input: UpdateTenantPlanPricingInput,
): Promise<ActionResult<PlatformPlanOffer>> {
  return run(async () => {
    const { data } = await apiFetch<PlatformPlanOffer>(`${BASE}/precos/${id$(planId)}`, {
      method: 'PUT',
      body: input,
    })
    return normalizePlanOffer(data)
  })
}

// ---------------------------------------------------------------------------
// Saúde do inquilino (leitura da holding, para a aba "Saúde" do inquilino)
// ---------------------------------------------------------------------------

export async function getTenantHealthAction(organizationId: string): Promise<ActionResult<HoldingTenantDetail>> {
  return run(async () => {
    const { data } = await apiFetch<HoldingTenantDetail>(`/api/v1/platform/holding/inquilinos/${id$(organizationId)}`)
    return {
      ...data,
      subscription: data.subscription ? normalizePlatformSubscription(data.subscription) : null,
      alerts: data.alerts ?? [],
      monthly: data.monthly ?? [],
      recentAudit: data.recentAudit ?? [],
    }
  })
}
