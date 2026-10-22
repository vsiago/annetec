import { isPreviewDeploy, isProduction } from '@/config/env'
import { decryptSecret, encryptSecret } from '@/lib/crypto'

/**
 * Segredos dentro de e-mails (senha provisória). O corpo GRAVADO na caixa de
 * saída nunca guarda o segredo em claro:
 *  - provedor real (Resend/SendGrid): o segredo vira `••••••` (o destinatário
 *    recebeu o original; o banco não precisa dele);
 *  - `outbox` (demo, único canal): o segredo vai LACRADO (AES-GCM com a chave
 *    derivada do `BETTER_AUTH_SECRET`) num marcador, e só o detalhe do e-mail
 *    no console da plataforma (`GET /platform/emails/:id`), para SUPERADMIN e
 *    FORA de produção, o revela. Listas, prévias, demais papéis e produção
 *    mostram `••••••`.
 */

/**
 * Pode abrir os lacres? Só fora de produção (em produção `reveal` vira `mask`)
 * — e no deploy de demonstração (`DEPLOY_STAGE=preview`), onde a caixa de
 * saída é o único canal de e-mail. Continua restrito ao superadmin.
 */
export const secretRevealAllowed = !isProduction || isPreviewDeploy
export const SECRET_MASK = '••••••'

const MARKER = /\[\[segredo:(v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+)\]\]/g

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function replaceAll(body: string, secret: string, replacement: string): string {
  let out = body.split(secret).join(replacement)
  const escaped = escapeHtml(secret)
  if (escaped !== secret) out = out.split(escaped).join(replacement)
  return out
}

/** Troca cada segredo por `••••••` (corpo gravado com provedor real). */
export function maskSecrets(body: string, secrets: readonly string[]): string {
  return secrets.filter(s => s.length > 0).reduce((acc, secret) => replaceAll(acc, secret, SECRET_MASK), body)
}

/** Troca cada segredo por um marcador lacrado (corpo gravado no modo `outbox`). */
export function sealSecrets(body: string, secrets: readonly string[]): string {
  return secrets
    .filter(s => s.length > 0)
    .reduce((acc, secret) => replaceAll(acc, secret, `[[segredo:${encryptSecret(secret)}]]`), body)
}

/** `reveal` = abre os lacres (detalhe no console); `mask` = `••••••` (listas, prévias). */
export function unsealSecrets(body: string, mode: 'reveal' | 'mask'): string {
  return body.replace(MARKER, (_match, sealed: string) => {
    if (mode === 'mask' || !secretRevealAllowed) return SECRET_MASK
    try {
      return decryptSecret(sealed)
    } catch {
      return SECRET_MASK
    }
  })
}

/** O texto tem algum segredo lacrado? */
export function hasSealedSecrets(body: string | null | undefined): boolean {
  if (!body) return false
  MARKER.lastIndex = 0
  const found = MARKER.test(body)
  MARKER.lastIndex = 0
  return found
}
