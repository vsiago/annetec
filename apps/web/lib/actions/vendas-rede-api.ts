'use server'

import type {
  CheckoutResult,
  ClubPlan,
  CreateEventoLeadInput,
  CreateVendasLeadInput,
  DiscountRequestInput,
  MensagemLeadResponse,
  MudarEtapaLeadInput,
  PapelComercial,
  PlatformPlanOffer,
  ProximoPassoInput,
  QuadroLeadsResposta,
  SellerLinkResult,
  SellerProposal,
  UpdateAgenteInput,
  UpdateVendasLeadInput,
  VendasAgente,
  VendasEu,
  VendasLead,
  VendasPainelHoje,
  VendasPresencaOnline,
} from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import { normalizePlanOffer, pagedOf, type Paged } from '@/lib/adapters/platform-console'
import { prefixoApi, type EscopoVendas } from '@/lib/vendas-rede/escopo'
import type { CarteiraResposta, ContadoresLeads, FiltrosLeads, FiltrosQuadro, LinkAdesao, PlanoVendavel, SituacaoCarteira } from '@/lib/vendas-rede/tipos'
import { run, type ActionResult } from './_api-result'

/**
 * Rede Comercial (`vendas-rede`): um único conjunto de actions para os dois
 * escopos. O 1º parâmetro é sempre o escopo: `{kind:'platform'}` fala com
 * `/api/v1/vendas/*` e `{kind:'tenant', slug}` com `/api/v1/t/:slug/vendas/*`.
 * A API decide de quem são os dados pela sessão.
 */

const enc = encodeURIComponent
const base = (escopo: EscopoVendas, caminho = '') => `${prefixoApi(escopo)}${caminho}`

// ---------------------------------------------------------------------------
// Perfil e presença
// ---------------------------------------------------------------------------

export async function getEuAction(escopo: EscopoVendas): Promise<ActionResult<VendasEu>> {
  return run(async () => (await apiFetch<VendasEu>(base(escopo, '/eu'))).data)
}

/** Heartbeat de presença (a cada 60 s com a aba visível). */
export async function enviarPresencaAction(escopo: EscopoVendas): Promise<ActionResult<{ ok: true }>> {
  return run(async () => {
    await apiFetch<unknown>(base(escopo, '/presenca'), { method: 'POST' })
    return { ok: true as const }
  })
}

export async function listarPresencaOnlineAction(escopo: EscopoVendas): Promise<ActionResult<VendasPresencaOnline>> {
  return run(async () => (await apiFetch<VendasPresencaOnline>(base(escopo, '/presenca/online'))).data)
}

// ---------------------------------------------------------------------------
// Painel "Hoje"
// ---------------------------------------------------------------------------

