import { quoteInput } from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { catalogService } from './service'

const codigoParam = z.object({ codigo: z.string().min(1) })
const convenioQuery = z.object({ codigoConvenio: z.string().min(1) })

/**
 * Catálogo. Montado em `/api/v1/t/:tenantSlug/catalogo`.
 *
 * Leitura liberada a qualquer papel do inquilino: cliente precisa do nome do
 * plano na carteirinha, vendedor precisa do catálogo para cotar.
 */
export const catalogController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole())

  .get('/convenios', async c => ok(c, await catalogService.listConvenios(tenantOf(c).id)))

  .get('/convenios/:codigo', param(codigoParam), async c =>
    ok(c, await catalogService.getConvenio(tenantOf(c).id, c.req.valid('param').codigo)),
  )

  .get('/planos', query(z.object({ codigoProduto: z.string().min(1) })), async c =>
    ok(c, await catalogService.listPlansByProduct(tenantOf(c).id, c.req.valid('query').codigoProduto)),
  )

  .get('/planos/:codigo', param(codigoParam), async c =>
    ok(c, await catalogService.getPlan(tenantOf(c).id, c.req.valid('param').codigo)),
  )

  .get('/carencias', query(convenioQuery), async c =>
    ok(c, await catalogService.listWaitingPeriods(tenantOf(c).id, c.req.valid('query').codigoConvenio)),
  )

  .get('/tabelas', query(convenioQuery), async c =>
    ok(c, await catalogService.listPriceTables(tenantOf(c).id, c.req.valid('query').codigoConvenio)),
  )

  .get('/tabelas/:codigo', param(codigoParam), async c =>
    ok(c, await catalogService.getPriceTable(tenantOf(c).id, c.req.valid('param').codigo)),
  )

  /** Cotação: liberada a admin e vendedor, que são quem vende. */
  .post('/cotacao', requireTenantRole('admin', 'seller'), json(quoteInput), async c =>
    ok(c, await catalogService.quote(tenantOf(c).id, c.req.valid('json'))),
  )

  .delete('/cache', requireTenantRole('admin'), async c => {
    await catalogService.invalidate(tenantOf(c).id)
    return ok(c, { invalidated: true })
  })
