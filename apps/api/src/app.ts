import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { ERROR_CODES } from '@annetec/contracts'
import { corsOrigins } from '@/config/env'
import { errorHandler } from '@/http/errors'
import { requestId } from '@/http/middleware/request-id'
import type { AppEnv } from '@/http/types'
import { routes } from '@/routes'

/**
 * Composição do app. Separado de `index.ts` para que os testes montem a mesma
 * aplicação sem abrir porta.
 */
export function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', requestId)
  app.use('*', secureHeaders())
  app.use(
    '/api/*',
    cors({
      origin: corsOrigins,
      allowHeaders: ['authorization', 'content-type', 'x-request-id'],
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['x-request-id'],
      credentials: true,
      maxAge: 86_400,
    }),
  )

  app.route('/', routes)

  app.notFound(c =>
    c.json(
      {
        success: false as const,
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: `Rota não encontrada: ${c.req.method} ${c.req.path}`,
          requestId: c.get('requestId'),
        },
      },
      404,
    ),
  )

  app.onError(errorHandler)
  return app
}

export type App = ReturnType<typeof createApp>
