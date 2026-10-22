import { serve } from '@hono/node-server'
import { createApp } from '@/app'
import { assertProductionConfig } from '@/config/assert-production'
import { env } from '@/config/env'
import { logger } from '@/lib/logger'
import { startBillingAutomation } from '@/modules/club-billing/automation.service'
import { startPlatformBillingAutomation } from '@/modules/platform-billing/automation.service'

// Produção sem gateway/e-mail/CNPJ/storage reais morre aqui, antes de abrir a porta.
assertProductionConfig(env, logger)

const app = createApp()

serve({ fetch: app.fetch, port: env.PORT }, info => {
  logger.info({ port: info.port, env: env.NODE_ENV }, 'API Annetec no ar')
})

// Motor de cobrança do clube (servidor persistente). Na Vercel (`vercel.ts`)
// não há timer: lá a automação roda por `POST /faturamento/automacao/executar`.
startBillingAutomation()

// Régua da cobrança ANNETEC → inquilinos (1ª rodada 15 s após o boot; sem rodadas
// sobrepostas; erro vira log e nunca derruba a API). Desligável por
// PLATFORM_BILLING_AUTOMATION_ENABLED=false; na Vercel roda por
// `POST /platform/billing/automacao/executar`.
startPlatformBillingAutomation()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info({ signal }, 'Encerrando API')
    process.exit(0)
  })
}
