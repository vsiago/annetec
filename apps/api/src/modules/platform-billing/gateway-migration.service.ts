import {
  CLUB_PAYMENT_METHOD_LABELS,
  formatBRL,
  formatDateBR,
  type ClubChargeStatus,
  type PaymentGatewayProvider,
} from '@annetec/contracts'
import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import { db } from '@/db/client'
import { platformCharges, platformSubscriptions } from '@/db/schema'
import { AppError } from '@/http/errors'
import type { PaymentGateway } from '@/integrations/payments/gateway'
import { recordSystemAudit } from '@/lib/audit'
import { addDays, monthLabel, todaySP } from '@/modules/club-billing/dates'
import { platformInvoiceUrl } from './access-key'
import { platformCyclePeriod } from './automation.rules'
import { cancelPlatformAtGateway, submitPlatformChargeToGateway, withPlatformChargeLock } from './charges.service'
import { recordPlatformEvent } from './events.service'
import { platformGatewayFor } from './gateway'
import { OPEN_PLATFORM_CHARGE_STATUSES, type PlatformChargeRow } from './presenter'
import { loadPlatformCharge, loadPlatformSubscription } from './queries'
import { loadPlatformSettings } from './settings.service'

/**
 * Migra a assinatura da plataforma de um gateway para outro (ex.: simulado →
 * Asaas) sem perder histórico nem a régua:
 *
 *  1. cria/obtém o cliente no destino (CNPJ, razão social e e-mail de cobrança)
 *     e grava `gateway_provider`/`gateway_customer_id` na assinatura (o token
 *     de cartão do gateway antigo não vale no novo e é descartado);
 *  2. para cada fatura ABERTA (`pending`/`overdue`/`failed`) ainda em outro
 *     gateway, numa transação: cancela a antiga ("Migrada para o …") e grava a
 *     substituta — mesmo tipo, valor, itens, vidas, período e obrigação
 *     (vencimento da linha). A régua (`past_due_at`, degraus, datas) não é
 *     tocada e nunca há um instante sem a fatura aberta;
 *  3. emite a substituta no destino com `externalReference` `plt_<id>`. Se a
 *     obrigação já venceu, o vencimento NO GATEWAY segue a regra da segunda
 *     via (hoje + `boletoDueDays`) — multa/juros do gateway só correm depois
 *     dele, nunca antes do que a régua aplicaria;
 *  4. cancela o pagamento antigo no gateway de origem (best-effort).
 *
 * Faturas pagas/canceladas/estornadas ficam como estão (histórico).
 * Idempotente: rodar de novo só migra o que ainda estiver em outro gateway.
 * Sem rota HTTP por enquanto (script `platform:migrar-gateway`); se for
 * exposta, é só superadmin. Auditoria em `audit_logs` + timeline da assinatura.
 */

export interface MigratePlatformGatewayOptions {
  actorUserId?: string | null
  /**
   * Realinha o vencimento das mensalidades abertas à regra do ciclo
   * (`platformCyclePeriod`: vence no 1º dia do período). Só para dado montado
   * fora da régua (seed antigo) — NÃO use em fatura com segunda via legítima.
   */
  realignMonthlyDueDate?: boolean
  /** Gateway de destino já montado (testes). Padrão: `platformGatewayFor(target)`. */
  gateway?: PaymentGateway
  now?: Date
}

export interface MigratedPlatformCharge {
  oldId: string
  newId: string
  kind: PlatformChargeRow['kind']
  amount: number
  periodStart: string | null
  periodEnd: string | null
  /** Obrigação (linha) — é por ela que a régua conta o atraso. */
  dueDate: string
  /** Vencimento enviado ao gateway. */
  gatewayDueDate: string
  status: ClubChargeStatus
  gatewayChargeId: string | null
  failureReason: string | null
  publicUrl: string
}

export interface PlatformGatewayMigrationResult {
  subscriptionId: string
  organizationId: string
  from: PaymentGatewayProvider
  to: PaymentGatewayProvider
  customerId: string
  charges: MigratedPlatformCharge[]
}

const PROVIDER_LABEL: Record<PaymentGatewayProvider, string> = { asaas: 'Asaas', simulated: 'gateway simulado' }

export function migrationCancelReason(target: PaymentGatewayProvider): string {
  return `Migrada para o ${PROVIDER_LABEL[target]}`
}

