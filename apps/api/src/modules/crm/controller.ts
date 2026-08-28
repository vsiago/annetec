import {
  createInteractionInput,
  createLeadInput,
  createSaleInput,
  leadStatus,
  paginationQuery,
  updateLeadInput,
  upsertSalesGoalInput,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { created, noContent, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { crmService } from './service'

const idParam = z.object({ id: z.string().uuid() })

/**
 * CRM. Montado em `/api/v1/t/:tenantSlug/crm`.
 *
 * Vendedor enxerga apenas a própria carteira; admin enxerga a do inquilino
 * inteiro. O escopo é aplicado no controller, nunca confiando em filtro vindo
 * do cliente.
 */
export const crmController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole('admin', 'seller'))

  .get(
    '/leads',
    query(paginationQuery.extend({ status: leadStatus.optional(), vendedorId: z.string().uuid().optional() })),
    async c => {
      const { page, perPage, status, q, vendedorId } = c.req.valid('query')
      const { items, total } = await crmService.listLeads({
        tenantId: tenantOf(c).id,
        page,
        perPage,
        status,
        search: q,
        sellerId: ownScope(c) ?? vendedorId,
      })
      const result = paginate(items, page, perPage, total)
      return ok(c, result.items, result.meta)
    },
  )

  .post('/leads', json(createLeadInput), async c => {
    const input = c.req.valid('json')
    return created(
      c,
      await crmService.createLead(tenantOf(c).id, {
        ...input,
        sellerId: ownScope(c) ?? input.sellerId,
      }),
    )
  })

  .get('/leads/:id', param(idParam), async c =>
    ok(c, await crmService.getLead(tenantOf(c).id, c.req.valid('param').id)),
  )

  .patch('/leads/:id', param(idParam), json(updateLeadInput), async c =>
    ok(c, await crmService.updateLead(tenantOf(c).id, c.req.valid('param').id, c.req.valid('json'))),
  )

  .delete('/leads/:id', param(idParam), requireTenantRole('admin'), async c => {
    await crmService.deleteLead(tenantOf(c).id, c.req.valid('param').id)
    return noContent(c)
  })

  .post('/leads/:id/interacoes', param(idParam), json(createInteractionInput), async c => {
    const auth = c.get('auth')
    return created(
      c,
      await crmService.addInteraction(
        tenantOf(c).id,
        c.req.valid('param').id,
        c.req.valid('json'),
        auth?.user.id ?? null,
      ),
    )
  })

  .get(
    '/vendas',
    query(
      paginationQuery.extend({
        vendedorId: z.string().uuid().optional(),
        de: z.string().datetime().optional(),
        ate: z.string().datetime().optional(),
      }),
    ),
    async c => {
      const { page, perPage, vendedorId, de, ate } = c.req.valid('query')
      const { items, total } = await crmService.listSales({
        tenantId: tenantOf(c).id,
        page,
        perPage,
        sellerId: ownScope(c) ?? vendedorId,
        from: de,
        to: ate,
      })
      const result = paginate(items, page, perPage, total)
      return ok(c, result.items, result.meta)
    },
  )

  .post('/vendas', json(createSaleInput), async c => {
    const input = c.req.valid('json')
    return created(
      c,
      await crmService.createSale(tenantOf(c).id, {
        ...input,
        sellerId: ownScope(c) ?? input.sellerId,
      }),
    )
  })

  .get(
    '/metas',
    query(
      z.object({
        ano: z.coerce.number().int(),
        mes: z.coerce.number().int().min(1).max(12).optional(),
        vendedorId: z.string().uuid().optional(),
      }),
    ),
    async c => {
      const { ano, mes, vendedorId } = c.req.valid('query')
      return ok(
        c,
        await crmService.listGoals(tenantOf(c).id, {
          year: ano,
          month: mes,
          sellerId: ownScope(c) ?? vendedorId,
        }),
      )
    },
  )

  .put('/metas', requireTenantRole('admin'), json(upsertSalesGoalInput), async c =>
    ok(c, await crmService.upsertGoal(tenantOf(c).id, c.req.valid('json'))),
  )

/** Vendedor fica preso à própria carteira; admin recebe `undefined`. */
function ownScope(c: { get: (key: 'auth') => AppEnv['Variables']['auth'] }): string | undefined {
  const auth = c.get('auth')
  return auth?.membership.scope === 'tenant' && auth.membership.tenantRole === 'seller' ? auth.user.id : undefined
}
