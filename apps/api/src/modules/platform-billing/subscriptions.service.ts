import {
  effectivePlatformAccess,
  formatBRL,
  formatDateBR,
  onlyDigits,
  prorationItem,
  quotePlatformPlan,
  type ListPlatformSubscriptionsQuery,
  type MyPlatformSubscription,
  type PageMeta,
  type PlatformBillingAutomationReport,
  type PlatformEventSource,
  type PlatformSubscription,
  type PlatformSubscriptionDetail,
  type TenantPlatformAccess,
} from '@annetec/contracts'
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm'
import { db } from '@/db/client'
import { organization, platformBillingEvents, platformCharges, platformSubscriptions, tenantPlans } from '@/db/schema'
import { AppError } from '@/http/errors'
import { invalidatePlatformAccessCache } from '@/http/middleware/platform-access'
import { dueDayOf, todaySP } from '@/modules/club-billing/dates'
import { invalidateHoldingCache } from '@/modules/holding/cache'
import { platformInvoiceUrl } from './access-key'
import { runPlatformAutomationWhenFree } from './automation.service'
import { dunningDates, shiftDateBack, shiftInstantBack } from './automation.rules'
import { cancelPlatformAtGateway } from './charges.service'
import { mirrorTenantStatus, recordPlatformEvent } from './events.service'
import { countLives, countLivesByOrg } from './lives'
import { sendPlatformEmail } from './notify'
import {
  chargeAggregates,
  daysLateOf,
  OPEN_PLATFORM_CHARGE_STATUSES,
  subscriptionQuote,
  toPlatformCharge,
  toPlatformEvent,
  toPlatformSubscription,
  type ChargeAggregates,
  type PlatformChargeRow,
  type PlatformSubscriptionRow,
  type TenantRef,
} from './presenter'
import { getPlanOffer, listPlanOffers, planSnapshot } from './pricing.service'
import { findSubscriptionByOrg, loadPlatformSubscription, tenantRefOf } from './queries'
import { demoToolsAvailable, loadPlatformSettings, type ResolvedPlatformSettings } from './settings.service'

/**
 * Assinaturas de plataforma: leitura (console e "Minha assinatura"),
 * troca de plano, cancelamento/reativação manual e o atalho de demonstração
 * "avançar N dias".
 */

type SubWithOrg = { sub: PlatformSubscriptionRow; tenant: TenantRef }

async function openChargesBySubscription(ids: string[]): Promise<Map<string, PlatformChargeRow[]>> {
  const map = new Map<string, PlatformChargeRow[]>()
  if (ids.length === 0) return map
  const rows = await db
    .select()
    .from(platformCharges)
    .where(and(inArray(platformCharges.subscriptionId, ids), inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES)))
  for (const row of rows) {
    const list = map.get(row.subscriptionId!) ?? []
    list.push(row)
    map.set(row.subscriptionId!, list)
  }
  return map
}

async function planNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const map = new Map<string, string>()
  if (wanted.length === 0) return map
  const rows = await db.select({ id: tenantPlans.id, name: tenantPlans.name }).from(tenantPlans).where(inArray(tenantPlans.id, wanted))
  for (const row of rows) map.set(row.id, row.name)
  return map
}

export async function buildSubscriptionDtos(rows: SubWithOrg[], now = new Date()): Promise<PlatformSubscription[]> {
  if (rows.length === 0) return []
  const today = todaySP(now)
  const [lives, open, names] = await Promise.all([
    countLivesByOrg(),
    openChargesBySubscription(rows.map(r => r.sub.id)),
    planNames(rows.map(r => r.sub.scheduledPlanId)),
  ])
  return rows.map(({ sub, tenant }) =>
    toPlatformSubscription(sub, {
      tenant,
      lives: lives.get(sub.organizationId) ?? 0,
      aggregates: chargeAggregates(open.get(sub.id) ?? [], today),
      scheduledPlanName: sub.scheduledPlanId ? (names.get(sub.scheduledPlanId) ?? null) : null,
      today,
      now,
    }),
  )
}

