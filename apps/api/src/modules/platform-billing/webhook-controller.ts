import { Hono } from 'hono'
import { isProduction } from '@/config/env'
import { AppError } from '@/http/errors'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'
import { asaasWebhookBody, checkAsaasWebhookToken } from '@/integrations/asaas/webhook'
import { logger } from '@/lib/logger'
import { limitBody } from '@/modules/club-billing/http'
import { parsePlatformReference } from './access-key'
import { handlePlatformGatewayEvent } from './events.service'
import { platformWebhookToken } from './gateway'

/**
 * Webhook da cobrança da PLATAFORMA — `POST /api/v1/webhooks/asaas-plataforma`.
 * Token (`asaas-access-token`) = `PLATFORM_ASAAS_WEBHOOK_TOKEN ?? ASAAS_WEBHOOK_TOKEN`.
 * Token confere → SEMPRE 200 `{ received: true }` (a fila do Asaas pausa com
 * 15 falhas seguidas; a sincronização da automação recupera o que faltar).
 * Sem token configurado: aceita só fora de produção (aviso 1×).
 */

let warnedMissingToken = false

export const platformWebhookController = new Hono<AppEnv>().post('/', limitBody(256), async c => {
  const check = checkAsaasWebhookToken(c.req.header('asaas-access-token'), platformWebhookToken())
  if (check === 'invalid') throw AppError.unauthenticated('Token do webhook inválido')
  if (check === 'unconfigured') {
    if (isProduction) throw AppError.unauthenticated('Webhook da plataforma sem token configurado')
    if (!warnedMissingToken) {
      warnedMissingToken = true
      logger.warn('Webhook do Asaas (plataforma) aceito SEM token — só fora de produção')
    }
  }

  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return ok(c, { received: true })
  }
  const parsed = asaasWebhookBody.safeParse(raw)
  if (!parsed.success || !parsed.data.payment) return ok(c, { received: true })

  const body = parsed.data
  const payment = body.payment!
  // Cobrança do clube (externalReference = uuid) também chega aqui se a URL for a mesma: ignora sem erro.
  if (!parsePlatformReference(payment.externalReference) && !payment.id) return ok(c, { received: true })
  try {
    const outcome = await handlePlatformGatewayEvent(
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
    logger.info({ event: body.event, outcome: outcome.status }, 'Webhook do Asaas (plataforma) processado')
  } catch (error) {
    logger.error(
      { event: body.event, err: error instanceof Error ? error.message : String(error) },
      'Falha ao processar webhook do Asaas (plataforma)',
    )
  }
  return ok(c, { received: true })
})
