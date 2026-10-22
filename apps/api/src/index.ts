import type { Server } from 'node:http'
import { serve } from '@hono/node-server'
import { createApp } from '@/app'
import { assertProductionConfig } from '@/config/assert-production'
import { env } from '@/config/env'
import { sql } from '@/db/client'
import { waitForBackgroundWork } from '@/lib/background'
import { closeHttpServer } from '@/lib/http-shutdown'
import { logger } from '@/lib/logger'
import { startBillingAutomation, stopBillingAutomation } from '@/modules/club-billing/automation.service'
import { abortNotificationStreams } from '@/modules/notifications/service'
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
 * `stop_grace_period` de 35 s antes do SIGKILL): para os timers da cobrança,
 * fecha na hora os streams SSE de notificação (o navegador reconecta noutro
 * processo), para de aceitar conexões, espera as requisições e rodadas de
 * automação em curso (um pagamento no meio não fica pela metade), o trabalho
 * solto (e-mails) e fecha o pool do Postgres. Passou de 25 s → sai à força.
 *
 * Orçamento (dentro dos 25 s): requisições até 18 s (depois as conexões
 * caem), automação até 20 s, trabalho solto até 22 s, pool até 2 s.
 */
const SHUTDOWN_DEADLINE_MS = 25_000
const HTTP_DRAIN_MS = 18_000
const AUTOMATION_BUDGET_MS = 20_000
const BACKGROUND_DEADLINE_MS = 22_000
let shuttingDown = false

/** `true` se a promise terminou dentro de `ms`. */
async function settledWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>(resolve => {
    timer = setTimeout(() => resolve(false), Math.max(0, ms))
  })
  const result = await Promise.race([promise.then(() => true as const), timeout])
  clearTimeout(timer)
  return result
}

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return
  shuttingDown = true
  const startedAt = Date.now()
  const elapsed = () => Date.now() - startedAt
  logger.info({ signal }, 'Encerrando API: sem novas conexões; aguardando requisições e automações em curso')

  const force = setTimeout(() => {
    logger.error({ signal, waitedMs: elapsed() }, 'Encerramento passou do prazo — saindo à força')
    process.exit(1)
  }, SHUTDOWN_DEADLINE_MS)
  force.unref()

  // SSE fecha já: cada stream aberto seguraria o `close` por até 25 s.
  abortNotificationStreams()
  const closing = closeHttpServer(server)
  const [httpDone, clubDone, platformDone] = await Promise.all([
    settledWithin(closing, HTTP_DRAIN_MS),
    stopBillingAutomation(AUTOMATION_BUDGET_MS),
    stopPlatformBillingAutomation(AUTOMATION_BUDGET_MS),
  ])
  if (!clubDone || !platformDone) logger.warn({ clubDone, platformDone }, 'Encerramento: rodada de automação não terminou no prazo')
  if (!httpDone) {
    logger.warn({ waitedMs: elapsed() }, 'Encerramento: requisições ainda abertas no prazo — derrubando as conexões')
    server.closeAllConnections?.()
    await settledWithin(closing, 1_000)
  }

  const backgroundDone = await waitForBackgroundWork(Math.max(500, BACKGROUND_DEADLINE_MS - elapsed()))
  if (!backgroundDone) logger.warn('Encerramento: trabalho em segundo plano não terminou no prazo')

  try {
    await sql.end({ timeout: 2 })
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, 'Encerramento: falha ao fechar o pool do Postgres')
  }
  clearTimeout(force)
  logger.info({ signal, durationMs: elapsed() }, 'API encerrada')
  process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal))
}