async function subsWithOrg(where?: ReturnType<typeof eq>): Promise<SubWithOrg[]> {
  const query = db
    .select({ sub: platformSubscriptions, name: organization.name, slug: organization.slug })
    .from(platformSubscriptions)
    .innerJoin(organization, eq(organization.id, platformSubscriptions.organizationId))
  const rows = where ? await query.where(where) : await query
  return rows.map(row => ({ sub: row.sub, tenant: { name: row.name, slug: row.slug } }))
}

export async function subscriptionDto(id: string): Promise<PlatformSubscription> {
  const [row] = await subsWithOrg(eq(platformSubscriptions.id, id))
  if (!row) throw AppError.notFound('Assinatura')
  const [dto] = await buildSubscriptionDtos([row])
  return dto!
}

export async function subscriptionDtoByOrg(orgId: string): Promise<PlatformSubscription | null> {
  const [row] = await subsWithOrg(eq(platformSubscriptions.organizationId, orgId))
  if (!row) return null
  const [dto] = await buildSubscriptionDtos([row])
  return dto ?? null
}

/** Todas as assinaturas (volume pequeno: filtros e paginação em memória). */
export async function allSubscriptionDtos(now = new Date()): Promise<PlatformSubscription[]> {
  return buildSubscriptionDtos(await subsWithOrg(), now)
}

export async function listSubscriptions(
  query: ListPlatformSubscriptionsQuery,
): Promise<{ items: PlatformSubscription[]; meta: PageMeta }> {
  let items = await allSubscriptionDtos()
  if (query.status) items = items.filter(item => item.status === query.status)
  if (query.access) items = items.filter(item => item.access.level === query.access)
  if (query.planId) items = items.filter(item => item.planId === query.planId)
  if (query.q) {
    const text = query.q.toLowerCase()
    const digits = onlyDigits(query.q)
    items = items.filter(
      item =>
        item.tenantName.toLowerCase().includes(text) ||
        item.tenantSlug.toLowerCase().includes(text) ||
        (digits.length >= 3 && item.billingDocument.includes(digits)),
    )
  }
  const severity: Record<PlatformSubscription['status'], number> = { suspended: 0, restricted: 1, past_due: 2, active: 3, canceled: 4 }
  items.sort((a, b) => severity[a.status] - severity[b.status] || a.tenantName.localeCompare(b.tenantName, 'pt-BR'))
  const total = items.length
  const start = (query.page - 1) * query.perPage
  return {
    items: items.slice(start, start + query.perPage),
    meta: { page: query.page, perPage: query.perPage, total, totalPages: Math.ceil(total / query.perPage) },
  }
}

export async function subscriptionDetail(id: string): Promise<PlatformSubscriptionDetail> {
  const dto = await subscriptionDto(id)
  const tenant = { name: dto.tenantName, slug: dto.tenantSlug }
  const [charges, events] = await Promise.all([
    db.select().from(platformCharges).where(eq(platformCharges.subscriptionId, id)).orderBy(desc(platformCharges.dueDate), desc(platformCharges.createdAt)),
    db
      .select()
      .from(platformBillingEvents)
      .where(eq(platformBillingEvents.subscriptionId, id))
      .orderBy(desc(platformBillingEvents.createdAt))
      .limit(200),
  ])
  return { ...dto, charges: charges.map(row => toPlatformCharge(row, tenant)), events: events.map(toPlatformEvent) }
}

// ---------------------------------------------------------------------------
// Troca de plano
// ---------------------------------------------------------------------------

/**
 * Upgrade vale na hora (+ proporcional na PRÓXIMA fatura via
 * `pendingAdjustments`); downgrade (ou mesmo preço) agenda para a virada do
 * ciclo. Escolher o plano atual com troca agendada desfaz o agendamento.
 */
