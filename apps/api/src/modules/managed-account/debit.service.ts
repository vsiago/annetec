import { randomUUID } from 'node:crypto'
import {
  ERROR_CODES,
  MANAGED_AUTO_DEBIT_FAILURE_LABELS,
  approvalsHref,
  formatBRL,
  type ManagedAutoDebitFailureCode,
  type ManagedDebitResult,
} from '@annetec/contracts'
import { and, asc, eq, gte, inArray, isNull, lte, ne } from 'drizzle-orm'
import { env } from '@/config/env'
import { db } from '@/db/client'
import {
  managedAccountDebits,
  organization,
  platformBillingEvents,
  platformCharges,
  platformSubscriptions,
  tenantAsaasAccounts,
} from '@/db/schema'
import { AppError } from '@/http/errors'
import { AsaasApiError, type AsaasClient } from '@/integrations/asaas/client'
import type { AsaasTransfer } from '@/integrations/asaas/types'
import { decryptSecret } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import { notify } from '@/lib/notifications'
import { addDays, toDateSP, todaySP } from '@/modules/club-billing/dates'
import { platformReference } from '@/modules/platform-billing/access-key'
import { syncPlatformCharge, withPlatformChargeLock } from '@/modules/platform-billing/charges.service'
import { handlePlatformGatewayEvent, recordPlatformEvent } from '@/modules/platform-billing/events.service'
import { platformGatewayFor } from '@/modules/platform-billing/gateway'
import { isOpenPlatformCharge, type PlatformChargeRow } from '@/modules/platform-billing/presenter'
import { loadPlatformCharge } from '@/modules/platform-billing/queries'
import { platformAsaasClient, platformWalletId, subaccountClient } from './asaas'
import { debitDto, type DebitRow } from './queries'
import {
  COUNTED_FAILURES,
  autoDebitEventId,
  debitDecision,
  debitExternalReference,
  transferOutcome,
  type DebitConfig,
} from './rules'

/**
 * Débito automático das faturas da ANNETEC no SALDO da conta gerenciada do
 * clube (opção B aprovada pelo cliente: "debitar do saldo no vencimento").
 *
 * Fluxo de uma tentativa (fatura vencida, em aberto, clube com conta
 * gerenciada e débito ligado):
 *  1. reivindica a fatura: INSERT da tentativa `em_andamento` (índice único
 *     parcial — no máximo uma por fatura, entre processos) + trava em memória
 *     da fatura (`withPlatformChargeLock`, a mesma do pagamento por cartão);
 *  2. confere a fatura no gateway (Pix pago agora há pouco = não debita);
 *  3. consulta o saldo da subconta (`GET /finance/balance`, chave dela);
 *  4. transfere para a carteira da ANNETEC (`POST /transfers` com `walletId` e
 *     `externalReference` único, chave da subconta) e grava o `transferId`;
 *  5. transferência `DONE` → quita a fatura pelo MESMO caminho de pagamento
 *     confirmado da plataforma: `receiveInCash` da cobrança no Asaas da
 *     ANNETEC (o clube não consegue mais pagar o Pix/boleto) e o handler
 *     único com `PAYMENT_RECEIVED` (id sintético por tentativa) — assinatura,
 *     comissão do vendedor e avisos rodam uma única vez;
 *  6. sem saldo ou recusa → `falhou`, timeline + sino do clube; a fatura segue
 *     normal (Pix/boleto) e a automação tenta de novo a cada
 *     `MANAGED_DEBIT_RETRY_INTERVAL_HOURS` até `MANAGED_DEBIT_MAX_ATTEMPTS`.
 *
 * Reconciliação (cada rodada, para toda tentativa `em_andamento`): consulta a
 * transferência (`GET /transfers/{id}`, ou pela `externalReference` se a
 * resposta do POST se perdeu); concluída → quita; pendente com a fatura paga
 * por outro meio (ou há mais de 24 h) → cancela a transferência; transferiu
 * mas a fatura já estava paga → `concluida` com `refund_required` + alerta
 * (devolver ao clube manualmente). Nunca transfere de novo para uma fatura com
 * tentativa em andamento ou concluída.
 */

/** Transferência pendente por mais que isto é cancelada (não pode ser autorizada depois de a fatura ser paga por outro meio). */
const PENDING_TRANSFER_TIMEOUT_MS = 24 * 60 * 60 * 1000
/** POST da transferência sem resposta: depois disto, não localizada no Asaas = não aconteceu. */
const LOST_RESPONSE_GRACE_MS = 30 * 60 * 1000
/** Tentativa reivindicada que não chegou a pedir a transferência (processo caiu antes). */
const STALE_CLAIM_MS = 10 * 60 * 1000

type AccountRow = typeof tenantAsaasAccounts.$inferSelect

export interface DebitRunResult {
  outcome: ManagedDebitResult['outcome']
  message: string
  debit: DebitRow | null
}