/** Vencimento da obrigação (linha) e o enviado ao gateway — regra pura. */
export function migratedChargeSchedule(
  charge: Pick<PlatformChargeRow, 'kind' | 'periodStart' | 'dueDate'>,
  opts: { today: string; boletoDueDays: number; dueDay: number; realignMonthlyDueDate?: boolean },
): { dueDate: string; gatewayDueDate: string; status: 'pending' | 'overdue' } {
  const dueDate =
    opts.realignMonthlyDueDate && charge.kind === 'monthly' && charge.periodStart
      ? platformCyclePeriod(charge.periodStart, opts.dueDay).dueDate
      : charge.dueDate
  const late = dueDate < opts.today
  return {
    dueDate,
    gatewayDueDate: late ? addDays(opts.today, opts.boletoDueDays) : dueDate,
    status: late ? 'overdue' : 'pending',
  }
}

export async function migratePlatformSubscriptionGateway(
  subscriptionId: string,
  target: PaymentGatewayProvider,
  opts: MigratePlatformGatewayOptions = {},
): Promise<PlatformGatewayMigrationResult> {
  const now = opts.now ?? new Date()
  const today = todaySP(now)
  const actorUserId = opts.actorUserId ?? null
  const sub = await loadPlatformSubscription(subscriptionId)
  if (sub.status === 'canceled') throw AppError.businessRule('Assinatura cancelada não migra de gateway')
  const gateway = opts.gateway ?? platformGatewayFor(target)
  if (gateway.provider !== target) throw AppError.businessRule(`Gateway de destino inesperado: ${gateway.provider}`)
  const settings = await loadPlatformSettings()
  const from = sub.gatewayProvider

  // 1. Cliente no destino + assinatura apontando para ele.
  let customerId = sub.gatewayProvider === target ? sub.gatewayCustomerId : null
  if (!customerId) {
    customerId = await gateway.ensureCustomer({
      name: sub.billingName,
      cpf: sub.billingDocument,
      email: sub.billingEmail,
      phone: null,
      externalReference: sub.organizationId,
    })
  }
  const subscriptionChanged = sub.gatewayProvider !== target || sub.gatewayCustomerId !== customerId
  if (subscriptionChanged) {
    await db
      .update(platformSubscriptions)
      .set({
        gatewayProvider: target,
        gatewayCustomerId: customerId,
        // Token do gateway antigo não cobra no novo: o próximo cartão é redigitado.
        ...(sub.gatewayProvider !== target ? { cardToken: null } : {}),
        updatedAt: now,
      })
      .where(eq(platformSubscriptions.id, sub.id))
    await recordPlatformEvent(db, {
      organizationId: sub.organizationId,
      subscriptionId: sub.id,
      type: 'SUBSCRIPTION_GATEWAY_MIGRATED',
      source: 'manual',
      gatewayProvider: target,
      message: `Assinatura migrada do ${PROVIDER_LABEL[from]} para o ${PROVIDER_LABEL[target]} (cliente ${customerId})`,
      payload: { from, to: target, customerId },
      actorUserId,
    })
  }

  // 2-4. Faturas abertas ainda em outro gateway.
  const open = await db
    .select()
    .from(platformCharges)
    .where(
      and(
        eq(platformCharges.subscriptionId, sub.id),
        inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES),
        ne(platformCharges.gatewayProvider, target),
      ),
    )
    .orderBy(asc(platformCharges.dueDate))

  const migrated: MigratedPlatformCharge[] = []
  for (const old of open) {
    const result = await withPlatformChargeLock(old.id, () =>
      migrateCharge(old, { target, gateway, settings, dueDay: sub.dueDay, today, now, actorUserId, realign: opts.realignMonthlyDueDate }),
    )
    migrated.push(result)
  }

  if (!subscriptionChanged && migrated.length === 0) {
    return { subscriptionId: sub.id, organizationId: sub.organizationId, from, to: target, customerId, charges: [] }
  }
  await recordSystemAudit({
    action: 'platform_subscription.gateway_migrated',
    resource: 'platform_subscription',
    resourceId: sub.id,
    organizationId: sub.organizationId,
    actorId: actorUserId,
    actorScope: actorUserId ? 'platform' : null,
    metadata: {
      de: from,
      para: target,
      cliente: customerId,
      faturas: migrated.map(c => ({ antiga: c.oldId, nova: c.newId, status: c.status, vencimento: c.dueDate, vencimentoGateway: c.gatewayDueDate })),
    },
  })

  return { subscriptionId: sub.id, organizationId: sub.organizationId, from, to: target, customerId, charges: migrated }
}

