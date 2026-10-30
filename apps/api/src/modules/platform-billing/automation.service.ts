import {
  CLUB_PAYMENT_METHOD_LABELS,
  formatBRL,
  formatDateBR,
  platformDelinquencyAction,
  type PlatformBillingAutomationReport,
} from '@annetec/contracts'
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { env, platformBillingAutomationEnabled } from '@/config/env'
import { db } from '@/db/client'
import { clubCharges, platformCharges, platformSubscriptions } from '@/db/schema'
import { AppError } from '@/http/errors'
import { invalidatePlatformAccessCache } from '@/http/middleware/platform-access'
import { logger } from '@/lib/logger'
import { addDays, diffDays, monthLabel, todaySP } from '@/modules/club-billing/dates'
import { invalidateHoldingCache } from '@/modules/holding/cache'
import { platformInvoiceUrl, platformReference } from './access-key'
import {
  buildMonthlyCharge,
  clubRevenueWindow,
  dunningDates,
  isPlatformCardRetryDue,
  isPlatformReminderDue,
  platformCyclePeriod,
  shouldGeneratePlatformCycle,
  shouldMarkPlatformOverdue,
} from './automation.rules'
import { submitPlatformChargeToGateway, syncPlatformCharge, withPlatformChargeLock } from './charges.service'
import {
  chargeEmail,
  chargeRecipient,
  handlePlatformGatewayEvent,
  markPlatformPastDue,
  mirrorTenantStatus,
  newEffects,
  platformSyntheticEventId,
  reactivatePlatformIfSettled,
  recordPlatformEvent,
  runEffects,
} from './events.service'
import { countLives } from './lives'
import { sendPlatformEmail, sendPlatformEmails, type PlatformEmail } from './notify'
import { OPEN_PLATFORM_CHARGE_STATUSES, type PlatformSubscriptionRow } from './presenter'
import { findPlanOffer, planSnapshot } from './pricing.service'
import { tenantRefOf } from './queries'
import { currentPlatformProvider, loadPlatformSettings, touchPlatformAutomationRun, type ResolvedPlatformSettings } from './settings.service'

/**
 * Régua automática da PLATAFORMA, sem humano (blueprint da plataforma §0.4):
 * sincroniza → expira overrides → gera ciclos → cartão → lembretes → vence →
 * degraus (restringe/suspende/cancela) → rede de segurança → manutenção das
 * propostas (Q1). Cada passo é idempotente (UPDATE condicional,
 * `onConflictDoNothing`, eventos determinísticos); erro de um item vai para
 * `report.errors` e o laço continua; erro de um inquilino não derruba os outros.
 */

const BATCH = 200
/** Sincronização periódica: simulado é barato; Asaas tem webhook. */
const SYNC_INTERVAL_MS = { simulated: 30_000, asaas: 15 * 60_000 } as const
const DELINQUENT: PlatformSubscriptionRow['status'][] = ['past_due', 'restricted', 'suspended']

let running = false

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function emptyReport(now: Date, errors: string[] = []): PlatformBillingAutomationReport {
  return {
    ranAt: now.toISOString(),
    durationMs: 0,
    synced: 0,
    generated: 0,
    cardCharged: 0,
    cardFailed: 0,
    remindersSent: 0,
    markedOverdue: 0,
    pastDue: 0,
    restricted: 0,
    suspended: 0,
    canceled: 0,
    reactivated: 0,
    overridesExpired: 0,
    proposalsExpired: 0,
    errors,
  }
}

/** Uma rodada completa (mutex em processo). `throwIfBusy` → 409 em vez de relatório vazio. */
export async function runPlatformAutomation(
  now = new Date(),
  options: { throwIfBusy?: boolean } = {},
): Promise<PlatformBillingAutomationReport> {
  if (running) {
    if (options.throwIfBusy) throw AppError.conflict('A automação da plataforma já está rodando; tente de novo em alguns segundos')
    return emptyReport(now, ['automação da plataforma já em execução'])
  }
  running = true
  try {
    return await run(now)
  } finally {
    running = false
  }
}

export function isPlatformAutomationRunning(): boolean {
  return running
}