export function debitConfig(): DebitConfig {
  return { maxAttempts: env.MANAGED_DEBIT_MAX_ATTEMPTS, retryIntervalHours: env.MANAGED_DEBIT_RETRY_INTERVAL_HOURS }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function describeAsaasError(error: unknown): string {
  const status = error instanceof AsaasApiError ? error.httpStatus : 0
  return `${errorText(error)}${status ? ` (HTTP ${status})` : ''}`.slice(0, 300)
}

function cents(value: number | string): number {
  return Math.round(Number(value) * 100)
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

async function loadAccount(orgId: string): Promise<AccountRow | null> {
  const [row] = await db.select().from(tenantAsaasAccounts).where(eq(tenantAsaasAccounts.organizationId, orgId)).limit(1)
  return row ?? null
}

async function loadDebit(id: string): Promise<DebitRow | null> {
  const [row] = await db.select().from(managedAccountDebits).where(eq(managedAccountDebits.id, id)).limit(1)
  return row ?? null
}

/** Atualiza só tentativa AINDA em andamento; `null` = outra rodada já encerrou. */
async function updateRunning(id: string, values: Partial<Omit<DebitRow, 'id'>>): Promise<DebitRow | null> {
  const [row] = await db
    .update(managedAccountDebits)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(managedAccountDebits.id, id), eq(managedAccountDebits.status, 'em_andamento')))
    .returning()
  return row ?? null
}

function resultOf(debit: DebitRow | null, fallback: string): DebitRunResult {
  if (!debit) return { outcome: 'ignorada', message: fallback, debit: null }
  if (debit.status === 'concluida') {
    return { outcome: debit.refundRequired ? 'falhou' : 'concluida', message: debit.failureReason ?? 'Fatura quitada pelo saldo da conta gerenciada', debit }
  }
  if (debit.status === 'falhou') return { outcome: 'falhou', message: debit.failureReason ?? 'Débito não realizado', debit }
  return { outcome: 'em_andamento', message: fallback, debit }
}

function subaccountOf(account: AccountRow): AsaasClient {
  return subaccountClient(decryptSecret(account.apiKeyEncrypted), account.env)
}

// ---------------------------------------------------------------------------
// Encerramentos
// ---------------------------------------------------------------------------

async function tenantSlugOf(orgId: string): Promise<string | null> {
  const [row] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, orgId)).limit(1)
  return row?.slug ?? null
}

/** Motivo para o CLUBE: o detalhe técnico do Asaas fica só na tentativa (equipe). */
function clubReason(debit: DebitRow): string {
  if (debit.failureCode === 'saldo_insuficiente' && debit.failureReason) return debit.failureReason
  return debit.failureCode ? MANAGED_AUTO_DEBIT_FAILURE_LABELS[debit.failureCode] : 'Não foi possível debitar do saldo'
}

/** Timeline da fatura + sino do clube (best effort: nunca derruba a tentativa). */
async function announceFailure(debit: DebitRow, charge: PlatformChargeRow, notifyClub: boolean, config: DebitConfig): Promise<void> {
  try {
    await recordPlatformEvent(db, {
      organizationId: debit.organizationId,
      subscriptionId: charge.subscriptionId,
      chargeId: charge.id,
      type: 'CHARGE_AUTO_DEBIT_FAILED',
      source: debit.source === 'manual' ? 'manual' : 'automation',
      gatewayProvider: charge.gatewayProvider,
      message: `Débito automático de ${formatBRL(Number(debit.amount))} não realizado: ${debit.failureReason ?? 'motivo não informado'}`,
      payload: { debitId: debit.id, attempt: debit.attempt, failureCode: debit.failureCode, transferId: debit.transferId },
      actorUserId: debit.actorUserId,
    })
    if (!notifyClub) return
    const failures = await db
      .select({ failureCode: managedAccountDebits.failureCode })
      .from(managedAccountDebits)
      .where(and(eq(managedAccountDebits.chargeId, charge.id), eq(managedAccountDebits.status, 'falhou')))
    const counted = failures.filter(row => row.failureCode && COUNTED_FAILURES.includes(row.failureCode)).length
    const remaining = Math.max(0, config.maxAttempts - counted)
    const slug = await tenantSlugOf(debit.organizationId)
    await notify({
      audience: 'tenant',
      kind: 'platform_auto_debit_failed',
      organizationId: debit.organizationId,
      title: 'Débito automático da fatura ANNETEC não realizado',
      body:
        `${clubReason(debit)}. ` +
        (remaining > 0
          ? `Nova tentativa automática em ${config.retryIntervalHours} h (restam ${remaining}). `
          : 'Sem novas tentativas automáticas. ') +
        'Você também pode pagar pelo Pix ou boleto da fatura.',
      amount: Number(debit.amount),
      payload: { platformChargeId: charge.id },
      link: slug ? `/${slug}/admin/assinatura` : null,
      dedupeKey: `auto_debit_failed:${debit.id}`,
    })
    await db.update(managedAccountDebits).set({ notifiedAt: new Date() }).where(eq(managedAccountDebits.id, debit.id))
  } catch (error) {
    logger.error({ debitId: debit.id, err: errorText(error) }, 'Débito automático: falha ao registrar/avisar a tentativa sem sucesso')
  }
}

