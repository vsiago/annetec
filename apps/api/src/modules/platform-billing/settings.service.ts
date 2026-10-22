import {
  DEFAULT_PLATFORM_BILLING_POLICY,
  validatePlatformDunningOrder,
  type ClubPaymentMethod,
  type PaymentGatewayProvider,
  type PlatformBillingSettings,
  type UpdatePlatformBillingSettingsInput,
} from '@annetec/contracts'
import { eq } from 'drizzle-orm'
import { demoToolsAllowed, env, isProduction, platformBillingAutomationEnabled, platformDemoToolsEnabled } from '@/config/env'
import { db } from '@/db/client'
import { platformBillingConfig } from '@/db/schema'
import { AppError } from '@/http/errors'
import { effectivePlatformProvider, isPlatformAsaasConfigured, platformGatewayFor } from './gateway'

/**
 * Régua da plataforma — linha única `platform_billing_settings.id = 'default'`
 * (sem linha = `DEFAULT_PLATFORM_BILLING_POLICY`).
 */

export const PLATFORM_SETTINGS_ID = 'default'
const METHOD_ORDER: ClubPaymentMethod[] = ['pix', 'boleto', 'credit_card']

export interface ResolvedPlatformSettings {
  gatewayOverride: PaymentGatewayProvider | null
  enabledMethods: ClubPaymentMethod[]
  generateDaysBefore: number
  reminderDaysBefore: number
  restrictAfterDays: number
  suspendAfterDays: number
  cancelAfterDays: number
  boletoDueDays: number
  finePercent: number
  interestMonthlyPercent: number
  maxCardRetries: number
  cardRetryIntervalHours: number
  activationExpiryDays: number
  draftExpiryDays: number
  lastAutomationRunAt: Date | null
}

export const DEFAULT_PLATFORM_SETTINGS: ResolvedPlatformSettings = {
  gatewayOverride: null,
  ...DEFAULT_PLATFORM_BILLING_POLICY,
  enabledMethods: [...DEFAULT_PLATFORM_BILLING_POLICY.enabledMethods],
  lastAutomationRunAt: null,
}

type SettingsRow = typeof platformBillingConfig.$inferSelect

export function resolvePlatformSettings(row: SettingsRow | undefined | null): ResolvedPlatformSettings {
  if (!row) return { ...DEFAULT_PLATFORM_SETTINGS, enabledMethods: [...DEFAULT_PLATFORM_SETTINGS.enabledMethods] }
  const methods = METHOD_ORDER.filter(method => (row.enabledMethods ?? []).includes(method))
  return {
    gatewayOverride: row.gateway ?? null,
    enabledMethods: methods.length > 0 ? methods : [...DEFAULT_PLATFORM_SETTINGS.enabledMethods],
    generateDaysBefore: row.generateDaysBefore,
    reminderDaysBefore: row.reminderDaysBefore,
    restrictAfterDays: row.restrictAfterDays,
    suspendAfterDays: row.suspendAfterDays,
    cancelAfterDays: row.cancelAfterDays,
    boletoDueDays: row.boletoDueDays,
    finePercent: Number(row.finePercent),
    interestMonthlyPercent: Number(row.interestMonthlyPercent),
    maxCardRetries: row.maxCardRetries,
    cardRetryIntervalHours: row.cardRetryIntervalHours,
    activationExpiryDays: row.activationExpiryDays,
    draftExpiryDays: row.draftExpiryDays,
    lastAutomationRunAt: row.lastAutomationRunAt ?? null,
  }
}

export async function loadPlatformSettings(): Promise<ResolvedPlatformSettings> {
  const [row] = await db
    .select()
    .from(platformBillingConfig)
    .where(eq(platformBillingConfig.id, PLATFORM_SETTINGS_ID))
    .limit(1)
  return resolvePlatformSettings(row)
}

/** Gateway efetivo para cobranças NOVAS. */
export function currentPlatformProvider(settings: Pick<ResolvedPlatformSettings, 'gatewayOverride'>): PaymentGatewayProvider {
  return effectivePlatformProvider(settings.gatewayOverride)
}

/** "Avançar dias" liberado: nunca em produção; env (padrão fora de produção) E gateway simulado. */
export function demoToolsAvailable(settings: Pick<ResolvedPlatformSettings, 'gatewayOverride'>): boolean {
  if (!demoToolsAllowed) return false
  return platformDemoToolsEnabled && currentPlatformProvider(settings) === 'simulated'
}

