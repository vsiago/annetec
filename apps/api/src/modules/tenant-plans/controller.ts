import { createTenantPlanInput, updateTenantPlanInput } from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { recordAudit } from '@/lib/audit'
import { created, noContent, ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param } from '@/http/validate'
import { tenantPlansService } from './service'

const idParam = z.object({ id: z.string().uuid() })

/** Planos de assinatura vendidos aos inquilinos. Montado em `/api/v1/platform/plans`. */
export const tenantPlansController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())

  .get('/', async c => ok(c, await tenantPlansService.list()))

  .post('/', requirePlatformRole('superadmin'), json(createTenantPlanInput), async c => {
    const plan = await tenantPlansService.create(c.req.valid('json'))
    await recordAudit(c, {
      action: 'plan.created',
      resource: 'tenant_plan',
      resourceId: plan.id,
      metadata: { name: plan.name, priceMonthly: plan.priceMonthly },
    })
    return created(c, plan)
  })

  .patch(
    '/:id',
    requirePlatformRole('superadmin'),
    param(idParam),
    json(updateTenantPlanInput),
    async c => {
      const { id } = c.req.valid('param')
      const patch = c.req.valid('json')
      const plan = await tenantPlansService.update(id, patch)
      await recordAudit(c, {
        action: 'plan.updated',
        resource: 'tenant_plan',
        resourceId: id,
        metadata: { campos: Object.keys(patch) },
      })
      return ok(c, plan)
    },
  )

  .delete('/:id', requirePlatformRole('superadmin'), param(idParam), async c => {
    const { id } = c.req.valid('param')
    await tenantPlansService.remove(id)
    await recordAudit(c, { action: 'plan.removed', resource: 'tenant_plan', resourceId: id })
    return noContent(c)
  })
