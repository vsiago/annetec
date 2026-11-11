'use server'

import type {
  AtendimentoBalcaoInput,
  CheckoutResult,
  ListAtendimentosBalcaoQuery,
  PessoaBalcaoQuery,
  SimularBalcaoInput,
  SimulacaoBalcao,
  UpdateAgenteInput,
  VendasAgente,
  VendasAtendimentoBalcao,
  VendasBalcaoHoje,
  VendasEu,
  VendasLead,
  VendasPessoaBalcao,
  VendasPlanoBalcao,
} from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import { pagedOf, type Paged } from '@/lib/adapters/platform-console'
import { run, type ActionResult } from './_api-result'

/**
 * Balcão (atendente da unidade de saúde). Só existe no escopo do clube:
 * `/api/v1/t/:slug/vendas/balcao/*`. A API decide de quem são os dados pela sessão.
 */

const enc = encodeURIComponent
const raiz = (slug: string, caminho = '') => `/api/v1/t/${enc(slug)}/vendas${caminho}`

export async function balcaoEuAction(slug: string): Promise<ActionResult<VendasEu>> {
  return run(async () => (await apiFetch<VendasEu>(raiz(slug, '/eu'))).data)
}

export async function balcaoHojeAction(slug: string): Promise<ActionResult<VendasBalcaoHoje>> {
  return run(async () => (await apiFetch<VendasBalcaoHoje>(raiz(slug, '/balcao/hoje'))).data)
}

export async function balcaoPlanosAction(slug: string): Promise<ActionResult<VendasPlanoBalcao[]>> {
  return run(async () => (await apiFetch<VendasPlanoBalcao[]>(raiz(slug, '/balcao/planos'))).data)
}

export async function balcaoSimularAction(slug: string, input: SimularBalcaoInput): Promise<ActionResult<SimulacaoBalcao[]>> {
  return run(async () => (await apiFetch<SimulacaoBalcao[]>(raiz(slug, '/balcao/simular'), { method: 'POST', body: input })).data)
}

export async function balcaoPessoaAction(slug: string, query: PessoaBalcaoQuery): Promise<ActionResult<VendasPessoaBalcao>> {
  return run(
    async () =>
      (
        await apiFetch<VendasPessoaBalcao>(raiz(slug, '/balcao/pessoa'), {
          query: { documento: query.documento, telefone: query.telefone },
        })
      ).data,
  )
}

export type RegistroBalcao = {
  atendimento: VendasAtendimentoBalcao
  lead: VendasLead | null
  checkout: CheckoutResult | null
}

export async function balcaoRegistrarAtendimentoAction(
  slug: string,
  input: AtendimentoBalcaoInput,
): Promise<ActionResult<RegistroBalcao>> {
  return run(async () => (await apiFetch<RegistroBalcao>(raiz(slug, '/balcao/atendimentos'), { method: 'POST', body: input })).data)
}

export async function balcaoAtendimentosAction(
  slug: string,
  query: Partial<ListAtendimentosBalcaoQuery> = {},
): Promise<ActionResult<Paged<VendasAtendimentoBalcao>>> {
  return run(async () => {
    const r = await apiFetch<VendasAtendimentoBalcao[]>(raiz(slug, '/balcao/atendimentos'), {
      query: { dia: query.dia, resultado: query.resultado, agente: query.agente, page: query.page, perPage: query.perPage },
    })
    return pagedOf(r.data, r.meta, query.page ?? 1, query.perPage ?? 20)
  })
}

export async function balcaoAtualizarPerfilAction(
  slug: string,
  agenteId: string,
  input: UpdateAgenteInput,
): Promise<ActionResult<VendasAgente>> {
  return run(
    async () => (await apiFetch<VendasAgente>(raiz(slug, `/rede/agentes/${enc(agenteId)}`), { method: 'PATCH', body: input })).data,
  )
}
