import { createTenantUserInput, paginationQuery, tenantRole, updateTenantUserInput } from '@annetec/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { recordAudit } from '@/lib/audit'
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

  .post('/', json(createTenantUserInput), async c => {
    const tenantUser = await usersService.create(tenantOf(c).id, c.req.valid('json'))
    await recordAudit(c, {
      action: 'tenant_user.created',
      resource: 'tenant_user',
      resourceId: tenantUser.id,
      metadata: { email: tenantUser.email, role: tenantUser.role },
    })
    return created(c, tenantUser)
  })

  .get('/:id', param(idParam), async c =>
    ok(c, await usersService.getById(tenantOf(c).id, c.req.valid('param').id)),
  )

  .patch('/:id', param(idParam), json(updateTenantUserInput), async c => {
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')
    const tenantUser = await usersService.update(tenantOf(c).id, id, patch)
    await recordAudit(c, {
      action: 'tenant_user.updated',
      resource: 'tenant_user',
      resourceId: id,
      metadata: { campos: Object.keys(patch), role: tenantUser.role },
    })
    return ok(c, tenantUser)
  })

  .delete('/:id', param(idParam), async c => {
    const { id } = c.req.valid('param')
    const tenantUser = await usersService.deactivate(tenantOf(c).id, id)
    await recordAudit(c, { action: 'tenant_user.deactivated', resource: 'tenant_user', resourceId: id })
    return ok(c, tenantUser)
  })

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
    async c => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const produtor = await sellersService.linkProdutor(tenantOf(c).id, id, input)
      // Sem `login`/`password` na trilha: a senha do produtor é segredo.
      await recordAudit(c, {
        action: 'seller.produtor_linked',
        resource: 'seller_profile',
        resourceId: id,
        metadata: { codigo: input.codigo, comSenha: Boolean(input.password) },
      })
      return ok(c, produtor)
    },
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
    async c => {
      const { id } = c.req.valid('param')
      const input = c.req.valid('json')
      const produtor = await sellersService.createProdutor(tenantOf(c).id, id, input)
      // Cria cadastro permanente no ERP, sem delete do outro lado.
      await recordAudit(c, {
        action: 'seller.produtor_created',
        resource: 'seller_profile',
        resourceId: id,
        metadata: { codigo: produtor.codigo, grupoProdutorCodigo: input.grupoProdutorCodigo },
      })
      return created(c, produtor)
    },
  )
