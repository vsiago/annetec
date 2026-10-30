'use server'

import { headers } from 'next/headers'
import type {
  CancelOnboardingInput,
  Envelope,
  OnboardingApplicantView,
  OnboardingBrandInput,
  OnboardingCompanyInput,
  OnboardingContractAcceptanceInput,
  OnboardingPaymentInput,
  OnboardingPeopleInput,
  OnboardingPlanInput,
  PlatformPlanOffer,
  PublicCnpjLookupResponse,
  RecoverOnboardingAccessInput,
  SlugAvailability,
  StartOnboardingInput,
  StartOnboardingResult,
} from '@annetec/contracts'
import { ApiError } from '@/lib/api/client'
import { forwardedClientHeaders } from '@/lib/api/internal-proxy'
import type { ActionResult } from './_api-result'
import { run } from './_api-result'

/**
 * Contratação pública da plataforma (`/contratar`) — rotas
 * `/api/v1/public/contratacao/*` da API, SEM sessão. As da proposta exigem a
 * chave HMAC do link de acompanhamento (`?chave=`); chave errada = 404.
 *
 * Diferente das outras actions, estas repassam o IP e o user-agent de quem
 * está no navegador: a API grava os dois no aceite eletrônico do contrato
 * (evidência do aceite) e limita a criação de propostas por IP — sem o
 * repasse, todo mundo apareceria com o IP do servidor Next.
 */

const API_BASE_URL = (process.env.API_BASE_URL ?? 'http://localhost:3333').replace(/\/+$/, '')
const BASE = '/api/v1/public/contratacao'

const proposalPath = (id: string, suffix = '') => `${BASE}/propostas/${encodeURIComponent(id)}${suffix}`

interface PublicRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | undefined>
}

async function clientHeaders(): Promise<Record<string, string>> {
  const incoming = await headers()
  // IP do navegador (com o segredo interno, ver `lib/api/internal-proxy.ts`) + user-agent do aceite.
  const out: Record<string, string> = forwardedClientHeaders(incoming)
  const userAgent = incoming.get('user-agent')
  if (userAgent) out['user-agent'] = userAgent
  return out
}

async function publicApi<T>(path: string, request: PublicRequest = {}): Promise<T> {
  const url = new URL(API_BASE_URL + path)
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value) url.searchParams.set(key, value)
  }
  const hasBody = request.body !== undefined
  const response = await fetch(url, {
    method: request.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(await clientHeaders()),
    },
    body: hasBody ? JSON.stringify(request.body) : undefined,
    cache: 'no-store',
  })

  const payload = (await response.json().catch(() => null)) as Envelope<T> | null
  if (!payload) {
    throw new ApiError({
      code: 'INTERNAL_ERROR',
      message:
        response.status === 404
          ? 'Este recurso ainda não está disponível na API.'
          : 'A API não respondeu em formato válido',
      status: response.status,
    })
  }
  if (!payload.success) {
    throw new ApiError({
      code: payload.error.code,
      message: payload.error.message,
      status: response.status,
      issues: payload.error.issues,
      requestId: payload.error.requestId,
    })
  }
  return payload.data
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------

/** Planos visíveis na contratação, na ordem comercial, com preço completo. */
export async function getPlatformOffersAction(): Promise<ActionResult<PlatformPlanOffer[]>> {
  return run(() => publicApi<PlatformPlanOffer[]>(`${BASE}/planos`))
}

/** Consulta à Receita. Falha da Receita NÃO é erro: vem `unavailable: true`. */
export async function lookupCnpjAction(cnpj: string): Promise<ActionResult<PublicCnpjLookupResponse>> {
  const digits = cnpj.replace(/\D/g, '')
  return run(() => publicApi<PublicCnpjLookupResponse>(`${BASE}/cnpj/${encodeURIComponent(digits)}`))
}

export async function checkSlugAction(slug: string): Promise<ActionResult<SlugAvailability>> {
  return run(() => publicApi<SlugAvailability>(`${BASE}/slug-disponivel`, { query: { slug } }))
}

export async function startOnboardingAction(input: StartOnboardingInput): Promise<ActionResult<StartOnboardingResult>> {
  return run(() => publicApi<StartOnboardingResult>(`${BASE}/propostas`, { method: 'POST', body: input }))
}

