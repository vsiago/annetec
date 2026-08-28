import {
  createTenantInput,
  paginationQuery,
  tenantIntegration,
  tenantStatus,
  updateTenantInput,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { created, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { tenantsService } from './service'

const idParam = z.object({ id: z.string().uuid() })
const listQuery = paginationQuery.extend({ status: tenantStatus.optional() })

/**
 * Administração de inquilinos — território exclusivo da equipe Annetec
 * (`/admin/inquilinos` no frontend). Montado em `/api/v1/platform/tenants`.
 */
export const tenantsController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())

  .get('/', query(listQuery), async c => {
    const { page, perPage, status, q } = c.req.valid('query')
    const { items, total } = await tenantsService.list({ page, perPage, status, search: q })
    const result = paginate(items, page, perPage, total)
    return ok(c, result.items, result.meta)
  })

  .post('/', json(createTenantInput), async c => {
    const { tenant, ownerPassword } = await tenantsService.create(c.req.valid('json'))
    // A senha provisória aparece UMA vez, na resposta do wizard.
    return created(c, { tenant, ownerPassword })
  })

  /**
   * A Annetec operando como operadora — clientes diretos, fora da lista de
   * inquilinos. O frontend usa o `slug` devolvido aqui para reaproveitar as
   * mesmas rotas `/api/v1/t/:tenantSlug/*` (contratos, financeiro, catálogo)
   * já existentes: sessão de plataforma passa livre por `requireTenantRole`.
   */
  .get('/operador', async c => {
    const operator = await tenantsService.getOperator()
    if (!operator) return ok(c, null)
    return ok(c, operator)
  })

  .get('/:id', param(idParam), async c => ok(c, await tenantsService.getById(c.req.valid('param').id)))

  .patch('/:id', param(idParam), json(updateTenantInput), async c =>
    ok(c, await tenantsService.update(c.req.valid('param').id, c.req.valid('json'))),
  )

  .delete('/:id', param(idParam), async c =>
    ok(c, await tenantsService.cancel(c.req.valid('param').id)),
  )

  .get('/:id/integration', param(idParam), async c =>
    ok(c, await tenantsService.getIntegration(c.req.valid('param').id)),
  )

  .put('/:id/integration', param(idParam), json(tenantIntegration), async c =>
    ok(c, await tenantsService.saveIntegration(c.req.valid('param').id, c.req.valid('json'))),
  )

  .post('/:id/integration/test', param(idParam), async c =>
    ok(c, { ok: await tenantsService.testIntegration(c.req.valid('param').id) }),
  )
