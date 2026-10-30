import { createHash, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { ERROR_CODES } from '@annetec/contracts'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { env, isProduction, trustProxy } from '@/config/env'
import { AppError } from '@/http/errors'
import type { AppEnv } from '@/http/types'

/**
 * Limite de requisições por IP, em memória (janela fixa) — rotas públicas da
 * contratação e da fatura da plataforma (blueprint da plataforma §0.10).
 *
 * Em memória de propósito: sem Redis na demo. Em serverless cada instância
 * tem o seu balde, então o limite é "por instância" — suficiente para frear
 * robô e digitação repetida, não é antifraude.
 *
 * Fora de produção o limite é multiplicado por `DEV_LIMIT_MULTIPLIER`: sem o
 * `INTERNAL_PROXY_SECRET` as server actions do Next chegam todas do mesmo IP
 * (o do servidor da web), e o ensaio da demo não pode esbarrar no limite de 5
 * propostas por hora. Com o segredo, cada navegador tem o seu balde.
 */
export interface RateLimitOptions {
  /** Nome do balde, ex.: `contratacao:cnpj`. */
  key: string
  /** Requisições permitidas por janela, por IP. */
  limit: number
  windowMs: number
  /**
   * Chave do balde no lugar do IP (ex.: o inquilino — limite por clube, não
   * por máquina). `null` cai no IP.
   */
  keyOf?: (c: Context<AppEnv>) => string | null
}

export const DEV_LIMIT_MULTIPLIER = 20

interface Bucket {
  count: number
  resetAt: number
}

export type RateLimitStore = Map<string, Bucket>

const store: RateLimitStore = new Map()
let lastSweep = 0

/** Conta uma requisição. Função pura sobre o `store` (testável sem Hono). */
export function hitRateLimit(
  bucketStore: RateLimitStore,
  bucketKey: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  let bucket = bucketStore.get(bucketKey)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs }
    bucketStore.set(bucketKey, bucket)
  }
  bucket.count += 1
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), retryAfterSeconds }
}

/** Remove baldes vencidos (no máximo 1× por minuto). */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, bucket] of store) if (bucket.resetAt <= now) store.delete(key)
}

/** IP do navegador repassado pela web (server actions/route handlers do Next). */
export const INTERNAL_CLIENT_IP_HEADER = 'x-annetec-client-ip'
/** Segredo que prova que a chamada veio da web confiável (`INTERNAL_PROXY_SECRET`). */
export const INTERNAL_PROXY_SECRET_HEADER = 'x-annetec-proxy-secret'

/**
 * Compara o segredo em tempo constante: os dois lados viram SHA-256 (mesmo
 * tamanho), então nem o conteúdo nem o comprimento vazam pelo tempo de resposta.
 */
export function sameSecret(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/** Um IPv4/IPv6 válido (1º item se vier lista); qualquer outra coisa é descartada. */
function validIp(value: string | undefined | null): string | null {
  const first = value?.split(',')[0]?.trim().replace(/^\[(.*)\]$/, '$1')
  if (!first || first.length > 64) return null
  return isIP(first) ? first : null
}

/**
 * IP do navegador repassado pela WEB nas chamadas server-side — SÓ quando a
 * requisição traz `x-annetec-proxy-secret` igual a `INTERNAL_PROXY_SECRET`.
 *
 * Sem o segredo configurado, sem o cabeçalho ou com valor errado, devolve
 * `null` e o `x-annetec-client-ip` é ignorado: quem chama a API direto pela
 * internet (api.annetec.org.br, via Caddy) não consegue escolher o próprio IP.
 */
export function internalClientIp(c: Context, secret: string | null | undefined = env.INTERNAL_PROXY_SECRET): string | null {
  if (!secret) return null
  const presented = c.req.header(INTERNAL_PROXY_SECRET_HEADER)
  if (!presented || !sameSecret(presented, secret)) return null
  return validIp(c.req.header(INTERNAL_CLIENT_IP_HEADER))
}

/**
 * IP do cliente vindo de cabeçalho, em ordem de confiança:
 *
 *  1. `internalClientIp`: a web provou com o segredo interno quem é o navegador;
 *  2. 1º salto do `x-forwarded-for`, depois `x-real-ip` — SÓ com `TRUST_PROXY`
 *     (ver `config/env.ts`). O 1º salto é o cliente porque o proxy da borda
 *     (Caddy do docker-compose, Vercel) descarta o `x-forwarded-for` que vem da
 *     internet e grava o IP real — é o caso das chamadas diretas à API.
 *
 * Sem nenhum dos dois, `null` (o cabeçalho seria forjável).
 */
export function forwardedIp(
  c: Context,
  trusted: boolean = trustProxy,
  secret: string | null | undefined = env.INTERNAL_PROXY_SECRET,
): string | null {
  const internal = internalClientIp(c, secret)
  if (internal) return internal
  if (!trusted) return null
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return c.req.header('x-real-ip')?.trim() || null
}

/** IP de quem chamou: o repassado pela web/proxy confiável (`forwardedIp`) ou o do socket do `@hono/node-server`. */
export function requestIp(
  c: Context,
  trusted: boolean = trustProxy,
  secret: string | null | undefined = env.INTERNAL_PROXY_SECRET,
): string | null {
  const forwarded = forwardedIp(c, trusted, secret)
  if (forwarded) return forwarded
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming
  return incoming?.socket?.remoteAddress ?? null
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} segundo(s)`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minuto(s)`
}

/** Middleware Hono: 429 `RATE_LIMITED` com `Retry-After` quando o IP (ou `keyOf`) passa do limite. */
export function rateLimit({ key, limit, windowMs, keyOf }: RateLimitOptions) {
  const effectiveLimit = isProduction ? limit : limit * DEV_LIMIT_MULTIPLIER
  return createMiddleware<AppEnv>(async (c, next) => {
    const now = Date.now()
    sweep(now)
    const subject = keyOf?.(c) ?? requestIp(c) ?? 'desconhecido'
    const result = hitRateLimit(store, `${key}:${subject}`, effectiveLimit, windowMs, now)
    c.header('RateLimit-Limit', String(effectiveLimit))
    c.header('RateLimit-Remaining', String(result.remaining))
    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfterSeconds))
      throw new AppError(
        ERROR_CODES.RATE_LIMITED,
        `Muitas tentativas seguidas. Tente de novo em ${formatWait(result.retryAfterSeconds)}.`,
      )
    }
    await next()
  })
}
