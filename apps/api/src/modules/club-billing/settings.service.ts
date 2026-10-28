import type { BillingSettings, ClubPaymentMethod, PaymentGatewayProvider, UpdateBillingSettingsInput } from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { billingAutomationEnabled, env, isProduction } from '@/config/env'
import { db } from '@/db/client'
import { clubBillingSettings } from '@/db/schema'
import { AppError } from '@/http/errors'
import { describeGateway } from '@/integrations/payments/provider'
import { resolveClubAsaasCredentials } from './receiving-account.service'

/**
 * Régua de cobrança do inquilino (`billing_settings`). Sem linha = padrões:
 * o GET não insere nada; o PATCH (e a automação, para `last_automation_run_at`)
 * fazem upsert.
 */

export interface ResolvedBillingSettings {
  gatewayOverride: PaymentGatewayProvider | null
  enabledMethods: ClubPaymentMethod[]
  generateDaysBefore: number
  reminderDaysBefore: number
  maxCardRetries: number
  cardRetryIntervalHours: number
  suspendAfterDays: number
  cancelAfterDays: number
  boletoDueDays: number
  finePercent: number
  interestMonthlyPercent: number
  lastAutomationRunAt: Date | null
}

export const DEFAULT_BILLING_SETTINGS: ResolvedBillingSettings = {
  gatewayOverride: null,
  enabledMethods: ['pix', 'boleto', 'credit_card'],
  generateDaysBefore: 10,
  reminderDaysBefore: 3,
  maxCardRetries: 3,
  cardRetryIntervalHours: 24,
  suspendAfterDays: 15,
  cancelAfterDays: 60,
  boletoDueDays: 3,
  finePercent: 2,
  interestMonthlyPercent: 1,
  lastAutomationRunAt: null,
}

const METHOD_ORDER: ClubPaymentMethod[] = ['pix', 'boleto', 'credit_card']

function fromRow(row: typeof clubBillingSettings.$inferSelect | undefined): ResolvedBillingSettings {
  if (!row) return { ...DEFAULT_BILLING_SETTINGS }
  const methods = METHOD_ORDER.filter(method => (row.enabledMethods ?? []).includes(method))
  return {
    gatewayOverride: row.gateway,
    enabledMethods: methods.length > 0 ? methods : [...DEFAULT_BILLING_SETTINGS.enabledMethods],
    generateDaysBefore: row.generateDaysBefore,
    reminderDaysBefore: row.reminderDaysBefore,
    maxCardRetries: row.maxCardRetries,
    cardRetryIntervalHours: row.cardRetryIntervalHours,
    suspendAfterDays: row.suspendAfterDays,
    cancelAfterDays: row.cancelAfterDays,
    boletoDueDays: row.boletoDueDays,
    finePercent: Number(row.finePercent),
    interestMonthlyPercent: Number(row.interestMonthlyPercent),
    lastAutomationRunAt: row.lastAutomationRunAt,
  }
}

export async function loadBillingSettings(orgId: string): Promise<ResolvedBillingSettings> {
  const [row] = await db
    .select()
    .from(clubBillingSettings)
    .where(eq(clubBillingSettings.organizationId, orgId))
    .limit(1)
  return fromRow(row)
}

export async function toBillingSettingsDto(orgId: string, settings: ResolvedBillingSettings): Promise<BillingSettings> {
  let provider: PaymentGatewayProvider
  let sandbox: boolean
  let asaasConfigured: boolean
  try {
    const gateway = await describeGateway(orgId, settings.gatewayOverride)
    provider = gateway.provider
    sandbox = gateway.sandbox
    asaasConfigured = gateway.provider === 'asaas' ? gateway.receivingConfigured : Boolean(await resolveClubAsaasCredentials(orgId))
  } catch (error) {
    // Só em produção com override `simulated` gravado: a tela de configurações
    // precisa abrir mesmo assim para o admin corrigir.
    if (!isProduction) throw error
    const credentials = await resolveClubAsaasCredentials(orgId)
    provider = 'asaas'
    sandbox = credentials?.env === 'sandbox'
    asaasConfigured = Boolean(credentials)
  }
  return {
    gateway: provider,
    gatewayOverride: settings.gatewayOverride,
    asaasConfigured,
    sandbox,
    enabledMethods: settings.enabledMethods,
    generateDaysBefore: settings.generateDaysBefore,
    reminderDaysBefore: settings.reminderDaysBefore,
    maxCardRetries: settings.maxCardRetries,
    cardRetryIntervalHours: settings.cardRetryIntervalHours,
    suspendAfterDays: settings.suspendAfterDays,
    cancelAfterDays: settings.cancelAfterDays,
    boletoDueDays: settings.boletoDueDays,
    finePercent: settings.finePercent,
    interestMonthlyPercent: settings.interestMonthlyPercent,
    automation: {
      enabled: billingAutomationEnabled,
      intervalSeconds: env.BILLING_AUTOMATION_INTERVAL_SECONDS,
      lastRunAt: settings.lastAutomationRunAt ? settings.lastAutomationRunAt.toISOString() : null,
    },
  }
}