export async function getPainelHojeAction(escopo: EscopoVendas): Promise<ActionResult<VendasPainelHoje>> {
  return run(async () => (await apiFetch<VendasPainelHoje>(base(escopo, '/painel/hoje'))).data)
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export async function listarLeadsAction(escopo: EscopoVendas, filtros: FiltrosLeads = {}): Promise<ActionResult<Paged<VendasLead>>> {
  return run(async () => {
    const { data, meta } = await apiFetch<VendasLead[]>(base(escopo, '/leads'), {
      query: {
        estacao: filtros.estacao,
        etapa: filtros.etapa,
        agente: filtros.agente,
        origem: filtros.origem,
        busca: filtros.busca?.trim() || undefined,
        page: filtros.page,
        perPage: filtros.perPage,
      },
    })
    return pagedOf(data ?? [], meta, filtros.page, filtros.perPage)
  })
}

/** Funil em quadro: colunas por etapa, Disponíveis e fechados do mês numa chamada. */
export async function getQuadroLeadsAction(escopo: EscopoVendas, filtros: FiltrosQuadro = {}): Promise<ActionResult<QuadroLeadsResposta>> {
  return run(
    async () =>
      (
        await apiFetch<QuadroLeadsResposta>(base(escopo, '/leads/quadro'), {
          query: {
            agente: filtros.agente,
            origem: filtros.origem,
            temperatura: filtros.temperatura,
            busca: filtros.busca?.trim() || undefined,
            atrasados: filtros.atrasados ? 'true' : undefined,
            limite: filtros.limite,
          },
        })
      ).data,
  )
}

export async function getContadoresLeadsAction(escopo: EscopoVendas): Promise<ActionResult<ContadoresLeads>> {
  return run(async () => (await apiFetch<ContadoresLeads>(base(escopo, '/leads/contadores'))).data)
}

/** 409 `VENDAS_LEAD_JA_REIVINDICADO` quando alguém pegou antes (`code` no resultado). */
export async function reivindicarLeadAction(escopo: EscopoVendas, id: string): Promise<ActionResult<VendasLead>> {
  return run(async () => (await apiFetch<VendasLead>(base(escopo, `/leads/${enc(id)}/reivindicar`), { method: 'POST' })).data)
}

export async function criarLeadAction(
  escopo: EscopoVendas,
  input: Partial<CreateVendasLeadInput> & { nome: string },
): Promise<ActionResult<VendasLead>> {
  return run(async () => (await apiFetch<VendasLead>(base(escopo, '/leads'), { method: 'POST', body: input })).data)
}

export async function getLeadAction(escopo: EscopoVendas, id: string): Promise<ActionResult<VendasLead>> {
  return run(async () => (await apiFetch<VendasLead>(base(escopo, `/leads/${enc(id)}`))).data)
}

export async function atualizarLeadAction(escopo: EscopoVendas, id: string, input: UpdateVendasLeadInput): Promise<ActionResult<VendasLead>> {
  return run(async () => (await apiFetch<VendasLead>(base(escopo, `/leads/${enc(id)}`), { method: 'PATCH', body: input })).data)
}

export async function mudarEtapaAction(escopo: EscopoVendas, id: string, input: MudarEtapaLeadInput): Promise<ActionResult<VendasLead>> {
  return run(async () => (await apiFetch<VendasLead>(base(escopo, `/leads/${enc(id)}/etapa`), { method: 'POST', body: input })).data)
}

export async function registrarEventoAction(escopo: EscopoVendas, id: string, input: CreateEventoLeadInput): Promise<ActionResult<unknown>> {
  return run(async () => (await apiFetch<unknown>(base(escopo, `/leads/${enc(id)}/eventos`), { method: 'POST', body: input })).data)
}

export async function definirProximoPassoAction(escopo: EscopoVendas, id: string, input: ProximoPassoInput): Promise<ActionResult<VendasLead>> {
  return run(async () => (await apiFetch<VendasLead>(base(escopo, `/leads/${enc(id)}/proximo-passo`), { method: 'POST', body: input })).data)
}

/** `agenteId: null` devolve o lead ao pool. */
export async function reatribuirLeadAction(escopo: EscopoVendas, id: string, agenteId: string | null): Promise<ActionResult<VendasLead>> {
  return run(
    async () => (await apiFetch<VendasLead>(base(escopo, `/leads/${enc(id)}/reatribuir`), { method: 'POST', body: { agenteId } })).data,
  )
}

export async function getMensagemLeadAction(escopo: EscopoVendas, id: string, modelo: string): Promise<ActionResult<MensagemLeadResponse>> {
  return run(async () => (await apiFetch<MensagemLeadResponse>(base(escopo, `/leads/${enc(id)}/mensagem`), { query: { modelo } })).data)
}

// ---------------------------------------------------------------------------
// Carteira
// ---------------------------------------------------------------------------

export async function getCarteiraAction(
  escopo: EscopoVendas,
  filtros: { situacao?: SituacaoCarteira; q?: string; page?: number; perPage?: number } = {},
): Promise<ActionResult<CarteiraResposta>> {
  return run(async () => {
    const { data } = await apiFetch<CarteiraResposta>(base(escopo, '/carteira'), {
      query: { situacao: filtros.situacao, q: filtros.q?.trim() || undefined, page: filtros.page, perPage: filtros.perPage },
    })
    return data
  })
}

// ---------------------------------------------------------------------------
// Planos e conversão
// ---------------------------------------------------------------------------

/**
 * Plataforma: planos ANNETEC (inclusive os fora da vitrine), por `GET /vendas/planos` do módulo novo
 * (vale para equipe e vendedor). Clube: planos ativos do clube, com a taxa de adesão real
 * (`enrollmentFee`, 0 quando isenta).
 */
export async function listarPlanosAction(escopo: EscopoVendas): Promise<ActionResult<PlanoVendavel[]>> {
  return run(async () => {
    if (escopo.kind === 'platform') {
      const { data } = await apiFetch<PlatformPlanOffer[]>('/api/v1/vendas/planos')
      return (data ?? []).map(normalizePlanOffer).map<PlanoVendavel>(p => ({
        id: p.id,
        nome: p.name,
        precoMensal: p.priceMonthly,
        adesao: p.pricing.setupFee,
        descricao: p.pricing.tagline ?? null,
      }))
    }
    const { data } = await apiFetch<ClubPlan[]>(`/api/v1/t/${enc(escopo.slug)}/public/planos`, { token: null })
    return (data ?? []).map<PlanoVendavel>(p => ({
      id: p.id,
      nome: p.name,
      precoMensal: p.priceMonthly,
      adesao: p.enrollmentFeeWaived ? 0 : Math.max(0, p.enrollmentFee ?? 0),
      descricao: p.description || null,
    }))
  })
}

/** Plataforma. 422 com `fieldErrors` quando faltam CNPJ, e-mail, telefone ou vidas no lead. */
export async function criarPropostaLeadAction(
  escopo: EscopoVendas,
  id: string,
  input: { planoId: string; enviarEmail: boolean },
): Promise<ActionResult<SellerLinkResult>> {
  return run(async () => (await apiFetch<SellerLinkResult>(base(escopo, `/leads/${enc(id)}/proposta`), { method: 'POST', body: input })).data)
}

export async function getPropostaLeadAction(escopo: EscopoVendas, id: string): Promise<ActionResult<SellerProposal>> {
  return run(async () => (await apiFetch<SellerProposal>(base(escopo, `/leads/${enc(id)}/proposta`))).data)
}

export async function pedirDescontoLeadAction(
  escopo: EscopoVendas,
  id: string,
  input: DiscountRequestInput,
): Promise<ActionResult<SellerLinkResult>> {
  return run(async () => (await apiFetch<SellerLinkResult>(base(escopo, `/leads/${enc(id)}/desconto`), { method: 'POST', body: input })).data)
}

/** Clube: link de adesão por plano (`?ref=` e `?lead=` embutidos). */
export async function gerarLinkAdesaoAction(escopo: EscopoVendas, id: string, planoId: string): Promise<ActionResult<LinkAdesao>> {
  return run(async () => (await apiFetch<LinkAdesao>(base(escopo, `/leads/${enc(id)}/link-adesao`), { method: 'POST', body: { planoId } })).data)
}

/** Clube: assinatura presencial (Pix ou boleto). Cartão exige o link de adesão. */
export async function assinarLeadAction(
  escopo: EscopoVendas,
  id: string,
  input: { planoId: string; metodoPagamento: 'pix' | 'boleto'; diaVencimento?: number },
): Promise<ActionResult<CheckoutResult>> {
  return run(async () => (await apiFetch<CheckoutResult>(base(escopo, `/leads/${enc(id)}/assinar`), { method: 'POST', body: input })).data)
}

// ---------------------------------------------------------------------------
// Agentes (reatribuição e Ajustes)
// ---------------------------------------------------------------------------

export async function listarAgentesAction(
  escopo: EscopoVendas,
  filtros: { papel?: PapelComercial; busca?: string; perPage?: number } = {},
): Promise<ActionResult<VendasAgente[]>> {
  return run(async () => {
    const termo = filtros.busca?.trim() || undefined
    const { data } = await apiFetch<VendasAgente[]>(base(escopo, '/rede/agentes'), {
      query: { papel: filtros.papel, q: termo, busca: termo, perPage: filtros.perPage ?? 100 },
    })
    return data ?? []
  })
}

/** Ajustes: o agente atualiza os próprios dados e o repasse. */
export async function atualizarAgenteAction(escopo: EscopoVendas, id: string, input: UpdateAgenteInput): Promise<ActionResult<VendasAgente>> {
  return run(async () => (await apiFetch<VendasAgente>(base(escopo, `/rede/agentes/${enc(id)}`), { method: 'PATCH', body: input })).data)
}
