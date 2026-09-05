import {
  createPlatformUserInput,
  paginationQuery,
  platformRole,
  updatePlatformUserInput,
} from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { recordAudit } from '@/lib/audit'
import { created, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { platformUsersService } from './service'

const listQuery = paginationQuery.extend({ role: platformRole.optional() })
const idParam = z.object({ id: z.string() })

/**
 * Contas de equipe Annetec. Montado em `/api/v1/platform/users`.
 *
 * Leitura liberada a qualquer papel de plataforma; criar uma conta nova é
 * restrito a superadmin — evita que um platform_admin se autopromova criando
 * outro superadmin.
 */
export const platformUsersController = new Hono<AppEnv>()
  .use('*', requireAuth, requirePlatformRole())

  .get('/', query(listQuery), async c => {
    const { page, perPage, role, q } = c.req.valid('query')
    const { items, total } = await platformUsersService.list({ page, perPage, role, search: q })
    const result = paginate(items, page, perPage, total)
    return ok(c, result.items, result.meta)
  })

  .post('/', requirePlatformRole('superadmin'), json(createPlatformUserInput), async c => {
    const platformUser = await platformUsersService.create(c.req.valid('json'))
    await recordAudit(c, {
      action: 'platform_user.created',
      resource: 'platform_user',
      resourceId: platformUser.id,
      metadata: { email: platformUser.email, role: platformUser.role },
    })
    return created(c, platformUser)
  })

  .get('/:id', param(idParam), async c =>
    ok(c, await platformUsersService.getById(c.req.valid('param').id)),
  )

  /** Papel e ativação mudam a superfície de acesso — só superadmin. */
  .patch(
    '/:id',
    requirePlatformRole('superadmin'),
    param(idParam),
    json(updatePlatformUserInput),
    async c => {
      const { id } = c.req.valid('param')
      const patch = c.req.valid('json')
      const platformUser = await platformUsersService.update(id, patch, c.get('auth')?.user.id)
      await recordAudit(c, {
        action: patch.active === false ? 'platform_user.deactivated' : 'platform_user.updated',
        resource: 'platform_user',
        resourceId: id,
        metadata: { campos: Object.keys(patch), role: platformUser.role, active: platformUser.active },
      })
      return ok(c, platformUser)
    },
  )