export async function changePlatformPlan(
  subscriptionId: string,
  planId: string,
  opts: { source: PlatformEventSource; actorUserId?: string | null; requireFullAccess?: boolean },
): Promise<void> {
  const sub = await loadPlatformSubscription(subscriptionId)
  if (sub.status === 'canceled') throw AppError.businessRule('Assinatura cancelada: reative antes de trocar de plano')
  if (opts.requireFullAccess && effectivePlatformAccess(sub).level !== 'full') {
    throw AppError.businessRule('Troca de plano só com o acesso ao painel em dia: regularize as faturas em aberto')
  }
  const offer = await getPlanOffer(planId)
  const now = new Date()
  const today = todaySP(now)

  if (offer.id === sub.planId) {
    if (!sub.scheduledPlanId) throw AppError.businessRule('Este já é o plano atual')
    await db.update(platformSubscriptions).set({ scheduledPlanId: null, updatedAt: now }).where(eq(platformSubscriptions.id, sub.id))
    await recordPlatformEvent(db, {
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      type: 'PLAN_CHANGED',
      source: opts.source,
      message: `Troca de plano agendada desfeita — segue no plano ${sub.planName}`,
      actorUserId: opts.actorUserId ?? null,
    })
    invalidateHoldingCache()
    return
  }

  const oldPrice = Number(sub.planPriceMonthly)
  if (offer.priceMonthly > oldPrice) {
    const proration =
      sub.currentPeriodStart && sub.currentPeriodEnd
        ? prorationItem({
            oldPlanName: sub.planName,
            newPlanName: offer.name,
            oldPrice,
            newPrice: offer.priceMonthly,
            periodStart: sub.currentPeriodStart,
            periodEnd: sub.currentPeriodEnd,
            changeDate: today,
          })
        : null
    await db.transaction(async tx => {
      const [locked] = await tx.select().from(platformSubscriptions).where(eq(platformSubscriptions.id, sub.id)).for('update').limit(1)
      await tx
        .update(platformSubscriptions)
        .set({
          ...planSnapshot(offer),
          scheduledPlanId: null,
          pendingAdjustments: [...(locked?.pendingAdjustments ?? []), ...(proration ? [proration] : [])],
          updatedAt: now,
        })
        .where(eq(platformSubscriptions.id, sub.id))
      await recordPlatformEvent(tx, {
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        type: 'PLAN_UPGRADED',
        source: opts.source,
        message: `Upgrade ${sub.planName} → ${offer.name} (${formatBRL(offer.priceMonthly)}/mês, até ${offer.memberLimit} vidas) — vale agora${proration ? `; proporcional de ${formatBRL(proration.amount)} na próxima fatura` : ''}`,
        payload: { fromPlanId: sub.planId, toPlanId: offer.id, proration: proration?.amount ?? 0 },
        actorUserId: opts.actorUserId ?? null,
      })
    })
  } else {
    await db.update(platformSubscriptions).set({ scheduledPlanId: offer.id, updatedAt: now }).where(eq(platformSubscriptions.id, sub.id))
    await recordPlatformEvent(db, {
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      type: 'PLAN_DOWNGRADE_SCHEDULED',
      source: opts.source,
      message: `Troca para o plano ${offer.name} (${formatBRL(offer.priceMonthly)}/mês) agendada para a virada do ciclo${sub.nextDueDate ? ` em ${formatDateBR(sub.nextDueDate)}` : ''}`,
      payload: { fromPlanId: sub.planId, toPlanId: offer.id },
      actorUserId: opts.actorUserId ?? null,
    })
  }
  invalidateHoldingCache()
}

// ---------------------------------------------------------------------------
// Cancelar / reativar (console)
// ---------------------------------------------------------------------------

