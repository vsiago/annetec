import {
  approveDiscountInput,
  createSellerInput,
  listDiscountRequestsQuery,
  listProspectsQuery,
  listSalesCommissionsQuery,
  markSalesCommissionsPaidInput,
  reassignProspectInput,
  rejectDiscountInput,
  salesReportQuery,
  updateSalesCommissionSettingsInput,
  updateSellerInput,
} from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { AppError } from '@/http/errors'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { created, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { listCommissions, loadCommissionSettings, markCommissionsPaid, updateCommissionSettings } from './commissions.service'
import { currentMonthSP, salesReport } from './dashboard.service'
import { approveDiscount, getDiscountRequest, listDiscountRequests, rejectDiscount } from './discounts.service'
import { getProspectDetail, listProspects, reassignProspect } from './prospects.service'
import { createSeller, getSeller, listSellers, updateSeller } from './sellers.service'

/**
 * Gestão COMERCIAL da equipe — `/api/v1/platform/comercial`.
 *
 * Leitura: equipe (superadmin + platform_admin). Escrita (vendedores,
 * reatribuição, descontos, repasse de comissão, regra): SÓ superadmin.
 * Vendedor (`platform_seller`) recebe 403 em tudo aqui.
 */

const idParam = z.object({ id: z.string().uuid() })
const userParam = z.object({ userId: z.string().trim().min(1).max(100) })
const superadmin = requirePlatformRole('superadmin')

function actorOf(c: Context<AppEnv>): { userId: string; name: string } {
  const session = c.get('auth')
  if (!session) throw AppError.unauthenticated()
  return { userId: session.user.id, name: session.user.name }
}

export const platformSalesTeamController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())

  // -------------------------------------------------------------------------
  // Vendedores
  // -------------------------------------------------------------------------

  .get('/vendedores', async c => ok(c, await listSellers()))

  .post('/vendedores', superadmin, json(createSellerInput), async c => {
    const seller = await createSeller(c.req.valid('json'), actorOf(c).userId)
    await recordAudit(c, {
      action: 'sales_seller.created',
      resource: 'sales_seller',
      resourceId: seller.userId,
      organizationId: null,
      metadata: { email: seller.email, codigo: seller.referralCode, meta: seller.monthlyGoal },
    })
    return created(c, seller)
  })

  .get('/vendedores/:userId', param(userParam), async c => ok(c, await getSeller(c.req.valid('param').userId)))

  .patch('/vendedores/:userId', superadmin, param(userParam), json(updateSellerInput), async c => {
    const { userId } = c.req.valid('param')
    const input = c.req.valid('json')
    const { before, after } = await updateSeller(userId, input)
    await recordAudit(c, {
      action: input.active === false ? 'sales_seller.deactivated' : 'sales_seller.updated',
      resource: 'sales_seller',
      resourceId: userId,
      organizationId: null,
      metadata: {
        campos: Object.keys(input),
        antes: { codigo: before.referralCode, ativo: before.active, meta: before.monthlyGoal },
        depois: { codigo: after.referralCode, ativo: after.active, meta: after.monthlyGoal },
      },
    })
    return ok(c, after)
  })

  // -------------------------------------------------------------------------
  // Funil de todos (leitura) e reatribuição
  // -------------------------------------------------------------------------

  .get('/prospects', query(listProspectsQuery), async c => {
    const q = c.req.valid('query')
    const { items, total } = await listProspects(q, { kind: 'staff' })
    const page = paginate(items, q.page, q.perPage, total)
    return ok(c, page.items, page.meta)
  })

  .get('/prospects/:id', param(idParam), async c => ok(c, await getProspectDetail(c.req.valid('param').id, { kind: 'staff' })))

  .post('/prospects/:id/reatribuir', superadmin, param(idParam), json(reassignProspectInput), async c => {
    const { id } = c.req.valid('param')
    const input = c.req.valid('json')
    const result = await reassignProspect(id, input, actorOf(c))
    await recordAudit(c, {
      action: 'sales_prospect.reassigned',
      resource: 'sales_prospect',
      resourceId: id,
      organizationId: null,
      metadata: { de: result.fromUserId, para: input.sellerUserId, motivo: input.reason ?? null, propostaMovida: result.proposalMoved },
    })
    return ok(c, result.detail)
  })

  // -------------------------------------------------------------------------
  // Descontos
  // -------------------------------------------------------------------------

  .get('/descontos', query(listDiscountRequestsQuery), async c => {
    const q = c.req.valid('query')
    const { items, total } = await listDiscountRequests(q)
    const page = paginate(items, q.page, q.perPage, total)
    return ok(c, page.items, page.meta)
  })

  .get('/descontos/:id', param(idParam), async c => ok(c, await getDiscountRequest(c.req.valid('param').id)))

  .post('/descontos/:id/aprovar', superadmin, param(idParam), json(approveDiscountInput), async c => {
    const { id } = c.req.valid('param')
    const input = c.req.valid('json')
    const result = await approveDiscount(id, input, actorOf(c))
    await recordAudit(c, {
      action: 'sales_discount.approved',
      resource: 'sales_discount_request',
      resourceId: id,
      organizationId: null,
      metadata: {
        proposalId: result.request.proposalId,
        pedido: result.request.requested,
        aprovado: result.discount,
        ajustado: JSON.stringify(result.request.requested) !== JSON.stringify(result.discount),
        linkEnviado: result.inviteSent,
        nota: input.note ?? null,
      },
    })
    return ok(c, result.request)
  })

  .post('/descontos/:id/recusar', superadmin, param(idParam), json(rejectDiscountInput), async c => {
    const { id } = c.req.valid('param')
    const input = c.req.valid('json')
    const request = await rejectDiscount(id, input, actorOf(c))
    await recordAudit(c, {
      action: 'sales_discount.rejected',
      resource: 'sales_discount_request',
      resourceId: id,
      organizationId: null,
      metadata: { proposalId: request.proposalId, pedido: request.requested, motivo: input.reason },
    })
    return ok(c, request)
  })

  // -------------------------------------------------------------------------
  // Comissões e regra
  // -------------------------------------------------------------------------

  .get('/comissoes', query(listSalesCommissionsQuery), async c => ok(c, await listCommissions(c.req.valid('query'))))

  .post('/comissoes/pagar', superadmin, json(markSalesCommissionsPaidInput), async c => {
    const input = c.req.valid('json')
    const result = await markCommissionsPaid(input, actorOf(c))
    for (const entry of result.paid) {
      await recordAudit(c, {
        action: 'sales_commission.paid',
        resource: 'sales_commission',
        resourceId: entry.id,
        organizationId: entry.organizationId,
        metadata: { vendedor: entry.sellerUserId, valor: entry.amount, data: input.payoutDate, nota: input.note ?? null },
      })
    }
    return ok(c, result)
  })

  .get('/configuracao', async c => ok(c, await loadCommissionSettings()))

  .put('/configuracao', superadmin, json(updateSalesCommissionSettingsInput), async c => {
    const { before, after } = await updateCommissionSettings(c.req.valid('json'), actorOf(c))
    await recordAudit(c, {
      action: 'sales_commission_settings.updated',
      resource: 'sales_commission_settings',
      resourceId: 'default',
      organizationId: null,
      metadata: {
        antes: { escala: before.monthlySchedule, adesao: before.setupFeePercent },
        depois: { escala: after.monthlySchedule, adesao: after.setupFeePercent },
      },
    })
    return ok(c, after)
  })

  .get('/relatorio', query(salesReportQuery), async c => ok(c, await salesReport(c.req.valid('query').mes ?? currentMonthSP())))
