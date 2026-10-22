import {
  formatBRL,
  formatDateBR,
  type BillingAutomationReport,
  type EmailStatus,
  type EmailTemplate,
  type PaymentEventSource,
  type PaymentGatewayProvider,
} from '@annetec/contracts'
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm'
import { billingAutomationEnabled, env, isProduction, webBaseUrl } from '@/config/env'
import { db } from '@/db/client'
import { clubCharges, clubSubscriptions, member, organization, tenantProfiles } from '@/db/schema'
import { AppError } from '@/http/errors'
import { resolveGatewayProvider } from '@/integrations/payments/provider'
import { sendEmail, type SendEmailInput } from '@/lib/email'
import { parseAddress } from '@/lib/email/providers'
import type { ClubEmailTemplate } from '@/lib/email/templates'
import { logger } from '@/lib/logger'
import { paymentMethodLabel } from '@/lib/notifications'
import { submitChargeToGateway, syncCharge, withChargeLock } from './charges.service'
import {
  ABANDONED_CHECKOUT_DAYS,
  delinquencyAction,
  isCardRetryDue,
  isReminderDue,
  shouldGenerateCycle,
  shouldMarkOverdue,
} from './automation.rules'
import { generateCycleCharge } from './cycle.service'
import { addDays, dayMonthLabel, diffDays, todaySP } from './dates'
import {
  handleGatewayEvent,
  markSubscriptionPastDue,
  reactivateIfSettled,
  recordPaymentEvent,
  syntheticEventId,
  type RecordEventInput,
} from './events.service'
import { OPEN_CHARGE_STATUSES, type ChargeRow, type SubscriptionRow } from './presenter'
import { settingsService, loadBillingSettings } from './settings.service'
import {
  ONBOARDING_WINDOW_DAYS,
  deliverOnboardingEmail,
  listOnboardingCandidates,
  onboardingStepFor,
  type OnboardingDeps,
} from './onboarding.service'
import { cancelSubscription } from './subscriptions.service'

/**
 * Motor de cobrança sem humano (blueprint §0.7). Cada passo é idempotente
 * (UPDATE condicional, `onConflictDoNothing`, eventos determinísticos), então
 * rodar duas vezes seguidas não duplica nada. Erro de um item vai para
 * `report.errors` e o laço continua; erro de um inquilino não derruba os outros.
 */

const SYNC_BATCH = 200
/** Sincronização periódica: simulado é barato; Asaas tem webhook (e limite de 25 mil req/12 h). */
const SYNC_INTERVAL_MS = { simulated: 30_000, asaas: 15 * 60_000 } as const

const runningTenants = new Set<string>()

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ---------------------------------------------------------------------------
// Avisos ao associado (e-mail com a marca do clube)
// ---------------------------------------------------------------------------

/**
 * O inquilino é white label: o associado NUNCA recebe nada com a marca da
 * ANNETEC nem do Asaas (o cliente no Asaas é criado com `notificationDisabled`).
 * Quem avisa é a plataforma, com nome/cor/logo do clube e o link do portal do
 * associado — nunca a `invoice_url` do gateway.
 */
export type ClubNoticeKind = 'reminder' | 'overdue' | 'suspended' | 'charge_created' | 'payment_confirmed'

const NOTICE_TEMPLATE: Record<ClubNoticeKind, ClubEmailTemplate> = {
  reminder: 'club_charge_reminder',
  overdue: 'club_charge_overdue',
  suspended: 'club_subscription_suspended',
  charge_created: 'club_charge_created',
  payment_confirmed: 'club_payment_confirmed',
}

const NOTICE_NAME: Record<ClubNoticeKind, string> = {
  reminder: 'Lembrete de vencimento',
  overdue: 'Aviso de mensalidade vencida',
  suspended: 'Aviso de suspensão',
  charge_created: 'Aviso de nova cobrança',
  payment_confirmed: 'Comprovante de pagamento',
}

/** Só avisos de vencida recentes: evita disparar para cobranças antigas na 1ª rodada. */
const OVERDUE_NOTICE_WINDOW_DAYS = 7

export interface TenantBrand {
  name: string
  slug: string
  primaryColor: string | null
  logoUrl: string | null
}

