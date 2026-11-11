import {
  checkClubPlanConsistency,
  createBenefitInput,
  createClubPlanInput,
  createPartnerInput,
  effectivePaymentMethods,
  paginationQuery,
  partnerCategory,
  sortClubPlansForDisplay,
  updateBenefitInput,
  updateClubPlanInput,
  updatePartnerInput,
  type Benefit,
  type ClubPlan,
  type Partner,
  type UpdateClubPlanInput,
} from '@annetec/contracts'
import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '@/db/client'
import { benefits, clubPlans, clubSubscriptions, partners } from '@/db/schema'
import { AppError } from '@/http/errors'
import { requireAuth, requireTenantRole } from '@/http/middleware/auth'
import { resolveTenant, tenantOf } from '@/http/middleware/tenant'
import { created, noContent, ok, paginate } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { recordAudit } from '@/lib/audit'
import { json, param, query } from '@/http/validate'
import { loadBillingSettings } from '@/modules/club-billing/settings.service'

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
        const match = or(
          ilike(partners.name, term),
          ilike(partners.city, term),
          ilike(partners.tagline, term),
        )
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
        tagline: input.tagline,
        category: input.category,
        discountPercent: String(input.discountPercent),
        address: input.address,
        phone: input.phone,
        email: input.email,
        website: input.website,
        city: input.city,
        state: input.state,
        specialties: input.specialties,
        since: input.since,
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
          ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.discountPercent !== undefined
            ? { discountPercent: String(input.discountPercent) }
            : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.website !== undefined ? { website: input.website } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.specialties !== undefined ? { specialties: input.specialties } : {}),
          ...(input.since !== undefined ? { since: input.since } : {}),
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

  /**
   * Planos do clube — a vitrine comercial do INQUILINO, não o catálogo da
   * Digital Saúde (esse é `/catalogo/planos`, read-only e indexado por
   * `codigo`). Leitura para qualquer papel, porque o associado vê a vitrine;
   * escrita só para admin, porque preço é decisão comercial.
   */
  .get('/planos', async c => {
    const rows = await db.select().from(clubPlans).where(eq(clubPlans.organizationId, tenantOf(c).id))
    return ok(c, sortClubPlansForDisplay(rows.map(toClubPlan)))
  })

  .post('/planos', requireTenantRole('admin'), json(createClubPlanInput), async c => {
    const input = c.req.valid('json')
    const tenantId = tenantOf(c).id
    await assertClubPlanValid(tenantId, input)
    const [row] = await uniquePlanName(() =>
      db
        .insert(clubPlans)
        .values({ organizationId: tenantId, name: input.name, ...clubPlanColumns(input) })
        .returning(),
    )
    await recordAudit(c, {
      action: 'club_plan.created',
      resource: 'club_plan',
      resourceId: row!.id,
      metadata: { name: input.name, priceMonthly: input.priceMonthly },
    })
    return created(c, toClubPlan(row!))
  })

  .patch('/planos/:id', requireTenantRole('admin'), param(idParam), json(updateClubPlanInput), async c => {
    const input = c.req.valid('json')
    const tenantId = tenantOf(c).id
    const where = and(eq(clubPlans.organizationId, tenantId), eq(clubPlans.id, c.req.valid('param').id))
    const [current] = await db.select().from(clubPlans).where(where).limit(1)
    if (!current) throw AppError.notFound('Plano do clube')
    // Regras entre campos valem sobre o plano JÁ MESCLADO (atual + alterações).
    await assertClubPlanValid(tenantId, { ...toClubPlan(current), ...input })

    const [row] = await uniquePlanName(() =>
      db
        .update(clubPlans)
        .set({ ...clubPlanColumns(input), updatedAt: new Date() })
        .where(where)
        .returning(),
    )
    if (!row) throw AppError.notFound('Plano do clube')
    await recordAudit(c, {
      action: 'club_plan.updated',
      resource: 'club_plan',
      resourceId: row.id,
      metadata: { campos: Object.keys(input) },
    })
    return ok(c, toClubPlan(row))
  })

  .delete('/planos/:id', requireTenantRole('admin'), param(idParam), async c => {
    const { id } = c.req.valid('param')
    const tenantId = tenantOf(c).id
    // A FK `club_subscriptions.club_plan_id` é `set null`: excluir apagaria o
    // vínculo de quem já assinou (estatísticas, filtro por plano, portal).
    const [subscriptions] = await db
      .select({ total: count() })
      .from(clubSubscriptions)
      .where(and(eq(clubSubscriptions.organizationId, tenantId), eq(clubSubscriptions.clubPlanId, id)))
    if ((subscriptions?.total ?? 0) > 0) {
      throw AppError.conflict('Plano com assinaturas: inative em vez de excluir')
    }
    const [row] = await db
      .delete(clubPlans)
      .where(and(eq(clubPlans.organizationId, tenantId), eq(clubPlans.id, id)))
      .returning({ id: clubPlans.id })
    if (!row) throw AppError.notFound('Plano do clube')
    await recordAudit(c, { action: 'club_plan.deleted', resource: 'club_plan', resourceId: id })
    return noContent(c)
  })