async function migrateCharge(
  old: PlatformChargeRow,
  ctx: {
    target: PaymentGatewayProvider
    gateway: PaymentGateway
    settings: Awaited<ReturnType<typeof loadPlatformSettings>>
    dueDay: number
    today: string
    now: Date
    actorUserId: string | null
    realign?: boolean
  },
): Promise<MigratedPlatformCharge> {
  const { dueDate, gatewayDueDate, status } = migratedChargeSchedule(old, {
    today: ctx.today,
    boletoDueDays: ctx.settings.boletoDueDays,
    dueDay: ctx.dueDay,
    realignMonthlyDueDate: ctx.realign,
  })
  // Segunda via não emite cartão sem o cartão na mão: vira Pix (o pagador troca na página).
  const method = old.method === 'credit_card' ? 'pix' : old.method
  const reason = migrationCancelReason(ctx.target)

  const inserted = await db.transaction(async tx => {
    const [canceled] = await tx
      .update(platformCharges)
      .set({ status: 'canceled', canceledAt: ctx.now, updatedAt: ctx.now })
      .where(and(eq(platformCharges.id, old.id), inArray(platformCharges.status, OPEN_PLATFORM_CHARGE_STATUSES)))
      .returning({ id: platformCharges.id })
    if (!canceled) throw AppError.conflict(`A fatura ${old.id} mudou de situação durante a migração`)

    const [row] = await tx
      .insert(platformCharges)
      .values({
        organizationId: old.organizationId,
        subscriptionId: old.subscriptionId,
        proposalId: old.proposalId,
        kind: old.kind,
        periodStart: old.periodStart,
        periodEnd: old.periodEnd,
        dueDate,
        amount: old.amount,
        items: old.items,
        livesCount: old.livesCount,
        method,
        status,
        description: old.description,
        gatewayProvider: ctx.target,
        // Mesma obrigação: não reenvia lembrete/aviso que o pagador já recebeu.
        reminderSentAt: old.reminderSentAt,
        overdueNotifiedAt: status === 'overdue' ? old.overdueNotifiedAt : null,
      })
      .returning()
    if (!row) throw AppError.conflict('Não foi possível gravar a fatura substituta')

    await recordPlatformEvent(tx, {
      organizationId: old.organizationId,
      subscriptionId: old.subscriptionId,
      chargeId: old.id,
      proposalId: old.proposalId,
      type: 'CHARGE_CANCELED',
      source: 'manual',
      gatewayProvider: old.gatewayProvider,
      message: `Fatura de ${formatBRL(Number(old.amount))} cancelada: ${reason} (substituída pela ${row.id})`,
      payload: { replacedBy: row.id, reason },
      actorUserId: ctx.actorUserId,
    })
    await recordPlatformEvent(tx, {
      organizationId: old.organizationId,
      subscriptionId: old.subscriptionId,
      chargeId: row.id,
      proposalId: old.proposalId,
      type: 'CHARGE_GENERATED',
      source: 'manual',
      gatewayProvider: ctx.target,
      message: `Fatura de ${formatBRL(Number(old.amount))}${old.periodStart ? ` do período ${monthLabel(old.periodStart)}` : ''} reemitida no ${PROVIDER_LABEL[ctx.target]} (substitui a ${old.id}) — ${CLUB_PAYMENT_METHOD_LABELS[method]}, vence em ${formatDateBR(dueDate)}`,
      payload: { replaces: old.id, dueDate, gatewayDueDate, previousDueDate: old.dueDate },
      actorUserId: ctx.actorUserId,
    })
    return row
  })

  const submitted = await submitPlatformChargeToGateway(inserted.id, {
    method,
    source: 'manual',
    actorUserId: ctx.actorUserId,
    mode: 'passive',
    gateway: ctx.gateway,
    gatewayDueDate,
  })
  await cancelPlatformAtGateway(old)

  const fresh = await loadPlatformCharge(submitted.id)
  return {
    oldId: old.id,
    newId: fresh.id,
    kind: fresh.kind,
    amount: Number(fresh.amount),
    periodStart: fresh.periodStart,
    periodEnd: fresh.periodEnd,
    dueDate: fresh.dueDate,
    gatewayDueDate,
    status: fresh.status,
    gatewayChargeId: fresh.gatewayChargeId,
    failureReason: fresh.failureReason,
    publicUrl: platformInvoiceUrl(fresh.id),
  }
}
