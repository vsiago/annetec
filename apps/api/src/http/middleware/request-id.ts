import { randomUUID } from 'node:crypto'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '@/http/types'
import { logger } from '@/lib/logger'

/**
 * Correlaciona log, resposta de erro e header `x-request-id`. Se o cliente
 * mandar o header, ele é reaproveitado — assim um trace iniciado no Next.js
 * atravessa a API inteira.
 */
export const requestId = createMiddleware<AppEnv>(async (c, next) => {
  const incoming = c.req.header('x-request-id')
  const id = incoming && incoming.length <= 100 ? incoming : randomUUID()
  c.set('requestId', id)
  c.header('x-request-id', id)

  const startedAt = performance.now()
  await next()
  logger.info(
    {
      requestId: id,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
    },
    'request',
  )
})
