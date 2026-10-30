'use server'

import type {
  BillingAutomationReport,
  BillingSettings,
  BillingSummary,
  CancelClubChargeInput,
  CancelClubSubscriptionInput,
  ClubCharge,
  ClubChargeDetail,
  ClubReceiptsPage,
  ClubManagedAccountStatus,
  ClubReceivingAccount,
  ClubSubscription,
  ClubSubscriptionDetail,
  ConnectClubReceivingAccountInput,
  CreateManualClubChargeInput,
  ListClubChargesQuery,
  ListClubReceiptsQuery,
  ListClubSubscriptionsQuery,
  ListPaymentEventsQuery,
  ManualChargePreview,
  ManualChargeResult,
  ManagedAccountLegalNature,
  ManagedAutoDebit,
  ManualPaymentInput,
  PageMeta,
  PaymentEvent,
  ReissueClubChargeInput,
  RequestManagedAccountInput,
  UpdateBillingSettingsInput,
} from '@annetec/contracts'
import { apiFetch, tenantPath } from '@/lib/api/client'
import {
  normalizeCharge,
  normalizeSubscription,
  normalizeSummary,
  todaySP,
  type LatestChargeInfo,
  type Paged,
} from '@/lib/adapters/faturamento'
import { run, type ActionResult } from './_api-result'

/**
 * Faturamento do Clube de Benefícios — `/api/v1/t/:tenantSlug/faturamento`.
 *
 * Uma action por endpoint do painel (blueprint §0.3). A cobrança é do motor
 * da API (gera, envia, lembra, confirma, trata inadimplência); o painel só
 * acompanha e, na exceção, dá baixa, cancela ou reativa.
 *
 * Listas devolvem `{ items, meta }` — a paginação é do servidor.
 *
 * Arquivo `'use server'` só exporta função async: tipos (`Paged`,
 * `LatestChargeInfo`) moram em `lib/adapters/faturamento.ts`.
 */

function paged<T>(items: T[], meta: PageMeta | undefined, page = 1, perPage = items.length || 1): Paged<T> {
  return {
    items,
    meta: meta ?? { page, perPage, total: items.length, totalPages: items.length === 0 ? 0 : 1 },
  }
}

/**
 * A lista não precisa do QR do Pix (PNG base64 de alguns KB por linha) — o
 * detalhe traz. Tirar aqui deixa a tabela leve sem perder o copia-e-cola.
 */
function lightCharge(charge: ClubCharge): ClubCharge {
  const normalized = normalizeCharge(charge)
  return normalized.pix ? { ...normalized, pix: { ...normalized.pix, qrCodeBase64: null } } : normalized
}

function fullSubscriptionDetail(detail: ClubSubscriptionDetail): ClubSubscriptionDetail {
  return {
    ...normalizeSubscription(detail),
    charges: (detail.charges ?? []).map(normalizeCharge),
    events: detail.events ?? [],
  }
}

function fullChargeDetail(detail: ClubChargeDetail): ClubChargeDetail {
  return {
    ...normalizeCharge(detail),
    subscription: normalizeSubscription(detail.subscription),
    events: detail.events ?? [],
  }
}

const base = (slug: string, path: string) => tenantPath(slug, `/faturamento${path}`)

/** A API recusa `q` com mais de 100 caracteres; vazio vira ausente. */
function searchTerm(value: string | undefined): string | undefined {
  const term = value?.trim().slice(0, 100)
  return term ? term : undefined
}

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------

export async function getBillingSummaryAction(tenantSlug: string): Promise<ActionResult<BillingSummary>> {
  return run(async () => {
    const { data } = await apiFetch<BillingSummary>(base(tenantSlug, '/resumo'))
    return normalizeSummary(data)
  })
}

// ---------------------------------------------------------------------------
// Cobranças
// ---------------------------------------------------------------------------

export async function listClubChargesAction(
  tenantSlug: string,
  query: Partial<ListClubChargesQuery> = {},
): Promise<ActionResult<Paged<ClubCharge>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<ClubCharge[]>(base(tenantSlug, '/cobrancas'), {
      query: {
        page: query.page,
        perPage: query.perPage,
        sort: query.sort,
        q: searchTerm(query.q),
        status: query.status,
        method: query.method,
        from: query.from,
        to: query.to,
        subscriptionId: query.subscriptionId,
      },
    })
    return paged((data ?? []).map(lightCharge), meta, query.page, query.perPage)
  })
}

