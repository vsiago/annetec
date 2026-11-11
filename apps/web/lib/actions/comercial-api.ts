'use server'

import type {
  ApproveDiscountInput,
  DiscountRequest,
  ListDiscountRequestsQuery,
  ListProspectsQuery,
  ListSalesCommissionsQuery,
  PlatformSeller,
  Prospect,
  ProspectDetail,
  RejectDiscountInput,
  SalesCommissionList,
  SalesCommissionSettings,
  SalesReport,
} from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import { pagedOf, type Paged } from '@/lib/adapters/platform-console'
import { run, type ActionResult } from './_api-result'

/**
 * Gestão COMERCIAL da equipe — `/api/v1/platform/comercial/*`. Leitura:
 * superadmin e platform_admin. Escrita só em descontos (superadmin). Criar vendedor,
 * reatribuir prospect, pagar comissão e editar a regra foram desativados na API (410):
 * isso agora é feito pela Rede Comercial (`vendas-rede-api.ts`).
 */

const BASE = '/api/v1/platform/comercial'

const enc = encodeURIComponent

// ---------------------------------------------------------------------------
// Vendedores
// ---------------------------------------------------------------------------

export async function listSellersAction(): Promise<ActionResult<PlatformSeller[]>> {
  return run(async () => (await apiFetch<PlatformSeller[]>(`${BASE}/vendedores`)).data ?? [])
}

export async function getSellerAction(userId: string): Promise<ActionResult<PlatformSeller>> {
  return run(async () => (await apiFetch<PlatformSeller>(`${BASE}/vendedores/${enc(userId)}`)).data)
}

// ---------------------------------------------------------------------------
// Funil geral
// ---------------------------------------------------------------------------

export async function listTeamProspectsAction(query: Partial<ListProspectsQuery> = {}): Promise<ActionResult<Paged<Prospect>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<Prospect[]>(`${BASE}/prospects`, {
      query: {
        page: query.page,
        perPage: query.perPage,
        q: query.q?.trim() || undefined,
        stage: query.stage,
        status: query.status,
        sellerUserId: query.sellerUserId,
      },
    })
    return pagedOf(data ?? [], meta, query.page, query.perPage)
  })
}

export async function getTeamProspectAction(id: string): Promise<ActionResult<ProspectDetail>> {
  return run(async () => (await apiFetch<ProspectDetail>(`${BASE}/prospects/${enc(id)}`)).data)
}

// ---------------------------------------------------------------------------
// Descontos
// ---------------------------------------------------------------------------

export async function listDiscountRequestsAction(
  query: Partial<ListDiscountRequestsQuery> = {},
): Promise<ActionResult<Paged<DiscountRequest>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<DiscountRequest[]>(`${BASE}/descontos`, {
      query: { page: query.page, perPage: query.perPage, status: query.status, sellerUserId: query.sellerUserId },
    })
    return pagedOf(data ?? [], meta, query.page, query.perPage)
  })
}

export async function getDiscountRequestAction(id: string): Promise<ActionResult<DiscountRequest>> {
  return run(async () => (await apiFetch<DiscountRequest>(`${BASE}/descontos/${enc(id)}`)).data)
}

/** Campos ausentes = como o vendedor pediu. Aprovar manda o link ao cliente. */
export async function approveDiscountAction(id: string, input: ApproveDiscountInput): Promise<ActionResult<DiscountRequest>> {
  return run(async () => (await apiFetch<DiscountRequest>(`${BASE}/descontos/${enc(id)}/aprovar`, { method: 'POST', body: input })).data)
}

export async function rejectDiscountAction(id: string, input: RejectDiscountInput): Promise<ActionResult<DiscountRequest>> {
  return run(async () => (await apiFetch<DiscountRequest>(`${BASE}/descontos/${enc(id)}/recusar`, { method: 'POST', body: input })).data)
}

// ---------------------------------------------------------------------------
// Comissões, regra e relatório
// ---------------------------------------------------------------------------

export async function listTeamCommissionsAction(query: Partial<ListSalesCommissionsQuery> = {}): Promise<ActionResult<SalesCommissionList>> {
  return run(async () => {
    const { data } = await apiFetch<SalesCommissionList>(`${BASE}/comissoes`, {
      query: {
        page: query.page,
        perPage: query.perPage,
        status: query.status,
        mes: query.mes,
        sellerUserId: query.sellerUserId,
      },
    })
    return data
  })
}

export async function getCommissionSettingsAction(): Promise<ActionResult<SalesCommissionSettings>> {
  return run(async () => (await apiFetch<SalesCommissionSettings>(`${BASE}/configuracao`)).data)
}

/** Relatório por vendedor no mês (`aaaa-mm`; ausente = mês atual em São Paulo). */
export async function getSalesReportAction(mes?: string): Promise<ActionResult<SalesReport>> {
  return run(async () => (await apiFetch<SalesReport>(`${BASE}/relatorio`, { query: { mes } })).data)
}
