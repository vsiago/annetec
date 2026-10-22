'use server'

import type { PayPlatformChargeInput, PlatformPublicInvoice } from '@annetec/contracts'
import { clientIpHeaders } from '@/lib/api/client-ip'
import { api } from '@/lib/api/client'
import type { ActionResult } from './_api-result'
import { run } from './_api-result'

/**
 * Fatura ANNETEC pública (`/fatura-annetec/<id>?chave=`) — rotas
 * `/api/v1/public/faturas-annetec/*`, sem sessão, com a chave HMAC da
 * cobrança. Serve a ativação e as mensalidades e funciona mesmo com o painel
 * do inquilino bloqueado (é o caminho para regularizar).
 *
 * Dados de cartão atravessam `payPlatformInvoiceAction` só de passagem
 * (browser → API → gateway): nada aqui loga o corpo da requisição.
 */

const invoicePath = (chargeId: string, suffix = '') =>
  `/api/v1/public/faturas-annetec/${encodeURIComponent(chargeId)}${suffix}`

/** A API sincroniza a cobrança com o gateway antes de responder (polling da tela). */
export async function getPlatformInvoiceAction(
  chargeId: string,
  chave: string,
): Promise<ActionResult<PlatformPublicInvoice>> {
  return run(async () =>
    api<PlatformPublicInvoice>(invoicePath(chargeId), { token: null, headers: await clientIpHeaders(), query: { chave } }),
  )
}

/** Gera o Pix/boleto na forma escolhida ou cobra o cartão. */
export async function payPlatformInvoiceAction(
  chargeId: string,
  chave: string,
  input: PayPlatformChargeInput,
): Promise<ActionResult<PlatformPublicInvoice>> {
  return run(async () =>
    api<PlatformPublicInvoice>(invoicePath(chargeId, '/pagar'), {
      method: 'POST',
      body: input,
      token: null,
      headers: await clientIpHeaders(),
      query: { chave },
    }),
  )
}

/** "Simular pagamento" — só no gateway simulado ou no sandbox do Asaas (`canSimulatePayment`). */
export async function simulatePlatformInvoiceAction(
  chargeId: string,
  chave: string,
): Promise<ActionResult<PlatformPublicInvoice>> {
  return run(async () =>
    api<PlatformPublicInvoice>(invoicePath(chargeId, '/simular'), { method: 'POST', token: null, headers: await clientIpHeaders(), query: { chave } }),
  )
}
