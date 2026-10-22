'use server'

import type {
  ApproveOnboardingInput,
  CancelOnboardingInput,
  ListOnboardingProposalsQuery,
  OnboardingNoteInput,
  OnboardingProposalDetail,
  OnboardingProposalListItem,
  OnboardingQueueSummary,
  ProvisionOnboardingInput,
  ProvisioningResult,
  RejectOnboardingInput,
  RequestOnboardingInfoInput,
  ReviewKybDocumentInput,
  UpdateComplianceChecklistInput,
} from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import { normalizePlatformCharge, pagedOf, type Paged } from '@/lib/adapters/platform-console'
import { run, type ActionResult } from './_api-result'

/**
 * Compliance da plataforma — `/api/v1/platform/onboarding` (blueprint §0.3, Q1).
 *
 * Uma action por endpoint do console: fila, detalhe, pré-checagens, checklist,
 * revisão de documento, pendência e decisão. Toda ação devolve o detalhe
 * inteiro atualizado — a tela troca o estado de uma vez, sem remontar à mão.
 *
 * Arquivo `'use server'` só exporta função async: tipos (`Paged`) moram em
 * `lib/adapters/platform-console.ts`.
 */

const BASE = '/api/v1/platform/onboarding/propostas'

function searchTerm(value: string | undefined): string | undefined {
  const term = value?.trim().slice(0, 100)
  return term ? term : undefined
}

function fullDetail(detail: OnboardingProposalDetail): OnboardingProposalDetail {
  return {
    ...detail,
    prechecks: detail.prechecks ?? [],
    people: detail.people ?? [],
    documents: detail.documents ?? [],
    requirements: detail.requirements ?? [],
    completeness: detail.completeness ?? [],
    events: detail.events ?? [],
    emails: detail.emails ?? [],
    checklist: detail.checklist ?? {},
    activationCharge: detail.activationCharge ? normalizePlatformCharge(detail.activationCharge) : null,
  }
}

async function command<TBody>(id: string, path: string, body?: TBody): Promise<OnboardingProposalDetail> {
  const { data } = await apiFetch<OnboardingProposalDetail>(`${BASE}/${encodeURIComponent(id)}${path}`, {
    method: 'POST',
    body: body ?? {},
  })
  return fullDetail(data)
}

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------

export async function listOnboardingProposalsAction(
  query: Partial<ListOnboardingProposalsQuery> = {},
): Promise<ActionResult<Paged<OnboardingProposalListItem>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<OnboardingProposalListItem[]>(BASE, {
      query: {
        page: query.page,
        perPage: query.perPage,
        sort: query.sort,
        q: searchTerm(query.q),
        status: query.status,
        group: query.group,
        precheck: query.precheck,
        assigned: query.assigned,
        contractorType: query.contractorType,
      },
    })
    return pagedOf(data ?? [], meta, query.page, query.perPage)
  })
}

export async function getOnboardingQueueSummaryAction(): Promise<ActionResult<OnboardingQueueSummary>> {
  return run(async () => {
    const { data } = await apiFetch<OnboardingQueueSummary>(`${BASE}/resumo`)
    return data
  })
}

/**
 * Proposta que originou um inquilino: a lista não filtra por organização,
 * então busca pelo CNPJ (ou nome) e confere o `organizationId`.
 */
export async function findOnboardingProposalForTenantAction(
  organizationId: string,
  search: string,
): Promise<ActionResult<OnboardingProposalListItem | null>> {
  return run(async () => {
    const q = searchTerm(search)
    if (!q) return null
    const { data } = await apiFetch<OnboardingProposalListItem[]>(BASE, {
      query: { group: 'all', q, page: 1, perPage: 50 },
    })
    return (data ?? []).find(item => item.organizationId === organizationId) ?? null
  })
}

// ---------------------------------------------------------------------------
// Detalhe e comandos
// ---------------------------------------------------------------------------

export async function getOnboardingProposalAction(id: string): Promise<ActionResult<OnboardingProposalDetail>> {
  return run(async () => {
    const { data } = await apiFetch<OnboardingProposalDetail>(`${BASE}/${encodeURIComponent(id)}`)
    return fullDetail(data)
  })
}

export async function claimOnboardingProposalAction(id: string): Promise<ActionResult<OnboardingProposalDetail>> {
  return run(() => command(id, '/assumir'))
}

export async function rerunOnboardingPrechecksAction(id: string): Promise<ActionResult<OnboardingProposalDetail>> {
  return run(() => command(id, '/prechecagens'))
}

export async function issueActivationChargeAction(id: string): Promise<ActionResult<OnboardingProposalDetail>> {
  return run(() => command(id, '/cobranca-ativacao'))
}

export async function updateComplianceChecklistAction(
  id: string,
  input: UpdateComplianceChecklistInput,
): Promise<ActionResult<OnboardingProposalDetail>> {
  return run(async () => {
    const { data } = await apiFetch<OnboardingProposalDetail>(`${BASE}/${encodeURIComponent(id)}/checklist`, {
      method: 'PATCH',
      body: input,
    })
    return fullDetail(data)
  })
}

export async function reviewKybDocumentAction(
  id: string,
  documentId: string,
  input: ReviewKybDocumentInput,
): Promise<ActionResult<OnboardingProposalDetail>> {
  return run(() => command(id, `/documentos/${encodeURIComponent(documentId)}/revisao`, input))
}

export async function requestOnboardingInfoAction(
  id: string,
  input: RequestOnboardingInfoInput,
): Promise<ActionResult<OnboardingProposalDetail>> {
  return run(() => command(id, '/pendencias', input))
}

export async function approveOnboardingAction(
  id: string,
  input: ApproveOnboardingInput,
): Promise<ActionResult<OnboardingProposalDetail>> {
  return run(() => command(id, '/aprovar', input))
}

export async function rejectOnboardingAction(
  id: string,
  input: RejectOnboardingInput,
): Promise<ActionResult<OnboardingProposalDetail>> {
  return run(() => command(id, '/reprovar', input))
}

export async function cancelOnboardingAction(
  id: string,
  input: CancelOnboardingInput,
): Promise<ActionResult<OnboardingProposalDetail>> {
  return run(() => command(id, '/cancelar', input))
}

export async function addOnboardingNoteAction(
  id: string,
  input: OnboardingNoteInput,
): Promise<ActionResult<OnboardingProposalDetail>> {
  return run(() => command(id, '/notas', input))
}

/** Superadmin: retentativa após falha ou ativação isenta (`waiveActivation`). */
export async function provisionOnboardingAction(
  id: string,
  input: ProvisionOnboardingInput,
): Promise<ActionResult<ProvisioningResult>> {
  return run(async () => {
    const { data } = await apiFetch<ProvisioningResult>(`${BASE}/${encodeURIComponent(id)}/provisionar`, {
      method: 'POST',
      body: input,
    })
    return data
  })
}
