import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '@/db/client'
import { ok } from '@/http/respond'
import type { AppEnv } from '@/http/types'

/**
 * Sondas de saúde. `/healthz` responde sem tocar em nada (liveness) e
 * `/readyz` confirma que o banco responde (readiness) — é o que o balanceador
 * usa para decidir se manda tráfego.
 */
export const healthController = new Hono<AppEnv>()
  .get('/healthz', c => ok(c, { status: 'ok', uptime: Math.round(process.uptime()) }))
  .get('/readyz', async c => {
    const startedAt = performance.now()
    await db.execute(sql`select 1`)
    return ok(c, {
      status: 'ok',
      database: { ok: true, latencyMs: Math.round(performance.now() - startedAt) },
    })
  })
