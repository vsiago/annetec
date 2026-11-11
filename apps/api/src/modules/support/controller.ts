import {
  appointmentChannel,
  appointmentStatus,
  createAppointmentInput,
  createAppointmentMessageInput,
  paginationQuery,
  updateAppointmentInput,
  type Appointment,
  type AppointmentMessage,
} from '@annetec/contracts'
import { and, asc, count, desc, eq, ilike, inArray, or, type SQL } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { db } from '@/db/client'
import { appointmentMessages, appointments, user } from '@/db/schema'
import { AppError } from '@/http/errors'
import { bloquearBalcao, requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { created, noContent, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { recordAudit } from '@/lib/audit'
import { json, param, query } from '@/http/validate'

const idParam = z.object({ id: z.string().uuid() })

/**
 * Mesa de atendimento. Montado em `/api/v1/t/:tenantSlug/atendimentos`.
 *
 * Dado próprio da Annetec: é o registro de que alguém procurou o clube e de
 * como o pedido andou. Quando o inquilino tem o módulo de atendimento da
 * Digital Saúde contratado, o ERP devolve um `protocol` que é guardado junto —
 * mas o chamado nasce e vive aqui, porque nem todo inquilino tem esse módulo
 * e o histórico não pode depender disso.
 *
 * Service e controller no mesmo arquivo, como em `modules/network`: é CRUD
 * com escopo de inquilino, sem regra que justifique separar.
 *
 * Quem vê o quê: admin e vendedor enxergam a fila inteira; o associado, só os
 * chamados dele. O recorte é aplicado aqui e nunca a partir de filtro vindo
 * do cliente. O associado também não lê nota interna — ver `podeVerNota`.
 */
export const supportController = new Hono<AppEnv>()
  .use('*', resolveTenant, requireAuth, requireTenantRole())

  .get(
    '/',
    query(
      paginationQuery.extend({
        status: appointmentStatus.optional(),
        canal: appointmentChannel.optional(),
        responsavelId: z.string().uuid().optional(),
      }),
    ),
    async c => {
      const { page, perPage, status, canal, responsavelId, q } = c.req.valid('query')
      const filters: SQL[] = [eq(appointments.organizationId, tenantOf(c).id)]

      const proprio = escopoProprio(c)
      if (proprio) filters.push(eq(appointments.clientUserId, proprio))
      if (status) filters.push(eq(appointments.status, status))
      if (canal) filters.push(eq(appointments.channel, canal))
      if (responsavelId) filters.push(eq(appointments.assignedUserId, responsavelId))
      if (q) {
        const termo = `%${q}%`
        const acha = or(
          ilike(appointments.clientName, termo),
          ilike(appointments.subject, termo),
          ilike(appointments.description, termo),
          ilike(appointments.protocol, termo),
        )
        if (acha) filters.push(acha)
      }
      const where = and(...filters)

      const [rows, [totais]] = await Promise.all([
        db
          .select({ chamado: appointments, responsavel: user.name })
          .from(appointments)
          .leftJoin(user, eq(user.id, appointments.assignedUserId))
          .where(where)
          .orderBy(desc(appointments.lastInteractionAt))
          .limit(perPage)
          .offset((page - 1) * perPage),
        db.select({ value: count() }).from(appointments).where(where),
      ])

      const threads = await carregarThreads(
        rows.map(r => r.chamado.id),
        podeVerNota(c),
      )

      const items = rows.map(r =>
        toAppointment(r.chamado, r.responsavel, threads.get(r.chamado.id) ?? []),
      )
      const result = paginate(items, page, perPage, totais?.value ?? 0)
      return ok(c, result.items, result.meta)
    },
  )

  .get('/:id', param(idParam), async c => {
    const { chamado, responsavel } = await acharChamado(c, c.req.valid('param').id)
    const threads = await carregarThreads([chamado.id], podeVerNota(c))
    return ok(c, toAppointment(chamado, responsavel, threads.get(chamado.id) ?? []))
  })

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
        subject: input.subject,
        description: input.description,
        channel: input.channel,
        priority: input.priority,
        status: input.status,
        // Da mesma forma, o associado não escolhe quem vai atendê-lo.
        assignedUserId: proprio ? null : input.assignedUserId,
      })
      .returning()

    await recordAudit(c, {
      action: 'appointment.created',
      resource: 'appointment',
      resourceId: row!.id,
      metadata: { clientName: row!.clientName, channel: row!.channel },
    })
    return created(c, toAppointment(row!, null, []))
  })

  .patch(
    '/:id',
    requireTenantRole('admin', 'seller'),
    bloquearBalcao,
    param(idParam),
    json(updateAppointmentInput),
    async c => {
      const input = c.req.valid('json')
      const [row] = await db
        .update(appointments)
        .set({
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.subject !== undefined ? { subject: input.subject } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId } : {}),
          // Mexer no chamado É movimentação: sem isto a mesa ordenaria por
          // uma data que não acompanha o trabalho feito.
          lastInteractionAt: new Date(),
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

      const { responsavel } = await acharChamado(c, row.id)
      const threads = await carregarThreads([row.id], podeVerNota(c))
      return ok(c, toAppointment(row, responsavel, threads.get(row.id) ?? []))
    },
  )

  /**
   * Nova mensagem na thread. Nota interna é privilégio da equipe: se o
   * associado pudesse gravar `nota`, escreveria no canal que a tela esconde
   * dele — e leria de volta algo que nunca deveria ver.
   */
  .post('/:id/mensagens', param(idParam), json(createAppointmentMessageInput), async c => {
    const { id } = c.req.valid('param')
    const input = c.req.valid('json')
    const auth = c.get('auth')
    const proprio = escopoProprio(c)

    if (proprio && input.kind !== 'entrada') {
      throw AppError.forbidden('Associado só registra mensagem de entrada')
    }

    const { chamado } = await acharChamado(c, id)

    const [mensagem] = await db
      .insert(appointmentMessages)
      .values({
        appointmentId: chamado.id,
        kind: input.kind,
        title: input.title,
        body: input.body,
        authorUserId: auth?.user.id ?? null,
        authorName: auth?.user.name ?? null,
      })
      .returning()

    await db
      .update(appointments)
      .set({ lastInteractionAt: mensagem!.createdAt })
      .where(eq(appointments.id, chamado.id))

    await recordAudit(c, {
      action: 'appointment.message_added',
      resource: 'appointment',
      resourceId: chamado.id,
      metadata: { kind: input.kind },
    })
    return created(c, toMessage(mensagem!))
  })

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
function escopoProprio(c: Context<AppEnv>): string | undefined {
  const auth = c.get('auth')
  return auth?.membership.scope === 'tenant' && auth.membership.tenantRole === 'client'
    ? auth.user.id
    : undefined
}

