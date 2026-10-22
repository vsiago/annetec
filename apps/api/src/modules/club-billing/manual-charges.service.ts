import {
  CLUB_PAYMENT_METHOD_LABELS,
  ONE_OFF_CHARGE_LIMITS,
  formatBRL,
  formatDateBR,
  type CreateManualClubChargeInput,
  type ManualChargePreview,
  type ManualChargeResult,
  type PaymentGatewayProvider,
} from '@annetec/contracts'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubCharges, organization } from '@/db/schema'
import { AppError } from '@/http/errors'
import { resolveGatewayProvider } from '@/integrations/payments/provider'
import { deliverReminder, type ClubNotice, type NoticeOutcome } from './automation.service'
import { submitChargeToGateway, withChargeLock, type PaymentAttempt } from './charges.service'
import { generateCycleCharge, nextCycleOf, type GenerateCycleOptions } from './cycle.service'
import { addDays, monthLabel, todaySP } from './dates'
import { recordPaymentEvent, type RecordEventInput } from './events.service'
import {
  advanceAlreadyGeneratedMessage,
  manualChargeIneligibility,
  manualChargeOutcomeOf,
  oneOffDueDateIssue,
  oneOffDueWindow,
  usableSavedCard,
} from './manual-charges.rules'
import { toClubCharge, type ChargeRow, type SubscriptionRow } from './presenter'
import { loadBillingSettings } from './settings.service'
import { findSubscriptionOfTenant } from './subscriptions.service'

/**
 * "Gerar cobrança" do admin numa assinatura `active`/`past_due`:
 *
 *  - **Adiantar mensalidade** (`advance`): gera AGORA a mensalidade do próximo
 *    período ainda não gerado, pela MESMA função da automação
 *    (`generateCycleCharge`: mesmo período, valor e descrição). O vencimento é
 *    o do ciclo — nada muda na data do plano — e a automação não gera de novo
 *    (o período já existe; numa corrida, o unique parcial devolve `null`).
 *  - **Cobrança avulsa** (`one_off`): descrição/valor/vencimento livres
 *    (limites em `ONE_OFF_CHARGE_LIMITS`), período vazio na data de emissão,
 *    sem efeito em assinatura, ciclo ou inadimplência.
 *
 * Forma de pagamento: Pix/boleto emitem no gateway na hora; cartão cobra o
 * cartão salvo agora (`chargeSavedCard`) ou fica em aberto para o associado
 * pagar no portal. O associado recebe e-mail com a marca do clube (nova
 * cobrança, ou comprovante quando o cartão foi aprovado).
 *
 * Clique duplo: trava em memória por assinatura + `idempotencyKey` do cliente
 * gravada na linha (unique por assinatura) — repetir a chave devolve a mesma
 * cobrança, sem efeito novo.
 */

export interface ManualChargeDeps {
  loadSubscription: (orgId: string, subscriptionId: string) => Promise<SubscriptionRow>
  loadSettings: (orgId: string) => Promise<{ enabledMethods: string[]; boletoDueDays: number; reminderDaysBefore: number }>
  resolveProvider: (orgId: string) => Promise<PaymentGatewayProvider>
  loadOrgName: (orgId: string) => Promise<string | null>
  findCycleCharge: (subscriptionId: string, periodStart: string) => Promise<ChargeRow | null>
  findByIdempotencyKey: (subscriptionId: string, key: string) => Promise<ChargeRow | null>
  generateCycle: (sub: SubscriptionRow, options: GenerateCycleOptions) => Promise<ChargeRow | null>
  /** `null` = a chave de idempotência já existe (corrida de clique duplo). */
  insertOneOff: (values: typeof clubCharges.$inferInsert) => Promise<ChargeRow | null>
  record: (input: RecordEventInput) => Promise<void>
  submit: (chargeId: string, attempt: PaymentAttempt) => Promise<ChargeRow>
  notify: (notice: ClubNotice) => Promise<NoticeOutcome>
  /** Marca o lembrete como já enviado (o aviso de criação fez o papel dele). */
  markReminded: (chargeId: string) => Promise<void>
  today: () => string
}

const defaultDeps: ManualChargeDeps = {
  loadSubscription: findSubscriptionOfTenant,
  loadSettings: loadBillingSettings,
  resolveProvider: resolveGatewayProvider,
  loadOrgName: async orgId => {
    const [row] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, orgId)).limit(1)
    return row?.name ?? null
  },
  findCycleCharge: async (subscriptionId, periodStart) => {
    const [row] = await db
      .select()
      .from(clubCharges)
      .where(
        and(
          eq(clubCharges.subscriptionId, subscriptionId),
          eq(clubCharges.kind, 'cycle'),
          eq(clubCharges.periodStart, periodStart),
        ),
      )
      .limit(1)
    return row ?? null
  },
  findByIdempotencyKey: async (subscriptionId, key) => {
    const [row] = await db
      .select()
      .from(clubCharges)
      .where(and(eq(clubCharges.subscriptionId, subscriptionId), eq(clubCharges.idempotencyKey, key)))
      .limit(1)
    return row ?? null
  },
  generateCycle: generateCycleCharge,
  insertOneOff: async values => {
    const [row] = await db.insert(clubCharges).values(values).onConflictDoNothing().returning()
    return row ?? null
  },
  record: input => recordPaymentEvent(db, input),
  submit: submitChargeToGateway,
  notify: notice => deliverReminder(notice),
  markReminded: async chargeId => {
    await db
      .update(clubCharges)
      .set({ reminderSentAt: new Date() })
      .where(and(eq(clubCharges.id, chargeId), isNull(clubCharges.reminderSentAt)))
  },
  today: () => todaySP(),
}

