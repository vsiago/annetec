'use server'

import type {
  CommissionReceipt,
  Contract,
  CreateContractInput,
  CreateTenantUserInput,
  Convenio,
  HealthPlan,
  Invoice,
  Tenant,
  TenantUser,
} from '@annetec/contracts'
import { ApiError, api, apiFetch, tenantPath } from '@/lib/api/client'

/**
 * A Annetec operando como operadora — clientes diretos na Digital Saúde, fora
 * da lista de inquilinos que o superadmin gerencia em `/admin/inquilinos`.
 *
 * Não existe rota `/api/v1/platform/operadora/*` própria: a operadora é só
 * mais uma organização (`kind: 'platform'`, ver `GET /platform/tenants/operador`)
 * e sessão de plataforma já passa livre por `requireTenantRole` — então
 * reaproveitamos as mesmas rotas `/api/v1/t/:tenantSlug/*` que qualquer
 * inquilino usa, com o `slug` da operadora. Nenhuma lógica de contrato,
 * financeiro ou catálogo é duplicada.
 */
export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> }

/** Resultado de `/contratos/busca/cpf` — vem direto do ERP, ainda não espelhado. */
export interface UpstreamContractResult {
  upstreamCodigo: string
  proposalNumber: string | null
  holderName: string | null
  holderCpf: string | null
  status: string
  upstreamStatus: string | null
  planName: string | null
  convenioName: string | null
  monthlyValue: number | null
  outstandingBalance: number | null
}

export async function getOperatorAction(): Promise<ActionResult<Tenant | null>> {
  return run(() => api<Tenant | null>('/api/v1/platform/tenants/operador'))
}

export async function listOperatorContractsAction(
  tenantSlug: string,
  params?: { q?: string; page?: number },
): Promise<ActionResult<{ items: Contract[]; total: number }>> {
  return run(async () => {
    const { data, meta } = await apiFetch<Contract[]>(tenantPath(tenantSlug, '/contratos'), {
      query: { perPage: 50, page: params?.page ?? 1, q: params?.q },
    })
    return { items: data, total: meta?.total ?? data.length }
  })
}

/** Busca ao vivo no ERP por CPF do titular — não grava no espelho local. */
export async function searchOperatorContractByCpfAction(
  tenantSlug: string,
  cpf: string,
): Promise<ActionResult<UpstreamContractResult[]>> {
  return run(async () => {
    const { data } = await apiFetch<UpstreamContractResult[]>(
      tenantPath(tenantSlug, '/contratos/busca/cpf'),
      { query: { cpf } },
    )
    return data
  })
}

/** Puxa um contrato do ERP e grava (ou atualiza) o espelho local. */
export async function syncOperatorContractAction(
  tenantSlug: string,
  upstreamCodigo: string,
): Promise<ActionResult<Contract>> {
  return run(async () => {
    const { data } = await apiFetch<Contract>(
      tenantPath(tenantSlug, `/contratos/${encodeURIComponent(upstreamCodigo)}/sync`),
      { method: 'POST' },
    )
    return data
  })
}

/**
 * Faturas vencidas de toda a carteira. A Digital Saúde não tem listagem em
 * lote pra fatura — a API hidrata cada código individualmente (ver
 * `billingService.listOverdueInvoices`), então isso pode levar alguns
 * segundos numa carteira grande.
 */
export async function listOperatorOverdueInvoicesAction(
  tenantSlug: string,
): Promise<ActionResult<Invoice[]>> {
  return run(async () => {
    const { data } = await apiFetch<Invoice[]>(tenantPath(tenantSlug, '/financeiro/faturas/vencidas'))
    return data
  })
}

/** Um contrato específico do espelho local — usado na tela de detalhe. */
export async function getOperatorContractAction(
  tenantSlug: string,
  upstreamCodigo: string,
): Promise<ActionResult<Contract>> {
  return run(() =>
    api<Contract>(tenantPath(tenantSlug, `/contratos/${encodeURIComponent(upstreamCodigo)}`)),
  )
}

/** Todas as faturas de UM contrato (não só as vencidas). */
export async function listOperatorContractInvoicesAction(
  tenantSlug: string,
  contratoCodigo: string,
): Promise<ActionResult<Invoice[]>> {
  return run(async () => {
    const { data } = await apiFetch<Invoice[]>(tenantPath(tenantSlug, '/financeiro/faturas'), {
      query: { contratoCodigo },
    })
    return data
  })
}

/** Muda o contrato de PENDENTE para PRODUZIDO no ERP e regrava o espelho. */
export async function markOperatorContractProducedAction(
  tenantSlug: string,
  upstreamCodigo: string,
): Promise<ActionResult<Contract>> {
  return run(async () => {
    const { data } = await apiFetch<Contract>(
      tenantPath(tenantSlug, `/contratos/${encodeURIComponent(upstreamCodigo)}/produzido`),
      { method: 'POST' },
    )
    return data
  })
}

/** Dispara o e-mail da carteirinha provisória pelo próprio ERP. */
export async function sendOperatorMembershipCardAction(
  tenantSlug: string,
  upstreamCodigo: string,
): Promise<ActionResult<{ message: string }>> {
  return run(async () => {
    const { data } = await apiFetch<{ message: string }>(
      tenantPath(tenantSlug, `/contratos/${encodeURIComponent(upstreamCodigo)}/carteirinha/email`),
      { method: 'POST' },
    )
    return data
  })
}

