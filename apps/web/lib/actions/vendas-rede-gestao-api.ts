'use server'

import type {
  CancelarComissaoInput,
  CreateAgenteInput,
  CreateCorretoraInput,
  CreateEquipeInput,
  CreateGerenteInput,
  CreateUnidadeInput,
  ListAgentesQuery,
  ListComissoesQuery,
  PagarComissoesInput,
  ResultadosQuery,
  UpdateAgenteInput,
  UpdateConfigInput,
  UpdateCorretoraInput,
  UpdateEquipeInput,
  UpdateUnidadeInput,
  VendasAgente,
  VendasArvoreRede,
  VendasComissao,
  VendasComissoesResposta,
  VendasConfigResposta,
  VendasCorretora,
  VendasEquipe,
  VendasEu,
  VendasLead,
  VendasPainelResultados,
  VendasUnidade,
} from '@annetec/contracts'
import { apiFetch } from '@/lib/api/client'
import type {
  ConviteResultado,
  DesempenhoAgente,
  EscopoRede,
  PaginaRede,
  ResultadoRemocao,
  ResumoComissoes,
} from '@/components/vendas-rede/gestao/tipos'
import { run, type ActionResult } from './_api-result'

/**
 * Gestão da Rede Comercial (rede, equipe, resultados, comissões e regras).
 * O primeiro parâmetro de toda action é o escopo: `/api/v1/vendas` na
 * plataforma e `/api/v1/t/:slug/vendas` no clube (mesmo conjunto de rotas).
 * A API decide o que cada papel pode ver ou fazer; aqui só se monta a chamada.
 */

function prefixoApi(escopo: EscopoRede): string {
  return escopo.kind === 'platform' ? '/api/v1/vendas' : `/api/v1/t/${encodeURIComponent(escopo.slug)}/vendas`
}

const enc = encodeURIComponent

type Consulta = Record<string, string | number | boolean | undefined | null>

async function obter<T>(escopo: EscopoRede, caminho: string, query?: Consulta): Promise<T> {
  return (await apiFetch<T>(`${prefixoApi(escopo)}${caminho}`, { query })).data
}

async function obterPagina<T>(escopo: EscopoRede, caminho: string, query: Consulta, page = 1, perPage = 20): Promise<PaginaRede<T>> {
  const { data, meta } = await apiFetch<T[]>(`${prefixoApi(escopo)}${caminho}`, { query })
  const items = data ?? []
  return { items, meta: meta ?? { page, perPage, total: items.length, totalPages: items.length === 0 ? 0 : 1 } }
}

async function enviar<T>(escopo: EscopoRede, caminho: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  return (await apiFetch<T>(`${prefixoApi(escopo)}${caminho}`, { method, body })).data
}

// --- Perfil -----------------------------------------------------------------

export async function euAction(escopo: EscopoRede): Promise<ActionResult<VendasEu>> {
  return run(() => obter<VendasEu>(escopo, '/eu'))
}

// --- Árvore e corretoras ------------------------------------------------------

export async function arvoreAction(escopo: EscopoRede): Promise<ActionResult<VendasArvoreRede>> {
  return run(() => obter<VendasArvoreRede>(escopo, '/rede/arvore'))
}

export async function listCorretorasAction(
  escopo: EscopoRede,
  query: { q?: string; status?: 'ativa' | 'inativa'; page?: number; perPage?: number } = {},
): Promise<ActionResult<PaginaRede<VendasCorretora>>> {
  return run(() => obterPagina<VendasCorretora>(escopo, '/rede/corretoras', { perPage: 100, ...query }, query.page, query.perPage ?? 100))
}

export async function getCorretoraAction(escopo: EscopoRede, id: string): Promise<ActionResult<VendasCorretora>> {
  return run(() => obter<VendasCorretora>(escopo, `/rede/corretoras/${enc(id)}`))
}

export async function createCorretoraAction(escopo: EscopoRede, input: CreateCorretoraInput): Promise<ActionResult<VendasCorretora>> {
  return run(() => enviar<VendasCorretora>(escopo, '/rede/corretoras', 'POST', input))
}

export async function updateCorretoraAction(
  escopo: EscopoRede,
  id: string,
  input: UpdateCorretoraInput,
): Promise<ActionResult<VendasCorretora>> {
  return run(() => enviar<VendasCorretora>(escopo, `/rede/corretoras/${enc(id)}`, 'PATCH', input))
}

