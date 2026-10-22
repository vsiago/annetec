import { createHmac, timingSafeEqual } from 'node:crypto'
import { env, webBaseUrl } from '@/config/env'

/**
 * Chave de acompanhamento da proposta (blueprint da plataforma §0.1-2): o
 * candidato não tem conta; quem tem o link `/contratar/<id>?chave=<HMAC>`
 * vê e edita a proposta. Chave errada = 404 (como se a proposta não
 * existisse). Mesmo desenho de `club-billing/access-key.ts`:
 * HMAC-SHA256(BETTER_AUTH_SECRET, `onboarding:<id>`) em base64url, 32 caracteres.
 */
export function onboardingAccessKey(proposalId: string): string {
  return createHmac('sha256', env.BETTER_AUTH_SECRET).update(`onboarding:${proposalId}`).digest('base64url').slice(0, 32)
}

/** Compara em tempo constante; tamanho errado já é falso. */
export function isValidOnboardingAccessKey(proposalId: string, key: string | null | undefined): boolean {
  if (!key || key.length !== 32) return false
  const expected = Buffer.from(onboardingAccessKey(proposalId))
  const received = Buffer.from(key)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

/** Caminho da web: `/contratar/<id>?chave=<chave>`. */
export function onboardingTrackingPath(proposalId: string): string {
  return `/contratar/${proposalId}?chave=${onboardingAccessKey(proposalId)}`
}

export function onboardingTrackingUrl(proposalId: string): string {
  return `${webBaseUrl}${onboardingTrackingPath(proposalId)}`
}