async function fail(
  debit: DebitRow,
  code: ManagedAutoDebitFailureCode,
  reason: string,
  options: { notify?: boolean; transferStatus?: string; onlyIfNotRequested?: boolean; config?: DebitConfig } = {},
): Promise<DebitRunResult> {
  const now = new Date()
  const [row] = await db
    .update(managedAccountDebits)
    .set({
      status: 'falhou',
      failureCode: code,
      failureReason: reason.slice(0, 500),
      finishedAt: now,
      updatedAt: now,
      ...(options.transferStatus ? { transferStatus: options.transferStatus } : {}),
    })
    .where(
      and(
        eq(managedAccountDebits.id, debit.id),
        eq(managedAccountDebits.status, 'em_andamento'),
        ...(options.onlyIfNotRequested ? [isNull(managedAccountDebits.transferRequestedAt)] : []),
      ),
    )
    .returning()
  if (!row) return resultOf(await loadDebit(debit.id), 'A tentativa já foi encerrada')
  logger.info({ debitId: row.id, chargeId: row.chargeId, organizationId: row.organizationId, failureCode: code }, `Débito automático não realizado: ${reason}`)
  const charge = row.chargeId ? await loadPlatformCharge(row.chargeId).catch(() => null) : null
  if (charge) await announceFailure(row, charge, options.notify !== false && code !== 'fatura_paga', options.config ?? debitConfig())
  return { outcome: 'falhou', message: reason, debit: row }
}

async function conclude(debit: DebitRow, charge: PlatformChargeRow, now: Date): Promise<DebitRunResult> {
  const [row] = await db
    .update(managedAccountDebits)
    .set({ status: 'concluida', settledAt: now, finishedAt: now, failureCode: null, failureReason: null, updatedAt: now })
    .where(and(eq(managedAccountDebits.id, debit.id), eq(managedAccountDebits.status, 'em_andamento')))
    .returning()
  if (!row) return resultOf(await loadDebit(debit.id), 'A tentativa já foi encerrada')
  try {
    await recordPlatformEvent(db, {
      organizationId: row.organizationId,
      subscriptionId: charge.subscriptionId,
      chargeId: charge.id,
      type: 'CHARGE_AUTO_DEBIT',
      source: row.source === 'manual' ? 'manual' : 'automation',
      gatewayProvider: charge.gatewayProvider,
      message: `Fatura de ${formatBRL(Number(row.amount))} quitada pelo saldo da conta gerenciada (transferência ${row.transferId ?? '—'})`,
      payload: { debitId: row.id, attempt: row.attempt, transferId: row.transferId },
      actorUserId: row.actorUserId,
    })
  } catch (error) {
    logger.error({ debitId: row.id, err: errorText(error) }, 'Débito automático: falha ao gravar a timeline (fatura já quitada)')
  }
  logger.info({ debitId: row.id, chargeId: charge.id, organizationId: row.organizationId, transferId: row.transferId }, 'Débito automático concluído')
  return { outcome: 'concluida', message: 'Fatura quitada pelo saldo da conta gerenciada', debit: row }
}

/**
 * O dinheiro saiu do saldo, mas a fatura já estava paga/encerrada por outro
 * meio. A tentativa fica `concluida` (bloqueia qualquer outra transferência
 * para a fatura) com `refund_required` — devolução MANUAL ao clube.
 */
async function flagDoublePayment(debit: DebitRow, charge: PlatformChargeRow | null, now: Date): Promise<DebitRunResult> {
  const amount = formatBRL(Number(debit.amount))
  const reason =
    charge?.status === 'paid'
      ? `O valor de ${amount} saiu do saldo, mas a fatura já tinha sido paga por outro meio — devolver ao clube`
      : `O valor de ${amount} saiu do saldo, mas a fatura está encerrada (${charge?.status ?? 'removida'}) — devolver ao clube`
  const [row] = await db
    .update(managedAccountDebits)
    .set({ status: 'concluida', refundRequired: true, failureCode: 'pagamento_duplicado', failureReason: reason, finishedAt: now, updatedAt: now })
    .where(and(eq(managedAccountDebits.id, debit.id), eq(managedAccountDebits.status, 'em_andamento')))
    .returning()
  if (!row) return resultOf(await loadDebit(debit.id), 'A tentativa já foi encerrada')
  logger.error(
    {
      alert: 'auto_debit_refund_required',
      organizationId: row.organizationId,
      chargeId: charge?.id ?? null,
      chargeStatus: charge?.status ?? null,
      debitId: row.id,
      transferId: row.transferId,
      amount: Number(row.amount),
    },
    'Débito automático numa fatura já paga/encerrada — DEVOLVER manualmente o valor ao clube (transferência da ANNETEC para a carteira da subconta)',
  )
  try {
    await recordPlatformEvent(db, {
      organizationId: row.organizationId,
      subscriptionId: charge?.subscriptionId ?? null,
      chargeId: charge?.id ?? null,
      type: 'CHARGE_AUTO_DEBIT_FAILED',
      source: row.source === 'manual' ? 'manual' : 'automation',
      gatewayProvider: charge?.gatewayProvider ?? null,
      message: reason,
      payload: { debitId: row.id, transferId: row.transferId, refundRequired: true },
    })
    await notify({
      audience: 'platform',
      kind: 'platform_auto_debit_failed',
      organizationId: row.organizationId,
      title: 'Débito automático em duplicidade — devolver ao clube',
      body: reason,
      amount: Number(row.amount),
      payload: charge ? { platformChargeId: charge.id } : {},
      // A gaveta da conta gerenciada (débitos, saldo) mora em Aprovações › Contas gerenciadas.
      link: approvalsHref('contas-gerenciadas', { clube: row.organizationId, situacao: 'todas' }),
      dedupeKey: `auto_debit_refund:${row.id}`,
    })
  } catch (error) {
    logger.error({ debitId: row.id, err: errorText(error) }, 'Débito automático: falha ao registrar a duplicidade')
  }
  return { outcome: 'falhou', message: reason, debit: row }
}