export async function removerCorretoraAction(escopo: EscopoRede, id: string): Promise<ActionResult<ResultadoRemocao>> {
  return run(() => enviar<ResultadoRemocao>(escopo, `/rede/corretoras/${enc(id)}`, 'DELETE'))
}

export async function createGerenteAction(
  escopo: EscopoRede,
  corretoraId: string,
  input: CreateGerenteInput,
): Promise<ActionResult<{ agente: VendasAgente; convite: ConviteResultado }>> {
  return run(() => enviar(escopo, `/rede/corretoras/${enc(corretoraId)}/gerente`, 'POST', input))
}

// --- Unidades ----------------------------------------------------------------

export async function listUnidadesAction(
  escopo: EscopoRede,
  query: { corretoraId?: string; status?: 'ativa' | 'inativa' } = {},
): Promise<ActionResult<PaginaRede<VendasUnidade>>> {
  return run(() => obterPagina<VendasUnidade>(escopo, '/rede/unidades', { perPage: 200, ...query }, 1, 200))
}

export async function createUnidadeAction(escopo: EscopoRede, input: CreateUnidadeInput): Promise<ActionResult<VendasUnidade>> {
  return run(() => enviar<VendasUnidade>(escopo, '/rede/unidades', 'POST', input))
}

export async function updateUnidadeAction(
  escopo: EscopoRede,
  id: string,
  input: UpdateUnidadeInput,
): Promise<ActionResult<VendasUnidade>> {
  return run(() => enviar<VendasUnidade>(escopo, `/rede/unidades/${enc(id)}`, 'PATCH', input))
}

export async function removerUnidadeAction(escopo: EscopoRede, id: string): Promise<ActionResult<ResultadoRemocao>> {
  return run(() => enviar<ResultadoRemocao>(escopo, `/rede/unidades/${enc(id)}`, 'DELETE'))
}

// --- Equipes -----------------------------------------------------------------

export async function listEquipesAction(
  escopo: EscopoRede,
  query: { corretoraId?: string; unidadeId?: string; status?: 'ativa' | 'inativa' } = {},
): Promise<ActionResult<PaginaRede<VendasEquipe>>> {
  return run(() => obterPagina<VendasEquipe>(escopo, '/rede/equipes', { perPage: 200, ...query }, 1, 200))
}

export async function createEquipeAction(escopo: EscopoRede, input: CreateEquipeInput): Promise<ActionResult<VendasEquipe>> {
  return run(() => enviar<VendasEquipe>(escopo, '/rede/equipes', 'POST', input))
}

export async function updateEquipeAction(escopo: EscopoRede, id: string, input: UpdateEquipeInput): Promise<ActionResult<VendasEquipe>> {
  return run(() => enviar<VendasEquipe>(escopo, `/rede/equipes/${enc(id)}`, 'PATCH', input))
}

export async function removerEquipeAction(escopo: EscopoRede, id: string): Promise<ActionResult<ResultadoRemocao>> {
  return run(() => enviar<ResultadoRemocao>(escopo, `/rede/equipes/${enc(id)}`, 'DELETE'))
}

// --- Agentes -----------------------------------------------------------------

export async function listAgentesAction(
  escopo: EscopoRede,
  query: Partial<Pick<ListAgentesQuery, 'papel' | 'corretoraId' | 'unidadeId' | 'equipeId' | 'ativo' | 'q' | 'page' | 'perPage'>> = {},
): Promise<ActionResult<PaginaRede<VendasAgente>>> {
  return run(() => obterPagina<VendasAgente>(escopo, '/rede/agentes', { perPage: 100, ...query }, query.page, query.perPage ?? 100))
}

export async function getAgenteAction(escopo: EscopoRede, id: string): Promise<ActionResult<VendasAgente>> {
  return run(() => obter<VendasAgente>(escopo, `/rede/agentes/${enc(id)}`))
}

export async function createAgenteAction(
  escopo: EscopoRede,
  input: CreateAgenteInput,
): Promise<ActionResult<{ agente: VendasAgente; convite: ConviteResultado }>> {
  return run(() => enviar(escopo, '/rede/agentes', 'POST', input))
}