export interface ClubNotice {
  kind: ClubNoticeKind
  sub: Pick<SubscriptionRow, 'id' | 'organizationId' | 'holderName' | 'holderEmail' | 'planName' | 'gatewayProvider'>
  charge:
    | (Pick<
        ChargeRow,
        'id' | 'description' | 'amount' | 'dueDate' | 'method' | 'gatewayProvider' | 'pixPayload' | 'boletoIdentificationField'
      > &
        Partial<Pick<ChargeRow, 'kind' | 'periodStart' | 'paidAt' | 'paidAmount' | 'cardBrand' | 'cardLast4'>>)
    | null
  daysLate?: number
  /** Mensalidade adiantada pelo admin (assunto "sua mensalidade de {mês} já está disponível"). */
  advance?: boolean
  /** Padrão `automation`; avisos disparados pelo admin gravam `manual`. */
  source?: PaymentEventSource
  actorUserId?: string | null
}

export interface NoticeDeps {
  send: (input: SendEmailInput) => Promise<{ id: string | null; status: EmailStatus }>
  record: (input: RecordEventInput) => Promise<void>
  loadTenant: (organizationId: string) => Promise<TenantBrand | null>
  /** Em produção, e-mail só gravado na caixa de saída (sem provedor) NÃO conta como entregue. */
  production: boolean
}

export type NoticeOutcome = 'sent' | 'failed' | 'skipped'

async function loadTenantBrand(organizationId: string): Promise<TenantBrand | null> {
  const [row] = await db
    .select({ name: organization.name, slug: organization.slug, logo: organization.logo, branding: tenantProfiles.branding })
    .from(organization)
    .leftJoin(tenantProfiles, eq(tenantProfiles.organizationId, organization.id))
    .where(eq(organization.id, organizationId))
    .limit(1)
  if (!row) return null
  return {
    name: row.name,
    slug: row.slug,
    primaryColor: row.branding?.primaryColor ?? null,
    logoUrl: row.branding?.logoUrl ?? row.logo ?? null,
  }
}

const defaultNoticeDeps: NoticeDeps = {
  send: sendEmail,
  record: input => recordPaymentEvent(db, input),
  loadTenant: loadTenantBrand,
  production: isProduction,
}

/**
 * Envia o aviso ao associado e registra na timeline. Só grava `REMINDER_SENT`
 * com `delivered: true` quando o provedor aceitou (ou, fora de produção, quando
 * ficou na caixa de saída). Falha ou associado sem e-mail também vão para a
 * timeline como `REMINDER_SENT` com `delivered: false` — o enum de eventos de
 * contracts não tem um tipo de falha. Não lança por falha de envio; lança só
 * se a gravação do evento falhar.
 */
