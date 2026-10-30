'use server'

import type {
  CreateProspectInput,
  CreateProspectInteractionInput,
  CreateSellerLinkInput,
  DiscountRequest,
  DiscountRequestInput,
  ListDiscountRequestsQuery,
  ListProspectsQuery,
  ListSalesCommissionsQuery,
  ListSellerProposalsQuery,
  PlatformPlanOffer,
  PlatformSeller,
  Prospect,
  ProspectDetail,
  SalesCommissionList,
  SellerDashboard,
  SellerLinkResult,
  SellerProposal,
  UpdateProspectInput,
} from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import { normalizePlanOffer, pagedOf, type Paged } from '@/lib/adapters/platform-console'
import { run, type ActionResult } from './_api-result'

/**
 * Área do VENDEDOR ANNETEC — `/api/v1/platform/vendas/*` (conta
 * `platform_seller`). A API decide de quem são os dados pela sessão: nenhuma
 * action daqui manda `sellerUserId`. O vendedor nunca recebe a URL da
 * proposta (o link vai só para o e-mail do cliente).
 */

const BASE = '/api/v1/platform/vendas'

const enc = encodeURIComponent

// ---------------------------------------------------------------------------
// Perfil, painel e planos
// ---------------------------------------------------------------------------

export async function getSellerProfileAction(): Promise<ActionResult<PlatformSeller>> {
  return run(async () => (await apiFetch<PlatformSeller>(`${BASE}/perfil`)).data)
}

export async function getSellerDashboardAction(): Promise<ActionResult<SellerDashboard>> {
  return run(async () => (await apiFetch<SellerDashboard>(`${BASE}/painel`)).data)
}

/** Todos os planos ANNETEC, inclusive os fora da vitrine pública (só o vendedor oferece). */
export async function listSellerPlansAction(): Promise<ActionResult<PlatformPlanOffer[]>> {
  return run(async () => ((await apiFetch<PlatformPlanOffer[]>(`${BASE}/planos`)).data ?? []).map(normalizePlanOffer))
}

// ---------------------------------------------------------------------------
// Funil
// ---------------------------------------------------------------------------

export async function listSellerProspectsAction(
  query: Partial<Omit<ListProspectsQuery, 'sellerUserId'>> = {},
): Promise<ActionResult<Paged<Prospect>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<Prospect[]>(`${BASE}/prospects`, {
      query: {
        page: query.page,
        perPage: query.perPage,
        q: query.q?.trim() || undefined,
        stage: query.stage,
        status: query.status,
      },
    })
    return pagedOf(data ?? [], meta, query.page, query.perPage)
  })
}

export async function getSellerProspectAction(id: string): Promise<ActionResult<ProspectDetail>> {
  return run(async () => (await apiFetch<ProspectDetail>(`${BASE}/prospects/${enc(id)}`)).data)
}

export async function createSellerProspectAction(input: CreateProspectInput): Promise<ActionResult<ProspectDetail>> {
  return run(async () => (await apiFetch<ProspectDetail>(`${BASE}/prospects`, { method: 'POST', body: input })).data)
}

/** Editar dados ou mover de etapa (`perdido` exige `lostReason`). */
export async function updateSellerProspectAction(id: string, input: UpdateProspectInput): Promise<ActionResult<ProspectDetail>> {
  return run(async () => (await apiFetch<ProspectDetail>(`${BASE}/prospects/${enc(id)}`, { method: 'PATCH', body: input })).data)
}

export async function addProspectInteractionAction(
  id: string,
  input: CreateProspectInteractionInput,
): Promise<ActionResult<ProspectDetail>> {
  return run(
    async () => (await apiFetch<ProspectDetail>(`${BASE}/prospects/${enc(id)}/interacoes`, { method: 'POST', body: input })).data,
  )
}

// ---------------------------------------------------------------------------
// Link de contratação e propostas
// ---------------------------------------------------------------------------

/**
 * Cria a proposta do prospect e manda o link ao e-mail do cliente — ou, com
 * `discount`, guarda o e-mail até o superadmin decidir o desconto.
 */
export async function createSellerLinkAction(prospectId: string, input: CreateSellerLinkInput): Promise<ActionResult<SellerLinkResult>> {
  return run(
    async () => (await apiFetch<SellerLinkResult>(`${BASE}/prospects/${enc(prospectId)}/link`, { method: 'POST', body: input })).data,
  )
}

export async function listSellerProposalsAction(
  query: Partial<ListSellerProposalsQuery> = {},
): Promise<ActionResult<Paged<SellerProposal>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<SellerProposal[]>(`${BASE}/propostas`, {
      query: { page: query.page, perPage: query.perPage, status: query.status, group: query.group },
    })
    return pagedOf(data ?? [], meta, query.page, query.perPage)
  })
}

export async function getSellerProposalAction(id: string): Promise<ActionResult<SellerProposal>> {
  return run(async () => (await apiFetch<SellerProposal>(`${BASE}/propostas/${enc(id)}`)).data)
}

/** (Re)envia o e-mail com o link ao cliente — inclusive "sem desconto" depois de uma recusa. */
export async function sendSellerLinkAction(id: string): Promise<ActionResult<SellerProposal>> {
  return run(async () => (await apiFetch<SellerProposal>(`${BASE}/propostas/${enc(id)}/enviar-link`, { method: 'POST' })).data)
}

export async function requestProposalDiscountAction(id: string, input: DiscountRequestInput): Promise<ActionResult<SellerLinkResult>> {
  return run(
    async () => (await apiFetch<SellerLinkResult>(`${BASE}/propostas/${enc(id)}/desconto`, { method: 'POST', body: input })).data,
  )
}

export async function listSellerDiscountsAction(
  query: Partial<Omit<ListDiscountRequestsQuery, 'sellerUserId'>> = {},
): Promise<ActionResult<Paged<DiscountRequest>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<DiscountRequest[]>(`${BASE}/descontos`, {
      query: { page: query.page, perPage: query.perPage, status: query.status },
    })
    return pagedOf(data ?? [], meta, query.page, query.perPage)
  })
}

// ---------------------------------------------------------------------------
// Comissões
// ---------------------------------------------------------------------------

/** Só as do próprio vendedor, com os totais do filtro inteiro. */
export async function listSellerCommissionsAction(
  query: Partial<Omit<ListSalesCommissionsQuery, 'sellerUserId'>> = {},
): Promise<ActionResult<SalesCommissionList>> {
  return run(async () => {
    const { data } = await apiFetch<SalesCommissionList>(`${BASE}/comissoes`, {
      query: { page: query.page, perPage: query.perPage, status: query.status, mes: query.mes },
    })
    return data
  })
}
