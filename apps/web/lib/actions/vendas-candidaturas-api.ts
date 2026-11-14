'use server'

import type {
  CandidaturaDadosInput,
  CandidaturaPublica,
  EnviarCandidaturaInput,
  IniciarCandidaturaInput,
  IniciarCandidaturaResult,
  PapelComercial,
} from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import { clientIpHeaders } from '@/lib/api/client-ip'
import { run, type ActionResult } from './_api-result'

/**
 * Candidatura pública de parceiro comercial ("Seja um parceiro"). Sem sessão
 * (`token: null`): a candidatura é acessada pela chave HMAC do link (`?chave=`).
 * Escopo: plataforma ou clube (`slug`). O IP do navegador segue para a API
 * (rate limit e evidência do aceite).
 */

type Escopo = { kind: 'platform' } | { kind: 'tenant'; slug: string }

function base(escopo: Escopo): string {
  return escopo.kind === 'tenant'
    ? `/api/v1/t/${encodeURIComponent(escopo.slug)}/public/vendas/candidaturas`
    : '/api/v1/public/vendas/candidaturas'
}

const pathOf = (escopo: Escopo, id: string, suffix = '') => `${base(escopo)}/${encodeURIComponent(id)}${suffix}`

export async function iniciarCandidaturaAction(
  escopo: Escopo,
  input: IniciarCandidaturaInput,
): Promise<ActionResult<IniciarCandidaturaResult>> {
  return run(async () => {
    const { data } = await apiFetch<IniciarCandidaturaResult>(base(escopo), {
      method: 'POST',
      body: input,
      token: null,
      headers: await clientIpHeaders(),
    })
    return data
  })
}

/** A API responde `enviado: true` sempre (não revela se o e-mail existe). */
export async function recuperarAcessoCandidaturaAction(
  escopo: Escopo,
  email: string,
): Promise<ActionResult<{ enviado: true }>> {
  return run(async () => {
    const { data } = await apiFetch<{ enviado: true }>(`${base(escopo)}/recuperar-acesso`, {
      method: 'POST',
      body: { email },
      token: null,
      headers: await clientIpHeaders(),
    })
    return data
  })
}

export async function obterCandidaturaAction(
  escopo: Escopo,
  id: string,
  chave: string,
): Promise<ActionResult<CandidaturaPublica>> {
  return run(async () => {
    const { data } = await apiFetch<CandidaturaPublica>(pathOf(escopo, id), {
      query: { chave },
      token: null,
      headers: await clientIpHeaders(),
    })
    return data
  })
}

export async function salvarDadosCandidaturaAction(
  escopo: Escopo,
  id: string,
  chave: string,
  input: CandidaturaDadosInput,
): Promise<ActionResult<CandidaturaPublica>> {
  return run(async () => {
    const { data } = await apiFetch<CandidaturaPublica>(pathOf(escopo, id, '/dados'), {
      method: 'PUT',
      body: input,
      query: { chave },
      token: null,
      headers: await clientIpHeaders(),
    })
    return data
  })
}

export async function removerDocumentoCandidaturaAction(
  escopo: Escopo,
  id: string,
  chave: string,
  docId: string,
): Promise<ActionResult<CandidaturaPublica>> {
  return run(async () => {
    const { data } = await apiFetch<CandidaturaPublica>(pathOf(escopo, id, `/documentos/${encodeURIComponent(docId)}`), {
      method: 'DELETE',
      query: { chave },
      token: null,
      headers: await clientIpHeaders(),
    })
    return data
  })
}

export async function enviarCandidaturaAction(
  escopo: Escopo,
  id: string,
  chave: string,
  input: EnviarCandidaturaInput,
): Promise<ActionResult<CandidaturaPublica>> {
  return run(async () => {
    const { data } = await apiFetch<CandidaturaPublica>(pathOf(escopo, id, '/enviar'), {
      method: 'POST',
      body: input,
      query: { chave },
      token: null,
      headers: await clientIpHeaders(),
    })
    return data
  })
}

/** Quem é o dono do código (404 = código inexistente neste escopo). */
export async function consultarCodigoIndicacaoAction(
  escopo: Escopo,
  codigo: string,
): Promise<ActionResult<{ nome: string; papel: PapelComercial }>> {
  return run(async () => {
    const { data } = await apiFetch<{ nome: string; papel: PapelComercial }>(
      `${base(escopo)}/codigo/${encodeURIComponent(codigo.trim())}`,
      { token: null, headers: await clientIpHeaders() },
    )
    return data
  })
}
