import { createTenantPlanInput } from '@annetec/contracts'
import { Hono } from 'hono'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { created, ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json } from '@/http/validate'
import { tenantPlansService } from './service'

/** Planos de assinatura vendidos aos inquilinos. Montado em `/api/v1/platform/plans`. */
export const tenantPlansController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())

  .get('/', async c => ok(c, await tenantPlansService.list()))

  .post('/', requirePlatformRole('superadmin'), json(createTenantPlanInput), async c =>
    created(c, await tenantPlansService.create(c.req.valid('json'))),
  )
