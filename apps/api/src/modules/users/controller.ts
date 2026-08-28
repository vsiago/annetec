import { createTenantUserInput, paginationQuery, tenantRole, updateTenantUserInput } from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { created, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { json, param, query } from '@/http/validate'
import { sellersService, usersService } from './service'

const idParam = z.object({ id: z.string().uuid() })
const listQuery = paginationQuery.extend({ role: tenantRole.optional() })

/** Usuários do inquilino. Montado em `/api/v1/t/:tenantSlug/usuarios`. */
export const usersController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole('admin'))

  .get('/', query(listQuery), async c => {
    const { page, perPage, role, q } = c.req.valid('query')
    const { items, total } = await usersService.list({
      tenantId: tenantOf(c).id,
      page,
      perPage,
      role,
      search: q,
    })
    const result = paginate(items, page, perPage, total)
    return ok(c, result.items, result.meta)
  })

  .post('/', json(createTenantUserInput), async c =>
    created(c, await usersService.create(tenantOf(c).id, c.req.valid('json'))),
  )

  .get('/:id', param(idParam), async c =>
    ok(c, await usersService.getById(tenantOf(c).id, c.req.valid('param').id)),
  )

  .patch('/:id', param(idParam), json(updateTenantUserInput), async c =>
    ok(c, await usersService.update(tenantOf(c).id, c.req.valid('param').id, c.req.valid('json'))),
  )

  .delete('/:id', param(idParam), async c =>
    ok(c, await usersService.deactivate(tenantOf(c).id, c.req.valid('param').id)),
  )

  /** Vincula um vendedor a um produtor já existente na Digital Saúde. */
  .put(
    '/:id/produtor',
    param(idParam),
    json(
      z.object({
        codigo: z.string().min(1),
        login: z.string().min(1).optional(),
        password: z.string().min(1).optional(),
      }),
    ),
    async c =>
      ok(
        c,
        await sellersService.linkProdutor(
          tenantOf(c).id,
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
      ),
  )

  /** Cria o produtor no ERP e já vincula ao vendedor. */
  .post(
    '/:id/produtor',
    param(idParam),
    json(
      z.object({
        nome: z.string().min(1),
        email: z.string().email(),
        numeroDocumento: z.string().optional(),
        grupoProdutorCodigo: z.string().min(1),
      }),
    ),
    async c =>
      created(
        c,
        await sellersService.createProdutor(
          tenantOf(c).id,
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
      ),
  )
