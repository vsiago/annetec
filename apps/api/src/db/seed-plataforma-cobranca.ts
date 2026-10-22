import { randomUUID } from 'node:crypto'
import {
  CLUB_PAYMENT_METHOD_LABELS,
  activationChargeItems,
  formatBRL,
  formatDateBR,
  onlyDigits,
  sumChargeItems,
  type PlatformChargeItem,
} from '@annetec/contracts'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { db, sql } from './client'
import {
  organization,
  platformBillingEvents,
  platformCharges,
  platformSubscriptions,
  tenantPlanPrices,
  tenantPlans,
  tenantProfiles,
} from './schema'
import { addDays, addMonthsOnDueDay, monthLabel, noonSP, todaySP } from '@/modules/club-billing/dates'
import { platformReference } from '@/modules/platform-billing/access-key'
import { buildMonthlyCharge, nextPlatformCycleStart, platformCyclePeriod } from '@/modules/platform-billing/automation.rules'
import { platformGatewayFor } from '@/modules/platform-billing/gateway'
import { countLives } from '@/modules/platform-billing/lives'
import { getPlanOffer, planSnapshot } from '@/modules/platform-billing/pricing.service'

// Trava de produção: seeds/scripts de demonstração gravam contas com senha
// trivial e dados fictícios. Em produção só rodam com liberação explícita.
// (Avaliado depois dos imports — `./client` só conecta na primeira query.)
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== '1') {
  console.error(
    `[seed-plataforma-cobranca] Abortado: NODE_ENV=production. Este script não roda em produção.\n` +
      'Se for mesmo intencional, rode de novo com ALLOW_SEED_IN_PRODUCTION=1.',
  )
  process.exit(1)
}

/**
 * Seed `demo:plataforma` (blueprint da plataforma §0.9) — NUNCA toca em
 * `mepcard`/`annetec`. Idempotente.
 *
 *   pnpm --filter @annetec/api demo:plataforma            # cria
 *   pnpm --filter @annetec/api demo:plataforma --limpar   # apaga só a assinatura seed do mapcard2
 *
 * (a) Preços dos planos ANNETEC (`tenant_plan_prices`): insere SÓ os que
 *     faltam (nunca sobrescreve): adesão = mensalidade; excedente por vida =
 *     max(0,50; mensalidade ÷ limite × 1,3); selo "mais escolhido" no plano de
 *     preço mediano (se nenhum tiver selo).
 * (b) Assinatura de plataforma APENAS do `mapcard2` (trava dura no slug),
 *     `source: 'seed'`: início há 5 meses, vencimento dia 10, ativação paga +
 *     5 mensalidades pagas + 1 aberta (Pix simulado que só compensa pelo botão,
 *     vence no 1º dia do próximo período — a mesma regra da automação). Se o mapcard2 já tiver assinatura, não mexe.
 */

const SLUG = 'mapcard2'
const FORBIDDEN = new Set(['mepcard', 'annetec'])
const DUE_DAY = 10

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

async function seedPrices(): Promise<number> {
  const plans = await db.select().from(tenantPlans).orderBy(asc(tenantPlans.priceMonthly))
  if (plans.length === 0) return 0
  const existing = await db
    .select({ planId: tenantPlanPrices.planId, highlight: tenantPlanPrices.highlight })
    .from(tenantPlanPrices)
    .where(inArray(tenantPlanPrices.planId, plans.map(plan => plan.id)))
  const priced = new Set(existing.map(row => row.planId))
  const hasHighlight = existing.some(row => row.highlight)
  const median = plans[Math.floor((plans.length - 1) / 2)]!

  let inserted = 0
  for (const [index, plan] of plans.entries()) {
    if (priced.has(plan.id)) continue
    const price = Number(plan.priceMonthly)
    const perLife = Math.max(0.5, round2((price / Math.max(1, plan.memberLimit)) * 1.3))
    const rows = await db
      .insert(tenantPlanPrices)
      .values({
        planId: plan.id,
        setupFee: String(price),
        pricePerExtraLife: String(perLife),
        revenueSharePercent: '0',
        publicVisible: true,
        highlight: !hasHighlight && plan.id === median.id,
        sortOrder: index + 1,
      })
      .onConflictDoNothing()
      .returning({ planId: tenantPlanPrices.planId })
    if (rows.length > 0) {
      inserted += 1
      console.log(`  preço: ${plan.name} · adesão ${formatBRL(price)} · excedente ${formatBRL(perLife)}/vida${!hasHighlight && plan.id === median.id ? ' · mais escolhido' : ''}`)
    }
  }
  return inserted
}