export function toPartner(row: typeof partners.$inferSelect): Partner {
  return {
    id: row.id,
    tenantId: row.organizationId,
    name: row.name,
    tagline: row.tagline,
    category: row.category,
    discountPercent: Number(row.discountPercent),
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    city: row.city,
    state: row.state as Partner['state'],
    specialties: row.specialties,
    since: row.since,
    status: row.status,
  }
}

export function toBenefit(row: typeof benefits.$inferSelect): Benefit {
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

/** Número → texto do `numeric`; `null`/ausente viram `null` (dependentes inclusos). */
function numericOrNull(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value)
}

/** Texto opcional: vazio vira `null` (o formulário manda `''` quando o campo fica em branco). */
function textOrNull(value: string | null | undefined): string | null {
  return value === null || value === undefined || value.trim() === '' ? null : value
}

/** Lista opcional em que vazio = "sem restrição": grava `null`. */
function listOrNull<T>(value: readonly T[] | null | undefined): T[] | null {
  return value && value.length > 0 ? [...value] : null
}

/**
 * Entrada da API → colunas de `club_plans`, só com as chaves presentes (o
 * PATCH altera apenas o que veio; o POST recebe o objeto completo).
 */
export function clubPlanColumns(input: UpdateClubPlanInput): Partial<typeof clubPlans.$inferInsert> {
  const columns: Partial<typeof clubPlans.$inferInsert> = {}
  if (input.name !== undefined) columns.name = input.name
  if (input.description !== undefined) columns.description = input.description
  if (input.priceMonthly !== undefined) columns.priceMonthly = String(input.priceMonthly)
  if (input.features !== undefined) columns.features = input.features
  if (input.audience !== undefined) columns.audience = input.audience
  if (input.highlight !== undefined) columns.highlight = input.highlight
  if (input.upstreamPlanCodigo !== undefined) columns.upstreamPlanCodigo = input.upstreamPlanCodigo
  if (input.status !== undefined) columns.status = input.status
  if (input.priceDependentMonthly !== undefined) columns.priceDependentMonthly = numericOrNull(input.priceDependentMonthly)
  if (input.maxDependents !== undefined) columns.maxDependents = input.maxDependents
  if (input.tagline !== undefined) columns.tagline = textOrNull(input.tagline)
  if (input.badge !== undefined) columns.badge = textOrNull(input.badge)
  if (input.sortOrder !== undefined) columns.sortOrder = input.sortOrder
  if (input.includedDependents !== undefined) columns.includedDependents = input.includedDependents
  if (input.enrollmentFee !== undefined) columns.enrollmentFee = numericOrNull(input.enrollmentFee)
  if (input.enrollmentFeeWaived !== undefined) columns.enrollmentFeeWaived = input.enrollmentFeeWaived
  if (input.balcaoDescontoPercentual !== undefined) columns.balcaoDescontoPercentual = input.balcaoDescontoPercentual
  if (input.holderMinAge !== undefined) columns.holderMinAge = input.holderMinAge
  if (input.holderMaxAge !== undefined) columns.holderMaxAge = input.holderMaxAge
  if (input.dependentRules !== undefined) columns.dependentRules = listOrNull(input.dependentRules)
  if (input.coverages !== undefined) columns.coverages = input.coverages
  if (input.paymentMethods !== undefined) columns.paymentMethods = listOrNull(input.paymentMethods)
  if (input.loyaltyMonths !== undefined) columns.loyaltyMonths = input.loyaltyMonths
  if (input.cancellationPolicy !== undefined) columns.cancellationPolicy = textOrNull(input.cancellationPolicy)
  if (input.adjustmentPolicy !== undefined) columns.adjustmentPolicy = textOrNull(input.adjustmentPolicy)
  if (input.terms !== undefined) columns.terms = textOrNull(input.terms)
  return columns
}

