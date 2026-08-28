import { createPlatformUserInput, paginationQuery, platformRole } from '@annetec/contracts'
import { Hono } from 'hono'
import { requireAuth, requirePlatformRole } from '@/http/middleware/auth'
import { created, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, query } from '@/http/validate'
import { platformUsersService } from './service'

const listQuery = paginationQuery.extend({ role: platformRole.optional() })

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

  .post('/', requirePlatformRole('superadmin'), json(createPlatformUserInput), async c =>
    created(c, await platformUsersService.create(c.req.valid('json'))),
  )
