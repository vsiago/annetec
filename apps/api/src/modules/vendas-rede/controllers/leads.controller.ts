import {
  assinarLeadInput,
  carteiraQuery,
  createEventoLeadInput,
  createVendasLeadInput,
  discountRequestInput,
  linkAdesaoInput,
  listLeadsQuery,
  mensagemLeadQuery,
  mudarEtapaLeadInput,
  proximoPassoInput,
  propostaLeadInput,
  quadroLeadsQuery,
  reatribuirLeadInput,
  updateVendasLeadInput,
  vendasIdParam,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { AppError } from '@/http/errors'
import { tenantOf } from '@/http/middleware/tenant'
import { created, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { rateLimit, requestIp } from '@/lib/rate-limit'
import { salesNotificationsController } from '@/modules/notifications/controller'
import { requireEscrita, requirePapel, vendasOf, type VendasCtx } from '../context'
import { assinar, criarProposta, linkAdesao, obterProposta, pedirDesconto } from '../conversao.service'
import {
  atualizar,
  carteira,
  contarPorEstacao,
  criar,
  listar,
  mensagem,
  mudarEtapa,
  obter,
  proximoPasso,
  quadro,
  reatribuir,
  registrarEvento,
  reivindicar,
} from '../leads.service'

/**
 * Leads da Rede Comercial — `/vendas/*` (platform) e `/t/:slug/vendas/*` (tenant), o mesmo conjunto.
 * O `salesContext` do escopo já autenticou. Funil, Disponíveis (pool), carteira e reivindicação não existem para o
 * balcão; agente inativo só lê (o `salesContext` barra qualquer método de escrita).
 * `recordAudit` nas escritas relevantes.
 */

const FUNIL = requirePapel('master', 'gerente', 'supervisor', 'vendedor')
const MINUTO = 60_000

function escopoDaAuditoria(ctx: VendasCtx) {
  return { organizationId: ctx.tenantId }
}

export const leadsController = new Hono<AppEnv>()
  // Sino do agente (sales): GET /notificacoes, /notificacoes/stream, POST /notificacoes/lidas.
  .route('/notificacoes', salesNotificationsController)

  .get('/leads', FUNIL, query(listLeadsQuery), async c => {
    const q = c.req.valid('query')
    const { items, total } = await listar(vendasOf(c), q)
    const page = paginate(items, q.page, q.perPage, total)
    return ok(c, page.items, page.meta)
  })

  /** Contadores das abas (Disponíveis/novos/andamento/fechados). */
  .get('/leads/contadores', FUNIL, async c => ok(c, await contarPorEstacao(vendasOf(c))))

  /** Funil em quadro: colunas por etapa, Disponíveis e fechados do mês numa chamada (antes de `/leads/:id`). */
  .get('/leads/quadro', FUNIL, query(quadroLeadsQuery), async c => ok(c, await quadro(vendasOf(c), c.req.valid('query'))))

  /** Disponíveis (pool): leads sem responsável. */
  .get('/leads/pool', FUNIL, query(listLeadsQuery), async c => {
    const q = c.req.valid('query')
    const { items, total } = await listar(vendasOf(c), { ...q, estacao: 'pool' })
    const page = paginate(items, q.page, q.perPage, total)
    return ok(c, page.items, page.meta)
  })

  .get('/carteira', FUNIL, query(carteiraQuery), async c => {
    const q = c.req.valid('query')
    const resultado = await carteira(vendasOf(c), q)
    const page = paginate(resultado.items, q.page, q.perPage, resultado.total)
    return ok(c, { items: page.items, totais: resultado.totais }, page.meta)
  })

  .post('/leads', json(createVendasLeadInput), async c => {
    const ctx = vendasOf(c)
    const lead = await criar(ctx, c.req.valid('json'))
    await recordAudit(c, {
      action: 'vendas_lead.created',
      resource: 'vendas_lead',
      resourceId: lead.id,
      ...escopoDaAuditoria(ctx),
      metadata: { origem: lead.origem, agenteId: lead.agenteId },
    })
    return created(c, lead)
  })

  .get('/leads/:id', param(vendasIdParam), async c => ok(c, await obter(vendasOf(c), c.req.valid('param').id)))

  .patch('/leads/:id', param(vendasIdParam), json(updateVendasLeadInput), async c => {
    const ctx = vendasOf(c)
    const input = c.req.valid('json')
    const lead = await atualizar(ctx, c.req.valid('param').id, input)
    await recordAudit(c, {
      action: 'vendas_lead.updated',
      resource: 'vendas_lead',
      resourceId: lead.id,
      ...escopoDaAuditoria(ctx),
      metadata: { campos: Object.keys(input) },
    })
    return ok(c, lead)
  })

  .post('/leads/:id/reivindicar', FUNIL, param(vendasIdParam), async c => {
    const ctx = vendasOf(c)
    const lead = await reivindicar(ctx, c.req.valid('param').id)
    await recordAudit(c, {
      action: 'vendas_lead.claimed',
      resource: 'vendas_lead',
      resourceId: lead.id,
      ...escopoDaAuditoria(ctx),
      metadata: { agenteId: lead.agenteId },
    })
    return ok(c, lead)
  })

  .post('/leads/:id/etapa', param(vendasIdParam), json(mudarEtapaLeadInput), async c => {
    const ctx = vendasOf(c)
    const input = c.req.valid('json')
    const lead = await mudarEtapa(ctx, c.req.valid('param').id, input)
    await recordAudit(c, {
      action: 'vendas_lead.stage_changed',
      resource: 'vendas_lead',
      resourceId: lead.id,
      ...escopoDaAuditoria(ctx),
      metadata: { para: lead.etapa, motivoPerda: input.motivoPerda ?? null, confirmado: input.confirmar === true },
    })
    return ok(c, lead)
  })

  .post('/leads/:id/eventos', param(vendasIdParam), json(createEventoLeadInput), async c => {
    const ctx = vendasOf(c)
    const input = c.req.valid('json')
    const evento = await registrarEvento(ctx, c.req.valid('param').id, input)
    await recordAudit(c, {
      action: 'vendas_lead.event_added',
      resource: 'vendas_lead',
      resourceId: evento.leadId,
      ...escopoDaAuditoria(ctx),
      metadata: { tipo: input.tipo },
    })
    return created(c, evento)
  })

  .post('/leads/:id/proximo-passo', param(vendasIdParam), json(proximoPassoInput), async c =>
    ok(c, await proximoPasso(vendasOf(c), c.req.valid('param').id, c.req.valid('json'))),
  )

  .post('/leads/:id/reatribuir', param(vendasIdParam), json(reatribuirLeadInput), async c => {
    const ctx = vendasOf(c)
    const { agenteId } = c.req.valid('json')
    const lead = await reatribuir(ctx, c.req.valid('param').id, agenteId)
    await recordAudit(c, {
      action: agenteId ? 'vendas_lead.reassigned' : 'vendas_lead.returned_to_pool',
      resource: 'vendas_lead',
      resourceId: lead.id,
      ...escopoDaAuditoria(ctx),
      metadata: { agenteId: lead.agenteId },
    })
    return ok(c, lead)
  })

  .get('/leads/:id/mensagem', param(vendasIdParam), query(mensagemLeadQuery), async c =>
    ok(c, await mensagem(vendasOf(c), c.req.valid('param').id, c.req.valid('query').modelo)),
  )

  // -------------------------------------------------------------------------
  // Conversão — platform: proposta/desconto
  // -------------------------------------------------------------------------

  .post(
    '/leads/:id/proposta',
    rateLimit({ key: 'vendas:lead-proposta', limit: 20, windowMs: 15 * MINUTO }),
    param(vendasIdParam),
    json(propostaLeadInput),
    async c => {
      const ctx = vendasOf(c)
      const input = c.req.valid('json')
      const resultado = await criarProposta(ctx, c.req.valid('param').id, input)
      await recordAudit(c, {
        action: 'vendas_lead.proposal_created',
        resource: 'onboarding_proposal',
        resourceId: resultado.proposal.id,
        organizationId: null,
        metadata: { leadId: c.req.valid('param').id, protocolo: resultado.proposal.code, planoId: input.planoId, emailEnviado: resultado.emailSent },
      })
      return created(c, resultado)
    },
  )

  .get('/leads/:id/proposta', param(vendasIdParam), async c => ok(c, await obterProposta(vendasOf(c), c.req.valid('param').id)))

  .post('/leads/:id/desconto', param(vendasIdParam), json(discountRequestInput), async c => {
    const ctx = vendasOf(c)
    const resultado = await pedirDesconto(ctx, c.req.valid('param').id, c.req.valid('json'))
    await recordAudit(c, {
      action: 'vendas_lead.discount_requested',
      resource: 'sales_discount_request',
      resourceId: resultado.discountRequest?.id ?? null,
      organizationId: null,
      metadata: { leadId: c.req.valid('param').id, proposalId: resultado.proposal.id },
    })
    return created(c, resultado)
  })

  // -------------------------------------------------------------------------
  // Conversão — tenant: adesão/assinatura
  // -------------------------------------------------------------------------

  .post('/leads/:id/link-adesao', param(vendasIdParam), json(linkAdesaoInput), async c => {
    const ctx = vendasOf(c)
    const resultado = await linkAdesao(ctx, c.req.valid('param').id, c.req.valid('json').planoId)
    await recordAudit(c, {
      action: 'vendas_lead.membership_link_created',
      resource: 'vendas_lead',
      resourceId: c.req.valid('param').id,
      ...escopoDaAuditoria(ctx),
      metadata: { planoId: resultado.planoId },
    })
    return created(c, resultado)
  })

  .post(
    '/leads/:id/assinar',
    rateLimit({ key: 'vendas:lead-assinar', limit: 20, windowMs: 15 * MINUTO }),
    requireEscrita,
    param(vendasIdParam),
    json(assinarLeadInput),
    async c => {
      const ctx = vendasOf(c)
      if (ctx.scope !== 'tenant') throw AppError.notFound('Rota')
      const input = c.req.valid('json')
      const resultado = await assinar(ctx, tenantOf(c), c.req.valid('param').id, input, requestIp(c) ?? undefined)
      await recordAudit(c, {
        action: 'vendas_lead.subscription_created',
        resource: 'club_subscription',
        resourceId: resultado.subscriptionId,
        ...escopoDaAuditoria(ctx),
        metadata: { leadId: c.req.valid('param').id, planoId: input.planoId, metodo: input.metodoPagamento, status: resultado.status },
      })
      return created(c, resultado)
    },
  )