/** Cancela a ASSINATURA (nunca o inquilino): faturas futuras em aberto são canceladas; vencidas seguem como dívida. */
export async function cancelPlatformSubscription(subscriptionId: string, reason: string, actorUserId: string | null): Promise<void> {
  const sub = await loadPlatformSubscription(subscriptionId)
  if (sub.status === 'canceled') throw AppError.businessRule('A assinatura já está cancelada')
  const now = new Date()
  const today = todaySP(now)
  const future = await db
    .select()
    .from(platformCharges)
    .where(and(eq(platformCharges.subscriptionId, sub.id), eq(platformCharges.status, 'pending')))
  for (const charge of future.filter(c => c.dueDate >= today)) await cancelPlatformAtGateway(charge)

  const changed = await db.transaction(async tx => {
    const [row] = await tx
      .update(platformSubscriptions)
      .set({ status: 'canceled', canceledAt: now, cancelReason: reason, scheduledPlanId: null, updatedAt: now })
      .where(and(eq(platformSubscriptions.id, sub.id), inArray(platformSubscriptions.status, ['active', 'past_due', 'restricted', 'suspended'])))
      .returning({ id: platformSubscriptions.id })
    if (!row) return false
    for (const charge of future.filter(c => c.dueDate >= today)) {
      await tx
        .update(platformCharges)
        .set({ status: 'canceled', canceledAt: now, updatedAt: now })
        .where(and(eq(platformCharges.id, charge.id), eq(platformCharges.status, 'pending')))
    }
    await mirrorTenantStatus(tx, sub.organizationId, 'suspended')
    await recordPlatformEvent(tx, {
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      type: 'SUBSCRIPTION_CANCELED',
      source: 'manual',
      message: `Assinatura da plataforma cancelada pelo console: ${reason}`,
      actorUserId,
    })
    return true
  })
  if (!changed) throw AppError.conflict('A assinatura mudou de situação; atualize a tela')

  invalidatePlatformAccessCache(sub.organizationId)
  invalidateHoldingCache()
  const tenant = await tenantRefOf(sub.organizationId)
  await sendPlatformEmail({
    template: 'platform_subscription_canceled',
    to: { email: sub.billingEmail, name: sub.billingName },
    data: { tenantName: tenant?.name ?? sub.billingName, reason },
    organizationId: sub.organizationId,
    relatedType: 'platform_subscription',
    relatedId: sub.id,
  })
}

/**
 * `canceled` → `active` (só manual). Exige nenhuma fatura VENCIDA em aberto
 * (senão a régua recancelaria na hora): receba (baixa manual) ou cancele antes.
 */
export async function reactivatePlatformSubscription(subscriptionId: string, actorUserId: string | null): Promise<void> {
  const sub = await loadPlatformSubscription(subscriptionId)
  if (sub.status !== 'canceled') throw AppError.businessRule('Só assinatura cancelada pode ser reativada (as demais voltam sozinhas ao pagar)')
  const now = new Date()
  const today = todaySP(now)
  const [overdue] = await db
    .select({ id: platformCharges.id })
    .from(platformCharges)
    .where(
      and(
        eq(platformCharges.subscriptionId, sub.id),
        inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES),
        lt(platformCharges.dueDate, today),
      ),
    )
    .limit(1)
  if (overdue) {
    throw AppError.businessRule('Há faturas vencidas em aberto: dê baixa (recebimento) ou cancele antes de reativar')
  }
  const nextDueDate = !sub.nextDueDate || sub.nextDueDate < today ? today : sub.nextDueDate
  const changed = await db.transaction(async tx => {
    const [row] = await tx
      .update(platformSubscriptions)
      .set({
        status: 'active',
        canceledAt: null,
        cancelReason: null,
        pastDueAt: null,
        restrictedAt: null,
        suspendedAt: null,
        reactivatedAt: now,
        nextDueDate,
        dueDay: nextDueDate === sub.nextDueDate ? sub.dueDay : dueDayOf(nextDueDate),
        updatedAt: now,
      })
      .where(and(eq(platformSubscriptions.id, sub.id), eq(platformSubscriptions.status, 'canceled')))
      .returning({ id: platformSubscriptions.id })
    if (!row) return false
    await mirrorTenantStatus(tx, sub.organizationId, 'active')
    await recordPlatformEvent(tx, {
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      type: 'SUBSCRIPTION_REACTIVATED',
      source: 'manual',
      message: `Assinatura reativada pelo console — próxima fatura em ${formatDateBR(nextDueDate)}`,
      actorUserId,
    })
    return true
  })
  if (!changed) throw AppError.conflict('A assinatura mudou de situação; atualize a tela')
  invalidatePlatformAccessCache(sub.organizationId)
  invalidateHoldingCache()
  const tenant = await tenantRefOf(sub.organizationId)
  await sendPlatformEmail({
    template: 'platform_access_reactivated',
    to: { email: sub.billingEmail, name: sub.billingName },
    data: { tenantName: tenant?.name ?? sub.billingName, reason: 'Assinatura reativada pela ANNETEC' },
    organizationId: sub.organizationId,
    relatedType: 'platform_subscription',
    relatedId: sub.id,
  })
}