export async function attachOperatorDocumentAction(
  tenantSlug: string,
  input: { contractUpstreamCodigo: string; fileName: string; fileUrl: string },
): Promise<ActionResult<unknown>> {
  return run(async () => {
    const { data } = await apiFetch(tenantPath(tenantSlug, '/contratos/anexos'), {
      method: 'POST',
      body: input,
    })
    return data
  })
}

export async function declareOperatorPathologyAction(
  tenantSlug: string,
  input: {
    beneficiaryUpstreamCodigo: string
    name: string
    cid?: string
    description?: string
    eventYear?: string
    questionNumber?: string
  },
): Promise<ActionResult<unknown>> {
  return run(async () => {
    const { data } = await apiFetch(tenantPath(tenantSlug, '/contratos/patologias'), {
      method: 'POST',
      body: input,
    })
    return data
  })
}

export async function registerOperatorPendencyAction(
  tenantSlug: string,
  input: { contractCodigo: string; pendencyCode: string },
): Promise<ActionResult<unknown>> {
  return run(async () => {
    const { data } = await apiFetch(tenantPath(tenantSlug, '/contratos/pendencias'), {
      method: 'POST',
      body: input,
    })
    return data
  })
}

/**
 * Vendedores da operadora — separado de `tenant-users-api.ts` de propósito:
 * aquele arquivo devolve o formato `LegacyUser` (sem `upstreamProdutorCodigo`)
 * porque é compartilhado com telas de inquilino que não precisam desse campo.
 * Aqui usamos o `TenantUser` cru da API, que já carrega o vínculo do produtor.
 */
export async function listOperatorSellersAction(tenantSlug: string): Promise<ActionResult<TenantUser[]>> {
  return run(async () => {
    const { data } = await apiFetch<TenantUser[]>(tenantPath(tenantSlug, '/usuarios'), {
      query: { perPage: 200, role: 'seller' },
    })
    return data
  })
}

export async function createOperatorSellerAction(
  tenantSlug: string,
  input: CreateTenantUserInput,
): Promise<ActionResult<TenantUser>> {
  return run(async () => {
    const { data } = await apiFetch<TenantUser>(tenantPath(tenantSlug, '/usuarios'), {
      method: 'POST',
      body: input,
    })
    return data
  })
}

export async function deactivateOperatorSellerAction(
  tenantSlug: string,
  sellerId: string,
): Promise<ActionResult<null>> {
  return run(async () => {
    await apiFetch(tenantPath(tenantSlug, `/usuarios/${sellerId}`), { method: 'DELETE' })
    return null
  })
}

/** Vincula um vendedor da operadora a um produtor JÁ EXISTENTE na Digital Saúde. */
export async function linkOperatorSellerProdutorAction(
  tenantSlug: string,
  sellerId: string,
  input: { codigo: string; login?: string; password?: string },
): Promise<ActionResult<{ codigo: string; nome: string | null }>> {
  return run(async () => {
    const { data } = await apiFetch<{ codigo: string; nome: string | null }>(
      tenantPath(tenantSlug, `/usuarios/${sellerId}/produtor`),
      { method: 'PUT', body: input },
    )
    return data
  })
}

/** Cria o produtor na Digital Saúde e já vincula ao vendedor da operadora. */
export async function createOperatorSellerProdutorAction(
  tenantSlug: string,
  sellerId: string,
  input: { nome: string; email: string; numeroDocumento?: string; grupoProdutorCodigo: string },
): Promise<ActionResult<{ codigo: string; nome: string | null }>> {
  return run(async () => {
    const { data } = await apiFetch<{ codigo: string; nome: string | null }>(
      tenantPath(tenantSlug, `/usuarios/${sellerId}/produtor`),
      { method: 'POST', body: input },
    )
    return data
  })
}

export async function listOperatorConveniosAction(tenantSlug: string): Promise<ActionResult<Convenio[]>> {
  return run(() => api<Convenio[]>(tenantPath(tenantSlug, '/catalogo/convenios')))
}

export async function listOperatorPlansAction(
  tenantSlug: string,
  codigoProduto: string,
): Promise<ActionResult<HealthPlan[]>> {
  return run(async () => {
    const { data } = await apiFetch<HealthPlan[]>(tenantPath(tenantSlug, '/catalogo/planos'), {
      query: { codigoProduto },
    })
    return data
  })
}

/**
 * Registra a adesão de verdade na Digital Saúde (`POST /contrato/`) — ao
 * contrário das outras ações deste arquivo, isto cria um contrato real e não
 * tem desfazer.
 */
export async function createOperatorContractAction(
  tenantSlug: string,
  input: CreateContractInput,
): Promise<ActionResult<Contract>> {
  return run(async () => {
    const { data } = await apiFetch<Contract>(tenantPath(tenantSlug, '/contratos'), {
      method: 'POST',
      body: input,
    })
    return data
  })
}

/** Recibos de comissão de um vendedor — exige produtor com login+senha vinculados. */
export async function listOperatorCommissionReceiptsAction(
  tenantSlug: string,
  sellerId: string,
  status: 'emitido' | 'pago',
): Promise<ActionResult<CommissionReceipt[]>> {
  return run(async () => {
    const { data } = await apiFetch<CommissionReceipt[]>(tenantPath(tenantSlug, '/financeiro/comissoes'), {
      query: { vendedorId: sellerId, status },
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
