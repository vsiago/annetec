'use server'

import type {
  ForceManagedDebitInput,
  ListManagedAccountsQuery,
  ManagedAccountDetail,
  ManagedAccountListItem,
  ManagedDebitResult,
  RefuseManagedAccountInput,
  UpdateManagedAccountRequestInput,
} from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import { run, type ActionResult } from './_api-result'

/**
 * Contas de recebimento gerenciadas pela ANNETEC — `/api/v1/platform/contas-gerenciadas`.
 * A equipe lê; só o superadmin escreve (a API responde 403 aos demais).
 */
const BASE = '/api/v1/platform/contas-gerenciadas'
const id$ = (value: string) => encodeURIComponent(value)

export async function listManagedAccountsAction(
  query: Partial<ListManagedAccountsQuery> = {},
): Promise<ActionResult<ManagedAccountListItem[]>> {
  return run(async () => {
    const { data } = await apiFetch<ManagedAccountListItem[]>(BASE, {
      query: { status: query.status, q: query.q?.trim().slice(0, 100) || undefined },
    })
    return data ?? []
  })
}

export async function getManagedAccountDetailAction(orgId: string): Promise<ActionResult<ManagedAccountDetail>> {
  return run(async () => {
    const { data } = await apiFetch<ManagedAccountDetail>(`${BASE}/${id$(orgId)}`)
    return data
  })
}

export async function approveManagedAccountAction(orgId: string): Promise<ActionResult<ManagedAccountDetail>> {
  return run(async () => {
    const { data } = await apiFetch<ManagedAccountDetail>(`${BASE}/${id$(orgId)}/aprovar`, { method: 'POST', body: {} })
    return data
  })
}

/** Correção dos dados do pedido antes de aprovar (só superadmin; auditada). */
export async function updateManagedAccountRequestAction(
  orgId: string,
  input: UpdateManagedAccountRequestInput,
): Promise<ActionResult<ManagedAccountDetail>> {
  return run(async () => {
    const { data } = await apiFetch<ManagedAccountDetail>(`${BASE}/${id$(orgId)}/pedido`, { method: 'PATCH', body: input })
    return data
  })
}

export async function refuseManagedAccountAction(
  orgId: string,
  input: RefuseManagedAccountInput,
): Promise<ActionResult<ManagedAccountDetail>> {
  return run(async () => {
    const { data } = await apiFetch<ManagedAccountDetail>(`${BASE}/${id$(orgId)}/recusar`, {
      method: 'POST',
      body: input,
    })
    return data
  })
}

export async function recoverManagedAccountKeyAction(orgId: string): Promise<ActionResult<ManagedAccountDetail>> {
  return run(async () => {
    const { data } = await apiFetch<ManagedAccountDetail>(`${BASE}/${id$(orgId)}/recuperar-chave`, {
      method: 'POST',
      body: {},
    })
    return data
  })
}

export async function refreshManagedAccountStatusAction(orgId: string): Promise<ActionResult<ManagedAccountDetail>> {
  return run(async () => {
    const { data } = await apiFetch<ManagedAccountDetail>(`${BASE}/${id$(orgId)}/atualizar-status`, {
      method: 'POST',
      body: {},
    })
    return data
  })
}

export async function setManagedAutoDebitAction(
  orgId: string,
  enabled: boolean,
): Promise<ActionResult<ManagedAccountDetail>> {
  return run(async () => {
    const { data } = await apiFetch<ManagedAccountDetail>(`${BASE}/${id$(orgId)}/debito-automatico`, {
      method: 'PATCH',
      body: { enabled },
    })
    return data
  })
}

export async function forceManagedDebitAction(
  orgId: string,
  input: ForceManagedDebitInput = {},
): Promise<ActionResult<ManagedDebitResult>> {
  return run(async () => {
    const { data } = await apiFetch<ManagedDebitResult>(`${BASE}/${id$(orgId)}/debitar-agora`, {
      method: 'POST',
      body: input,
    })
    return data
  })
}

export async function disconnectManagedAccountAction(orgId: string): Promise<ActionResult<ManagedAccountDetail>> {
  return run(async () => {
    const { data } = await apiFetch<ManagedAccountDetail>(`${BASE}/${id$(orgId)}/desconectar`, {
      method: 'POST',
      body: {},
    })
    return data
  })
}