// ---------------------------------------------------------------------------
// Demonstração: "avançar N dias"
// ---------------------------------------------------------------------------

/**
 * "O tempo passa" N dias para UMA assinatura: todas as datas dela e das
 * faturas dela recuam N dias (hoje fica onde está) e a automação roda em
 * seguida. Só com `PLATFORM_DEMO_TOOLS_ENABLED` e gateway simulado.
 * As faturas são movidas uma a uma, da mais antiga para a mais nova, para
 * nunca colidir no índice único (assinatura, início do período).
 */
export async function demoTimeTravel(
  subscriptionId: string,
  days: number,
  actorUserId: string | null,
): Promise<PlatformBillingAutomationReport> {
  const settings = await loadPlatformSettings()
  if (!demoToolsAvailable(settings)) {
    throw AppError.businessRule('"Avançar dias" só funciona com PLATFORM_DEMO_TOOLS_ENABLED e o gateway simulado')
  }
  const sub = await loadPlatformSubscription(subscriptionId)
  const charges = await db
    .select()
    .from(platformCharges)
    .where(eq(platformCharges.subscriptionId, sub.id))
    .orderBy(asc(platformCharges.dueDate), asc(platformCharges.createdAt))
  if (sub.gatewayProvider !== 'simulated' || charges.some(charge => charge.gatewayProvider !== 'simulated')) {
    throw AppError.businessRule('"Avançar dias" só vale para assinaturas e faturas do gateway simulado')
  }

  await db.transaction(async tx => {
    const nextDueDate = shiftDateBack(sub.nextDueDate, days)
    await tx
      .update(platformSubscriptions)
      .set({
        startedAt: shiftInstantBack(sub.startedAt, days),
        currentPeriodStart: shiftDateBack(sub.currentPeriodStart, days),
        currentPeriodEnd: shiftDateBack(sub.currentPeriodEnd, days),
        nextDueDate,
        dueDay: nextDueDate ? dueDayOf(nextDueDate) : sub.dueDay,
        pastDueAt: shiftInstantBack(sub.pastDueAt, days),
        restrictedAt: shiftInstantBack(sub.restrictedAt, days),
        suspendedAt: shiftInstantBack(sub.suspendedAt, days),
        canceledAt: shiftInstantBack(sub.canceledAt, days),
        reactivatedAt: shiftInstantBack(sub.reactivatedAt, days),
        accessOverrideUntil: shiftInstantBack(sub.accessOverrideUntil, days),
        accessOverrideAt: shiftInstantBack(sub.accessOverrideAt, days),
        monthlyDiscountUntil: shiftDateBack(sub.monthlyDiscountUntil, days),
        updatedAt: new Date(),
      })
      .where(eq(platformSubscriptions.id, sub.id))

    const ordered = [...charges].sort(
      (a, b) => (a.periodStart ?? a.dueDate).localeCompare(b.periodStart ?? b.dueDate) || a.createdAt.getTime() - b.createdAt.getTime(),
    )
    for (const charge of ordered) {
      await tx
        .update(platformCharges)
        .set({
          dueDate: shiftDateBack(charge.dueDate, days)!,
          periodStart: shiftDateBack(charge.periodStart, days),
          periodEnd: shiftDateBack(charge.periodEnd, days),
          paidAt: shiftInstantBack(charge.paidAt, days),
          canceledAt: shiftInstantBack(charge.canceledAt, days),
          refundedAt: shiftInstantBack(charge.refundedAt, days),
          lastAttemptAt: shiftInstantBack(charge.lastAttemptAt, days),
          reminderSentAt: shiftInstantBack(charge.reminderSentAt, days),
          overdueNotifiedAt: shiftInstantBack(charge.overdueNotifiedAt, days),
        })
        .where(eq(platformCharges.id, charge.id))
    }
    await recordPlatformEvent(tx, {
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      type: 'DEMO_TIME_TRAVEL',
      source: 'manual',
      gatewayProvider: 'simulated',
      message: `Demonstração: +${days} dia(s) — datas da assinatura e de ${charges.length} fatura(s) recuaram ${days} dia(s)`,
      payload: { days, charges: charges.length },
      actorUserId,
    })
  })

  invalidatePlatformAccessCache(sub.organizationId)
  invalidateHoldingCache()
  return runPlatformAutomationWhenFree()
}

