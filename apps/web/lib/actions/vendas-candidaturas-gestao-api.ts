'use server'

import type {
  AprovarCandidaturaInput,
  CandidaturaDetalhe,
  CandidaturaResumo,
  ListarCandidaturasQuery,
  RecusarCandidaturaInput,
} from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import type { ConviteResultado, EscopoRede } from '@/components/vendas-rede/gestao/tipos'
import { run, type ActionResult } from './_api-result'

/**
 * Gestão das candidaturas de parceiro comercial (tela "Candidaturas" do admin
 * comercial). Mesmo conjunto de rotas nos dois escopos:
 * `/api/v1/vendas/rede/candidaturas` (plataforma) e
 * `/api/v1/t/:slug/vendas/rede/candidaturas` (clube). Só o master do escopo acessa.
 */

function prefixoApi(escopo: EscopoRede): string {
  return escopo.kind === 'platform'
    ? '/api/v1/vendas/rede/candidaturas'
    : `/api/v1/t/${encodeURIComponent(escopo.slug)}/vendas/rede/candidaturas`
}

const enc = encodeURIComponent

export async function listarCandidaturasAction(
  escopo: EscopoRede,
  status: ListarCandidaturasQuery['status'] = 'recebida',
): Promise<ActionResult<{ itens: CandidaturaResumo[]; pendentes: number }>> {
  return run(async () => (await apiFetch<{ itens: CandidaturaResumo[]; pendentes: number }>(prefixoApi(escopo), { query: { status } })).data)
}

export async function resumoCandidaturasAction(escopo: EscopoRede): Promise<ActionResult<{ pendentes: number }>> {
  return run(async () => (await apiFetch<{ pendentes: number }>(`${prefixoApi(escopo)}/resumo`)).data)
}

export async function detalharCandidaturaAction(escopo: EscopoRede, id: string): Promise<ActionResult<CandidaturaDetalhe>> {
  return run(async () => (await apiFetch<CandidaturaDetalhe>(`${prefixoApi(escopo)}/${enc(id)}`)).data)
}

export async function aprovarCandidaturaAction(
  escopo: EscopoRede,
  id: string,
  input: AprovarCandidaturaInput,
): Promise<ActionResult<{ candidatura: CandidaturaDetalhe; convite: ConviteResultado }>> {
  return run(async () =>
    (await apiFetch<{ candidatura: CandidaturaDetalhe; convite: ConviteResultado }>(`${prefixoApi(escopo)}/${enc(id)}/aprovar`, { method: 'POST', body: input })).data,
  )
}

export async function recusarCandidaturaAction(
  escopo: EscopoRede,
  id: string,
  input: RecusarCandidaturaInput,
): Promise<ActionResult<{ candidatura: CandidaturaDetalhe }>> {
  return run(async () =>
    (await apiFetch<{ candidatura: CandidaturaDetalhe }>(`${prefixoApi(escopo)}/${enc(id)}/recusar`, { method: 'POST', body: input })).data,
  )
}
