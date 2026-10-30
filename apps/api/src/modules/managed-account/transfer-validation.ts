import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { env } from '@/config/env'
import { db } from '@/db/client'
import { managedAccountDebits, platformCharges, tenantAsaasAccounts } from '@/db/schema'
import { AppError } from '@/http/errors'
import type { AppEnv } from '@/http/types'
import { checkAsaasWebhookToken } from '@/integrations/asaas/webhook'
import { logger } from '@/lib/logger'
import { limitBody } from '@/modules/club-billing/http'
import { isOpenPlatformCharge } from '@/modules/platform-billing/presenter'
import { debitsAwaitingTransferId } from './debit.service'
import { sameMoney, transferValidationDecision, type ValidationDecision } from './rules'

/**
 * Webhook de VALIDAÇÃO de transferências/saques do Asaas ("Mecanismo para
 * validação de saque via webhooks") — `POST /api/v1/webhooks/asaas/validacao-transferencia`.
 *
 * O mecanismo é configurado no painel da conta da ANNETEC (Integrações →
 * Mecanismos de segurança: URL, e-mail e token) e vale AUTOMATICAMENTE para
 * todas as subcontas — por isso a rota é uma só (não por clube) e o token é
 * o `ASAAS_TRANSFER_VALIDATION_TOKEN`. Não há API para configurar.
 *
 * Só aprova uma transferência que é a de uma tentativa NOSSA de débito
 * automático em andamento (mesmo id, valor e carteira, fatura em aberto —
 * `rules.ts`). Todo o resto é RECUSADO, de propósito: qualquer outra operação
 * de saque pedida PELA API (TRANSFER, BILL, PIX_QR_CODE, MOBILE_PHONE_RECHARGE
 * e, se habilitados no painel, PIX_REFUND/PAYMENT_SPLIT) na conta-raiz da
 * ANNETEC ou em qualquer subconta. Efeito: a ANNETEC não consegue sacar/pagar
 * pela API fora deste fluxo (hoje não há nenhum outro); saques pelo painel/app
 * só passam por aqui se a opção "validar operações da interface web" for
 * marcada — ela deve ficar DESMARCADA (senão os saques legítimos da ANNETEC e
 * dos clubes pelo painel seriam recusados). Ver docs/pagamentos-asaas-configuracao.md.
 * Token ausente/errado → 401; erro nosso → 503: o Asaas repete e, após 3
 * falhas seguidas, CANCELA a operação (lado seguro).
 */

const NO_TOKEN = randomBytes(32).toString('hex')
/** Janela em que uma tentativa pode estar com o POST no ar (resposta ainda não gravada). */
const AWAITING_WINDOW_MS = 10 * 60 * 1000

const text = (max: number) => z.string().max(max)

/** Corpo aceito (tolerante: o Asaas manda muito mais campos). */
const validationBody = z.object({
  type: text(40).nullish(),
  transfer: z
    .object({
      id: text(120),
      value: z.number().nullish(),
      walletId: text(120).nullish(),
      type: text(40).nullish(),
    })
    .passthrough()
    .nullish(),
})

type DebitRow = typeof managedAccountDebits.$inferSelect

export async function validateTransferRequest(raw: unknown, now = new Date()): Promise<ValidationDecision> {
  const parsed = validationBody.safeParse(raw)
  if (!parsed.success) return { status: 'REFUSED', refuseReason: 'Requisição de validação inválida' }
  const { type } = parsed.data
  const transfer = parsed.data.transfer
    ? {
        id: parsed.data.transfer.id,
        value: parsed.data.transfer.value ?? null,
        walletId: parsed.data.transfer.walletId ?? null,
        type: parsed.data.transfer.type ?? null,
      }
    : null

  let debit: DebitRow | null = null
  let managedAccount = false
  let chargeOpen = false
  let awaiting = false
  if (type === 'TRANSFER' && transfer?.id) {
    const [row] = await db.select().from(managedAccountDebits).where(eq(managedAccountDebits.transferId, transfer.id)).limit(1)
    debit = row ?? null
    if (debit) {
      const [account] = await db
        .select({ source: tenantAsaasAccounts.source })
        .from(tenantAsaasAccounts)
        .where(eq(tenantAsaasAccounts.organizationId, debit.organizationId))
        .limit(1)
      managedAccount = account?.source === 'subaccount'
      // Fatura paga por Pix/boleto (ou encerrada) depois da conferência: recusa — o dinheiro fica no saldo do clube.
      if (debit.chargeId) {
        const [charge] = await db
          .select({ status: platformCharges.status })
          .from(platformCharges)
          .where(eq(platformCharges.id, debit.chargeId))
          .limit(1)
        chargeOpen = charge ? isOpenPlatformCharge(charge.status) : false
      }
    } else if (transfer.value !== null) {
      const recent = await debitsAwaitingTransferId(new Date(now.getTime() - AWAITING_WINDOW_MS))
      awaiting = recent.some(row => sameMoney(row.amount, transfer.value))
    }
  }

  const decision = transferValidationDecision(
    type,
    transfer,
    debit ? { status: debit.status, amount: debit.amount, destinationWalletId: debit.destinationWalletId, managedAccount, chargeOpen } : null,
    awaiting,
  )
  if (decision.status === 'APPROVED' && debit) {
    await db.update(managedAccountDebits).set({ validatedAt: now, updatedAt: now }).where(eq(managedAccountDebits.id, debit.id))
  }
  logger.info(
    {
      integration: 'asaas',
      validation: decision.status,
      operationType: type ?? null,
      transferId: transfer?.id ?? null,
      debitId: debit?.id ?? null,
      organizationId: debit?.organizationId ?? null,
      reason: decision.status === 'REFUSED' ? decision.refuseReason : undefined,
    },
    'Validação de transferência do Asaas',
  )
  return decision
}

export const transferValidationController = new Hono<AppEnv>().post('/', limitBody(64), async c => {
  const expected = env.ASAAS_TRANSFER_VALIDATION_TOKEN
  const check = checkAsaasWebhookToken(c.req.header('asaas-access-token'), expected ?? NO_TOKEN)
  if (!expected || check !== 'ok') {
    if (!expected) logger.warn('Validação de transferência do Asaas sem ASAAS_TRANSFER_VALIDATION_TOKEN configurado — recusada')
    throw AppError.unauthenticated('Token inválido')
  }
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return c.json({ status: 'REFUSED', refuseReason: 'Requisição de validação inválida' })
  }
  try {
    const decision = await validateTransferRequest(raw)
    if (decision.status === 'RETRY') return c.json({ error: 'Transferência ainda sendo registrada; tente novamente' }, 503)
    return c.json(decision)
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      'Falha ao validar transferência do Asaas (503 — o Asaas repete; 3 falhas cancelam)',
    )
    return c.json({ error: 'Indisponível; tente novamente' }, 503)
  }
})
