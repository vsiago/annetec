import {
  type ListPlatformBillingEventsQuery,
  type ListPlatformChargesQuery,
  type PageMeta,
  type PlatformBillingEvent,
  type PlatformCharge,
  type PlatformChargeDetail,
} from '@annetec/contracts'
import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { organization, platformBillingEvents, platformCharges } from '@/db/schema'
import { AppError } from '@/http/errors'
import { toPlatformCharge, toPlatformEvent, type PlatformChargeRow } from './presenter'
import { loadPlatformCharge, tenantRefOf } from './queries'
import { subscriptionDto } from './subscriptions.service'

/** Listas e detalhes do console da cobrança da plataforma. */

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`)
}

function meta(page: number, perPage: number, total: number): PageMeta {
  return { page, perPage, total, totalPages: Math.ceil(total / perPage) }
}

export async function listPlatformCharges(
  query: ListPlatformChargesQuery,
  scope: { organizationId?: string } = {},
): Promise<{ items: PlatformCharge[]; meta: PageMeta }> {
  const filters: (SQL | undefined)[] = [
    query.status ? eq(platformCharges.status, query.status) : undefined,
    query.kind ? eq(platformCharges.kind, query.kind) : undefined,
    query.method ? eq(platformCharges.method, query.method) : undefined,
    query.from ? gte(platformCharges.dueDate, query.from) : undefined,
    query.to ? lte(platformCharges.dueDate, query.to) : undefined,
    scope.organizationId ?? query.organizationId ? eq(platformCharges.organizationId, (scope.organizationId ?? query.organizationId)!) : undefined,
    query.subscriptionId ? eq(platformCharges.subscriptionId, query.subscriptionId) : undefined,
  ]
  if (query.q) {
    const like = `%${escapeLike(query.q)}%`
    filters.push(or(ilike(organization.name, like), ilike(organization.slug, like), ilike(platformCharges.description, like)))
  }
  const where = and(...filters.filter((f): f is SQL => Boolean(f)))

  const [rows, [total]] = await Promise.all([
    db
      .select({ charge: platformCharges, name: organization.name, slug: organization.slug })
      .from(platformCharges)
      .leftJoin(organization, eq(organization.id, platformCharges.organizationId))
      .where(where)
      .orderBy(desc(platformCharges.dueDate), desc(platformCharges.createdAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db
      .select({ value: count() })
      .from(platformCharges)
      .leftJoin(organization, eq(organization.id, platformCharges.organizationId))
      .where(where),
  ])
  return {
    items: rows.map(row => toPlatformCharge(row.charge, row.name && row.slug ? { name: row.name, slug: row.slug } : null)),
    meta: meta(query.page, query.perPage, Number(total?.value ?? 0)),
  }
}

export async function platformChargeDetail(chargeOrId: string | PlatformChargeRow, scope: { organizationId?: string } = {}): Promise<PlatformChargeDetail> {
  const charge = typeof chargeOrId === 'string' ? await loadPlatformCharge(chargeOrId) : chargeOrId
  if (scope.organizationId && charge.organizationId !== scope.organizationId) throw AppError.notFound('Fatura')
  const [tenant, events, subscription] = await Promise.all([
    tenantRefOf(charge.organizationId),
    db
      .select()
      .from(platformBillingEvents)
      .where(eq(platformBillingEvents.chargeId, charge.id))
      .orderBy(desc(platformBillingEvents.createdAt))
      .limit(100),
    charge.subscriptionId ? subscriptionDto(charge.subscriptionId).catch(() => null) : Promise.resolve(null),
  ])
  return { ...toPlatformCharge(charge, tenant), subscription, events: events.map(toPlatformEvent) }
}

export async function listPlatformEvents(query: ListPlatformBillingEventsQuery): Promise<{ items: PlatformBillingEvent[]; meta: PageMeta }> {
  const filters: (SQL | undefined)[] = [
    query.organizationId ? eq(platformBillingEvents.organizationId, query.organizationId) : undefined,
    query.subscriptionId ? eq(platformBillingEvents.subscriptionId, query.subscriptionId) : undefined,
    query.chargeId ? eq(platformBillingEvents.chargeId, query.chargeId) : undefined,
    query.proposalId ? eq(platformBillingEvents.proposalId, query.proposalId) : undefined,
    query.source ? eq(platformBillingEvents.source, query.source) : undefined,
    query.q ? ilike(platformBillingEvents.message, `%${escapeLike(query.q)}%`) : undefined,
  ]
  const where = and(...filters.filter((f): f is SQL => Boolean(f)))
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(platformBillingEvents)
      .where(where)
      .orderBy(desc(platformBillingEvents.createdAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage),
    db.select({ value: count() }).from(platformBillingEvents).where(where),
  ])
  return { items: rows.map(toPlatformEvent), meta: meta(query.page, query.perPage, Number(total?.value ?? 0)) }
}
