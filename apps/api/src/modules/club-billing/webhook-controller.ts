import { randomBytes } from 'node:crypto'
import { ERROR_CODES } from '@annetec/contracts'
import { Hono, type Context } from 'hono'
import { AppError } from '@/http/errors'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { asaasWebhookBody, checkAsaasWebhookToken } from '@/integrations/asaas/webhook'
import { logger } from '@/lib/logger'
import { handleGatewayEvent } from './events.service'
import { limitBody } from './http'
import { loadClubWebhookToken } from './receiving-account.service'

/**
 * Webhooks de gateways do CLUBE — `/api/v1/webhooks`. Só a camada HTTP +
 * token é exclusiva daqui; o processamento é o handler único (`handleGatewayEvent`).
 *
 * `POST /asaas/clube/:organizationId`: cada clube recebe na própria conta
 * Asaas, e o webhook de cada conta aponta para esta rota com um token PRÓPRIO
 * (gerado ao conectar o recebimento, guardado cifrado em
 * `tenant_asaas_accounts`). O evento só mexe em cobrança DESTE clube.
 *
 * Token confere → SEMPRE 200 `{ received: true }` (duplicado, desconhecido,
 * sem cobrança nossa ou de outro clube também): 15 falhas seguidas pausam a
 * fila do Asaas, e a sincronização da automação cobre o que não foi aplicado.
 * Token errado/ausente, ou clube sem conta conectada → 401 (não diz qual).
 *
 * `POST /asaas` (rota global antiga, conta única da ANNETEC) → 410: o
 * club-billing não recebe mais pela conta da ANNETEC. O webhook da PLATAFORMA
 * é outro (`/webhooks/asaas-plataforma`) e não muda.
 */

const MAX_ORG_ID_LENGTH = 100

/**
 * Clube sem token (sem conta conectada ou id inexistente): o header é
 * comparado contra este valor aleatório do processo, que nunca confere —
 * assim resposta E tempo são os mesmos de "token errado", sem revelar quais
 * ids de clube têm recebimento configurado.
 */
const NO_ACCOUNT_TOKEN = randomBytes(32).toString('hex')

async function processClubWebhook(c: Context<AppEnv>, organizationId: string) {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return ok(c, { received: true })
  }
  const parsed = asaasWebhookBody.safeParse(raw)
  if (!parsed.success || !parsed.data.payment) {
    logger.info(
      { tenantId: organizationId, event: parsed.success ? parsed.data.event : undefined },
      'Webhook do Asaas sem cobrança — ignorado',
    )
    return ok(c, { received: true })
  }

  const body = parsed.data
  const payment = body.payment!
  try {
    const outcome = await handleGatewayEvent(
      {
        id: body.id,
        event: body.event,
        dateCreated: body.dateCreated ?? null,
        payment: {
          id: payment.id,
          externalReference: payment.externalReference ?? null,
          status: payment.status ?? null,
          value: payment.value ?? null,
          billingType: payment.billingType ?? null,
          paymentDate: payment.paymentDate ?? null,
          clientPaymentDate: payment.clientPaymentDate ?? null,
          confirmedDate: payment.confirmedDate ?? null,
          deleted: payment.deleted ?? null,
          creditCard: payment.creditCard ?? null,
        },
      },
      { source: 'webhook', provider: 'asaas', organizationId },
    )
    logger.info({ tenantId: organizationId, event: body.event, outcome: outcome.status }, 'Webhook do Asaas processado')
  } catch (error) {
    // Nunca devolve erro ao Asaas (a fila pausaria); a sincronização periódica recupera.
    logger.error(
      { tenantId: organizationId, event: body.event, err: error instanceof Error ? error.message : String(error) },
      'Falha ao processar webhook do Asaas',
    )
  }
  return ok(c, { received: true })
}

export const webhooksController = new Hono<AppEnv>()
  .post('/asaas/clube/:organizationId', limitBody(256), async c => {
    const organizationId = c.req.param('organizationId')
    if (!organizationId || organizationId.length > MAX_ORG_ID_LENGTH) {
      throw AppError.unauthenticated('Token do webhook inválido')
    }
    const expected = await loadClubWebhookToken(organizationId)
    const check = checkAsaasWebhookToken(c.req.header('asaas-access-token'), expected ?? NO_ACCOUNT_TOKEN)
    if (!expected || check !== 'ok') {
      if (!expected) logger.warn({ tenantId: organizationId }, 'Webhook do Asaas para clube sem conta de recebimento — recusado')
      throw AppError.unauthenticated('Token do webhook inválido')
    }
    return processClubWebhook(c, organizationId)
  })

  .post('/asaas', async c => {
    logger.warn(
      { userAgent: c.req.header('user-agent') ?? null },
      'Webhook do Asaas na rota global antiga /api/v1/webhooks/asaas — desativada (cada clube tem webhook próprio); remova este webhook da conta da ANNETEC',
    )
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      'Rota desativada: cada clube recebe na própria conta Asaas, com webhook em /api/v1/webhooks/asaas/clube/:organizationId.',
      { status: 410 },
    )
  })
