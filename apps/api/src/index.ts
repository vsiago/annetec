import type { Server } from 'node:http'
import { serve } from '@hono/node-server'
import { createApp } from '@/app'
import { assertProductionConfig } from '@/config/assert-production'
import { env } from '@/config/env'
import { sql } from '@/db/client'
import { waitForBackgroundWork } from '@/lib/background'
import { logger } from '@/lib/logger'
import { startBillingAutomation, stopBillingAutomation } from '@/modules/club-billing/automation.service'
import { startPlatformBillingAutomation, stopPlatformBillingAutomation } from '@/modules/platform-billing/automation.service'

// Produção sem gateway/e-mail/CNPJ/storage reais morre aqui, antes de abrir a porta.
assertProductionConfig(env, logger)

const app = createApp()

const server = serve({ fetch: app.fetch, port: env.PORT }, info => {
  logger.info({ port: info.port, env: env.NODE_ENV }, 'API Annetec no ar')
}) as Server

// Motor de cobrança do clube (servidor persistente). Na Vercel (`vercel.ts`)
// não há timer: lá a automação roda por `POST /faturamento/automacao/executar`.
startBillingAutomation()

// Régua da cobrança ANNETEC → inquilinos (1ª rodada 15 s após o boot; sem rodadas
// sobrepostas; erro vira log e nunca derruba a API). Desligável por
// PLATFORM_BILLING_AUTOMATION_ENABLED=false; na Vercel roda por
// `POST /platform/billing/automacao/executar`.
startPlatformBillingAutomation()

/**
 * Encerramento gracioso (SIGTERM do `docker compose stop/up`, que espera o
 * `stop_grace_period` de 30 s antes do SIGKILL): para os timers da cobrança,
 * para de aceitar conexões, espera as requisições e rodadas de automação em
 * curso (um pagamento no meio não fica pela metade), o trabalho solto
 * (e-mails) e fecha o pool do Postgres. Passou de 25 s → sai à força.
 */
const SHUTDOWN_DEADLINE_MS = 25_000
let shuttingDown = false

function closeServer(): Promise<void> {
  return new Promise(resolve => {
    server.close(error => {
      if (error) logger.warn({ err: error.message }, 'Encerramento: servidor HTTP já estava fechado')
      resolve()
    })
    // Conexões keep-alive ociosas seguram o `close` — derruba só as ociosas.
    server.closeIdleConnections?.()
  })
}

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return
  shuttingDown = true
  const startedAt = Date.now()
  logger.info({ signal }, 'Encerrando API: sem novas conexões; aguardando requisições e automações em curso')

  const force = setTimeout(() => {
    logger.error({ signal, waitedMs: Date.now() - startedAt }, 'Encerramento passou do prazo — saindo à força')
    process.exit(1)
  }, SHUTDOWN_DEADLINE_MS)
  force.unref()

  const budget = SHUTDOWN_DEADLINE_MS - 3_000
  const [, clubDone, platformDone] = await Promise.all([
    closeServer(),
    stopBillingAutomation(budget),
    stopPlatformBillingAutomation(budget),
  ])
  if (!clubDone || !platformDone) logger.warn({ clubDone, platformDone }, 'Encerramento: rodada de automação não terminou no prazo')
  const backgroundDone = await waitForBackgroundWork(Math.max(1_000, budget - (Date.now() - startedAt)))
  if (!backgroundDone) logger.warn('Encerramento: trabalho em segundo plano não terminou no prazo')

  try {
    await sql.end({ timeout: 5 })
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'Encerramento: falha ao fechar o pool do Postgres')
  }
  clearTimeout(force)
  logger.info({ signal, durationMs: Date.now() - startedAt }, 'API encerrada')
  process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal))
}