// ---------------------------------------------------------------------------
// Quitação da fatura (transferência concluída)
// ---------------------------------------------------------------------------

/** A fatura foi quitada por ESTA tentativa (retomada depois de queda)? */
async function settledByUs(debit: DebitRow, charge: PlatformChargeRow): Promise<boolean> {
  if (debit.gatewaySettledAt || debit.settledAt) return true
  const [event] = await db
    .select({ id: platformBillingEvents.id })
    .from(platformBillingEvents)
    .where(and(eq(platformBillingEvents.chargeId, charge.id), eq(platformBillingEvents.externalEventId, autoDebitEventId(debit.id))))
    .limit(1)
  if (event) return true
  // Queda entre o `receiveInCash` e a marca dele: o Asaas mostra RECEIVED_IN_CASH (e não houve baixa manual).
  if (charge.gatewayProvider !== 'asaas' || !charge.gatewayChargeId) return false
  const [manual] = await db
    .select({ id: platformBillingEvents.id })
    .from(platformBillingEvents)
    .where(and(eq(platformBillingEvents.chargeId, charge.id), eq(platformBillingEvents.type, 'CHARGE_MANUAL_PAYMENT')))
    .limit(1)
  if (manual) return false
  try {
    const payment = await platformAsaasClient()?.payments.get(charge.gatewayChargeId)
    return payment?.status === 'RECEIVED_IN_CASH'
  } catch {
    return false
  }
}

/**
 * Transferência `DONE`: dá a fatura como paga. Ordem: (1) baixa no Asaas da
 * ANNETEC (`receiveInCash`, o clube não paga mais o Pix/boleto); (2) handler
 * único `PAYMENT_RECEIVED` (idempotente pelo id sintético da tentativa e pelo
 * UPDATE condicional — comissão e avisos uma vez); (3) se a baixa no gateway
 * falhou, cancela a cobrança lá (best effort, alerta se não der). Erro aqui
 * deixa a tentativa `em_andamento` com a transferência `DONE`: a próxima
 * rodada retoma a quitação.
 */
async function settleDebit(debit: DebitRow, now: Date): Promise<DebitRunResult> {
  if (debit.transferStatus !== 'DONE') debit = (await updateRunning(debit.id, { transferStatus: 'DONE' })) ?? debit
  if (debit.status !== 'em_andamento') return resultOf(debit, 'A tentativa já foi encerrada')
  if (!debit.chargeId) return flagDoublePayment(debit, null, now)
  const amount = Number(debit.amount)
  let charge = await loadPlatformCharge(debit.chargeId)
  if (!isOpenPlatformCharge(charge.status)) {
    if (charge.status === 'paid' && (await settledByUs(debit, charge))) return conclude(debit, charge, now)
    return flagDoublePayment(debit, charge, now)
  }

  let gatewayStillOpen = false
  if (charge.gatewayChargeId && charge.gatewayProvider === 'asaas' && !debit.gatewaySettledAt) {
    try {
      await platformGatewayFor('asaas').receiveInCash(charge.gatewayChargeId, todaySP(now), amount)
      debit = (await updateRunning(debit.id, { gatewaySettledAt: new Date() })) ?? debit
    } catch (error) {
      logger.warn(
        { debitId: debit.id, chargeId: charge.id, gatewayChargeId: charge.gatewayChargeId, err: errorText(error) },
        'Débito automático: baixa da cobrança no Asaas da ANNETEC falhou — conferindo a fatura',
      )
      try {
        await syncPlatformCharge(charge, 'automation', now)
      } catch {
        // sem conferência: segue para a quitação e cancela a cobrança lá depois
      }
      charge = await loadPlatformCharge(charge.id)
      if (!isOpenPlatformCharge(charge.status)) {
        if (charge.status === 'paid' && (await settledByUs(debit, charge))) return conclude(debit, charge, now)
        return flagDoublePayment(debit, charge, now)
      }
      gatewayStillOpen = true
    }
  }

  await handlePlatformGatewayEvent(
    {
      id: autoDebitEventId(debit.id),
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: charge.gatewayChargeId,
        externalReference: platformReference(charge.id),
        value: amount,
        billingType: charge.method,
      },
    },
    {
      source: debit.source === 'manual' ? 'manual' : 'automation',
      provider: charge.gatewayProvider,
      actorUserId: debit.actorUserId,
      paidAt: now,
      paidAmount: amount,
      now,
      message: `Pagamento de ${formatBRL(amount)} recebido — débito automático do saldo da conta gerenciada (transferência ${debit.transferId ?? '—'})`,
    },
  )
  charge = await loadPlatformCharge(charge.id)
  if (charge.status !== 'paid') throw new Error(`a fatura ${charge.id} não ficou paga após o débito (status ${charge.status})`)

  if (gatewayStillOpen && charge.gatewayChargeId) {
    try {
      await platformGatewayFor(charge.gatewayProvider).cancelCharge(charge.gatewayChargeId)
    } catch (error) {
      logger.error(
        { alert: 'auto_debit_gateway_charge_open', chargeId: charge.id, gatewayChargeId: charge.gatewayChargeId, err: errorText(error) },
        'Fatura quitada pelo débito automático, mas a cobrança continua ABERTA no Asaas da ANNETEC — cancele manualmente para o clube não pagar duas vezes',
      )
    }
  }
  return conclude(debit, charge, now)
}