/** Nota interna é da equipe. O associado recebe a thread sem elas. */
function podeVerNota(c: Context<AppEnv>): boolean {
  return escopoProprio(c) === undefined
}

async function acharChamado(c: Context<AppEnv>, id: string) {
  const proprio = escopoProprio(c)
  const filtros: SQL[] = [eq(appointments.organizationId, tenantOf(c).id), eq(appointments.id, id)]
  if (proprio) filtros.push(eq(appointments.clientUserId, proprio))

  const [row] = await db
    .select({ chamado: appointments, responsavel: user.name })
    .from(appointments)
    .leftJoin(user, eq(user.id, appointments.assignedUserId))
    .where(and(...filtros))
    .limit(1)

  if (!row) throw AppError.notFound('Atendimento')
  return row
}

/**
 * Carrega as threads de vários chamados numa consulta só. Buscar por chamado
 * faria a listagem de cinquenta linhas virar cinquenta e uma idas ao banco.
 */
async function carregarThreads(
  ids: string[],
  comNotas: boolean,
): Promise<Map<string, AppointmentMessage[]>> {
  const mapa = new Map<string, AppointmentMessage[]>()
  if (ids.length === 0) return mapa

  const filtros: SQL[] = [inArray(appointmentMessages.appointmentId, ids)]
  if (!comNotas) filtros.push(inArray(appointmentMessages.kind, ['entrada', 'saida']))

  const rows = await db
    .select()
    .from(appointmentMessages)
    .where(and(...filtros))
    .orderBy(asc(appointmentMessages.createdAt))

  for (const row of rows) {
    const lista = mapa.get(row.appointmentId) ?? []
    lista.push(toMessage(row))
    mapa.set(row.appointmentId, lista)
  }
  return mapa
}

function toMessage(row: typeof appointmentMessages.$inferSelect): AppointmentMessage {
  return {
    id: row.id,
    appointmentId: row.appointmentId,
    kind: row.kind,
    title: row.title,
    body: row.body,
    authorUserId: row.authorUserId,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
  }
}

function toAppointment(
  row: typeof appointments.$inferSelect,
  assignedName: string | null,
  messages: AppointmentMessage[],
): Appointment {
  return {
    id: row.id,
    tenantId: row.organizationId,
    clientUserId: row.clientUserId,
    clientName: row.clientName,
    subject: row.subject,
    description: row.description,
    channel: row.channel,
    priority: row.priority,
    status: row.status,
    assignedUserId: row.assignedUserId,
    assignedName,
    protocol: row.protocol,
    lastInteractionAt: row.lastInteractionAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    messages,
  }
}
