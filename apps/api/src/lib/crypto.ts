import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '@/config/env'

/**
 * Cifra simétrica para segredos em repouso (token/senha da Digital Saúde por
 * inquilino). A chave deriva do BETTER_AUTH_SECRET por SHA-256, então não há
 * uma segunda variável de ambiente para esquecer no deploy.
 *
 * Formato: `v1.<iv-base64>.<tag-base64>.<ciphertext-base64>`.
 */
const key = createHash('sha256').update(`annetec:secrets:${env.BETTER_AUTH_SECRET}`).digest()

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.')
}

export function decryptSecret(stored: string): string {
  const [version, ivB64, tagB64, dataB64] = stored.split('.')
  if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Segredo cifrado em formato desconhecido')
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