/**
 * Financeiro → Recebimento: pagamentos confirmados e estornos do período, pela
 * data do pagamento. Paginação por cursor (`nextCursor`).
 */
export async function listClubReceiptsAction(
  tenantSlug: string,
  query: Partial<ListClubReceiptsQuery> = {},
): Promise<ActionResult<ClubReceiptsPage>> {
  return run(async () => {
    const { data } = await apiFetch<ClubReceiptsPage>(base(tenantSlug, '/recebimentos'), {
      query: {
        from: query.from,
        to: query.to,
        method: query.method,
        cursor: query.cursor,
        limit: query.limit,
      },
    })
    return data
  })
}

export async function getClubChargeAction(
  tenantSlug: string,
  id: string,
): Promise<ActionResult<ClubChargeDetail>> {
  return run(async () => {
    const { data } = await apiFetch<ClubChargeDetail>(base(tenantSlug, `/cobrancas/${id}`))
    return fullChargeDetail(data)
  })
}

export async function reissueClubChargeAction(
  tenantSlug: string,
  id: string,
  input: ReissueClubChargeInput = {},
): Promise<ActionResult<ClubCharge>> {
  return run(async () => {
    const { data } = await apiFetch<ClubCharge>(base(tenantSlug, `/cobrancas/${id}/segunda-via`), {
      method: 'POST',
      body: input,
    })
    return normalizeCharge(data)
  })
}

export async function manualPaymentClubChargeAction(
  tenantSlug: string,
  id: string,
  input: ManualPaymentInput = {},
): Promise<ActionResult<ClubCharge>> {
  return run(async () => {
    const { data } = await apiFetch<ClubCharge>(base(tenantSlug, `/cobrancas/${id}/baixa-manual`), {
      method: 'POST',
      body: input,
    })
    return normalizeCharge(data)
  })
}

export async function cancelClubChargeAction(
  tenantSlug: string,
  id: string,
  input: CancelClubChargeInput = {},
): Promise<ActionResult<ClubCharge>> {
  return run(async () => {
    const { data } = await apiFetch<ClubCharge>(base(tenantSlug, `/cobrancas/${id}/cancelar`), {
      method: 'POST',
      body: input,
    })
    return normalizeCharge(data)
  })
}

export async function simulateClubChargePaymentAction(
  tenantSlug: string,
  id: string,
): Promise<ActionResult<ClubCharge>> {
  return run(async () => {
    const { data } = await apiFetch<ClubCharge>(base(tenantSlug, `/cobrancas/${id}/simular-pagamento`), {
      method: 'POST',
      body: {},
    })
    return normalizeCharge(data)
  })
}

/**
 * Última cobrança (maior vencimento) de cada assinatura — a coluna "Último
 * pagamento" de Cadastros. Uma chamada só: a lista vem por vencimento
 * decrescente, então a primeira ocorrência de cada assinatura é a mais
 * recente. Devolve só o resumo, não a cobrança inteira (o QR do Pix pesa).
 * Assinatura fora das 200 cobranças mais recentes fica sem entrada e a tela
 * cai no status da própria assinatura.
 */
export async function latestChargeBySubscriptionAction(
  tenantSlug: string,
): Promise<ActionResult<Record<string, LatestChargeInfo>>> {
  return run(async () => {
    const { data } = await apiFetch<ClubCharge[]>(base(tenantSlug, '/cobrancas'), {
      query: { page: 1, perPage: 200 },
    })
    const latest: Record<string, LatestChargeInfo> = {}
    const today = todaySP()
    for (const raw of data ?? []) {
      const charge = normalizeCharge(raw)
      // Cobrança do próximo ciclo (gerada antes do vencimento) ainda não é
      // "último pagamento" — senão todo assinante em dia apareceria "Em aberto".
      if (charge.status === 'pending' && charge.dueDate > today) continue
      const current = latest[charge.subscriptionId]
      if (current && current.dueDate >= charge.dueDate) continue
      latest[charge.subscriptionId] = {
        chargeId: charge.id,
        status: charge.status,
        dueDate: charge.dueDate,
        paidAt: charge.paidAt,
        amount: charge.amount,
        method: charge.method,
      }
    }
    return latest
  })
}