// ---------------------------------------------------------------------------
// Painel do inquilino: acesso e "Minha assinatura ANNETEC"
// ---------------------------------------------------------------------------

const UNMANAGED_ACCESS: TenantPlatformAccess = {
  managed: false,
  level: 'full',
  status: null,
  source: null,
  message: null,
  openAmount: 0,
  oldestOpenDueDate: null,
  daysLate: 0,
  restrictsOn: null,
  suspendsOn: null,
  payUrl: null,
  payChargeId: null,
}

/**
 * Frase do banner (pt-BR); `null` quando está tudo em dia. ÚNICA fonte do
 * texto (o 403 do guard e o banner/tela de bloqueio do painel exibem só ela):
 * já traz valor em aberto, atraso e o próximo degrau — a tela não acrescenta
 * nada para não repetir.
 */
export function accessMessage(
  sub: Pick<PlatformSubscriptionRow, 'status' | 'accessOverride' | 'accessOverrideUntil' | 'restrictedAt' | 'suspendedAt' | 'canceledAt'>,
  aggregates: ChargeAggregates,
  steps: { restrictsOn: string | null; suspendsOn: string | null },
  today: string,
  now: Date = new Date(),
): string | null {
  const access = effectivePlatformAccess(sub, now)
  const late = daysLateOf(aggregates.oldestOverdueDueDate, today)
  const amount = formatBRL(aggregates.openAmount)
  const openNote = aggregates.openAmount > 0 ? ` Há ${amount} em aberto.` : ''
  if (access.source === 'override') {
    const until = sub.accessOverrideUntil ? ` até ${formatDateBR(todaySP(sub.accessOverrideUntil))}` : ''
    if (access.level === 'blocked') return `Painel bloqueado por decisão da operadora${until}.${openNote} Fale com a operadora para regularizar.`
    if (access.level === 'read_only') return `Painel em modo somente leitura por decisão da operadora${until}.${openNote}`
    return late > 0 ? `Acesso liberado pela operadora${until}. Há ${amount} em faturas vencidas: regularize para evitar novo bloqueio.` : null
  }
  switch (sub.status) {
    case 'canceled':
      return `A assinatura da plataforma foi cancelada${sub.canceledAt ? ` em ${formatDateBR(todaySP(sub.canceledAt))}` : ''}.${openNote} Fale com a operadora para reativar.`
    case 'suspended':
      return `Painel bloqueado${sub.suspendedAt ? ` desde ${formatDateBR(todaySP(sub.suspendedAt))}` : ''} por falta de pagamento (${amount} em aberto, ${late} dia(s) de atraso). Pague a fatura para liberar o acesso na hora.`
    case 'restricted':
      return `Painel em modo somente leitura por fatura vencida há ${late} dia(s) (${amount} em aberto).${steps.suspendsOn ? ` Se não houver pagamento, o painel será bloqueado em ${formatDateBR(steps.suspendsOn)}.` : ''}`
    default:
      if (late <= 0) return null
      return `Fatura da plataforma vencida há ${late} dia(s) (${amount} em aberto).${steps.restrictsOn ? ` Sem pagamento, o painel fica somente leitura em ${formatDateBR(steps.restrictsOn)}.` : ''}`
  }
}

