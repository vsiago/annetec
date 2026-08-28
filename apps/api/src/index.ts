import { serve } from '@hono/node-server'
import { createApp } from '@/app'
import { env } from '@/config/env'
import { logger } from '@/lib/logger'

const app = createApp()

serve({ fetch: app.fetch, port: env.PORT }, info => {
  logger.info({ port: info.port, env: env.NODE_ENV }, 'API Annetec no ar')
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'Encerrando API')
    process.exit(0)
  })
}
