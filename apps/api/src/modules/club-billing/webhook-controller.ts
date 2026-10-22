import { Hono } from 'hono'
import { env, isProduction } from '@/config/env'
import { AppError } from '@/http/errors'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { asaasWebhookBody, checkAsaasWebhookToken } from '@/integrations/asaas/webhook'
import { logger } from '@/lib/logger'
import { handleGatewayEvent } from './events.service'
import { limitBody } from './http'

/**
 * Webhooks de gateways — `/api/v1/webhooks`. Só a camada HTTP + token é
 * exclusiva daqui; o processamento é o handler único (`handleGatewayEvent`).
 *
 * Token confere → SEMPRE 200 `{ received: true }` (duplicado, desconhecido ou
 * sem cobrança nossa também): 15 falhas seguidas pausam a fila do Asaas, e a
 * sincronização da automação cobre o que não foi aplicado. Token errado → 401.
 * Sem `ASAAS_WEBHOOK_TOKEN`: aceita só fora de produção (com aviso).
 */

let warnedMissingToken = false

export const webhooksController = new Hono<AppEnv>().post('/asaas', limitBody(256), async c => {
  const check = checkAsaasWebhookToken(c.req.header('asaas-access-token'), env.ASAAS_WEBHOOK_TOKEN)
  if (check === 'invalid') throw AppError.unauthenticated('Token do webhook inválido')
  if (check === 'unconfigured') {
    if (isProduction) throw AppError.unauthenticated('Webhook do Asaas sem token configurado')
    if (!warnedMissingToken) {
      warnedMissingToken = true
      logger.warn('Webhook do Asaas aceito SEM token (ASAAS_WEBHOOK_TOKEN ausente) — só fora de produção')
    }
  }

  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return ok(c, { received: true })
  }
  const parsed = asaasWebhookBody.safeParse(raw)
  if (!parsed.success || !parsed.data.payment) {
    logger.info({ event: parsed.success ? parsed.data.event : undefined }, 'Webhook do Asaas sem cobrança — ignorado')
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
      { source: 'webhook', provider: 'asaas' },
    )
    logger.info({ event: body.event, outcome: outcome.status }, 'Webhook do Asaas processado')
  } catch (error) {
    // Nunca devolve erro ao Asaas (a fila pausaria); a sincronização periódica recupera.
    logger.error({ event: body.event, err: error instanceof Error ? error.message : String(error) }, 'Falha ao processar webhook do Asaas')
  }
  return ok(c, { received: true })
})