export function toPlatformSettingsDto(settings: ResolvedPlatformSettings): PlatformBillingSettings {
  let gateway: PaymentGatewayProvider
  try {
    gateway = currentPlatformProvider(settings)
  } catch (error) {
    // Só em produção com override `simulated` gravado/Asaas sem chave: a tela
    // da régua precisa abrir mesmo assim para o superadmin corrigir.
    if (!isProduction) throw error
    gateway = 'asaas'
  }
  let sandbox = false
  try {
    sandbox = platformGatewayFor(gateway).sandbox
  } catch {
    sandbox = false
  }
  return {
    gateway,
    gatewayOverride: settings.gatewayOverride,
    asaasConfigured: isPlatformAsaasConfigured(),
    sandbox,
    enabledMethods: settings.enabledMethods,
    generateDaysBefore: settings.generateDaysBefore,
    reminderDaysBefore: settings.reminderDaysBefore,
    restrictAfterDays: settings.restrictAfterDays,
    suspendAfterDays: settings.suspendAfterDays,
    cancelAfterDays: settings.cancelAfterDays,
    boletoDueDays: settings.boletoDueDays,
    finePercent: settings.finePercent,
    interestMonthlyPercent: settings.interestMonthlyPercent,
    maxCardRetries: settings.maxCardRetries,
    cardRetryIntervalHours: settings.cardRetryIntervalHours,
    activationExpiryDays: settings.activationExpiryDays,
    draftExpiryDays: settings.draftExpiryDays,
    automation: {
      enabled: platformBillingAutomationEnabled,
      intervalSeconds: env.PLATFORM_BILLING_AUTOMATION_INTERVAL_SECONDS,
      lastRunAt: settings.lastAutomationRunAt ? settings.lastAutomationRunAt.toISOString() : null,
    },
    demoToolsEnabled: demoToolsAvailable(settings),
  }
}

/** Merge com o gravado → valida a ordem da régua → grava (upsert). */
export async function updatePlatformSettings(input: UpdatePlatformBillingSettingsInput): Promise<PlatformBillingSettings> {
  const current = await loadPlatformSettings()
  const merged: ResolvedPlatformSettings = {
    ...current,
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
    gatewayOverride: input.gatewayOverride === undefined ? current.gatewayOverride : input.gatewayOverride,
  }
  const orderError = validatePlatformDunningOrder(merged)
  if (orderError) throw AppError.validation([{ path: 'suspendAfterDays', message: orderError }], orderError)
  if (isProduction && input.gatewayOverride === 'simulated') {
    throw AppError.businessRule('Gateway simulado não é permitido em produção')
  }
  if (merged.gatewayOverride === 'asaas' && !isPlatformAsaasConfigured()) {
    throw AppError.businessRule('Configure PLATFORM_ASAAS_API_KEY (ou ASAAS_API_KEY) no servidor antes de usar o Asaas')
  }
  const methods = METHOD_ORDER.filter(method => merged.enabledMethods.includes(method))

  const values = {
    gateway: merged.gatewayOverride,
    enabledMethods: methods,
    generateDaysBefore: merged.generateDaysBefore,
    reminderDaysBefore: merged.reminderDaysBefore,
    restrictAfterDays: merged.restrictAfterDays,
    suspendAfterDays: merged.suspendAfterDays,
    cancelAfterDays: merged.cancelAfterDays,
    boletoDueDays: merged.boletoDueDays,
    finePercent: String(merged.finePercent),
    interestMonthlyPercent: String(merged.interestMonthlyPercent),
    maxCardRetries: merged.maxCardRetries,
    cardRetryIntervalHours: merged.cardRetryIntervalHours,
    activationExpiryDays: merged.activationExpiryDays,
    draftExpiryDays: merged.draftExpiryDays,
    updatedAt: new Date(),
  }
  await db
    .insert(platformBillingConfig)
    .values({ id: PLATFORM_SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: platformBillingConfig.id, set: values })
  return toPlatformSettingsDto(await loadPlatformSettings())
}

/** Carimbo da última rodada da automação (cria a linha padrão se faltar). */
export async function touchPlatformAutomationRun(now: Date): Promise<void> {
  await db
    .insert(platformBillingConfig)
    .values({ id: PLATFORM_SETTINGS_ID, lastAutomationRunAt: now })
    .onConflictDoUpdate({ target: platformBillingConfig.id, set: { lastAutomationRunAt: now } })
}
