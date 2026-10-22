import type { Server } from 'node:http'
import { logger } from '@/lib/logger'

/**
 * Para de aceitar conexões e resolve quando o servidor fechou de vez.
 *
 * `server.close()` só derruba as conexões keep-alive que estão ociosas NO
 * MOMENTO da chamada; uma requisição que termina depois (ex.: o stream SSE
 * fechado pelo desligamento) deixa a conexão ociosa aberta até o
 * `keepAliveTimeout` (5 s). Por isso as ociosas são derrubadas de novo a cada
 * `idleSweepMs` até o `close` terminar — requisições em curso não são tocadas.
 */
export function closeHttpServer(server: Server, idleSweepMs = 200): Promise<void> {
  return new Promise(resolve => {
    const sweep = setInterval(() => server.closeIdleConnections?.(), idleSweepMs)
    sweep.unref()
    server.close(error => {
      clearInterval(sweep)
      if (error) logger.warn({ err: error.message }, 'Encerramento: servidor HTTP já estava fechado')
      resolve()
    })
    server.closeIdleConnections?.()
  })
}
