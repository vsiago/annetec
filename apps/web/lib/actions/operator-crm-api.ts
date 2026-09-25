'use server'

import type {
  CreateInteractionInput,
  CreateLeadInput,
  CreateSaleInput,
  Lead,
  Sale,
  SalesGoal,
  UpdateLeadInput,
  UpdateSaleInput,
  UpsertSalesGoalInput,
} from '@annetec/contracts'
import { apiFetch, apiFetchAll, tenantPath } from '@/lib/api/client'
import { run, type ActionResult } from './_api-result'

/**
 * Funil comercial da Annetec-operadora — `/api/v1/t/:tenantSlug/crm`, mesmo
 * padrão dos outros arquivos `operator-*-api.ts`: reaproveita a rota de
 * inquilino comum com o slug da operadora. Diferente de contratos/financeiro,
 * aqui não há upstream nenhum — é dado 100% Annetec.
 */
export type { ActionResult }

export async function listOperatorLeadsAction(
  tenantSlug: string,
  params?: { status?: string; q?: string },
): Promise<ActionResult<Lead[]>> {
  return run(async () => {
    // Lista completa: os indicadores do funil contam em cima dela, então uma
    // página truncada viraria número errado na tela.
    return apiFetchAll<Lead>(tenantPath(tenantSlug, '/crm/leads'), {
      query: { status: params?.status, q: params?.q },
    })
  })
}

export async function getOperatorLeadAction(tenantSlug: string, id: string): Promise<ActionResult<Lead>> {
  return run(async () => {
    const { data } = await apiFetch<Lead>(tenantPath(tenantSlug, `/crm/leads/${id}`))
    return data
  })
}

export async function createOperatorLeadAction(
  tenantSlug: string,
  input: CreateLeadInput,
): Promise<ActionResult<Lead>> {
  return run(async () => {
    const { data } = await apiFetch<Lead>(tenantPath(tenantSlug, '/crm/leads'), {
      method: 'POST',
      body: input,
    })
    return data
  })
}

export async function updateOperatorLeadAction(
  tenantSlug: string,
  id: string,
  patch: UpdateLeadInput,
): Promise<ActionResult<Lead>> {
  return run(async () => {
    const { data } = await apiFetch<Lead>(tenantPath(tenantSlug, `/crm/leads/${id}`), {
      method: 'PATCH',
      body: patch,
    })
    return data
  })
}

export async function deleteOperatorLeadAction(tenantSlug: string, id: string): Promise<ActionResult<null>> {
  return run(async () => {
    await apiFetch(tenantPath(tenantSlug, `/crm/leads/${id}`), { method: 'DELETE' })
    return null
  })
}

export async function addOperatorLeadInteractionAction(
  tenantSlug: string,
  leadId: string,
  input: CreateInteractionInput,
): Promise<ActionResult<Lead>> {
  return run(async () => {
    const { data } = await apiFetch<Lead>(tenantPath(tenantSlug, `/crm/leads/${leadId}/interacoes`), {
      method: 'POST',
      body: input,
    })
    return data
  })
}

/**
 * Fecha o lead como venda — dado próprio da Annetec (histórico comercial e
 * comissão). Não cria o contrato na Digital Saúde por si só: isso é feito
 * separadamente em "Nova adesão"; aqui só se registra que a venda aconteceu.
 */
export async function createOperatorSaleAction(
  tenantSlug: string,
  input: CreateSaleInput,
): Promise<ActionResult<Sale>> {
  return run(async () => {
    const { data } = await apiFetch<Sale>(tenantPath(tenantSlug, '/crm/vendas'), {
      method: 'POST',
      body: input,
    })
    return data
  })
}
/**
 * Vendas do inquilino. Lista completa pelo mesmo motivo dos leads: faturamento
 * do mês, ranking de vendedor e comissão são somas sobre a coleção inteira —
 * uma página truncada vira número errado no painel, não lista curta.
 *
 * O escopo vem do servidor, não daqui: `GET /crm/vendas` prende vendedor à
 * própria carteira e libera a do inquilino inteiro para admin.
 */
export async function listOperatorSalesAction(
  tenantSlug: string,
  params?: { vendedorId?: string; de?: string; ate?: string },
): Promise<ActionResult<Sale[]>> {
  return run(async () => {
    return apiFetchAll<Sale>(tenantPath(tenantSlug, '/crm/vendas'), {
      query: { vendedorId: params?.vendedorId, de: params?.de, ate: params?.ate },
    })
  })
}

/**
 * Corrige uma venda já lançada. Não aceita trocar o vendedor nem digitar
 * comissão — ver `updateSaleInput` em @annetec/contracts.
 */
export async function updateOperatorSaleAction(
  tenantSlug: string,
  id: string,
  patch: UpdateSaleInput,
): Promise<ActionResult<Sale>> {
  return run(async () => {
    const { data } = await apiFetch<Sale>(tenantPath(tenantSlug, `/crm/vendas/${id}`), {
      method: 'PATCH',
      body: patch,
    })
    return data
  })
}

/** Metas do ano. `ano` é obrigatório na rota — sem ele não há o que listar. */
export async function listOperatorSalesGoalsAction(
  tenantSlug: string,
  ano: number,
): Promise<ActionResult<SalesGoal[]>> {
  return run(async () => {
    const { data } = await apiFetch<SalesGoal[]>(tenantPath(tenantSlug, '/crm/metas'), {
      query: { ano },
    })
    return data
  })
}

/**
 * Grava a meta do vendedor no mês. É PUT e não POST de propósito: existe uma
 * meta por (vendedor, mês, ano), então regravar substitui em vez de duplicar.
 */
export async function upsertOperatorSalesGoalAction(
  tenantSlug: string,
  input: UpsertSalesGoalInput,
): Promise<ActionResult<SalesGoal>> {
  return run(async () => {
    const { data } = await apiFetch<SalesGoal>(tenantPath(tenantSlug, '/crm/metas'), {
      method: 'PUT',
      body: input,
    })
    return data
  })
}