async function findTenant() {
  const [tenant] = await db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      planId: tenantProfiles.planId,
      legalName: tenantProfiles.legalName,
      document: tenantProfiles.document,
      email: tenantProfiles.email,
    })
    .from(organization)
    .innerJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
    .where(eq(organization.slug, SLUG))
    .limit(1)
  if (tenant && (tenant.slug !== SLUG || FORBIDDEN.has(tenant.slug))) throw new Error(`Seed travado no slug ${SLUG}`)
  return tenant ?? null
}

/** Próximo dia 10 depois de hoje (início do ciclo em aberto). */
async function seedSubscription(): Promise<void> {
  const tenant = await findTenant()
  if (!tenant) {
    console.log(`  inquilino "${SLUG}" não existe — nada a fazer na assinatura`)
    return
  }
  const [existing] = await db
    .select({ id: platformSubscriptions.id, source: platformSubscriptions.source })
    .from(platformSubscriptions)
    .where(eq(platformSubscriptions.organizationId, tenant.id))
    .limit(1)
  if (existing) {
    console.log(
      existing.source === 'seed'
        ? `  ${SLUG} já tem a assinatura de demonstração (${existing.id}) — nada a fazer`
        : `  ${SLUG} já tem assinatura de plataforma REAL (${existing.source}) — o seed não mexe`,
    )
    return
  }

  const [cheapest] = await db.select({ id: tenantPlans.id }).from(tenantPlans).orderBy(asc(tenantPlans.priceMonthly)).limit(1)
  const planId = tenant.planId ?? cheapest?.id
  if (!planId) {
    console.log('  nenhum plano ANNETEC cadastrado — assinatura não criada')
    return
  }
  const offer = await getPlanOffer(planId)
  const lives = await countLives(tenant.id)
  const today = todaySP()
  // Mesma regra da automação: a fatura do ciclo vence no 1º dia do período
  // (antes era "hoje + 4", o que deixava a mensalidade vencendo antes do
  // período que ela paga — ex.: vence 01/10, cobre 10/10–10/11).
  const { periodStart: openStart, periodEnd: openEnd, dueDate: openDue } = platformCyclePeriod(
    nextPlatformCycleStart(today, DUE_DAY),
    DUE_DAY,
  )
  const firstMonthly = addMonthsOnDueDay(openStart, -5, DUE_DAY)
  const startDate = addMonthsOnDueDay(today, -5, Math.min(Number(today.slice(8, 10)), 28))
  const retrato = {
    planName: offer.name,
    planPriceMonthly: offer.priceMonthly,
    memberLimit: offer.memberLimit,
    pricePerExtraLife: offer.pricing.pricePerExtraLife,
    revenueSharePercent: 0,
  }
  const gateway = platformGatewayFor('simulated', 'passive')
  const billingDocument = onlyDigits(tenant.document)
  const customerId = await gateway.ensureCustomer({
    name: tenant.legalName,
    cpf: billingDocument,
    email: tenant.email,
    externalReference: tenant.id,
  })

  // Fatura em aberto: Pix simulado de verdade (BR Code + QR), que só compensa pelo botão.
  const openId = randomUUID()
  const open = buildMonthlyCharge(retrato, { lives, clubRevenue: 0, periodStart: openStart })
  const openDescription = `ANNETEC · ${tenant.name} · Plano ${offer.name} · ${monthLabel(openStart)}`
  const pix = await gateway.createCharge({
    customerId,
    method: 'pix',
    amount: open.amount,
    dueDate: openDue,
    description: openDescription,
    externalReference: platformReference(openId),
    subscriptionId: openId,
  })

  const subscriptionId = randomUUID()
  const seedPayload = { seed: true }
  await db.transaction(async tx => {
    await tx.insert(platformSubscriptions).values({
      id: subscriptionId,
      organizationId: tenant.id,
      ...planSnapshot(offer),
      revenueSharePercent: '0',
      status: 'active',
      paymentMethod: 'pix',
      dueDay: DUE_DAY,
      startedAt: noonSP(startDate),
      currentPeriodStart: openStart,
      currentPeriodEnd: openEnd,
      nextDueDate: openEnd,
      gatewayProvider: 'simulated',
      gatewayCustomerId: customerId,
      billingName: tenant.legalName,
      billingDocument,
      billingEmail: tenant.email,
      source: 'seed',
      createdAt: noonSP(startDate),
    })
    const events: (typeof platformBillingEvents.$inferInsert)[] = [
      {
        organizationId: tenant.id,
        subscriptionId,
        type: 'SUBSCRIPTION_CREATED',
        source: 'onboarding',
        message: `Assinatura da plataforma criada — plano ${offer.name} (${formatBRL(offer.priceMonthly)}/mês, até ${offer.memberLimit} vidas), vencimento todo dia ${DUE_DAY}`,
        payload: seedPayload,
        createdAt: noonSP(startDate),
      },
    ]

    // Ativação paga no dia do início.
    const activationItems = activationChargeItems(offer, offer.pricing)
    const activationAmount = sumChargeItems(activationItems)
    const activationId = randomUUID()
    await tx.insert(platformCharges).values({
      id: activationId,
      organizationId: tenant.id,
      subscriptionId,
      kind: 'activation',
      periodStart: startDate,
      periodEnd: firstMonthly,
      dueDate: startDate,
      amount: String(activationAmount),
      items: activationItems,
      method: 'pix',
      status: 'paid',
      description: `ANNETEC · Ativação do plano ${offer.name} · ${tenant.name}`,
      gatewayProvider: 'simulated',
      paidAt: noonSP(startDate),
      paidAmount: String(activationAmount),
      createdAt: noonSP(startDate),
    })
    events.push(
      {
        organizationId: tenant.id,
        subscriptionId,
        chargeId: activationId,
        type: 'ACTIVATION_CHARGE_CREATED',
        source: 'onboarding',
        message: `Cobrança de ativação de ${formatBRL(activationAmount)} emitida — Pix, vence em ${formatDateBR(startDate)}`,
        payload: seedPayload,
        createdAt: noonSP(startDate),
      },
      {
        organizationId: tenant.id,
        subscriptionId,
        chargeId: activationId,
        type: 'PAYMENT_RECEIVED',
        source: 'simulation',
        gatewayProvider: 'simulated',
        message: `Pagamento de ${formatBRL(activationAmount)} (ativação) recebido via Pix (simulado)`,
        payload: seedPayload,
        createdAt: noonSP(startDate),
      },
    )

    // 5 mensalidades pagas (2 dias antes do vencimento).
    for (let k = 0; k < 5; k += 1) {
      const periodStart = addMonthsOnDueDay(firstMonthly, k, DUE_DAY)
      const periodEnd = addMonthsOnDueDay(firstMonthly, k + 1, DUE_DAY)
      const { items, amount } = buildMonthlyCharge(retrato, { lives, clubRevenue: 0, periodStart })
      const chargeId = randomUUID()
      const generatedAt = noonSP(addDays(periodStart, -10))
      const paidAt = noonSP(addDays(periodStart, -2))
      await tx.insert(platformCharges).values({
        id: chargeId,
        organizationId: tenant.id,
        subscriptionId,
        kind: 'monthly',
        periodStart,
        periodEnd,
        dueDate: periodStart,
        amount: String(amount),
        items: items as PlatformChargeItem[],
        livesCount: lives,
        method: 'pix',
        status: 'paid',
        description: `ANNETEC · ${tenant.name} · Plano ${offer.name} · ${monthLabel(periodStart)}`,
        gatewayProvider: 'simulated',
        paidAt,
        paidAmount: String(amount),
        createdAt: generatedAt,
      })
      events.push(
        {
          organizationId: tenant.id,
          subscriptionId,
          chargeId,
          type: 'CHARGE_GENERATED',
          source: 'automation',
          gatewayProvider: 'simulated',
          message: `Fatura de ${formatBRL(amount)} do período ${monthLabel(periodStart)} gerada — ${lives} vida(s), Pix, vence em ${formatDateBR(periodStart)}`,
          payload: seedPayload,
          createdAt: generatedAt,
        },
        {
          organizationId: tenant.id,
          subscriptionId,
          chargeId,
          type: 'PAYMENT_RECEIVED',
          source: 'simulation',
          gatewayProvider: 'simulated',
          message: `Pagamento de ${formatBRL(amount)} (mensalidade) recebido via Pix (simulado)`,
          payload: seedPayload,
          createdAt: paidAt,
        },
      )
    }

    await tx.insert(platformCharges).values({
      id: openId,
      organizationId: tenant.id,
      subscriptionId,
      kind: 'monthly',
      periodStart: openStart,
      periodEnd: openEnd,
      dueDate: openDue,
      amount: String(open.amount),
      items: open.items,
      livesCount: lives,
      method: 'pix',
      status: 'pending',
      description: openDescription,
      gatewayProvider: 'simulated',
      gatewayChargeId: pix.id,
      pixPayload: pix.pix?.payload ?? null,
      pixQrCode: pix.pix?.qrCodeBase64 ?? null,
      pixExpiresAt: pix.pix?.expiresAt ? new Date(pix.pix.expiresAt) : null,
      lastSyncedAt: new Date(),
    })
    events.push(
      {
        organizationId: tenant.id,
        subscriptionId,
        chargeId: openId,
        type: 'CHARGE_GENERATED',
        source: 'automation',
        gatewayProvider: 'simulated',
        message: `Fatura de ${formatBRL(open.amount)} do período ${monthLabel(openStart)} gerada — ${lives} vida(s), ${CLUB_PAYMENT_METHOD_LABELS.pix}, vence em ${formatDateBR(openDue)}`,
        payload: seedPayload,
      },
      {
        organizationId: tenant.id,
        subscriptionId,
        chargeId: openId,
        type: 'PAYMENT_CREATED',
        source: 'automation',
        gatewayProvider: 'simulated',
        message: `Fatura de ${formatBRL(open.amount)} registrada no gateway — Pix, vence em ${formatDateBR(openDue)}`,
        payload: seedPayload,
      },
    )
    await tx.insert(platformBillingEvents).values(events)
  })

  console.log(
    `  ${SLUG}: assinatura ${subscriptionId} · plano ${offer.name} · ${lives} vida(s) · ativação + 5 pagas + 1 aberta (${formatBRL(open.amount)}, vence ${formatDateBR(openDue)})`,
  )
}

