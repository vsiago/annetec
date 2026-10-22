import {
  holdingCohortsQuery,
  holdingPeriodQuery,
  listAuditQuery,
  listHoldingTenantsQuery,
  tenantLifecycleInput,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { recordAudit } from '@/lib/audit'
import {
  applyTenantLifecycle,
  holdingAlerts,
  holdingCohorts,
  holdingOverview,
  holdingTenantDetail,
  holdingTenants,
  listAudit,
} from './service'

/**
 * Holding — `/api/v1/platform/holding` (equipe da plataforma). Leituras com
 * cache de 60 s (`?fresh=1` recalcula); ciclo de vida só do superadmin.
 */

const orgParam = z.object({ orgId: z.string().trim().min(1).max(100) })
const freshQuery = z.object({ fresh: z.enum(['0', '1']).optional() })
const q = { q: z.string().trim().min(1).max(100).optional() }

export const holdingController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())

  .get('/visao-geral', query(holdingPeriodQuery), async c => {
    const { meses, fresh } = c.req.valid('query')
    return ok(c, await holdingOverview(meses, fresh === '1'))
  })

  .get('/inquilinos', query(listHoldingTenantsQuery.extend(q).merge(freshQuery)), async c => {
    const { fresh, ...rest } = c.req.valid('query')
    const { items, meta } = await holdingTenants(rest, fresh === '1')
    return ok(c, items, meta)
  })

  .get('/inquilinos/:orgId', param(orgParam), query(holdingPeriodQuery), async c => {
    const { meses, fresh } = c.req.valid('query')
    return ok(c, await holdingTenantDetail(c.req.valid('param').orgId, meses, fresh === '1'))
  })

  .post('/inquilinos/:orgId/ciclo-de-vida', requirePlatformRole('superadmin'), param(orgParam), json(tenantLifecycleInput), async c => {
    const { orgId } = c.req.valid('param')
    const input = c.req.valid('json')
    const result = await applyTenantLifecycle(orgId, input, c.get('auth')?.user.id ?? null)
    await recordAudit(c, {
      action: `tenant.lifecycle.${input.action}`,
      resource: 'tenant',
      resourceId: orgId,
      organizationId: orgId,
      metadata: { motivo: input.reason, ate: input.until ?? null, antes: result.previous, depois: result.level, mudou: result.changed },
    })
    return ok(c, await holdingTenantDetail(orgId, 12, true))
  })

  .get('/alertas', query(freshQuery), async c => ok(c, await holdingAlerts(c.req.valid('query').fresh === '1')))

  .get('/coortes', query(holdingCohortsQuery), async c => {
    const { meses, nivel, fresh } = c.req.valid('query')
    return ok(c, await holdingCohorts(nivel, meses, fresh === '1'))
  })

  .get('/auditoria', query(listAuditQuery.extend(q)), async c => {
    const { items, meta } = await listAudit(c.req.valid('query'))
    return ok(c, items, meta)
  })