async function applyTransfer(debit: DebitRow, transfer: AsaasTransfer, now: Date, config: DebitConfig): Promise<DebitRunResult> {
  const outcome = transferOutcome(transfer.status)
  if (outcome === 'failed' || outcome === 'cancelled') {
    // Recusada/cancelada porque a fatura foi paga por outro meio (webhook de validação): não é falha de cobrança.
    const charge = debit.chargeId ? await loadPlatformCharge(debit.chargeId).catch(() => null) : null
    if (charge && !isOpenPlatformCharge(charge.status)) {
      return fail(debit, 'fatura_paga', 'A fatura foi paga por outro meio; a transferência não foi efetivada', {
        transferStatus: transfer.status,
        notify: false,
        config,
      })
    }
  }
  switch (outcome) {
    case 'done':
      return settleDebit(debit, now)
    case 'failed':
      return fail(debit, 'transferencia_recusada', `Transferência recusada pelo Asaas${transfer.failReason ? `: ${transfer.failReason}` : ''}`, {
        transferStatus: transfer.status,
        config,
      })
    case 'cancelled':
      return fail(debit, 'transferencia_cancelada', `Transferência cancelada no Asaas${transfer.failReason ? `: ${transfer.failReason}` : ''}`, {
        transferStatus: transfer.status,
        config,
      })
    default: {
      const updated = debit.transferStatus === transfer.status ? debit : ((await updateRunning(debit.id, { transferStatus: transfer.status })) ?? debit)
      return {
        outcome: 'em_andamento',
        message: transfer.authorized === false ? 'Transferência aguardando autorização no Asaas' : 'Transferência em processamento no Asaas',
        debit: updated,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Tentativa nova
// ---------------------------------------------------------------------------

async function executeAttempt(debit: DebitRow, account: AccountRow, now: Date, config: DebitConfig): Promise<DebitRunResult> {
  let transferRequested = false
  try {
    // 1. Outra tentativa já concluiu esta fatura entre a leitura e a reivindicação?
    const [done] = await db
      .select({ id: managedAccountDebits.id })
      .from(managedAccountDebits)
      .where(and(eq(managedAccountDebits.chargeId, debit.chargeId!), eq(managedAccountDebits.status, 'concluida')))
      .limit(1)
    if (done) return fail(debit, 'fatura_paga', 'A fatura já foi debitada em outra tentativa', { notify: false, config })

    // 2. Conferência no gateway: Pix/boleto pago agora há pouco não pode ser debitado de novo.
    let charge = await loadPlatformCharge(debit.chargeId!)
    if (charge.gatewayChargeId && isOpenPlatformCharge(charge.status)) {
      try {
        await syncPlatformCharge(charge, 'automation', now)
      } catch (error) {
        return fail(debit, 'erro_asaas', `Não foi possível conferir a fatura no gateway antes do débito: ${describeAsaasError(error)}`, { config })
      }
      charge = await loadPlatformCharge(charge.id)
    }
    if (!isOpenPlatformCharge(charge.status)) {
      return fail(debit, 'fatura_paga', 'A fatura foi paga (ou encerrada) por outro meio antes do débito', { notify: false, config })
    }
    // O valor da tentativa veio da fatura lida ANTES da trava: nunca transferir valor diferente do atual.
    if (cents(charge.amount) !== cents(debit.amount) || charge.organizationId !== debit.organizationId) {
      return fail(debit, 'erro_asaas', 'O valor da fatura mudou durante o débito; nova tentativa na próxima rodada', { notify: false, config })
    }

    // 3. Saldo.
    const client = subaccountOf(account)
    let balance: number
    try {
      balance = Number((await client.finance.balance()).balance)
    } catch (error) {
      return fail(debit, 'erro_asaas', `Saldo da conta não consultado: ${describeAsaasError(error)}`, { config })
    }
    debit = (await updateRunning(debit.id, { balance: String(balance) })) ?? debit
    const amount = Number(debit.amount)
    if (!Number.isFinite(balance) || cents(balance) < cents(amount)) {
      return fail(debit, 'saldo_insuficiente', `Saldo disponível de ${formatBRL(Number.isFinite(balance) ? balance : 0)} não cobre a fatura de ${formatBRL(amount)}`, {
        config,
      })
    }

    // 4. Destino: carteira da ANNETEC.
    let wallet: string
    try {
      wallet = await platformWalletId()
    } catch (error) {
      return fail(debit, 'erro_asaas', `Carteira da ANNETEC não consultada: ${describeAsaasError(error)}`, { config })
    }
    if (account.walletId && account.walletId === wallet) {
      return fail(debit, 'erro_asaas', 'A carteira de destino é a da própria subconta — confira PLATFORM_ASAAS_WALLET_ID', { config })
    }

    // 5. Transferência (a partir daqui ela PODE existir no Asaas: nunca encerrar sem conferir).
    const marked = await updateRunning(debit.id, { destinationWalletId: wallet, transferRequestedAt: new Date() })
    if (!marked) return resultOf(await loadDebit(debit.id), 'A tentativa foi encerrada por outra rodada')
    debit = marked
    transferRequested = true
    let transfer: AsaasTransfer
    try {
      transfer = await client.transfers.create({ value: amount, walletId: wallet, externalReference: debit.externalReference })
    } catch (error) {
      if (error instanceof AsaasApiError && error.inconclusive) {
        logger.warn({ debitId: debit.id, err: errorText(error) }, 'Débito automático: transferência sem resposta do Asaas — conferindo na próxima rodada')
        debit = (await updateRunning(debit.id, { failureReason: 'O Asaas não respondeu à transferência; conferindo na próxima rodada' })) ?? debit
        return { outcome: 'em_andamento', message: 'Transferência sem resposta do Asaas: conferindo na próxima rodada', debit }
      }
      return fail(debit, 'transferencia_recusada', `O Asaas recusou a transferência: ${describeAsaasError(error)}`, { config })
    }
    debit = (await updateRunning(debit.id, { transferId: transfer.id, transferStatus: transfer.status })) ?? debit
    return await applyTransfer(debit, transfer, now, config)
  } catch (error) {
    logger.error(
      { alert: 'auto_debit_unexpected', debitId: debit.id, chargeId: debit.chargeId, transferRequested, err: errorText(error) },
      'Débito automático: falha inesperada na tentativa',
    )
    if (!transferRequested) {
      try {
        return await fail(debit, 'erro_asaas', `Falha inesperada antes da transferência: ${errorText(error)}`, { notify: false, onlyIfNotRequested: true, config })
      } catch {
        // banco fora: a reconciliação encerra a tentativa reivindicada depois
      }
    }
    return { outcome: 'em_andamento', message: 'Falha inesperada — a tentativa será conferida na próxima rodada', debit }
  }
}

/**
 * Tenta debitar uma fatura (automação ou "debitar agora" do superadmin). Uma
 * tentativa em andamento é só CONFERIDA (nunca transfere de novo).
 */
export async function attemptAutoDebit(
  chargeId: string,
  opts: { source: 'automation' | 'manual'; actorUserId?: string | null; now?: Date; config?: DebitConfig },
): Promise<DebitRunResult> {
  const now = opts.now ?? new Date()
  const config = opts.config ?? debitConfig()
  const charge = await loadPlatformCharge(chargeId)
  if (!charge.organizationId) return { outcome: 'ignorada', message: 'Fatura sem clube', debit: null }
  const account = await loadAccount(charge.organizationId)
  if (!account || account.source !== 'subaccount') {
    return { outcome: 'ignorada', message: 'O recebimento do clube não é gerenciado pela ANNETEC', debit: null }
  }
  if (opts.source === 'automation' && !account.autoDebitEnabled) {
    return { outcome: 'ignorada', message: 'Débito automático desligado para este clube', debit: null }
  }

  const attempts = await db
    .select()
    .from(managedAccountDebits)
    .where(eq(managedAccountDebits.chargeId, charge.id))
    .orderBy(asc(managedAccountDebits.createdAt))
  const decision = debitDecision(charge, attempts, todaySP(now), now, config, opts.source)
  if (decision.action === 'reconcile') {
    return reconcileDebit(attempts.find(attempt => attempt.status === 'em_andamento')!, { now, config })
  }
  if (decision.action === 'skip') {
    return { outcome: 'ignorada', message: decision.reason, debit: decision.done ? (attempts.find(attempt => attempt.status === 'concluida') ?? null) : null }
  }

  let started = false
  try {
    return await withPlatformChargeLock(charge.id, async () => {
      started = true
      const id = randomUUID()
      // A trava entre processos: no máximo UMA tentativa em andamento por fatura (índice único parcial).
      const [claimed] = await db
        .insert(managedAccountDebits)
        .values({
          id,
          organizationId: charge.organizationId!,
          chargeId: charge.id,
          attempt: attempts.length + 1,
          status: 'em_andamento',
          source: opts.source,
          actorUserId: opts.actorUserId ?? null,
          amount: charge.amount,
          externalReference: debitExternalReference(id),
          startedAt: now,
        })
        .onConflictDoNothing()
        .returning()
      if (!claimed) return { outcome: 'ignorada' as const, message: 'Outra tentativa de débito desta fatura está em andamento', debit: null }
      return executeAttempt(claimed, account, now, config)
    })
  } catch (error) {
    if (!started && error instanceof AppError && error.code === ERROR_CODES.CONFLICT) {
      return { outcome: 'ignorada', message: 'A fatura está com um pagamento em processamento agora', debit: null }
    }
    throw error
  }
}

// ---------------------------------------------------------------------------
// Reconciliação
// ---------------------------------------------------------------------------

/**
 * Transferência pela `externalReference` (resposta do POST perdida). Só adota
 * a que confere com a tentativa (mesmo valor e, quando o Asaas informa, a
 * carteira da ANNETEC): o id adotado passa a ser aprovado no webhook de validação.
 */
async function findTransferByReference(client: AsaasClient, debit: DebitRow): Promise<AsaasTransfer | null> {
  const since = addDays(toDateSP(debit.transferRequestedAt ?? debit.startedAt), -1)
  for (let offset = 0; offset < 1_000; offset += 100) {
    const page = await client.transfers.list({ 'dateCreated[ge]': since, offset, limit: 100 })
    const match = (page.data ?? []).find(transfer => transfer.externalReference === debit.externalReference)
    if (match) {
      const sameValue = cents(match.value) === cents(debit.amount)
      const sameWallet = !match.walletId || match.walletId === debit.destinationWalletId
      if (sameValue && sameWallet) return match
      logger.error(
        { alert: 'auto_debit_reference_mismatch', debitId: debit.id, transferId: match.id, value: match.value },
        'Débito automático: transferência com a externalReference da tentativa, mas valor/carteira diferentes — NÃO adotada; conferir no painel do Asaas',
      )
      return null
    }
    if (!page.hasMore) break
  }
  return null
}

/**
 * Confere uma tentativa em andamento (nunca cria transferência). Usa a mesma
 * trava em memória da fatura: automação e "debitar agora" no mesmo processo
 * não quitam a mesma fatura ao mesmo tempo.
 */
export async function reconcileDebit(debit: DebitRow, opts: { now?: Date; config?: DebitConfig } = {}): Promise<DebitRunResult> {
  if (debit.status !== 'em_andamento') return resultOf(debit, 'Tentativa encerrada')
  if (!debit.chargeId) return reconcileLocked(debit, opts)
  let started = false
  try {
    return await withPlatformChargeLock(debit.chargeId, () => {
      started = true
      return reconcileLocked(debit, opts)
    })
  } catch (error) {
    if (!started && error instanceof AppError && error.code === ERROR_CODES.CONFLICT) {
      return { outcome: 'em_andamento', message: 'A fatura está sendo processada agora', debit }
    }
    throw error
  }
}

async function reconcileLocked(debit: DebitRow, opts: { now?: Date; config?: DebitConfig }): Promise<DebitRunResult> {
  const now = opts.now ?? new Date()
  const config = opts.config ?? debitConfig()
  const fresh = await loadDebit(debit.id)
  if (!fresh || fresh.status !== 'em_andamento') return resultOf(fresh, 'Tentativa encerrada')
  debit = fresh
  if (debit.transferStatus === 'DONE') return settleDebit(debit, now)

  const account = await loadAccount(debit.organizationId)
  if (!account || account.source !== 'subaccount') {
    logger.error(
      { alert: 'auto_debit_orphan', debitId: debit.id, organizationId: debit.organizationId, transferId: debit.transferId },
      'Débito automático em andamento sem conta gerenciada conectada — conferir a transferência no painel do Asaas',
    )
    return { outcome: 'em_andamento', message: 'Conta gerenciada desconectada com débito em andamento — conferir no Asaas', debit }
  }
  const client = subaccountOf(account)

  if (debit.transferId) {
    let transfer: AsaasTransfer
    try {
      transfer = await client.transfers.get(debit.transferId)
    } catch (error) {
      logger.warn({ debitId: debit.id, err: errorText(error) }, 'Débito automático: transferência não consultada (próxima rodada)')
      return { outcome: 'em_andamento', message: 'Transferência não consultada no Asaas; nova conferência na próxima rodada', debit }
    }
    if (transferOutcome(transfer.status) === 'pending') {
      const charge = debit.chargeId ? await loadPlatformCharge(debit.chargeId).catch(() => null) : null
      const chargeOpen = charge ? isOpenPlatformCharge(charge.status) : false
      const requestedAt = debit.transferRequestedAt ?? debit.startedAt
      const expired = now.getTime() - requestedAt.getTime() > PENDING_TRANSFER_TIMEOUT_MS
      if (!chargeOpen || expired) {
        try {
          const cancelled = await client.transfers.cancel(transfer.id)
          if (transferOutcome(cancelled.status) === 'cancelled') {
            return fail(
              debit,
              chargeOpen ? 'transferencia_cancelada' : 'fatura_paga',
              chargeOpen
                ? 'Transferência pendente de autorização por mais de 24 h — cancelada'
                : 'A fatura foi paga por outro meio; a transferência pendente foi cancelada',
              { transferStatus: cancelled.status, notify: chargeOpen, config },
            )
          }
          return applyTransfer(debit, cancelled, now, config)
        } catch (error) {
          logger.warn({ debitId: debit.id, transferId: transfer.id, err: errorText(error) }, 'Débito automático: transferência pendente não cancelada (próxima rodada)')
          return { outcome: 'em_andamento', message: 'Transferência pendente; cancelamento não confirmado', debit }
        }
      }
    }
    return applyTransfer(debit, transfer, now, config)
  }

  if (debit.transferRequestedAt) {
    let found: AsaasTransfer | null
    try {
      found = await findTransferByReference(client, debit)
    } catch (error) {
      logger.warn({ debitId: debit.id, err: errorText(error) }, 'Débito automático: transferências não listadas (próxima rodada)')
      return { outcome: 'em_andamento', message: 'Conferindo a transferência no Asaas', debit }
    }
    if (found) {
      const updated = await updateRunning(debit.id, { transferId: found.id, transferStatus: found.status })
      if (!updated) return resultOf(await loadDebit(debit.id), 'Tentativa encerrada')
      return reconcileLocked(updated, { now, config })
    }
    if (now.getTime() - debit.transferRequestedAt.getTime() > LOST_RESPONSE_GRACE_MS) {
      return fail(debit, 'erro_asaas', 'A transferência não foi criada no Asaas (sem resposta e não localizada)', { config })
    }
    return { outcome: 'em_andamento', message: 'Conferindo a transferência no Asaas', debit }
  }

  if (now.getTime() - debit.startedAt.getTime() > STALE_CLAIM_MS) {
    return fail(debit, 'erro_asaas', 'Tentativa interrompida antes da transferência', { notify: false, onlyIfNotRequested: true, config })
  }
  return { outcome: 'em_andamento', message: 'Tentativa em andamento', debit }
}

// ---------------------------------------------------------------------------
// Automação e ações
// ---------------------------------------------------------------------------

export interface ManagedDebitRunReport {
  concluded: number
  failed: number
  pending: number
  errors: string[]
}

/**
 * Passo da automação da plataforma: confere as tentativas em andamento e
 * tenta as faturas vencidas dos clubes com conta gerenciada e débito ligado.
 */
export async function runManagedDebits(now = new Date(), opts: { shouldStop?: () => boolean } = {}): Promise<ManagedDebitRunReport> {
  const report: ManagedDebitRunReport = { concluded: 0, failed: 0, pending: 0, errors: [] }
  const config = debitConfig()
  const tally = (result: DebitRunResult) => {
    if (result.outcome === 'concluida') report.concluded += 1
    else if (result.outcome === 'falhou') report.failed += 1
    else if (result.outcome === 'em_andamento') report.pending += 1
  }
  const touched = new Set<string>()

  const running = await db
    .select()
    .from(managedAccountDebits)
    .where(eq(managedAccountDebits.status, 'em_andamento'))
    .orderBy(asc(managedAccountDebits.startedAt))
    .limit(100)
  for (const debit of running) {
    if (opts.shouldStop?.()) return report
    if (debit.chargeId) touched.add(debit.chargeId)
    try {
      tally(await reconcileDebit(debit, { now, config }))
    } catch (error) {
      if (report.errors.length < 20) report.errors.push(`conferir débito ${debit.id}: ${errorText(error)}`)
    }
  }

  const candidates = await db
    .select({ id: platformCharges.id })
    .from(platformCharges)
    .innerJoin(tenantAsaasAccounts, eq(tenantAsaasAccounts.organizationId, platformCharges.organizationId))
    .innerJoin(platformSubscriptions, eq(platformSubscriptions.id, platformCharges.subscriptionId))
    .where(
      and(
        eq(tenantAsaasAccounts.source, 'subaccount'),
        eq(tenantAsaasAccounts.autoDebitEnabled, true),
        inArray(platformCharges.status, ['pending', 'overdue', 'failed']),
        lte(platformCharges.dueDate, todaySP(now)),
        ne(platformCharges.kind, 'activation'),
        ne(platformSubscriptions.status, 'canceled'),
      ),
    )
    .orderBy(asc(platformCharges.dueDate))
    .limit(200)
  for (const { id } of candidates) {
    if (opts.shouldStop?.()) break
    if (touched.has(id)) continue
    try {
      const result = await attemptAutoDebit(id, { source: 'automation', now, config })
      if (result.outcome !== 'ignorada') tally(result)
    } catch (error) {
      if (report.errors.length < 20) report.errors.push(`débito da fatura ${id}: ${errorText(error)}`)
    }
  }
  return report
}

async function toResult(result: DebitRunResult): Promise<ManagedDebitResult> {
  if (!result.debit) return { outcome: result.outcome, message: result.message, debit: null }
  const [charge] = result.debit.chargeId
    ? await db
        .select({ description: platformCharges.description, dueDate: platformCharges.dueDate })
        .from(platformCharges)
        .where(eq(platformCharges.id, result.debit.chargeId))
        .limit(1)
    : []
  return { outcome: result.outcome, message: result.message, debit: debitDto(result.debit, charge ?? null) }
}

/**
 * "Debitar agora" (superadmin): força UMA tentativa na fatura informada (ou
 * na vencida mais antiga do clube), com a mesma idempotência da automação —
 * ignora só o limite de tentativas e o intervalo.
 */
export async function forceDebit(orgId: string, chargeId: string | undefined, actorUserId: string | null): Promise<ManagedDebitResult> {
  const account = await loadAccount(orgId)
  if (!account || account.source !== 'subaccount') throw AppError.businessRule('O recebimento deste clube não é gerenciado pela ANNETEC.')
  let target = chargeId
  if (target) {
    const charge = await loadPlatformCharge(target)
    if (charge.organizationId !== orgId) throw new AppError(ERROR_CODES.NOT_FOUND, 'Fatura não encontrada')
  } else {
    const [oldest] = await db
      .select({ id: platformCharges.id })
      .from(platformCharges)
      .where(
        and(
          eq(platformCharges.organizationId, orgId),
          inArray(platformCharges.status, ['pending', 'overdue', 'failed']),
          lte(platformCharges.dueDate, todaySP()),
          ne(platformCharges.kind, 'activation'),
        ),
      )
      .orderBy(asc(platformCharges.dueDate))
      .limit(1)
    if (!oldest) return { outcome: 'ignorada', message: 'Nenhuma fatura vencida em aberto para este clube', debit: null }
    target = oldest.id
  }
  return toResult(await attemptAutoDebit(target, { source: 'manual', actorUserId }))
}

/** Usado no webhook de validação: tentativas cujo POST ainda não teve a resposta gravada. */
export async function debitsAwaitingTransferId(since: Date): Promise<Pick<DebitRow, 'id' | 'amount'>[]> {
  return db
    .select({ id: managedAccountDebits.id, amount: managedAccountDebits.amount })
    .from(managedAccountDebits)
    .where(
      and(
        eq(managedAccountDebits.status, 'em_andamento'),
        isNull(managedAccountDebits.transferId),
        gte(managedAccountDebits.transferRequestedAt, since),
      ),
    )
}