export async function updateAgenteAction(escopo: EscopoRede, id: string, input: UpdateAgenteInput): Promise<ActionResult<VendasAgente>> {
  return run(() => enviar<VendasAgente>(escopo, `/rede/agentes/${enc(id)}`, 'PATCH', input))
}

export async function ativarAgenteAction(escopo: EscopoRede, id: string): Promise<ActionResult<VendasAgente>> {
  return run(() => enviar<VendasAgente>(escopo, `/rede/agentes/${enc(id)}/ativar`, 'POST'))
}

export async function desativarAgenteAction(escopo: EscopoRede, id: string): Promise<ActionResult<VendasAgente>> {
  return run(() => enviar<VendasAgente>(escopo, `/rede/agentes/${enc(id)}/desativar`, 'POST'))
}

export async function reenviarConviteAction(escopo: EscopoRede, id: string): Promise<ActionResult<ConviteResultado>> {
  return run(() => enviar<ConviteResultado>(escopo, `/rede/agentes/${enc(id)}/reenviar-convite`, 'POST'))
}

export async function desempenhoAgenteAction(
  escopo: EscopoRede,
  id: string,
  periodo: '30d' | 'mes' | 'trimestre' = '30d',
): Promise<ActionResult<DesempenhoAgente>> {
  return run(() => obter<DesempenhoAgente>(escopo, `/rede/agentes/${enc(id)}/desempenho`, { periodo }))
}

// --- Comissões ---------------------------------------------------------------

export async function listComissoesAction(
  escopo: EscopoRede,
  query: Partial<Pick<ListComissoesQuery, 'mes' | 'status' | 'agente' | 'page' | 'perPage'>> = {},
): Promise<ActionResult<VendasComissoesResposta>> {
  return run(() => obter<VendasComissoesResposta>(escopo, '/comissoes', { perPage: 100, ...query }))
}

export async function resumoComissoesAction(escopo: EscopoRede, mes?: string): Promise<ActionResult<ResumoComissoes>> {
  return run(() => obter<ResumoComissoes>(escopo, '/comissoes/resumo', { mes }))
}

export async function pagarComissoesAction(
  escopo: EscopoRede,
  input: PagarComissoesInput,
): Promise<ActionResult<{ pagas: number; ignoradas: number }>> {
  return run(() => enviar<{ pagas: number; ignoradas: number }>(escopo, '/comissoes/pagar', 'POST', input))
}

export async function cancelarComissaoAction(
  escopo: EscopoRede,
  id: string,
  input: CancelarComissaoInput,
): Promise<ActionResult<VendasComissao>> {
  return run(() => enviar<VendasComissao>(escopo, `/comissoes/${enc(id)}/cancelar`, 'POST', input))
}

// --- Painel de resultados ----------------------------------------------------

export async function resultadosAction(
  escopo: EscopoRede,
  query: Partial<ResultadosQuery> = {},
): Promise<ActionResult<VendasPainelResultados>> {
  return run(() => obter<VendasPainelResultados>(escopo, '/painel/resultados', query))
}

// --- Regras (config) ---------------------------------------------------------

export async function getConfigAction(escopo: EscopoRede): Promise<ActionResult<VendasConfigResposta>> {
  return run(() => obter<VendasConfigResposta>(escopo, '/config'))
}

export async function updateConfigAction(escopo: EscopoRede, input: UpdateConfigInput): Promise<ActionResult<VendasConfigResposta>> {
  return run(async () => {
    await enviar(escopo, '/config', 'PUT', input)
    return obter<VendasConfigResposta>(escopo, '/config')
  })
}

// --- Leads (reatribuição em lote na tela Equipe) -------------------------------

export async function listLeadsDoAgenteAction(
  escopo: EscopoRede,
  agenteId: string,
  estacao: 'novos' | 'andamento' = 'andamento',
): Promise<ActionResult<PaginaRede<VendasLead>>> {
  return run(() => obterPagina<VendasLead>(escopo, '/leads', { agente: agenteId, estacao, perPage: 100 }, 1, 100))
}

export async function reatribuirLeadAction(escopo: EscopoRede, leadId: string, agenteId: string | null): Promise<ActionResult<VendasLead>> {
  return run(() => enviar<VendasLead>(escopo, `/leads/${enc(leadId)}/reatribuir`, 'POST', { agenteId }))
}