/** Espera a rodada em curso terminar (até `maxWaitMs`) e roda uma nova — usado pelo "avançar dias". */
export async function runPlatformAutomationWhenFree(maxWaitMs = 20_000): Promise<PlatformBillingAutomationReport> {
  const deadline = Date.now() + maxWaitMs
  while (running && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250))
  return runPlatformAutomation(new Date(), { throwIfBusy: true })
}

async function run(now: Date): Promise<PlatformBillingAutomationReport> {
  const startedAt = Date.now()
  const report = emptyReport(now)
  const today = todaySP(now)
  const settings = await loadPlatformSettings()

  // Desligando (SIGTERM): não começa passo nem item novo — o que já foi ao
  // gateway termina e grava; o resto fica para a rodada do próximo processo.
  // Sem isso a rodada seguiria chamando o gateway até o SIGKILL, que pode cair
  // entre a resposta do gateway e a gravação do resultado.
  const step = async (name: string, work: () => Promise<void>) => {
    if (stopping) return
    try {
      await work()
    } catch (error) {
      report.errors.push(`${name}: ${errorText(error)}`)
    }
  }
  const item = async (name: string, work: () => Promise<void>) => {
    if (stopping) return
    try {
      await work()
    } catch (error) {
      if (report.errors.length < 50) report.errors.push(`${name}: ${errorText(error)}`)
    }
  }

  // 1. Sincronizar faturas abertas com o gateway (inclui ativações).
  await step('sincronizar', async () => {
    const rows = await db
      .select()
      .from(platformCharges)
      .where(
        and(
          inArray(platformCharges.status, ['pending', 'overdue']),
          isNotNull(platformCharges.gatewayChargeId),
          or(
            isNull(platformCharges.lastSyncedAt),
            and(
              eq(platformCharges.gatewayProvider, 'simulated'),
              lt(platformCharges.lastSyncedAt, new Date(now.getTime() - SYNC_INTERVAL_MS.simulated)),
            ),
            and(
              eq(platformCharges.gatewayProvider, 'asaas'),
              lt(platformCharges.lastSyncedAt, new Date(now.getTime() - SYNC_INTERVAL_MS.asaas)),
            ),
          ),
        ),
      )
      .orderBy(sql`${platformCharges.lastSyncedAt} asc nulls first`)
      .limit(BATCH)
    for (const charge of rows) {
      await item(`sincronizar ${charge.id}`, async () => {
        await syncPlatformCharge(charge, 'automation', now)
        report.synced += 1
      })
    }
  })

  // 2. Overrides manuais vencidos voltam à régua.
  await step('overrides', async () => {
    const expired = await db
      .update(platformSubscriptions)
      .set({
        accessOverride: null,
        accessOverrideReason: null,
        accessOverrideUntil: null,
        accessOverrideByUserId: null,
        accessOverrideAt: null,
        updatedAt: now,
      })
      .where(
        and(
          isNotNull(platformSubscriptions.accessOverride),
          isNotNull(platformSubscriptions.accessOverrideUntil),
          lte(platformSubscriptions.accessOverrideUntil, now),
        ),
      )
      .returning({ id: platformSubscriptions.id, organizationId: platformSubscriptions.organizationId })
    for (const sub of expired) {
      report.overridesExpired += 1
      invalidatePlatformAccessCache(sub.organizationId)
      await item(`override ${sub.id}`, () =>
        recordPlatformEvent(db, {
          organizationId: sub.organizationId,
          subscriptionId: sub.id,
          type: 'ACCESS_OVERRIDE_CLEARED',
          source: 'automation',
          message: 'Prazo da alteração manual de acesso terminou — vale de novo a régua automática',
        }),
      )
    }
  })

  // 3. Gerar a fatura do próximo ciclo (e avançar o período).
  await step('gerar ciclo', async () => {
    const horizon = addDays(today, settings.generateDaysBefore)
    const rows = await db
      .select()
      .from(platformSubscriptions)
      .where(
        and(
          inArray(platformSubscriptions.status, ['active', 'past_due', 'restricted']),
          isNotNull(platformSubscriptions.nextDueDate),
          lte(platformSubscriptions.nextDueDate, horizon),
        ),
      )
      .limit(BATCH)
    for (const sub of rows) {
      if (!shouldGeneratePlatformCycle(sub.status, sub.nextDueDate, today, settings)) continue
      await item(`gerar ciclo ${sub.id}`, async () => {
        // Um inquilino pode estar atrasado vários ciclos (servidor parado): gera até alcançar a janela.
        for (let guard = 0; guard < 3; guard += 1) {
          const outcome = await generateCycle(sub.id, settings, today, now)
          if (!outcome) break
          if (outcome.generated) report.generated += 1
          if (!shouldGeneratePlatformCycle(outcome.sub.status, outcome.sub.nextDueDate, today, settings)) break
        }
      })
    }
  })

  // 4. Cartão: cobra o token salvo no vencimento, com retentativas espaçadas.
  await step('cartão', async () => {
    const retryCutoff = new Date(now.getTime() - settings.cardRetryIntervalHours * 3_600_000)
    const rows = await db
      .select({ charge: platformCharges })
      .from(platformCharges)
      .innerJoin(platformSubscriptions, eq(platformSubscriptions.id, platformCharges.subscriptionId))
      .where(
        and(
          eq(platformCharges.method, 'credit_card'),
          inArray(platformCharges.status, ['pending', 'failed']),
          isNull(platformCharges.gatewayChargeId),
          lte(platformCharges.dueDate, today),
          lt(platformCharges.attempts, settings.maxCardRetries),
          or(isNull(platformCharges.lastAttemptAt), lte(platformCharges.lastAttemptAt, retryCutoff)),
          inArray(platformSubscriptions.status, ['active', 'past_due', 'restricted', 'suspended']),
        ),
      )
      .orderBy(asc(platformCharges.dueDate))
      .limit(BATCH)
    for (const { charge } of rows) {
      if (!isPlatformCardRetryDue(charge, today, now, settings)) continue
      await item(`cartão ${charge.id}`, async () => {
        const result = await withPlatformChargeLock(charge.id, () =>
          submitPlatformChargeToGateway(charge.id, { method: 'credit_card', useSavedCard: true, source: 'automation' }),
        )
        if (result.status === 'paid') report.cardCharged += 1
        else if (result.status === 'failed') report.cardFailed += 1
      })
    }
  })

  // 5. Lembretes de vencimento.
  await step('lembretes', async () => {
    const until = addDays(today, settings.reminderDaysBefore)
    const rows = await db
      .select()
      .from(platformCharges)
      .where(
        and(
          eq(platformCharges.status, 'pending'),
          isNull(platformCharges.reminderSentAt),
          gte(platformCharges.dueDate, today),
          lte(platformCharges.dueDate, until),
        ),
      )
      .limit(BATCH)
    for (const charge of rows) {
      if (!isPlatformReminderDue(charge, today, settings)) continue
      await item(`lembrete ${charge.id}`, async () => {
        const [marked] = await db
          .update(platformCharges)
          .set({ reminderSentAt: now })
          .where(and(eq(platformCharges.id, charge.id), isNull(platformCharges.reminderSentAt)))
          .returning({ id: platformCharges.id })
        if (!marked) return
        const recipient = await chargeRecipient(db, charge)
        await recordPlatformEvent(db, {
          organizationId: charge.organizationId,
          subscriptionId: charge.subscriptionId,
          chargeId: charge.id,
          proposalId: charge.proposalId,
          type: 'REMINDER_SENT',
          source: 'automation',
          gatewayProvider: charge.gatewayProvider,
          message: `Lembrete enviado${recipient ? ` para ${recipient.email}` : ''} — vence em ${formatDateBR(charge.dueDate)}`,
        })
        if (recipient) await sendPlatformEmail(chargeEmail('platform_invoice_reminder', charge, recipient))
        report.remindersSent += 1
      })
    }
  })

  // 6. Vencer: Pix/boleto pendente passou do dia; cartão esgotou as tentativas; ativa com vencida → em atraso.
  await step('vencer', async () => {
    const pending = await db
      .select()
      .from(platformCharges)
      .where(
        and(
          eq(platformCharges.status, 'pending'),
          inArray(platformCharges.method, ['pix', 'boleto']),
          lt(platformCharges.dueDate, today),
        ),
      )
      .limit(BATCH)
    for (const charge of pending) {
      if (!shouldMarkPlatformOverdue(charge, today, settings)) continue
      await item(`vencer ${charge.id}`, async () => {
        const outcome = await handlePlatformGatewayEvent(
          {
            id: charge.gatewayChargeId ? platformSyntheticEventId(charge.gatewayChargeId, 'PAYMENT_OVERDUE') : null,
            event: 'PAYMENT_OVERDUE',
            payment: { id: charge.gatewayChargeId, externalReference: platformReference(charge.id), value: Number(charge.amount) },
          },
          { source: 'automation', provider: charge.gatewayProvider, now },
        )
        if (outcome.status === 'applied') report.markedOverdue += 1
      })
    }

    const exhausted = await db
      .update(platformCharges)
      .set({ status: 'overdue', updatedAt: now })
      .where(
        and(
          eq(platformCharges.method, 'credit_card'),
          eq(platformCharges.status, 'failed'),
          sql`${platformCharges.attempts} >= ${settings.maxCardRetries}`,
          lt(platformCharges.dueDate, today),
        ),
      )
      .returning()
    for (const charge of exhausted) {
      report.markedOverdue += 1
      await item(`vencer cartão ${charge.id}`, () =>
        recordPlatformEvent(db, {
          organizationId: charge.organizationId,
          subscriptionId: charge.subscriptionId,
          chargeId: charge.id,
          proposalId: charge.proposalId,
          type: 'PAYMENT_OVERDUE',
          source: 'automation',
          gatewayProvider: charge.gatewayProvider,
          message: `Fatura de ${formatBRL(Number(charge.amount))} venceu após ${charge.attempts} tentativa(s) no cartão`,
        }),
      )
    }

    const late = await db
      .select({
        id: platformSubscriptions.id,
        organizationId: platformSubscriptions.organizationId,
        provider: platformSubscriptions.gatewayProvider,
      })
      .from(platformSubscriptions)
      .where(
        and(
          eq(platformSubscriptions.status, 'active'),
          sql`exists (select 1 from platform_charges c where c.subscription_id = ${platformSubscriptions.id} and c.status in ('pending', 'overdue', 'failed') and c.due_date < ${today}::date)`,
        ),
      )
    for (const sub of late) {
      await item(`em atraso ${sub.id}`, async () => {
        const effects = newEffects()
        if (await markPlatformPastDue(db, sub, 'há fatura vencida em aberto', { source: 'automation', provider: sub.provider }, now, effects)) {
          report.pastDue += 1
        }
        for (const orgId of effects.invalidateOrgs) invalidatePlatformAccessCache(orgId)
      })
    }

    // E-mail de vencida (1× por fatura), qualquer que tenha sido o caminho até `overdue`.
    const toNotify = await db
      .select()
      .from(platformCharges)
      .where(and(eq(platformCharges.status, 'overdue'), isNull(platformCharges.overdueNotifiedAt)))
      .limit(BATCH)
    for (const charge of toNotify) {
      await item(`aviso de vencida ${charge.id}`, async () => {
        const [marked] = await db
          .update(platformCharges)
          .set({ overdueNotifiedAt: now })
          .where(and(eq(platformCharges.id, charge.id), isNull(platformCharges.overdueNotifiedAt)))
          .returning({ id: platformCharges.id })
        if (!marked) return
        const recipient = await chargeRecipient(db, charge)
        if (!recipient) return
        const steps = dunningDates(charge.dueDate, settings)
        await sendPlatformEmail(
          chargeEmail('platform_invoice_overdue', charge, recipient, {
            daysLate: Math.max(0, diffDays(today, charge.dueDate)),
            restrictsOn: charge.subscriptionId ? steps.restrictsOn : null,
            suspendsOn: charge.subscriptionId ? steps.suspendsOn : null,
          }),
        )
      })
    }
  })

  // 7. Degraus da inadimplência pela fatura aberta mais antiga.
  await step('inadimplência', async () => {
    const rows = await db
      .select({
        sub: platformSubscriptions,
        oldestDue: sql<string | null>`(select min(c.due_date)::text from platform_charges c where c.subscription_id = ${platformSubscriptions.id} and c.status in ('pending', 'overdue', 'failed'))`,
      })
      .from(platformSubscriptions)
      .where(inArray(platformSubscriptions.status, DELINQUENT))
    for (const { sub, oldestDue } of rows) {
      const action = platformDelinquencyAction(sub.status, oldestDue, today, settings)
      if (!action) continue
      await item(`inadimplência ${sub.id}`, async () => {
        const changed = await applyDunningStep(sub, action, diffDays(today, oldestDue!), settings, now)
        if (changed) report[action === 'restrict' ? 'restricted' : action === 'suspend' ? 'suspended' : 'canceled'] += 1
      })
    }
  })

  // 8. Rede de segurança: em atraso/restrita/suspensa sem fatura vencida em aberto → ativa.
  await step('reativar', async () => {
    const rows = await db.select().from(platformSubscriptions).where(inArray(platformSubscriptions.status, DELINQUENT))
    for (const sub of rows) {
      await item(`reativar ${sub.id}`, async () => {
        const effects = newEffects()
        if (await reactivatePlatformIfSettled(db, sub, { source: 'automation', provider: sub.gatewayProvider }, now, effects)) {
          report.reactivated += 1
        }
        await runEffects(effects, 'automation')
      })
    }
  })

  // 9. Manutenção das propostas (Q1): rascunhos e ativações vencidas.
  await step('propostas', async () => {
    const { runOnboardingMaintenance } = await import('@/modules/platform-onboarding/automation')
    const result = await runOnboardingMaintenance(now, {
      draftExpiryDays: settings.draftExpiryDays,
      activationExpiryDays: settings.activationExpiryDays,
    })
    report.proposalsExpired += result.expired
    for (const error of result.errors.slice(0, 10)) report.errors.push(`propostas: ${error}`)
  })

  // 10. Carimbo da rodada.
  await step('registrar rodada', () => touchPlatformAutomationRun(now))

  if (
    report.generated + report.markedOverdue + report.pastDue + report.restricted + report.suspended + report.canceled + report.reactivated + report.overridesExpired >
    0
  ) {
    invalidateHoldingCache()
  }
  report.durationMs = Date.now() - startedAt
  return report
}

