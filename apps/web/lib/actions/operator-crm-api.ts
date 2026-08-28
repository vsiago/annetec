'use server'

import type { CreateInteractionInput, CreateLeadInput, CreateSaleInput, Lead, Sale, UpdateLeadInput } from '@annetec/contracts'
import { ApiError, apiFetch, tenantPath } from '@/lib/api/client'

/**
 * Funil comercial da Annetec-operadora — `/api/v1/t/:tenantSlug/crm`, mesmo
 * padrão dos outros arquivos `operator-*-api.ts`: reaproveita a rota de
 * inquilino comum com o slug da operadora. Diferente de contratos/financeiro,
 * aqui não há upstream nenhum — é dado 100% Annetec.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

export async function listOperatorLeadsAction(
  tenantSlug: string,
  params?: { status?: string; q?: string },
): Promise<ActionResult<Lead[]>> {
  return run(async () => {
    const { data } = await apiFetch<Lead[]>(tenantPath(tenantSlug, '/crm/leads'), {
      query: { perPage: 200, status: params?.status, q: params?.q },
    })
    return data
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

async function run<T>(operation: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await operation() }
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        error: error.message,
        ...(error.issues ? { fieldErrors: error.toFieldErrors() } : {}),
      }
    }
    return { success: false, error: 'Não foi possível concluir a operação. Tente novamente.' }
  }
}