// ---------------------------------------------------------------------------
// Assinaturas (Cadastros)
// ---------------------------------------------------------------------------

export async function listClubSubscriptionsAction(
  tenantSlug: string,
  query: Partial<ListClubSubscriptionsQuery> = {},
): Promise<ActionResult<Paged<ClubSubscription>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<ClubSubscription[]>(base(tenantSlug, '/assinaturas'), {
      query: {
        page: query.page,
        perPage: query.perPage,
        sort: query.sort,
        q: searchTerm(query.q),
        status: query.status,
        planId: query.planId,
        method: query.method,
      },
    })
    return paged((data ?? []).map(normalizeSubscription), meta, query.page, query.perPage)
  })
}

export async function getClubSubscriptionAction(
  tenantSlug: string,
  id: string,
): Promise<ActionResult<ClubSubscriptionDetail>> {
  return run(async () => {
    const { data } = await apiFetch<ClubSubscriptionDetail>(base(tenantSlug, `/assinaturas/${id}`))
    return fullSubscriptionDetail(data)
  })
}

export async function cancelClubSubscriptionAction(
  tenantSlug: string,
  id: string,
  input: CancelClubSubscriptionInput,
): Promise<ActionResult<ClubSubscriptionDetail>> {
  return run(async () => {
    const { data } = await apiFetch<ClubSubscriptionDetail>(base(tenantSlug, `/assinaturas/${id}/cancelar`), {
      method: 'POST',
      body: input,
    })
    return fullSubscriptionDetail(data)
  })
}

export async function reactivateClubSubscriptionAction(
  tenantSlug: string,
  id: string,
): Promise<ActionResult<ClubSubscriptionDetail>> {
  return run(async () => {
    const { data } = await apiFetch<ClubSubscriptionDetail>(base(tenantSlug, `/assinaturas/${id}/reativar`), {
      method: 'POST',
      body: {},
    })
    return fullSubscriptionDetail(data)
  })
}

/** O que o diálogo "Gerar cobrança" precisa: próximo período, valores, preferência, cartão salvo. */
export async function getManualChargePreviewAction(
  tenantSlug: string,
  subscriptionId: string,
): Promise<ActionResult<ManualChargePreview>> {
  return run(async () => {
    const { data } = await apiFetch<ManualChargePreview>(
      base(tenantSlug, `/assinaturas/${encodeURIComponent(subscriptionId)}/cobrancas/previa`),
    )
    return data
  })
}

/** Adianta a próxima mensalidade ou lança uma cobrança avulsa (e avisa o associado). */
export async function createManualChargeAction(
  tenantSlug: string,
  subscriptionId: string,
  input: CreateManualClubChargeInput,
): Promise<ActionResult<ManualChargeResult>> {
  return run(async () => {
    const { data } = await apiFetch<ManualChargeResult>(
      base(tenantSlug, `/assinaturas/${encodeURIComponent(subscriptionId)}/cobrancas`),
      { method: 'POST', body: input },
    )
    return { ...data, charge: normalizeCharge(data.charge) }
  })
}

// ---------------------------------------------------------------------------
// Régua, eventos e automação
// ---------------------------------------------------------------------------

export async function getBillingSettingsAction(tenantSlug: string): Promise<ActionResult<BillingSettings>> {
  return run(async () => {
    const { data } = await apiFetch<BillingSettings>(base(tenantSlug, '/configuracoes'))
    return data
  })
}

export async function updateBillingSettingsAction(
  tenantSlug: string,
  input: UpdateBillingSettingsInput,
): Promise<ActionResult<BillingSettings>> {
  return run(async () => {
    const { data } = await apiFetch<BillingSettings>(base(tenantSlug, '/configuracoes'), {
      method: 'PATCH',
      body: input,
    })
    return data
  })
}

// ---------------------------------------------------------------------------
// Conta de recebimento (Asaas próprio do clube)
// ---------------------------------------------------------------------------

/**
 * A chave do Asaas atravessa estas funções só de passagem (browser → API): nada
 * aqui a loga, e a resposta nunca a devolve (só os 4 últimos caracteres).
 */
export async function getReceivingAccountAction(tenantSlug: string): Promise<ActionResult<ClubReceivingAccount>> {
  return run(async () => {
    const { data } = await apiFetch<ClubReceivingAccount>(base(tenantSlug, '/configuracoes/recebimento'))
    return data
  })
}