/**
 * Gera a fatura mensal do `nextDueDate` da assinatura: aplica o downgrade
 * agendado ANTES de calcular, apura vidas e receita do clube, lança os
 * ajustes pendentes (e zera), avança o período e emite no gateway.
 */
async function generateCycle(
  subscriptionId: string,
  settings: ResolvedPlatformSettings,
  today: string,
  now: Date,
): Promise<{ sub: PlatformSubscriptionRow; generated: boolean } | null> {
  const provider = currentPlatformProvider(settings)
  const scheduled = await (async () => {
    const [row] = await db
      .select({ scheduledPlanId: platformSubscriptions.scheduledPlanId })
      .from(platformSubscriptions)
      .where(eq(platformSubscriptions.id, subscriptionId))
      .limit(1)
    return row?.scheduledPlanId ? await findPlanOffer(row.scheduledPlanId) : null
  })()

  const result = await db.transaction(async tx => {
    const [sub] = await tx
      .select()
      .from(platformSubscriptions)
      .where(eq(platformSubscriptions.id, subscriptionId))
      .for('update')
      .limit(1)
    if (!sub || !sub.nextDueDate || !shouldGeneratePlatformCycle(sub.status, sub.nextDueDate, today, settings)) return null

    let current = sub
    if (sub.scheduledPlanId && scheduled && scheduled.id === sub.scheduledPlanId) {
      const [changed] = await tx
        .update(platformSubscriptions)
        .set({ ...planSnapshot(scheduled), scheduledPlanId: null, updatedAt: now })
        .where(eq(platformSubscriptions.id, sub.id))
        .returning()
      if (changed) {
        current = changed
        await recordPlatformEvent(tx, {
          organizationId: sub.organizationId,
          subscriptionId: sub.id,
          type: 'PLAN_CHANGED',
          source: 'automation',
          message: `Troca agendada aplicada: plano ${sub.planName} → ${scheduled.name} a partir de ${formatDateBR(sub.nextDueDate)}`,
        })
      }
    }

    const { periodStart, periodEnd, dueDate } = platformCyclePeriod(current.nextDueDate!, current.dueDay)
    const lives = await countLives(current.organizationId, tx)
    const revenueSharePercent = Number(current.revenueSharePercent)
    let clubRevenue = 0
    if (revenueSharePercent > 0) {
      const window = clubRevenueWindow(periodStart)
      const [row] = await tx
        .select({ total: sql<string | null>`coalesce(sum(${clubCharges.paidAmount}), 0)::text` })
        .from(clubCharges)
        .where(
          and(
            eq(clubCharges.organizationId, current.organizationId),
            eq(clubCharges.status, 'paid'),
            gte(clubCharges.paidAt, window.from),
            lt(clubCharges.paidAt, window.to),
          ),
        )
      clubRevenue = Number(row?.total ?? 0)
    }
    const { items, amount } = buildMonthlyCharge(
      {
        planName: current.planName,
        planPriceMonthly: Number(current.planPriceMonthly),
        memberLimit: current.memberLimit,
        pricePerExtraLife: Number(current.pricePerExtraLife),
        revenueSharePercent,
        monthlyDiscount: { percent: Number(current.monthlyDiscountPercent ?? 0), until: current.monthlyDiscountUntil ?? null },
      },
      { lives, clubRevenue, periodStart, adjustments: current.pendingAdjustments ?? [] },
    )

    const tenant = await tenantRefOf(current.organizationId, tx)
    const [inserted] = await tx
      .insert(platformCharges)
      .values({
        organizationId: current.organizationId,
        subscriptionId: current.id,
        proposalId: current.proposalId,
        kind: 'monthly',
        periodStart,
        periodEnd,
        dueDate,
        amount: String(amount),
        items,
        livesCount: lives,
        method: current.paymentMethod,
        status: amount > 0 ? 'pending' : 'paid',
        ...(amount > 0 ? {} : { paidAt: now, paidAmount: '0' }),
        description: `ANNETEC · ${tenant?.name ?? current.billingName} · Plano ${current.planName} · ${monthLabel(periodStart)}`,
        gatewayProvider: provider,
      })
      .onConflictDoNothing()
      .returning()

    const [advanced] = await tx
      .update(platformSubscriptions)
      .set({
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextDueDate: periodEnd,
        ...(inserted ? { pendingAdjustments: [] } : {}),
        updatedAt: now,
      })
      .where(eq(platformSubscriptions.id, current.id))
      .returning()
    if (!inserted) return { sub: advanced ?? current, charge: null, tenantName: tenant?.name ?? current.billingName }

    await recordPlatformEvent(tx, {
      organizationId: current.organizationId,
      subscriptionId: current.id,
      chargeId: inserted.id,
      type: 'CHARGE_GENERATED',
      source: 'automation',
      gatewayProvider: provider,
      message: `Fatura de ${formatBRL(amount)} do período ${monthLabel(periodStart)} gerada — ${lives} vida(s), ${CLUB_PAYMENT_METHOD_LABELS[inserted.method]}, vence em ${formatDateBR(dueDate)}`,
      payload: { lives, items: items.map(i => ({ kind: i.kind, quantity: i.quantity, amount: i.amount })) },
    })
    return { sub: advanced ?? current, charge: inserted, tenantName: tenant?.name ?? current.billingName }
  })

  if (!result) return null
  if (!result.charge) return { sub: result.sub, generated: false }
  if (result.charge.status === 'pending') {
    if (result.charge.method !== 'credit_card') {
      await submitPlatformChargeToGateway(result.charge.id, { method: result.charge.method, source: 'automation', mode: 'passive' })
    }
    await sendPlatformEmail(
      chargeEmail(
        'platform_invoice_created',
        result.charge,
        { email: result.sub.billingEmail, name: result.sub.billingName, tenantName: result.tenantName },
        { lives: result.charge.livesCount },
      ),
    )
  }
  return { sub: result.sub, generated: true }
}

