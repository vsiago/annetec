import {
  createBenefitInput,
  createPartnerInput,
  paginationQuery,
  partnerCategory,
  updateBenefitInput,
  updatePartnerInput,
  type Benefit,
  type Partner,
} from '@annetec/contracts'
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '@/db/client'
import { benefits, partners } from '@/db/schema'
import { AppError } from '@/http/errors'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { created, noContent, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { recordAudit } from '@/lib/audit'
import { json, param, query } from '@/http/validate'

const idParam = z.object({ id: z.string().uuid() })

/**
 * Rede credenciada e clube de benefícios. Montado em
 * `/api/v1/t/:tenantSlug/rede`.
 *
 * Conteúdo 100% Annetec (a Digital Saúde não tem equivalente), então service e
 * controller ficam no mesmo arquivo: são CRUDs sem regra de negócio além do
 * escopo de inquilino. Leitura para qualquer papel, escrita só para admin.
 */
export const networkController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole())

  .get(
    '/parceiros',
    query(paginationQuery.extend({ categoria: partnerCategory.optional() })),
    async c => {
      const tenant = tenantOf(c)
      const { page, perPage, categoria, q } = c.req.valid('query')

      const filters: SQL[] = [eq(partners.organizationId, tenant.id)]
      if (categoria) filters.push(eq(partners.category, categoria))
      if (q) {
        const term = `%${q}%`
        const match = or(ilike(partners.name, term), ilike(partners.city, term))
        if (match) filters.push(match)
      }
      const where = and(...filters)

      const [rows, [totals]] = await Promise.all([
        db
          .select()
          .from(partners)
          .where(where)
          .orderBy(desc(partners.createdAt))
          .limit(perPage)
          .offset((page - 1) * perPage),
        db.select({ value: count() }).from(partners).where(where),
      ])

      const result = paginate(rows.map(toPartner), page, perPage, totals?.value ?? 0)
      return ok(c, result.items, result.meta)
    },
  )

  .post('/parceiros', requireTenantRole('admin'), json(createPartnerInput), async c => {
    const input = c.req.valid('json')
    const [row] = await db
      .insert(partners)
      .values({
        organizationId: tenantOf(c).id,
        name: input.name,
        category: input.category,
        discountPercent: String(input.discountPercent),
        address: input.address,
        phone: input.phone,
        city: input.city,
        state: input.state,
        status: input.status,
      })
      .returning()
    await recordAudit(c, {
      action: 'partner.created',
      resource: 'partner',
      resourceId: row!.id,
      metadata: { name: input.name, category: input.category },
    })
    return created(c, toPartner(row!))
  })

  .patch(
    '/parceiros/:id',
    requireTenantRole('admin'),
    param(idParam),
    json(updatePartnerInput),
    async c => {
      const input = c.req.valid('json')
      const [row] = await db
        .update(partners)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.discountPercent !== undefined
            ? { discountPercent: String(input.discountPercent) }
            : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        })
        .where(and(eq(partners.organizationId, tenantOf(c).id), eq(partners.id, c.req.valid('param').id)))
        .returning()

      if (!row) throw AppError.notFound('Parceiro')
      await recordAudit(c, {
        action: 'partner.updated',
        resource: 'partner',
        resourceId: row.id,
        metadata: { campos: Object.keys(input) },
      })
      return ok(c, toPartner(row))
    },
  )

  .delete('/parceiros/:id', requireTenantRole('admin'), param(idParam), async c => {
    const deleted = await db
      .delete(partners)
      .where(and(eq(partners.organizationId, tenantOf(c).id), eq(partners.id, c.req.valid('param').id)))
      .returning({ id: partners.id })
    if (deleted.length === 0) throw AppError.notFound('Parceiro')
    await recordAudit(c, {
      action: 'partner.removed',
      resource: 'partner',
      resourceId: c.req.valid('param').id,
    })
    return noContent(c)
  })

  .get('/beneficios', async c => {
    const rows = await db
      .select()
      .from(benefits)
      .where(eq(benefits.organizationId, tenantOf(c).id))
      .orderBy(desc(benefits.createdAt))
    return ok(c, rows.map(toBenefit))
  })

  .post('/beneficios', requireTenantRole('admin'), json(createBenefitInput), async c => {
    const input = c.req.valid('json')
    const [row] = await db
      .insert(benefits)
      .values({
        organizationId: tenantOf(c).id,
        name: input.name,
        description: input.description,
        category: input.category,
        discountPercent: input.discountPercent === null ? null : String(input.discountPercent),
        provider: input.provider,
        locations: input.locations,
      })
      .returning()
    await recordAudit(c, {
      action: 'benefit.created',
      resource: 'benefit',
      resourceId: row!.id,
      metadata: { name: input.name, category: input.category },
    })
    return created(c, toBenefit(row!))
  })

  .patch(
    '/beneficios/:id',
    requireTenantRole('admin'),
    param(idParam),
    json(updateBenefitInput),
    async c => {
      const input = c.req.valid('json')
      const [row] = await db
        .update(benefits)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.discountPercent !== undefined
            ? { discountPercent: input.discountPercent === null ? null : String(input.discountPercent) }
            : {}),
          ...(input.provider !== undefined ? { provider: input.provider } : {}),
          ...(input.locations !== undefined ? { locations: input.locations } : {}),
        })
        .where(and(eq(benefits.organizationId, tenantOf(c).id), eq(benefits.id, c.req.valid('param').id)))
        .returning()

      if (!row) throw AppError.notFound('Benefício')
      await recordAudit(c, {
        action: 'benefit.updated',
        resource: 'benefit',
        resourceId: row.id,
        metadata: { campos: Object.keys(input) },
      })
      return ok(c, toBenefit(row))
    },
  )

  .delete('/beneficios/:id', requireTenantRole('admin'), param(idParam), async c => {
    const deleted = await db
      .delete(benefits)
      .where(and(eq(benefits.organizationId, tenantOf(c).id), eq(benefits.id, c.req.valid('param').id)))
      .returning({ id: benefits.id })
    if (deleted.length === 0) throw AppError.notFound('Benefício')
    await recordAudit(c, {
      action: 'benefit.removed',
      resource: 'benefit',
      resourceId: c.req.valid('param').id,
    })
    return noContent(c)
  })

function toPartner(row: typeof partners.$inferSelect): Partner {
  return {
    id: row.id,
    tenantId: row.organizationId,
    name: row.name,
    category: row.category,
    discountPercent: Number(row.discountPercent),
    address: row.address,
    phone: row.phone,
    city: row.city,
    state: row.state as Partner['state'],
    status: row.status,
  }
}

function toBenefit(row: typeof benefits.$inferSelect): Benefit {
  return {
    id: row.id,
    tenantId: row.organizationId,
    name: row.name,
    description: row.description,
    category: row.category,
    discountPercent: row.discountPercent === null ? null : Number(row.discountPercent),
    provider: row.provider,
    locations: row.locations,
  }
}
