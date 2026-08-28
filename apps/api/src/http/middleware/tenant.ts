import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { db } from '@/db/client'
import { organization, tenantProfiles } from '@/db/schema'
import { AppError } from '@/http/errors'
import type { AppEnv } from '@/http/types'

/**
 * Resolve o inquilino a partir do segmento `:tenantSlug` da rota — o mesmo
 * `[tenant]` do App Router. Um inquilino é uma `organization` do Better Auth;
 * roda ANTES de `requireTenantRole`, que compara o inquilino resolvido com o
 * da sessão ativa.
 */
export const resolveTenant = createMiddleware<AppEnv>(async (c, next) => {
  const slug = c.req.param('tenantSlug')
  if (!slug) throw AppError.notFound('Inquilino')

  const [row] = await db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      status: tenantProfiles.status,
    })
    .from(organization)
    .innerJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
    .where(eq(organization.slug, slug.toLowerCase()))
    .limit(1)

  if (!row) throw AppError.notFound('Inquilino')
  if (row.status === 'cancelled') {
    throw AppError.forbidden('Este inquilino está cancelado')
  }

  c.set('tenant', { id: row.id, slug: row.slug, name: row.name })
  await next()
})

/** Lê o inquilino já resolvido, falhando alto se a rota esqueceu o middleware. */
export function tenantOf(c: { get: (key: 'tenant') => AppEnv['Variables']['tenant'] }) {
  const tenant = c.get('tenant')
  if (!tenant) throw new Error('resolveTenant não foi registrado nesta rota')
  return tenant
}