/** restrict/suspend/cancel com evento, e-mail, espelho em `tenant_profiles` e cache do guard. */
async function applyDunningStep(
  sub: PlatformSubscriptionRow,
  action: 'restrict' | 'suspend' | 'cancel',
  daysLate: number,
  settings: ResolvedPlatformSettings,
  now: Date,
): Promise<boolean> {
  const emails: PlatformEmail[] = []
  const tenant = await tenantRefOf(sub.organizationId)
  const tenantName = tenant?.name ?? sub.billingName
  const [oldest] = await db
    .select()
    .from(platformCharges)
    .where(and(eq(platformCharges.subscriptionId, sub.id), inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES)))
    .orderBy(asc(platformCharges.dueDate))
    .limit(1)
  const steps = dunningDates(oldest?.dueDate ?? null, settings)
  const recipient = { email: sub.billingEmail, name: sub.billingName, tenantName }

  const changed = await db.transaction(async tx => {
    if (action === 'restrict') {
      const [row] = await tx
        .update(platformSubscriptions)
        .set({ status: 'restricted', restrictedAt: now, updatedAt: now })
        .where(and(eq(platformSubscriptions.id, sub.id), eq(platformSubscriptions.status, 'past_due')))
        .returning({ id: platformSubscriptions.id })
      if (!row) return false
      await recordPlatformEvent(tx, {
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        chargeId: oldest?.id ?? null,
        type: 'SUBSCRIPTION_RESTRICTED',
        source: 'automation',
        gatewayProvider: sub.gatewayProvider,
        message: `Painel restrito (somente leitura): fatura vencida há ${daysLate} dias — bloqueio em ${steps.suspendsOn ? formatDateBR(steps.suspendsOn) : '—'}`,
      })
      if (oldest) {
        emails.push(chargeEmail('platform_access_restricted', oldest, recipient, { daysLate, suspendsOn: steps.suspendsOn }))
      }
      return true
    }

    if (action === 'suspend') {
      const [row] = await tx
        .update(platformSubscriptions)
        .set({ status: 'suspended', suspendedAt: now, restrictedAt: sub.restrictedAt ?? now, updatedAt: now })
        .where(and(eq(platformSubscriptions.id, sub.id), inArray(platformSubscriptions.status, ['past_due', 'restricted'])))
        .returning({ id: platformSubscriptions.id })
      if (!row) return false
      await mirrorTenantStatus(tx, sub.organizationId, 'suspended')
      await recordPlatformEvent(tx, {
        organizationId: sub.organizationId,
        subscriptionId: sub.id,
        chargeId: oldest?.id ?? null,
        type: 'SUBSCRIPTION_SUSPENDED',
        source: 'automation',
        gatewayProvider: sub.gatewayProvider,
        message: `Painel suspenso: fatura vencida há ${daysLate} dias — associados seguem atendidos normalmente`,
      })
      if (oldest) emails.push(chargeEmail('platform_access_suspended', oldest, recipient, { daysLate }))
      return true
    }

    const reason = `Inadimplência: fatura vencida há ${daysLate} dias`
    const [row] = await tx
      .update(platformSubscriptions)
      .set({ status: 'canceled', canceledAt: now, cancelReason: reason, updatedAt: now })
      .where(and(eq(platformSubscriptions.id, sub.id), inArray(platformSubscriptions.status, DELINQUENT)))
      .returning({ id: platformSubscriptions.id })
    if (!row) return false
    await mirrorTenantStatus(tx, sub.organizationId, 'suspended')
    await recordPlatformEvent(tx, {
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      chargeId: oldest?.id ?? null,
      type: 'SUBSCRIPTION_CANCELED',
      source: 'automation',
      gatewayProvider: sub.gatewayProvider,
      message: `Assinatura da plataforma cancelada: ${reason.toLowerCase()} (o inquilino NÃO é cancelado)`,
    })
    emails.push({
      template: 'platform_subscription_canceled',
      to: { email: sub.billingEmail, name: sub.billingName },
      data: {
        tenantName,
        reason,
        description: oldest?.description ?? '',
        amount: oldest ? Number(oldest.amount) : 0,
        dueDate: oldest?.dueDate ?? '',
        payUrl: oldest ? platformInvoiceUrl(oldest.id) : '',
        daysLate,
      },
      organizationId: sub.organizationId,
      relatedType: 'platform_subscription',
      relatedId: sub.id,
    })
    return true
  })

  if (changed) {
    invalidatePlatformAccessCache(sub.organizationId)
    await sendPlatformEmails(emails)
  }
  return changed
}