export async function deliverReminder(notice: ClubNotice, overrides: Partial<NoticeDeps> = {}): Promise<NoticeOutcome> {
  const deps = { ...defaultNoticeDeps, ...overrides }
  const { kind, sub, charge } = notice
  const email = sub.holderEmail?.trim() ?? ''
  const label = NOTICE_NAME[kind]
  const when =
    !charge || kind === 'payment_confirmed'
      ? ''
      : ` — vence${kind === 'reminder' || kind === 'charge_created' ? '' : 'u'} em ${dayMonthLabel(charge.dueDate)}`
  const base = {
    organizationId: sub.organizationId,
    subscriptionId: sub.id,
    chargeId: charge?.id ?? null,
    type: 'REMINDER_SENT' as const,
    source: notice.source ?? ('automation' as const),
    gatewayProvider: charge?.gatewayProvider ?? sub.gatewayProvider,
    actorUserId: notice.actorUserId ?? null,
  }

  if (!email || !email.includes('@')) {
    await deps.record({
      ...base,
      message: `${label} não enviado: associado sem e-mail cadastrado`,
      payload: { kind, delivered: false, reason: 'no_email' },
    })
    return 'skipped'
  }

  let result: { id: string | null; status: EmailStatus | 'error' }
  let reason: string | null = null
  try {
    const tenant = await deps.loadTenant(sub.organizationId)
    const clubName = tenant?.name ?? 'Seu clube'
    result = await deps.send({
      // Chave fora do enum da plataforma (ver `CLUB_EMAIL_TEMPLATES`); a coluna é texto.
      template: NOTICE_TEMPLATE[kind] as unknown as EmailTemplate,
      to: { email, name: sub.holderName },
      data: {
        clubName,
        brandColor: tenant?.primaryColor ?? null,
        logoUrl: tenant?.logoUrl ?? null,
        senderEmail: parseAddress(env.EMAIL_FROM).email,
        holderName: sub.holderName,
        planName: sub.planName,
        description: charge?.description ?? null,
        amount: charge ? Number(charge.amount) : null,
        dueDate: charge?.dueDate ?? null,
        portalUrl: tenant ? `${webBaseUrl}/${tenant.slug}/cliente/faturas` : null,
        // Link direto para a fatura (abre o pagamento no portal).
        payUrl: tenant && charge ? `${webBaseUrl}/${tenant.slug}/cliente/faturas?cobranca=${encodeURIComponent(charge.id)}` : null,
        pixPayload: charge?.method === 'pix' ? charge.pixPayload : null,
        boletoLine: charge?.method === 'boleto' ? charge.boletoIdentificationField : null,
        daysLate: notice.daysLate ?? null,
        cardDeclined: kind === 'overdue' && charge?.method === 'credit_card',
        chargeKind: charge?.kind ?? 'cycle',
        advance: notice.advance === true,
        periodStart: charge?.periodStart ?? null,
        method: charge?.method ?? null,
        paidAt: charge?.paidAt ? charge.paidAt.toISOString() : null,
        paidAmount: charge?.paidAmount ? Number(charge.paidAmount) : null,
        cardLabel:
          charge?.method === 'credit_card' && charge.cardLast4
            ? paymentMethodLabel('credit_card', charge.cardBrand ?? null, charge.cardLast4)
            : null,
      },
      organizationId: sub.organizationId,
      relatedType: charge ? 'club_charge' : 'club_subscription',
      relatedId: charge?.id ?? sub.id,
    })
  } catch (error) {
    result = { id: null, status: 'error' }
    reason = errorText(error).slice(0, 200)
  }

  const delivered = result.status === 'sent' || (result.status === 'simulated' && !deps.production)
  if (delivered) {
    await deps.record({
      ...base,
      message: `${label} enviado para ${email}${when}`,
      payload: { kind, delivered: true, emailId: result.id, emailStatus: result.status },
    })
    return 'sent'
  }
  if (!reason) reason = result.status === 'simulated' ? 'sem provedor de e-mail em produção' : 'provedor recusou o envio'
  logger.warn({ tenantId: sub.organizationId, subscriptionId: sub.id, kind, emailStatus: result.status }, 'Aviso ao associado não enviado')
  await deps.record({
    ...base,
    message: `${label} NÃO enviado para ${email}: ${reason}`,
    payload: { kind, delivered: false, reason, emailId: result.id, emailStatus: result.status },
  })
  return 'failed'
}

async function oldestOpenCharge(subscriptionId: string): Promise<ChargeRow | null> {
  const [row] = await db
    .select()
    .from(clubCharges)
    .where(
      and(
        eq(clubCharges.subscriptionId, subscriptionId),
        eq(clubCharges.kind, 'cycle'),
        inArray(clubCharges.status, OPEN_CHARGE_STATUSES),
      ),
    )
    .orderBy(asc(clubCharges.dueDate))
    .limit(1)
  return row ?? null
}

export async function runForTenant(
  orgId: string,
  now = new Date(),
  options: { throwIfBusy?: boolean; onboardingDeps?: Partial<OnboardingDeps> } = {},
): Promise<BillingAutomationReport> {
  if (runningTenants.has(orgId)) {
    if (options.throwIfBusy) {
      throw AppError.conflict('A automação já está rodando para este clube; tente de novo em alguns segundos')
    }
    return emptyReport(orgId, now, ['automação já em execução para este inquilino'])
  }
  runningTenants.add(orgId)
  try {
    return await run(orgId, now, options.onboardingDeps)
  } finally {
    runningTenants.delete(orgId)
  }
}

function emptyReport(orgId: string, now: Date, errors: string[] = []): BillingAutomationReport {
  return {
    tenantId: orgId,
    ranAt: now.toISOString(),
    durationMs: 0,
    synced: 0,
    generated: 0,
    cardCharged: 0,
    cardFailed: 0,
    remindersSent: 0,
    onboardingEmailsSent: 0,
    markedOverdue: 0,
    suspended: 0,
    canceled: 0,
    reactivated: 0,
    errors,
  }
}