async function limpar(): Promise<void> {
  const tenant = await findTenant()
  if (!tenant) {
    console.log(`  inquilino "${SLUG}" não existe — nada a limpar`)
    return
  }
  const subs = await db
    .select({ id: platformSubscriptions.id })
    .from(platformSubscriptions)
    .where(and(eq(platformSubscriptions.organizationId, tenant.id), eq(platformSubscriptions.source, 'seed')))
  if (subs.length === 0) {
    console.log(`  ${SLUG} sem assinatura de demonstração — nada a limpar`)
    return
  }
  const ids = subs.map(sub => sub.id)
  await db.transaction(async tx => {
    const events = await tx.delete(platformBillingEvents).where(inArray(platformBillingEvents.subscriptionId, ids)).returning({ id: platformBillingEvents.id })
    const charges = await tx.delete(platformCharges).where(inArray(platformCharges.subscriptionId, ids)).returning({ id: platformCharges.id })
    await tx.delete(platformSubscriptions).where(inArray(platformSubscriptions.id, ids))
    console.log(`  ${SLUG}: removidos ${ids.length} assinatura(s), ${charges.length} fatura(s) e ${events.length} evento(s) de demonstração`)
  })
}

async function main() {
  if (process.argv.includes('--limpar')) {
    console.log('Limpando a cobrança de plataforma de demonstração…')
    await limpar()
    return
  }
  console.log('Preços dos planos ANNETEC (só os que faltam):')
  const prices = await seedPrices()
  console.log(`  ${prices} preço(s) inserido(s)`)
  console.log(`Assinatura de plataforma de demonstração (${SLUG}):`)
  await seedSubscription()
}

main()
  .then(() => sql.end())
  .catch(async error => {
    console.error(error)
    await sql.end()
    process.exit(1)
  })
