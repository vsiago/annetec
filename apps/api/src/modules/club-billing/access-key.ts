import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/config/env'

/**
 * Chave das rotas públicas de uma assinatura (status, nova tentativa,
 * simular, boleto) — blueprint §0.1-8. Quem fez o checkout recebe a chave na
 * resposta e a carrega na URL (`?chave=`); sem ela, a rota responde 404 como
 * se a assinatura não existisse.
 *
 * HMAC-SHA256(BETTER_AUTH_SECRET, `checkout:<id>`) em base64url, 32 caracteres.
 */
export function checkoutAccessKey(subscriptionId: string): string {
  return createHmac('sha256', env.BETTER_AUTH_SECRET)
    .update(`checkout:${subscriptionId}`)
    .digest('base64url')
    .slice(0, 32)
}

/** Compara em tempo constante; tamanho errado já é falso. */
export function isValidCheckoutAccessKey(subscriptionId: string, key: string | null | undefined): boolean {
  if (!key || key.length !== 32) return false
  const expected = Buffer.from(checkoutAccessKey(subscriptionId))
  const received = Buffer.from(key)
  return expected.length === received.length && timingSafeEqual(expected, received)
}
