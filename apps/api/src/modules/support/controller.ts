import {
  createAppointmentInput,
  paginationQuery,
  updateAppointmentInput,
  appointmentStatus,
  type Appointment,
} from '@annetec/contracts'
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '@/db/client'
import { appointments } from '@/db/schema'
import { AppError } from '@/http/errors'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { created, noContent, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { recordAudit } from '@/lib/audit'
import { json, param, query } from '@/http/validate'

const idParam = z.object({ id: z.string().uuid() })

/**
 * Atendimento / teleorientação. Montado em
 * `/api/v1/t/:tenantSlug/atendimentos`.
 *
 * Dado próprio da Annetec: é o registro de que alguém pediu ajuda e de como o
 * pedido andou. Quando o inquilino usa o módulo de atendimento da Digital
 * Saúde, o ERP devolve um `protocol` que é guardado junto — mas o chamado em
 * si nasce e vive aqui, porque nem todo inquilino tem esse módulo contratado
 * e o histórico não pode depender disso.
 *
 * Service e controller no mesmo arquivo, como em `modules/network`: é CRUD
 * com escopo de inquilino, sem regra de negócio que justifique separar.
 *
 * Quem vê o quê: admin e vendedor enxergam a fila inteira do inquilino; o
 * associado só os chamados dele. O recorte é aplicado aqui e nunca a partir
 * de filtro vindo do cliente.
 */
export const supportController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole())

  .get(
    '/',
    query(paginationQuery.extend({ status: appointmentStatus.optional() })),
    async c => {
      const { page, perPage, status, q } = c.req.valid('query')
      const filters: SQL[] = [eq(appointments.organizationId, tenantOf(c).id)]

      const proprio = escopoProprio(c)
      if (proprio) filters.push(eq(appointments.clientUserId, proprio))
      if (status) filters.push(eq(appointments.status, status))
      if (q) {
        const termo = `%${q}%`
        const acha = or(ilike(appointments.clientName, termo), ilike(appointments.description, termo))
        if (acha) filters.push(acha)
      }
      const where = and(...filters)

      const [rows, [totais]] = await Promise.all([
        db
          .select()
          .from(appointments)
          .where(where)
          .orderBy(desc(appointments.createdAt))
          .limit(perPage)
          .offset((page - 1) * perPage),
        db.select({ value: count() }).from(appointments).where(where),
      ])

      const result = paginate(rows.map(toAppointment), page, perPage, totais?.value ?? 0)
      return ok(c, result.items, result.meta)
    },
  )

  .post('/', json(createAppointmentInput), async c => {
    const input = c.req.valid('json')
    const auth = c.get('auth')
    const proprio = escopoProprio(c)

    const [row] = await db
      .insert(appointments)
      .values({
        organizationId: tenantOf(c).id,
        // O associado abre chamado só para si: aceitar `clientUserId` do
        // corpo deixaria qualquer um registrar pedido em nome de outra pessoa.
        clientUserId: proprio ?? input.clientUserId,
        clientName: proprio ? (auth?.user.name ?? input.clientName) : input.clientName,
        description: input.description,
      })
      .returning()

    await recordAudit(c, {
      action: 'appointment.created',
      resource: 'appointment',
      resourceId: row!.id,
      metadata: { clientName: row!.clientName },
    })
    return created(c, toAppointment(row!))
  })

  .patch(
    '/:id',
    requireTenantRole('admin', 'seller'),
    param(idParam),
    json(updateAppointmentInput),
    async c => {
      const input = c.req.valid('json')
      const [row] = await db
        .update(appointments)
        .set({
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        })
        .where(
          and(
            eq(appointments.organizationId, tenantOf(c).id),
            eq(appointments.id, c.req.valid('param').id),
          ),
        )
        .returning()

      if (!row) throw AppError.notFound('Atendimento')
      await recordAudit(c, {
        action: 'appointment.updated',
        resource: 'appointment',
        resourceId: row.id,
        metadata: { campos: Object.keys(input) },
      })
      return ok(c, toAppointment(row))
    },
  )

  .delete('/:id', requireTenantRole('admin'), param(idParam), async c => {
    const { id } = c.req.valid('param')
    const [row] = await db
      .delete(appointments)
      .where(and(eq(appointments.organizationId, tenantOf(c).id), eq(appointments.id, id)))
      .returning({ id: appointments.id })

    if (!row) throw AppError.notFound('Atendimento')
    await recordAudit(c, { action: 'appointment.deleted', resource: 'appointment', resourceId: id })
    return noContent(c)
  })

/** Associado fica preso aos próprios chamados; admin e vendedor, não. */
function escopoProprio(c: { get: (key: 'auth') => AppEnv['Variables']['auth'] }): string | undefined {
  const auth = c.get('auth')
  return auth?.membership.scope === 'tenant' && auth.membership.tenantRole === 'client'
    ? auth.user.id
    : undefined
}

function toAppointment(row: typeof appointments.$inferSelect): Appointment {
  return {
    id: row.id,
    tenantId: row.organizationId,
    clientUserId: row.clientUserId,
    clientName: row.clientName,
    description: row.description,
    status: row.status,
    protocol: row.protocol,
    createdAt: row.createdAt.toISOString(),
  }
}
