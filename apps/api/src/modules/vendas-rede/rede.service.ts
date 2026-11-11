import {
  ERROR_CODES,
  EVENTOS_DE_CONTATO,
  type CreateAgenteInput,
  type CreateCorretoraInput,
  type CreateEquipeInput,
  type CreateGerenteInput,
  type CreateUnidadeInput,
  type DesempenhoAgenteQuery,
  type ListAgentesQuery,
  type ListCorretorasQuery,
  type ListEquipesQuery,
  type ListUnidadesQuery,
  type PapelComercial,
  type UpdateAgenteInput,
  type UpdateCorretoraInput,
  type UpdateEquipeInput,
  type UpdateUnidadeInput,
  type VendasAgente,
  type VendasArvoreCorretora,
  type VendasArvoreEquipe,
  type VendasArvoreRede,
  type VendasArvoreUnidade,
  type VendasCorretora,
  type VendasEquipe,
  type VendasEu,
  type VendasUnidade,
} from '@annetec/contracts'
import { and, asc, eq, gte, inArray, ne, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import {
  user,
  vendasAgentes,
  vendasComissoes,
  vendasCorretoras,
  vendasEquipes,
  vendasLeadEventos,
  vendasLeads,
  vendasUnidades,
  type VendasAgenteRow,
  type VendasCorretoraRow,
  type VendasEquipeRow,
  type VendasUnidadeRow,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import { getOrCreateConfig, toConfigPublica } from './config.service'
import { enviarConvite, provisionarUsuario, reenviarConvite, type ResultadoConvite } from './convites.service'
import { whereEscopo, type VendasCtx } from './context'
import { whereAgentesVisiveis } from './presenca.service'
import { toArvoreAgente, toVendasAgente, toVendasCorretora, toVendasEquipe, toVendasUnidade } from './presenter'
import { gerarCodigoIndicacao, mesReferenciaSaoPaulo } from './rules'

/**
 * Rede: perfil do usuário (`GET /eu`), corretoras, unidades, equipes, agentes,
 * desempenho e árvore (`docs/rede-comercial.md`, 4.2).
 *
 * Toda leitura e escrita é presa ao escopo (`ctx.scope` + `ctx.tenantId`):
 * id de outro escopo/inquilino responde 404, nunca 403 (anti-IDOR). Listagens
 * filtram o texto de busca e paginam em memória: a rede de um escopo é pequena
 * (centenas de linhas) e isso mantém as consultas simples e testáveis.
 */

// ---------------------------------------------------------------------------
// Erros e utilidades
// ---------------------------------------------------------------------------

const semPermissao = (mensagem = 'Seu papel na rede não permite esta operação.') =>
  new AppError(ERROR_CODES.VENDAS_SEM_PERMISSAO_NA_REDE, mensagem)
const jaExiste = (mensagem: string) => new AppError(ERROR_CODES.ALREADY_EXISTS, mensagem)
const regra = (mensagem: string) => AppError.businessRule(mensagem)

function violouUnicidade(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

function combina(termo: string | undefined, ...campos: (string | null | undefined)[]): boolean {
  if (!termo) return true
  const alvo = normalizar(termo)
  const digitos = termo.replace(/\D/g, '')
  return campos.some(campo => {
    const texto = normalizar(campo)
    if (texto.includes(alvo)) return true
    return digitos.length >= 3 && (campo ?? '').replace(/\D/g, '').includes(digitos)
  })
}

export function paginar<T>(itens: T[], page: number, perPage: number): { items: T[]; total: number } {
  return { items: itens.slice((page - 1) * perPage, page * perPage), total: itens.length }
}

/** Remove as chaves `undefined` (PATCH parcial). */
function semIndefinidos<T extends Record<string, unknown>>(valores: T): Partial<T> {
  return Object.fromEntries(Object.entries(valores).filter(([, valor]) => valor !== undefined)) as Partial<T>
}

// ---------------------------------------------------------------------------
// GET /eu
// ---------------------------------------------------------------------------

/** Contadores do cabeçalho: pool do escopo, "minha vez" e leads em andamento do próprio agente. */
async function contadores(ctx: VendasCtx): Promise<VendasEu['contadores']> {
  const agenteId = ctx.agente?.id ?? null
  const aberto = sql`${vendasLeads.etapa} not in ('ganho', 'perdido')`
  const pool = ctx.papel === 'balcao' ? sql`0` : sql`count(*) filter (where ${vendasLeads.agenteId} is null and ${aberto})`
  const minhaVez = agenteId
    ? sql`count(*) filter (where ${vendasLeads.agenteId} = ${agenteId} and ${aberto} and (
        (${vendasLeads.etapa} = 'novo' and ${vendasLeads.ultimoContatoEm} is null)
        or (${vendasLeads.proximoPassoEm} is not null and ${vendasLeads.proximoPassoEm} <= now())
      ))`
    : sql`0`
  const emAndamento = agenteId
    ? sql`count(*) filter (where ${vendasLeads.agenteId} = ${agenteId} and ${vendasLeads.etapa} in ('em_contato', 'proposta', 'negociacao'))`
    : sql`0`

  const [row] = await db
    .select({
      pool: sql<number>`${pool}`.mapWith(Number),
      minhaVez: sql<number>`${minhaVez}`.mapWith(Number),
      emAndamento: sql<number>`${emAndamento}`.mapWith(Number),
    })
    .from(vendasLeads)
    .where(whereEscopo(vendasLeads, ctx))
  return { pool: row?.pool ?? 0, minhaVez: row?.minhaVez ?? 0, emAndamento: row?.emAndamento ?? 0 }
}

/** `GET /eu`: perfil + papel + escopo + config pública + contadores. */
export async function obterEu(ctx: VendasCtx, agora: Date = new Date()): Promise<VendasEu> {
  const config = await getOrCreateConfig(ctx.scope, ctx.tenantId)
  let agente: VendasEu['agente'] = null
  if (ctx.agente) {
    const [conta] = await db.select({ email: user.email }).from(user).where(eq(user.id, ctx.agente.userId)).limit(1)
    agente = toVendasAgente(ctx.agente, { email: conta?.email ?? null, agora, presencaMinutos: config.presencaMinutos })
  }
  return {
    scope: ctx.scope,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    papel: ctx.papel,
    masterImplicito: ctx.masterImplicito,
    podeEscrever: ctx.podeEscrever,
    agente,
    config: toConfigPublica(config),
    contadores: await contadores(ctx),
  }
}

// ---------------------------------------------------------------------------
// Buscas presas ao escopo
// ---------------------------------------------------------------------------

async function acharCorretora(ctx: VendasCtx, id: string): Promise<VendasCorretoraRow> {
  const [row] = await db
    .select()
    .from(vendasCorretoras)
    .where(and(whereEscopo(vendasCorretoras, ctx), eq(vendasCorretoras.id, id)))
    .limit(1)
  if (!row) throw AppError.notFound('Corretora')
  return row
}

async function acharUnidade(ctx: VendasCtx, id: string): Promise<VendasUnidadeRow> {
  const [row] = await db
    .select()
    .from(vendasUnidades)
    .where(and(whereEscopo(vendasUnidades, ctx), eq(vendasUnidades.id, id)))
    .limit(1)
  if (!row) throw AppError.notFound('Unidade')
  return row
}

async function acharEquipe(ctx: VendasCtx, id: string): Promise<VendasEquipeRow> {
  const [row] = await db
    .select()
    .from(vendasEquipes)
    .where(and(whereEscopo(vendasEquipes, ctx), eq(vendasEquipes.id, id)))
    .limit(1)
  if (!row) throw AppError.notFound('Equipe')
  return row
}

async function acharAgenteNoEscopo(ctx: VendasCtx, id: string): Promise<VendasAgenteRow> {
  const [row] = await db
    .select()
    .from(vendasAgentes)
    .where(and(whereEscopo(vendasAgentes, ctx), eq(vendasAgentes.id, id)))
    .limit(1)
  if (!row) throw AppError.notFound('Agente')
  return row
}

async function existeAgente(ctx: VendasCtx, filtro: SQL): Promise<boolean> {
  const [row] = await db
    .select({ id: vendasAgentes.id })
    .from(vendasAgentes)
    .where(and(whereEscopo(vendasAgentes, ctx), filtro))
    .limit(1)
  return Boolean(row)
}

// ---------------------------------------------------------------------------
// Corretoras (master)
// ---------------------------------------------------------------------------

export async function listarCorretoras(
  ctx: VendasCtx,
  query: ListCorretorasQuery,
): Promise<{ items: VendasCorretora[]; total: number }> {
  const rows = await db
    .select()
    .from(vendasCorretoras)
    .where(and(whereEscopo(vendasCorretoras, ctx), query.status ? eq(vendasCorretoras.status, query.status) : undefined))
    .orderBy(asc(vendasCorretoras.nomeFantasia))
  const filtradas = rows.filter(row => combina(query.q, row.nomeFantasia, row.razaoSocial, row.cnpj, row.email))
  const { items, total } = paginar(filtradas, query.page, query.perPage)
  return { items: items.map(toVendasCorretora), total }
}

export async function obterCorretora(ctx: VendasCtx, id: string): Promise<VendasCorretora> {
  return toVendasCorretora(await acharCorretora(ctx, id))
}

async function garantirCnpjLivre(ctx: VendasCtx, cnpj: string, exceto?: string): Promise<void> {
  const [row] = await db
    .select({ id: vendasCorretoras.id })
    .from(vendasCorretoras)
    .where(and(whereEscopo(vendasCorretoras, ctx), eq(vendasCorretoras.cnpj, cnpj), exceto ? ne(vendasCorretoras.id, exceto) : undefined))
    .limit(1)
  if (row) throw jaExiste('Já existe uma corretora com este CNPJ')
}

export async function criarCorretora(ctx: VendasCtx, input: CreateCorretoraInput): Promise<VendasCorretora> {
  await garantirCnpjLivre(ctx, input.cnpj)
  try {
    const [row] = await db
      .insert(vendasCorretoras)
      .values({
        scope: ctx.scope,
        tenantId: ctx.tenantId,
        nomeFantasia: input.nomeFantasia,
        razaoSocial: input.razaoSocial,
        cnpj: input.cnpj,
        email: input.email ?? null,
        telefone: input.telefone ?? null,
        endereco: input.endereco ?? null,
        comissaoOverrides: input.comissaoOverrides ?? null,
        observacoes: input.observacoes ?? null,
        createdByUserId: ctx.userId,
      })
      .returning()
    if (!row) throw new Error('Falha ao criar a corretora')
    return toVendasCorretora(row)
  } catch (error) {
    if (violouUnicidade(error)) throw jaExiste('Já existe uma corretora com este CNPJ')
    throw error
  }
}

export async function atualizarCorretora(
  ctx: VendasCtx,
  id: string,
  input: UpdateCorretoraInput,
): Promise<{ antes: VendasCorretora; depois: VendasCorretora }> {
  const antes = await acharCorretora(ctx, id)
  if (input.cnpj !== undefined && input.cnpj !== antes.cnpj) await garantirCnpjLivre(ctx, input.cnpj, id)
  try {
    const [depois] = await db
      .update(vendasCorretoras)
      .set({
        ...semIndefinidos({
          nomeFantasia: input.nomeFantasia,
          razaoSocial: input.razaoSocial,
          cnpj: input.cnpj,
          email: input.email,
          telefone: input.telefone,
          endereco: input.endereco,
          comissaoOverrides: input.comissaoOverrides,
          observacoes: input.observacoes,
          status: input.status,
        }),
        updatedAt: new Date(),
      })
      .where(and(whereEscopo(vendasCorretoras, ctx), eq(vendasCorretoras.id, id)))
      .returning()
    if (!depois) throw AppError.notFound('Corretora')
    return { antes: toVendasCorretora(antes), depois: toVendasCorretora(depois) }
  } catch (error) {
    if (violouUnicidade(error)) throw jaExiste('Já existe uma corretora com este CNPJ')
    throw error
  }
}

/** Apaga a corretora vazia; com agentes ou comissões, só a marca como `inativa` (preserva o histórico). */
export async function removerCorretora(
  ctx: VendasCtx,
  id: string,
): Promise<{ resultado: 'removida' | 'inativada'; corretora: VendasCorretora }> {
  const corretora = await acharCorretora(ctx, id)
  const temAgentes = await existeAgente(ctx, eq(vendasAgentes.corretoraId, id))
  const [comissao] = await db
    .select({ id: vendasComissoes.id })
    .from(vendasComissoes)
    .where(and(whereEscopo(vendasComissoes, ctx), eq(vendasComissoes.beneficiarioCorretoraId, id)))
    .limit(1)
  if (temAgentes || comissao) {
    const [row] = await db
      .update(vendasCorretoras)
      .set({ status: 'inativa', updatedAt: new Date() })
      .where(and(whereEscopo(vendasCorretoras, ctx), eq(vendasCorretoras.id, id)))
      .returning()
    return { resultado: 'inativada', corretora: toVendasCorretora(row ?? { ...corretora, status: 'inativa' }) }
  }
  await db.delete(vendasCorretoras).where(and(whereEscopo(vendasCorretoras, ctx), eq(vendasCorretoras.id, id)))
  return { resultado: 'removida', corretora: toVendasCorretora(corretora) }
}

// ---------------------------------------------------------------------------
// Autorização da estrutura (unidades e equipes)
// ---------------------------------------------------------------------------

/** Master: qualquer corretora (ou nenhuma). Gerente: só a sua. */
function autorizarEstrutura(ctx: VendasCtx, corretoraId: string | null): void {
  if (ctx.papel === 'master') return
  if (ctx.papel === 'gerente' && ctx.agente?.corretoraId && corretoraId === ctx.agente.corretoraId) return
  throw semPermissao('Você só gerencia a estrutura da sua corretora.')
}

/** Concilia o que o pedido informou com o que o "pai" (unidade/equipe) já determina. */
function conciliar(informado: string | null | undefined, doPai: string | null, rotulo: string): string | null {
  if (informado && doPai && informado !== doPai) {
    throw regra(`A ${rotulo} informada não confere com o vínculo escolhido`)
  }
  return doPai ?? informado ?? null
}

async function validarResponsavel(ctx: VendasCtx, agenteId: string | null | undefined, corretoraId: string | null): Promise<void> {
  if (!agenteId) return
  const agente = await acharAgenteNoEscopo(ctx, agenteId)
  if (corretoraId && agente.corretoraId !== corretoraId) {
    throw regra('O responsável precisa ser da mesma corretora da unidade')
  }
}

async function validarSupervisor(ctx: VendasCtx, agenteId: string | null | undefined, corretoraId: string | null): Promise<void> {
  if (!agenteId) return
  const agente = await acharAgenteNoEscopo(ctx, agenteId)
  if (agente.papel !== 'supervisor') throw regra('O supervisor da equipe precisa ter o papel supervisor')
  if (!agente.ativo) throw regra('O supervisor informado está inativo')
  if ((agente.corretoraId ?? null) !== corretoraId) {
    throw regra('O supervisor precisa ser da mesma corretora da equipe')
  }
}

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------

/** Unidades que o papel enxerga: master tudo; gerente a corretora; demais, as do seu vínculo. */
function unidadesVisiveis(ctx: VendasCtx, unidades: VendasUnidadeRow[], equipes: VendasEquipeRow[]): VendasUnidadeRow[] {
  if (ctx.visibilidade.todos) return unidades
  if (ctx.papel === 'gerente' && ctx.visibilidade.corretoraId) return unidades.filter(u => u.corretoraId === ctx.visibilidade.corretoraId)
  const ids = new Set<string>()
  if (ctx.agente?.unidadeId) ids.add(ctx.agente.unidadeId)
  const minhas = new Set(ctx.visibilidade.equipeIds ?? [])
  if (ctx.agente?.equipeId) minhas.add(ctx.agente.equipeId)
  for (const equipe of equipes) if (minhas.has(equipe.id) && equipe.unidadeId) ids.add(equipe.unidadeId)
  return unidades.filter(u => ids.has(u.id))
}

function equipesVisiveis(ctx: VendasCtx, equipes: VendasEquipeRow[]): VendasEquipeRow[] {
  if (ctx.visibilidade.todos) return equipes
  if (ctx.papel === 'gerente' && ctx.visibilidade.corretoraId) return equipes.filter(e => e.corretoraId === ctx.visibilidade.corretoraId)
  const ids = new Set(ctx.visibilidade.equipeIds ?? [])
  if (ctx.agente?.equipeId) ids.add(ctx.agente.equipeId)
  return equipes.filter(e => ids.has(e.id))
}

export async function listarUnidades(
  ctx: VendasCtx,
  query: ListUnidadesQuery,
): Promise<{ items: VendasUnidade[]; total: number }> {
  const [rows, equipes] = await Promise.all([
    db
      .select()
      .from(vendasUnidades)
      .where(
        and(
          whereEscopo(vendasUnidades, ctx),
          query.corretoraId ? eq(vendasUnidades.corretoraId, query.corretoraId) : undefined,
          query.status ? eq(vendasUnidades.status, query.status) : undefined,
        ),
      )
      .orderBy(asc(vendasUnidades.nome)),
    db.select().from(vendasEquipes).where(whereEscopo(vendasEquipes, ctx)),
  ])
  const visiveis = unidadesVisiveis(ctx, rows, equipes).filter(row => combina(query.q, row.nome, row.telefone))
  const { items, total } = paginar(visiveis, query.page, query.perPage)
  return { items: items.map(toVendasUnidade), total }
}

export async function criarUnidade(ctx: VendasCtx, input: CreateUnidadeInput): Promise<VendasUnidade> {
  const corretoraId = input.corretoraId ?? null
  autorizarEstrutura(ctx, corretoraId)
  if (corretoraId) await acharCorretora(ctx, corretoraId)
  await validarResponsavel(ctx, input.responsavelAgenteId, corretoraId)
  const [row] = await db
    .insert(vendasUnidades)
    .values({
      scope: ctx.scope,
      tenantId: ctx.tenantId,
      corretoraId,
      nome: input.nome,
      tipo: input.tipo,
      endereco: input.endereco ?? null,
      telefone: input.telefone ?? null,
      responsavelAgenteId: input.responsavelAgenteId ?? null,
    })
    .returning()
  if (!row) throw new Error('Falha ao criar a unidade')
  return toVendasUnidade(row)
}

export async function atualizarUnidade(
  ctx: VendasCtx,
  id: string,
  input: UpdateUnidadeInput,
): Promise<{ antes: VendasUnidade; depois: VendasUnidade }> {
  const antes = await acharUnidade(ctx, id)
  autorizarEstrutura(ctx, antes.corretoraId ?? null)
  const corretoraId = input.corretoraId !== undefined ? input.corretoraId : (antes.corretoraId ?? null)
  if (input.corretoraId !== undefined && corretoraId !== (antes.corretoraId ?? null)) {
    autorizarEstrutura(ctx, corretoraId)
    if (corretoraId) await acharCorretora(ctx, corretoraId)
    const temVinculos =
      (await existeAgente(ctx, eq(vendasAgentes.unidadeId, id))) ||
      (await db.select({ id: vendasEquipes.id }).from(vendasEquipes).where(eq(vendasEquipes.unidadeId, id)).limit(1)).length > 0
    if (temVinculos) throw regra('Há equipes ou agentes nesta unidade: mova-os antes de trocar a corretora')
  }
  if (input.responsavelAgenteId !== undefined) await validarResponsavel(ctx, input.responsavelAgenteId, corretoraId)
  const [depois] = await db
    .update(vendasUnidades)
    .set({
      ...semIndefinidos({
        corretoraId: input.corretoraId,
        nome: input.nome,
        tipo: input.tipo,
        endereco: input.endereco,
        telefone: input.telefone,
        responsavelAgenteId: input.responsavelAgenteId,
        status: input.status,
      }),
      updatedAt: new Date(),
    })
    .where(and(whereEscopo(vendasUnidades, ctx), eq(vendasUnidades.id, id)))
    .returning()
  if (!depois) throw AppError.notFound('Unidade')
  return { antes: toVendasUnidade(antes), depois: toVendasUnidade(depois) }
}

/** Apaga a unidade vazia; com agentes ou equipes, só a marca como `inativa`. */
export async function removerUnidade(
  ctx: VendasCtx,
  id: string,
): Promise<{ resultado: 'removida' | 'inativada'; unidade: VendasUnidade }> {
  const unidade = await acharUnidade(ctx, id)
  autorizarEstrutura(ctx, unidade.corretoraId ?? null)
  const temAgentes = await existeAgente(ctx, eq(vendasAgentes.unidadeId, id))
  const [equipe] = await db.select({ id: vendasEquipes.id }).from(vendasEquipes).where(eq(vendasEquipes.unidadeId, id)).limit(1)
  if (temAgentes || equipe) {
    const [row] = await db
      .update(vendasUnidades)
      .set({ status: 'inativa', updatedAt: new Date() })
      .where(and(whereEscopo(vendasUnidades, ctx), eq(vendasUnidades.id, id)))
      .returning()
    return { resultado: 'inativada', unidade: toVendasUnidade(row ?? { ...unidade, status: 'inativa' }) }
  }
  await db.delete(vendasUnidades).where(and(whereEscopo(vendasUnidades, ctx), eq(vendasUnidades.id, id)))
  return { resultado: 'removida', unidade: toVendasUnidade(unidade) }
}

// ---------------------------------------------------------------------------
// Equipes
// ---------------------------------------------------------------------------

export async function listarEquipes(ctx: VendasCtx, query: ListEquipesQuery): Promise<{ items: VendasEquipe[]; total: number }> {
  const rows = await db
    .select()
    .from(vendasEquipes)
    .where(
      and(
        whereEscopo(vendasEquipes, ctx),
        query.corretoraId ? eq(vendasEquipes.corretoraId, query.corretoraId) : undefined,
        query.unidadeId ? eq(vendasEquipes.unidadeId, query.unidadeId) : undefined,
        query.status ? eq(vendasEquipes.status, query.status) : undefined,
      ),
    )
    .orderBy(asc(vendasEquipes.nome))
  const visiveis = equipesVisiveis(ctx, rows).filter(row => combina(query.q, row.nome))
  const { items, total } = paginar(visiveis, query.page, query.perPage)
  return { items: items.map(toVendasEquipe), total }
}

/** Corretora/unidade da equipe: reconcilia os dois e exige ao menos um (a árvore da rede precisa de onde pendurar a equipe). */
async function resolverEstruturaDaEquipe(
  ctx: VendasCtx,
  corretoraIn: string | null | undefined,
  unidadeIn: string | null | undefined,
): Promise<{ corretoraId: string | null; unidadeId: string | null }> {
  let corretoraId = corretoraIn ?? null
  const unidadeId = unidadeIn ?? null
  if (unidadeId) {
    const unidade = await acharUnidade(ctx, unidadeId)
    if (unidade.corretoraId) corretoraId = conciliar(corretoraId, unidade.corretoraId, 'corretora')
    else if (corretoraId) throw regra('A unidade informada é própria do escopo e não pertence à corretora')
  }
  if (corretoraId) await acharCorretora(ctx, corretoraId)
  if (!corretoraId && !unidadeId) throw regra('Informe a corretora ou a unidade da equipe')
  return { corretoraId, unidadeId }
}

export async function criarEquipe(ctx: VendasCtx, input: CreateEquipeInput): Promise<VendasEquipe> {
  const { corretoraId, unidadeId } = await resolverEstruturaDaEquipe(ctx, input.corretoraId, input.unidadeId)
  autorizarEstrutura(ctx, corretoraId)
  await validarSupervisor(ctx, input.supervisorAgenteId, corretoraId)
  const [row] = await db
    .insert(vendasEquipes)
    .values({
      scope: ctx.scope,
      tenantId: ctx.tenantId,
      corretoraId,
      unidadeId,
      nome: input.nome,
      supervisorAgenteId: input.supervisorAgenteId ?? null,
    })
    .returning()
  if (!row) throw new Error('Falha ao criar a equipe')
  return toVendasEquipe(row)
}

export async function atualizarEquipe(
  ctx: VendasCtx,
  id: string,
  input: UpdateEquipeInput,
): Promise<{ antes: VendasEquipe; depois: VendasEquipe }> {
  const antes = await acharEquipe(ctx, id)
  autorizarEstrutura(ctx, antes.corretoraId ?? null)

  const mudaEstrutura = input.corretoraId !== undefined || input.unidadeId !== undefined
  let corretoraId = antes.corretoraId ?? null
  let unidadeId = antes.unidadeId ?? null
  if (mudaEstrutura) {
    // Informar só a unidade deriva a corretora dela; informar só a corretora mantém a unidade atual se for dela.
    const corretoraPedida = input.corretoraId !== undefined ? input.corretoraId : input.unidadeId ? undefined : corretoraId
    const unidadePedida = input.unidadeId !== undefined ? input.unidadeId : input.corretoraId !== undefined && input.corretoraId !== corretoraId ? null : unidadeId
    const resolvida = await resolverEstruturaDaEquipe(ctx, corretoraPedida, unidadePedida)
    corretoraId = resolvida.corretoraId
    unidadeId = resolvida.unidadeId
    autorizarEstrutura(ctx, corretoraId)
    if (corretoraId !== (antes.corretoraId ?? null) && (await existeAgente(ctx, eq(vendasAgentes.equipeId, id)))) {
      throw regra('Há agentes nesta equipe: mova-os antes de trocar a corretora')
    }
  }
  if (input.supervisorAgenteId !== undefined) await validarSupervisor(ctx, input.supervisorAgenteId, corretoraId)

  const [depois] = await db
    .update(vendasEquipes)
    .set({
      ...semIndefinidos({
        nome: input.nome,
        supervisorAgenteId: input.supervisorAgenteId,
        status: input.status,
      }),
      ...(mudaEstrutura ? { corretoraId, unidadeId } : {}),
      updatedAt: new Date(),
    })
    .where(and(whereEscopo(vendasEquipes, ctx), eq(vendasEquipes.id, id)))
    .returning()
  if (!depois) throw AppError.notFound('Equipe')

  // Quem está na equipe acompanha a unidade dela (a corretora não muda com agentes dentro).
  if (mudaEstrutura && unidadeId !== (antes.unidadeId ?? null)) {
    await db
      .update(vendasAgentes)
      .set({ unidadeId, updatedAt: new Date() })
      .where(and(whereEscopo(vendasAgentes, ctx), eq(vendasAgentes.equipeId, id)))
  }
  return { antes: toVendasEquipe(antes), depois: toVendasEquipe(depois) }
}

/** Apaga a equipe vazia; com agentes, só a marca como `inativa`. */
export async function removerEquipe(
  ctx: VendasCtx,
  id: string,
): Promise<{ resultado: 'removida' | 'inativada'; equipe: VendasEquipe }> {
  const equipe = await acharEquipe(ctx, id)
  autorizarEstrutura(ctx, equipe.corretoraId ?? null)
  if (await existeAgente(ctx, eq(vendasAgentes.equipeId, id))) {
    const [row] = await db
      .update(vendasEquipes)
      .set({ status: 'inativa', updatedAt: new Date() })
      .where(and(whereEscopo(vendasEquipes, ctx), eq(vendasEquipes.id, id)))
      .returning()
    return { resultado: 'inativada', equipe: toVendasEquipe(row ?? { ...equipe, status: 'inativa' }) }
  }
  await db.delete(vendasEquipes).where(and(whereEscopo(vendasEquipes, ctx), eq(vendasEquipes.id, id)))
  return { resultado: 'removida', equipe: toVendasEquipe(equipe) }
}

// ---------------------------------------------------------------------------
// Agentes: vínculo e quem cria quem
// ---------------------------------------------------------------------------

interface Vinculo {
  corretoraId: string | null
  unidadeId: string | null
  equipeId: string | null
}

interface VinculoResolvido extends Vinculo {
  corretora: VendasCorretoraRow | null
}

const PAPEIS_DO_GERENTE: readonly PapelComercial[] = ['supervisor', 'vendedor', 'balcao']

/**
 * Consistência do vínculo: `equipe_id` implica a corretora/unidade da equipe;
 * unidade de corretora implica a corretora; tudo precisa existir no escopo e
 * estar ativo. Campo `undefined` = não informado (deriva do pai).
 */
async function resolverVinculo(
  ctx: VendasCtx,
  pedido: { corretoraId?: string | null; unidadeId?: string | null; equipeId?: string | null },
): Promise<VinculoResolvido> {
  let corretoraId: string | null = pedido.corretoraId ?? null
  let unidadeId: string | null = pedido.unidadeId ?? null
  const equipeId = pedido.equipeId ?? null

  if (equipeId) {
    const equipe = await acharEquipe(ctx, equipeId)
    if (equipe.status === 'inativa') throw regra('A equipe informada está inativa')
    corretoraId = conciliar(corretoraId, equipe.corretoraId ?? null, 'corretora')
    unidadeId = conciliar(unidadeId, equipe.unidadeId ?? null, 'unidade')
  }
  if (unidadeId) {
    const unidade = await acharUnidade(ctx, unidadeId)
    if (unidade.status === 'inativa') throw regra('A unidade informada está inativa')
    if (unidade.corretoraId) corretoraId = conciliar(corretoraId, unidade.corretoraId, 'corretora')
    else if (corretoraId) throw regra('A unidade informada é própria do escopo e não pertence à corretora')
  }
  let corretora: VendasCorretoraRow | null = null
  if (corretoraId) {
    corretora = await acharCorretora(ctx, corretoraId)
    if (corretora.status === 'inativa') throw regra('A corretora informada está inativa')
  }
  return { corretoraId, unidadeId, equipeId, corretora }
}

function validarPapelNoVinculo(papel: PapelComercial, vinculo: Vinculo): void {
  if (papel === 'master' && (vinculo.corretoraId || vinculo.unidadeId || vinculo.equipeId)) {
    throw regra('O papel master não tem corretora, unidade nem equipe')
  }
  if (papel === 'gerente') {
    if (!vinculo.corretoraId) throw regra('O gerente precisa de uma corretora')
    if (vinculo.equipeId) throw regra('O gerente não pertence a uma equipe')
  }
  if (papel === 'balcao' && !vinculo.unidadeId) throw regra('O balcão precisa de uma unidade')
}

/** Quem pode cadastrar/mover o papel (antes de olhar o vínculo). */
function autorizarPapelDoAlvo(ctx: VendasCtx, papel: PapelComercial): void {
  if (ctx.papel === 'master') return
  if (ctx.papel === 'gerente' && PAPEIS_DO_GERENTE.includes(papel)) return
  if (ctx.papel === 'supervisor' && papel === 'vendedor') return
  throw semPermissao(
    ctx.papel === 'gerente'
      ? 'O gerente cadastra apenas supervisor, vendedor e balcão da sua corretora.'
      : ctx.papel === 'supervisor'
        ? 'O supervisor cadastra apenas vendedores das suas equipes.'
        : 'Seu papel na rede não permite esta operação.',
  )
}

/** Quem pode colocar alguém neste vínculo: gerente na sua corretora; supervisor nas suas equipes. */
function autorizarVinculoDoAlvo(ctx: VendasCtx, vinculo: Vinculo): void {
  if (ctx.papel === 'master') return
  if (ctx.papel === 'gerente') {
    if (ctx.agente?.corretoraId && vinculo.corretoraId === ctx.agente.corretoraId) return
    throw semPermissao('Você só gerencia agentes da sua corretora.')
  }
  if (ctx.papel === 'supervisor') {
    if (vinculo.equipeId && (ctx.visibilidade.equipeIds ?? []).includes(vinculo.equipeId)) return
    throw semPermissao('Você só gerencia vendedores das suas equipes.')
  }
  throw semPermissao()
}

/** O usuário pode administrar (editar vínculo, ativar, reenviar convite) este agente? */
function podeGerenciar(ctx: VendasCtx, alvo: VendasAgenteRow): boolean {
  if (ctx.papel === 'master') return true
  if (ctx.papel === 'gerente') {
    return Boolean(ctx.agente?.corretoraId) && alvo.corretoraId === ctx.agente?.corretoraId && PAPEIS_DO_GERENTE.includes(alvo.papel)
  }
  if (ctx.papel === 'supervisor') {
    return alvo.papel === 'vendedor' && Boolean(alvo.equipeId) && (ctx.visibilidade.equipeIds ?? []).includes(alvo.equipeId!)
  }
  return false
}

async function gerarCodigoLivre(): Promise<string> {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const codigo = gerarCodigoIndicacao()
    const [existente] = await db.select({ id: vendasAgentes.id }).from(vendasAgentes).where(eq(vendasAgentes.codigoIndicacao, codigo)).limit(1)
    if (!existente) return codigo
  }
  throw regra('Não foi possível gerar um código de indicação único: tente novamente')
}

async function presencaMinutosDoEscopo(ctx: VendasCtx): Promise<number> {
  return (await getOrCreateConfig(ctx.scope, ctx.tenantId)).presencaMinutos
}

async function apresentarAgente(ctx: VendasCtx, row: VendasAgenteRow, email: string | null, agora = new Date()): Promise<VendasAgente> {
  return toVendasAgente(row, { email, agora, presencaMinutos: await presencaMinutosDoEscopo(ctx) })
}

type CadastroAgente = Pick<CreateGerenteInput, 'nome' | 'email' | 'cpf' | 'telefone' | 'dataNascimento' | 'endereco' | 'repasse' | 'observacoes' | 'metaMensal'>

export interface AgenteCriado {
  agente: VendasAgente
  convite: ResultadoConvite & { contaNova: boolean }
}

/** Núcleo do cadastro: valida, cria a conta, grava o agente e convida. As checagens de quem pode vêm antes (nos chamadores). */
async function gravarAgente(
  ctx: VendasCtx,
  dados: CadastroAgente & { papel: PapelComercial; enviarConvite: boolean },
  vinculo: VinculoResolvido,
): Promise<AgenteCriado> {
  validarPapelNoVinculo(dados.papel, vinculo)
  if (dados.papel === 'gerente' && vinculo.corretora?.gerenteAgenteId) {
    throw jaExiste('Esta corretora já tem um gerente')
  }

  const codigoInicial = await gerarCodigoLivre()
  const conta = await provisionarUsuario({
    scope: ctx.scope,
    tenantId: ctx.tenantId,
    nome: dados.nome,
    email: dados.email,
    telefone: dados.telefone,
    codigoIndicacao: codigoInicial,
    criadoPorUserId: ctx.userId,
  })
  if (!conta.contaNova && (await existeAgente(ctx, eq(vendasAgentes.userId, conta.userId)))) {
    throw jaExiste('Este e-mail já pertence a um agente da rede')
  }

  let linha: VendasAgenteRow | undefined
  let codigo = codigoInicial
  for (let tentativa = 0; tentativa < 5 && !linha; tentativa++) {
    try {
      const [inserida] = await db
        .insert(vendasAgentes)
        .values({
          scope: ctx.scope,
          tenantId: ctx.tenantId,
          userId: conta.userId,
          papel: dados.papel,
          corretoraId: vinculo.corretoraId,
          unidadeId: vinculo.unidadeId,
          equipeId: vinculo.equipeId,
          codigoIndicacao: codigo,
          ativo: true,
          metaMensal: dados.metaMensal ?? null,
          nome: dados.nome,
          cpf: dados.cpf,
          telefone: dados.telefone,
          dataNascimento: dados.dataNascimento ?? null,
          endereco: dados.endereco ?? null,
          repasse: dados.repasse ?? null,
          observacoes: dados.observacoes ?? null,
          criadoPorUserId: ctx.userId,
        })
        .returning()
      linha = inserida
    } catch (error) {
      if (!violouUnicidade(error)) throw error
      // Código colidiu (corrida) → novo código; conta já ligada a um agente → 409.
      if (await existeAgente(ctx, eq(vendasAgentes.userId, conta.userId))) {
        throw jaExiste('Este e-mail já pertence a um agente da rede')
      }
      codigo = await gerarCodigoLivre()
    }
  }
  if (!linha) throw jaExiste('Não foi possível reservar o código de indicação: tente novamente')

  if (dados.papel === 'gerente' && vinculo.corretoraId) {
    await db
      .update(vendasCorretoras)
      .set({ gerenteAgenteId: linha.id, updatedAt: new Date() })
      .where(and(whereEscopo(vendasCorretoras, ctx), eq(vendasCorretoras.id, vinculo.corretoraId)))
  }

  const convite: ResultadoConvite = dados.enviarConvite
    ? await enviarConvite({
        scope: ctx.scope,
        tenantId: ctx.tenantId,
        userId: conta.userId,
        email: conta.email,
        nome: dados.nome,
        senhaProvisoria: conta.senhaProvisoria,
      })
    : { enviado: false, status: 'nao_enviado' }

  return { agente: await apresentarAgente(ctx, linha, conta.email), convite: { ...convite, contaNova: conta.contaNova } }
}

/** `POST /rede/agentes`. */
export async function criarAgente(ctx: VendasCtx, input: CreateAgenteInput): Promise<AgenteCriado> {
  autorizarPapelDoAlvo(ctx, input.papel)
  const vinculo = await resolverVinculo(ctx, input)
  autorizarVinculoDoAlvo(ctx, vinculo)
  return gravarAgente(ctx, input, vinculo)
}

/** `POST /rede/corretoras/:id/gerente` (master): cadastro completo do gerente, preso à corretora. */
export async function criarGerenteDaCorretora(ctx: VendasCtx, corretoraId: string, input: CreateGerenteInput): Promise<AgenteCriado> {
  const corretora = await acharCorretora(ctx, corretoraId)
  if (corretora.status === 'inativa') throw regra('A corretora informada está inativa')
  return gravarAgente(
    ctx,
    { ...input, papel: 'gerente' },
    { corretoraId, unidadeId: null, equipeId: null, corretora },
  )
}

// ---------------------------------------------------------------------------
// Agentes: leitura
// ---------------------------------------------------------------------------

export async function listarAgentes(
  ctx: VendasCtx,
  query: ListAgentesQuery,
  agora: Date = new Date(),
): Promise<{ items: VendasAgente[]; total: number }> {
  const presencaMinutos = await presencaMinutosDoEscopo(ctx)
  const rows = await db
    .select({ agente: vendasAgentes, email: user.email })
    .from(vendasAgentes)
    .leftJoin(user, eq(user.id, vendasAgentes.userId))
    .where(
      and(
        whereAgentesVisiveis(ctx),
        query.papel ? eq(vendasAgentes.papel, query.papel) : undefined,
        query.corretoraId ? eq(vendasAgentes.corretoraId, query.corretoraId) : undefined,
        query.unidadeId ? eq(vendasAgentes.unidadeId, query.unidadeId) : undefined,
        query.equipeId ? eq(vendasAgentes.equipeId, query.equipeId) : undefined,
        query.ativo !== undefined ? eq(vendasAgentes.ativo, query.ativo) : undefined,
      ),
    )
    .orderBy(asc(vendasAgentes.nome))
  const apresentados = rows
    .filter(row => combina(query.q ?? query.busca, row.agente.nome, row.email, row.agente.cpf, row.agente.telefone, row.agente.codigoIndicacao))
    .map(row => toVendasAgente(row.agente, { email: row.email ?? null, agora, presencaMinutos }))
    .filter(agente => query.online === undefined || agente.online === query.online)
  const { items, total } = paginar(apresentados, query.page, query.perPage)
  return { items, total }
}

/** Agente dentro do que o usuário enxerga (fora disso: 404). */
async function acharAgenteVisivel(ctx: VendasCtx, id: string): Promise<{ agente: VendasAgenteRow; email: string | null }> {
  const [row] = await db
    .select({ agente: vendasAgentes, email: user.email })
    .from(vendasAgentes)
    .leftJoin(user, eq(user.id, vendasAgentes.userId))
    .where(and(whereAgentesVisiveis(ctx), eq(vendasAgentes.id, id)))
    .limit(1)
  if (!row) throw AppError.notFound('Agente')
  return { agente: row.agente, email: row.email ?? null }
}

export async function obterAgente(ctx: VendasCtx, id: string): Promise<VendasAgente> {
  const { agente, email } = await acharAgenteVisivel(ctx, id)
  return apresentarAgente(ctx, agente, email)
}

// ---------------------------------------------------------------------------
// Agentes: alteração
// ---------------------------------------------------------------------------

export async function atualizarAgente(
  ctx: VendasCtx,
  id: string,
  input: UpdateAgenteInput,
): Promise<{ antes: VendasAgente; depois: VendasAgente }> {
  const { agente: alvo, email } = await acharAgenteVisivel(ctx, id)
  const proprio = ctx.agente?.id === alvo.id
  const antes = await apresentarAgente(ctx, alvo, email)

  const novoPapel = input.papel ?? alvo.papel
  const mudaPapel = novoPapel !== alvo.papel
  const mudaVinculo =
    (input.corretoraId !== undefined && input.corretoraId !== (alvo.corretoraId ?? null)) ||
    (input.unidadeId !== undefined && input.unidadeId !== (alvo.unidadeId ?? null)) ||
    (input.equipeId !== undefined && input.equipeId !== (alvo.equipeId ?? null))

  if (!podeGerenciar(ctx, alvo) && !(proprio && !mudaPapel && !mudaVinculo)) {
    throw semPermissao('Você não pode alterar este agente.')
  }
  // Edição do próprio cadastro (qualquer papel): só dados pessoais e repasse.
  // Meta é da gestão; papel/vínculo diferentes já foram barrados acima (403).
  if (!podeGerenciar(ctx, alvo) && input.metaMensal !== undefined && input.metaMensal !== (alvo.metaMensal ?? null)) {
    throw semPermissao('A meta é definida pela gestão da rede.')
  }

  let vinculo: VinculoResolvido | null = null
  if (mudaPapel || mudaVinculo) {
    autorizarPapelDoAlvo(ctx, novoPapel)
    // Campo não informado herda o atual, exceto quando o "pai" informado o determina.
    const equipeInformada = input.equipeId !== undefined && input.equipeId !== null
    const unidadeInformada = input.unidadeId !== undefined && input.unidadeId !== null
    vinculo = await resolverVinculo(ctx, {
      equipeId: input.equipeId !== undefined ? input.equipeId : (alvo.equipeId ?? null),
      unidadeId: input.unidadeId !== undefined ? input.unidadeId : equipeInformada ? undefined : (alvo.unidadeId ?? null),
      corretoraId:
        input.corretoraId !== undefined ? input.corretoraId : equipeInformada || unidadeInformada ? undefined : (alvo.corretoraId ?? null),
    })
    autorizarVinculoDoAlvo(ctx, vinculo)
    validarPapelNoVinculo(novoPapel, vinculo)

    if (alvo.papel === 'supervisor' && novoPapel !== 'supervisor') {
      const [supervisionada] = await db
        .select({ id: vendasEquipes.id })
        .from(vendasEquipes)
        .where(and(whereEscopo(vendasEquipes, ctx), eq(vendasEquipes.supervisorAgenteId, alvo.id)))
        .limit(1)
      if (supervisionada) throw regra('Este agente supervisiona equipes: troque o supervisor delas antes de mudar o papel')
    }
    if (novoPapel === 'gerente' && vinculo.corretora?.gerenteAgenteId && vinculo.corretora.gerenteAgenteId !== alvo.id) {
      throw jaExiste('Esta corretora já tem um gerente')
    }
  }

  const [linha] = await db
    .update(vendasAgentes)
    .set({
      ...semIndefinidos({
        nome: input.nome,
        cpf: input.cpf,
        telefone: input.telefone,
        dataNascimento: input.dataNascimento,
        endereco: input.endereco,
        repasse: input.repasse,
        observacoes: input.observacoes,
        metaMensal: input.metaMensal,
      }),
      ...(vinculo
        ? { papel: novoPapel, corretoraId: vinculo.corretoraId, unidadeId: vinculo.unidadeId, equipeId: vinculo.equipeId }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(whereEscopo(vendasAgentes, ctx), eq(vendasAgentes.id, id)))
    .returning()
  if (!linha) throw AppError.notFound('Agente')

  // Ponteiro de gerente da corretora acompanha o papel/corretora do agente.
  if (vinculo) {
    const eraGerenteDaCorretora = alvo.papel === 'gerente' ? alvo.corretoraId : null
    const ehGerenteDaCorretora = novoPapel === 'gerente' ? vinculo.corretoraId : null
    if (eraGerenteDaCorretora && eraGerenteDaCorretora !== ehGerenteDaCorretora) {
      await db
        .update(vendasCorretoras)
        .set({ gerenteAgenteId: null, updatedAt: new Date() })
        .where(and(whereEscopo(vendasCorretoras, ctx), eq(vendasCorretoras.id, eraGerenteDaCorretora), eq(vendasCorretoras.gerenteAgenteId, alvo.id)))
    }
    if (ehGerenteDaCorretora && ehGerenteDaCorretora !== eraGerenteDaCorretora) {
      await db
        .update(vendasCorretoras)
        .set({ gerenteAgenteId: alvo.id, updatedAt: new Date() })
        .where(and(whereEscopo(vendasCorretoras, ctx), eq(vendasCorretoras.id, ehGerenteDaCorretora)))
    }
  }

  return { antes, depois: await apresentarAgente(ctx, linha, email) }
}

/** `POST /rede/agentes/:id/ativar|desativar`: só o `ativo` do agente (o login da conta não é tocado). */
export async function definirAtivo(ctx: VendasCtx, id: string, ativo: boolean): Promise<VendasAgente> {
  const { agente: alvo, email } = await acharAgenteVisivel(ctx, id)
  if (ctx.agente?.id === alvo.id) throw regra('Você não pode alterar o próprio status')
  if (!podeGerenciar(ctx, alvo)) throw semPermissao('Você não pode alterar este agente.')
  if (alvo.ativo === ativo) return apresentarAgente(ctx, alvo, email)
  const [linha] = await db
    .update(vendasAgentes)
    .set({ ativo, updatedAt: new Date() })
    .where(and(whereEscopo(vendasAgentes, ctx), eq(vendasAgentes.id, id)))
    .returning()
  return apresentarAgente(ctx, linha ?? { ...alvo, ativo }, email)
}

/** `POST /rede/agentes/:id/reenviar-convite`. */
export async function reenviarConviteDoAgente(ctx: VendasCtx, id: string): Promise<ResultadoConvite> {
  const { agente: alvo } = await acharAgenteVisivel(ctx, id)
  if (!podeGerenciar(ctx, alvo)) throw semPermissao('Você não pode reenviar o convite deste agente.')
  return reenviarConvite({ scope: ctx.scope, tenantId: ctx.tenantId, userId: alvo.userId, actorUserId: ctx.userId })
}

// ---------------------------------------------------------------------------
// Desempenho
// ---------------------------------------------------------------------------

export interface DesempenhoAgente {
  agenteId: string
  periodo: DesempenhoAgenteQuery['periodo']
  desde: string
  ate: string
  kpis: {
    leadsRecebidos: number
    contatos: number
    propostas: number
    ganhos: number
    /** % de leads recebidos no período que viraram ganho (0 a 100, 1 casa). */
    taxaConversao: number
    valorGanho: number
    comissaoPrevista: number
    comissaoAPagar: number
    comissaoPaga: number
  }
}

/** Início do período: 30 dias, 1º dia do mês (America/Sao_Paulo, UTC-3 sem horário de verão) ou 90 dias. */
function inicioDoPeriodo(periodo: DesempenhoAgenteQuery['periodo'], agora: Date): Date {
  if (periodo === 'mes') return new Date(`${mesReferenciaSaoPaulo(agora)}-01T03:00:00.000Z`)
  return new Date(agora.getTime() - (periodo === 'trimestre' ? 90 : 30) * 86_400_000)
}

const centavos = (valor: number) => Math.round(valor * 100) / 100

/** `GET /rede/agentes/:id/desempenho`: KPIs simples de um agente visível. */
export async function desempenhoDoAgente(
  ctx: VendasCtx,
  id: string,
  query: DesempenhoAgenteQuery,
  agora: Date = new Date(),
): Promise<DesempenhoAgente> {
  const { agente } = await acharAgenteVisivel(ctx, id)
  const desde = inicioDoPeriodo(query.periodo, agora)

  const [leads, eventos, comissoes] = await Promise.all([
    db
      .select({
        etapa: vendasLeads.etapa,
        createdAt: vendasLeads.createdAt,
        reivindicadoEm: vendasLeads.reivindicadoEm,
        ganhoEm: vendasLeads.ganhoEm,
        valorEstimado: vendasLeads.valorEstimado,
        conversao: vendasLeads.conversao,
      })
      .from(vendasLeads)
      .where(and(whereEscopo(vendasLeads, ctx), eq(vendasLeads.agenteId, agente.id))),
    db
      .select({ id: vendasLeadEventos.id })
      .from(vendasLeadEventos)
      .where(
        and(
          eq(vendasLeadEventos.porAgenteId, agente.id),
          inArray(vendasLeadEventos.tipo, [...EVENTOS_DE_CONTATO]),
          gte(vendasLeadEventos.em, desde),
        ),
      ),
    db
      .select({ status: vendasComissoes.status, valor: vendasComissoes.valor, createdAt: vendasComissoes.createdAt })
      .from(vendasComissoes)
      .where(and(whereEscopo(vendasComissoes, ctx), eq(vendasComissoes.beneficiarioAgenteId, agente.id))),
  ])

  const recebidos = leads.filter(lead => (lead.reivindicadoEm ?? lead.createdAt).getTime() >= desde.getTime())
  const propostas = recebidos.filter(
    lead => lead.conversao !== null || lead.etapa === 'proposta' || lead.etapa === 'negociacao' || lead.etapa === 'ganho',
  ).length
  const ganhosDoPeriodo = leads.filter(lead => lead.etapa === 'ganho' && lead.ganhoEm !== null && lead.ganhoEm.getTime() >= desde.getTime())
  const soma = (status: string) =>
    centavos(
      comissoes
        .filter(linha => linha.status === status && linha.createdAt.getTime() >= desde.getTime())
        .reduce((total, linha) => total + Number(linha.valor), 0),
    )

  return {
    agenteId: agente.id,
    periodo: query.periodo,
    desde: desde.toISOString(),
    ate: agora.toISOString(),
    kpis: {
      leadsRecebidos: recebidos.length,
      contatos: eventos.length,
      propostas,
      ganhos: ganhosDoPeriodo.length,
      taxaConversao: recebidos.length === 0 ? 0 : Math.round((ganhosDoPeriodo.length / recebidos.length) * 1000) / 10,
      valorGanho: centavos(ganhosDoPeriodo.reduce((total, lead) => total + Number(lead.valorEstimado ?? 0), 0)),
      comissaoPrevista: soma('prevista'),
      comissaoAPagar: soma('a_pagar'),
      comissaoPaga: soma('paga'),
    },
  }
}

// ---------------------------------------------------------------------------
// Árvore
// ---------------------------------------------------------------------------

/**
 * `GET /rede/arvore`: corretoras → unidades → equipes → agentes, mais
 * `unidadesProprias` (sem corretora) e `solos` (sem equipe, unidade nem corretora).
 * Filtrada pela visibilidade: master vê tudo; gerente a sua corretora; supervisor,
 * vendedor e balcão só os ramos onde há alguém que eles enxergam.
 */
export async function montarArvore(ctx: VendasCtx, agora: Date = new Date()): Promise<VendasArvoreRede> {
  const presencaMinutos = await presencaMinutosDoEscopo(ctx)
  const [todasCorretoras, todasUnidades, todasEquipes, agentes] = await Promise.all([
    db.select().from(vendasCorretoras).where(whereEscopo(vendasCorretoras, ctx)).orderBy(asc(vendasCorretoras.nomeFantasia)),
    db.select().from(vendasUnidades).where(whereEscopo(vendasUnidades, ctx)).orderBy(asc(vendasUnidades.nome)),
    db.select().from(vendasEquipes).where(whereEscopo(vendasEquipes, ctx)).orderBy(asc(vendasEquipes.nome)),
    db.select().from(vendasAgentes).where(whereAgentesVisiveis(ctx)).orderBy(asc(vendasAgentes.nome)),
  ])

  const todos = ctx.visibilidade.todos
  const daMinhaCorretora = (corretoraId: string | null): boolean =>
    ctx.papel === 'gerente' && Boolean(ctx.visibilidade.corretoraId) && corretoraId === ctx.visibilidade.corretoraId
  const equipesDoSupervisor = new Set(ctx.visibilidade.equipeIds ?? [])

  const equipes = todasEquipes.filter(
    e => todos || daMinhaCorretora(e.corretoraId ?? null) || equipesDoSupervisor.has(e.id) || agentes.some(a => a.equipeId === e.id),
  )
  const unidades = todasUnidades.filter(
    u =>
      todos ||
      daMinhaCorretora(u.corretoraId ?? null) ||
      equipes.some(e => e.unidadeId === u.id) ||
      agentes.some(a => a.unidadeId === u.id),
  )
  const corretoras = todasCorretoras.filter(
    c =>
      todos ||
      daMinhaCorretora(c.id) ||
      unidades.some(u => u.corretoraId === c.id) ||
      equipes.some(e => e.corretoraId === c.id) ||
      agentes.some(a => a.corretoraId === c.id),
  )

  const porId = new Map(agentes.map(a => [a.id, a]))
  const colocados = new Set<string>()
  const no = (a: VendasAgenteRow) => toArvoreAgente(a, { agora, presencaMinutos })
  const colocar = (lista: VendasAgenteRow[]) => {
    for (const a of lista) colocados.add(a.id)
    return lista.map(no)
  }

  // Equipes primeiro: o supervisor aparece dentro da equipe que supervisiona.
  const nosEquipe = new Map<string, VendasArvoreEquipe>()
  for (const equipe of equipes) {
    const membros = agentes.filter(a => a.equipeId === equipe.id && !colocados.has(a.id))
    const supervisor = equipe.supervisorAgenteId ? porId.get(equipe.supervisorAgenteId) : undefined
    const lista = supervisor && !colocados.has(supervisor.id) && !membros.some(m => m.id === supervisor.id) ? [supervisor, ...membros] : membros
    nosEquipe.set(equipe.id, { ...toVendasEquipe(equipe), agentes: colocar(lista) })
  }

  const nosUnidade = new Map<string, VendasArvoreUnidade>()
  for (const unidade of unidades) {
    nosUnidade.set(unidade.id, {
      ...toVendasUnidade(unidade),
      equipes: equipes.filter(e => e.unidadeId === unidade.id).map(e => nosEquipe.get(e.id)!),
      agentes: colocar(agentes.filter(a => a.unidadeId === unidade.id && !colocados.has(a.id))),
    })
  }

  const nosCorretora: VendasArvoreCorretora[] = corretoras.map(corretora => {
    const gerente = corretora.gerenteAgenteId ? porId.get(corretora.gerenteAgenteId) : undefined
    const gerenteNo = gerente && !colocados.has(gerente.id) ? colocar([gerente])[0]! : null
    return {
      ...toVendasCorretora(corretora),
      gerente: gerenteNo,
      unidades: unidades.filter(u => u.corretoraId === corretora.id).map(u => nosUnidade.get(u.id)!),
      equipes: equipes.filter(e => e.corretoraId === corretora.id && !e.unidadeId).map(e => nosEquipe.get(e.id)!),
      agentes: colocar(agentes.filter(a => a.corretoraId === corretora.id && !colocados.has(a.id))),
    }
  })

  return {
    corretoras: nosCorretora,
    unidadesProprias: unidades.filter(u => !u.corretoraId).map(u => nosUnidade.get(u.id)!),
    solos: colocar(agentes.filter(a => !a.corretoraId && !a.unidadeId && !a.equipeId && !colocados.has(a.id))),
  }
}
