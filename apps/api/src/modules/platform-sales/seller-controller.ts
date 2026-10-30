import {
  createProspectInput,
  createProspectInteractionInput,
  createSellerLinkInput,
  discountRequestInput,
  listDiscountRequestsQuery,
  listProspectsQuery,
  listSalesCommissionsQuery,
  listSellerProposalsQuery,
  updateProspectInput,
} from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { AppError } from '@/http/errors'
import { requireAuth, requirePlatformSeller } from '@/http/middleware/auth'
import { created, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { rateLimit } from '@/lib/rate-limit'
import { sellerNotificationsController } from '@/modules/notifications/controller'
import { listPlanOffers } from '@/modules/platform-billing/pricing.service'
import { listCommissions } from './commissions.service'
import { sellerDashboard } from './dashboard.service'
import { listDiscountRequests } from './discounts.service'
import { createSellerLink, getSellerProposal, listSellerProposals, requestDiscountForProposal, sendSellerLink } from './links.service'
import { addInteraction, createProspect, getProspectDetail, listProspects, updateProspect, type Viewer } from './prospects.service'
import { requireSellerProfile } from './sellers.service'

/**
 * Área do VENDEDOR ANNETEC — `/api/v1/platform/vendas` (`platform_seller`).
 *
 * ISOLAMENTO: o vendedor é SEMPRE o da sessão — nenhuma rota aceita
 * `sellerUserId` de fora; prospect/proposta de outro vendedor responde 404.
 * Perfil inativo só consulta (escritas → 403). Auditoria em toda escrita.
 */

const MINUTE = 60_000
const idParam = z.object({ id: z.string().uuid() })

function me(c: Context<AppEnv>): { userId: string; name: string } {
  const session = c.get('auth')
  if (!session) throw AppError.unauthenticated()
  return { userId: session.user.id, name: session.user.name }
}

function viewerOf(c: Context<AppEnv>): Viewer {
  return { kind: 'seller', userId: me(c).userId }
}

/** Perfil do vendedor para ESCRITA (inativo → 403). */
async function writer(c: Context<AppEnv>) {
  return requireSellerProfile(me(c).userId, { forWrite: true })
}

export const platformSellerController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformSeller)

  .get('/perfil', async c => ok(c, await requireSellerProfile(me(c).userId)))

  .get('/painel', async c => {
    await requireSellerProfile(me(c).userId)
    return ok(c, await sellerDashboard(me(c).userId))
  })

  /** Todos os planos ANNETEC, inclusive os fora da vitrine pública (só o vendedor oferece). */
  .get('/planos', async c => ok(c, await listPlanOffers()))

  // -------------------------------------------------------------------------
  // Funil
  // -------------------------------------------------------------------------

  .get('/prospects', query(listProspectsQuery), async c => {
    const q = c.req.valid('query')
    const { items, total } = await listProspects({ ...q, sellerUserId: undefined }, viewerOf(c))
    const page = paginate(items, q.page, q.perPage, total)
    return ok(c, page.items, page.meta)
  })

  .post('/prospects', json(createProspectInput), async c => {
    const seller = await writer(c)
    const detail = await createProspect(c.req.valid('json'), { userId: seller.userId, name: seller.name })
    await recordAudit(c, {
      action: 'sales_prospect.created',
      resource: 'sales_prospect',
      resourceId: detail.id,
      organizationId: null,
      metadata: { nome: detail.name, etapa: detail.stage, origem: detail.origin },
    })
    return created(c, detail)
  })

  .get('/prospects/:id', param(idParam), async c => ok(c, await getProspectDetail(c.req.valid('param').id, viewerOf(c))))

  .patch('/prospects/:id', param(idParam), json(updateProspectInput), async c => {
    const seller = await writer(c)
    const { id } = c.req.valid('param')
    const input = c.req.valid('json')
    const { before, after } = await updateProspect(id, input, { userId: seller.userId, name: seller.name })
    await recordAudit(c, {
      action: 'sales_prospect.updated',
      resource: 'sales_prospect',
      resourceId: id,
      organizationId: null,
      metadata: { campos: Object.keys(input), etapaAntes: before.stage, etapaDepois: after.stage },
    })
    return ok(c, after)
  })

  .post('/prospects/:id/interacoes', param(idParam), json(createProspectInteractionInput), async c => {
    const seller = await writer(c)
    const { id } = c.req.valid('param')
    const input = c.req.valid('json')
    const detail = await addInteraction(id, input, { userId: seller.userId, name: seller.name })
    await recordAudit(c, {
      action: 'sales_prospect.interaction_added',
      resource: 'sales_prospect',
      resourceId: id,
      organizationId: null,
      metadata: { tipo: input.kind },
    })
    return created(c, detail)
  })

  // -------------------------------------------------------------------------
  // Link de contratação e propostas
  // -------------------------------------------------------------------------

  .post(
    '/prospects/:id/link',
    rateLimit({ key: 'vendas:link', limit: 20, windowMs: 15 * MINUTE }),
    param(idParam),
    json(createSellerLinkInput),
    async c => {
      const seller = await writer(c)
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const result = await createSellerLink(id, input, seller)
      await recordAudit(c, {
        action: 'sales_link.created',
        resource: 'onboarding_proposal',
        resourceId: result.proposal.id,
        organizationId: null,
        metadata: {
          prospectId: id,
          protocolo: result.proposal.code,
          planId: input.planId,
          vidas: input.expectedLives,
          emailEnviado: result.emailSent,
          pedidoDesconto: result.discountRequest?.id ?? null,
        },
      })
      return created(c, result)
    },
  )

  .get('/propostas', query(listSellerProposalsQuery), async c => {
    const q = c.req.valid('query')
    const { items, total } = await listSellerProposals(q, me(c).userId)
    const page = paginate(items, q.page, q.perPage, total)
    return ok(c, page.items, page.meta)
  })

  .get('/propostas/:id', param(idParam), async c => ok(c, await getSellerProposal(c.req.valid('param').id, me(c).userId)))

  .post(
    '/propostas/:id/enviar-link',
    rateLimit({ key: 'vendas:enviar-link', limit: 10, windowMs: 15 * MINUTE }),
    param(idParam),
    async c => {
      const seller = await writer(c)
      const { id } = c.req.valid('param')
      const proposal = await sendSellerLink(id, seller)
      await recordAudit(c, {
        action: 'sales_link.sent',
        resource: 'onboarding_proposal',
        resourceId: id,
        organizationId: null,
        metadata: { protocolo: proposal.code, desconto: proposal.discount },
      })
      return ok(c, proposal)
    },
  )

  .post('/propostas/:id/desconto', param(idParam), json(discountRequestInput), async c => {
    const seller = await writer(c)
    const { id } = c.req.valid('param')
    const input = c.req.valid('json')
    const result = await requestDiscountForProposal(id, input, seller)
    await recordAudit(c, {
      action: 'sales_discount.requested',
      resource: 'sales_discount_request',
      resourceId: result.discountRequest?.id ?? null,
      organizationId: null,
      metadata: { proposalId: id, pedido: result.discountRequest?.requested ?? null },
    })
    return created(c, result)
  })

  .get('/descontos', query(listDiscountRequestsQuery), async c => {
    const q = c.req.valid('query')
    const { items, total } = await listDiscountRequests({ ...q, sellerUserId: undefined }, { sellerUserId: me(c).userId })
    const page = paginate(items, q.page, q.perPage, total)
    return ok(c, page.items, page.meta)
  })

  // -------------------------------------------------------------------------
  // Comissões e notificações
  // -------------------------------------------------------------------------

  /** Só as do próprio vendedor (o `sellerUserId` da query é ignorado), com totais. */
  .get('/comissoes', query(listSalesCommissionsQuery), async c => {
    const q = c.req.valid('query')
    return ok(c, await listCommissions({ ...q, sellerUserId: me(c).userId }))
  })

  .route('/notificacoes', sellerNotificationsController)