/**
 * Regras entre campos (`checkClubPlanConsistency`) + plano ativo precisa de ao
 * menos uma forma de pagamento habilitada no clube. No PATCH, recebe o plano
 * já mesclado. Falha → 400 com `path` por campo.
 */
export async function assertClubPlanValid(tenantId: string, plan: Partial<ClubPlan>): Promise<void> {
  const issues = checkClubPlanConsistency(plan).map(({ path, message }) => ({ path, message }))
  if ((plan.status ?? 'active') === 'active' && plan.paymentMethods && plan.paymentMethods.length > 0) {
    const { enabledMethods } = await loadBillingSettings(tenantId)
    if (effectivePaymentMethods(plan, enabledMethods).length === 0) {
      issues.push({ path: 'paymentMethods', message: 'Nenhuma forma de pagamento do plano está habilitada no clube' })
    }
  }
  if (issues.length > 0) throw AppError.validation(issues)
}

/** Violação do índice único `club_plans_org_name_key` (pg 23505, às vezes embrulhada pelo drizzle). */
function isUniqueViolation(error: unknown): boolean {
  const code = (value: unknown) =>
    typeof value === 'object' && value !== null && 'code' in value ? (value as { code: unknown }).code : undefined
  return code(error) === '23505' || (error instanceof Error && code(error.cause) === '23505')
}

async function uniquePlanName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (isUniqueViolation(error)) throw AppError.conflict('Já existe um plano com este nome')
    throw error
  }
}

/** Exportada: o checkout do clube (club-billing), a vitrine e o portal devolvem os planos no mesmo formato. */
export function toClubPlan(row: typeof clubPlans.$inferSelect): ClubPlan {
  return {
    id: row.id,
    tenantId: row.organizationId,
    name: row.name,
    description: row.description,
    priceMonthly: Number(row.priceMonthly),
    features: row.features,
    audience: row.audience,
    highlight: row.highlight,
    upstreamPlanCodigo: row.upstreamPlanCodigo,
    status: row.status,
    priceDependentMonthly: row.priceDependentMonthly === null ? null : Number(row.priceDependentMonthly),
    maxDependents: row.maxDependents,
    tagline: row.tagline,
    badge: row.badge,
    sortOrder: row.sortOrder,
    includedDependents: row.includedDependents,
    enrollmentFee: row.enrollmentFee === null ? null : Number(row.enrollmentFee),
    enrollmentFeeWaived: row.enrollmentFeeWaived,
    balcaoDescontoPercentual: row.balcaoDescontoPercentual,
    holderMinAge: row.holderMinAge,
    holderMaxAge: row.holderMaxAge,
    dependentRules: row.dependentRules ?? null,
    coverages: row.coverages ?? [],
    paymentMethods: row.paymentMethods ?? null,
    loyaltyMonths: row.loyaltyMonths,
    cancellationPolicy: row.cancellationPolicy,
    adjustmentPolicy: row.adjustmentPolicy,
    terms: row.terms,
  }
}