export const settingsService = {
  async get(orgId: string): Promise<BillingSettings> {
    return toBillingSettingsDto(orgId, await loadBillingSettings(orgId))
  },

  async update(orgId: string, input: UpdateBillingSettingsInput): Promise<BillingSettings> {
    const current = await loadBillingSettings(orgId)
    const merged: ResolvedBillingSettings = {
      ...current,
      ...(input.gatewayOverride !== undefined ? { gatewayOverride: input.gatewayOverride } : {}),
      ...(input.enabledMethods !== undefined
        ? { enabledMethods: METHOD_ORDER.filter(method => input.enabledMethods!.includes(method)) }
        : {}),
      ...(input.generateDaysBefore !== undefined ? { generateDaysBefore: input.generateDaysBefore } : {}),
      ...(input.reminderDaysBefore !== undefined ? { reminderDaysBefore: input.reminderDaysBefore } : {}),
      ...(input.maxCardRetries !== undefined ? { maxCardRetries: input.maxCardRetries } : {}),
      ...(input.cardRetryIntervalHours !== undefined ? { cardRetryIntervalHours: input.cardRetryIntervalHours } : {}),
      ...(input.suspendAfterDays !== undefined ? { suspendAfterDays: input.suspendAfterDays } : {}),
      ...(input.cancelAfterDays !== undefined ? { cancelAfterDays: input.cancelAfterDays } : {}),
      ...(input.boletoDueDays !== undefined ? { boletoDueDays: input.boletoDueDays } : {}),
      ...(input.finePercent !== undefined ? { finePercent: input.finePercent } : {}),
      ...(input.interestMonthlyPercent !== undefined ? { interestMonthlyPercent: input.interestMonthlyPercent } : {}),
    }

    if (merged.cancelAfterDays <= merged.suspendAfterDays) {
      throw AppError.validation(
        [{ path: 'cancelAfterDays', message: 'O cancelamento precisa vir depois da suspensão' }],
        'O prazo de cancelamento precisa ser maior que o de suspensão',
      )
    }
    if (merged.enabledMethods.length === 0) {
      throw AppError.validation([{ path: 'enabledMethods', message: 'Habilite ao menos um meio de pagamento' }])
    }
    if (isProduction && input.gatewayOverride === 'simulated') {
      throw AppError.businessRule('Gateway simulado não é permitido em produção')
    }
    if (input.gatewayOverride === 'asaas' && !(await resolveClubAsaasCredentials(orgId))) {
      throw AppError.businessRule('Conecte a conta Asaas do clube (Configurações → Recebimento) antes de escolher o Asaas')
    }

    const values = {
      gateway: merged.gatewayOverride,
      enabledMethods: merged.enabledMethods,
      generateDaysBefore: merged.generateDaysBefore,
      reminderDaysBefore: merged.reminderDaysBefore,
      maxCardRetries: merged.maxCardRetries,
      cardRetryIntervalHours: merged.cardRetryIntervalHours,
      suspendAfterDays: merged.suspendAfterDays,
      cancelAfterDays: merged.cancelAfterDays,
      boletoDueDays: merged.boletoDueDays,
      finePercent: String(merged.finePercent),
      interestMonthlyPercent: String(merged.interestMonthlyPercent),
      updatedAt: new Date(),
    }
    await db
      .insert(clubBillingSettings)
      .values({ organizationId: orgId, ...values })
      .onConflictDoUpdate({ target: clubBillingSettings.organizationId, set: values })

    return toBillingSettingsDto(orgId, merged)
  },

  /** Marca a última rodada da automação (upsert sem mexer no resto). */
  async touchAutomationRun(orgId: string, ranAt: Date): Promise<void> {
    await db
      .insert(clubBillingSettings)
      .values({ organizationId: orgId, lastAutomationRunAt: ranAt })
      .onConflictDoUpdate({ target: clubBillingSettings.organizationId, set: { lastAutomationRunAt: ranAt } })
  },
}