// Uma geração por assinatura por vez (clique duplo, duas abas).
const generating = new Set<string>()

async function withSubscriptionLock<T>(subscriptionId: string, work: () => Promise<T>): Promise<T> {
  if (generating.has(subscriptionId)) {
    throw AppError.conflict('Já existe uma cobrança sendo gerada para esta assinatura. Aguarde alguns segundos.')
  }
  generating.add(subscriptionId)
  try {
    return await work()
  } finally {
    generating.delete(subscriptionId)
  }
}

function chargeDto(charge: ChargeRow, sub: SubscriptionRow) {
  return toClubCharge(charge, sub)
}

export interface ManualChargeContext {
  actorUserId: string | null
}

export const manualChargesService = {
  async preview(orgId: string, subscriptionId: string, overrides: Partial<ManualChargeDeps> = {}): Promise<ManualChargePreview> {
    const deps = { ...defaultDeps, ...overrides }
    const sub = await deps.loadSubscription(orgId, subscriptionId)
    const [settings, provider, orgName] = await Promise.all([
      deps.loadSettings(orgId),
      deps.resolveProvider(orgId),
      deps.loadOrgName(orgId),
    ])
    const today = deps.today()
    const ineligible = manualChargeIneligibility(sub.status)
    const cycle = nextCycleOf(sub, orgName)
    const existing = cycle ? await deps.findCycleCharge(sub.id, cycle.periodStart) : null
    const window = oneOffDueWindow(today, settings.boletoDueDays)

    const unavailableReason = ineligible
      ? ineligible
      : !cycle
        ? 'A assinatura ainda não tem o próximo vencimento definido'
        : existing
          ? advanceAlreadyGeneratedMessage(existing.dueDate)
          : null

    return {
      subscriptionId: sub.id,
      status: sub.status,
      eligible: ineligible === null,
      ineligibleReason: ineligible,
      holderName: sub.holderName,
      holderEmail: sub.holderEmail,
      planName: sub.planName,
      preferredMethod: sub.paymentMethod,
      enabledMethods: settings.enabledMethods as ManualChargePreview['enabledMethods'],
      savedCard: usableSavedCard(sub, provider),
      advance: {
        available: unavailableReason === null,
        unavailableReason,
        periodStart: cycle?.periodStart ?? null,
        periodEnd: cycle?.periodEnd ?? null,
        dueDate: cycle?.dueDate ?? null,
        amount: Number(sub.amount),
        label: cycle ? `Mensalidade ${monthLabel(cycle.periodStart)}` : null,
        existingCharge: existing
          ? { id: existing.id, dueDate: existing.dueDate, status: existing.status, amount: Number(existing.amount) }
          : null,
      },
      oneOff: {
        minDueDate: window.min,
        maxDueDate: window.max,
        defaultDueDate: window.suggested,
        maxAmount: ONE_OFF_CHARGE_LIMITS.amountMax,
        descriptionMax: ONE_OFF_CHARGE_LIMITS.descriptionMax,
      },
    }
  },

  async create(
    orgId: string,
    subscriptionId: string,
    input: CreateManualClubChargeInput,
    ctx: ManualChargeContext,
    overrides: Partial<ManualChargeDeps> = {},
  ): Promise<ManualChargeResult> {
    const deps = { ...defaultDeps, ...overrides }
    // 404 antes da trava (assinatura de outro inquilino nem chega a travar).
    const found = await deps.loadSubscription(orgId, subscriptionId)

    return withSubscriptionLock(found.id, async () => {
      const sub = await deps.loadSubscription(orgId, subscriptionId)
      const ineligible = manualChargeIneligibility(sub.status)
      if (ineligible) throw AppError.businessRule(ineligible)

      const key = input.idempotencyKey ?? null
      if (key) {
        const previous = await deps.findByIdempotencyKey(sub.id, key)
        if (previous) return reusedResult(previous, sub, input.chargeSavedCard)
      }

      const settings = await deps.loadSettings(orgId)
      if (!settings.enabledMethods.includes(input.method)) {
        throw AppError.validation(
          [{ path: 'method', message: `${CLUB_PAYMENT_METHOD_LABELS[input.method]} não está habilitado neste clube` }],
          'Forma de pagamento indisponível',
        )
      }
      const provider = await deps.resolveProvider(orgId)
      const savedCard = usableSavedCard(sub, provider)
      if (input.chargeSavedCard && !savedCard) {
        throw AppError.businessRule('Esta assinatura não tem cartão salvo para cobrar agora — envie o link para o associado pagar')
      }

      let charge: ChargeRow
      if (input.type === 'advance') {
        const orgName = await deps.loadOrgName(orgId)
        const cycle = nextCycleOf(sub, orgName)
        if (!cycle) throw AppError.businessRule('A assinatura ainda não tem o próximo vencimento definido')
        const existing = await deps.findCycleCharge(sub.id, cycle.periodStart)
        if (existing) throw AppError.conflict(advanceAlreadyGeneratedMessage(existing.dueDate))
        const inserted = await deps.generateCycle(sub, {
          orgName,
          provider,
          source: 'manual',
          method: input.method,
          actorUserId: ctx.actorUserId,
          idempotencyKey: key,
        })
        if (!inserted) {
          const raced = key ? await deps.findByIdempotencyKey(sub.id, key) : null
          if (raced) return reusedResult(raced, sub, input.chargeSavedCard)
          throw AppError.conflict(advanceAlreadyGeneratedMessage(cycle.dueDate))
        }
        charge = inserted
      } else {
        const today = deps.today()
        const issue = oneOffDueDateIssue(input.dueDate, today)
        if (issue) throw AppError.validation([{ path: 'dueDate', message: issue }])
        const inserted = await deps.insertOneOff({
          organizationId: orgId,
          subscriptionId: sub.id,
          kind: 'one_off',
          // Período vazio na data de emissão: fora do unique de período e de qualquer "período corrente".
          periodStart: today,
          periodEnd: today,
          dueDate: input.dueDate,
          amount: input.amount.toFixed(2),
          method: input.method,
          status: 'pending',
          description: input.description,
          gatewayProvider: provider,
          idempotencyKey: key,
        })
        if (!inserted) {
          const raced = key ? await deps.findByIdempotencyKey(sub.id, key) : null
          if (raced) return reusedResult(raced, sub, input.chargeSavedCard)
          throw AppError.conflict('Não foi possível gravar a cobrança; atualize a tela e tente de novo')
        }
        charge = inserted
        await deps.record({
          organizationId: orgId,
          subscriptionId: sub.id,
          chargeId: charge.id,
          type: 'CHARGE_GENERATED',
          source: 'manual',
          gatewayProvider: provider,
          message: `Cobrança avulsa de ${formatBRL(input.amount)} gerada pelo administrador — ${input.description} — ${CLUB_PAYMENT_METHOD_LABELS[input.method]}, vence em ${formatDateBR(input.dueDate)}`,
          payload: { manual: true, type: 'one_off' },
          actorUserId: ctx.actorUserId,
        })
      }

      // Gateway: Pix/boleto emitem agora; cartão só se o admin confirmou a cobrança no cartão salvo.
      const chargedSavedCard = input.method === 'credit_card' && input.chargeSavedCard
      if (input.method !== 'credit_card') {
        charge = await deps.submit(charge.id, { method: input.method, source: 'manual', actorUserId: ctx.actorUserId })
      } else if (chargedSavedCard) {
        const id = charge.id
        charge = await withChargeLock(id, () =>
          deps.submit(id, { method: 'credit_card', useSavedCard: true, source: 'manual', actorUserId: ctx.actorUserId }),
        )
      }

      const { outcome, message } = manualChargeOutcomeOf(charge, chargedSavedCard)
      const noticeKind = outcome === 'card_approved' ? 'payment_confirmed' : outcome === 'created' ? 'charge_created' : null
      const notice: NoticeOutcome = noticeKind
        ? await deps
            .notify({
              kind: noticeKind,
              sub,
              charge,
              advance: input.type === 'advance',
              source: 'manual',
              actorUserId: ctx.actorUserId,
            })
            .catch(() => 'failed' as const)
        : 'skipped'

      // O aviso de criação já vale como lembrete quando o vencimento está dentro da
      // janela da régua — sem isto o associado receberia dois e-mails no mesmo minuto.
      if (noticeKind === 'charge_created' && notice === 'sent' && charge.dueDate <= addDays(deps.today(), settings.reminderDaysBefore)) {
        await deps.markReminded(charge.id).catch(() => {})
      }

      return { outcome, message, reused: false, notice, charge: chargeDto(charge, sub) }
    })
  },
}

function reusedResult(charge: ChargeRow, sub: SubscriptionRow, chargeSavedCard: boolean): ManualChargeResult {
  const { outcome, message } = manualChargeOutcomeOf(charge, charge.method === 'credit_card' && chargeSavedCard)
  return { outcome, message, reused: true, notice: 'skipped', charge: chargeDto(charge, sub) }
}