async function run(orgId: string, now: Date, onboardingDeps: Partial<OnboardingDeps> = {}): Promise<BillingAutomationReport> {
  const startedAt = Date.now()
  const report = emptyReport(orgId, now)
  const today = todaySP(now)
  const settings = await loadBillingSettings(orgId)
  let tenantBrand: Promise<TenantBrand | null> | null = null
  const noticeDeps: Partial<NoticeDeps> = { loadTenant: id => (tenantBrand ??= loadTenantBrand(id)) }

  const step = async (name: string, work: () => Promise<void>) => {
    try {
      await work()
    } catch (error) {
      report.errors.push(`${name}: ${errorText(error)}`)
    }
  }
  const item = async (name: string, work: () => Promise<void>) => {
    try {
      await work()
    } catch (error) {
      if (report.errors.length < 50) report.errors.push(`${name}: ${errorText(error)}`)
    }
  }

  // 1. Sincronizar cobranças abertas com o gateway.
  await step('sincronizar', async () => {
    const rows = await db
      .select()
      .from(clubCharges)
      .where(
        and(
          eq(clubCharges.organizationId, orgId),
          inArray(clubCharges.status, ['pending', 'overdue']),
          isNotNull(clubCharges.gatewayChargeId),
          or(
            isNull(clubCharges.lastSyncedAt),
            and(
              eq(clubCharges.gatewayProvider, 'simulated'),
              lt(clubCharges.lastSyncedAt, new Date(now.getTime() - SYNC_INTERVAL_MS.simulated)),
            ),
            and(
              eq(clubCharges.gatewayProvider, 'asaas'),
              lt(clubCharges.lastSyncedAt, new Date(now.getTime() - SYNC_INTERVAL_MS.asaas)),
            ),
          ),
        ),
      )
      .orderBy(sql`${clubCharges.lastSyncedAt} asc nulls first`)
      .limit(SYNC_BATCH)
    for (const charge of rows) {
      await item(`sincronizar ${charge.id}`, async () => {
        await syncCharge(charge, 'automation', now)
        report.synced += 1
      })
    }
  })

  // 2. Checkout abandonado: aguardando pagamento com a cobrança vencida há mais de 7 dias.
  await step('checkout abandonado', async () => {
    const cutoff = addDays(today, -ABANDONED_CHECKOUT_DAYS)
    const rows = await db
      .select()
      .from(clubSubscriptions)
      .where(
        and(
          eq(clubSubscriptions.organizationId, orgId),
          eq(clubSubscriptions.status, 'pending_payment'),
          sql`coalesce((select max(c.due_date) from club_charges c where c.subscription_id = ${clubSubscriptions.id} and c.kind = 'cycle'), (${clubSubscriptions.createdAt} at time zone 'America/Sao_Paulo')::date) < ${cutoff}::date`,
        ),
      )
    for (const sub of rows) {
      await item(`cancelar checkout ${sub.id}`, async () => {
        if (await cancelSubscription(sub, 'checkout_nao_pago', { source: 'automation', now })) report.canceled += 1
      })
    }
  })

  // 3. Gerar a cobrança do próximo ciclo (mesma função do "Adiantar mensalidade"
  // do admin: período já gerado — adiantado ou não — fica de fora pelo `not exists`
  // e, numa corrida, pelo unique parcial do período).
  await step('gerar ciclo', async () => {
    const horizon = addDays(today, settings.generateDaysBefore)
    const rows = await db
      .select()
      .from(clubSubscriptions)
      .where(
        and(
          eq(clubSubscriptions.organizationId, orgId),
          inArray(clubSubscriptions.status, ['active', 'past_due']),
          isNotNull(clubSubscriptions.nextDueDate),
          lte(clubSubscriptions.nextDueDate, horizon),
          sql`not exists (select 1 from club_charges c where c.subscription_id = ${clubSubscriptions.id} and c.kind = 'cycle' and c.period_start = ${clubSubscriptions.nextDueDate})`,
        ),
      )
    if (rows.length === 0) return
    const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, orgId)).limit(1)
    const provider = await resolveGatewayProvider(orgId)

    for (const sub of rows) {
      if (!shouldGenerateCycle(sub.status, sub.nextDueDate, today, settings)) continue
      await item(`gerar ciclo ${sub.id}`, async () => {
        const inserted = await generateCycleCharge(sub, { orgName: org?.name, provider, source: 'automation' })
        if (!inserted) return
        report.generated += 1
        if (inserted.method !== 'credit_card') {
          await submitChargeToGateway(inserted.id, { method: inserted.method, source: 'automation' })
        }
      })
    }
  })

  // 4. Cartão: cobra o token salvo no vencimento, com retentativas espaçadas.
  await step('cartão', async () => {
    const retryCutoff = new Date(now.getTime() - settings.cardRetryIntervalHours * 3_600_000)
    const rows = await db
      .select({ charge: clubCharges })
      .from(clubCharges)
      .innerJoin(clubSubscriptions, eq(clubSubscriptions.id, clubCharges.subscriptionId))
      .where(
        and(
          eq(clubCharges.organizationId, orgId),
          // Avulsa no cartão nunca é cobrada sozinha: o admin cobra na hora ou o associado paga pelo portal.
          eq(clubCharges.kind, 'cycle'),
          eq(clubCharges.method, 'credit_card'),
          inArray(clubCharges.status, ['pending', 'failed']),
          isNull(clubCharges.gatewayChargeId),
          lte(clubCharges.dueDate, today),
          lt(clubCharges.attempts, settings.maxCardRetries),
          or(isNull(clubCharges.lastAttemptAt), lte(clubCharges.lastAttemptAt, retryCutoff)),
          inArray(clubSubscriptions.status, ['active', 'past_due', 'suspended']),
        ),
      )
      .orderBy(asc(clubCharges.dueDate))
      .limit(SYNC_BATCH)
    for (const { charge } of rows) {
      if (!isCardRetryDue(charge, today, now, settings)) continue
      await item(`cartão ${charge.id}`, async () => {
        const result = await withChargeLock(charge.id, () =>
          submitChargeToGateway(charge.id, { method: 'credit_card', useSavedCard: true, source: 'automation' }),
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
      .select({ charge: clubCharges, sub: clubSubscriptions })
      .from(clubCharges)
      .innerJoin(clubSubscriptions, eq(clubSubscriptions.id, clubCharges.subscriptionId))
      .where(
        and(
          eq(clubCharges.organizationId, orgId),
          eq(clubCharges.status, 'pending'),
          isNull(clubCharges.reminderSentAt),
          sql`${clubCharges.dueDate} >= ${today}::date`,
          lte(clubCharges.dueDate, until),
          inArray(clubSubscriptions.status, ['active', 'past_due', 'pending_payment']),
        ),
      )
      .limit(SYNC_BATCH)
    for (const { charge, sub } of rows) {
      if (!isReminderDue(charge, today, settings)) continue
      await item(`lembrete ${charge.id}`, async () => {
        const [marked] = await db
          .update(clubCharges)
          .set({ reminderSentAt: now })
          .where(and(eq(clubCharges.id, charge.id), isNull(clubCharges.reminderSentAt)))
          .returning({ id: clubCharges.id })
        if (!marked) return
        // `reminderSentAt` fica marcado mesmo se o envio falhar: a falha vai para a
        // timeline e não vira reenvio a cada rodada.
        if ((await deliverReminder({ kind: 'reminder', sub, charge }, noticeDeps)) === 'sent') report.remindersSent += 1
      })
    }
  })

  // 6. Vencer: Pix/boleto pendente passou do dia; cartão esgotou as tentativas.
  await step('vencer', async () => {
    const pending = await db
      .select()
      .from(clubCharges)
      .where(
        and(
          eq(clubCharges.organizationId, orgId),
          eq(clubCharges.status, 'pending'),
          inArray(clubCharges.method, ['pix', 'boleto']),
          lt(clubCharges.dueDate, today),
        ),
      )
      .limit(SYNC_BATCH)
    for (const charge of pending) {
      if (!shouldMarkOverdue(charge, today, settings)) continue
      await item(`vencer ${charge.id}`, async () => {
        const outcome = await handleGatewayEvent(
          {
            id: charge.gatewayChargeId ? syntheticEventId(charge.gatewayChargeId, 'PAYMENT_OVERDUE') : null,
            event: 'PAYMENT_OVERDUE',
            payment: { id: charge.gatewayChargeId, externalReference: charge.id, value: Number(charge.amount) },
          },
          { source: 'automation', provider: charge.gatewayProvider, now },
        )
        if (outcome.status === 'applied') report.markedOverdue += 1
      })
    }

    const exhausted = await db
      .update(clubCharges)
      .set({ status: 'overdue', updatedAt: now })
      .where(
        and(
          eq(clubCharges.organizationId, orgId),
          eq(clubCharges.method, 'credit_card'),
          eq(clubCharges.status, 'failed'),
          sql`${clubCharges.attempts} >= ${settings.maxCardRetries}`,
          lt(clubCharges.dueDate, today),
        ),
      )
      .returning()
    for (const charge of exhausted) {
      report.markedOverdue += 1
      await item(`vencer cartão ${charge.id}`, () =>
        recordPaymentEvent(db, {
          organizationId: orgId,
          subscriptionId: charge.subscriptionId,
          chargeId: charge.id,
          type: 'PAYMENT_OVERDUE',
          source: 'automation',
          gatewayProvider: charge.gatewayProvider,
          message: `Cobrança de ${formatBRL(Number(charge.amount))} venceu após ${charge.attempts} tentativa(s) no cartão`,
        }),
      )
    }

    // Avulsa no cartão (link para o associado pagar) que passou do vencimento:
    // só a cobrança vira vencida — nunca a assinatura (ver `applyOverdue`).
    const lateOneOffCard = await db
      .update(clubCharges)
      .set({ status: 'overdue', updatedAt: now })
      .where(
        and(
          eq(clubCharges.organizationId, orgId),
          eq(clubCharges.kind, 'one_off'),
          eq(clubCharges.method, 'credit_card'),
          eq(clubCharges.status, 'pending'),
          lt(clubCharges.dueDate, today),
        ),
      )
      .returning()
    for (const charge of lateOneOffCard) {
      report.markedOverdue += 1
      await item(`vencer avulsa ${charge.id}`, () =>
        recordPaymentEvent(db, {
          organizationId: orgId,
          subscriptionId: charge.subscriptionId,
          chargeId: charge.id,
          type: 'PAYMENT_OVERDUE',
          source: 'automation',
          gatewayProvider: charge.gatewayProvider,
          message: `Cobrança avulsa de ${formatBRL(Number(charge.amount))} venceu em ${formatDateBR(charge.dueDate)} (sem efeito na assinatura)`,
        }),
      )
    }

    // Ativa com MENSALIDADE aberta vencida → em atraso (avulsa não conta).
    // Provider do evento = o da cobrança vencida mais antiga (cai no da assinatura).
    const late = await db
      .select({
        id: clubSubscriptions.id,
        organizationId: clubSubscriptions.organizationId,
        subscriptionProvider: clubSubscriptions.gatewayProvider,
        chargeProvider: sql<PaymentGatewayProvider | null>`(select c.gateway_provider::text from club_charges c where c.subscription_id = ${clubSubscriptions.id} and c.kind = 'cycle' and c.status in ('pending', 'overdue', 'failed') and c.due_date < ${today}::date order by c.due_date asc limit 1)`,
      })
      .from(clubSubscriptions)
      .where(
        and(
          eq(clubSubscriptions.organizationId, orgId),
          eq(clubSubscriptions.status, 'active'),
          sql`exists (select 1 from club_charges c where c.subscription_id = ${clubSubscriptions.id} and c.kind = 'cycle' and c.status in ('pending', 'overdue', 'failed') and c.due_date < ${today}::date)`,
        ),
      )
    for (const sub of late) {
      await item(`em atraso ${sub.id}`, async () => {
        const provider = sub.chargeProvider ?? sub.subscriptionProvider
        await markSubscriptionPastDue(db, sub, 'há cobrança vencida em aberto', { source: 'automation', provider }, now)
      })
    }
  })

  // 6b. Aviso de mensalidade vencida ao associado — uma vez por cobrança, venha o
  // `overdue` da automação ou do webhook do gateway. Marcador: evento `REMINDER_SENT`
  // com `payload.kind = 'overdue'` (entregue ou não; falha não vira reenvio).
  await step('avisos de vencida', async () => {
    const rows = await db
      .select({ charge: clubCharges, sub: clubSubscriptions })
      .from(clubCharges)
      .innerJoin(clubSubscriptions, eq(clubSubscriptions.id, clubCharges.subscriptionId))
      .where(
        and(
          eq(clubCharges.organizationId, orgId),
          // Avulsa vencida não recebe o aviso de inadimplência (fala de carteirinha/benefícios).
          eq(clubCharges.kind, 'cycle'),
          eq(clubCharges.status, 'overdue'),
          sql`${clubCharges.dueDate} >= ${addDays(today, -OVERDUE_NOTICE_WINDOW_DAYS)}::date`,
          inArray(clubSubscriptions.status, ['active', 'past_due', 'suspended']),
          sql`not exists (select 1 from payment_events e where e.charge_id = ${clubCharges.id} and e.type = 'REMINDER_SENT' and e.payload->>'kind' = 'overdue')`,
        ),
      )
      .orderBy(asc(clubCharges.dueDate))
      .limit(SYNC_BATCH)
    for (const { charge, sub } of rows) {
      await item(`aviso de vencida ${charge.id}`, async () => {
        const daysLate = diffDays(today, charge.dueDate)
        if ((await deliverReminder({ kind: 'overdue', sub, charge, daysLate }, noticeDeps)) === 'sent') report.remindersSent += 1
      })
    }
  })

  // 6c. Régua "assine seu plano": associado sem assinatura viva (nunca assinou ou
  // checkout não pago) recebe D0/D1/D3/D7 — no máximo 1 e-mail por pessoa por
  // rodada, cada passo 1× (reserva em `club_onboarding_emails`). Para sozinha
  // quando a assinatura fica ativa: a elegibilidade é relida a cada rodada.
  await step('régua assine seu plano', async () => {
    const candidates = await listOnboardingCandidates(orgId, now)
    for (const candidate of candidates) {
      const next = onboardingStepFor(candidate, now)
      if (!next) continue
      await item(`assine seu plano ${candidate.target.userId}`, async () => {
        if ((await deliverOnboardingEmail(candidate.target, next, onboardingDeps)) === 'sent') {
          report.onboardingEmailsSent = (report.onboardingEmailsSent ?? 0) + 1
        }
      })
    }
  })

  // 7–8. Suspender / cancelar pela cobrança aberta mais antiga.
  await step('inadimplência', async () => {
    const rows = await db
      .select({
        sub: clubSubscriptions,
        oldestDue: sql<string>`(select min(c.due_date)::text from club_charges c where c.subscription_id = ${clubSubscriptions.id} and c.kind = 'cycle' and c.status in ('pending', 'overdue', 'failed'))`,
      })
      .from(clubSubscriptions)
      .where(and(eq(clubSubscriptions.organizationId, orgId), inArray(clubSubscriptions.status, ['past_due', 'suspended'])))
    for (const { sub, oldestDue } of rows) {
      const action = delinquencyAction(sub.status, oldestDue, today, settings)
      if (!action) continue
      const daysLate = diffDays(today, oldestDue!)
      await item(`inadimplência ${sub.id}`, async () => {
        if (action === 'cancel') {
          if (await cancelSubscription(sub, 'inadimplencia', { source: 'automation', now })) report.canceled += 1
          return
        }
        {
          const [suspended] = await db
            .update(clubSubscriptions)
            .set({ status: 'suspended', suspendedAt: now, updatedAt: now })
            .where(and(eq(clubSubscriptions.id, sub.id), eq(clubSubscriptions.status, 'past_due')))
            .returning({ id: clubSubscriptions.id })
          if (!suspended) return
          report.suspended += 1
          await recordPaymentEvent(db, {
            organizationId: orgId,
            subscriptionId: sub.id,
            type: 'SUBSCRIPTION_SUSPENDED',
            source: 'automation',
            gatewayProvider: sub.gatewayProvider,
            message: `Assinatura suspensa: cobrança vencida há ${daysLate} dias — carteirinhas bloqueadas`,
          })
          // Suspensão já aplicada: falha do aviso fica na timeline, não desfaz nada.
          const charge = await oldestOpenCharge(sub.id)
          if ((await deliverReminder({ kind: 'suspended', sub, charge, daysLate }, noticeDeps)) === 'sent') report.remindersSent += 1
        }
      })
    }
  })

  // 9. Rede de segurança: em atraso/suspensa sem cobrança vencida em aberto → ativa.
  await step('reativar', async () => {
    const rows = await db
      .select({ id: clubSubscriptions.id, organizationId: clubSubscriptions.organizationId, provider: clubSubscriptions.gatewayProvider })
      .from(clubSubscriptions)
      .where(and(eq(clubSubscriptions.organizationId, orgId), inArray(clubSubscriptions.status, ['past_due', 'suspended'])))
    for (const sub of rows) {
      await item(`reativar ${sub.id}`, async () => {
        if (await reactivateIfSettled(db, sub, { source: 'automation', provider: sub.provider }, now)) report.reactivated += 1
      })
    }
  })

  // 10. Carimbo da última rodada.
  await step('registrar rodada', () => settingsService.touchAutomationRun(orgId, now))

  report.durationMs = Date.now() - startedAt
  return report
}

/**
 * Todos os inquilinos com assinaturas do clube OU com associado recém-chegado
 * (régua "assine seu plano" — quem nunca assinou não tem linha em
 * `club_subscriptions`). Falha de um não derruba os outros.
 */
export async function runAll(now = new Date()): Promise<BillingAutomationReport[]> {
  const [withSubscriptions, withNewClients] = await Promise.all([
    db.selectDistinct({ organizationId: clubSubscriptions.organizationId }).from(clubSubscriptions),
    db
      .selectDistinct({ organizationId: member.organizationId })
      .from(member)
      .where(and(eq(member.role, 'client'), gte(member.createdAt, new Date(now.getTime() - ONBOARDING_WINDOW_DAYS * 86_400_000)))),
  ])
  const tenants = [...new Set([...withSubscriptions, ...withNewClients].map(row => row.organizationId))].map(organizationId => ({ organizationId }))
  const reports: BillingAutomationReport[] = []
  for (const { organizationId } of tenants) {
    try {
      reports.push(await runForTenant(organizationId, now))
    } catch (error) {
      logger.error({ tenantId: organizationId, err: errorText(error) }, 'Automação de cobrança falhou para o inquilino')
    }
  }
  return reports
}

let schedulerStarted = false
let running = false
let stopping = false
let firstTimer: ReturnType<typeof setTimeout> | null = null
let intervalTimer: ReturnType<typeof setInterval> | null = null

/**
 * Encerramento (SIGTERM): para os timers e espera a rodada em curso terminar
 * (até `maxWaitMs`). `false` = a rodada ainda rodava quando o prazo acabou.
 */
export async function stopBillingAutomation(maxWaitMs = 20_000): Promise<boolean> {
  stopping = true
  if (firstTimer) clearTimeout(firstTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  firstTimer = null
  intervalTimer = null
  const deadline = Date.now() + maxWaitMs
  while (running && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
  return !running
}

/**
 * Timer do motor (chamado por `src/index.ts`, nunca por `vercel.ts`): 1ª
 * rodada 10 s após o boot, depois a cada `BILLING_AUTOMATION_INTERVAL_SECONDS`.
 * Mutex em processo (pula se a anterior ainda roda), `unref()` para não
 * segurar o processo, desligável por `BILLING_AUTOMATION_ENABLED=false`.
 */
export function startBillingAutomation(): void {
  if (schedulerStarted || !billingAutomationEnabled) return
  schedulerStarted = true

  const tick = async () => {
    if (stopping) return
    if (running) {
      logger.debug('Automação de cobrança ainda rodando; pulando esta rodada')
      return
    }
    running = true
    try {
      const reports = await runAll()
      const totals = reports.reduce(
        (acc, report) => {
          acc.tenants += 1
          acc.changes +=
            report.generated +
            report.cardCharged +
            report.cardFailed +
            report.remindersSent +
            (report.onboardingEmailsSent ?? 0) +
            report.markedOverdue +
            report.suspended +
            report.canceled +
            report.reactivated
          acc.errors += report.errors.length
          return acc
        },
        { tenants: 0, changes: 0, errors: 0 },
      )
      if (totals.changes > 0 || totals.errors > 0) {
        logger.info(totals, 'Automação de cobrança do clube')
      }
    } catch (error) {
      logger.error({ err: errorText(error) }, 'Automação de cobrança falhou')
    } finally {
      running = false
    }
  }

  firstTimer = setTimeout(() => {
    firstTimer = null
    if (stopping) return
    void tick()
    intervalTimer = setInterval(() => void tick(), env.BILLING_AUTOMATION_INTERVAL_SECONDS * 1000)
    intervalTimer.unref()
  }, 10_000)
  firstTimer.unref()
  logger.info({ intervalSeconds: env.BILLING_AUTOMATION_INTERVAL_SECONDS }, 'Automação de cobrança do clube agendada')
}