/** Conecta a conta ou troca a chave (mesma rota). */
export async function connectReceivingAccountAction(
  tenantSlug: string,
  input: ConnectClubReceivingAccountInput,
): Promise<ActionResult<ClubReceivingAccount>> {
  return run(async () => {
    const { data } = await apiFetch<ClubReceivingAccount>(base(tenantSlug, '/configuracoes/recebimento'), {
      method: 'PUT',
      body: input,
    })
    return data
  })
}

export async function testReceivingAccountAction(tenantSlug: string): Promise<ActionResult<ClubReceivingAccount>> {
  return run(async () => {
    const { data } = await apiFetch<ClubReceivingAccount>(base(tenantSlug, '/configuracoes/recebimento/testar'), {
      method: 'POST',
      body: {},
    })
    return data
  })
}

/** 409 com a mensagem da API quando ainda há assinaturas vinculadas. */
export async function disconnectReceivingAccountAction(
  tenantSlug: string,
): Promise<ActionResult<ClubReceivingAccount>> {
  return run(async () => {
    const { data } = await apiFetch<ClubReceivingAccount>(base(tenantSlug, '/configuracoes/recebimento'), {
      method: 'DELETE',
    })
    return data
  })
}

// ---------------------------------------------------------------------------
// Conta de recebimento gerenciada pela ANNETEC
// ---------------------------------------------------------------------------

export async function getManagedAccountStatusAction(
  tenantSlug: string,
): Promise<ActionResult<ClubManagedAccountStatus>> {
  return run(async () => {
    const { data } = await apiFetch<ClubManagedAccountStatus>(
      base(tenantSlug, '/configuracoes/recebimento/gerenciada'),
    )
    return data
  })
}

/** Pedido + aceite do termo. 409 com a mensagem da API (ex.: conta própria com assinaturas vinculadas). */
export async function requestManagedAccountAction(
  tenantSlug: string,
  input: RequestManagedAccountInput,
): Promise<ActionResult<ClubManagedAccountStatus>> {
  return run(async () => {
    const { data } = await apiFetch<ClubManagedAccountStatus>(
      base(tenantSlug, '/configuracoes/recebimento/gerenciada'),
      { method: 'POST', body: input },
    )
    return data
  })
}

/** Natureza jurídica do CNPJ (Receita) e o tipo de empresa sugerido para o assistente do pedido. */
export async function getManagedAccountLegalNatureAction(tenantSlug: string): Promise<ActionResult<ManagedAccountLegalNature>> {
  return run(async () => {
    const { data } = await apiFetch<ManagedAccountLegalNature>(base(tenantSlug, '/configuracoes/recebimento/gerenciada/natureza'))
    return data
  })
}

export async function refreshManagedAccountAction(tenantSlug: string): Promise<ActionResult<ClubReceivingAccount>> {
  return run(async () => {
    const { data } = await apiFetch<ClubReceivingAccount>(
      base(tenantSlug, '/configuracoes/recebimento/gerenciada/atualizar-status'),
      { method: 'POST', body: {} },
    )
    return data
  })
}

export async function listManagedDebitsAction(tenantSlug: string): Promise<ActionResult<ManagedAutoDebit[]>> {
  return run(async () => {
    const { data } = await apiFetch<ManagedAutoDebit[]>(base(tenantSlug, '/configuracoes/recebimento/gerenciada/debitos'))
    return data ?? []
  })
}

export async function listPaymentEventsAction(
  tenantSlug: string,
  query: Partial<ListPaymentEventsQuery> = {},
): Promise<ActionResult<Paged<PaymentEvent>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<PaymentEvent[]>(base(tenantSlug, '/eventos'), {
      query: {
        page: query.page,
        perPage: query.perPage,
        sort: query.sort,
        q: searchTerm(query.q),
        subscriptionId: query.subscriptionId,
        chargeId: query.chargeId,
        source: query.source,
      },
    })
    return paged(data ?? [], meta, query.page, query.perPage)
  })
}

export async function runBillingAutomationAction(
  tenantSlug: string,
): Promise<ActionResult<BillingAutomationReport>> {
  return run(async () => {
    const { data } = await apiFetch<BillingAutomationReport>(base(tenantSlug, '/automacao/executar'), {
      method: 'POST',
      body: {},
    })
    return data
  })
}
