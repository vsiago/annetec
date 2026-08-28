import type {
  CreateInteractionInput,
  CreateLeadInput,
  CreateSaleInput,
  Lead,
  Sale,
  UpdateLeadInput,
  UpsertSalesGoalInput,
} from '@annetec/contracts'
import { and, count, desc, eq, gte, ilike, lte, or, sum, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { leadInteractions, leads, member, sales, salesGoals, sellerProfiles, user } from '@/db/schema'
import { AppError } from '@/http/errors'

/**
 * Funil comercial. Diferente de contratos e financeiro, aqui a Annetec é a
 * fonte da verdade: a Digital Saúde não conhece leads.
 *
 * A comissão é calculada no fechamento a partir da `commissionRate` vigente do
 * vendedor e congelada na venda — mudar a regra depois não pode reescrever o
 * histórico de quanto já foi pago.
 */
export const crmService = {
  async listLeads(params: {
    tenantId: string
    page: number
    perPage: number
    status?: string
    sellerId?: string
    search?: string
  }) {
    const filters: SQL[] = [eq(leads.organizationId, params.tenantId)]
    if (params.status) filters.push(eq(leads.status, params.status as 'new'))
    if (params.sellerId) filters.push(eq(leads.sellerId, params.sellerId))
    if (params.search) {
      const term = `%${params.search}%`
      const match = or(ilike(leads.name, term), ilike(leads.email, term), ilike(leads.phone, term))
      if (match) filters.push(match)
    }
    const where = and(...filters)

    const [rows, [totals]] = await Promise.all([
      db.query.leads.findMany({
        where,
        with: { interactions: true },
        orderBy: desc(leads.updatedAt),
        limit: params.perPage,
        offset: (params.page - 1) * params.perPage,
      }),
      db.select({ value: count() }).from(leads).where(where),
    ])

    return { items: rows.map(toLead), total: totals?.value ?? 0 }
  },

  async getLead(tenantId: string, id: string): Promise<Lead> {
    const row = await db.query.leads.findFirst({
      where: and(eq(leads.organizationId, tenantId), eq(leads.id, id)),
      with: { interactions: true },
    })
    if (!row) throw AppError.notFound('Lead')
    return toLead(row)
  },

  async createLead(tenantId: string, input: CreateLeadInput): Promise<Lead> {
    const [row] = await db
      .insert(leads)
      .values({
        organizationId: tenantId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        source: input.source,
        status: input.status,
        notes: input.notes,
        estimatedValue: input.estimatedValue === null ? null : String(input.estimatedValue),
        sellerId: input.sellerId,
      })
      .returning()
    return toLead({ ...row!, interactions: [] })
  },

  async updateLead(tenantId: string, id: string, input: UpdateLeadInput): Promise<Lead> {
    const [row] = await db
      .update(leads)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.sellerId !== undefined ? { sellerId: input.sellerId } : {}),
        ...(input.estimatedValue !== undefined
          ? { estimatedValue: input.estimatedValue === null ? null : String(input.estimatedValue) }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(leads.organizationId, tenantId), eq(leads.id, id)))
      .returning()

    if (!row) throw AppError.notFound('Lead')
    return this.getLead(tenantId, row.id)
  },

  async deleteLead(tenantId: string, id: string): Promise<void> {
    const deleted = await db
      .delete(leads)
      .where(and(eq(leads.organizationId, tenantId), eq(leads.id, id)))
      .returning({ id: leads.id })
    if (deleted.length === 0) throw AppError.notFound('Lead')
  },

  async addInteraction(
    tenantId: string,
    leadId: string,
    input: CreateInteractionInput,
    authorId: string | null,
  ): Promise<Lead> {
    await this.getLead(tenantId, leadId)
    await db.insert(leadInteractions).values({
      leadId,
      type: input.type,
      description: input.description,
      occurredAt: new Date(input.occurredAt),
      authorId,
    })
    await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, leadId))
    return this.getLead(tenantId, leadId)
  },

  async listSales(params: {
    tenantId: string
    page: number
    perPage: number
    sellerId?: string
    from?: string
    to?: string
  }) {
    const filters: SQL[] = [eq(sales.organizationId, params.tenantId)]
    if (params.sellerId) filters.push(eq(sales.sellerId, params.sellerId))
    if (params.from) filters.push(gte(sales.soldAt, new Date(params.from)))
    if (params.to) filters.push(lte(sales.soldAt, new Date(params.to)))
    const where = and(...filters)

    const [rows, [totals]] = await Promise.all([
      db
        .select({ sale: sales, sellerName: user.name })
        .from(sales)
        .innerJoin(user, eq(user.id, sales.sellerId))
        .where(where)
        .orderBy(desc(sales.soldAt))
        .limit(params.perPage)
        .offset((params.page - 1) * params.perPage),
      db.select({ value: count() }).from(sales).where(where),
    ])

    return {
      items: rows.map(row => toSale(row.sale, row.sellerName)),
      total: totals?.value ?? 0,
    }
  },

  async createSale(tenantId: string, input: CreateSaleInput): Promise<Sale> {
    const [seller] = await db
      .select({ name: user.name, rate: sellerProfiles.commissionRate })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .leftJoin(
        sellerProfiles,
        and(eq(sellerProfiles.userId, member.userId), eq(sellerProfiles.organizationId, member.organizationId)),
      )
      .where(and(eq(member.userId, input.sellerId), eq(member.organizationId, tenantId)))
      .limit(1)

    if (!seller) throw AppError.notFound('Vendedor')

    const rate = Number(seller.rate ?? 0)
    const commission = Number((input.value * rate).toFixed(2))

    const [row] = await db
      .insert(sales)
      .values({
        organizationId: tenantId,
        leadId: input.leadId,
        clientUserId: input.clientUserId,
        clientName: input.clientName,
        sellerId: input.sellerId,
        planCodigo: input.planCodigo,
        planName: input.planName,
        value: String(input.value),
        commission: String(commission),
        status: input.status,
        soldAt: new Date(input.soldAt),
        contractUpstreamCodigo: input.contractUpstreamCodigo,
      })
      .returning()

    // Fechar a venda encerra o lead de origem.
    if (input.leadId) {
      await db
        .update(leads)
        .set({ status: 'closed', updatedAt: new Date() })
        .where(and(eq(leads.organizationId, tenantId), eq(leads.id, input.leadId)))
    }

    return toSale(row!, seller.name)
  },

  /**
   * Metas por vendedor/mês. `achieved` não é coluna: é somado das vendas
   * confirmadas do período, para não existir número de meta divergente do
   * histórico real de vendas.
   */
  async listGoals(tenantId: string, params: { year: number; month?: number; sellerId?: string }) {
    const filters: SQL[] = [eq(salesGoals.organizationId, tenantId), eq(salesGoals.year, params.year)]
    if (params.month) filters.push(eq(salesGoals.month, params.month))
    if (params.sellerId) filters.push(eq(salesGoals.sellerId, params.sellerId))

    const rows = await db
      .select()
      .from(salesGoals)
      .where(and(...filters))

    return Promise.all(
      rows.map(async row => {
        const start = new Date(Date.UTC(row.year, row.month - 1, 1))
        const end = new Date(Date.UTC(row.year, row.month, 1))
        const [achieved] = await db
          .select({ total: sum(sales.value) })
          .from(sales)
          .where(
            and(
              eq(sales.organizationId, tenantId),
              eq(sales.sellerId, row.sellerId),
              eq(sales.status, 'confirmed'),
              gte(sales.soldAt, start),
              lte(sales.soldAt, end),
            ),
          )

        return {
          id: row.id,
          tenantId: row.organizationId,
          sellerId: row.sellerId,
          month: row.month,
          year: row.year,
          target: Number(row.target),
          achieved: Number(achieved?.total ?? 0),
          commissionRate: Number(row.commissionRate),
        }
      }),
    )
  },

  async upsertGoal(tenantId: string, input: UpsertSalesGoalInput) {
    await db
      .insert(salesGoals)
      .values({
        organizationId: tenantId,
        sellerId: input.sellerId,
        month: input.month,
        year: input.year,
        target: String(input.target),
        commissionRate: String(input.commissionRate),
      })
      .onConflictDoUpdate({
        target: [salesGoals.sellerId, salesGoals.year, salesGoals.month],
        set: { target: String(input.target), commissionRate: String(input.commissionRate) },
      })

    const [goal] = await this.listGoals(tenantId, {
      year: input.year,
      month: input.month,
      sellerId: input.sellerId,
    })
    return goal!
  },
}

type LeadRow = typeof leads.$inferSelect & { interactions: (typeof leadInteractions.$inferSelect)[] }

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    tenantId: row.organizationId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    source: row.source,
    status: row.status,
    notes: row.notes,
    estimatedValue: row.estimatedValue === null ? null : Number(row.estimatedValue),
    sellerId: row.sellerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    interactions: row.interactions.map(interaction => ({
      id: interaction.id,
      leadId: interaction.leadId,
      type: interaction.type,
      description: interaction.description,
      occurredAt: interaction.occurredAt.toISOString(),
      authorId: interaction.authorId,
    })),
  }
}

function toSale(row: typeof sales.$inferSelect, sellerName: string): Sale {
  return {
    id: row.id,
    tenantId: row.organizationId,
    leadId: row.leadId,
    clientUserId: row.clientUserId,
    clientName: row.clientName,
    sellerId: row.sellerId,
    sellerName,
    planCodigo: row.planCodigo,
    planName: row.planName,
    value: Number(row.value),
    commission: Number(row.commission),
    status: row.status,
    soldAt: row.soldAt.toISOString(),
    contractUpstreamCodigo: row.contractUpstreamCodigo,
  }
}