export function buildTenantAccess(
  sub: PlatformSubscriptionRow,
  openCharges: PlatformChargeRow[],
  settings: Pick<ResolvedPlatformSettings, 'restrictAfterDays' | 'suspendAfterDays' | 'cancelAfterDays'>,
  now: Date = new Date(),
): TenantPlatformAccess {
  const today = todaySP(now)
  const aggregates = chargeAggregates(openCharges, today)
  const access = effectivePlatformAccess(sub, now)
  const steps = dunningDates(aggregates.oldestOverdueDueDate, settings)
  const escalates = sub.status === 'active' || sub.status === 'past_due'
  return {
    managed: true,
    level: access.level,
    status: sub.status,
    source: access.source,
    message: accessMessage(sub, aggregates, steps, today, now),
    openAmount: aggregates.openAmount,
    oldestOpenDueDate: aggregates.oldestOpenDueDate,
    daysLate: daysLateOf(aggregates.oldestOverdueDueDate, today),
    restrictsOn: escalates ? steps.restrictsOn : null,
    suspendsOn: escalates || sub.status === 'restricted' ? steps.suspendsOn : null,
    payUrl: aggregates.oldestOpenChargeId ? platformInvoiceUrl(aggregates.oldestOpenChargeId) : null,
    payChargeId: aggregates.oldestOpenChargeId,
  }
}

async function openChargesOf(subscriptionId: string): Promise<PlatformChargeRow[]> {
  return db
    .select()
    .from(platformCharges)
    .where(and(eq(platformCharges.subscriptionId, subscriptionId), inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES)))
    .orderBy(asc(platformCharges.dueDate))
}

export async function tenantAccess(orgId: string): Promise<TenantPlatformAccess> {
  const sub = await findSubscriptionByOrg(orgId)
  if (!sub) return UNMANAGED_ACCESS
  const [open, settings] = await Promise.all([openChargesOf(sub.id), loadPlatformSettings()])
  return buildTenantAccess(sub, open, settings)
}

export async function mySubscription(orgId: string): Promise<MyPlatformSubscription> {
  const sub = await findSubscriptionByOrg(orgId)
  if (!sub) {
    return {
      managed: false,
      subscription: null,
      access: UNMANAGED_ACCESS,
      usage: null,
      currentQuote: null,
      nextCharge: null,
      openCharges: [],
      recentCharges: [],
      upgradeOptions: [],
    }
  }
  const now = new Date()
  const today = todaySP(now)
  const [tenant, lives, settings, recent, open, offers] = await Promise.all([
    tenantRefOf(orgId),
    countLives(orgId),
    loadPlatformSettings(),
    db.select().from(platformCharges).where(eq(platformCharges.subscriptionId, sub.id)).orderBy(desc(platformCharges.dueDate), desc(platformCharges.createdAt)).limit(12),
    openChargesOf(sub.id),
    listPlanOffers(),
  ])
  const ref = tenant ?? { name: sub.billingName, slug: '' }
  const names = sub.scheduledPlanId ? await planNames([sub.scheduledPlanId]) : new Map<string, string>()
  const subscription = toPlatformSubscription(sub, {
    tenant: ref,
    lives,
    aggregates: chargeAggregates(open, today),
    scheduledPlanName: sub.scheduledPlanId ? (names.get(sub.scheduledPlanId) ?? null) : null,
    today,
    now,
  })
  const quote = subscriptionQuote(sub, lives)
  const next = open.find(charge => charge.status === 'pending' && charge.dueDate >= today) ?? null
  const currentPrice = Number(sub.planPriceMonthly)
  return {
    managed: true,
    subscription,
    access: buildTenantAccess(sub, open, settings, now),
    usage: {
      lives,
      memberLimit: quote.memberLimit,
      usagePct: quote.usagePct,
      extraLives: quote.extraLives,
      projectedOverage: quote.overageTotal,
    },
    currentQuote: quote,
    nextCharge: next ? toPlatformCharge(next, ref) : null,
    openCharges: open.map(charge => toPlatformCharge(charge, ref)),
    recentCharges: recent.map(charge => toPlatformCharge(charge, ref)),
    upgradeOptions: offers
      .filter(offer => offer.pricing.publicVisible || offer.id === sub.planId)
      .map(offer => ({
        plan: offer,
        quote: quotePlatformPlan(offer, offer.pricing, lives),
        isCurrent: offer.id === sub.planId,
        isUpgrade: offer.priceMonthly > currentPrice,
      })),
  }
}
