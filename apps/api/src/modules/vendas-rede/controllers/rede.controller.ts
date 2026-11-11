import {
  createAgenteInput,
  createCorretoraInput,
  createEquipeInput,
  createGerenteInput,
  createUnidadeInput,
  desempenhoAgenteQuery,
  listAgentesQuery,
  listCorretorasQuery,
  listEquipesQuery,
  listUnidadesQuery,
  updateAgenteInput,
  updateCorretoraInput,
  updateEquipeInput,
  updateUnidadeInput,
  vendasIdParam,
} from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { created, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { requireEscrita, requirePapel, vendasOf } from '../context'
import { listarOnline, registrarPresenca } from '../presenca.service'
import {
  atualizarAgente,
  atualizarCorretora,
  atualizarEquipe,
  atualizarUnidade,
  criarAgente,
  criarCorretora,
  criarEquipe,
  criarGerenteDaCorretora,
  criarUnidade,
  definirAtivo,
  desempenhoDoAgente,
  listarAgentes,
  listarCorretoras,
  listarEquipes,
  listarUnidades,
  montarArvore,
  obterAgente,
  obterCorretora,
  obterEu,
  reenviarConviteDoAgente,
  removerCorretora,
  removerEquipe,
  removerUnidade,
} from '../rede.service'

/**
 * Rede (`docs/rede-comercial.md` 4.2): perfil, presença, árvore, corretoras,
 * unidades, equipes e agentes. O papel mínimo está em `requirePapel`; as regras
 * finas (gerente só na sua corretora, supervisor só nas suas equipes) ficam no
 * serviço, que também prende tudo ao escopo (id de outro inquilino = 404).
 * Toda escrita grava auditoria; senha provisória nunca entra nela.
 */

type Ctx = Context<AppEnv>

function auditar(c: Ctx, action: string, resource: string, resourceId: string | null, metadata: Record<string, unknown> = {}) {
  const ctx = vendasOf(c)
  return recordAudit(c, {
    action,
    resource,
    resourceId,
    organizationId: ctx.tenantId,
    metadata: { scope: ctx.scope, papel: ctx.papel, ...metadata },
  })
}

const MASTER_GERENTE = ['master', 'gerente'] as const
const GESTORES = ['master', 'gerente', 'supervisor'] as const

export const redeController = new Hono<AppEnv>()
  .get('/eu', async c => ok(c, await obterEu(vendasOf(c))))

  .post('/presenca', requireEscrita, async c => ok(c, await registrarPresenca(vendasOf(c))))

  .get('/presenca/online', async c => ok(c, await listarOnline(vendasOf(c))))

  // --- Árvore --------------------------------------------------------------
  .get('/rede/arvore', async c => ok(c, await montarArvore(vendasOf(c))))

  // --- Corretoras (master) -------------------------------------------------
  .get('/rede/corretoras', requirePapel('master'), query(listCorretorasQuery), async c => {
    const { page, perPage } = c.req.valid('query')
    const { items, total } = await listarCorretoras(vendasOf(c), c.req.valid('query'))
    const pagina = paginate(items, page, perPage, total)
    return ok(c, pagina.items, pagina.meta)
  })

  .post('/rede/corretoras', requirePapel('master'), requireEscrita, json(createCorretoraInput), async c => {
    const corretora = await criarCorretora(vendasOf(c), c.req.valid('json'))
    await auditar(c, 'vendas.corretora_created', 'vendas_corretora', corretora.id, { cnpj: corretora.cnpj, nome: corretora.nomeFantasia })
    return created(c, corretora)
  })

  .get('/rede/corretoras/:id', requirePapel('master'), param(vendasIdParam), async c =>
    ok(c, await obterCorretora(vendasOf(c), c.req.valid('param').id)),
  )

  .patch('/rede/corretoras/:id', requirePapel('master'), requireEscrita, param(vendasIdParam), json(updateCorretoraInput), async c => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const { depois } = await atualizarCorretora(vendasOf(c), id, body)
    await auditar(c, 'vendas.corretora_updated', 'vendas_corretora', id, { campos: Object.keys(body) })
    return ok(c, depois)
  })

  .delete('/rede/corretoras/:id', requirePapel('master'), requireEscrita, param(vendasIdParam), async c => {
    const { id } = c.req.valid('param')
    const resultado = await removerCorretora(vendasOf(c), id)
    await auditar(c, resultado.resultado === 'removida' ? 'vendas.corretora_removed' : 'vendas.corretora_deactivated', 'vendas_corretora', id, {
      nome: resultado.corretora.nomeFantasia,
    })
    return ok(c, resultado)
  })

  .post('/rede/corretoras/:id/gerente', requirePapel('master'), requireEscrita, param(vendasIdParam), json(createGerenteInput), async c => {
    const { id } = c.req.valid('param')
    const { agente, convite } = await criarGerenteDaCorretora(vendasOf(c), id, c.req.valid('json'))
    await auditar(c, 'vendas.gerente_created', 'vendas_agente', agente.id, {
      corretoraId: id,
      email: agente.email,
      contaNova: convite.contaNova,
      convite: convite.status,
    })
    return created(c, { agente, convite })
  })

  // --- Unidades ------------------------------------------------------------
  .get('/rede/unidades', query(listUnidadesQuery), async c => {
    const { page, perPage } = c.req.valid('query')
    const { items, total } = await listarUnidades(vendasOf(c), c.req.valid('query'))
    const pagina = paginate(items, page, perPage, total)
    return ok(c, pagina.items, pagina.meta)
  })

  .post('/rede/unidades', requirePapel(...MASTER_GERENTE), requireEscrita, json(createUnidadeInput), async c => {
    const unidade = await criarUnidade(vendasOf(c), c.req.valid('json'))
    await auditar(c, 'vendas.unidade_created', 'vendas_unidade', unidade.id, { corretoraId: unidade.corretoraId, nome: unidade.nome })
    return created(c, unidade)
  })

  .patch('/rede/unidades/:id', requirePapel(...MASTER_GERENTE), requireEscrita, param(vendasIdParam), json(updateUnidadeInput), async c => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const { depois } = await atualizarUnidade(vendasOf(c), id, body)
    await auditar(c, 'vendas.unidade_updated', 'vendas_unidade', id, { campos: Object.keys(body) })
    return ok(c, depois)
  })

  .delete('/rede/unidades/:id', requirePapel(...MASTER_GERENTE), requireEscrita, param(vendasIdParam), async c => {
    const { id } = c.req.valid('param')
    const resultado = await removerUnidade(vendasOf(c), id)
    await auditar(c, resultado.resultado === 'removida' ? 'vendas.unidade_removed' : 'vendas.unidade_deactivated', 'vendas_unidade', id, {
      nome: resultado.unidade.nome,
    })
    return ok(c, resultado)
  })

  // --- Equipes -------------------------------------------------------------
  .get('/rede/equipes', query(listEquipesQuery), async c => {
    const { page, perPage } = c.req.valid('query')
    const { items, total } = await listarEquipes(vendasOf(c), c.req.valid('query'))
    const pagina = paginate(items, page, perPage, total)
    return ok(c, pagina.items, pagina.meta)
  })

  .post('/rede/equipes', requirePapel(...MASTER_GERENTE), requireEscrita, json(createEquipeInput), async c => {
    const equipe = await criarEquipe(vendasOf(c), c.req.valid('json'))
    await auditar(c, 'vendas.equipe_created', 'vendas_equipe', equipe.id, {
      corretoraId: equipe.corretoraId,
      unidadeId: equipe.unidadeId,
      supervisorAgenteId: equipe.supervisorAgenteId,
      nome: equipe.nome,
    })
    return created(c, equipe)
  })

  .patch('/rede/equipes/:id', requirePapel(...MASTER_GERENTE), requireEscrita, param(vendasIdParam), json(updateEquipeInput), async c => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const { depois } = await atualizarEquipe(vendasOf(c), id, body)
    await auditar(c, 'vendas.equipe_updated', 'vendas_equipe', id, { campos: Object.keys(body) })
    return ok(c, depois)
  })

  .delete('/rede/equipes/:id', requirePapel(...MASTER_GERENTE), requireEscrita, param(vendasIdParam), async c => {
    const { id } = c.req.valid('param')
    const resultado = await removerEquipe(vendasOf(c), id)
    await auditar(c, resultado.resultado === 'removida' ? 'vendas.equipe_removed' : 'vendas.equipe_deactivated', 'vendas_equipe', id, {
      nome: resultado.equipe.nome,
    })
    return ok(c, resultado)
  })

  // --- Agentes -------------------------------------------------------------
  .get('/rede/agentes', query(listAgentesQuery), async c => {
    const { page, perPage } = c.req.valid('query')
    const { items, total } = await listarAgentes(vendasOf(c), c.req.valid('query'))
    const pagina = paginate(items, page, perPage, total)
    return ok(c, pagina.items, pagina.meta)
  })

  .post('/rede/agentes', requirePapel(...GESTORES), requireEscrita, json(createAgenteInput), async c => {
    const { agente, convite } = await criarAgente(vendasOf(c), c.req.valid('json'))
    await auditar(c, 'vendas.agente_created', 'vendas_agente', agente.id, {
      papelAgente: agente.papel,
      corretoraId: agente.corretoraId,
      unidadeId: agente.unidadeId,
      equipeId: agente.equipeId,
      email: agente.email,
      contaNova: convite.contaNova,
      convite: convite.status,
    })
    return created(c, { agente, convite })
  })

  .get('/rede/agentes/:id', param(vendasIdParam), async c => ok(c, await obterAgente(vendasOf(c), c.req.valid('param').id)))

  // Qualquer agente edita o próprio cadastro (nome, contato, repasse...); papel, vínculo e meta só a gestão
  // (o serviço responde 403 VENDAS_SEM_PERMISSAO_NA_REDE para campos proibidos ou outro agente).
  .patch('/rede/agentes/:id', requireEscrita, param(vendasIdParam), json(updateAgenteInput), async c => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const { antes, depois } = await atualizarAgente(vendasOf(c), id, body)
    await auditar(c, 'vendas.agente_updated', 'vendas_agente', id, {
      campos: Object.keys(body),
      papelAntes: antes.papel,
      papelDepois: depois.papel,
      vinculoAntes: { corretoraId: antes.corretoraId, unidadeId: antes.unidadeId, equipeId: antes.equipeId },
      vinculoDepois: { corretoraId: depois.corretoraId, unidadeId: depois.unidadeId, equipeId: depois.equipeId },
    })
    return ok(c, depois)
  })

  .post('/rede/agentes/:id/ativar', requirePapel(...GESTORES), requireEscrita, param(vendasIdParam), async c => {
    const { id } = c.req.valid('param')
    const agente = await definirAtivo(vendasOf(c), id, true)
    await auditar(c, 'vendas.agente_activated', 'vendas_agente', id)
    return ok(c, agente)
  })

  .post('/rede/agentes/:id/desativar', requirePapel(...GESTORES), requireEscrita, param(vendasIdParam), async c => {
    const { id } = c.req.valid('param')
    const agente = await definirAtivo(vendasOf(c), id, false)
    await auditar(c, 'vendas.agente_deactivated', 'vendas_agente', id)
    return ok(c, agente)
  })

  .post('/rede/agentes/:id/reenviar-convite', requirePapel(...GESTORES), requireEscrita, param(vendasIdParam), async c => {
    const { id } = c.req.valid('param')
    const convite = await reenviarConviteDoAgente(vendasOf(c), id)
    await auditar(c, 'vendas.agente_invite_resent', 'vendas_agente', id, { convite: convite.status })
    return ok(c, convite)
  })

  .get('/rede/agentes/:id/desempenho', param(vendasIdParam), query(desempenhoAgenteQuery), async c =>
    ok(c, await desempenhoDoAgente(vendasOf(c), c.req.valid('param').id, c.req.valid('query'))),
  )