/** Reenvia o link de acompanhamento. A API responde `sent: true` sempre (não revela se existe). */
export async function recoverOnboardingAccessAction(
  input: RecoverOnboardingAccessInput,
): Promise<ActionResult<{ sent: true }>> {
  return run(() =>
    publicApi<{ sent: true }>(`${BASE}/propostas/recuperar-acesso`, { method: 'POST', body: input }),
  )
}

// ---------------------------------------------------------------------------
// Proposta (chave do link)
// ---------------------------------------------------------------------------

/** Visão do candidato. A API sincroniza a cobrança de ativação antes de responder. */
export async function getOnboardingAction(id: string, chave: string): Promise<ActionResult<OnboardingApplicantView>> {
  return run(() => publicApi<OnboardingApplicantView>(proposalPath(id), { query: { chave } }))
}

export async function saveOnboardingPlanAction(
  id: string,
  chave: string,
  input: OnboardingPlanInput,
): Promise<ActionResult<OnboardingApplicantView>> {
  return run(() =>
    publicApi<OnboardingApplicantView>(proposalPath(id, '/plano'), { method: 'PUT', body: input, query: { chave } }),
  )
}

export async function saveOnboardingCompanyAction(
  id: string,
  chave: string,
  input: OnboardingCompanyInput,
): Promise<ActionResult<OnboardingApplicantView>> {
  return run(() =>
    publicApi<OnboardingApplicantView>(proposalPath(id, '/empresa'), { method: 'PUT', body: input, query: { chave } }),
  )
}

export async function saveOnboardingPeopleAction(
  id: string,
  chave: string,
  input: OnboardingPeopleInput,
): Promise<ActionResult<OnboardingApplicantView>> {
  return run(() =>
    publicApi<OnboardingApplicantView>(proposalPath(id, '/pessoas'), { method: 'PUT', body: input, query: { chave } }),
  )
}

export async function saveOnboardingBrandAction(
  id: string,
  chave: string,
  input: OnboardingBrandInput,
): Promise<ActionResult<OnboardingApplicantView>> {
  return run(() =>
    publicApi<OnboardingApplicantView>(proposalPath(id, '/marca'), { method: 'PUT', body: input, query: { chave } }),
  )
}

export async function saveOnboardingPaymentAction(
  id: string,
  chave: string,
  input: OnboardingPaymentInput,
): Promise<ActionResult<OnboardingApplicantView>> {
  return run(() =>
    publicApi<OnboardingApplicantView>(proposalPath(id, '/pagamento'), {
      method: 'PUT',
      body: input,
      query: { chave },
    }),
  )
}

/** Remove um documento ainda não aprovado (`uploaded` ou `rejected`). */
export async function removeOnboardingDocumentAction(
  id: string,
  chave: string,
  documentId: string,
): Promise<ActionResult<OnboardingApplicantView>> {
  return run(() =>
    publicApi<OnboardingApplicantView>(proposalPath(id, `/documentos/${encodeURIComponent(documentId)}`), {
      method: 'DELETE',
      query: { chave },
    }),
  )
}

/** Aceite eletrônico dos termos vigentes (IP e user-agent repassados para a evidência). */
export async function acceptOnboardingContractAction(
  id: string,
  chave: string,
  input: OnboardingContractAcceptanceInput,
): Promise<ActionResult<OnboardingApplicantView>> {
  return run(() =>
    publicApi<OnboardingApplicantView>(proposalPath(id, '/aceite'), { method: 'POST', body: input, query: { chave } }),
  )
}

/** Envia (ou reenvia, após pendência) para análise. 422 lista o que falta. */
export async function submitOnboardingAction(id: string, chave: string): Promise<ActionResult<OnboardingApplicantView>> {
  return run(() => publicApi<OnboardingApplicantView>(proposalPath(id, '/enviar'), { method: 'POST', query: { chave } }))
}

export async function cancelOnboardingAction(
  id: string,
  chave: string,
  input: CancelOnboardingInput,
): Promise<ActionResult<OnboardingApplicantView>> {
  return run(() =>
    publicApi<OnboardingApplicantView>(proposalPath(id, '/cancelar'), { method: 'POST', body: input, query: { chave } }),
  )
}
