import {
  ERROR_CODES,
  onlyDigits,
  type ClubCharge,
  type ClubChargeDetail,
  type ListClubChargesQuery,
  type ListPaymentEventsQuery,
  type MyClubMembership,
} from '@annetec/contracts'
import { and, asc, count, desc, eq, gte, ilike, inArray, like, lte, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubCharges, clubPlans, clubSubscriptionDependents, clubSubscriptions, paymentEvents } from '@/db/schema'
import { AppError } from '@/http/errors'
import { paginate } from '@/http/respond'
import { toClubPlan } from '@/modules/network/controller'
import { syncChargeIfStale } from './charges.service'
import { todaySP } from './dates'
import {
  OPEN_CHARGE_STATUSES,
  cardStatusOf,
  isOpenCharge,
  toClubCharge,
  toPaymentEvent,
  type ChargeRow,
} from './presenter'
import { buildSubscriptionDtos, escapeLike } from './subscriptions.service'

/** Leituras do painel e do portal (listas, detalhe, timeline). */

const PORTAL_SYNC_INTERVAL_MS = 3_000

export const queriesService = {
  async listCharges(orgId: string, query: ListClubChargesQuery) {
    const conditions: SQL[] = [eq(clubCharges.organizationId, orgId)]
    if (query.status) conditions.push(eq(clubCharges.status, query.status))
    if (query.method) conditions.push(eq(clubCharges.method, query.method))
    if (query.from) conditions.push(gte(clubCharges.dueDate, query.from))
    if (query.to) conditions.push(lte(clubCharges.dueDate, query.to))
    if (query.subscriptionId) conditions.push(eq(clubCharges.subscriptionId, query.subscriptionId))
    if (query.q) {
      const term = `%${escapeLike(query.q)}%`
      const digits = onlyDigits(query.q)
      const matches: SQL[] = [
        ilike(clubSubscriptions.holderName, term),
        ilike(clubSubscriptions.holderEmail, term),
        ilike(clubSubscriptions.planName, term),
        ilike(clubSubscriptions.cardNumber, term),
      ]
      if (digits.length >= 3) matches.push(like(clubSubscriptions.holderCpf, `%${digits}%`))
      conditions.push(or(...matches)!)
    }
    const where = and(...conditions)

    const [totals] = await db
      .select({ total: count() })
      .from(clubCharges)
      .innerJoin(clubSubscriptions, eq(clubSubscriptions.id, clubCharges.subscriptionId))
      .where(where)
    const rows = await db
      .select({ charge: clubCharges, holderName: clubSubscriptions.holderName, planName: clubSubscriptions.planName })
      .from(clubCharges)
      .innerJoin(clubSubscriptions, eq(clubSubscriptions.id, clubCharges.subscriptionId))
      .where(where)
      .orderBy(desc(clubCharges.dueDate), desc(clubCharges.createdAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage)

    return paginate(
      rows.map(row => toClubCharge(row.charge, row)),
      query.page,
      query.perPage,
      totals?.total ?? 0,
    )
  },

  async chargeDetail(orgId: string, chargeId: string): Promise<ClubChargeDetail> {
    const [row] = await db
      .select({ charge: clubCharges, sub: clubSubscriptions })
      .from(clubCharges)
      .innerJoin(clubSubscriptions, eq(clubSubscriptions.id, clubCharges.subscriptionId))
      .where(and(eq(clubCharges.id, chargeId), eq(clubCharges.organizationId, orgId)))
      .limit(1)
    if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Cobrança não encontrada')
    const [[subscription], events] = await Promise.all([
      buildSubscriptionDtos([row.sub]),
      db
        .select()
        .from(paymentEvents)
        .where(eq(paymentEvents.chargeId, chargeId))
        .orderBy(desc(paymentEvents.createdAt))
        .limit(200),
    ])
    return { ...toClubCharge(row.charge, row.sub), subscription: subscription!, events: events.map(toPaymentEvent) }
  },

  async chargeDto(charge: ChargeRow): Promise<ClubCharge> {
    const [sub] = await db
      .select({ holderName: clubSubscriptions.holderName, planName: clubSubscriptions.planName })
      .from(clubSubscriptions)
      .where(eq(clubSubscriptions.id, charge.subscriptionId))
      .limit(1)
    return toClubCharge(charge, sub ?? { holderName: '', planName: '' })
  },

  async listEvents(orgId: string, query: ListPaymentEventsQuery) {
    const conditions: SQL[] = [eq(paymentEvents.organizationId, orgId)]
    if (query.subscriptionId) conditions.push(eq(paymentEvents.subscriptionId, query.subscriptionId))
    if (query.chargeId) conditions.push(eq(paymentEvents.chargeId, query.chargeId))
    if (query.source) conditions.push(eq(paymentEvents.source, query.source))
    if (query.q) conditions.push(ilike(paymentEvents.message, `%${escapeLike(query.q)}%`))
    const where = and(...conditions)
    const [totals] = await db.select({ total: count() }).from(paymentEvents).where(where)
    const rows = await db
      .select()
      .from(paymentEvents)
      .where(where)
      .orderBy(desc(paymentEvents.createdAt))
      .limit(query.perPage)
      .offset((query.page - 1) * query.perPage)
    return paginate(rows.map(toPaymentEvent), query.page, query.perPage, totals?.total ?? 0)
  },

  // -------------------------------------------------------------------------
  // Portal do associado (tudo filtrado pelo usuário da sessão)
  // -------------------------------------------------------------------------

  /** Sincroniza as cobranças abertas do associado (máx. 1×/3 s por cobrança) — Pix confirma no portal sem esperar o timer. */
  async syncOpenChargesOfUser(orgId: string, userId: string): Promise<void> {
    const open = await db
      .select({ charge: clubCharges })
      .from(clubCharges)
      .innerJoin(clubSubscriptions, eq(clubSubscriptions.id, clubCharges.subscriptionId))
      .where(
        and(
          eq(clubCharges.organizationId, orgId),
          eq(clubSubscriptions.userId, userId),
          inArray(clubCharges.status, ['pending', 'overdue']),
          sql`${clubCharges.gatewayChargeId} is not null`,
        ),
      )
      .limit(10)
    for (const { charge } of open) {
      await syncChargeIfStale(charge, PORTAL_SYNC_INTERVAL_MS, 'automation')
    }
  },

  async myCharges(orgId: string, userId: string): Promise<ClubCharge[]> {
    const rows = await db
      .select({ charge: clubCharges, holderName: clubSubscriptions.holderName, planName: clubSubscriptions.planName })
      .from(clubCharges)
      .innerJoin(clubSubscriptions, eq(clubSubscriptions.id, clubCharges.subscriptionId))
      .where(and(eq(clubCharges.organizationId, orgId), eq(clubSubscriptions.userId, userId)))
      .orderBy(desc(clubCharges.dueDate), desc(clubCharges.createdAt))
      .limit(200)
    return rows.map(row => toClubCharge(row.charge, row))
  },

  /** Cobrança do próprio associado (404 se for de outra pessoa). */
  async myCharge(orgId: string, userId: string, chargeId: string): Promise<ChargeRow> {
    const [row] = await db
      .select({ charge: clubCharges })
      .from(clubCharges)
      .innerJoin(clubSubscriptions, eq(clubSubscriptions.id, clubCharges.subscriptionId))
      .where(and(eq(clubCharges.id, chargeId), eq(clubCharges.organizationId, orgId), eq(clubSubscriptions.userId, userId)))
      .limit(1)
    if (!row) throw new AppError(ERROR_CODES.NOT_FOUND, 'Cobrança não encontrada')
    return row.charge
  },

  /** Assinatura não cancelada mais recente; senão a mais recente. `null` sem assinatura. */
  async myMembership(orgId: string, userId: string): Promise<MyClubMembership | null> {
    const subs = await db
      .select()
      .from(clubSubscriptions)
      .where(and(eq(clubSubscriptions.organizationId, orgId), eq(clubSubscriptions.userId, userId)))
      .orderBy(desc(clubSubscriptions.createdAt))
      .limit(20)
    const sub = subs.find(row => row.status !== 'canceled') ?? subs[0]
    if (!sub) return null

    const today = todaySP()
    const [[subscription], dependents, charges, [planRow]] = await Promise.all([
      buildSubscriptionDtos([sub], today),
      db
        .select()
        .from(clubSubscriptionDependents)
        .where(eq(clubSubscriptionDependents.subscriptionId, sub.id))
        .orderBy(asc(clubSubscriptionDependents.position)),
      db
        .select()
        .from(clubCharges)
        .where(and(eq(clubCharges.subscriptionId, sub.id), inArray(clubCharges.status, OPEN_CHARGE_STATUSES)))
        .orderBy(asc(clubCharges.dueDate)),
      // Plano ATUAL (coberturas, carências, regras); preço e nome contratados
      // continuam sendo o retrato da assinatura.
      sub.clubPlanId
        ? db
            .select()
            .from(clubPlans)
            .where(and(eq(clubPlans.id, sub.clubPlanId), eq(clubPlans.organizationId, orgId)))
            .limit(1)
        : Promise.resolve([]),
    ])

    const status = cardStatusOf(sub.status)
    const validSince = sub.startedAt ? sub.startedAt.toISOString() : null
    const openCharges = charges.filter(charge => isOpenCharge(charge.status)).map(charge => toClubCharge(charge, sub))

    return {
      subscription: subscription!,
      cards: [
        {
          kind: 'titular',
          dependentId: null,
          name: sub.holderName,
          cpf: sub.holderCpf,
          birthDate: sub.holderBirthDate,
          relationship: null,
          cardNumber: sub.cardNumber,
          planName: sub.planName,
          status,
          validSince,
        },
        ...dependents.map(dependent => ({
          kind: 'dependente' as const,
          dependentId: dependent.id,
          name: dependent.name,
          cpf: dependent.cpf,
          birthDate: dependent.birthDate,
          relationship: dependent.relationship,
          cardNumber: dependent.cardNumber,
          planName: sub.planName,
          status,
          validSince,
        })),
      ],
      nextCharge: openCharges[0] ?? null,
      openCharges,
      plan: planRow ? toClubPlan(planRow) : null,
    }
  },
}
