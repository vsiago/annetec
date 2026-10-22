import { createHmac, timingSafeEqual } from 'node:crypto'
import { env, webBaseUrl } from '@/config/env'

/**
 * Chave da fatura pública da plataforma (blueprint da plataforma §0.1-4).
 *
 * A página `/fatura-annetec/<id>?chave=` serve a ativação E as mensalidades e
 * é o link dos e-mails — funciona mesmo com o painel do inquilino bloqueado.
 * Chave ausente/errada responde 404, como se a fatura não existisse.
 *
 * HMAC-SHA256(BETTER_AUTH_SECRET, `platform-charge:<id>`) em base64url, 32
 * caracteres (mesmo desenho de `club-billing/access-key.ts`).
 */
export function platformChargeAccessKey(id: string): string {
  return createHmac('sha256', env.BETTER_AUTH_SECRET)
    .update(`platform-charge:${id}`)
    .digest('base64url')
    .slice(0, 32)
}

/** Compara em tempo constante; tamanho errado já é falso. */
export function isValidPlatformChargeAccessKey(id: string, key: string | null | undefined): boolean {
  if (!key || key.length !== 32) return false
  const expected = Buffer.from(platformChargeAccessKey(id))
  const received = Buffer.from(key)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/** Link da página pública da fatura (web). `print` abre a versão imprimível (boleto). */
export function platformInvoiceUrl(id: string, opts: { print?: boolean } = {}): string {
  const base = `${webBaseUrl}/fatura-annetec/${encodeURIComponent(id)}?chave=${platformChargeAccessKey(id)}`
  return opts.print ? `${base}&imprimir=1` : base
}

const REFERENCE_PATTERN = /^plt_([0-9a-f]{32})$/i

/**
 * `externalReference` da cobrança da plataforma no gateway: `plt_` + uuid sem
 * hífens. O handler do clube ignora (não é uuid) — assim uma única URL de
 * webhook no Asaas não mistura as duas cobranças.
 */
export function platformReference(id: string): string {
  return `plt_${id.replace(/-/g, '').toLowerCase()}`
}

/** `plt_<32 hex>` → uuid com hífens; qualquer outra coisa → `null`. */
export function parsePlatformReference(ref: string | null | undefined): string | null {
  const match = ref ? REFERENCE_PATTERN.exec(ref.trim()) : null
  if (!match) return null
  const hex = match[1]!.toLowerCase()
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