// ---------------------------------------------------------------------------
// Timer (servidor persistente — `src/index.ts`)
// ---------------------------------------------------------------------------

let schedulerStarted = false
let stopping = false
let firstTimer: ReturnType<typeof setTimeout> | null = null
let intervalTimer: ReturnType<typeof setInterval> | null = null

/**
 * Encerramento (SIGTERM): para os timers e espera a rodada em curso (timer ou
 * HTTP) terminar, até `maxWaitMs`. `false` = ainda rodava no fim do prazo.
 */
export async function stopPlatformBillingAutomation(maxWaitMs = 20_000): Promise<boolean> {
  stopping = true
  if (firstTimer) clearTimeout(firstTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  firstTimer = null
  intervalTimer = null
  const deadline = Date.now() + maxWaitMs
  while (running && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
  return !running
}
let lastErrorText = ''
let lastErrorAt = 0

/**
 * 1ª rodada 15 s após o boot, depois a cada
 * `PLATFORM_BILLING_AUTOMATION_INTERVAL_SECONDS`. Sem rodadas sobrepostas
 * (mutex), `unref()` para não segurar o processo, desligável por
 * `PLATFORM_BILLING_AUTOMATION_ENABLED=false`. Nada aqui derruba a API: erro
 * vira log (repetido no máx. a cada 10 min).
 */
export function startPlatformBillingAutomation(): void {
  if (schedulerStarted || !platformBillingAutomationEnabled) return
  schedulerStarted = true

  const tick = async () => {
    if (stopping) return
    if (running) {
      logger.debug('Automação da plataforma ainda rodando; pulando esta rodada')
      return
    }
    try {
      const report = await runPlatformAutomation()
      const changes =
        report.generated +
        report.cardCharged +
        report.cardFailed +
        report.remindersSent +
        report.markedOverdue +
        report.pastDue +
        report.restricted +
        report.suspended +
        report.canceled +
        report.reactivated +
        report.overridesExpired +
        report.proposalsExpired
      if (report.errors.length > 0) {
        const text = report.errors.slice(0, 3).join(' | ')
        if (text !== lastErrorText || Date.now() - lastErrorAt > 10 * 60_000) {
          lastErrorText = text
          lastErrorAt = Date.now()
          logger.warn({ errors: report.errors.length, first: text }, 'Automação da plataforma com erros')
        }
      }
      if (changes > 0) logger.info({ ...report, errors: report.errors.length }, 'Automação da cobrança da plataforma')
    } catch (error) {
      // Ex.: migration da plataforma ainda não aplicada — loga no máx. a cada 10 min.
      const text = errorText(error)
      if (text !== lastErrorText || Date.now() - lastErrorAt > 10 * 60_000) {
        lastErrorText = text
        lastErrorAt = Date.now()
        logger.error({ err: text }, 'Automação da plataforma falhou')
      }
    }
  }

  firstTimer = setTimeout(() => {
    firstTimer = null
    if (stopping) return
    void tick()
    intervalTimer = setInterval(() => void tick(), env.PLATFORM_BILLING_AUTOMATION_INTERVAL_SECONDS * 1000)
    intervalTimer.unref()
  }, 15_000)
  firstTimer.unref()
  logger.info(
    { intervalSeconds: env.PLATFORM_BILLING_AUTOMATION_INTERVAL_SECONDS },
    'Automação da cobrança da plataforma agendada',
  )
}
