import { ERROR_CODES } from '@annetec/contracts'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { isProduction } from '@/config/env'
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
 * Fora de produção o limite é multiplicado por `DEV_LIMIT_MULTIPLIER`: as
 * server actions do Next chegam todas do mesmo IP (o do servidor da web), e o
 * ensaio da demo não pode esbarrar no limite de 5 propostas por hora.
 */
export interface RateLimitOptions {
  /** Nome do balde, ex.: `contratacao:cnpj`. */
  key: string
  /** Requisições permitidas por janela, por IP. */
  limit: number
  windowMs: number
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

/**
 * IP de quem chamou: 1º salto do `x-forwarded-for` (proxy da Vercel), depois
 * `x-real-ip`, depois o socket do `@hono/node-server`.
 */
export function requestIp(c: Context): string | null {
  const forwarded = c.req.header('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const real = c.req.header('x-real-ip')?.trim()
  if (real) return real
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming
  return incoming?.socket?.remoteAddress ?? null
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds} segundo(s)`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minuto(s)`
}

/** Middleware Hono: 429 `RATE_LIMITED` com `Retry-After` quando o IP passa do limite. */
export function rateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const effectiveLimit = isProduction ? limit : limit * DEV_LIMIT_MULTIPLIER
  return createMiddleware<AppEnv>(async (c, next) => {
    const now = Date.now()
    sweep(now)
    const ip = requestIp(c) ?? 'desconhecido'
    const result = hitRateLimit(store, `${key}:${ip}`, effectiveLimit, windowMs, now)
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
