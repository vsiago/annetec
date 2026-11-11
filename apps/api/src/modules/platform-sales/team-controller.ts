import {
  approveDiscountInput,
  listDiscountRequestsQuery,
  listProspectsQuery,
  listSalesCommissionsQuery,
  rejectDiscountInput,
  salesReportQuery,
} from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { AppError } from '@/http/errors'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import { listCommissions, loadCommissionSettings } from './commissions.service'
import { currentMonthSP, salesReport } from './dashboard.service'
import { approveDiscount, getDiscountRequest, listDiscountRequests, rejectDiscount } from './discounts.service'
import { legadoDesativado } from './legado-desativado'
import { getProspectDetail, listProspects } from './prospects.service'
import { getSeller, listSellers } from './sellers.service'

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

  // Desativado (410): criaria `platform_sellers` sem `vendas_agentes` (sem atribuição nem comissão). Use /vendas/rede/agentes.
  .post('/vendedores', superadmin, legadoDesativado)

  .get('/vendedores/:userId', param(userParam), async c => ok(c, await getSeller(c.req.valid('param').userId)))

  // Desativado (410): a fonte da verdade é `vendas_agentes`. Use /vendas/rede/agentes/:id/(ativar|desativar).
  .patch('/vendedores/:userId', superadmin, legadoDesativado)

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

  // Desativado (410): mudaria só `seller_user_id`, mas o agente novo da proposta prevalece. Use /vendas/leads/:id/reatribuir.
  .post('/prospects/:id/reatribuir', superadmin, legadoDesativado)

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

  // Desativado (410): o repasse vive em `vendas_comissoes` (/vendas/comissoes/pagar); pagar aqui duplicaria o pagamento.
  .post('/comissoes/pagar', superadmin, legadoDesativado)

  .get('/configuracao', async c => ok(c, await loadCommissionSettings()))

  // Desativado (410): a regra de comissão vigente é `vendas_config` (/vendas/config).
  .put('/configuracao', superadmin, legadoDesativado)

  .get('/relatorio', query(salesReportQuery), async c => ok(c, await salesReport(c.req.valid('query').mes ?? currentMonthSP())))
